import * as THREE from 'three';
import { Chunk } from './Chunk';

// Geometry cache for chunks
interface CachedGeometry {
    geometry: THREE.BufferGeometry;
    timestamp: number;
}

class GeometryCache {
    private cache = new Map<string, CachedGeometry>();
    private maxAge = 5 * 60 * 1000; // 5 minutes
    private maxEntries = 100; // Maximum cache entries

    private getCacheKey(chunkId: number, detail: number): string {
        return `${chunkId}-${detail}`;
    }

    get(chunkId: number, detail: number): THREE.BufferGeometry | null {
        const key = this.getCacheKey(chunkId, detail);
        const cached = this.cache.get(key);

        if (!cached) return null;

        // Check if cache entry is still valid
        if (Date.now() - cached.timestamp > this.maxAge) {
            this.cache.delete(key);
            return null;
        }

        console.log(`Cache hit for chunk ${chunkId} detail ${detail}`);
        return cached.geometry.clone(); // Clone to avoid mutations
    }

    set(chunkId: number, detail: number, geometry: THREE.BufferGeometry): void {
        const key = this.getCacheKey(chunkId, detail);

        // Clean up old entries if cache is full
        if (this.cache.size >= this.maxEntries) {
            this.cleanupOldEntries();
        }

        this.cache.set(key, {
            geometry: geometry.clone(), // Clone to avoid mutations
            timestamp: Date.now()
        });

        console.log(`Cached geometry for chunk ${chunkId} detail ${detail}`);
    }

    private cleanupOldEntries(): void {
        const now = Date.now();
        const toDelete: string[] = [];

        for (const [key, cached] of this.cache.entries()) {
            if (now - cached.timestamp > this.maxAge) {
                toDelete.push(key);
            }
        }

        // If no old entries, remove oldest 20%
        if (toDelete.length === 0) {
            const entries = Array.from(this.cache.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            const removeCount = Math.floor(this.maxEntries * 0.2);
            toDelete.push(...entries.slice(0, removeCount).map((e) => e[0]));
        }

        for (const key of toDelete) {
            this.cache.delete(key);
        }

        console.log(`Cleaned up ${toDelete.length} cache entries`);
    }

    clear(): void {
        this.cache.clear();
    }

    getStats(): { size: number; maxEntries: number } {
        return {
            size: this.cache.size,
            maxEntries: this.maxEntries
        };
    }
}

// Global cache instance
// Make cache available globally for Chunk class
const geometryCache = new GeometryCache();
(window as any).geometryCache = geometryCache;

const DEFAULT_COLOR = new THREE.Color(0x6644aa);
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

    public clearCache(): void {
        geometryCache.clear();
        console.log('Geometry cache cleared');
    }

    public getCacheStats() {
        return geometryCache.getStats();
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
