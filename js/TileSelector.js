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
    // Plant tool works on hoed ground (auto-digs the hole) or an existing open hole
    plant: {
        requiresPlantableTile: true
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
    },
    // Path tool works on grass or hoed-ground tiles in owned or town chunks
    path: {
        validTileIds: new Set([...CONFIG.tiles.grass, ...CONFIG.tiles.hoedGround])
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
        this.game = null;

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

        // Per-drag acceptability cache: key "x,y" → { valid, enemy }
        // Cleared at the start of each drag and on tool change.
        this._acceptabilityCache = new Map();

        // Zone expansion mode: when true, drag end adds tiles to an existing zone
        // instead of creating a job. Set by Game._initZonePanel() expand button.
        this.zoneExpansionMode = false;
        this.zoneExpansionTargetId = null;
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

    setGame(game) {
        this.game = game;
    }

    setTool(tool) {
        this.currentTool = tool;
        this._acceptabilityCache.clear();
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
                    const baseTiles = [
                        { x: ore.tileX, y: ore.tileY + 1 },     // bottom-left
                        { x: ore.tileX + 1, y: ore.tileY + 1 }  // bottom-right
                    ];
                    // All 4 tiles must be in owned chunks (vein can span chunk boundary)
                    const allOreTiles = [
                        { x: ore.tileX,     y: ore.tileY     },
                        { x: ore.tileX + 1, y: ore.tileY     },
                        { x: ore.tileX,     y: ore.tileY + 1 },
                        { x: ore.tileX + 1, y: ore.tileY + 1 }
                    ];
                    if (!this._allTilesOwned(allOreTiles)) return null;
                    return { object: ore, type: 'ore', baseTiles };
                }
            }
            // Check forest pocket ore
            if (this.forestGenerator) {
                const forestOre = this.forestGenerator.getPocketOreAt(tileX, tileY);
                if (forestOre && forestOre.canBeMined()) {
                    const baseTiles = [
                        { x: forestOre.tileX, y: forestOre.tileY + 1 },
                        { x: forestOre.tileX + 1, y: forestOre.tileY + 1 }
                    ];
                    const allOreTiles = [
                        { x: forestOre.tileX,     y: forestOre.tileY     },
                        { x: forestOre.tileX + 1, y: forestOre.tileY     },
                        { x: forestOre.tileX,     y: forestOre.tileY + 1 },
                        { x: forestOre.tileX + 1, y: forestOre.tileY + 1 }
                    ];
                    if (!this._allTilesOwned(allOreTiles)) return null;
                    return { object: forestOre, type: 'forestOre', baseTiles };
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
                // All base tiles must be in owned chunks (wide tree can span chunk boundary)
                if (!this._allTilesOwned(baseTiles)) return null;
                return { object: tree, type: 'tree', baseTiles };
            }
        }

        // Check for forest tree (2 tiles wide, trunk row is the target)
        if (toolRules.requiresTree && this.forestGenerator) {
            const forestTree = this.forestGenerator.getTreeAt(tileX, tileY);
            if (forestTree && forestTree.canBeChopped()) {
                // Forest tree trunk tiles (both tiles in the trunk row)
                const baseTiles = forestTree.getTrunkTilePositions();
                // All trunk tiles must be in owned chunks (2-wide tree can span chunk boundary)
                if (!this._allTilesOwned(baseTiles)) return null;
                return { object: forestTree, type: 'forestTree', baseTiles };
            }
        }

        // Check for player-placed path tile (pickaxe removal — single tile)
        if (toolRules.requiresOre && this.game?.playerPlacedPaths?.has(`${tileX},${tileY}`)) {
            return {
                object: { tileX, tileY },
                type: 'removePath',
                baseTiles: [{ x: tileX, y: tileY }]
            };
        }

        return null;
    }

    // Check if a tile is a base tile of a multi-tile object
    isBaseTileOf(tileX, tileY, multiTileInfo) {
        if (!multiTileInfo) return false;
        return multiTileInfo.baseTiles.some(bt => bt.x === tileX && bt.y === tileY);
    }

    /** Returns true if every tile in the array is in an accessible (owned or town) chunk. */
    _allTilesOwned(tiles) {
        if (!this.chunkManager) return true;
        return tiles.every(t =>
            this.chunkManager.isPlayerOwned(t.x, t.y) ||
            this.chunkManager.isTownChunk(t.x, t.y)
        );
    }

    /** Returns a choppable tree from either treeManager or forestGenerator, or null. */
    _getChoppableTreeAt(tileX, tileY) {
        if (this.treeManager) {
            const t = this.treeManager.getTreeAt(tileX, tileY);
            if (t && t.canBeChopped()) return t;
        }
        if (this.forestGenerator) {
            const t = this.forestGenerator.getTreeAt(tileX, tileY);
            if (t && t.canBeChopped()) return t;
        }
        return null;
    }

    setOverlayManager(overlayManager) {
        this.overlayManager = overlayManager;
    }

    startSelection(worldX, worldY) {
        if (!this.currentTool && !this.zoneExpansionMode) return;

        this._acceptabilityCache.clear();

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

        // Zone expansion mode: accept all tiles without tool-based validation
        if (this.zoneExpansionMode) {
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    this.selectedTiles.push({ x, y, tileId: this.tilemap.getTileAt(x, y), valid: true });
                }
            }
            return;
        }

        // Path tool: compute a 1-tile-wide L-shape from start to end
        // (vertical segment first, then horizontal segment at end row)
        if (this.currentTool && this.currentTool.id === 'path') {
            const addTile = (x, y) => {
                const tileId = this.tilemap.getTileAt(x, y);
                this.selectedTiles.push({ x, y, tileId, valid: this.isAcceptableTile(x, y, tileId) });
            };
            const stepY = this.endTileY >= this.startTileY ? 1 : -1;
            for (let y = this.startTileY; y !== this.endTileY + stepY; y += stepY) {
                addTile(this.startTileX, y);
            }
            if (this.endTileX !== this.startTileX) {
                const stepX = this.endTileX > this.startTileX ? 1 : -1;
                for (let x = this.startTileX + stepX; x !== this.endTileX + stepX; x += stepX) {
                    addTile(x, this.endTileY);
                }
            }
            return;
        }

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
        const key = `${tileX},${tileY}`;
        if (this._acceptabilityCache.has(key)) {
            const cached = this._acceptabilityCache.get(key);
            if (cached.enemy) this._lastFoundEnemy = cached.enemy;
            return cached.valid;
        }
        this._lastFoundEnemy = null;
        const valid = this._computeAcceptableTile(tileX, tileY, tileId);
        this._acceptabilityCache.set(key, { valid, enemy: this._lastFoundEnemy });
        return valid;
    }

    _computeAcceptableTile(tileX, tileY, tileId) {
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
                if (this.currentTool.id === 'sword') {
                    // Sword always allowed everywhere
                } else if (this.currentTool.id === 'shovel' && this.chunkManager.isTownChunk(tileX, tileY)) {
                    // Town chunk: shovel only allowed on weeds
                    const isWeed = this.flowerManager && this.flowerManager.getWeedAt(tileX, tileY) != null;
                    if (!isWeed) return false;
                } else if (this.currentTool.id === 'path' && this.chunkManager.isTownChunk(tileX, tileY)) {
                    // Town chunk: path tool allowed on non-owned town chunks
                } else if ((this.currentTool.id === 'axe' || this.currentTool.id === 'pickaxe') && this.chunkManager.isTownChunk(tileX, tileY)) {
                    // Town chunk: allow gathering tools so player can clear purchased town chunks
                } else {
                    return false;
                }
            }
        }

        const toolRules = ACCEPTABLE_TILES[this.currentTool.id];
        if (!toolRules) {
            // No rules defined - allow all tiles
            return true;
        }

        // Special handling for plant tool - requires hoed ground (auto-digs) or an existing open hole
        if (toolRules.requiresPlantableTile) {
            // Can't plant where there's already a crop (base tile only — top sprite tiles are visual only)
            if (this.cropManager && this.cropManager.getCropBaseAt(tileX, tileY)) return false;
            // Allow tiles that already have a hole overlay (manually dug with shovel)
            if (this.overlayManager && this.overlayManager.hasOverlay(tileX, tileY, CONFIG.tiles.holeOverlay)) return true;
            // Allow hoed ground tiles (the dig will happen automatically during planting)
            const actualTileId = tileId !== null ? tileId : (this.forestGenerator?.getGrassTileAt(tileX, tileY) ?? null);
            if (actualTileId !== null && CONFIG.tiles.hoedGround.includes(actualTileId)) {
                // Verify the tile is tracked as hoed (not just a coincidentally matching tile ID)
                if (this.overlayManager?.hoedTiles) {
                    return this.overlayManager.hoedTiles.has(`${tileX},${tileY}`);
                }
                return true;
            }
            return false;
        }

        // Special handling for watering can - requires planted crop that needs water now
        if (toolRules.requiresPlantedCrop) {
            if (!this.cropManager) return false;
            const crop = this.cropManager.getCropAt(tileX, tileY);
            if (!crop || crop.isHarvested || crop.isGone) return false;
            // Only highlight tiles where the crop is in 'needs_water' state
            // (not in cooldown and not already growing)
            return crop.wateringState === 'needs_water';
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

        // Special handling for pickaxe - requires mineable ore vein OR player-placed path tile
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
            // Check player-placed path tiles (pickaxe can remove them to recover stone)
            if (this.game?.playerPlacedPaths?.has(`${tileX},${tileY}`)) return true;
            return false;
        }

        // Special handling for axe - requires choppable tree at tile (regular or forest)
        if (toolRules.requiresTree) {
            return this._getChoppableTreeAt(tileX, tileY) !== null;
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
            // Can only hoe in farmable areas: the main farm area, outside-tilemap forest grass,
            // or any player-owned chunk (e.g. purchased forest chunks).
            // The ownership gate above already ensures non-owned chunks are blocked.
            const inMainFarmableArea = this.tilemap.isInFarmableArea(tileX, tileY);
            const inForestGrass = this.forestGenerator && this.forestGenerator.isWalkable(tileX, tileY);
            const inOwnedChunk = this.chunkManager && this.chunkManager.isPlayerOwned(tileX, tileY);
            if (!inMainFarmableArea && !inForestGrass && !inOwnedChunk) {
                return false;
            }
            // Can't hoe the house/well/shed base area (x=15–29, y=34–42)
            // farmTop=34 (mainPathY+mainPathGap), path row y=42 — player can only hoe at y≥43
            if (tileX >= 15 && tileX <= 29 && tileY >= 34 && tileY <= 42) return false;
            // Can't hoe where there's a weed
            if (this.flowerManager && this.flowerManager.getWeedAt(tileX, tileY)) {
                return false;
            }
            // Can't hoe where there's a growing crop (base tile only — top sprite tiles are visual only)
            if (this.cropManager && this.cropManager.getCropBaseAt(tileX, tileY)) return false;
            if (this.forestGenerator && this.forestGenerator.getPocketCropAt(tileX, tileY)) return false;
            // Can't hoe on a tree trunk tile (crown and shadow rows are fine; only the trunk row blocks)
            if (this.forestGenerator && this.forestGenerator.isForestTreeTrunk(tileX, tileY)) return false;
            if (this.treeManager && this.treeManager.isTreeObstacle(tileX, tileY)) return false;
            // Can't hoe on the bottom tiles of an ore vein (those sit on the ground).
            // The top two tiles are "in the air" and don't block the ground beneath them.
            if (this.oreManager && this.oreManager.isOreObstacle(tileX, tileY)) return false;
            if (this.forestGenerator && this.forestGenerator.isPocketOreObstacle(tileX, tileY)) return false;
        }

        if (this.currentTool.id === 'shovel') {
            // Can't dig a hole where there's already a hole overlay
            if (this.overlayManager && this.overlayManager.hasOverlay(tileX, tileY)) {
                return false;
            }
            // Can't dig where there's a crop (base tile only — top sprite tiles are visual only)
            if (this.cropManager && this.cropManager.getCropBaseAt(tileX, tileY)) {
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
