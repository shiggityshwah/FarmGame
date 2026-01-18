import { TOOLS } from './Toolbar.js';

// Define which tiles are acceptable for each tool
const ACCEPTABLE_TILES = {
    // Hoe can work on grass tiles (NOT already hoed ground/dirt tiles)
    hoe: {
        // Grass tiles: 65, 66, 129, 130, 131, 132, 133, 134, 192, 193, 194, 195, 197, 199, 257, 258
        // Exclude dirt tiles: 67, 449, 457, 458, 459, 521, 522
        validTileIds: new Set([
            65, 66, 129, 130, 131, 132, 133, 134, 192, 193, 194, 195, 197, 199, 257, 258
        ])
    },
    // Shovel can work on hoed ground (all dirt tiles) that doesn't already have a hole
    shovel: {
        // Dirt tiles: 67, 449, 457, 458, 459, 521, 522
        validTileIds: new Set([67, 449, 457, 458, 459, 521, 522]),
        // Also need to check overlay for holes - handled in isAcceptableTile
        checkOverlay: true
    },
    // Plant tool works on open holes (overlay tile 1138)
    plant: {
        // Requires hole overlay check, not base tile check
        requiresHoleOverlay: true
    },
    // Watering can works on closed dry holes (tile ID 818) that have an unwatered planted crop
    watering_can: {
        // Requires planted crop check - handled in isAcceptableTile
        requiresPlantedCrop: true
    },
    // Sword targets enemies
    sword: {
        // Requires enemy check - handled in isAcceptableTile
        requiresEnemy: true
    },
    // Pickaxe targets ore veins
    pickaxe: {
        // Requires ore vein check - handled in isAcceptableTile
        requiresOre: true
    },
    // Axe targets trees
    axe: {
        // Requires tree check - handled in isAcceptableTile
        requiresTree: true
    }
};

export class TileSelector {
    constructor(tilemap, camera, overlayManager = null, cropManager = null) {
        this.tilemap = tilemap;
        this.camera = camera;
        this.overlayManager = overlayManager;
        this.cropManager = cropManager;
        this.enemyManager = null;
        this.oreManager = null;
        this.treeManager = null;

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

    setCropManager(cropManager) {
        this.cropManager = cropManager;
    }

    setEnemyManager(enemyManager) {
        this.enemyManager = enemyManager;
    }

    setOreManager(oreManager) {
        this.oreManager = oreManager;
    }

    setTreeManager(treeManager) {
        this.treeManager = treeManager;
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

        // Special handling for plant tool - requires open hole overlay (tile ID 1138)
        if (toolRules.requiresHoleOverlay) {
            if (!this.overlayManager) return false;
            const overlay = this.overlayManager.getOverlay(tileX, tileY);
            // Open hole is tile ID 1138
            if (!overlay || overlay.tileId !== 1138) return false;
            // Also check there's no crop already planted here
            if (this.cropManager && this.cropManager.getCropAt(tileX, tileY)) return false;
            return true;
        }

        // Special handling for watering can - requires planted crop that needs water
        if (toolRules.requiresPlantedCrop) {
            if (!this.cropManager) return false;
            const crop = this.cropManager.getCropAt(tileX, tileY);
            // Check if there's a planted crop that needs watering
            if (!crop || crop.isHarvested) return false;
            // Check if crop needs watering (not already watered)
            if (crop.isWatered) return false;
            return true;
        }

        // Special handling for sword - requires alive enemy at tile
        if (toolRules.requiresEnemy) {
            if (!this.enemyManager) return false;
            const enemy = this.enemyManager.getEnemyAt(tileX, tileY);
            // Check if there's an alive enemy at this tile
            if (!enemy || !enemy.isAlive) return false;
            return true;
        }

        // Special handling for pickaxe - requires mineable ore vein at tile
        if (toolRules.requiresOre) {
            if (!this.oreManager) return false;
            const ore = this.oreManager.getOreAt(tileX, tileY);
            // Check if there's a mineable ore at this tile
            if (!ore || !ore.canBeMined()) return false;
            return true;
        }

        // Special handling for axe - requires choppable tree at tile
        if (toolRules.requiresTree) {
            if (!this.treeManager) return false;
            const tree = this.treeManager.getTreeAt(tileX, tileY);
            // Check if there's a choppable tree at this tile
            if (!tree || !tree.canBeChopped()) return false;
            return true;
        }

        // Check if tile ID is valid for this tool
        if (toolRules.validTileIds && !toolRules.validTileIds.has(tileId)) {
            return false;
        }

        // Additional checks to prevent redoing the same action
        if (this.currentTool.id === 'shovel') {
            // Can't dig a hole where there's already a hole overlay
            if (this.overlayManager && this.overlayManager.hasOverlay(tileX, tileY)) {
                return false;
            }
            // Can't dig where there's a crop
            if (this.cropManager && this.cropManager.getCropAt(tileX, tileY)) {
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
