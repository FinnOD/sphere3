import * as THREE from 'three';
import Hexasphere from './Hexasphere.js';
import { generateWorldGeometry } from './GenerateWorldGeometry';
import { getDisplacement } from './SphereNoise.js';
import { ChunkManager, FarawayChunkManager } from './ChunkManagers';

const DISTANCE_TO_DETAIL = {
    0: 7, // Player's current chunk - highest detail
    1: 7 // Adjacent chunks - high detail
} as const;

const CHUNK_RENDER_DISTANCE = Math.max(...Object.keys(DISTANCE_TO_DETAIL).map(Number));

export class WorldMesh {
    private scene: THREE.Scene;
    private defaultDetail: number;

    private hexasphere: Hexasphere;
    private pureTiles: Array<THREE.BufferGeometry>;
    private triGeoms: Array<THREE.BufferGeometry>;
    private midPoints: Array<THREE.Vector3>;

    private neighboursByIndex: number[][];
    private distanceMatrix: number[][];
    private maxDistance: number;
    private chunkIndex: number;

    private chunkManager: ChunkManager;
    private farawayChunkManager: FarawayChunkManager;

    constructor(
        scene: THREE.Scene,
        defaultDetail: number = 3,
        playerPosition: THREE.Vector3,
        showDebugMarkers: boolean = false
    ) {
        this.scene = scene;
        this.defaultDetail = defaultDetail;

        // Initialize chunk managers
        this.chunkManager = new ChunkManager(scene);
        this.farawayChunkManager = new FarawayChunkManager(scene);

        this.hexasphere = new Hexasphere(3000, 12, 1.0);
        [this.pureTiles, this.triGeoms, this.midPoints] = generateWorldGeometry(
            this.hexasphere,
            defaultDetail
        );

        // Set initial chunk index to -1 to force first update to run
        this.chunkIndex = -1; // Invalid index to ensure first update loads chunks
        this.neighboursByIndex = this.getNeighboursByIndex(this.hexasphere);
        this.distanceMatrix = this.createDistanceMatrix(this.neighboursByIndex);
        this.maxDistance = this.distanceMatrix.reduce((max, row) => Math.max(max, ...row), 0);

        // Optional debug visualization of chunk midpoints
        if (showDebugMarkers) {
            this.addDebugMarkers();
        }

        // Add sun
        const sunMesh = new THREE.Mesh(
            new THREE.SphereGeometry(3, 20, 20),
            new THREE.MeshPhongMaterial({ color: 'pink', wireframe: false })
        );
        sunMesh.position.set(0, 0, 0);
        sunMesh.scale.set(20, 20, 20);
        this.scene.add(sunMesh);

        // Force initial chunk loading with the force flag to ensure chunks load on first start
        this.update(playerPosition, true);
    }

    private addDebugMarkers(): void {
        const markerGeometry = new THREE.SphereGeometry(3, 20, 20);
        const markerMaterial = new THREE.MeshPhongMaterial({
            color: 'white',
            wireframe: false
        });

        for (let i = 0; i < this.midPoints.length; i++) {
            const mpDisp = this.mpDisp(this.midPoints[i]);
            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
            marker.position.copy(mpDisp);
            marker.name = `debug-marker-${i}`;
            this.scene.add(marker);
        }
    }

    public update(playerPosition: THREE.Vector3, forceUpdate: boolean = false) {
        const newChunkIndex = this.closestChunk(playerPosition);
        if (newChunkIndex === this.chunkIndex && !forceUpdate) return;

        this.chunkIndex = newChunkIndex;

        // Calculate nearby and faraway indices
        const nearbyIndices = this.getChunkIndicesByDistance(CHUNK_RENDER_DISTANCE, true);
        const farawayIndices = this.getChunkIndicesByDistance(CHUNK_RENDER_DISTANCE, false);

        console.log(`Chunks - Nearby: ${nearbyIndices.length}, Faraway: ${farawayIndices.length}`);

        // Update chunks using managers
        this.chunkManager.updateChunks(
            nearbyIndices,
            this.pureTiles,
            this.getDetailForDistance.bind(this),
            this.distanceMatrix,
            this.chunkIndex
        );

        this.farawayChunkManager.updateFarawayChunks(
            farawayIndices,
            this.triGeoms,
            this.distanceMatrix,
            this.chunkIndex,
            this.maxDistance
        );
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
        return (
            DISTANCE_TO_DETAIL[distance as keyof typeof DISTANCE_TO_DETAIL] ?? this.defaultDetail
        );
    }

    public getChunkStats(): { nearby: number; faraway: number; total: number } {
        return {
            nearby: this.chunkManager.getLoadedChunkCount(),
            faraway: this.farawayChunkManager.getLoadedCount(),
            total: this.scene.children.length
        };
    }

    public clearCache(): void {
        this.chunkManager.clearCache();
    }

    public getDetailedStats() {
        const cacheStats = this.chunkManager.getCacheStats();
        return {
            chunks: {
                nearby: this.chunkManager.getLoadedChunkCount(),
                faraway: this.farawayChunkManager.getLoadedCount(),
                total: this.scene.children.length
            },
            cache: cacheStats
        };
    }

    private getNeighboursByIndex(hex: Hexasphere): number[][] {
        let neighbourIndexes: number[][] = [];
        const keys = Object.keys(hex.tileLookup);

        for (const tileId in hex.tileLookup) {
            const neighbours = (hex.tileLookup as any)[tileId];
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

    private mpDisp(mp: THREE.Vector3): THREE.Vector3 {
        let normal = mp.clone().normalize();
        let onSphere = normal.clone().multiplyScalar(3000);

        let noise = getDisplacement(onSphere.x, onSphere.y, onSphere.z);
        let ballOffset = normal.clone().multiplyScalar(-3);

        onSphere.add(normal.multiplyScalar(-noise)).add(ballOffset);

        return onSphere;
    }
}
