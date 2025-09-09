import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';

// import { TSL } from 'three';
import { Hexasphere } from 'hexasphere';
import { generateWorldGeometry } from './GenerateWorldGeometry';
import { getDisplacement } from './SphereNoise.js';
import { ChunkManager, FarawayChunkManager } from './ChunkManagers';

const DISTANCE_TO_DETAIL = {
    0: 7, // Player's current chunk - highest detail
    1: 7 // Adjacent chunks - high detail
    // 2: 7 // Further chunks - medium detail
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

        //TEST
        const nodeMat = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0xff0066) });
        nodeMat.colorNode = TSL.reflectView.mul(2);
        const testThing = new THREE.Mesh(new THREE.TorusKnotGeometry(100, 30, 1000, 100), nodeMat);
        testThing.position.set(0, -3000, 0);
        testThing.castShadow = true;
        testThing.receiveShadow = true;
        this.scene.add(testThing);

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
            marker.castShadow = true;
            marker.receiveShadow = true;
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
