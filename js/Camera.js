export class Camera {
    constructor(canvasWidth, canvasHeight) {
        this.x = 0;
        this.y = 0;
        this.zoom = 2;
        this.minZoom = 0.5;
        this.maxZoom = 4;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.dpr = window.devicePixelRatio || 1;
    }

    updateCanvasSize(width, height) {
        this.canvasWidth = width;
        this.canvasHeight = height;
    }

    pan(dx, dy) {
        this.x += dx / this.zoom;
        this.y += dy / this.zoom;
    }

    setZoom(newZoom, centerX, centerY) {
        // Convert center point to world coordinates before zoom
        const worldX = this.screenToWorldX(centerX);
        const worldY = this.screenToWorldY(centerY);

        // Clamp zoom to valid range
        const oldZoom = this.zoom;
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));

        // Adjust camera position to keep the center point stationary
        if (oldZoom !== this.zoom) {
            const newWorldX = this.screenToWorldX(centerX);
            const newWorldY = this.screenToWorldY(centerY);
            this.x += worldX - newWorldX;
            this.y += worldY - newWorldY;
        }
    }

    zoomBy(delta, centerX, centerY) {
        const zoomFactor = delta > 0 ? 1.1 : 0.9;
        this.setZoom(this.zoom * zoomFactor, centerX, centerY);
    }

    worldToScreenX(worldX) {
        return (worldX - this.x) * this.zoom + this.canvasWidth / 2;
    }

    worldToScreenY(worldY) {
        return (worldY - this.y) * this.zoom + this.canvasHeight / 2;
    }

    screenToWorldX(screenX) {
        return (screenX - this.canvasWidth / 2) / this.zoom + this.x;
    }

    screenToWorldY(screenY) {
        return (screenY - this.canvasHeight / 2) / this.zoom + this.y;
    }

    // Apply camera transformation to canvas context
    applyTransform(ctx) {
        // Reset and apply DPR scaling first
        this.dpr = window.devicePixelRatio || 1;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.translate(this.canvasWidth / 2, this.canvasHeight / 2);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-this.x, -this.y);
    }

    // Get visible world bounds (for culling)
    getVisibleBounds() {
        const halfWidth = (this.canvasWidth / 2) / this.zoom;
        const halfHeight = (this.canvasHeight / 2) / this.zoom;

        return {
            left: this.x - halfWidth,
            right: this.x + halfWidth,
            top: this.y - halfHeight,
            bottom: this.y + halfHeight
        };
    }
}
