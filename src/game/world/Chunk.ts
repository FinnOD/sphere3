import * as THREE from 'three/webgpu';
import { getDisplacement } from './SphereNoise.js';
import Worker from './TerrainWorker?worker&module';
import { samplePointsOnTile } from '../systems/poissonSampling';
import { TREES_PER_CHUNK, CHUNK_DETAIL_LEVEL_HIGH, SPHERE_RADIUS } from '../constants';
import {
    deserializeBufferGeometry,
    serializeBufferGeometry,
    type SerializedBufferGeometry
} from './SerializeBufferGeometry';

export enum ChunkState {
    Near,
    Far
}

export class Chunk {
    public id: number;
    private scene: THREE.Scene;

    static pureTiles: Array<THREE.BufferGeometry>;
    static triGeoms: Array<THREE.BufferGeometry>;
    static midPoints: Array<THREE.Vector3>;
    static distanceMatrix: number[][];
    static isPentagon: boolean[];
    static maxDistance: number;
    private static geometryCache = new Map<string, THREE.BufferGeometry>();

    public state!: ChunkState;
    public isTransitioning: boolean = false;

    private worker: Worker | null = null;

    private treeMesh: THREE.InstancedMesh | null = null;
    private trunkMesh: THREE.InstancedMesh | null = null;
    private nearIndicesSet: Set<number>;

    constructor(id: number, scene: THREE.Scene, nearIndicesSet: Set<number>) {
        this.id = id;
        this.scene = scene;
        this.nearIndicesSet = nearIndicesSet;

        void this.setStateAsync(ChunkState.Far);

        const markerGeometry = new THREE.SphereGeometry(3, 20, 20);
        const markerMaterial = new THREE.MeshPhongMaterial({
            color: 'white',
            wireframe: false
        });
        const mpDisp = this.mpDisp(Chunk.midPoints[this.id]!);
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.copy(mpDisp);
        marker.name = `low-${this.id}`;
        marker.castShadow = true;
        marker.receiveShadow = true;
        // this.scene.add(marker);

        // Base geometry is unit-sized; per-instance scale carries the actual dimensions
        const pureTile = Chunk.pureTiles[this.id]!;
        const positions = samplePointsOnTile(pureTile, TREES_PER_CHUNK);

        // Unit cone (r=1, h=1) — scaled per instance
        const treeGeom = new THREE.ConeGeometry(1, 1, 12);
        const treeMat = new THREE.MeshStandardMaterial({ color: 0x2d6a1f });
        this.treeMesh = new THREE.InstancedMesh(treeGeom, treeMat, positions.length);
        this.treeMesh.name = `trees-${this.id}`;
        this.treeMesh.castShadow = true;
        this.treeMesh.receiveShadow = true;

        // Unit cylinder (r=1, h=1) — scaled per instance
        const trunkGeom = new THREE.CylinderGeometry(1, 1, 1, 12);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b3a1f });
        this.trunkMesh = new THREE.InstancedMesh(trunkGeom, trunkMat, positions.length);
        this.trunkMesh.name = `trunks-${this.id}`;
        this.trunkMesh.castShadow = true;
        this.trunkMesh.receiveShadow = true;

        const rand = (min: number, max: number) => min + Math.random() * (max - min);

        const dummy = new THREE.Object3D();
        const up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i]!;
            const normal = pos.clone().normalize();
            const noise = getDisplacement(pos.x, pos.y, pos.z);
            const groundPos = pos.clone().addScaledVector(normal, -noise);
            const quat = new THREE.Quaternion().setFromUnitVectors(up, normal.clone().negate());

            // Randomise dimensions for this tree
            const treeHeight = rand(5, 14);
            const treeRadius = rand(1.2, 3.5);
            const trunkHeight = rand(0.8, 2.0);
            const trunkRadius = rand(0.2, 0.55);
            // Extra length buried below ground so trunks don't float on slopes
            const trunkBury = 6;
            const totalTrunkHeight = trunkHeight + trunkBury;

            // Foliage cone — centre sits trunkHeight + half-cone inward from ground
            dummy.position.copy(groundPos).addScaledVector(normal, -(trunkHeight + treeHeight / 2));
            dummy.quaternion.copy(quat);
            dummy.scale.set(treeRadius, treeHeight, treeRadius);
            dummy.updateMatrix();
            this.treeMesh.setMatrixAt(i, dummy.matrix);

            // Trunk cylinder — extends trunkHeight above ground and trunkBury below
            dummy.position
                .copy(groundPos)
                .addScaledVector(normal, -(trunkHeight / 2 - trunkBury / 2));
            dummy.quaternion.copy(quat);
            dummy.scale.set(trunkRadius, totalTrunkHeight, trunkRadius);
            dummy.updateMatrix();
            this.trunkMesh.setMatrixAt(i, dummy.matrix);
        }
        this.treeMesh.instanceMatrix.needsUpdate = true;
        this.trunkMesh.instanceMatrix.needsUpdate = true;
    }

    public async setStateAsync(newState: ChunkState) {
        // if (this.isTransitioning || this.state === newState) {
        //     console.log(
        //         'Chunk',
        //         this.id,
        //         'already in state',
        //         ChunkState[newState],
        //         'or transitioning. Cancelled request to go ' + ChunkState[newState]
        //     );
        //     return;
        // }

        // console.log('Chunk', this.id, 'transitioning to', ChunkState[newState]);
        this.isTransitioning = true;
        this.state = newState;

        try {
            if (newState === ChunkState.Near) {
                await this.transitionToNear();
                this.nearIndicesSet.add(this.id);
            } else {
                this.nearIndicesSet.delete(this.id);
                await this.transitionToFar();
            }
            this.state = newState;
        } finally {
            this.isTransitioning = false;
        }
    }

    private async transitionToNear() {
        // These can happen in parallel
        const highDetailGeometry = await this.getHighDetailGeometry();
        const highDetailMesh = new THREE.Mesh(
            highDetailGeometry,
            new THREE.MeshStandardMaterial({
                color: new THREE.Color(0xaaa),
                side: THREE.BackSide
                // wireframe: true
            })
        );
        highDetailMesh.name = `near-${this.id}`;
        highDetailMesh.castShadow = true;
        highDetailMesh.receiveShadow = true;
        await this.nextFrame();
        this.scene.add(highDetailMesh);
        this.unloadLowDetailGeometry();

        // if (this.treeMesh) this.scene.add(this.treeMesh);
        // if (this.trunkMesh) this.scene.add(this.trunkMesh);
    }

    private async getHighDetailGeometry(): Promise<THREE.BufferGeometry> {
        // Load or generate high detail geometry for this chunk
        const detailedGeometry = await this.runWorker(
            Chunk.pureTiles[this.id]!,
            CHUNK_DETAIL_LEVEL_HIGH
        );
        return detailedGeometry;
    }

    private runWorker(tile: THREE.BufferGeometry, detail: number): Promise<THREE.BufferGeometry> {
        return new Promise((resolve, reject) => {
            // Check cache first
            const cachedGeometry = Chunk.geometryCache.get(`${this.id}-${detail}`);
            if (cachedGeometry) {
                // console.log(`Using cached geometry for chunk ${this.chunkIndex} detail ${detail}`);
                resolve(cachedGeometry);
                return;
            }

            // console.log(`Starting worker for chunk ${this.chunkIndex} with detail ${detail}`);
            this.worker = new Worker();

            this.worker.onmessage = (e) => {
                // console.log(`Worker completed for chunk ${this.chunkIndex}`);
                try {
                    const detailedSerializedGeometry = e.data as SerializedBufferGeometry;
                    const detailedGeometry = deserializeBufferGeometry(detailedSerializedGeometry);

                    // Cache the result
                    Chunk.geometryCache.set(`${this.id}-${detail}`, detailedGeometry);

                    resolve(detailedGeometry);
                } catch (error) {
                    console.error(`Error deserializing geometry for chunk ${this.id}:`, error);
                    reject(error instanceof Error ? error : new Error(String(error)));
                } finally {
                    this.worker?.terminate();
                }
            };

            this.worker.onerror = (err) => {
                console.error(`Worker error for chunk ${this.id}:`, err);
                reject(new Error(err.message));
                this.worker?.terminate();
            };

            try {
                const serializedGeometry = serializeBufferGeometry(tile);
                this.worker.postMessage([serializedGeometry, detail]);
            } catch (error) {
                console.error(`Error serializing geometry for chunk ${this.id}:`, error);
                reject(error instanceof Error ? error : new Error(String(error)));
                this.worker.terminate();
            }
        });
    }

    private unloadLowDetailGeometry(): void {
        // TODO Remove low detail by updating
        // Remove low detail geometry from scene if it exists
        const lowDetailMesh = this.scene.getObjectByName(`far-${this.id}`);
        if (lowDetailMesh) this.scene.remove(lowDetailMesh);
    }

    private async transitionToFar() {
        this.loadLowDetailGeometry();
        await this.nextFrame();
        this.unloadHighDetailGeometry();
    }

    private unloadHighDetailGeometry(): void {
        const highDetailMesh = this.scene.getObjectByName(`near-${this.id}`);
        if (highDetailMesh) this.scene.remove(highDetailMesh);

        if (this.treeMesh) this.scene.remove(this.treeMesh);
        if (this.trunkMesh) this.scene.remove(this.trunkMesh);
    }

    private loadLowDetailGeometry(): void {
        // const geom = Chunk.triGeoms[this.id];
        // const material = new THREE.MeshStandardMaterial({
        //     color: new THREE.Color(0x228822),
        //     side: THREE.BackSide,
        //     wireframe: true
        // });
        // const mesh = new THREE.Mesh(geom, material);
        // mesh.name = `far-${this.id}`;
        // mesh.castShadow = true;
        // mesh.receiveShadow = true;
        // this.scene.add(mesh);
        // const markerGeometry = new THREE.TorusKnotGeometry(100, 10);
        // const markerMaterial = new THREE.MeshPhongMaterial({
        //     color: 'red',
        //     wireframe: false
        // });
        // const mpDisp = this.mpDisp(Chunk.midPoints[this.id]!);
        // const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        // marker.position.copy(mpDisp);
        // marker.name = `far-${this.id}`;
        // marker.castShadow = true;
        // marker.receiveShadow = true;
        // this.scene.add(marker);
    }

    private nextFrame(): Promise<void> {
        return new Promise((resolve) =>
            requestAnimationFrame(() => {
                resolve();
            })
        );
    }

    private mpDisp(mp: THREE.Vector3): THREE.Vector3 {
        const normal = mp.clone().normalize();
        const onSphere = normal.clone().multiplyScalar(SPHERE_RADIUS);

        const noise = getDisplacement(onSphere.x, onSphere.y, onSphere.z);
        const ballOffset = normal.clone().multiplyScalar(-3);

        onSphere.add(normal.multiplyScalar(-noise)).add(ballOffset);

        return onSphere;
    }
}
