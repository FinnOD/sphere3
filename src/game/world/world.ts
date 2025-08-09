import * as THREE from 'three';
import Hexasphere from './Hexasphere.js';
import { generateWorldGeometry } from './GenerateWorldGeometry';
import { getDisplacement } from './SphereNoise.js';

export class WorldMesh {
    private hexasphere: Hexasphere;
    private pureTiles: THREE.BufferGeometry[];
    private triGeoms: THREE.BufferGeometry[];
    private midPoints: THREE.Vector3[];
    private neighboursByIndex: number[][];
    private distanceMatrix: number[][];
    private maxDistance: number;
    private scene: THREE.Scene;
    private playerPosition: THREE.Vector3;
    private currentChunkIndex: number = 0;
    private chunkRenderDist: number = 1;
    private detailLevels: { [key: number]: number } = {
        0: 7,
        1: 7
    };

    // Mesh containers
    private nearbyChunks: THREE.Group;
    private farawayChunks: THREE.Group;
    private markers: THREE.Group;
    private cameraMarker!: THREE.Mesh;

    // Materials
    private groundMaterial!: THREE.MeshStandardMaterial;
    private markerMaterial!: THREE.MeshPhongMaterial;
    private sphereMaterial!: THREE.MeshPhongMaterial;
    private cameraMarkerMaterial!: THREE.MeshPhongMaterial;

    constructor(scene: THREE.Scene, defaultDetail: number = 3) {
        this.scene = scene;
        this.playerPosition = new THREE.Vector3(0, 10, 0);

        // Create hexasphere and generate world geometry
        this.hexasphere = new Hexasphere(3000, 12, 1.0);
        const [pureTiles, triGeoms, midPoints] = generateWorldGeometry(
            this.hexasphere,
            defaultDetail
        );

        this.pureTiles = pureTiles;
        this.triGeoms = triGeoms;
        this.midPoints = midPoints;

        // Calculate neighbor relationships and distances
        this.neighboursByIndex = this.getNeighboursByIndex();
        this.distanceMatrix = this.createDistanceMatrix();
        this.maxDistance = this.distanceMatrix.reduce((max, row) => Math.max(max, ...row), 0);

        console.log('Max distance:', this.maxDistance);

        // Create materials
        this.createMaterials();

        // Create mesh groups
        this.nearbyChunks = new THREE.Group();
        this.farawayChunks = new THREE.Group();
        this.markers = new THREE.Group();

        this.scene.add(this.nearbyChunks);
        this.scene.add(this.farawayChunks);
        this.scene.add(this.markers);

        // Initial render
        this.updateChunks();
        this.createMarkers();
        this.createCameraMarker();
    }

    private createMaterials() {
        this.groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x8b7355,
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.BackSide
        });

        this.markerMaterial = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            wireframe: false
        });

        this.sphereMaterial = new THREE.MeshPhongMaterial({
            color: 0xff69b4,
            wireframe: false
        });

        this.cameraMarkerMaterial = new THREE.MeshPhongMaterial({
            color: 0x00ff00, // Bright green for camera position
            side: THREE.DoubleSide,
            wireframe: false
        });
    }

    private getNeighboursByIndex(): number[][] {
        const neighbourIndexes: number[][] = [];
        const keys = Object.keys(this.hexasphere.tileLookup);

        for (const tileId in this.hexasphere.tileLookup) {
            const neighbours = (this.hexasphere.tileLookup as any)[tileId];
            const currentIndexes: number[] = [];

            for (const neighborId of neighbours.neighborIds) {
                const index = keys.findIndex((id) => id === neighborId);
                if (index >= 0) {
                    currentIndexes.push(index);
                }
            }
            neighbourIndexes.push(currentIndexes);
        }
        return neighbourIndexes;
    }

    private createDistanceMatrix(): number[][] {
        const numTiles = this.neighboursByIndex.length;
        const distanceMatrix: number[][] = [];

        // Initialize with infinity
        for (let i = 0; i < numTiles; i++) {
            distanceMatrix[i] = Array(numTiles).fill(Infinity);
            distanceMatrix[i][i] = 0;
        }

        // BFS to populate distances
        for (let i = 0; i < numTiles; i++) {
            const queue = [i];
            const visited = new Set([i]);

            while (queue.length > 0) {
                const currentTile = queue.shift()!;

                for (const neighbour of this.neighboursByIndex[currentTile]) {
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

    private closestChunk(playerPos: THREE.Vector3): number {
        let closest = 0;
        let closestDist = Infinity;

        for (let i = 0; i < this.midPoints.length; i++) {
            const distance = this.midPoints[i].distanceToSquared(playerPos);
            if (distance < closestDist) {
                closest = i;
                closestDist = distance;
            }
        }

        return closest;
    }

    private getNearbyIndices(chunkIndex: number): number[] {
        return this.distanceMatrix[chunkIndex]
            .map((d, i) => (d <= this.chunkRenderDist ? i : -1))
            .filter((v) => v >= 0);
    }

    private getFarawayIndices(chunkIndex: number): number[] {
        return this.distanceMatrix[chunkIndex]
            .map((d, i) => (d > this.chunkRenderDist ? i : -1))
            .filter((v) => v >= 0);
    }

    private createChunkMesh(geometryIndex: number, isNearby: boolean = false): THREE.Mesh {
        const geometry = isNearby ? this.triGeoms[geometryIndex] : this.triGeoms[geometryIndex];

        let material: THREE.Material;
        if (isNearby) {
            // Create colored material based on distance
            const distance = this.distanceMatrix[this.currentChunkIndex][geometryIndex];
            const hue = (2 * distance) / this.maxDistance;
            material = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(hue, 0.9, 0.7),
                roughness: 0.8,
                metalness: 0.1,
                side: THREE.BackSide
            });
        } else {
            material = this.groundMaterial;
        }

        return new THREE.Mesh(geometry, material);
    }

    private updateChunks() {
        // Clear existing chunks
        this.nearbyChunks.clear();
        this.farawayChunks.clear();

        const nearbyIndices = this.getNearbyIndices(this.currentChunkIndex);
        const farawayIndices = this.getFarawayIndices(this.currentChunkIndex);

        // Add nearby chunks with detail
        for (const i of nearbyIndices) {
            const mesh = this.createChunkMesh(i, true);
            this.nearbyChunks.add(mesh);
        }

        // Add faraway chunks with less detail
        for (const i of farawayIndices) {
            const mesh = this.createChunkMesh(i, false);
            this.farawayChunks.add(mesh);
        }
    }

    private createMarkers() {
        const sphereGeometry = new THREE.SphereGeometry(3, 20, 20);

        // Center sphere
        const centerSphere = new THREE.Mesh(sphereGeometry, this.sphereMaterial);
        centerSphere.scale.setScalar(20);
        this.markers.add(centerSphere);

        // Midpoint markers
        for (const mp of this.midPoints) {
            const position = this.mpDisp(mp);
            const marker = new THREE.Mesh(sphereGeometry, this.markerMaterial);
            marker.position.set(position[0], position[1], position[2]);
            this.markers.add(marker);
        }
    }

    private createCameraMarker() {
        // Create a bright green cube for camera position (20m size for visibility)
        const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
        this.cameraMarker = new THREE.Mesh(cubeGeometry, this.cameraMarkerMaterial);

        // Position it at a fixed location on the sphere surface for now
        this.cameraMarker.position.set(0, 3010, 0); // 10m above sphere surface
        this.scene.add(this.cameraMarker);

        console.log('Camera marker created at:', this.cameraMarker.position);
    }

    private mpDisp(mp: THREE.Vector3): number[] {
        const normal = mp.clone().normalize();
        const onSphere = normal.clone().multiplyScalar(3000);

        // Disable noise displacement for now - just use sphere surface
        const noise = getDisplacement(onSphere.x, onSphere.y, onSphere.z);
        // const noise = 0;
        const ballOffset = normal.clone(); //.multiplyScalar(-3);

        onSphere.add(normal.multiplyScalar(-noise)).add(ballOffset);

        return [onSphere.x, onSphere.y, onSphere.z];
    }

    public update(playerPosition: THREE.Vector3) {
        this.playerPosition.copy(playerPosition);

        let playerNormalOnSphere = playerPosition.clone().normalize().multiplyScalar(3000);

        let noise = getDisplacement(
            playerNormalOnSphere.x,
            playerNormalOnSphere.y,
            playerNormalOnSphere.z
        );
        let normal = playerNormalOnSphere.clone().normalize().multiplyScalar(-noise);
        playerNormalOnSphere.add(normal);
        this.cameraMarker.position.copy(playerNormalOnSphere); // Slightly above player position

        // For debugging, log the player position
        // if (Math.random() < 0.01) {
        //     // Log occasionally to avoid spam
        //     console.log('Player position:', playerPosition);
        //     console.log('Camera marker position:', this.cameraMarker.position);
        // }

        const newChunkIndex = this.closestChunk(playerPosition);

        if (newChunkIndex !== this.currentChunkIndex) {
            this.currentChunkIndex = newChunkIndex;
            this.updateChunks();
        }
    }

    public setChunkRenderDistance(distance: number) {
        this.chunkRenderDist = distance;
        this.updateChunks();
    }

    public toggleMarkers(visible: boolean) {
        this.markers.visible = visible;
    }

    public getCurrentChunkIndex(): number {
        return this.currentChunkIndex;
    }
}
