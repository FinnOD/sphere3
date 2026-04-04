import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { Hexasphere } from 'hexasphere';

import { ChunkManager } from './ChunkManager';
import { SPHERE_RADIUS, HEXASPHERE_DETAIL } from '../constants';

export class WorldMesh {
    private scene: THREE.Scene;

    private hexasphere: Hexasphere;

    public chunkManager: ChunkManager;

    constructor(scene: THREE.Scene, playerPosition: THREE.Vector3) {
        this.scene = scene;

        // Initialize chunk managers
        this.hexasphere = new Hexasphere(SPHERE_RADIUS, HEXASPHERE_DETAIL, 1.0);
        this.chunkManager = new ChunkManager(scene, this.hexasphere);

        //TEST
        const nodeMat = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0xff0066) });
        nodeMat.colorNode = TSL.reflectView.mul(2);
        const testThing = new THREE.Mesh(new THREE.TorusKnotGeometry(100, 30, 1000, 100), nodeMat);
        testThing.position.set(0, -SPHERE_RADIUS, 0);
        testThing.castShadow = true;
        testThing.receiveShadow = true;
        this.scene.add(testThing);

        // Force initial chunk loading with the force flag to ensure chunks load on first start
        this.chunkManager.maxUpdatesThisFrame = Infinity;
        this.update(playerPosition);
        this.chunkManager.maxUpdatesThisFrame = 10;
    }

    public update(playerPosition: THREE.Vector3) {
        this.chunkManager.update(playerPosition);
    }
}
