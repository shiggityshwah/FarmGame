import { TOOLS } from './Toolbar.js';

// Define which tiles are acceptable for each tool
const ACCEPTABLE_TILES = {
    // Hoe can work on grass/dirt tiles (NOT already hoed ground - tile 67)
    hoe: {
        // Include common grass and dirt tile IDs from the tileset
        // These are typical ground tiles - may need adjustment based on actual tileset
        validTileIds: new Set([
            // Row 0-3 grass variations (excluding 67 which is hoed ground)
            0, 1, 2, 3, 64, 65, 66, 128, 129, 130, 131, 192, 193, 194, 195,
            // Additional grass tiles
            4, 5, 6, 68, 69, 70, 132, 133, 134, 196, 197, 198,
            // Light grass
            256, 257, 258, 259, 320, 321, 322, 323
        ])
    },
    // Shovel can only work on hoed ground (tile 67) that doesn't already have a hole
    shovel: {
        validTileIds: new Set([67])
    }
};

export class TileSelector {
    constructor(tilemap, camera, overlayManager = null) {
        this.tilemap = tilemap;
        this.camera = camera;
        this.overlayManager = overlayManager;

        // Selection state
        this.isSelecting = false;
        this.startTileX = 0;
        this.startTileY = 0;
        this.endTileX = 0;
        this.endTileY = 0;
        this.selectedTiles = [];

        // Current tool for validation
        this.currentTool = null;

        // Visual settings
        this.highlightColor = 'rgba(255, 255, 0, 0.4)';
        this.invalidColor = 'rgba(255, 0, 0, 0.3)';
    }

    setTool(tool) {
        this.currentTool = tool;
    }

    setOverlayManager(overlayManager) {
        this.overlayManager = overlayManager;
    }

    startSelection(worldX, worldY) {
        if (!this.currentTool) return;

        const tileX = Math.floor(worldX / this.tilemap.tileSize);
        const tileY = Math.floor(worldY / this.tilemap.tileSize);

        this.isSelecting = true;
        this.startTileX = tileX;
        this.startTileY = tileY;
        this.endTileX = tileX;
        this.endTileY = tileY;

        this.updateSelectedTiles();
    }

    updateSelection(worldX, worldY) {
        if (!this.isSelecting) return;

        const tileX = Math.floor(worldX / this.tilemap.tileSize);
        const tileY = Math.floor(worldY / this.tilemap.tileSize);

        this.endTileX = tileX;
        this.endTileY = tileY;

        this.updateSelectedTiles();
    }

    updateSelectedTiles() {
        this.selectedTiles = [];

        const minX = Math.min(this.startTileX, this.endTileX);
        const maxX = Math.max(this.startTileX, this.endTileX);
        const minY = Math.min(this.startTileY, this.endTileY);
        const maxY = Math.max(this.startTileY, this.endTileY);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const tileId = this.tilemap.getTileAt(x, y);
                const isValid = this.isAcceptableTile(x, y, tileId);
                this.selectedTiles.push({
                    x: x,
                    y: y,
                    tileId: tileId,
                    valid: isValid
                });
            }
        }
    }

    isAcceptableTile(tileX, tileY, tileId) {
        if (tileId === null) return false;
        if (!this.currentTool) return false;

        const toolRules = ACCEPTABLE_TILES[this.currentTool.id];
        if (!toolRules) {
            // No rules defined - allow all tiles
            return true;
        }

        // Check if tile ID is valid for this tool
        if (!toolRules.validTileIds.has(tileId)) {
            return false;
        }

        // Additional checks to prevent redoing the same action
        if (this.currentTool.id === 'shovel') {
            // Can't dig a hole where there's already a hole overlay
            if (this.overlayManager && this.overlayManager.hasOverlay(tileX, tileY)) {
                return false;
            }
        }

        return true;
    }

    endSelection() {
        this.isSelecting = false;

        // Return only valid tiles
        const validTiles = this.selectedTiles.filter(t => t.valid);
        return validTiles.map(t => ({ x: t.x, y: t.y }));
    }

    cancelSelection() {
        this.isSelecting = false;
        this.selectedTiles = [];
    }

    clearSelection() {
        this.selectedTiles = [];
    }

    getSelectedTiles() {
        return this.selectedTiles.filter(t => t.valid).map(t => ({ x: t.x, y: t.y }));
    }

    render(ctx, camera) {
        if (this.selectedTiles.length === 0) return;

        const tileSize = this.tilemap.tileSize;

        for (const tile of this.selectedTiles) {
            const worldX = tile.x * tileSize;
            const worldY = tile.y * tileSize;

            // Choose color based on validity
            ctx.fillStyle = tile.valid ? this.highlightColor : this.invalidColor;
            ctx.fillRect(worldX, worldY, tileSize, tileSize);

            // Draw border
            ctx.strokeStyle = tile.valid ? 'rgba(255, 255, 0, 0.8)' : 'rgba(255, 0, 0, 0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(worldX + 0.5, worldY + 0.5, tileSize - 1, tileSize - 1);
        }
    }
}

// Export the acceptable tiles for external use (e.g., adding hoed tiles dynamically)
export { ACCEPTABLE_TILES };
