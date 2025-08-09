import { noisifyBuffer } from './GenerateWorldGeometry';
import {
    deserializeBufferGeometry,
    serializeBufferGeometry,
    type SerializedBufferGeometry
} from './SerializeBufferGeometry';
import { LoopSubdivision } from 'three-subdivide';

const subDivideParams = {
    split: false, // optional, default: true
    uvSmooth: false, // optional, default: false
    preserveEdges: false, // optional, default: false
    flatOnly: true, // optional, default: false
    maxTriangles: Infinity // optional, default: Infinity
};

function makeBufferGeometry(serializedGeometry: SerializedBufferGeometry, subdivideDetail: number) {
    let originalGeometry = deserializeBufferGeometry(serializedGeometry);

    let subdivided = LoopSubdivision.modify(originalGeometry, subdivideDetail, subDivideParams);
    subdivided = noisifyBuffer(subdivided);
    subdivided.computeVertexNormals();

    return subdivided;
}

onmessage = function (e) {
    let [serializedGeometry, detail]: [SerializedBufferGeometry, number] = e.data;

    const detailedGeometry = makeBufferGeometry(serializedGeometry, detail);
    const detailedSerializedGeometry = serializeBufferGeometry(detailedGeometry);
    postMessage(detailedSerializedGeometry);
};
