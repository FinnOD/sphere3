import * as THREE from 'three/webgpu';
import { getDisplacement } from './SphereNoise.js';
import Worker from './TerrainWorker?worker&module';
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

    private trees: THREE.Mesh[] = [];
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

        this.trees = [];
        const pureTile = Chunk.pureTiles[this.id]!;
        const posAttr = pureTile.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < posAttr.count; i++) {
            const tree = new THREE.Mesh(
                new THREE.ConeGeometry(2.5, 6, 8),
                new THREE.MeshStandardMaterial({ color: 'green' })
            );
            const x = posAttr.getX(i);
            const y = posAttr.getY(i);
            const z = posAttr.getZ(i);
            const xyz = new THREE.Vector3(x, y, z);
            xyz.setLength(3000);
            const noise = getDisplacement(xyz.x, xyz.y, xyz.z);
            const normal = xyz.clone().normalize().multiplyScalar(-noise);
            xyz.add(normal);
            xyz.add(xyz.clone().normalize().multiplyScalar(-3.5)); // Half height of cone + small offset

            tree.position.copy(xyz);
            // tree.position.add(chunk.getPosition());
            // tree.position.y += 25; // Half height of cone
            tree.lookAt(new THREE.Vector3(0, 0, 0));
            tree.rotateX(Math.PI / 2);
            this.trees.push(tree);
        }
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

        console.log('Chunk', this.id, 'transitioning to', ChunkState[newState]);
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
                side: THREE.BackSide,
                wireframe: false
            })
        );
        highDetailMesh.name = `near-${this.id}`;
        highDetailMesh.castShadow = true;
        highDetailMesh.receiveShadow = true;
        await this.nextFrame();
        this.scene.add(highDetailMesh);
        this.unloadLowDetailGeometry();

        // Add trees
        for (const tree of this.trees) {
            this.scene.add(tree);
            await this.nextFrame();
        }
    }

    private async getHighDetailGeometry(): Promise<THREE.BufferGeometry> {
        // Load or generate high detail geometry for this chunk
        const detailedGeometry = await this.runWorker(Chunk.pureTiles[this.id]!, 6);
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

        for (const tree of this.trees) {
            this.scene.remove(tree);
        }
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
        const markerGeometry = new THREE.TorusKnotGeometry(100, 10);
        const markerMaterial = new THREE.MeshPhongMaterial({
            color: 'red',
            wireframe: false
        });
        const mpDisp = this.mpDisp(Chunk.midPoints[this.id]!);
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.copy(mpDisp);
        marker.name = `far-${this.id}`;
        marker.castShadow = true;
        marker.receiveShadow = true;
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
        const onSphere = normal.clone().multiplyScalar(3000);

        const noise = getDisplacement(onSphere.x, onSphere.y, onSphere.z);
        const ballOffset = normal.clone().multiplyScalar(-3);

        onSphere.add(normal.multiplyScalar(-noise)).add(ballOffset);

        return onSphere;
    }
}
