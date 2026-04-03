/// <reference types="vite/client" />

declare module '@leodeslf/perlin-noise' {
    export function perlin3D(x: number, y: number, z: number): number;
}

declare module 'three/addons/utils/BufferGeometryUtils' {
    import type { BufferGeometry } from 'three';
    export function mergeVertices(geometry: BufferGeometry, tolerance?: number): BufferGeometry;
}

interface Window {
    sphereDebug: {
        toggle: () => void;
        enable: () => void;
        disable: () => void;
        log: (message: string) => void;
        clear: () => void;
    };
}

declare module '*?worker' {
    const WorkerFactory: {
        new (): Worker;
    };
    export default WorkerFactory;
}

declare module '*?worker&module' {
    const WorkerFactory: {
        new (): Worker;
    };
    export default WorkerFactory;
}
