import * as THREE from 'three/webgpu';
import { createRenderer } from './core/renderer';
import { FirstPersonControls } from './core/controls';
import { WorldMesh } from './world/world';
import { PlayerPositionController } from './core/player';
import Stats from 'stats.js';
import { ThreeMFLoader } from 'three/examples/jsm/Addons.js';

let gameRunning = false;
let controls: FirstPersonControls;
let player: PlayerPositionController;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGPURenderer;
let world: WorldMesh;

export function startGame() {
    if (gameRunning) return;
    gameRunning = true;

    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    renderer = createRenderer(canvas);
    renderer.info.autoReset = false;

    const stats = new Stats();
    // stats.showPanel(0);
    stats.showPanel(2);
    document.body.appendChild(stats.dom);

    // Create a custom stats panel for Three.js info
    const threeStatsPanel = document.createElement('div');
    threeStatsPanel.style.position = 'absolute';
    threeStatsPanel.style.bottom = '0px';
    threeStatsPanel.style.left = '80px';
    threeStatsPanel.style.color = '#fff';
    threeStatsPanel.style.backgroundColor = 'rgba(0,0,0,0.8)';
    threeStatsPanel.style.padding = '5px';
    threeStatsPanel.style.fontFamily = 'monospace';
    threeStatsPanel.style.fontSize = '12px';
    document.body.appendChild(threeStatsPanel);

    const scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    // camera.position.set(0, 3010, 0);

    // Add some lighting for the world
    const ambientLight = new THREE.AmbientLight(0x404040, 0.2);
    scene.add(ambientLight);

    // const sunLight = new THREE.SpotLight(0xffffff, 1_000_000, 2000, Math.PI / 4, 0.5);
    // sunLight.position.set(0, -2700, 300);
    // sunLight.target.position.set(-100, -3000, -200);
    // sunLight.castShadow = true;
    // sunLight.shadow.autoUpdate = true;
    // sunLight.shadow.bias = -0.001;
    // sunLight.shadow.mapSize.width = 2 * 2048;
    // sunLight.shadow.mapSize.height = 2 * 2048;
    // sunLight.shadow.camera.near = 10;
    // sunLight.shadow.camera.far = 2000;
    // scene.add(sunLight);
    // scene.add(sunLight.target);

    const lighting = new THREE.PointLight(0xffffff, 100_000_00);
    lighting.castShadow = true;
    scene.add(lighting);
    // lighting.shadow.camera.near = 500;
    // lighting.shadow.camera.far = 5000;
    // lighting.shadow.mapSize.width = 2048;
    // lighting.shadow.mapSize.height = 2048;
    // lighting.shadow.bias = -0.001;

    // Add sun
    const sunMesh = new THREE.Mesh(
        new THREE.SphereGeometry(3, 20, 20),
        new THREE.MeshPhongMaterial({
            color: 'pink',
            wireframe: false,
            emissive: new THREE.Color(0xffaa77)
        })
    );
    sunMesh.position.copy(lighting.position);
    sunMesh.scale.set(20, 20, 20);
    sunMesh.castShadow = false;
    sunMesh.receiveShadow = false;
    scene.add(sunMesh);

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

    // Create the world mesh system
    world = new WorldMesh(scene, initialPosition);

    const clock = new THREE.Clock();

    let calls = 0;
    function animate() {
        if (!gameRunning) return;

        requestAnimationFrame(animate);

        const delta = clock.getDelta();
        controls.update(delta);

        // Update player position and camera
        player.update(delta);

        // Update world based on player position
        world.update(player.getPosition());

        stats.begin();
        renderer.renderAsync(scene, camera);
        stats.end();
        const info = renderer.info;
        threeStatsPanel.innerHTML = `
            <strong>Three.js Stats</strong><br>
            Geometries: ${info.memory.geometries}<br>
            Textures: ${info.memory.textures}<br>
            Triangles: ${info.render.triangles - 1}<br>
            Points: ${info.render.points}<br>
            Lines: ${info.render.lines}<br>
            Draw Calls: ${info.render.calls - calls}
        `;
        calls = info.render.calls;
        renderer.info.reset();
    }
    animate();
}

export function getControls() {
    return controls;
}

export function getPlayer() {
    return player;
}
