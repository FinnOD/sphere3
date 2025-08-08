import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export class FirstPersonControls {
  private controls: PointerLockControls;
  private camera: THREE.Camera;
  private velocity = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private canJump = false;

  constructor(camera: THREE.Camera, domElement: HTMLElement) {
    this.camera = camera;
    this.controls = new PointerLockControls(camera, domElement);
    
    this.setupEventListeners();
  }

  private setupEventListeners() {
    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
          this.moveForward = true;
          break;
        case 'ArrowLeft':
        case 'KeyA':
          this.moveLeft = true;
          break;
        case 'ArrowDown':
        case 'KeyS':
          this.moveBackward = true;
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.moveRight = true;
          break;
        case 'Space':
          if (this.canJump === true) this.velocity.y += 350;
          this.canJump = false;
          break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
          this.moveForward = false;
          break;
        case 'ArrowLeft':
        case 'KeyA':
          this.moveLeft = false;
          break;
        case 'ArrowDown':
        case 'KeyS':
          this.moveBackward = false;
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.moveRight = false;
          break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
  }

  public lock() {
    this.controls.lock();
  }

  public unlock() {
    this.controls.unlock();
  }

  public update(delta: number) {
    this.velocity.x -= this.velocity.x * 10.0 * delta;
    this.velocity.z -= this.velocity.z * 10.0 * delta;
    this.velocity.y -= 9.8 * 100.0 * delta; // 100.0 = mass

    this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
    this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
    this.direction.normalize(); // this ensures consistent movements in all directions

    if (this.moveForward || this.moveBackward) this.velocity.z -= this.direction.z * 400.0 * delta;
    if (this.moveLeft || this.moveRight) this.velocity.x -= this.direction.x * 400.0 * delta;

    this.controls.moveRight(-this.velocity.x * delta);
    this.controls.moveForward(-this.velocity.z * delta);

    this.controls.getObject().position.y += (this.velocity.y * delta); // new behavior

    if (this.controls.getObject().position.y < 10) {
      this.velocity.y = 0;
      this.controls.getObject().position.y = 10;
      this.canJump = true;
    }
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
