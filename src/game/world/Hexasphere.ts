import * as THREE from 'three';

export interface Tile {
  id: string;
  neighborIds: string[];
  boundary: THREE.Vector3[];
  center: THREE.Vector3;
}

export interface TileLookup {
  [key: string]: Tile;
}

export class Hexasphere {
  public tileLookup: TileLookup = {};
  public tiles: Tile[] = [];
  
  constructor(
    public radius: number = 1,
    public subdivisions: number = 5,
    public hexSize: number = 1
  ) {
    this.generateSphere();
  }

  private generateSphere() {
    // Create an icosahedron as the base
    const geometry = new THREE.IcosahedronGeometry(this.radius, this.subdivisions);
    const positions = geometry.getAttribute('position');
    const indices = geometry.getIndex();

    if (!indices) return;

    // Group vertices into faces and create tiles
    for (let i = 0; i < indices.count; i += 3) {
      const a = indices.getX(i);
      const b = indices.getX(i + 1);
      const c = indices.getX(i + 2);

      const vertA = new THREE.Vector3().fromBufferAttribute(positions, a);
      const vertB = new THREE.Vector3().fromBufferAttribute(positions, b);
      const vertC = new THREE.Vector3().fromBufferAttribute(positions, c);

      // Calculate center
      const center = new THREE.Vector3()
        .add(vertA)
        .add(vertB)
        .add(vertC)
        .divideScalar(3)
        .normalize()
        .multiplyScalar(this.radius);

      const tile: Tile = {
        id: `tile_${i / 3}`,
        neighborIds: [],
        boundary: [vertA, vertB, vertC],
        center: center
      };

      this.tiles.push(tile);
      this.tileLookup[tile.id] = tile;
    }

    // Calculate neighbors (simplified - in practice you'd want more sophisticated neighbor detection)
    this.calculateNeighbors();
  }

  private calculateNeighbors() {
    const threshold = this.radius * 0.3; // Adjust as needed

    for (let i = 0; i < this.tiles.length; i++) {
      const tile = this.tiles[i];
      
      for (let j = 0; j < this.tiles.length; j++) {
        if (i === j) continue;
        
        const otherTile = this.tiles[j];
        const distance = tile.center.distanceTo(otherTile.center);
        
        if (distance < threshold) {
          tile.neighborIds.push(otherTile.id);
        }
      }
    }
  }
}
