import { noisifyBuffer } from './GenerateWorldGeometry';
import * as THREE from 'three';
import { LoopSubdivision } from 'three-subdivide';
import Worker from './TerrainWorker?worker&module';
import { deserializeBufferGeometry, serializeBufferGeometry } from './SerializeBufferGeometry';
import { GroundMaterial } from './GroundMaterial';

const DEFAULT_DETAIL = 4;
const SUBDIVIDE_PARAMS = {
    split: false, // optional, default: true
    uvSmooth: false, // optional, default: false
    preserveEdges: false, // optional, default: false
    flatOnly: true, // optional, default: false
    maxTriangles: Infinity // optional, default: Infinity
} as const;

export class Chunk {
    private scene: THREE.Scene;
    private tile: THREE.BufferGeometry;
    private chunkIndex: number;
    private detail: number;

    private worker: Worker | null = null;
    private subdividedGeomLow: THREE.BufferGeometry;
    private lowDetailMesh: THREE.Mesh;
    private geometryPromise: Promise<THREE.BufferGeometry>;

    constructor(
        scene: THREE.Scene,
        tile: THREE.BufferGeometry,
        chunkIndex: number,
        detail: number
    ) {
        this.scene = scene;
        this.tile = tile;
        this.chunkIndex = chunkIndex;
        this.detail = detail;

        // Create low detail geometry and mesh
        this.subdividedGeomLow = this.makeBufferGeometry(tile, DEFAULT_DETAIL);
        // const materialClone = DEFAULT_CHUNK_MATERIAL.clone();
        // materialClone.color.setHSL(detail / 10, 0.9, 0.7);
        this.lowDetailMesh = new THREE.Mesh(this.subdividedGeomLow, GroundMaterial);
        this.lowDetailMesh.castShadow = true;
        this.lowDetailMesh.receiveShadow = true;
        this.lowDetailMesh.name = `low-${chunkIndex}`;

        // Start worker for high detail geometry
        // console.log('Starting worker for chunk', chunkIndex, 'with detail', detail);
        this.geometryPromise = this.runWorker(tile, detail);
    }

    public getLowDetailMesh(): THREE.Mesh {
        return this.lowDetailMesh;
    }

    public getGeometryPromise(): Promise<THREE.BufferGeometry> {
        return this.geometryPromise;
    }

    private makeBufferGeometry(originalGeometry: THREE.BufferGeometry, subdivideDetail: number) {
        let subdivided = LoopSubdivision.modify(
            originalGeometry,
            subdivideDetail,
            SUBDIVIDE_PARAMS
        );
        subdivided = noisifyBuffer(subdivided);
        subdivided.computeVertexNormals();

        return subdivided;
    }

    private runWorker(tile: THREE.BufferGeometry, detail: number): Promise<THREE.BufferGeometry> {
        return new Promise((resolve, reject) => {
            // Check cache first
            const cachedGeometry = (window as any).geometryCache?.get(this.chunkIndex, detail);
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
                    (window as any).geometryCache?.set(this.chunkIndex, detail, detailedGeometry);

                    resolve(detailedGeometry);
                } catch (error) {
                    console.error(
                        `Error deserializing geometry for chunk ${this.chunkIndex}:`,
                        error
                    );
                    reject(error);
                } finally {
                    this.worker!.terminate();
                }
            };

            this.worker!.onerror = (err) => {
                console.error(`Worker error for chunk ${this.chunkIndex}:`, err);
                reject(err);
                this.worker!.terminate();
            };

            try {
                const serializedGeometry = serializeBufferGeometry(tile);
                this.worker.postMessage([serializedGeometry, detail]);
            } catch (error) {
                console.error(`Error serializing geometry for chunk ${this.chunkIndex}:`, error);
                reject(error);
                this.worker!.terminate();
            }
        });
    }

    public destroy() {
        this.worker?.terminate();
    }
}
