import * as THREE from 'three';
import { sphereDebug } from './debug';
import { getDisplacement } from '../world/SphereNoise';

const KEYS = {
    KeyW: 'forward',
    KeyS: 'backward',
    KeyA: 'left',
    KeyD: 'right',
    ShiftLeft: 'run',
    ShiftRight: 'run'
} as const;

export class PlayerPositionController {
    private static readonly SPEED = 2;
    private static readonly SPHERE_RADIUS = 3000;
    private static readonly PLAYER_HEIGHT = 2;
    private static readonly MOUSE_SENSITIVITY = 0.002;
    private static readonly RUN_MULTIPLIER = 60;
    private static readonly PI_2 = Math.PI / 2;

    private camera: THREE.PerspectiveCamera;
    private position: THREE.Vector3;

    private euler = new THREE.Euler(0, 0, 0, 'YXZ');
    private localRotation = new THREE.Quaternion();

    private keys = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        run: false
    };

    // Reusable vectors for performance
    private tempVector = new THREE.Vector3();
    private tempNormal = new THREE.Vector3();
    private tempQuaternion = new THREE.Quaternion();

    constructor(camera: THREE.PerspectiveCamera, initialPosition: THREE.Vector3) {
        this.camera = camera;

        // Position player inside the sphere
        this.position = initialPosition
            .clone()
            .normalize()
            .multiplyScalar(
                PlayerPositionController.SPHERE_RADIUS - PlayerPositionController.PLAYER_HEIGHT
            );

        console.log('Initial position:', this.position);
        console.log('Initial distance from center:', this.position.length());
        console.log(
            'Expected distance:',
            PlayerPositionController.SPHERE_RADIUS - PlayerPositionController.PLAYER_HEIGHT
        );

        this.setupControls();
        this.updateCameraTransform();
    }

    private setupControls() {
        this.setupKeyboardListeners();
        this.setupMouseListeners();
    }

    private setupKeyboardListeners() {
        const handleKey = (event: KeyboardEvent, pressed: boolean) => {
            const action = KEYS[event.code as keyof typeof KEYS];
            if (action && action in this.keys) {
                this.keys[action as keyof typeof this.keys] = pressed;
            }
        };

        document.addEventListener('keydown', (e) => handleKey(e, true));
        document.addEventListener('keyup', (e) => handleKey(e, false));
    }

    private setupMouseListeners() {
        let isLocked = false;

        const onMouseMove = (event: MouseEvent) => {
            if (!isLocked) return;

            this.euler.setFromQuaternion(this.localRotation);

            this.euler.y -= event.movementX * PlayerPositionController.MOUSE_SENSITIVITY;
            this.euler.x -= event.movementY * PlayerPositionController.MOUSE_SENSITIVITY;

            // Clamp pitch
            this.euler.x = Math.max(
                PlayerPositionController.PI_2 - Math.PI,
                Math.min(PlayerPositionController.PI_2, this.euler.x)
            );

            this.localRotation.setFromEuler(this.euler);
            this.updateCameraTransform();
        };

        const onPointerLockChange = () => {
            isLocked = document.pointerLockElement === document.body;
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('pointerlockchange', onPointerLockChange);
    }

    private updateCameraTransform() {
        this.camera.position.copy(this.position);

        // Get surface normal and align camera
        this.tempNormal.copy(this.position).normalize();

        this.tempQuaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), this.tempNormal);

        this.camera.quaternion.copy(this.tempQuaternion);
        this.camera.quaternion.multiply(this.localRotation);
    }

    public update(delta: number) {
        const moveSpeed =
            PlayerPositionController.SPEED *
            (this.keys.run ? PlayerPositionController.RUN_MULTIPLIER : 1) *
            delta;

        // Build movement vector in camera space
        this.tempVector.set(0, 0, 0);
        if (this.keys.forward) this.tempVector.z -= moveSpeed;
        if (this.keys.backward) this.tempVector.z += moveSpeed;
        if (this.keys.left) this.tempVector.x -= moveSpeed;
        if (this.keys.right) this.tempVector.x += moveSpeed;

        if (this.tempVector.length() <= 0) return;

        this.tempVector.applyQuaternion(this.camera.quaternion);
        this.position.add(this.tempVector);

        // Calculate displaced surface position
        this.tempNormal.copy(this.position).normalize();
        const spherePoint = this.tempNormal
            .clone()
            .multiplyScalar(PlayerPositionController.SPHERE_RADIUS);

        // Get terrain displacement
        const noise = getDisplacement(spherePoint.x, spherePoint.y, spherePoint.z);
        const displacementVector = this.tempNormal.clone().multiplyScalar(-noise);

        // Apply displacement to sphere surface
        const surfacePosition = spherePoint.add(displacementVector);

        // Position player above the displaced surface
        const heightOffset = this.tempNormal.multiplyScalar(
            -PlayerPositionController.PLAYER_HEIGHT
        );
        this.position = surfacePosition.add(heightOffset);

        this.updateCameraTransform();

        sphereDebug.update({
            playerPos: this.position,
            distanceFromCenter: this.position.length()
        });
    }

    public lock() {
        document.body.requestPointerLock();
    }

    public unlock() {
        document.exitPointerLock();
    }

    public get isLocked() {
        return document.pointerLockElement === document.body;
    }

    public getPosition(): THREE.Vector3 {
        return this.position.clone();
    }

    public onLock(callback: () => void) {
        document.addEventListener('pointerlockchange', () => {
            if (this.isLocked) callback();
        });
    }

    public onUnlock(callback: () => void) {
        document.addEventListener('pointerlockchange', () => {
            if (!this.isLocked) callback();
        });
    }
}
