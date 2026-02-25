import { TOOLS } from './Toolbar.js';
import { CONFIG } from './config.js';
import { worldToTile } from './TileUtils.js';

// Define which tiles are acceptable for each tool.
// validTileIds are derived from CONFIG so there is a single source of truth.
const ACCEPTABLE_TILES = {
    // Hoe can work on grass tiles (NOT already hoed ground/dirt tiles)
    hoe: {
        validTileIds: new Set(CONFIG.tiles.grass)
    },
    // Shovel can work on hoed ground (all dirt tiles) that doesn't already have a hole
    shovel: {
        validTileIds: new Set(CONFIG.tiles.hoedGround),
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
    // Pickaxe targets ore veins (requires selecting base tiles of multi-tile ore)
    pickaxe: {
        // Requires ore vein check - handled in isAcceptableTile
        requiresOre: true,
        // Multi-tile object - must select base tiles
        isMultiTile: true
    },
    // Axe targets trees (requires selecting base tiles of multi-tile tree)
    axe: {
        // Requires tree check - handled in isAcceptableTile
        requiresTree: true,
        // Multi-tile object - must select base tiles
        isMultiTile: true
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
        this.flowerManager = null;
        this.forestGenerator = null;
        this.chunkManager = null;

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

    setFlowerManager(flowerManager) {
        this.flowerManager = flowerManager;
    }

    setForestGenerator(forestGenerator) {
        this.forestGenerator = forestGenerator;
    }

    setChunkManager(chunkManager) {
        this.chunkManager = chunkManager;
    }

    setTool(tool) {
        this.currentTool = tool;
    }

    // Get the multi-tile object at a tile position and its base tile positions
    // Returns { object, baseTiles: [{x, y}] } or null if no multi-tile object
    getMultiTileObjectAt(tileX, tileY) {
        if (!this.currentTool) return null;

        const toolRules = ACCEPTABLE_TILES[this.currentTool.id];
        if (!toolRules || !toolRules.isMultiTile) return null;

        // Check for ore vein (2x2, base tiles are bottom two)
        if (toolRules.requiresOre) {
            // Check main tilemap ore first
            if (this.oreManager) {
                const ore = this.oreManager.getOreAt(tileX, tileY);
                if (ore && ore.canBeMined()) {
                    // Ore base tiles are the bottom row (tileY + 1)
                    return {
                        object: ore,
                        type: 'ore',
                        baseTiles: [
                            { x: ore.tileX, y: ore.tileY + 1 },     // bottom-left
                            { x: ore.tileX + 1, y: ore.tileY + 1 }  // bottom-right
                        ]
                    };
                }
            }
            // Check forest pocket ore
            if (this.forestGenerator) {
                const forestOre = this.forestGenerator.getPocketOreAt(tileX, tileY);
                if (forestOre && forestOre.canBeMined()) {
                    return {
                        object: forestOre,
                        type: 'forestOre',
                        baseTiles: [
                            { x: forestOre.tileX, y: forestOre.tileY + 1 },
                            { x: forestOre.tileX + 1, y: forestOre.tileY + 1 }
                        ]
                    };
                }
            }
        }

        // Check for tree (variable width, base tiles are the bottom row)
        if (toolRules.requiresTree && this.treeManager) {
            const tree = this.treeManager.getTreeAt(tileX, tileY);
            if (tree && tree.canBeChopped()) {
                // Tree base tiles are the bottom row at tree.tileY
                const baseTiles = [];
                for (let x = 0; x < tree.treeType.width; x++) {
                    baseTiles.push({ x: tree.tileX + x, y: tree.tileY });
                }
                return {
                    object: tree,
                    type: 'tree',
                    baseTiles: baseTiles
                };
            }
        }

        // Check for forest tree (2 tiles wide, trunk row is the target)
        if (toolRules.requiresTree && this.forestGenerator) {
            const forestTree = this.forestGenerator.getTreeAt(tileX, tileY);
            if (forestTree && forestTree.canBeChopped()) {
                // Forest tree trunk tiles (both tiles in the trunk row)
                return {
                    object: forestTree,
                    type: 'forestTree',
                    baseTiles: forestTree.getTrunkTilePositions()
                };
            }
        }

        return null;
    }

    // Check if a tile is a base tile of a multi-tile object
    isBaseTileOf(tileX, tileY, multiTileInfo) {
        if (!multiTileInfo) return false;
        return multiTileInfo.baseTiles.some(bt => bt.x === tileX && bt.y === tileY);
    }

    setOverlayManager(overlayManager) {
        this.overlayManager = overlayManager;
    }

    startSelection(worldX, worldY) {
        if (!this.currentTool) return;

        const tileX = worldToTile(worldX, this.tilemap.tileSize);
        const tileY = worldToTile(worldY, this.tilemap.tileSize);

        this.isSelecting = true;
        this.startTileX = tileX;
        this.startTileY = tileY;
        this.endTileX = tileX;
        this.endTileY = tileY;

        this.updateSelectedTiles();
    }

    updateSelection(worldX, worldY) {
        if (!this.isSelecting) return;

        const tileX = worldToTile(worldX, this.tilemap.tileSize);
        const tileY = worldToTile(worldY, this.tilemap.tileSize);

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

        // Check if current tool targets multi-tile objects
        const toolRules = this.currentTool ? ACCEPTABLE_TILES[this.currentTool.id] : null;
        const isMultiTileTool = toolRules && toolRules.isMultiTile;

        if (isMultiTileTool) {
            // For multi-tile tools, find all objects that have any tile in the selection
            // and expand to include all their base tiles
            this.updateSelectedTilesForMultiTile(minX, maxX, minY, maxY);
        } else {
            // Standard tile-by-tile selection for non-multi-tile tools
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    const tileId = this.tilemap.getTileAt(x, y);
                    this._lastFoundEnemy = null; // Reset before checking
                    const isValid = this.isAcceptableTile(x, y, tileId);
                    const tileData = {
                        x: x,
                        y: y,
                        tileId: tileId,
                        valid: isValid
                    };
                    // Include enemy reference for sword tool
                    if (this._lastFoundEnemy && isValid) {
                        tileData.targetEnemy = this._lastFoundEnemy;
                    }
                    this.selectedTiles.push(tileData);
                }
            }
        }
    }

    // Handle selection for multi-tile objects (ore veins, trees)
    // When any tile of an object is selected, expand to show all base tiles
    updateSelectedTilesForMultiTile(minX, maxX, minY, maxY) {
        // Track which multi-tile objects we've found (by their unique identifier)
        const foundObjects = new Map(); // key: "type_x_y" -> multiTileInfo

        // First pass: find all tiles in the selection rectangle
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const multiTileInfo = this.getMultiTileObjectAt(x, y);
                if (multiTileInfo) {
                    // Use object's origin as unique key
                    // Forest trees use baseX/baseY, regular trees use tileX/tileY
                    const obj = multiTileInfo.object;
                    const objX = obj.baseX !== undefined ? obj.baseX : obj.tileX;
                    const objY = obj.baseY !== undefined ? obj.baseY : obj.tileY;
                    const key = `${multiTileInfo.type}_${objX}_${objY}`;
                    if (!foundObjects.has(key)) {
                        foundObjects.set(key, multiTileInfo);
                    }
                }
            }
        }

        // Second pass: add all base tiles from found objects
        const addedTiles = new Set(); // Track tiles we've already added

        for (const [key, multiTileInfo] of foundObjects) {
            for (const baseTile of multiTileInfo.baseTiles) {
                const tileKey = `${baseTile.x},${baseTile.y}`;
                if (!addedTiles.has(tileKey)) {
                    addedTiles.add(tileKey);
                    const tileId = this.tilemap.getTileAt(baseTile.x, baseTile.y);
                    this.selectedTiles.push({
                        x: baseTile.x,
                        y: baseTile.y,
                        tileId: tileId,
                        valid: true, // Base tiles of valid objects are always valid
                        multiTileObject: multiTileInfo.object,
                        multiTileType: multiTileInfo.type
                    });
                }
            }
        }

        // Also add any tiles in the selection that DON'T belong to a multi-tile object
        // These will be shown as invalid (red) to indicate they can't be selected
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const tileKey = `${x},${y}`;
                if (!addedTiles.has(tileKey)) {
                    // Check if this tile is part of any multi-tile object
                    const multiTileInfo = this.getMultiTileObjectAt(x, y);
                    if (!multiTileInfo) {
                        // Not part of a multi-tile object - show as invalid
                        const tileId = this.tilemap.getTileAt(x, y);
                        this.selectedTiles.push({
                            x: x,
                            y: y,
                            tileId: tileId,
                            valid: false
                        });
                    }
                    // If it IS part of a multi-tile object but not a base tile,
                    // we don't add it (the base tiles were already added above)
                }
            }
        }
    }

    isAcceptableTile(tileX, tileY, tileId) {
        // For tiles outside main tilemap, check if forest has grass there
        if (tileId === null) {
            if (!this.forestGenerator || !this.forestGenerator.getGrassTileAt(tileX, tileY)) {
                return false;
            }
            // Forest tile - continue with validation
        }
        if (!this.currentTool) return false;

        // Chunk ownership gate: restrict tools based on chunk ownership
        if (this.chunkManager) {
            const owned = this.chunkManager.isPlayerOwned(tileX, tileY);

            if (!owned) {
                // Non-owned chunk (forest or town): sword always OK; shovel only to clear weeds
                if (this.currentTool.id !== 'sword') {
                    if (this.currentTool.id === 'shovel') {
                        const isWeed = this.flowerManager && this.flowerManager.getWeedAt(tileX, tileY) != null;
                        if (!isWeed) return false;
                    } else {
                        return false;
                    }
                }
            }
        }

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
            // Store enemy reference for later use
            this._lastFoundEnemy = enemy;
            return true;
        }

        // Special handling for pickaxe - requires mineable ore vein at tile
        if (toolRules.requiresOre) {
            // Check main tilemap ore
            if (this.oreManager) {
                const ore = this.oreManager.getOreAt(tileX, tileY);
                if (ore && ore.canBeMined()) return true;
            }
            // Check forest pocket ore
            if (this.forestGenerator) {
                const forestOre = this.forestGenerator.getPocketOreAt(tileX, tileY);
                if (forestOre && forestOre.canBeMined()) return true;
            }
            return false;
        }

        // Special handling for axe - requires choppable tree at tile (regular or forest)
        if (toolRules.requiresTree) {
            // Check regular trees
            if (this.treeManager) {
                const tree = this.treeManager.getTreeAt(tileX, tileY);
                if (tree && tree.canBeChopped()) return true;
            }
            // Check forest trees
            if (this.forestGenerator) {
                const forestTree = this.forestGenerator.getTreeAt(tileX, tileY);
                if (forestTree && forestTree.canBeChopped()) return true;
            }
            return false;
        }

        // Check if tile ID is valid for this tool
        if (toolRules.validTileIds) {
            // Check main tilemap tile
            if (tileId !== null && toolRules.validTileIds.has(tileId)) {
                // Valid tile in main tilemap
            } else if (this.forestGenerator) {
                // Check forest grass tile
                const forestTileId = this.forestGenerator.getGrassTileAt(tileX, tileY);
                if (forestTileId === null || !toolRules.validTileIds.has(forestTileId)) {
                    return false;
                }
            } else {
                return false;
            }
        }

        // Additional checks to prevent redoing the same action
        if (this.currentTool.id === 'hoe') {
            // Can only hoe in farmable areas (procedural maps, grass area below buildings, or forest grass)
            const inMainFarmableArea = this.tilemap.isInFarmableArea(tileX, tileY);
            const inForestGrass = this.forestGenerator && this.forestGenerator.isWalkable(tileX, tileY);
            if (!inMainFarmableArea && !inForestGrass) {
                return false;
            }
            // Can't hoe where there's a weed
            if (this.flowerManager && this.flowerManager.getWeedAt(tileX, tileY)) {
                return false;
            }
            // Can't hoe on a tile occupied by an ore vein
            if (this.oreManager && this.oreManager.getOreAt(tileX, tileY)) return false;
            if (this.forestGenerator && this.forestGenerator.getPocketOreAt(tileX, tileY)) return false;
        }

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

        // Return only valid tiles, deduplicated for multi-tile objects
        return this.getDeduplicatedValidTiles();
    }

    // Get valid tiles, with multi-tile objects deduplicated to one tile per object
    // Includes multiTileBaseTiles array for multi-tile objects so the UI can show all base tiles
    getDeduplicatedValidTiles() {
        const validTiles = this.selectedTiles.filter(t => t.valid);

        // Check if current tool targets multi-tile objects
        const toolRules = this.currentTool ? ACCEPTABLE_TILES[this.currentTool.id] : null;
        const isMultiTileTool = toolRules && toolRules.isMultiTile;

        if (!isMultiTileTool) {
            // Standard tiles - return all valid tiles, including enemy reference if present
            return validTiles.map(t => {
                const result = { x: t.x, y: t.y };
                if (t.targetEnemy) {
                    result.targetEnemy = t.targetEnemy;
                }
                return result;
            });
        }

        // For multi-tile tools, return only one tile per unique object
        // This prevents the character from working on the same object multiple times
        // But include all base tiles info so the UI can display them all
        const seenObjects = new Set();
        const result = [];

        for (const tile of validTiles) {
            if (tile.multiTileObject) {
                // Create unique key for this object
                // Forest trees use baseX/baseY, regular trees use tileX/tileY
                const obj = tile.multiTileObject;
                const objX = obj.baseX !== undefined ? obj.baseX : obj.tileX;
                const objY = obj.baseY !== undefined ? obj.baseY : obj.tileY;
                const objKey = `${tile.multiTileType}_${objX}_${objY}`;
                if (!seenObjects.has(objKey)) {
                    seenObjects.add(objKey);
                    // Get all base tiles for this object
                    const multiTileInfo = this.getMultiTileObjectAt(tile.x, tile.y);
                    const baseTiles = multiTileInfo ? multiTileInfo.baseTiles : [{ x: tile.x, y: tile.y }];
                    // Return the first base tile, but include all base tiles for UI display
                    result.push({
                        x: tile.x,
                        y: tile.y,
                        multiTileBaseTiles: baseTiles,
                        multiTileType: tile.multiTileType
                    });
                }
            } else {
                // Non-multi-tile valid tile (shouldn't happen for multi-tile tools, but handle gracefully)
                result.push({ x: tile.x, y: tile.y });
            }
        }

        return result;
    }

    cancelSelection() {
        this.isSelecting = false;
        this.selectedTiles = [];
    }

    clearSelection() {
        this.selectedTiles = [];
    }

    getSelectedTiles() {
        return this.getDeduplicatedValidTiles();
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
