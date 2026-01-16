export class TileOverlayManager {
    constructor(tilemap) {
        this.tilemap = tilemap;
        this.overlays = new Map(); // Key: "x,y", Value: overlay object
    }

    addOverlay(tileX, tileY, tileId, offsetY = 0) {
        const key = `${tileX},${tileY}`;
        const overlay = {
            tileX: tileX,
            tileY: tileY,
            tileId: tileId,
            offsetY: offsetY
        };
        this.overlays.set(key, overlay);
        console.log(`Overlay added at (${tileX}, ${tileY}): tile ${tileId}`);
    }

    removeOverlay(tileX, tileY) {
        const key = `${tileX},${tileY}`;
        if (this.overlays.has(key)) {
            this.overlays.delete(key);
            console.log(`Overlay removed at (${tileX}, ${tileY})`);
            return true;
        }
        return false;
    }

    hasOverlay(tileX, tileY) {
        const key = `${tileX},${tileY}`;
        return this.overlays.has(key);
    }

    getOverlay(tileX, tileY) {
        const key = `${tileX},${tileY}`;
        return this.overlays.get(key) || null;
    }

    clearAllOverlays() {
        this.overlays.clear();
    }

    render(ctx, camera) {
        if (this.overlays.size === 0) return;

        const tileSize = this.tilemap.tileSize;

        // Get visible bounds for culling
        const bounds = camera.getVisibleBounds();
        const startCol = Math.max(0, Math.floor(bounds.left / tileSize) - 1);
        const endCol = Math.min(this.tilemap.mapWidth - 1, Math.ceil(bounds.right / tileSize) + 1);
        const startRow = Math.max(0, Math.floor(bounds.top / tileSize) - 1);
        const endRow = Math.min(this.tilemap.mapHeight - 1, Math.ceil(bounds.bottom / tileSize) + 1);

        // Render only visible overlays
        for (const overlay of this.overlays.values()) {
            // Check if overlay is visible
            if (overlay.tileX < startCol || overlay.tileX > endCol ||
                overlay.tileY < startRow || overlay.tileY > endRow) {
                continue;
            }

            const sourceRect = this.tilemap.getTilesetSourceRect(overlay.tileId);
            const worldX = overlay.tileX * tileSize;
            const worldY = (overlay.tileY + overlay.offsetY) * tileSize;

            ctx.drawImage(
                this.tilemap.tilesetImage,
                sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                worldX, worldY, tileSize, tileSize
            );
        }
    }

    getOverlayCount() {
        return this.overlays.size;
    }
}
