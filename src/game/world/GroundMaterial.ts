import * as THREE from 'three/webgpu';
import {
    uniform,
    float,
    vec3,
    vec4,
    dot,
    normalize,
    max,
    min,
    pow,
    mix,
    smoothstep,
    length,
    distance,
    color,
    positionWorld,
    normalWorld,
    normalLocal,
    abs,
    positionViewDirection,
    transformedNormalWorld,
    clamp,
    oscSine
} from 'three/tsl';

export class HollowSphereMaterial extends THREE.MeshStandardNodeMaterial {
    private sunColor;
    private moonColor;
    private green;
    private brown;
    private gray;
    private sunDirection;

    constructor(params: THREE.MeshStandardNodeMaterialParameters = {}) {
        super(params);

        this.green = uniform(new THREE.Color(0, 0.604, 0.09).multiplyScalar(0.6));
        this.brown = uniform(new THREE.Color(0.533, 0.404, 0.306));
        this.gray = uniform(new THREE.Color(0.514, 0.522, 0.475));

        this.sunColor = uniform(new THREE.Color(1.0, 1.0, 1.0));
        this.moonColor = uniform(new THREE.Color(0.4, 0.6, 1.0).multiplyScalar(0.1));

        this.sunDirection = uniform(new THREE.Vector3(0, -1, 0));

        this.side = THREE.BackSide;
        this.setupCustomLighting();
    }

    private setupCustomLighting() {
        // const worldPos = positionWorld;
        // const worldNormal = normalWorld;

        // Simple hemisphere split
        const hemisphereBlend = smoothstep(float(-0.2), float(0.2), positionWorld.y.div(3000.0));

        // Sun lighting (bottom hemisphere)
        const sunDir = normalize(this.sunDirection.sub(positionWorld));
        const sunLight = max(float(0.0), dot(normalWorld, sunDir));
        const sunContribution = this.sunColor.mul(sunLight).mul(float(1.0).sub(hemisphereBlend));

        // Moon lighting (top hemisphere)
        const moonDir = normalize(this.sunDirection.mul(-1).sub(positionWorld));
        const moonLight = max(0.0, dot(normalWorld, moonDir));
        const moonContribution = this.moonColor.mul(moonLight).mul(hemisphereBlend);

        // Combine lighting
        const customLighting = sunContribution.add(moonContribution);

        // Apply to diffuse - let Three.js handle shadows automatically
        const up = positionWorld.normalize();
        const localSlope = abs(dot(up, normalWorld));
        let outputColor = mix(this.gray, this.brown, smoothstep(0.0, 0.9, localSlope));
        outputColor = mix(outputColor, this.green, smoothstep(0.97, 1.0, localSlope));

        const height = float(3000).sub(length(positionWorld));
        const sandy = clamp(float(0.5).sub(height.mul(height)), 0, 1);
        outputColor = mix(outputColor, vec3(0.6, 0.5, 0.04), sandy);
        this.colorNode = outputColor.mul(customLighting.add(0.05)); // 0.1 = ambient
    }
}
export const GroundMaterial = new HollowSphereMaterial();
