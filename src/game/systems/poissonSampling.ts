import * as THREE from 'three/webgpu';

/**
 * Uniformly samples `count` random points within the triangulated area of a
 * BufferGeometry tile. Points are returned projected onto the sphere surface
 * (radius 3000) — terrain noise is NOT applied here.
 */
export function samplePointsOnTile(geometry: THREE.BufferGeometry, count: number): THREE.Vector3[] {
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const indexAttr = geometry.getIndex();

    // Build triangle list with cumulative area (for weighted sampling)
    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    const vc = new THREE.Vector3();
    const edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3();

    type Triangle = [THREE.Vector3, THREE.Vector3, THREE.Vector3];
    const triangles: Triangle[] = [];
    const cdf: number[] = [];
    let totalArea = 0;

    const triCount = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;
    for (let i = 0; i < triCount; i++) {
        const ai = indexAttr ? indexAttr.getX(i * 3) : i * 3;
        const bi = indexAttr ? indexAttr.getX(i * 3 + 1) : i * 3 + 1;
        const ci = indexAttr ? indexAttr.getX(i * 3 + 2) : i * 3 + 2;
        va.fromBufferAttribute(posAttr, ai);
        vb.fromBufferAttribute(posAttr, bi);
        vc.fromBufferAttribute(posAttr, ci);
        edge1.subVectors(vb, va);
        edge2.subVectors(vc, va);
        const area = edge1.clone().cross(edge2).length() * 0.5;
        triangles.push([va.clone(), vb.clone(), vc.clone()]);
        totalArea += area;
        cdf.push(totalArea);
    }

    // Normalise CDF
    for (let i = 0; i < cdf.length; i++) cdf[i]! /= totalArea;

    const points: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
        // Pick triangle weighted by area using binary search on CDF
        const r = Math.random();
        let lo = 0,
            hi = cdf.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (cdf[mid]! < r) lo = mid + 1;
            else hi = mid;
        }
        const [ta, tb, tc] = triangles[lo]!;

        // Uniform barycentric sampling (Osada et al.)
        const s = Math.sqrt(Math.random());
        const t = Math.random();
        const u = 1 - s;
        const v = s * (1 - t);
        const w = s * t;

        const point = new THREE.Vector3(
            ta.x * u + tb.x * v + tc.x * w,
            ta.y * u + tb.y * v + tc.y * w,
            ta.z * u + tb.z * v + tc.z * w
        );
        point.setLength(3000); // project onto sphere
        points.push(point);
    }

    return points;
}
