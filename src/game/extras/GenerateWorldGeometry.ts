import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import type Hexasphere from './Hexasphere';
import { LoopSubdivision } from 'three-subdivide';
import { getDisplacement } from './SphereNoise';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils';

const subDivideParams = {
    split: false, // optional, default: true
    uvSmooth: false, // optional, default: false
    preserveEdges: false, // optional, default: false
    flatOnly: true, // optional, default: false
    maxTriangles: Infinity // optional, default: Infinity
};

export function noisifyBuffer(geometry: BufferGeometry): BufferGeometry {
    const positionAttribute = geometry.getAttribute('position');
    const position = new Vector3();
    let noise;

    for (let i = 0; i < positionAttribute.array.length; i += 3) {
        position.set(
            positionAttribute.array[i],
            positionAttribute.array[i + 1],
            positionAttribute.array[i + 2]
        );
        position.setLength(3000);

        // Disable noise for now - just use sphere surface
        noise = getDisplacement(position.x, position.y, position.z);
        // noise = 0;

        let normal = position.clone().normalize().multiplyScalar(-noise);
        position.add(normal);

        positionAttribute.array[i] = position.x;
        positionAttribute.array[i + 1] = position.y;
        positionAttribute.array[i + 2] = position.z;
    }

    positionAttribute.needsUpdate = true;
    geometry = BufferGeometryUtils.mergeVertices(geometry);
    return geometry;
}

export function generateWorldGeometry(
    hexasphere: Hexasphere,
    nSubdivide: number
): [Array<BufferGeometry>, Array<BufferGeometry>, Array<Vector3>] {
    let pureTiles: Array<BufferGeometry> = [];
    let triGeoms: Array<BufferGeometry> = [];
    let midPoints: Array<Vector3> = [];

    let vec = new Vector3();
    for (let i = 0; i < hexasphere.tiles.length; i++) {
        let t = hexasphere.tiles[i];

        let vertices = [];
        let indices = [];
        vec.set(
            parseFloat(t.centerPoint.x),
            parseFloat(t.centerPoint.y),
            parseFloat(t.centerPoint.z)
        )
            .normalize()
            .multiplyScalar(3000);
        vertices.push(vec.x, vec.y, vec.z);
        midPoints.push(vec.clone());
        for (let j = 0; j < t.boundary.length; j++) {
            let bp = t.boundary[j];
            vec.set(parseFloat(bp.x), parseFloat(bp.y), parseFloat(bp.z))
                .normalize()
                .multiplyScalar(3000);
            vertices.push(vec.x, vec.y, vec.z);
        }

        indices.push(0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5);
        if (t.boundary.length == 5) {
            indices.push(0, 5, 1);
        } else {
            indices.push(0, 5, 6, 0, 6, 1);
        }

        let geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3, false));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        pureTiles.push(geometry.clone());

        geometry = LoopSubdivision.modify(geometry, nSubdivide, subDivideParams);
        geometry = noisifyBuffer(geometry);
        geometry.computeVertexNormals();

        triGeoms.push(geometry);
    }
    return [pureTiles, triGeoms, midPoints];
}
