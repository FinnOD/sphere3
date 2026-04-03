# sphere3

First-person game set on the **inside** of a hollow sphere (~3 km radius). Three.js (WebGPU renderer), TypeScript, Vite, Svelte UI. Targets modern browsers only — no backcompat concerns.

## Dev

```bash
pnpm dev        # Vite dev server
pnpm build      # Production build
pnpm format     # Prettier + ESLint auto-fix
pnpm lint       # Check only (no writes)
pnpm check      # svelte-check + tsc type checking
```

Format-on-save and ESLint fix-on-save are configured in `.vscode/settings.json`.

## Critical: Inside-Sphere Math

All geometry operates from **inside** the sphere — the inverse of typical planet/sphere math. When something looks right for the outside of a planet, it's wrong here.

- Normals point **inward** (toward center), not outward.
- Player "up" = **negated** surface normal.
- Terrain displacement moves vertices **toward center** (subtract along normal).
- `THREE.BackSide` on all surface materials.
- `SPHERE_RADIUS = 3000` is the single source of truth.

## Architecture

- **Chunks**: ~500 hex/pentagon tiles via `hexasphere.js`. `ChunkManager` BFS-loads tiles within `CHUNK_RENDER_DISTANCE = 1`. All geometry is one merged `BufferGeometry`; a TSL shader node shows/hides chunks via a `nearIndicesSet` uniform.
- **Terrain**: `TerrainWorker.ts` (Web Worker) runs Loop subdivision (6 passes) + FBM noise (`SphereNoise.ts`) off the main thread. Geometries must be serialised via `SerializeBufferGeometry.ts` to cross the worker boundary.
- **Player**: Each frame — project position to sphere, sample noise, offset inward by `PLAYER_HEIGHT = 2`. Camera orientation from `setFromUnitVectors(DOWN, normal)` × local mouse-look quaternion.
