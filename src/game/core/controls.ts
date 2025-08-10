import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export class FirstPersonControls {
    private controls: PointerLockControls;
    private camera: THREE.Camera;
    private euler: THREE.Euler;
    private minPolarAngle: number = 0;
    private maxPolarAngle: number = Math.PI;

    constructor(camera: THREE.Camera, domElement: HTMLElement) {
        this.camera = camera;
        this.controls = new PointerLockControls(camera, domElement);
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    }

    public lock() {
        this.controls.lock();
    }

    public unlock() {
        this.controls.unlock();
    }

    public update(delta: number) {
        // Let the controls handle mouse input but don't let them update camera directly
    }

    public getEulerAngles(): THREE.Euler {
        // Get the current euler angles from the pointer lock controls
        const object = this.controls.getObject();
        this.euler.setFromQuaternion(object.quaternion);
        return this.euler.clone();
    }

    public get object() {
        return this.controls.getObject();
    }

    public get isLocked() {
        return this.controls.isLocked;
    }

    public onLock(callback: () => void) {
        this.controls.addEventListener('lock', callback);
    }

    public onUnlock(callback: () => void) {
        this.controls.addEventListener('unlock', callback);
    }
}
