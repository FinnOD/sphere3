import type { Hexasphere, Tile } from 'hexasphere';
import * as THREE from 'three/webgpu';
import { generateWorldGeometry } from './GenerateWorldGeometry';
import { Chunk, ChunkState } from './Chunk';
import { color, js } from 'three/tsl';

const DEFAULT_DETAIL = 3;
const DISTANCE_TO_DETAIL = {
    0: 7, // Player's current chunk - highest detail
    1: 7 // Adjacent chunks - high detail
    // 2: 7 // Further chunks - medium detail
} as const;
const CHUNK_RENDER_DISTANCE = Math.max(...Object.keys(DISTANCE_TO_DETAIL).map(Number));

export class ChunkManager {
    private scene: THREE.Scene;
    private chunkIndex: number = -1; // Invalid initial index to force first update
    private hexasphere: Hexasphere;
    private pureTiles: Array<THREE.BufferGeometry>;
    private triGeoms: Array<THREE.BufferGeometry>;
    private midPoints: Array<THREE.Vector3>;

    private neighboursByIndex: number[][];
    private distanceMatrix: number[][];
    private maxDistance: number;

    private chunks: Map<number, Chunk> = new Map(); // Map of chunkIndex to Chunk
    private updateQueue: Array<{ chunkId: number; newState: ChunkState }> = [];
    public maxUpdatesThisFrame: number = 2;

    constructor(scene: THREE.Scene, hexasphere: Hexasphere) {
        this.scene = scene;
        this.hexasphere = hexasphere;

        [this.pureTiles, this.triGeoms, this.midPoints] = generateWorldGeometry(
            this.hexasphere,
            DEFAULT_DETAIL
        );

        Chunk.pureTiles = this.pureTiles;
        Chunk.triGeoms = this.triGeoms;
        Chunk.midPoints = this.midPoints;

        this.neighboursByIndex = this.getNeighboursByIndex(this.hexasphere);
        this.distanceMatrix = this.createDistanceMatrix(this.neighboursByIndex);
        this.maxDistance = this.distanceMatrix.reduce((max, row) => Math.max(max, ...row), 0);

        Chunk.distanceMatrix = this.distanceMatrix;
        Chunk.maxDistance = this.maxDistance;
        Chunk.isPentagon = this.neighboursByIndex.map((t) => t.length === 5);
    }

    public update(playerPosition: THREE.Vector3) {
        const newChunkIndex = this.closestChunk(playerPosition);
        if (newChunkIndex !== this.chunkIndex) {
            this.chunkIndex = newChunkIndex;

            // Find nearby and faraway chunks ()
            const nearIndices = this.getChunkIndicesByDistance(CHUNK_RENDER_DISTANCE, true);
            const farIndices = this.getChunkIndicesByDistance(CHUNK_RENDER_DISTANCE, false);

            for (const chunkId of nearIndices) {
                const chunk = this.chunks.get(chunkId);
                if (chunk?.state !== ChunkState.Near || chunk === undefined) {
                    this.queueChunkUpdate(chunkId, ChunkState.Near);
                }
            }

            // Check far chunks
            for (const chunkId of farIndices) {
                const chunk = this.chunks.get(chunkId);
                if (chunk?.state !== ChunkState.Far || chunk === undefined) {
                    this.queueChunkUpdate(chunkId, ChunkState.Far);
                }
            }
        }

        // Process the update queue with a limit per frame
        const updatesThisFrame = Math.min(this.maxUpdatesThisFrame, this.updateQueue.length);
        let numTransitions = 0;
        this.chunks.forEach((chunk) => {
            if (chunk.isTransitioning) numTransitions++;
        });
        for (let i = 0; i < updatesThisFrame - numTransitions; i++) {
            const task = this.updateQueue.shift()!;
            const chunk = this.getOrCreateChunk(task.chunkId);
            chunk.setStateAsync(task.newState);
        }
    }

    private getOrCreateChunk(id: number) {
        let chunk = this.chunks.get(id);

        if (!chunk) {
            chunk = new Chunk(id, this.scene);
            this.chunks.set(id, chunk);
        }
        return chunk;
    }

    private queueChunkUpdate(id: number, newState: ChunkState) {
        this.updateQueue = this.updateQueue.filter((task) => task.chunkId !== id);
        this.updateQueue.push({ chunkId: id, newState });
    }

    private closestChunk(playerPosition: THREE.Vector3): number {
        let closest = 0;
        let closestDist = Infinity;
        for (let i = 0; i < this.midPoints.length; i++) {
            let distance = this.midPoints[i].distanceToSquared(playerPosition);
            if (distance < closestDist) {
                closest = i;
                closestDist = distance;
            }
        }

        return closest;
    }

    private getChunkIndicesByDistance(maxDistance: number, withinDistance: boolean): number[] {
        return this.distanceMatrix[this.chunkIndex]
            .map((distance, index) => ({ distance, index }))
            .filter(({ distance }) =>
                withinDistance ? distance <= maxDistance : distance > maxDistance
            )
            .map(({ index }) => index);
    }

    private getDetailForDistance(distance: number): number {
        return DISTANCE_TO_DETAIL[distance as keyof typeof DISTANCE_TO_DETAIL] ?? DEFAULT_DETAIL;
    }

    private getNeighboursByIndex(hex: Hexasphere): number[][] {
        // @ts-ignore TS2341 - Property 'tileLookup' is private in Hexasphere
        const tileLookup: Record<string, Hexasphere['tiles'][number]> = hex.tileLookup;

        let neighbourIndexes: number[][] = [];
        const keys = Object.keys(tileLookup);

        for (const tileId in tileLookup) {
            const neighbours = tileLookup[tileId];
            const currentIndexes = [];

            for (const neighborId of neighbours.neighborIds) {
                const index = keys.findIndex((id) => id === neighborId);
                if (index < 0) console.log(neighborId);
                currentIndexes.push(index);
            }
            neighbourIndexes.push(currentIndexes);
        }
        return neighbourIndexes;
    }

    private createDistanceMatrix(neighbourIndexes: number[][]): number[][] {
        const numTiles = neighbourIndexes.length;
        const distanceMatrix: number[][] = [];

        // Initialize the distance matrix with infinity values.
        for (let i = 0; i < numTiles; i++) {
            distanceMatrix[i] = Array(numTiles).fill(Infinity);
            distanceMatrix[i][i] = 0; // Distance to itself is 0.
        }

        // Populate the distance matrix using BFS.
        for (let i = 0; i < numTiles; i++) {
            const queue = [i];
            const visited = new Set([i]);
            while (queue.length > 0) {
                const currentTile = queue.shift() as number;
                for (const neighbour of neighbourIndexes[currentTile]) {
                    if (!visited.has(neighbour)) {
                        distanceMatrix[i][neighbour] = distanceMatrix[i][currentTile] + 1;
                        visited.add(neighbour);
                        queue.push(neighbour);
                    }
                }
            }
        }

        return distanceMatrix;
    }
}
