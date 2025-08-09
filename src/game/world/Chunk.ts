import { noisifyBuffer } from './GenerateWorldGeometry';
import * as THREE from 'three';
import { LoopSubdivision } from 'three-subdivide';
import Worker from './TerrainWorker?worker&module';
import { deserializeBufferGeometry, serializeBufferGeometry } from './SerializeBufferGeometry';

// import { chunkGeometryCache } from '$lib/state';

const DEFAULT_COLOR = new THREE.Color(0x66aa44);
const DEFAULT_DETAIL = 4;
const DEFAULT_CHUNK_MATERIAL = new THREE.MeshPhongMaterial({
    color: DEFAULT_COLOR,
    side: THREE.DoubleSide,
    wireframe: false
});
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
        this.lowDetailMesh = new THREE.Mesh(this.subdividedGeomLow, DEFAULT_CHUNK_MATERIAL);
        this.lowDetailMesh.name = `low-${chunkIndex}`;

        // Start worker for high detail geometry
        console.log('Starting worker for chunk', chunkIndex, 'with detail', detail);
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
            // Check if the geometry is already cached TODO from cache
            const cachedGeometry = undefined; //$chunkGeometryCache[[chunkIndex, detail].toString()];
            if (cachedGeometry !== undefined) {
                resolve(cachedGeometry);
            }

            this.worker = new Worker();
            this.worker!.onmessage = (e) => {
                // console.log('Message received from worker');
                const detailedSerializedGeometry = e.data;
                const detailedGeometry = deserializeBufferGeometry(detailedSerializedGeometry);

                // const cachedGeometry = undefined; //$chunkGeometryCache[[this.chunkIndex, detail].toString()]; //TODO from cache
                // if (cachedGeometry === undefined) {
                //     $chunkGeometryCache[[chunkIndex, detail].toString()] = detailedGeometry;
                //     // console.log('saved', chunkIndex, detail);
                //     // console.log($chunkGeometryCache);
                // }
                resolve(detailedGeometry); // Resolve the promise with the data sent by the worker
                this.worker!.terminate(); // Terminate the worker after the message is received
            };

            this.worker!.onerror = (err) => {
                reject(err); // Reject the promise in case of an error
                this.worker!.terminate();
                throw err;
            };

            const serializedGeometry = serializeBufferGeometry(tile);

            this.worker.postMessage([serializedGeometry, detail]);
        });
    }

    public destroy() {
        this.worker?.terminate();
    }
}

// {#await subdividedGeomPromise}
// 	<T.Mesh geometry={subdividedGeomLow}>
// 		<GroundMaterial />
// 	</T.Mesh>
// {:then finalGeom}
// 	<T.Mesh geometry={finalGeom}>
// 		<!-- <T.MeshPhongMaterial color={color} side={DoubleSide} wireframe={false}/> -->
// 		<GroundMaterial />
// 	</T.Mesh>
// {/await}
