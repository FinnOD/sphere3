import * as THREE from 'three';

export class PlayerPositionController {
  private camera: THREE.PerspectiveCamera;
  private position: THREE.Vector3;
  private speed: number = 20;
  private sphereRadius: number = 3000;
  private playerHeight: number = -20;
  
  // Movement state
  private keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    run: false
  };

  // Mouse look
  private yaw: number = 0;
  private pitch: number = 0;
  private mouseSensitivity: number = 0.002;

  constructor(camera: THREE.PerspectiveCamera, initialPosition: THREE.Vector3) {
    this.camera = camera;
    this.position = initialPosition.clone().normalize().multiplyScalar(this.sphereRadius);
    
    this.setupKeyboardListeners();
    this.setupMouseListeners();
    this.updateCameraPosition();
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

      this.yaw -= event.movementX * this.mouseSensitivity;
      this.pitch -= event.movementY * this.mouseSensitivity;
      
      // Clamp pitch to prevent flipping
      this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
      
      this.updateCameraRotation();
    };

    const onPointerlockChange = () => {
      isLocked = document.pointerLockElement === document.body;
    };

    document.addEventListener('mousemove', onMouseMove, false);
    document.addEventListener('pointerlockchange', onPointerlockChange, false);
  }

  private updateCameraPosition() {
    // Place camera at player position + height offset
    const surfaceNormal = this.position.clone().normalize();
    const cameraPosition = this.position.clone().add(
      surfaceNormal.clone().multiplyScalar(this.playerHeight)
    );
    
    this.camera.position.copy(cameraPosition);
    this.updateCameraRotation();
  }

  private updateCameraRotation() {
    // Simple yaw and pitch rotation - no sphere orientation for now
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  public update(delta: number) {
    const moveSpeed = this.speed * (this.keys.run ? 20 : 1) * delta;
    
    if (!this.keys.forward && !this.keys.backward && !this.keys.left && !this.keys.right) {
      return; // No movement
    }

    // Create movement vector in camera space
    const movement = new THREE.Vector3();
    if (this.keys.forward) movement.z -= moveSpeed;
    if (this.keys.backward) movement.z += moveSpeed;
    if (this.keys.left) movement.x -= moveSpeed;
    if (this.keys.right) movement.x += moveSpeed;

    // Convert movement to world space based on camera yaw only (ignore pitch for movement)
    const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    movement.applyQuaternion(yawQuaternion);

    // Project movement onto sphere surface (tangent to current position)
    const currentNormal = this.position.clone().normalize();
    const tangentMovement = movement.clone().projectOnPlane(currentNormal);

    // Move position
    this.position.add(tangentMovement);
    
    // Re-normalize to stay on sphere surface (no terrain displacement for now)
    this.position.normalize().multiplyScalar(this.sphereRadius);
    
    this.updateCameraPosition();
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

  public getYawObject(): THREE.Object3D {
    // Return a dummy object for compatibility - we're positioning the camera directly now
    const dummy = new THREE.Object3D();
    dummy.position.copy(this.position);
    return dummy;
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
