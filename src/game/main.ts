import * as THREE from 'three/webgpu';
import { createRenderer } from './core/renderer';
import { WorldMesh } from './world/world';
import { PlayerPositionController } from './core/player';
import Stats from 'stats.js';
import { CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR, SPHERE_RADIUS, PLAYER_HEIGHT } from './constants';

// Rendering & Lighting
const AMBIENT_LIGHT_COLOR = 0x404040;
const AMBIENT_LIGHT_INTENSITY = 0.2;
const POINT_LIGHT_INTENSITY = 1_000 * SPHERE_RADIUS;
const SUN_MESH_SCALE = SPHERE_RADIUS / 20;

// UI
const STATS_PANEL_LEFT = 80;
const STATS_PANEL_OPACITY = 0.8;
const STATS_PANEL_PADDING = 5;
const STATS_PANEL_FONT_SIZE = 12;

let gameRunning = false;
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
    threeStatsPanel.style.left = `${STATS_PANEL_LEFT}px`;
    threeStatsPanel.style.color = '#fff';
    threeStatsPanel.style.backgroundColor = `rgba(0,0,0,${STATS_PANEL_OPACITY})`;
    threeStatsPanel.style.padding = `${STATS_PANEL_PADDING}px`;
    threeStatsPanel.style.fontFamily = 'monospace';
    threeStatsPanel.style.fontSize = `${STATS_PANEL_FONT_SIZE}px`;
    document.body.appendChild(threeStatsPanel);

    const scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
        CAMERA_FOV,
        window.innerWidth / window.innerHeight,
        CAMERA_NEAR,
        CAMERA_FAR
    );
    // camera.position.set(0, SPHERE_RADIUS + PLAYER_HEIGHT, 0);

    // Add some lighting for the world
    const ambientLight = new THREE.AmbientLight(AMBIENT_LIGHT_COLOR, AMBIENT_LIGHT_INTENSITY);
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

    const lighting = new THREE.PointLight(0xffffff, POINT_LIGHT_INTENSITY);
    lighting.castShadow = true;
    lighting.position.set(SPHERE_RADIUS / 4, 0, 0);
    scene.add(lighting);
    lighting.shadow.camera.near = SPHERE_RADIUS / 4;
    lighting.shadow.camera.far = 5000;
    lighting.shadow.mapSize.width = 2048;
    lighting.shadow.mapSize.height = 2048;
    lighting.shadow.bias = -0.001;

    // Add sun
    const sunMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 20),
        new THREE.MeshPhongMaterial({
            color: 'pink',
            wireframe: false,
            emissive: new THREE.Color(0xffaa77)
        })
    );
    sunMesh.position.copy(lighting.position);
    sunMesh.scale.set(SUN_MESH_SCALE, SUN_MESH_SCALE, SUN_MESH_SCALE);
    sunMesh.castShadow = false;
    sunMesh.receiveShadow = false;
    scene.add(sunMesh);

    // Handle window resize
    const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    // Initialize player position controller first
    const initialPosition = new THREE.Vector3(0, SPHERE_RADIUS - PLAYER_HEIGHT, 0); // Inside the sphere
    player = new PlayerPositionController(camera, initialPosition);

    // Create the world mesh system
    world = new WorldMesh(scene, initialPosition);

    const clock = new THREE.Clock();

    let calls = 0;
    function animate() {
        if (!gameRunning) return;

        requestAnimationFrame(animate);

        const delta = clock.getDelta();

        // Update player position and camera
        player.update(delta);

        // Update world based on player position
        world.update(player.getPosition());

        stats.begin();
        void renderer.renderAsync(scene, camera);
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

export function getPlayer() {
    return player;
}
