import * as THREE from 'three';

// Debug utility for spherical camera system
export class SphereDebug {
    private static instance: SphereDebug;
    private debugDiv!: HTMLDivElement;
    private enabled: boolean = true;
    private debugData: any = {}; // Accumulate debug data

    private constructor() {
        this.createDebugDiv();
        this.setupGlobalAccess();
    }

    public static getInstance(): SphereDebug {
        if (!SphereDebug.instance) {
            SphereDebug.instance = new SphereDebug();
        }
        return SphereDebug.instance;
    }

    private createDebugDiv() {
        this.debugDiv = document.createElement('div');
        this.debugDiv.id = 'sphere-debug';
        this.debugDiv.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: #00ff00;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      padding: 10px;
      border-radius: 5px;
      max-width: 400px;
      z-index: 10000;
      pointer-events: none;
      white-space: pre-line;
    `;
        document.body.appendChild(this.debugDiv);
    }

    private setupGlobalAccess() {
        // Add to window for console access
        (window as any).sphereDebug = {
            toggle: () => this.toggle(),
            enable: () => this.enable(),
            disable: () => this.disable(),
            log: (message: string) => this.log(message),
            clear: () => this.clear()
        };
    }

    public update(data: {
        playerPos?: THREE.Vector3;
        distanceFromCenter?: number;
        surfaceNormal?: THREE.Vector3;
        cameraForward?: THREE.Vector3;
        cameraUp?: THREE.Vector3;
        cameraRight?: THREE.Vector3;
        horizontalAngle?: number;
        verticalAngle?: number;
        displacement?: number;
        movementInput?: THREE.Vector3;
        transformedMovement?: THREE.Vector3;
        chunkIndex?: number;
        poleDirection?: THREE.Vector3;
        yaw?: number;
        pitch?: number;
    }) {
        if (!this.enabled) return;

        // Accumulate debug data instead of overwriting
        Object.assign(this.debugData, data);

        this.render();
    }

    private render() {
        let debugText = '=== SPHERE DEBUG ===\n\n';

        if (this.debugData.playerPos) {
            debugText += `Player Position: (${this.debugData.playerPos.x.toFixed(1)}, ${this.debugData.playerPos.y.toFixed(1)}, ${this.debugData.playerPos.z.toFixed(1)})\n`;
        }

        if (this.debugData.distanceFromCenter !== undefined) {
            debugText += `Distance from Center: ${this.debugData.distanceFromCenter.toFixed(1)}\n`;
        }

        if (this.debugData.surfaceNormal) {
            debugText += `Surface Normal: (${this.debugData.surfaceNormal.x.toFixed(3)}, ${this.debugData.surfaceNormal.y.toFixed(3)}, ${this.debugData.surfaceNormal.z.toFixed(3)})\n`;
        }

        if (
            this.debugData.horizontalAngle !== undefined &&
            this.debugData.verticalAngle !== undefined
        ) {
            debugText += `Mouse Angles: H=${((this.debugData.horizontalAngle * 180) / Math.PI).toFixed(1)}° V=${((this.debugData.verticalAngle * 180) / Math.PI).toFixed(1)}°\n`;
        }

        if (this.debugData.yaw !== undefined && this.debugData.pitch !== undefined) {
            debugText += `Yaw/Pitch: Y=${((this.debugData.yaw * 180) / Math.PI).toFixed(1)}° P=${((this.debugData.pitch * 180) / Math.PI).toFixed(1)}°\n`;
        }

        if (this.debugData.cameraForward) {
            debugText += `Camera Forward: (${this.debugData.cameraForward.x.toFixed(3)}, ${this.debugData.cameraForward.y.toFixed(3)}, ${this.debugData.cameraForward.z.toFixed(3)})\n`;
        }

        if (this.debugData.cameraUp) {
            debugText += `Camera Up: (${this.debugData.cameraUp.x.toFixed(3)}, ${this.debugData.cameraUp.y.toFixed(3)}, ${this.debugData.cameraUp.z.toFixed(3)})\n`;
        }

        if (this.debugData.cameraRight) {
            debugText += `Camera Right: (${this.debugData.cameraRight.x.toFixed(3)}, ${this.debugData.cameraRight.y.toFixed(3)}, ${this.debugData.cameraRight.z.toFixed(3)})\n`;
        }

        if (this.debugData.poleDirection) {
            debugText += `Pole Direction: (${this.debugData.poleDirection.x.toFixed(3)}, ${this.debugData.poleDirection.y.toFixed(3)}, ${this.debugData.poleDirection.z.toFixed(3)})\n`;
        }

        // Add orthogonality checks
        if (this.debugData.cameraForward && this.debugData.cameraUp && this.debugData.cameraRight) {
            const dotFU = this.debugData.cameraForward.dot(this.debugData.cameraUp);
            const dotFR = this.debugData.cameraForward.dot(this.debugData.cameraRight);
            const dotUR = this.debugData.cameraUp.dot(this.debugData.cameraRight);
            debugText += `Orthogonality: F·U=${dotFU.toFixed(3)} F·R=${dotFR.toFixed(3)} U·R=${dotUR.toFixed(3)}\n`;
        }

        if (this.debugData.movementInput && this.debugData.transformedMovement) {
            debugText += `Movement Input: (${this.debugData.movementInput.x.toFixed(3)}, ${this.debugData.movementInput.y.toFixed(3)}, ${this.debugData.movementInput.z.toFixed(3)})\n`;
            debugText += `Transformed: (${this.debugData.transformedMovement.x.toFixed(3)}, ${this.debugData.transformedMovement.y.toFixed(3)}, ${this.debugData.transformedMovement.z.toFixed(3)})\n`;
        }

        if (this.debugData.chunkIndex !== undefined) {
            debugText += `Current Chunk: ${this.debugData.chunkIndex}\n`;
        }

        debugText += '\nConsole Commands:\n';
        debugText += 'sphereDebug.toggle() - Toggle debug display\n';
        debugText += 'sphereDebug.enable() - Enable debug display\n';
        debugText += 'sphereDebug.disable() - Disable debug display';

        this.debugDiv.textContent = debugText;
    }

    public log(message: string) {
        console.log(`[SphereDebug] ${message}`);
    }

    public toggle() {
        this.enabled = !this.enabled;
        this.debugDiv.style.display = this.enabled ? 'block' : 'none';
        this.log(`Debug ${this.enabled ? 'enabled' : 'disabled'}`);
    }

    public enable() {
        this.enabled = true;
        this.debugDiv.style.display = 'block';
        this.log('Debug enabled');
    }

    public disable() {
        this.enabled = false;
        this.debugDiv.style.display = 'none';
        this.log('Debug disabled');
    }

    public clear() {
        this.debugData = {};
        this.debugDiv.textContent = '';
    }
}

// Export for easy import
export const sphereDebug = SphereDebug.getInstance();
