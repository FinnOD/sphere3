import * as THREE from 'three/webgpu';
import { getDisplacement } from './SphereNoise.js';
import Worker from './TerrainWorker?worker&module';
import { deserializeBufferGeometry, serializeBufferGeometry } from './SerializeBufferGeometry';

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

    public state!: ChunkState;
    public isTransitioning: boolean = false;

    private worker: Worker | null = null;

    private trees: THREE.Mesh[] = [];

    constructor(id: number, scene: THREE.Scene) {
        this.id = id;
        this.scene = scene;

        this.setStateAsync(ChunkState.Far);

        const markerGeometry = new THREE.SphereGeometry(3, 20, 20);
        const markerMaterial = new THREE.MeshPhongMaterial({
            color: 'white',
            wireframe: false
        });
        const mpDisp = this.mpDisp(Chunk.midPoints[this.id]);
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.copy(mpDisp);
        marker.name = `low-${this.id}`;
        marker.castShadow = true;
        marker.receiveShadow = true;
        this.scene.add(marker);

        this.trees = [];
        for (let i = 0; i <= Chunk.pureTiles[this.id].attributes.position.count; i += 3) {
            const tree = new THREE.Mesh(
                new THREE.ConeGeometry(10, 50, 8),
                new THREE.MeshStandardMaterial({ color: 'green' })
            );
            const x = Chunk.pureTiles[this.id].attributes.position.getX(i);
            const y = Chunk.pureTiles[this.id].attributes.position.getY(i);
            const z = Chunk.pureTiles[this.id].attributes.position.getZ(i);
            const xyz = new THREE.Vector3(x, y, z);
            xyz.setLength(3000);
            const noise = getDisplacement(xyz.x, xyz.y, xyz.z);
            let normal = xyz.clone().normalize().multiplyScalar(-noise);
            xyz.add(normal);

            tree.position.copy(xyz);
            // tree.position.add(chunk.getPosition());
            // tree.position.y += 25; // Half height of cone
            tree.lookAt(new THREE.Vector3(0, 0, 0));
            tree.rotateX(Math.PI / 2);
            this.trees.push(tree);
        }
    }

    public async setStateAsync(newState: ChunkState) {
        if (this.isTransitioning || this.state === newState) return;
        if (newState === ChunkState.Near)
            console.log('Chunk', this.id, 'transitioning to', ChunkState[newState]);
        this.isTransitioning = true;
        this.state = newState;

        try {
            if (newState === ChunkState.Near) {
                await this.transitionToNear();
            } else if (newState === ChunkState.Far) {
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
                color: new THREE.Color(0x228822),
                side: THREE.BackSide
            })
        );
        highDetailMesh.name = `near-${this.id}`;
        highDetailMesh.castShadow = true;
        highDetailMesh.receiveShadow = true;
        await this.nextFrame();
        this.scene.add(highDetailMesh);
        await this.unloadLowDetailGeometry();

        // Add trees
        for (const tree of this.trees) {
            this.scene.add(tree);
            await this.nextFrame();
        }
    }

    private async getHighDetailGeometry(): Promise<THREE.BufferGeometry> {
        // Load or generate high detail geometry for this chunk
        const detailedGeometry = await this.runWorker(Chunk.pureTiles[this.id], 8);
        return detailedGeometry;
    }

    private runWorker(tile: THREE.BufferGeometry, detail: number): Promise<THREE.BufferGeometry> {
        return new Promise((resolve, reject) => {
            // Check cache first
            const cachedGeometry = (window as any).geometryCache?.get(this.id, detail);
            if (cachedGeometry) {
                // console.log(`Using cached geometry for chunk ${this.chunkIndex} detail ${detail}`);
                resolve(cachedGeometry);
                return;
            }

            // console.log(`Starting worker for chunk ${this.chunkIndex} with detail ${detail}`);
            this.worker = new Worker();

            this.worker!.onmessage = (e) => {
                // console.log(`Worker completed for chunk ${this.chunkIndex}`);
                try {
                    const detailedSerializedGeometry = e.data;
                    const detailedGeometry = deserializeBufferGeometry(detailedSerializedGeometry);

                    // Cache the result
                    (window as any).geometryCache?.set(this.id, detail, detailedGeometry);

                    resolve(detailedGeometry);
                } catch (error) {
                    console.error(`Error deserializing geometry for chunk ${this.id}:`, error);
                    reject(error);
                } finally {
                    this.worker!.terminate();
                }
            };

            this.worker!.onerror = (err) => {
                console.error(`Worker error for chunk ${this.id}:`, err);
                reject(err);
                this.worker!.terminate();
            };

            try {
                const serializedGeometry = serializeBufferGeometry(tile);
                this.worker.postMessage([serializedGeometry, detail]);
            } catch (error) {
                console.error(`Error serializing geometry for chunk ${this.id}:`, error);
                reject(error);
                this.worker!.terminate();
            }
        });
    }

    private async unloadLowDetailGeometry(): Promise<void> {
        // Remove low detail geometry from scene if it exists
        const lowDetailMesh = this.scene.getObjectByName(`far-${this.id}`);
        if (lowDetailMesh) this.scene.remove(lowDetailMesh);
    }

    private async transitionToFar() {
        await this.unloadHighDetailGeometry();
        await this.nextFrame();
        await this.loadLowDetailGeometry();
    }

    private async unloadHighDetailGeometry(): Promise<void> {
        const highDetailMesh = this.scene.getObjectByName(`near-${this.id}`);
        if (highDetailMesh) this.scene.remove(highDetailMesh);

        for (const tree of this.trees) {
            this.scene.remove(tree);
        }
    }

    private async loadLowDetailGeometry(): Promise<void> {
        const geom = Chunk.triGeoms[this.id];
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0x228822),
            side: THREE.BackSide
        });
        const mesh = new THREE.Mesh(geom, material);
        mesh.name = `far-${this.id}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
    }

    private nextFrame(): Promise<void> {
        return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }

    private mpDisp(mp: THREE.Vector3): THREE.Vector3 {
        let normal = mp.clone().normalize();
        let onSphere = normal.clone().multiplyScalar(3000);

        let noise = getDisplacement(onSphere.x, onSphere.y, onSphere.z);
        let ballOffset = normal.clone().multiplyScalar(-3);

        onSphere.add(normal.multiplyScalar(-noise)).add(ballOffset);

        return onSphere;
    }
}
