import * as THREE from 'three';
import { sphereDebug } from './debug';
import { getDisplacement } from '../extras/SphereNoise';

export class PlayerPositionController {
    private camera: THREE.PerspectiveCamera;
    private position: THREE.Vector3;
    private speed: number = 20;
    private sphereRadius: number = 3000;
    private playerHeight: number = 2;

    // Spherical camera system - simplified
    private cameraYaw: number = 0;
    private cameraPitch: number = 0;
    private mouseSensitivity: number = 0.002;

    private _euler = new THREE.Euler(0, 0, 0, 'YXZ');
    private localRot = new THREE.Quaternion().setFromEuler(this._euler);
    private _PI_2 = Math.PI / 2;

    // Movement state
    private keys = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        run: false
    };

    constructor(camera: THREE.PerspectiveCamera, initialPosition: THREE.Vector3) {
        this.camera = camera;

        // Position player INSIDE the sphere
        this.position = initialPosition
            .clone()
            .normalize()
            .multiplyScalar(this.sphereRadius - this.playerHeight);

        console.log('Initial position:', this.position);
        console.log('Initial distance from center:', this.position.length());
        console.log('Expected distance:', this.sphereRadius - this.playerHeight);

        // Initialize camera angles
        this.cameraYaw = 0;
        this.cameraPitch = 0;

        this.setupKeyboardListeners();
        this.setupMouseListeners();
        this.updateCameraTransform();
    }

    private setupKeyboardListeners() {
        const onKeyDown = (event: KeyboardEvent) => {
            switch (event.code) {
                case 'KeyW':
                    this.keys.forward = true;
                    break;
                case 'KeyS':
                    this.keys.backward = true;
                    break;
                case 'KeyA':
                    this.keys.left = true;
                    break;
                case 'KeyD':
                    this.keys.right = true;
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.keys.run = true;
                    break;
            }
        };

        const onKeyUp = (event: KeyboardEvent) => {
            switch (event.code) {
                case 'KeyW':
                    this.keys.forward = false;
                    break;
                case 'KeyS':
                    this.keys.backward = false;
                    break;
                case 'KeyA':
                    this.keys.left = false;
                    break;
                case 'KeyD':
                    this.keys.right = false;
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.keys.run = false;
                    break;
            }
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
    }

    private setupMouseListeners() {
        let isLocked = false;

        const onMouseMove = (event: MouseEvent) => {
            if (!isLocked) return;

            // Simple mouse input: horizontal movement = yaw, vertical movement = pitch
            // const yaw = event.movementX * this.mouseSensitivity;
            // const pitch = event.movementY * this.mouseSensitivity;

            this._euler.setFromQuaternion(this.localRot);
            let minPolarAngle = 0;
            let maxPolarAngle = Math.PI;
            // let _euler = new Euler(0, 0, 0, 'YXZ');

            this._euler.y -= event.movementX * this.mouseSensitivity;
            this._euler.x -= event.movementY * this.mouseSensitivity;

            this._euler.x = Math.max(
                this._PI_2 - maxPolarAngle,
                Math.min(this._PI_2 - minPolarAngle, this._euler.x)
            );
            this.localRot.setFromEuler(this._euler);

            // this.applyCameraRotation(yaw, pitch);
            this.updateCameraTransform();
        };

        const onPointerlockChange = () => {
            isLocked = document.pointerLockElement === document.body;
        };

        document.addEventListener('mousemove', onMouseMove, false);
        document.addEventListener('pointerlockchange', onPointerlockChange, false);
    }

    private applyCameraRotation(yawDelta: number, pitchDelta: number) {
        // Simple angle-based approach
        this.cameraYaw += yawDelta;
        this.cameraPitch += pitchDelta;
    }

    private updateCameraTransform() {
        // Update camera position
        this.camera.position.copy(this.position);
        console.log('Camera position:', this.camera.position);

        const norm = this.camera.position.clone().normalize();

        const globalAngle = new THREE.Quaternion();
        const downVector = new THREE.Vector3(0, -1, 0);
        globalAngle.setFromUnitVectors(downVector, norm);
        this.camera.quaternion.copy(globalAngle);

        // Then account for rotation with mouse
        // Localrot is set in pointerlock controls
        this.camera.quaternion.multiply(this.localRot);
    }

    public update(delta: number) {
        const moveSpeed = this.speed * (this.keys.run ? 60 : 1) * delta;

        // Build movement vector in camera space
        const tangentVelocity = new THREE.Vector3();
        if (this.keys.forward) tangentVelocity.z -= moveSpeed;
        if (this.keys.backward) tangentVelocity.z += moveSpeed;
        if (this.keys.left) tangentVelocity.x -= moveSpeed; // Fixed: was -=
        if (this.keys.right) tangentVelocity.x += moveSpeed; // Fixed: was +=

        if (tangentVelocity.length() <= 0) return;
        tangentVelocity.applyQuaternion(this.camera.quaternion);
        this.position = this.position.add(tangentVelocity);

        // Calculate displaced surface position EXACTLY like GenerateWorldGeometry
        let normal = this.position.clone().normalize();
        let playerOnSphere = normal.clone().multiplyScalar(3000);

        // Get displacement exactly like the world generation
        let noise = getDisplacement(playerOnSphere.x, playerOnSphere.y, playerOnSphere.z);
        let displacementVector = normal.clone().multiplyScalar(-noise);

        // Apply displacement to sphere surface
        let displacedSurfacePos = playerOnSphere.clone().add(displacementVector);

        // Position player above the displaced surface
        let playerHeightOffset = normal.clone().multiplyScalar(-this.playerHeight);
        this.position = displacedSurfacePos.add(playerHeightOffset);

        console.log(
            'Noise:',
            noise,
            'Surface pos:',
            displacedSurfacePos.length(),
            'Final pos:',
            this.position.length()
        );

        this.updateCameraTransform();
        // Debug information

        sphereDebug.update({
            playerPos: this.position,
            distanceFromCenter: this.position.length()
            // displacement: noise
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
        const onPointerlockChange = () => {
            if (this.isLocked) callback();
        };
        document.addEventListener('pointerlockchange', onPointerlockChange, false);
    }

    public onUnlock(callback: () => void) {
        const onPointerlockChange = () => {
            if (!this.isLocked) callback();
        };
        document.addEventListener('pointerlockchange', onPointerlockChange, false);
    }
}
