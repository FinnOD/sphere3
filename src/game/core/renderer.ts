import * as THREE from 'three/webgpu'

export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
  
  // Handle device pixel ratio for Retina displays
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  
  // Set size and handle resize
  const setSize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
  };
  
  setSize();
  
  // Handle window resize
  window.addEventListener('resize', setSize);
  
  return renderer;
}
