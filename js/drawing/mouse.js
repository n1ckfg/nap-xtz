import * as THREE from 'three';

/**
 * MouseController - Projects mouse into 3D space for drawing
 * Left click to draw, right click to toggle palette
 */
export class MouseController extends THREE.Object3D {
    constructor() {
        super();

        // Mouse state
        this.mouseX = 0;
        this.mouseY = 0;
        this.isLeftDown = false;
        this.isRightDown = false;

        // Drawing state (mirrors Controller)
        this.trigger_Down = false;
        this.trigger_Held = false;
        this.trigger_Up = false;

        // Palette state
        this.paletteActive = false;
        this.paletteJustOpened = false;

        // Drawing color
        this.drawColor = 0xffffff;

        // Smoothed position for drawing
        this._smoothPosition = new THREE.Vector3();
        this._drawPosition = new THREE.Vector3();
        this._initialized = false;

        // Raycaster for projecting mouse into scene
        this._raycaster = new THREE.Raycaster();
        this._mouseNDC = new THREE.Vector2();

        // Drawing plane (at z=0 by default)
        this._drawPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

        // Visual indicator
        const geometry = new THREE.SphereGeometry(0.15, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        this._cursor = new THREE.Mesh(geometry, material);
        this.add(this._cursor);

        // Color rim around cursor
        const rimGeo = new THREE.RingGeometry(0.17, 0.22, 32);
        const rimMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            depthTest: false
        });
        this._colorRim = new THREE.Mesh(rimGeo, rimMat);
        this._colorRim.renderOrder = 998;
        this.add(this._colorRim);

        // Bind event handlers
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onContextMenu = this._onContextMenu.bind(this);
    }

    /**
     * Start listening for mouse events
     */
    enable() {
        window.addEventListener('mousemove', this._onMouseMove);
        window.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mouseup', this._onMouseUp);
        window.addEventListener('contextmenu', this._onContextMenu);
    }

    /**
     * Stop listening for mouse events
     */
    disable() {
        window.removeEventListener('mousemove', this._onMouseMove);
        window.removeEventListener('mousedown', this._onMouseDown);
        window.removeEventListener('mouseup', this._onMouseUp);
        window.removeEventListener('contextmenu', this._onContextMenu);
    }

    _onMouseMove(event) {
        this.mouseX = event.clientX;
        this.mouseY = event.clientY;

        // Convert to NDC (-1 to 1)
        this._mouseNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
        this._mouseNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    _onMouseDown(event) {
        // Ignore when Alt is held (camera navigation)
        if (event.altKey) return;

        if (event.button === 0) {
            // Left click
            if (!this.paletteActive) {
                this.isLeftDown = true;
            } else {
                // Left click while palette active - for color selection
                this.isLeftDown = true;
            }
        } else if (event.button === 2) {
            // Right click
            this.isRightDown = true;
        }
    }

    _onMouseUp(event) {
        if (event.button === 0) {
            this.isLeftDown = false;
        } else if (event.button === 2) {
            this.isRightDown = false;
        }
    }

    _onContextMenu(event) {
        event.preventDefault();
    }

    /**
     * Update controller state - call each frame
     * @param {THREE.Camera} camera - The scene camera
     */
    update(camera) {
        // Project mouse ray onto draw plane
        this._raycaster.setFromCamera(this._mouseNDC, camera);

        const intersection = new THREE.Vector3();
        if (this._raycaster.ray.intersectPlane(this._drawPlane, intersection)) {
            this.position.copy(intersection);
        }

        // Make rim face camera
        this._colorRim.lookAt(camera.position);

        // Smooth position for drawing (50% smoothing like Controller)
        if (!this._initialized) {
            this._smoothPosition.copy(this.position);
            this._drawPosition.copy(this.position);
            this._initialized = true;
        } else {
            this._smoothPosition.lerp(this.position, 0.5);
            this._drawPosition.copy(this._smoothPosition);
        }

        // Update trigger states based on left mouse (only when palette not active)
        const wasHeld = this.trigger_Held;

        if (!this.paletteActive && this.isLeftDown) {
            if (!wasHeld) {
                this.trigger_Down = true;
                this.trigger_Held = true;
            } else {
                this.trigger_Down = false;
            }
            this.trigger_Up = false;
        } else {
            this.trigger_Down = false;
            if (wasHeld) {
                this.trigger_Up = true;
            } else {
                this.trigger_Up = false;
            }
            this.trigger_Held = false;
        }
    }

    /**
     * Check if right click just happened (for palette toggle)
     * @returns {boolean}
     */
    checkRightClick() {
        if (this.isRightDown) {
            this.isRightDown = false; // Consume the click
            return true;
        }
        return false;
    }

    /**
     * Check if left click just happened (for palette color selection)
     * @returns {boolean}
     */
    checkLeftClick() {
        if (this.isLeftDown && !this.trigger_Held) {
            return true;
        }
        return false;
    }

    /**
     * Get the smoothed drawing position
     * @param {THREE.Vector3} target - Vector to store result
     */
    getDrawPosition(target) {
        target.copy(this._drawPosition);
    }

    /**
     * Set the draw plane distance from camera
     * @param {number} distance - Distance along camera's forward direction
     * @param {THREE.Camera} camera - The scene camera
     */
    setDrawPlaneDistance(distance, camera) {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const planePoint = camera.position.clone().addScaledVector(forward, distance);
        this._drawPlane.setFromNormalAndCoplanarPoint(forward.negate(), planePoint);
    }

    /**
     * Set the drawing color
     * @param {number} color - Hex color value
     */
    setColor(color) {
        this.drawColor = color;
        this._colorRim.material.color.setHex(color);
    }

    /**
     * Set cursor visibility
     * @param {boolean} visible
     */
    setCursorVisible(visible) {
        this._cursor.visible = visible;
        this._colorRim.visible = visible;
    }
}
