export class InputManager {
    constructor(canvas, camera) {
        this.canvas = canvas;
        this.camera = camera;
        this.keys = {};
        this.panSpeed = 300; // pixels per second

        // Mouse state
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.mouseDownX = 0;
        this.mouseDownY = 0;
        this.hasMoved = false;
        this.clickThreshold = 5; // pixels of movement before it's considered a drag

        // Touch state
        this.touches = [];
        this.lastPinchDistance = 0;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchHasMoved = false;

        // Click callback
        this.onClickCallback = null;

        // Drag callbacks for tile selection
        this.onDragStartCallback = null;
        this.onDragMoveCallback = null;
        this.onDragEndCallback = null;

        // Panning control
        this.panningEnabled = true;
    }

    setClickCallback(callback) {
        this.onClickCallback = callback;
    }

    setDragStartCallback(callback) {
        this.onDragStartCallback = callback;
    }

    setDragMoveCallback(callback) {
        this.onDragMoveCallback = callback;
    }

    setDragEndCallback(callback) {
        this.onDragEndCallback = callback;
    }

    setPanningEnabled(enabled) {
        this.panningEnabled = enabled;
    }

    init() {
        // Keyboard events
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));

        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

        // Touch events
        this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
        this.canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });

        // Prevent context menu on right click
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    onKeyDown(e) {
        this.keys[e.key.toLowerCase()] = true;
    }

    onKeyUp(e) {
        this.keys[e.key.toLowerCase()] = false;
    }

    onMouseDown(e) {
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.mouseDownX = e.clientX;
        this.mouseDownY = e.clientY;
        this.hasMoved = false;

        // Fire drag start callback
        if (this.onDragStartCallback) {
            const rect = this.canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const worldX = this.camera.screenToWorldX(screenX);
            const worldY = this.camera.screenToWorldY(screenY);
            this.onDragStartCallback(worldX, worldY);
        }
    }

    onMouseMove(e) {
        if (this.isDragging) {
            const dx = e.clientX - this.lastMouseX;
            const dy = e.clientY - this.lastMouseY;

            // Check if we've moved enough to be considered a drag
            const totalDx = e.clientX - this.mouseDownX;
            const totalDy = e.clientY - this.mouseDownY;
            if (Math.abs(totalDx) > this.clickThreshold || Math.abs(totalDy) > this.clickThreshold) {
                this.hasMoved = true;
            }

            // Only pan if panning is enabled
            if (this.panningEnabled) {
                this.camera.pan(-dx, -dy);
            }

            // Fire drag move callback
            if (this.onDragMoveCallback) {
                const rect = this.canvas.getBoundingClientRect();
                const screenX = e.clientX - rect.left;
                const screenY = e.clientY - rect.top;
                const worldX = this.camera.screenToWorldX(screenX);
                const worldY = this.camera.screenToWorldY(screenY);
                this.onDragMoveCallback(worldX, worldY);
            }

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        }
    }

    onMouseUp(e) {
        if (this.isDragging && !this.hasMoved && this.onClickCallback) {
            const rect = this.canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const worldX = this.camera.screenToWorldX(screenX);
            const worldY = this.camera.screenToWorldY(screenY);
            this.onClickCallback(worldX, worldY);
        }

        // Fire drag end callback
        if (this.isDragging && this.onDragEndCallback) {
            const rect = this.canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const worldX = this.camera.screenToWorldX(screenX);
            const worldY = this.camera.screenToWorldY(screenY);
            this.onDragEndCallback(worldX, worldY, this.hasMoved);
        }

        this.isDragging = false;
        this.hasMoved = false;
    }

    onWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        this.camera.zoomBy(-e.deltaY, mouseX, mouseY);
    }

    onTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
            this.touchHasMoved = false;

            // Fire drag start callback
            if (this.onDragStartCallback) {
                const rect = this.canvas.getBoundingClientRect();
                const screenX = this.touchStartX - rect.left;
                const screenY = this.touchStartY - rect.top;
                const worldX = this.camera.screenToWorldX(screenX);
                const worldY = this.camera.screenToWorldY(screenY);
                this.onDragStartCallback(worldX, worldY);
            }
        }
        this.updateTouches(e);
    }

    onTouchMove(e) {
        e.preventDefault();
        const newTouches = Array.from(e.touches);

        if (newTouches.length === 1 && this.touches.length === 1) {
            // Single finger drag (pan)
            const dx = newTouches[0].clientX - this.touches[0].clientX;
            const dy = newTouches[0].clientY - this.touches[0].clientY;

            // Check if moved enough to be a drag
            const totalDx = newTouches[0].clientX - this.touchStartX;
            const totalDy = newTouches[0].clientY - this.touchStartY;
            if (Math.abs(totalDx) > this.clickThreshold || Math.abs(totalDy) > this.clickThreshold) {
                this.touchHasMoved = true;
            }

            // Only pan if panning is enabled
            if (this.panningEnabled) {
                this.camera.pan(-dx, -dy);
            }

            // Fire drag move callback
            if (this.onDragMoveCallback) {
                const rect = this.canvas.getBoundingClientRect();
                const screenX = newTouches[0].clientX - rect.left;
                const screenY = newTouches[0].clientY - rect.top;
                const worldX = this.camera.screenToWorldX(screenX);
                const worldY = this.camera.screenToWorldY(screenY);
                this.onDragMoveCallback(worldX, worldY);
            }
        } else if (newTouches.length === 2 && this.touches.length === 2) {
            // Two finger pinch (zoom)
            this.touchHasMoved = true;
            const rect = this.canvas.getBoundingClientRect();

            // Calculate current pinch distance
            const currentDistance = this.getPinchDistance(newTouches);

            // Calculate pinch center
            const centerX = ((newTouches[0].clientX + newTouches[1].clientX) / 2) - rect.left;
            const centerY = ((newTouches[0].clientY + newTouches[1].clientY) / 2) - rect.top;

            if (this.lastPinchDistance > 0) {
                const scale = currentDistance / this.lastPinchDistance;
                this.camera.setZoom(this.camera.zoom * scale, centerX, centerY);
            }

            this.lastPinchDistance = currentDistance;
        }

        this.updateTouches(e);
    }

    onTouchEnd(e) {
        e.preventDefault();

        // Check for tap (single touch that didn't move)
        if (this.touches.length === 1 && e.touches.length === 0 && !this.touchHasMoved && this.onClickCallback) {
            const rect = this.canvas.getBoundingClientRect();
            const screenX = this.touchStartX - rect.left;
            const screenY = this.touchStartY - rect.top;
            const worldX = this.camera.screenToWorldX(screenX);
            const worldY = this.camera.screenToWorldY(screenY);
            this.onClickCallback(worldX, worldY);
        }

        // Fire drag end callback
        if (this.touches.length === 1 && e.touches.length === 0 && this.onDragEndCallback) {
            const rect = this.canvas.getBoundingClientRect();
            const screenX = this.touchStartX - rect.left;
            const screenY = this.touchStartY - rect.top;
            const worldX = this.camera.screenToWorldX(screenX);
            const worldY = this.camera.screenToWorldY(screenY);
            this.onDragEndCallback(worldX, worldY, this.touchHasMoved);
        }

        this.updateTouches(e);
        this.lastPinchDistance = 0;
        this.touchHasMoved = false;
    }

    updateTouches(e) {
        this.touches = Array.from(e.touches);
    }

    getPinchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    update(deltaTime) {
        // Handle keyboard panning
        const deltaSeconds = deltaTime / 1000;
        const panDistance = this.panSpeed * deltaSeconds;

        let dx = 0;
        let dy = 0;

        if (this.keys['w'] || this.keys['arrowup']) dy -= panDistance;
        if (this.keys['s'] || this.keys['arrowdown']) dy += panDistance;
        if (this.keys['a'] || this.keys['arrowleft']) dx -= panDistance;
        if (this.keys['d'] || this.keys['arrowright']) dx += panDistance;

        if (dx !== 0 || dy !== 0) {
            this.camera.pan(dx, dy);
        }
    }

    isKeyDown(key) {
        return this.keys[key.toLowerCase()] === true;
    }
}
