import type { Hexasphere } from 'hexasphere';
import * as THREE from 'three/webgpu';
import { generateWorldGeometry } from './GenerateWorldGeometry';
import { Chunk, ChunkState } from './Chunk';
import * as TSL from 'three/tsl';

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

    // private nearChunksUniform;
    private nearIndicesSet = new Set<number>();

    private chunks: Map<number, Chunk> = new Map(); // Map of chunkIndex to Chunk
    private updateQueue: Array<{ chunkId: number; newState: ChunkState }> = [];
    public maxUpdatesThisFrame: number = 2;

    private playerPos: THREE.Vector3 = new THREE.Vector3();

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

        const positions: number[] = [];
        const indices: number[] = [];

        let vertexOffset = 0;
        this.triGeoms.forEach((geom, index) => {
            const posAttr = geom.getAttribute('position');
            const indexAttr = geom.getIndex();

            const vertexCount = posAttr.count;
            positions.push(...posAttr.array);

            const origIndices = indexAttr!.array;
            for (let i = 0; i < origIndices.length; i++) {
                indices.push(origIndices[i]! + vertexOffset);
            }

            vertexOffset += vertexCount;
        });

        // Build merged geometry
        const mergedGeometry = new THREE.BufferGeometry();
        mergedGeometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3, false)
        );
        mergedGeometry.setIndex(indices);

        // Recalculate normals for proper lighting
        mergedGeometry.computeVertexNormals();

        const mat = new THREE.MeshStandardNodeMaterial({
            side: THREE.BackSide,
            wireframe: false,
            color: new THREE.Color('red')
        });

        const nearChunksUniform = TSL.uniformArray(Array(7).fill(25), 'int');
        // console.log(nearChunksUniform.getNodeType()); ivec4
        nearChunksUniform.onFrameUpdate(() => {
            // const nearIndices = this.getChunkIndicesByDistance(
            //     this.closestChunk(this.playerPos),
            //     CHUNK_RENDER_DISTANCE,
            //     true
            // ); // Returns like [ 1, 2, 3, 4, 5, 6, 7 ] or [ 1, 2, 3, 4, 5, 6]

            let chunkIndicesArray = Array.from(this.nearIndicesSet);
            if (chunkIndicesArray.length !== 6 && chunkIndicesArray.length !== 7) {
                // console.warn(
                //     'Warning: nearIndicesSet should have 6 or 7 elements, but has',
                //     chunkIndicesArray.length,
                //     chunkIndicesArray
                // );
                chunkIndicesArray = chunkIndicesArray.slice(0, 7);
            }
            let paddedArray = chunkIndicesArray.flatMap((v) => [v, v, v, v]);
            if (paddedArray.length === 6 * 4) paddedArray = [...paddedArray, -1, -1, -1, -1];
            return new Int32Array(paddedArray);
            // if (chunkIndicesArray.length === 6) chunkIndicesArray = [...chunkIndicesArray, -1];
            // const out = chunkIndicesArray.map((id) => TSL.uint(id));
            // console.log(object);
            // console.log(out);
            // return out;
        });

        const pentVertexCount = this.triGeoms
            .find((g, i) => this.hexasphere.tiles[i]!.boundary.length === 5)!
            .getAttribute('position').count;
        const hexVertexCount = this.triGeoms
            .find((g, i) => this.hexasphere.tiles[i]!.boundary.length === 6)!
            .getAttribute('position').count;

        const chunkID = TSL.Fn(() => {
            const chunkid = TSL.select(
                TSL.vertexIndex.lessThan(pentVertexCount * 12),
                TSL.vertexIndex.div(pentVertexCount).toUint(),
                TSL.vertexIndex
                    .sub(pentVertexCount * 12)
                    .div(hexVertexCount)
                    .add(12)
                    .toUint()
            );
            return chunkid;
        });
        const matchChunk = TSL.Fn(() => {
            const found = TSL.bool(false);

            const chunkid = chunkID();

            TSL.Loop(7, ({ i }) => {
                const ele = nearChunksUniform.element(TSL.int(i)).toUint();
                found.orAssign(chunkid.equal(ele));
            });

            return found.toFloat();
        });
        mat.colorNode = TSL.color(chunkID().mod(10).toFloat().div(10));
        mat.positionNode = TSL.positionWorld.add(
            TSL.positionWorld.normalize().mul(matchChunk().mul(2000))
        );
        const mergedMesh = new THREE.Mesh(mergedGeometry, mat);
        this.scene.add(mergedMesh);

        this.neighboursByIndex = this.getNeighboursByIndex(this.hexasphere);
        this.distanceMatrix = this.createDistanceMatrix(this.neighboursByIndex);
        this.maxDistance = this.distanceMatrix.reduce((max, row) => Math.max(max, ...row), 0);

        Chunk.distanceMatrix = this.distanceMatrix;
        Chunk.maxDistance = this.maxDistance;
        Chunk.isPentagon = this.neighboursByIndex.map((t) => t.length === 5);
    }

    public update(playerPosition: THREE.Vector3) {
        this.playerPos.copy(playerPosition);

        const newChunkIndex = this.closestChunk(playerPosition);
        if (newChunkIndex !== this.chunkIndex) {
            this.chunkIndex = newChunkIndex;

            // Find nearby and faraway chunks ()
            const nearIndices = this.getChunkIndicesByDistance(
                this.chunkIndex,
                CHUNK_RENDER_DISTANCE,
                true
            );
            const farIndices = this.getChunkIndicesByDistance(
                this.chunkIndex,
                CHUNK_RENDER_DISTANCE,
                false
            );

            for (const chunkId of nearIndices) {
                const chunk = this.chunks.get(chunkId);
                if (chunk?.state !== ChunkState.Near) {
                    this.queueChunkUpdate(chunkId, ChunkState.Near);
                }
            }

            // Check far chunks
            for (const chunkId of farIndices) {
                const chunk = this.chunks.get(chunkId);
                if (chunk?.state !== ChunkState.Far) {
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
            void chunk.setStateAsync(task.newState);
        }
    }

    private getOrCreateChunk(id: number) {
        let chunk = this.chunks.get(id);

        if (!chunk) {
            chunk = new Chunk(id, this.scene, this.nearIndicesSet);
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
            const distance = this.midPoints[i]!.distanceToSquared(playerPosition);
            if (distance < closestDist) {
                closest = i;
                closestDist = distance;
            }
        }

        return closest;
    }

    private getChunkIndicesByDistance(
        chunkIndex: number,
        maxDistance: number,
        withinDistance: boolean
    ): number[] {
        return this.distanceMatrix[chunkIndex]!.map((distance, index) => ({ distance, index }))
            .filter(({ distance }) =>
                withinDistance ? distance <= maxDistance : distance > maxDistance
            )
            .map(({ index }) => index);
    }

    private getDetailForDistance(distance: number): number {
        return (
            (DISTANCE_TO_DETAIL as Record<number, number | undefined>)[distance] ?? DEFAULT_DETAIL
        );
    }

    private getNeighboursByIndex(hex: Hexasphere): number[][] {
        // @ts-expect-error TS2341 - Property 'tileLookup' is private in Hexasphere
        const tileLookup = hex.tileLookup as Record<string, Hexasphere['tiles'][number]>;

        const neighbourIndexes: number[][] = [];
        const keys = Object.keys(tileLookup);

        for (const tileId in tileLookup) {
            const neighbours = tileLookup[tileId]!;
            const currentIndexes = [];

            for (const neighborId of neighbours.neighborIds) {
                const index = keys.findIndex((id) => id === neighborId);
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
            const row = Array<number>(numTiles).fill(Infinity);
            row[i] = 0; // Distance to itself is 0.
            distanceMatrix[i] = row;
        }

        // Populate the distance matrix using BFS.
        for (let i = 0; i < numTiles; i++) {
            const row = distanceMatrix[i]!;
            const queue = [i];
            const visited = new Set([i]);
            while (queue.length > 0) {
                const currentTile = queue.shift() as number;
                for (const neighbour of neighbourIndexes[currentTile]!) {
                    if (!visited.has(neighbour)) {
                        row[neighbour] = row[currentTile]! + 1;
                        visited.add(neighbour);
                        queue.push(neighbour);
                    }
                }
            }
        }

        return distanceMatrix;
    }
}
