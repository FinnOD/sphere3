import * as THREE from 'three';
import { sphereDebug } from './debug';
import { getDisplacement } from '../world/SphereNoise';
import {
    SPHERE_RADIUS,
    PLAYER_HEIGHT,
    CAMERA_FOV,
    PLAYER_SPEED,
    PLAYER_RUN_MULTIPLIER,
    MOUSE_SENSITIVITY
} from '../constants';

const KEYS = {
    KeyW: 'forward',
    KeyS: 'backward',
    KeyA: 'left',
    KeyD: 'right',
    ShiftLeft: 'run',
    ShiftRight: 'run'
} as const;

const MAX_PITCH = (CAMERA_FOV * Math.PI) / 180;

/**
 * Player controller for inside-sphere locomotion.
 *
 * State is kept as three geometric quantities:
 *   position  – world-space eye position, snapped to displaced sphere surface
 *   heading   – unit tangent vector pointing "forward" horizontally
 *   pitch     – scalar angle (radians) ∈ [−MAX_PITCH, +MAX_PITCH]
 *               positive = look toward centre, negative = look toward surface
 *
 * Camera orientation is rebuilt each frame from these three values via lookAt,
 * so there is no accumulated quaternion drift and no pole singularity.
 */
export class PlayerPositionController {
    private camera: THREE.PerspectiveCamera;

    // Core orientation state
    private position = new THREE.Vector3();
    private heading = new THREE.Vector3(); // unit tangent, horizontal look direction
    private pitch = 0; // radians, clamped to ±MAX_PITCH

    private keys = { forward: false, backward: false, left: false, right: false, run: false };
    private locked = false;

    // Scratch objects (never heap-allocated per frame)
    private _up = new THREE.Vector3();
    private _oldUp = new THREE.Vector3();
    private _right = new THREE.Vector3();
    private _move = new THREE.Vector3();
    private _temp = new THREE.Vector3();
    private _spherePoint = new THREE.Vector3();
    private _tempQ = new THREE.Quaternion();

    constructor(camera: THREE.PerspectiveCamera, initialPosition: THREE.Vector3) {
        this.camera = camera;

        const normal = initialPosition.clone().normalize();
        this.position.copy(normal).multiplyScalar(SPHERE_RADIUS - PLAYER_HEIGHT);

        // Pick an arbitrary initial heading perpendicular to the surface normal
        const arbitrary =
            Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        this.heading.copy(arbitrary).addScaledVector(normal, -arbitrary.dot(normal)).normalize();

        this.setupListeners();
        this.updateCamera();
    }

    private setupListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.code in KEYS) this.keys[KEYS[e.code as keyof typeof KEYS]] = true;
        });
        document.addEventListener('keyup', (e) => {
            if (e.code in KEYS) this.keys[KEYS[e.code as keyof typeof KEYS]] = false;
        });
        document.addEventListener('mousemove', (e: MouseEvent) => {
            if (!this.locked) return;

            this._up.copy(this.position).normalize().negate();

            this._tempQ.setFromAxisAngle(this._up, -e.movementX * MOUSE_SENSITIVITY);
            this.heading.applyQuaternion(this._tempQ);
            this.heading.addScaledVector(this._up, -this.heading.dot(this._up)).normalize();

            this.pitch = Math.max(
                -MAX_PITCH,
                Math.min(MAX_PITCH, this.pitch - e.movementY * MOUSE_SENSITIVITY)
            );

            this.updateCamera();
        });
        document.addEventListener('pointerlockchange', () => {
            this.locked = document.pointerLockElement === document.body;
        });
    }

    /**
     * Rebuild camera transform from position / heading / pitch.
     * Uses camera.lookAt so the camera always rolls to keep surface-up upright.
     */
    private updateCamera() {
        // Surface up = toward centre of sphere
        this._up.copy(this.position).normalize().negate();

        const c = Math.cos(this.pitch);
        const s = Math.sin(this.pitch);

        // Look-at target: heading direction tilted toward/away from centre by pitch
        this._temp
            .copy(this.position)
            .addScaledVector(this.heading, c)
            .addScaledVector(this._up, s);

        this.camera.up.copy(this._up);
        this.camera.position.copy(this.position);
        this.camera.lookAt(this._temp);
    }

    public update(delta: number) {
        const speed = PLAYER_SPEED * (this.keys.run ? PLAYER_RUN_MULTIPLIER : 1) * delta;

        // Current tangent-plane basis
        this._up.copy(this.position).normalize().negate();
        this._right.crossVectors(this.heading, this._up).normalize();

        this._move.set(0, 0, 0);
        if (this.keys.forward) this._move.addScaledVector(this.heading, speed);
        if (this.keys.backward) this._move.addScaledVector(this.heading, -speed);
        if (this.keys.left) this._move.addScaledVector(this._right, -speed);
        if (this.keys.right) this._move.addScaledVector(this._right, speed);

        if (this._move.lengthSq() > 0) {
            // Save old surface up for parallel transport
            this._oldUp.copy(this._up);

            this.position.add(this._move);

            // Snap to displaced sphere surface
            this._temp.copy(this.position).normalize(); // outward normal direction
            this._spherePoint.copy(this._temp).multiplyScalar(SPHERE_RADIUS);
            const noise = getDisplacement(
                this._spherePoint.x,
                this._spherePoint.y,
                this._spherePoint.z
            );
            this.position.copy(this._temp).multiplyScalar(SPHERE_RADIUS - noise - PLAYER_HEIGHT);

            // New surface up after snap
            this._up.copy(this.position).normalize().negate();

            // Parallel-transport heading from old tangent plane to new tangent plane
            this._tempQ.setFromUnitVectors(this._oldUp, this._up);
            this.heading.applyQuaternion(this._tempQ);
            // Re-orthogonalise
            this.heading.addScaledVector(this._up, -this.heading.dot(this._up)).normalize();
        }

        this.updateCamera();

        sphereDebug.update({
            playerPos: this.position,
            distanceFromCenter: this.position.length()
        });
    }

    public lock() {
        void document.body.requestPointerLock();
    }

    public unlock() {
        document.exitPointerLock();
    }

    public get isLocked() {
        return this.locked;
    }

    public getPosition(): THREE.Vector3 {
        return this.position.clone();
    }

    public onLock(callback: () => void) {
        document.addEventListener('pointerlockchange', () => {
            if (this.locked) callback();
        });
    }

    public onUnlock(callback: () => void) {
        document.addEventListener('pointerlockchange', () => {
            if (!this.locked) callback();
        });
    }
}
