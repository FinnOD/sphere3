import * as THREE from 'three';
import { Chunk } from './Chunk';

const DEFAULT_COLOR = new THREE.Color(0x66aa44);
const DEFAULT_MATERIAL = new THREE.MeshPhongMaterial({
    color: DEFAULT_COLOR,
    side: THREE.DoubleSide,
    wireframe: false
});

enum ChunkState {
    Unloaded,
    Loading,
    Ready,
    Visible
}

interface ChunkRecord {
    state: ChunkState;
    mesh?: THREE.Mesh;
    lowDetailMesh?: THREE.Mesh;
    promise?: Promise<void>;
    chunk?: Chunk;
}

export class ChunkManager {
    private chunks = new Map<number, ChunkRecord>();
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    requestChunk(id: number, tile: THREE.BufferGeometry, detail: number): void {
        const existingRecord = this.chunks.get(id);
        if (
            existingRecord?.state === ChunkState.Loading ||
            existingRecord?.state === ChunkState.Visible
        ) {
            return;
        }

        const record: ChunkRecord = { state: ChunkState.Loading };
        this.chunks.set(id, record);

        // Create chunk instance
        const chunk = new Chunk(this.scene, tile, id, detail);
        record.chunk = chunk;

        // Add low detail mesh immediately
        record.lowDetailMesh = chunk.getLowDetailMesh();
        this.scene.add(record.lowDetailMesh);
        record.state = ChunkState.Ready;

        const promise = chunk.getGeometryPromise().then((geom: THREE.BufferGeometry) => {
            // Drop if no longer wanted
            if (record.state !== ChunkState.Ready) return;

            // Remove low detail mesh and add high detail mesh
            if (record.lowDetailMesh) {
                this.scene.remove(record.lowDetailMesh);
                record.lowDetailMesh = undefined;
            }

            record.mesh = new THREE.Mesh(geom, DEFAULT_MATERIAL);
            record.mesh.name = `nearby-${id}`;
            this.scene.add(record.mesh);
            record.state = ChunkState.Visible;
        });

        record.promise = promise;
    }

    unloadChunk(id: number): void {
        const record = this.chunks.get(id);
        if (!record) return;

        // Clean up meshes
        if (record.mesh) {
            this.scene.remove(record.mesh);
        }
        if (record.lowDetailMesh) {
            this.scene.remove(record.lowDetailMesh);
        }

        // Clean up chunk
        if (record.chunk) {
            record.chunk.destroy();
        }

        this.chunks.delete(id);
    }

    updateChunks(
        nearbyIndices: number[],
        pureTiles: THREE.BufferGeometry[],
        distanceToDetailMap: (distance: number) => number,
        distanceMatrix: number[][],
        currentChunkIndex: number
    ): void {
        // Remove chunks that are no longer nearby
        const loadedChunkIds = Array.from(this.chunks.keys());
        const chunksToUnload = loadedChunkIds.filter((id) => !nearbyIndices.includes(id));

        for (const chunkId of chunksToUnload) {
            this.unloadChunk(chunkId);
        }

        // Add new nearby chunks
        const chunksToLoad = nearbyIndices.filter((id) => !this.isChunkLoaded(id));

        for (const chunkId of chunksToLoad) {
            const distance = distanceMatrix[currentChunkIndex][chunkId];
            const detailLevel = distanceToDetailMap(distance);
            // console.log(`Requesting chunk ${chunkId} at detail level ${detailLevel}`);
            this.requestChunk(chunkId, pureTiles[chunkId], detailLevel);
        }
    }

    isChunkLoaded(id: number): boolean {
        const record = this.chunks.get(id);
        return record?.state === ChunkState.Visible || record?.state === ChunkState.Ready;
    }

    getChunkState(id: number): ChunkState {
        return this.chunks.get(id)?.state ?? ChunkState.Unloaded;
    }

    getLoadedChunkCount(): number {
        return this.chunks.size;
    }
}

export class FarawayChunkManager {
    private loadedFarawayIndices: Set<number> = new Set();
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    updateFarawayChunks(
        farawayIndices: number[],
        triGeoms: THREE.BufferGeometry[],
        distanceMatrix: number[][],
        currentChunkIndex: number,
        maxDistance: number
    ): void {
        // Remove faraway chunks that are no longer needed
        const chunksToRemove = [...this.loadedFarawayIndices].filter(
            (i) => !farawayIndices.includes(i)
        );

        for (const chunkIndex of chunksToRemove) {
            this.removeFarawayChunk(chunkIndex);
        }

        // Add new faraway chunks
        const chunksToAdd = farawayIndices.filter((i) => !this.loadedFarawayIndices.has(i));

        for (const chunkIndex of chunksToAdd) {
            this.addFarawayChunk(
                chunkIndex,
                triGeoms[chunkIndex],
                distanceMatrix,
                currentChunkIndex,
                maxDistance
            );
        }
    }

    private removeFarawayChunk(chunkIndex: number): void {
        const mesh = this.scene.getObjectByName(`faraway-${chunkIndex}`);
        if (mesh) {
            this.scene.remove(mesh);
        }
        this.loadedFarawayIndices.delete(chunkIndex);
    }

    private addFarawayChunk(
        chunkIndex: number,
        geometry: THREE.BufferGeometry,
        distanceMatrix: number[][],
        currentChunkIndex: number,
        maxDistance: number
    ): void {
        const distance = distanceMatrix[currentChunkIndex][chunkIndex];
        const hue = (2 * distance) / maxDistance;

        const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshPhongMaterial({
                color: new THREE.Color().setHSL(hue, 0.9, 0.7),
                wireframe: false,
                side: THREE.DoubleSide
            })
        );

        mesh.name = `faraway-${chunkIndex}`;
        this.scene.add(mesh);
        this.loadedFarawayIndices.add(chunkIndex);
    }

    getLoadedCount(): number {
        return this.loadedFarawayIndices.size;
    }
}
