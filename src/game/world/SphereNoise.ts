import * as THREE from 'three';

export function getDisplacement(x: number, y: number, z: number): number {
  // Simple noise function - you can replace with more sophisticated noise
  const scale = 0.01;
  const amplitude = 100;
  
  // Simple sine-based noise for demonstration
  const noise1 = Math.sin(x * scale) * Math.cos(y * scale) * Math.sin(z * scale);
  const noise2 = Math.sin(x * scale * 2) * Math.cos(y * scale * 2) * Math.sin(z * scale * 2) * 0.5;
  const noise3 = Math.sin(x * scale * 4) * Math.cos(y * scale * 4) * Math.sin(z * scale * 4) * 0.25;
  
  return (noise1 + noise2 + noise3) * amplitude;
}
