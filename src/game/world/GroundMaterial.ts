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
import { SPHERE_RADIUS } from '../constants';

// Material & Color Blending
const HEMISPHERE_BLEND_MIN = -0.2;
const HEMISPHERE_BLEND_MAX = 0.2;
const TERRAIN_GREEN = { r: 0, g: 0.604, b: 0.09, intensity: 0.6 };
const TERRAIN_BROWN = { r: 0.533, g: 0.404, b: 0.306 };
const TERRAIN_GRAY = { r: 0.514, g: 0.522, b: 0.475 };
const GRASS_BLEND_MIN = 0.97;
const GRASS_BLEND_MAX = 1.0;
const SANDY_BLEND_THRESHOLD = 0.5;
const SANDY_COLOR = { r: 0.6, g: 0.5, b: 0.04 };
const AMBIENT_LIGHT_FACTOR = 0.05;
const MOON_COLOR_INTENSITY = 0.1;

export class HollowSphereMaterial extends THREE.MeshStandardNodeMaterial {
    private sunColor;
    private moonColor;
    private green;
    private brown;
    private gray;
    private sunDirection;
    private altColor;

    constructor(params: THREE.MeshStandardNodeMaterialParameters = {}) {
        super(params);

        this.green = uniform(
            new THREE.Color(TERRAIN_GREEN.r, TERRAIN_GREEN.g, TERRAIN_GREEN.b).multiplyScalar(
                TERRAIN_GREEN.intensity
            )
        );
        this.brown = uniform(new THREE.Color(TERRAIN_BROWN.r, TERRAIN_BROWN.g, TERRAIN_BROWN.b));
        this.gray = uniform(new THREE.Color(TERRAIN_GRAY.r, TERRAIN_GRAY.g, TERRAIN_GRAY.b));

        this.sunColor = uniform(new THREE.Color(1.0, 1.0, 1.0));
        this.moonColor = uniform(
            new THREE.Color(0.4, 0.6, 1.0).multiplyScalar(MOON_COLOR_INTENSITY)
        );

        this.sunDirection = uniform(new THREE.Vector3(0, -1, 0));
        this.altColor = uniform(new THREE.Color(0, 0, 0));
        if (params.color) this.altColor = uniform(params.color);

        this.side = THREE.BackSide;
        this.setupCustomLighting();
    }

    private setupCustomLighting() {
        // const worldPos = positionWorld;
        // const worldNormal = normalWorld;

        // Simple hemisphere split
        const hemisphereBlend = smoothstep(
            float(HEMISPHERE_BLEND_MIN),
            float(HEMISPHERE_BLEND_MAX),
            positionWorld.y.div(float(SPHERE_RADIUS))
        );

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
        outputColor = mix(
            outputColor,
            this.green,
            smoothstep(float(GRASS_BLEND_MIN), float(GRASS_BLEND_MAX), localSlope)
        );

        const height = float(SPHERE_RADIUS).sub(length(positionWorld));
        const sandy = clamp(float(SANDY_BLEND_THRESHOLD).sub(height.mul(height)), 0, 1);
        outputColor = mix(outputColor, vec3(SANDY_COLOR.r, SANDY_COLOR.g, SANDY_COLOR.b), sandy);
        const a = outputColor.mul(customLighting.add(AMBIENT_LIGHT_FACTOR));
        this.colorNode = mix(a, this.altColor, float(1));
    }

    public setColor(c: THREE.Color) {
        this.altColor.setX(uniform(c.r));
    }
}
// export const GroundMaterial = new HollowSphereMaterial();
export const GroundMaterial = HollowSphereMaterial;
