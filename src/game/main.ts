import * as THREE from 'three';
import { createRenderer } from './core/renderer';
import { FirstPersonControls } from './core/controls';

let gameRunning = false;
let controls: FirstPersonControls;
let camera: THREE.PerspectiveCamera;
let renderer: any;

export function startGame() {
  if (gameRunning) return;
  gameRunning = true;

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  renderer = createRenderer(canvas);

  const scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 10, 5);

  // Handle window resize
  const handleResize = () => {
    if (camera && renderer) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    }
  };
  
  window.addEventListener('resize', handleResize);

  // Initialize controls
  controls = new FirstPersonControls(camera, document.body);
  
  // Add controls object to scene
  scene.add(controls.object);

  // Create a simple ground
  const groundGeometry = new THREE.PlaneGeometry(100, 100);
  const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x808080, side: THREE.DoubleSide });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Add some cubes to look at
  for (let i = 0; i < 10; i++) {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshBasicMaterial({ color: Math.random() * 0xffffff });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(
      (Math.random() - 0.5) * 50,
      1,
      (Math.random() - 0.5) * 50
    );
    scene.add(cube);
  }

  const clock = new THREE.Clock();

  function animate() {
    if (!gameRunning) return;
    
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    controls.update(delta);
    
    renderer.render(scene, camera);
  }
  animate();
}

export function getControls() {
  return controls;
}
