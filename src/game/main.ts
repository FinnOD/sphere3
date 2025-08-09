import * as THREE from 'three';
import { createRenderer } from './core/renderer';
import { FirstPersonControls } from './core/controls';
import { WorldMesh } from './world/world';
import { PlayerPositionController } from './core/player';
import { sphereDebug } from './core/debug';

let gameRunning = false;
let controls: FirstPersonControls;
let player: PlayerPositionController;
let camera: THREE.PerspectiveCamera;
let renderer: any;
let world: WorldMesh;

export function startGame() {
    if (gameRunning) return;
    gameRunning = true;

    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    renderer = createRenderer(canvas);

    const scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    // camera.position.set(0, 3010, 0);

    // Add some lighting for the world
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1000, 2000, 1000);
    scene.add(directionalLight);

    // Handle window resize
    const handleResize = () => {
        if (camera && renderer) {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
        }
    };
    window.addEventListener('resize', handleResize);

    // Initialize player position controller first
    const initialPosition = new THREE.Vector3(0, -2998, 0); // Inside the sphere (radius 3000 - playerHeight 2)
    player = new PlayerPositionController(camera, initialPosition);

    // Initialize controls (simplified now)
    controls = new FirstPersonControls(camera, document.body);

    // Don't add anything to scene - player manages camera directly

    // Create the world mesh system
    world = new WorldMesh(scene, 3);

    const clock = new THREE.Clock();

    function animate() {
        if (!gameRunning) return;

        requestAnimationFrame(animate);

        const delta = clock.getDelta();
        controls.update(delta);

        // Update player position and camera
        player.update(delta);

        // Update world based on player position
        world.update(player.getPosition());

        // Add chunk info to debug (but don't overwrite other debug data)
        // const currentChunkIndex = world.getCurrentChunkIndex();
        // if (currentChunkIndex !== undefined) {
        //     sphereDebug.update({
        //         chunkIndex: currentChunkIndex
        //     });
        // }

        renderer.render(scene, camera);
    }
    animate();
}

export function getControls() {
    return controls;
}

export function getPlayer() {
    return player;
}
