/**
 * ForestGenerator - Procedural forest generation system
 *
 * Generates decorative forest trees around the tilemap using a diamond grid pattern.
 * Trees are 2 tiles wide x 3 tiles tall:
 *   - Top row: Crown (y = baseY - 1)
 *   - Middle row: Trunk (y = baseY) - base position, this is where player chops
 *   - Bottom row: Shadow (y = baseY + 1)
 *
 * Diamond grid placement rules:
 *   - Trees can only be placed at diagonal offsets from each other
 *   - If a tree has base at (x, y), adjacent trees can only be at:
 *     (x+1, y+1), (x+1, y-1), (x-1, y+1), (x-1, y-1)
 *   - This is achieved by only placing trees where (x + y) has the same parity
 *   - No horizontal or vertical adjacency allowed (minimum 2 tiles apart in cardinal directions)
 *
 * Pocket system:
 *   - Clearings within the forest that contain resources
 *   - Types: ore pockets (one ore type + stone), stone-only pockets, crop pockets
 *   - Players can cut through the forest to reach these pockets
 */

import { OreVein, ORE_TYPES } from './OreVein.js';
import { Crop, CROP_TYPES } from './Crop.js';
import { CONFIG } from './config.js';
import { Logger } from './Logger.js';

const log = Logger.create('ForestGenerator');

// Pocket types for forest clearings
export const POCKET_TYPES = {
    ORE: 'ore',           // One ore type + stone
    STONE: 'stone',       // Stone only
    CROP: 'crop',         // Single crop type
    ENEMY: 'enemy'        // Enemy skeleton spawns
};

// Tile IDs for forest trees (from tileset)
export const FOREST_TILES = {
    // Crown tiles (top row of tree, y = baseY - 1)
    CROWN: {
        LEFT_ISOLATED: 119,
        RIGHT_ISOLATED: 120,
        LEFT_WITH_TRUNK_TOP_LEFT: 184,
        RIGHT_WITH_TRUNK_TOP_RIGHT: 185,
        LEFT_WITH_TRUNK_TOP_LEFT_LIT: 115,
        RIGHT_WITH_TRUNK_TOP_RIGHT_LIT: 116
    },
    // Trunk tiles (middle row of tree, y = baseY)
    TRUNK: {
        LEFT_ISOLATED: 183,
        RIGHT_ISOLATED: 186,
        LEFT_WITH_SHADOW_TOP_LEFT: 443,
        RIGHT_WITH_SHADOW_TOP_RIGHT: 438,
        LEFT_WITH_CROWN_BOTTOM_LEFT: 185,
        RIGHT_WITH_CROWN_BOTTOM_RIGHT: 184,
        LEFT_WITH_CROWN_BOTTOM_LEFT_LIT: 179,
        RIGHT_WITH_CROWN_BOTTOM_RIGHT_LIT: 180
    },
    // Shadow tiles (bottom row of tree, y = baseY + 1)
    SHADOW: {
        LEFT_ISOLATED: 501,
        RIGHT_ISOLATED: 502,
        LEFT_WITH_CROWN_BELOW_LEFT: 247,
        RIGHT_WITH_CROWN_BELOW_RIGHT: 250
    }
};

// Wood icon tile ID for "+1 wood" effect
const WOOD_ICON_TILE_ID = 753;

// Grass tile IDs for filling underneath forest
const GRASS_TILES = [66, 129, 130, 131, 192, 193, 194, 195, 197, 199, 257, 258];
const RARE_GRASS_TILES = [132, 133, 134];

/**
 * Represents a harvestable forest tree
 */
export class ForestTree {
    constructor(baseX, baseY, isLit = false) {
        this.baseX = baseX;
        this.baseY = baseY;
        this.isLit = isLit; // Whether THIS tree's crown is glowing/lit

        // Neighbor flags - set by ForestGenerator after all trees are placed
        this.hasTopLeft = false;
        this.hasTopRight = false;
        this.hasBottomLeft = false;
        this.hasBottomRight = false;

        // Whether neighbors have lit crowns (affects our trunk rendering)
        this.bottomLeftIsLit = false;
        this.bottomRightIsLit = false;

        // Resource tracking (like regular trees)
        this.minResources = 3;
        this.maxResources = 8;
        this.resourcesRemaining = Math.floor(Math.random() * (this.maxResources - this.minResources + 1)) + this.minResources;
        this.initialResources = this.resourcesRemaining;

        // Visual state
        this.isGone = false;
        this.alpha = 1;
        this.fadeTimer = 0;
        this.fadeDuration = CONFIG.resourceFade.duration;
    }

    /**
     * Get the trunk tile positions (where player can chop)
     */
    getTrunkTilePositions() {
        return [
            { x: this.baseX, y: this.baseY },
            { x: this.baseX + 1, y: this.baseY }
        ];
    }

    /**
     * Get all tile positions this tree occupies
     */
    getAllTilePositions() {
        return [
            { x: this.baseX, y: this.baseY - 1 },     // Left crown
            { x: this.baseX + 1, y: this.baseY - 1 }, // Right crown
            { x: this.baseX, y: this.baseY },         // Left trunk
            { x: this.baseX + 1, y: this.baseY },     // Right trunk
            { x: this.baseX, y: this.baseY + 1 },     // Left shadow
            { x: this.baseX + 1, y: this.baseY + 1 }  // Right shadow
        ];
    }

    /**
     * Check if a tile position is part of this tree's trunk (choppable area)
     */
    containsTrunkTile(tileX, tileY) {
        return tileY === this.baseY && (tileX === this.baseX || tileX === this.baseX + 1);
    }

    /**
     * Check if a tile position is part of this tree
     */
    containsTile(tileX, tileY) {
        const dx = tileX - this.baseX;
        const dy = tileY - this.baseY;
        return dx >= 0 && dx <= 1 && dy >= -1 && dy <= 1;
    }

    /**
     * Chop the tree - each chop yields 1 wood
     */
    chop() {
        if (this.isGone || this.resourcesRemaining <= 0) {
            return { woodYielded: null, depleted: false };
        }

        this.resourcesRemaining--;
        const woodYielded = WOOD_ICON_TILE_ID;

        log.debug(`Forest tree chopped: ${this.resourcesRemaining}/${this.initialResources} wood remaining`);

        if (this.resourcesRemaining <= 0) {
            log.debug('Forest tree depleted!');
            return { woodYielded, depleted: true };
        }

        return { woodYielded, depleted: false };
    }

    /**
     * Check if tree can be chopped
     */
    canBeChopped() {
        return !this.isGone && this.resourcesRemaining > 0;
    }

    /**
     * Update tree state (for fading)
     */
    update(deltaTime) {
        if (this.resourcesRemaining <= 0 && !this.isGone) {
            this.fadeTimer += deltaTime;
            this.alpha = 1 - (this.fadeTimer / this.fadeDuration);

            if (this.fadeTimer >= this.fadeDuration) {
                this.isGone = true;
                this.alpha = 0;
            }
        }
    }

    /**
     * Get tile IDs and positions for rendering based on neighbor state
     */
    getTilesForRender() {
        if (this.isGone) return [];

        const tiles = [];
        tiles.push(...this.getTrunkAndShadowTiles());
        tiles.push(...this.getCrownTiles());
        return tiles;
    }

    /**
     * Get trunk and shadow tiles (rendered behind player)
     */
    getTrunkAndShadowTiles() {
        if (this.isGone) return [];

        const tiles = [];
        const T = FOREST_TILES;

        // === TRUNK ROW (y = baseY) ===
        // If bottom neighbor has a lit crown, their lit crown tile already includes our trunk,
        // so we skip rendering our trunk at that position.
        // Otherwise, use isolated trunk tile for proper depth sorting.

        // Left trunk at (baseX, baseY)
        // Bottom-left neighbor is at (baseX-1, baseY+1), their right crown overlaps our left trunk
        if (!this.bottomLeftIsLit) {
            tiles.push({ x: this.baseX, y: this.baseY, tileId: T.TRUNK.LEFT_ISOLATED });
        }
        // If bottomLeftIsLit, skip - their CROWN.RIGHT_WITH_TRUNK_TOP_RIGHT_LIT includes our trunk

        // Right trunk at (baseX+1, baseY)
        // Bottom-right neighbor is at (baseX+1, baseY+1), their left crown overlaps our right trunk
        if (!this.bottomRightIsLit) {
            tiles.push({ x: this.baseX + 1, y: this.baseY, tileId: T.TRUNK.RIGHT_ISOLATED });
        }
        // If bottomRightIsLit, skip - their CROWN.LEFT_WITH_TRUNK_TOP_LEFT_LIT includes our trunk

        // === SHADOW ROW (y = baseY + 1) ===
        tiles.push({ x: this.baseX, y: this.baseY + 1, tileId: T.SHADOW.LEFT_ISOLATED });
        tiles.push({ x: this.baseX + 1, y: this.baseY + 1, tileId: T.SHADOW.RIGHT_ISOLATED });

        return tiles;
    }

    /**
     * Get crown tiles (rendered in front of player)
     */
    getCrownTiles() {
        if (this.isGone) return [];

        const tiles = [];
        const T = FOREST_TILES;

        // === CROWN ROW (y = baseY - 1) ===
        // If this tree's crown is lit AND has a top neighbor, use lit combined tile
        // (lit crown + neighbor's trunk in one tile).
        // Otherwise, use isolated crown for proper depth sorting.

        // Left crown at (baseX, baseY-1)
        // Top-left neighbor is at (baseX-1, baseY-1), their right trunk overlaps our left crown
        if (this.isLit && this.hasTopLeft) {
            // Lit crown combined with neighbor's trunk
            tiles.push({ x: this.baseX, y: this.baseY - 1, tileId: T.CROWN.LEFT_WITH_TRUNK_TOP_LEFT_LIT });
        } else {
            // Non-lit: isolated crown (neighbor renders their own isolated trunk)
            tiles.push({ x: this.baseX, y: this.baseY - 1, tileId: T.CROWN.LEFT_ISOLATED });
        }

        // Right crown at (baseX+1, baseY-1)
        // Top-right neighbor is at (baseX+1, baseY-1), their left trunk overlaps our right crown
        if (this.isLit && this.hasTopRight) {
            // Lit crown combined with neighbor's trunk
            tiles.push({ x: this.baseX + 1, y: this.baseY - 1, tileId: T.CROWN.RIGHT_WITH_TRUNK_TOP_RIGHT_LIT });
        } else {
            // Non-lit: isolated crown (neighbor renders their own isolated trunk)
            tiles.push({ x: this.baseX + 1, y: this.baseY - 1, tileId: T.CROWN.RIGHT_ISOLATED });
        }

        return tiles;
    }

    /**
     * Check if this tree blocks a tile position (for collision)
     * The collision area is centered between the two trunk tiles
     */
    blocksPosition(tileX, tileY) {
        if (this.isGone || this.resourcesRemaining <= 0) return false;

        // Tree blocks both trunk tile positions
        return tileY === this.baseY && (tileX === this.baseX || tileX === this.baseX + 1);
    }

    /**
     * Get Y position for depth sorting
     */
    getSortY(tileSize) {
        return (this.baseY + 0.5) * tileSize;
    }
}

/**
 * ForestGenerator - Creates and manages harvestable forest trees
 */
export class ForestGenerator {
    constructor(tilemap, chunkManager = null) {
        this.tilemap = tilemap;
        this.chunkManager = chunkManager; // Reference to ChunkManager for checking allocated chunks
        this.trees = [];
        this.treeMap = new Map(); // Quick lookup by "baseX,baseY" key
        this.trunkTileMap = new Map(); // Quick lookup of trunk tiles to tree
        this.grassLayer = null;

        // Extended bounds for the forest area
        this.extendedMinX = 0;
        this.extendedMinY = 0;
        this.extendedMaxX = 0;
        this.extendedMaxY = 0;

        // Chopping effects (floating +1 wood)
        this.choppingEffects = [];

        // Pocket system - clearings in the forest with resources
        this.pockets = [];
        this.pocketOreVeins = [];    // Ore veins in forest pockets
        this.pocketCrops = [];        // Crops in forest pockets
        this.pendingEnemySpawns = []; // Enemy spawn positions (spawned by Game.js)

        // Track tiles occupied by pocket contents
        this.pocketOccupiedTiles = new Set();
    }

    /**
     * Generate forest around the playable area
     */
    generate(options = {}) {
        const {
            borderWidth = 5,
            density = 0.7,
            excludeRect = null,
            litChance = 0.3,
            pocketCount = 6,           // Number of pockets to generate
            pocketMinSize = 4,         // Minimum pocket radius in tiles
            pocketMaxSize = 6,         // Maximum pocket radius in tiles
            pathExcludeYMin = null,    // Inclusive min Y of main-path clearance zone
            pathExcludeYMax = null     // Exclusive max Y of main-path clearance zone
        } = options;

        this.trees = [];
        this.treeMap.clear();
        this.trunkTileMap.clear();
        this.pockets = [];
        this.pocketOreVeins = [];
        this.pocketCrops = [];
        this.pendingEnemySpawns = [];
        this.pocketOccupiedTiles.clear();

        const mapWidth = this.tilemap.mapWidth;
        const mapHeight = this.tilemap.mapHeight;

        // Clamp forest generation to exactly the tilemap bounds — no border beyond chunk edges
        this.extendedMinX = 0;
        this.extendedMinY = 0;
        this.extendedMaxX = mapWidth;
        this.extendedMaxY = mapHeight;

        // Generate grass layer first
        this.generateGrassLayer();

        // Generate pockets (clearings with resources)
        this.generatePockets(pocketCount, pocketMinSize, pocketMaxSize, excludeRect);

        // Generate candidate positions using diamond grid pattern
        const candidates = this.generateDiamondGrid(excludeRect, pathExcludeYMin, pathExcludeYMax);

        // Filter by density and place trees (avoiding pocket areas)
        for (const pos of candidates) {
            // Skip if this position is inside a pocket
            if (this.isInPocket(pos.x, pos.y)) continue;

            if (Math.random() < density) {
                const isLit = Math.random() < litChance;
                const tree = new ForestTree(pos.x, pos.y, isLit);
                this.trees.push(tree);
                this.treeMap.set(`${pos.x},${pos.y}`, tree);

                // Map trunk tiles to tree for quick lookup
                this.trunkTileMap.set(`${pos.x},${pos.y}`, tree);
                this.trunkTileMap.set(`${pos.x + 1},${pos.y}`, tree);
            }
        }

        // Update neighbor flags for all trees
        this.updateNeighborFlags();

        // Populate pockets with resources
        this.populatePockets();

        // Note: Flowers/weeds now spawn naturally via FlowerManager (not pre-generated)

        log.debug(`ForestGenerator: Created ${this.trees.length} forest trees, ${this.pockets.length} pockets`);
    }

    /**
     * Generate grass tiles for the extended forest area
     */
    generateGrassLayer() {
        this.grassLayer = new Map();

        for (let y = this.extendedMinY; y < this.extendedMaxY; y++) {
            for (let x = this.extendedMinX; x < this.extendedMaxX; x++) {
                // Skip tiles that are part of the main tilemap
                if (x >= 0 && x < this.tilemap.mapWidth &&
                    y >= 0 && y < this.tilemap.mapHeight) {
                    continue;
                }

                const rand = Math.random();
                let grassTile;
                if (rand < 0.99) {
                    grassTile = GRASS_TILES[Math.floor(Math.random() * GRASS_TILES.length)];
                } else {
                    grassTile = RARE_GRASS_TILES[Math.floor(Math.random() * RARE_GRASS_TILES.length)];
                }

                this.grassLayer.set(`${x},${y}`, grassTile);
            }
        }
    }

    /**
     * Generate pockets (clearings) in the forest
     */
    generatePockets(count, minSize, maxSize, excludeRect) {
        const excludeMinX = excludeRect ? excludeRect.x - 3 : -3;
        const excludeMinY = excludeRect ? excludeRect.y - 3 : -3;
        const excludeMaxX = excludeRect ? excludeRect.x + excludeRect.width + 3 : this.tilemap.mapWidth + 3;
        const excludeMaxY = excludeRect ? excludeRect.y + excludeRect.height + 3 : this.tilemap.mapHeight + 3;

        // Define pocket type distribution
        // 40% ore pockets (various ore + stone)
        // 20% stone-only pockets
        // 40% crop pockets
        const pocketTypeWeights = [
            { type: POCKET_TYPES.ORE, weight: 0.4 },
            { type: POCKET_TYPES.STONE, weight: 0.2 },
            { type: POCKET_TYPES.CROP, weight: 0.4 }
        ];

        // Get non-rock ore types for ore pockets
        const oreTypes = Object.keys(ORE_TYPES).filter(key => key !== 'ROCK');

        // Get harvestable crop types (exclude WEED)
        const cropTypes = Object.keys(CROP_TYPES).filter(key => key !== 'WEED');

        for (let i = 0; i < count; i++) {
            let attempts = 0;
            let placed = false;

            while (attempts < 50 && !placed) {
                // Random position in forest area (outside main tilemap)
                const radius = minSize + Math.floor(Math.random() * (maxSize - minSize + 1));

                // Calculate valid spawn area (must be far enough inside forest)
                const spawnMinX = this.extendedMinX + radius + 2;
                const spawnMaxX = this.extendedMaxX - radius - 2;
                const spawnMinY = this.extendedMinY + radius + 2;
                const spawnMaxY = this.extendedMaxY - radius - 2;

                // Random center position
                let centerX = spawnMinX + Math.floor(Math.random() * (spawnMaxX - spawnMinX));
                let centerY = spawnMinY + Math.floor(Math.random() * (spawnMaxY - spawnMinY));

                // Check if pocket overlaps with exclusion zone (playable area)
                const pocketMinX = centerX - radius;
                const pocketMaxX = centerX + radius;
                const pocketMinY = centerY - radius;
                const pocketMaxY = centerY + radius;

                const overlapsExclude = !(
                    pocketMaxX < excludeMinX ||
                    pocketMinX > excludeMaxX ||
                    pocketMaxY < excludeMinY ||
                    pocketMinY > excludeMaxY
                );

                if (overlapsExclude) {
                    attempts++;
                    continue;
                }

                // Check if pocket overlaps with existing pockets (minimum separation)
                let overlapsOther = false;
                for (const existingPocket of this.pockets) {
                    const dx = centerX - existingPocket.centerX;
                    const dy = centerY - existingPocket.centerY;
                    const minDist = radius + existingPocket.radius + 3; // 3 tile buffer
                    if (dx * dx + dy * dy < minDist * minDist) {
                        overlapsOther = true;
                        break;
                    }
                }

                if (overlapsOther) {
                    attempts++;
                    continue;
                }

                // Select pocket type based on weights
                const rand = Math.random();
                let cumWeight = 0;
                let pocketType = POCKET_TYPES.ORE;
                for (const { type, weight } of pocketTypeWeights) {
                    cumWeight += weight;
                    if (rand < cumWeight) {
                        pocketType = type;
                        break;
                    }
                }

                // Select specific content based on type
                let contentType = null;
                if (pocketType === POCKET_TYPES.ORE) {
                    contentType = oreTypes[Math.floor(Math.random() * oreTypes.length)];
                } else if (pocketType === POCKET_TYPES.CROP) {
                    contentType = cropTypes[Math.floor(Math.random() * cropTypes.length)];
                }

                // Determine if this pocket should also have enemies
                const hasEnemies = Math.random() < CONFIG.forestPockets.enemySpawnChance;

                // Create the pocket
                const pocket = {
                    centerX,
                    centerY,
                    radius,
                    type: pocketType,
                    contentType,
                    hasEnemies,
                    tiles: []
                };

                // Calculate which tiles are in the pocket (circular area)
                for (let y = centerY - radius; y <= centerY + radius; y++) {
                    for (let x = centerX - radius; x <= centerX + radius; x++) {
                        const dx = x - centerX;
                        const dy = y - centerY;
                        // Use squared distance for slightly rounded pocket shape
                        if (dx * dx + dy * dy <= radius * radius) {
                            pocket.tiles.push({ x, y });
                        }
                    }
                }

                this.pockets.push(pocket);
                placed = true;

                log.debug(`Generated ${pocketType} pocket at (${centerX}, ${centerY}) radius ${radius}${contentType ? ` - ${contentType}` : ''}`);
            }
        }
    }

    /**
     * Check if a tree position would be inside any pocket
     */
    isInPocket(treeBaseX, treeBaseY) {
        // Tree occupies a 2x3 area, check all tiles
        const treeTiles = [
            { x: treeBaseX, y: treeBaseY - 1 },
            { x: treeBaseX + 1, y: treeBaseY - 1 },
            { x: treeBaseX, y: treeBaseY },
            { x: treeBaseX + 1, y: treeBaseY },
            { x: treeBaseX, y: treeBaseY + 1 },
            { x: treeBaseX + 1, y: treeBaseY + 1 }
        ];

        for (const pocket of this.pockets) {
            for (const treeTile of treeTiles) {
                const dx = treeTile.x - pocket.centerX;
                const dy = treeTile.y - pocket.centerY;
                // Add buffer around pocket center
                if (dx * dx + dy * dy <= (pocket.radius + 1) * (pocket.radius + 1)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Populate pockets with their respective resources
     */
    populatePockets() {
        for (const pocket of this.pockets) {
            switch (pocket.type) {
                case POCKET_TYPES.ORE:
                    this.populateOrePocket(pocket);
                    break;
                case POCKET_TYPES.STONE:
                    this.populateStonePocket(pocket);
                    break;
                case POCKET_TYPES.CROP:
                    this.populateCropPocket(pocket);
                    break;
            }

            // Add enemies if pocket has them (can be combined with any pocket type)
            if (pocket.hasEnemies) {
                this.addEnemySpawnsToPocket(pocket);
            }
        }
    }

    /**
     * Add enemy spawn positions to a pocket
     */
    addEnemySpawnsToPocket(pocket) {
        const minEnemies = CONFIG.forestPockets.minEnemiesPerPocket;
        const maxEnemies = CONFIG.forestPockets.maxEnemiesPerPocket;
        const enemyCount = minEnemies + Math.floor(Math.random() * (maxEnemies - minEnemies + 1));

        // Get available tiles for enemy spawning (avoid occupied tiles)
        const availableTiles = pocket.tiles.filter(tile => {
            // Must be outside main tilemap
            if (tile.x >= 0 && tile.x < this.tilemap.mapWidth &&
                tile.y >= 0 && tile.y < this.tilemap.mapHeight) {
                return false;
            }
            return !this.pocketOccupiedTiles.has(`${tile.x},${tile.y}`);
        });

        for (let i = 0; i < enemyCount && availableTiles.length > 0; i++) {
            const idx = Math.floor(Math.random() * availableTiles.length);
            const tile = availableTiles.splice(idx, 1)[0];

            // Store spawn position for later (EnemyManager will handle actual spawning)
            this.pendingEnemySpawns.push({
                tileX: tile.x,
                tileY: tile.y,
                type: 'skeleton'
            });

            // Mark tile as occupied
            this.pocketOccupiedTiles.add(`${tile.x},${tile.y}`);

            log.debug(`Queued skeleton spawn in forest pocket at (${tile.x}, ${tile.y})`);
        }
    }

    /**
     * Get pending enemy spawns and clear the list
     * Called by Game.js after forest generation to spawn enemies via EnemyManager
     */
    getPendingEnemySpawns() {
        const spawns = [...this.pendingEnemySpawns];
        this.pendingEnemySpawns = [];
        return spawns;
    }

    /**
     * Populate an ore pocket with ore veins + stone
     */
    populateOrePocket(pocket) {
        const oreType = ORE_TYPES[pocket.contentType];
        if (!oreType) return;

        // Calculate number of ore veins based on pocket size
        const oreCount = Math.floor(pocket.radius / 2) + 1;
        const stoneCount = Math.floor(pocket.radius / 2);

        // Get available tiles for 2x2 ore placement
        let availableTiles = this.getAvailableOreTiles(pocket);

        // Place primary ore type
        for (let i = 0; i < oreCount && availableTiles.length > 0; i++) {
            const idx = Math.floor(Math.random() * availableTiles.length);
            const tile = availableTiles.splice(idx, 1)[0];
            this.spawnPocketOre(tile.x, tile.y, oreType);
            // Filter out tiles that would now overlap with the placed ore
            availableTiles = this.filterOverlappingOreTiles(availableTiles, tile.x, tile.y);
        }

        // Place stone ore
        for (let i = 0; i < stoneCount && availableTiles.length > 0; i++) {
            const idx = Math.floor(Math.random() * availableTiles.length);
            const tile = availableTiles.splice(idx, 1)[0];
            this.spawnPocketOre(tile.x, tile.y, ORE_TYPES.ROCK);
            // Filter out tiles that would now overlap with the placed ore
            availableTiles = this.filterOverlappingOreTiles(availableTiles, tile.x, tile.y);
        }
    }

    /**
     * Populate a stone-only pocket
     */
    populateStonePocket(pocket) {
        const stoneCount = Math.floor(pocket.radius / 1.5) + 2;
        let availableTiles = this.getAvailableOreTiles(pocket);

        for (let i = 0; i < stoneCount && availableTiles.length > 0; i++) {
            const idx = Math.floor(Math.random() * availableTiles.length);
            const tile = availableTiles.splice(idx, 1)[0];
            this.spawnPocketOre(tile.x, tile.y, ORE_TYPES.ROCK);
            // Filter out tiles that would now overlap with the placed ore
            availableTiles = this.filterOverlappingOreTiles(availableTiles, tile.x, tile.y);
        }
    }

    /**
     * Filter out tiles that would overlap with an ore placed at (oreX, oreY)
     * Two 2x2 ores overlap if |x1 - x2| <= 1 AND |y1 - y2| <= 1
     */
    filterOverlappingOreTiles(tiles, oreX, oreY) {
        return tiles.filter(tile => {
            const dx = Math.abs(tile.x - oreX);
            const dy = Math.abs(tile.y - oreY);
            // Keep tile only if it's far enough away (more than 1 tile in at least one direction)
            return dx > 1 || dy > 1;
        });
    }

    /**
     * Populate a crop pocket with a single crop type
     */
    populateCropPocket(pocket) {
        const cropType = CROP_TYPES[pocket.contentType];
        if (!cropType) return;

        // Calculate number of crops based on pocket size
        const cropCount = Math.floor(pocket.radius * 1.5) + 2;

        // Get available single tiles for crop placement
        const availableTiles = pocket.tiles.filter(tile => {
            // Must be a forest tile (outside main tilemap)
            if (tile.x >= 0 && tile.x < this.tilemap.mapWidth &&
                tile.y >= 0 && tile.y < this.tilemap.mapHeight) {
                return false;
            }
            return !this.pocketOccupiedTiles.has(`${tile.x},${tile.y}`);
        });

        for (let i = 0; i < cropCount && availableTiles.length > 0; i++) {
            const idx = Math.floor(Math.random() * availableTiles.length);
            const tile = availableTiles.splice(idx, 1)[0];
            this.spawnPocketCrop(tile.x, tile.y, cropType);
        }
    }

    /**
     * Get available tiles for 2x2 ore placement in a pocket
     */
    getAvailableOreTiles(pocket) {
        const available = [];

        for (const tile of pocket.tiles) {
            // Must be a forest tile (outside main tilemap)
            if (tile.x >= 0 && tile.x < this.tilemap.mapWidth &&
                tile.y >= 0 && tile.y < this.tilemap.mapHeight) {
                continue;
            }

            // Check if 2x2 area is available
            const positions = [
                { x: tile.x, y: tile.y },
                { x: tile.x + 1, y: tile.y },
                { x: tile.x, y: tile.y + 1 },
                { x: tile.x + 1, y: tile.y + 1 }
            ];

            let allClear = true;
            for (const pos of positions) {
                if (this.pocketOccupiedTiles.has(`${pos.x},${pos.y}`)) {
                    allClear = false;
                    break;
                }
                // Check if within forest bounds
                if (pos.x >= 0 && pos.x < this.tilemap.mapWidth &&
                    pos.y >= 0 && pos.y < this.tilemap.mapHeight) {
                    allClear = false;
                    break;
                }
            }

            if (allClear) {
                available.push(tile);
            }
        }

        return available;
    }

    /**
     * Spawn an ore vein in a forest pocket
     */
    spawnPocketOre(tileX, tileY, oreType) {
        const ore = new OreVein(tileX, tileY, oreType);
        this.pocketOreVeins.push(ore);

        // Mark tiles as occupied with 1-tile buffer around the 2x2 ore
        // This prevents overlapping sprites from adjacent ore veins
        for (let ox = -1; ox <= 2; ox++) {
            for (let oy = -1; oy <= 2; oy++) {
                this.pocketOccupiedTiles.add(`${tileX + ox},${tileY + oy}`);
            }
        }

        log.debug(`Spawned ${oreType.name} ore in forest pocket at (${tileX}, ${tileY})`);
    }

    /**
     * Spawn a crop in a forest pocket
     */
    spawnPocketCrop(tileX, tileY, cropType) {
        // Create crop that's already grown and ready to harvest
        const crop = new Crop(tileX, tileY, cropType, false);
        // Set to harvestable stage directly
        crop.stage = 4; // HARVESTABLE
        crop.isWatered = true;
        this.pocketCrops.push(crop);

        // Mark tile as occupied
        this.pocketOccupiedTiles.add(`${tileX},${tileY}`);

        log.debug(`Spawned ${cropType.name} in forest pocket at (${tileX}, ${tileY})`);
    }

    /**
     * Check if a forest grass tile is valid for flower/weed spawning
     * (used by FlowerManager for natural spawning)
     */
    isValidForestSpawnTile(tileX, tileY) {
        // Must be outside main tilemap
        if (tileX >= 0 && tileX < this.tilemap.mapWidth &&
            tileY >= 0 && tileY < this.tilemap.mapHeight) {
            return false;
        }

        // Must have grass at this position
        const grassTile = this.getGrassTileAt(tileX, tileY);
        if (!grassTile) return false;
        if (!GRASS_TILES.includes(grassTile) && !RARE_GRASS_TILES.includes(grassTile)) {
            return false;
        }

        // Skip if occupied by pocket content
        if (this.pocketOccupiedTiles.has(`${tileX},${tileY}`)) return false;

        // Check if tree trunk is at this position
        if (this.trunkTileMap.has(`${tileX},${tileY}`)) return false;

        // Check if any tree covers this position
        for (const tree of this.trees) {
            if (tree.containsTile(tileX, tileY)) {
                return false;
            }
        }

        // Check for pocket ore
        if (this.getPocketOreAt(tileX, tileY)) return false;

        // Check for pocket crops
        if (this.getPocketCropAt(tileX, tileY)) return false;

        return true;
    }

    /**
     * Get all forest grass tile positions for spawn calculations
     */
    getForestGrassTiles() {
        const tiles = [];
        if (!this.grassLayer) return tiles;

        for (const [key, tileId] of this.grassLayer) {
            if (!GRASS_TILES.includes(tileId) && !RARE_GRASS_TILES.includes(tileId)) {
                continue;
            }

            const [x, y] = key.split(',').map(Number);
            if (this.isValidForestSpawnTile(x, y)) {
                tiles.push({ x, y });
            }
        }

        return tiles;
    }

    /**
     * Generate valid positions in a diamond grid pattern
     * Only generates trees in allocated chunks (if chunkManager is provided)
     */
    generateDiamondGrid(excludeRect, pathExcludeYMin = null, pathExcludeYMax = null) {
        const positions = [];

        const excludeMinX = excludeRect ? excludeRect.x : 0;
        const excludeMinY = excludeRect ? excludeRect.y : 0;
        const excludeMaxX = excludeRect ? excludeRect.x + excludeRect.width : this.tilemap.mapWidth;
        const excludeMaxY = excludeRect ? excludeRect.y + excludeRect.height : this.tilemap.mapHeight;

        const minY = this.extendedMinY + 1;
        const maxY = this.extendedMaxY - 1;
        const minX = this.extendedMinX;
        const maxX = this.extendedMaxX - 1;

        for (let y = minY; y < maxY; y++) {
            for (let x = minX; x < maxX; x++) {
                // Only include positions with same parity (x+y even)
                if ((x + y) % 2 !== 0) continue;

                const treeMinX = x;
                const treeMaxX = x + 2;
                const treeMinY = y - 1;
                const treeMaxY = y + 2;

                // Check if tree overlaps with exclusion zone
                const overlapsExclude = !(
                    treeMaxX <= excludeMinX ||
                    treeMinX >= excludeMaxX ||
                    treeMaxY <= excludeMinY ||
                    treeMinY >= excludeMaxY
                );

                if (overlapsExclude) continue;

                // Check if tree overlaps the main-path horizontal clearance band (4 tiles wide)
                // Path corridor: y=pathExcludeYMin to pathExcludeYMax (4 tiles total)
                // Trees must not spawn in this full 4-tile band
                if (pathExcludeYMin != null && pathExcludeYMax != null) {
                    if (treeMaxY > pathExcludeYMin && treeMinY < pathExcludeYMax) continue;
                }

                // CRITICAL: Only generate trees in allocated chunks
                // Check if the chunk containing this tree position is allocated
                if (this.chunkManager) {
                    const chunk = this.chunkManager.getChunkForTile(x, y);
                    if (!chunk) {
                        // Chunk not allocated - skip this position
                        continue;
                    }
                }

                positions.push({ x, y });
            }
        }

        return positions;
    }

    /**
     * Update neighbor flags for all trees
     */
    updateNeighborFlags() {
        // First pass: update basic neighbor presence flags
        for (const tree of this.trees) {
            if (tree.isGone) continue;
            this.updateTreeNeighborPresence(tree);
        }

        // Second pass: resolve lit conflicts (no adjacent trees can both be lit)
        this.resolveLitConflicts();

        // Third pass: update "neighbor is lit" flags for trunk rendering
        for (const tree of this.trees) {
            if (tree.isGone) continue;
            this.updateTreeNeighborLitStatus(tree);
        }
    }

    /**
     * Update basic neighbor presence flags for a single tree
     */
    updateTreeNeighborPresence(tree) {
        const { baseX, baseY } = tree;

        // Check diagonal neighbors
        const topLeft = this.treeMap.get(`${baseX - 1},${baseY - 1}`);
        const topRight = this.treeMap.get(`${baseX + 1},${baseY - 1}`);
        const bottomLeft = this.treeMap.get(`${baseX - 1},${baseY + 1}`);
        const bottomRight = this.treeMap.get(`${baseX + 1},${baseY + 1}`);

        // A neighbor is only considered present if it exists, isn't gone, AND still has resources
        const isPresent = (neighbor) => neighbor && !neighbor.isGone && neighbor.resourcesRemaining > 0;

        tree.hasTopLeft = isPresent(topLeft);
        tree.hasTopRight = isPresent(topRight);
        tree.hasBottomLeft = isPresent(bottomLeft);
        tree.hasBottomRight = isPresent(bottomRight);

        // A tree can only be lit if it has full resources AND is fully surrounded (all 4 neighbors)
        if (tree.isLit) {
            const isFullySurrounded = tree.hasTopLeft && tree.hasTopRight &&
                                      tree.hasBottomLeft && tree.hasBottomRight;
            if (!isFullySurrounded || tree.resourcesRemaining !== tree.initialResources) {
                tree.isLit = false;
            }
        }
    }

    /**
     * Resolve lit conflicts - ensure no two adjacent trees are both lit.
     * If two adjacent trees would both be lit, pick one (first encountered) and unlit the other.
     */
    resolveLitConflicts() {
        const confirmedLit = new Set();

        for (const tree of this.trees) {
            if (tree.isGone || !tree.isLit) continue;

            const { baseX, baseY } = tree;

            // Check if any diagonal neighbor is already confirmed lit
            const neighborKeys = [
                `${baseX - 1},${baseY - 1}`,
                `${baseX + 1},${baseY - 1}`,
                `${baseX - 1},${baseY + 1}`,
                `${baseX + 1},${baseY + 1}`
            ];

            const hasLitNeighbor = neighborKeys.some(key => {
                const neighbor = this.treeMap.get(key);
                return neighbor && confirmedLit.has(neighbor);
            });

            if (hasLitNeighbor) {
                // Can't be lit if a neighbor is already lit
                tree.isLit = false;
            } else {
                // This tree is confirmed lit
                confirmedLit.add(tree);
            }
        }
    }

    /**
     * Update "neighbor is lit" flags for trunk rendering decisions
     */
    updateTreeNeighborLitStatus(tree) {
        const { baseX, baseY } = tree;

        // Check if bottom neighbors are lit (affects our trunk rendering)
        const bottomLeft = this.treeMap.get(`${baseX - 1},${baseY + 1}`);
        const bottomRight = this.treeMap.get(`${baseX + 1},${baseY + 1}`);

        tree.bottomLeftIsLit = bottomLeft && bottomLeft.isLit && !bottomLeft.isGone;
        tree.bottomRightIsLit = bottomRight && bottomRight.isLit && !bottomRight.isGone;
    }

    /**
     * Update neighbor flags for a single tree (convenience method for after chopping)
     */
    updateTreeNeighborFlags(tree) {
        const wasLit = tree.isLit;
        this.updateTreeNeighborPresence(tree);
        this.updateTreeNeighborLitStatus(tree);

        // If this tree lost its lit status, update trees above that had it as a lit bottom neighbor
        if (wasLit && !tree.isLit) {
            this.updateNeighborsLitFlags(tree);
        }
    }

    /**
     * Get forest tree at a tile position (checks trunk tiles)
     */
    getTreeAt(tileX, tileY) {
        const tree = this.trunkTileMap.get(`${tileX},${tileY}`);
        if (tree && !tree.isGone) {
            return tree;
        }
        return null;
    }

    /**
     * Get both trunk tiles for a tree (for selection highlighting)
     */
    getTrunkTilesForTree(tree) {
        if (!tree || tree.isGone) return [];
        return tree.getTrunkTilePositions();
    }

    /**
     * Chop a forest tree at a tile position
     */
    chopTree(tileX, tileY) {
        const tree = this.getTreeAt(tileX, tileY);
        if (!tree || !tree.canBeChopped()) {
            return null;
        }

        const wasLit = tree.isLit;
        const result = tree.chop();

        // No longer lit after first chop
        tree.isLit = false;

        // Create chopping effect
        if (result.woodYielded) {
            this.createChoppingEffect(tree, result.woodYielded);
        }

        // If this tree was lit, update neighbors' lit status flags
        // (they need to know their bottom neighbor is no longer lit)
        if (wasLit) {
            this.updateNeighborsLitFlags(tree);
        }

        // If depleted, update neighbors
        if (result.depleted) {
            this.onTreeDepleted(tree);
        }

        return result;
    }

    /**
     * Update lit flags for trees that have this tree as a neighbor
     */
    updateNeighborsLitFlags(tree) {
        const { baseX, baseY } = tree;

        // Trees above this one (this tree is their bottom neighbor)
        const topNeighbors = [
            this.treeMap.get(`${baseX - 1},${baseY - 1}`),
            this.treeMap.get(`${baseX + 1},${baseY - 1}`)
        ];

        for (const neighbor of topNeighbors) {
            if (neighbor && !neighbor.isGone) {
                this.updateTreeNeighborLitStatus(neighbor);
            }
        }
    }

    /**
     * Handle tree depletion - update neighbor tiles
     */
    onTreeDepleted(tree) {
        const { baseX, baseY } = tree;

        // Remove from trunk tile map
        this.trunkTileMap.delete(`${baseX},${baseY}`);
        this.trunkTileMap.delete(`${baseX + 1},${baseY}`);

        // Update neighbor flags for adjacent trees
        const neighbors = [
            this.treeMap.get(`${baseX - 1},${baseY - 1}`),
            this.treeMap.get(`${baseX + 1},${baseY - 1}`),
            this.treeMap.get(`${baseX - 1},${baseY + 1}`),
            this.treeMap.get(`${baseX + 1},${baseY + 1}`)
        ];

        for (const neighbor of neighbors) {
            if (neighbor && !neighbor.isGone) {
                this.updateTreeNeighborFlags(neighbor);
            }
        }
    }

    /**
     * Create floating "+1 wood" effect
     */
    createChoppingEffect(tree, woodTileId) {
        const tileSize = this.tilemap.tileSize;
        const centerX = (tree.baseX + 1) * tileSize;
        const centerY = tree.baseY * tileSize;

        this.choppingEffects.push({
            x: centerX,
            y: centerY,
            tileId: woodTileId,
            timer: 0,
            duration: 1000,
            alpha: 1
        });
    }

    /**
     * Update all trees and effects
     */
    update(deltaTime) {
        // Update trees
        for (const tree of this.trees) {
            tree.update(deltaTime);
        }

        // Clean up gone trees from arrays and maps
        this.trees = this.trees.filter(tree => {
            if (tree.isGone) {
                // Remove from treeMap when fully gone
                this.treeMap.delete(`${tree.baseX},${tree.baseY}`);
                return false;
            }
            return true;
        });

        // Update pocket ore veins
        for (const ore of this.pocketOreVeins) {
            ore.update(deltaTime);
        }
        this.pocketOreVeins = this.pocketOreVeins.filter(ore => !ore.isGone);

        // Update pocket crops
        for (const crop of this.pocketCrops) {
            crop.update(deltaTime);
        }
        this.pocketCrops = this.pocketCrops.filter(crop => !crop.isGone);

        // Update chopping effects
        for (let i = this.choppingEffects.length - 1; i >= 0; i--) {
            const effect = this.choppingEffects[i];
            effect.timer += deltaTime;
            effect.y -= deltaTime * 0.05;
            effect.alpha = 1 - (effect.timer / effect.duration);

            if (effect.timer >= effect.duration) {
                this.choppingEffects.splice(i, 1);
            }
        }
    }

    /**
     * Get ore vein at a forest tile position
     */
    getPocketOreAt(tileX, tileY) {
        for (const ore of this.pocketOreVeins) {
            if (ore.isGone) continue;
            if (ore.containsTile(tileX, tileY)) {
                return ore;
            }
        }
        return null;
    }

    /**
     * Mine a pocket ore vein
     */
    minePocketOre(tileX, tileY) {
        const ore = this.getPocketOreAt(tileX, tileY);
        if (!ore || !ore.canBeMined()) {
            return null;
        }

        const result = ore.mine();

        // Create mining effect if ore was yielded
        if (result.oreYielded) {
            const tileSize = this.tilemap.tileSize;
            const centerX = (ore.tileX + 1) * tileSize;
            const centerY = (ore.tileY + 1) * tileSize;

            this.choppingEffects.push({
                x: centerX,
                y: centerY,
                tileId: result.oreYielded,
                timer: 0,
                duration: 1000,
                alpha: 1
            });
        }

        return result;
    }

    /**
     * Get crop at a forest tile position
     */
    getPocketCropAt(tileX, tileY) {
        for (const crop of this.pocketCrops) {
            if (crop.isGone || crop.isHarvested) continue;
            if (crop.containsTile(tileX, tileY)) {
                return crop;
            }
        }
        return null;
    }

    /**
     * Harvest a pocket crop
     */
    harvestPocketCrop(tileX, tileY) {
        const crop = this.getPocketCropAt(tileX, tileY);
        if (!crop || !crop.isReadyToHarvest()) {
            return null;
        }

        const harvestedTileId = crop.getHarvestedTileId();
        crop.harvest();

        // Create harvest effect
        const tileSize = this.tilemap.tileSize;
        this.choppingEffects.push({
            x: crop.tileX * tileSize + tileSize / 2,
            y: crop.tileY * tileSize,
            tileId: harvestedTileId,
            timer: 0,
            duration: 1000,
            alpha: 1
        });

        return crop.cropType;
    }

    /**
     * Get all pocket ore veins for rendering/detection
     */
    getPocketOreVeins() {
        return this.pocketOreVeins;
    }

    /**
     * Get all pocket crops for rendering/detection
     */
    getPocketCrops() {
        return this.pocketCrops;
    }

    /**
     * Render a single pocket ore vein (for depth-sorted rendering)
     */
    renderPocketOre(ctx, ore) {
        if (ore.isGone) return;

        const tileSize = this.tilemap.tileSize;
        const tileIds = ore.getTileIds();
        if (tileIds.length === 0) return;

        if (ore.alpha < 1) {
            ctx.save();
            ctx.globalAlpha = ore.alpha;
        }

        const positions = [
            { x: ore.tileX, y: ore.tileY },
            { x: ore.tileX + 1, y: ore.tileY },
            { x: ore.tileX, y: ore.tileY + 1 },
            { x: ore.tileX + 1, y: ore.tileY + 1 }
        ];

        for (let i = 0; i < 4 && i < tileIds.length; i++) {
            const sourceRect = this.tilemap.getTilesetSourceRect(tileIds[i]);
            const worldX = positions[i].x * tileSize;
            const worldY = positions[i].y * tileSize;

            ctx.drawImage(
                this.tilemap.tilesetImage,
                sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                worldX, worldY, tileSize, tileSize
            );
        }

        if (ore.alpha < 1) {
            ctx.restore();
        }
    }

    /**
     * Render a single pocket crop (for depth-sorted rendering)
     */
    renderPocketCrop(ctx, crop) {
        if (crop.isGone) return;

        const tileSize = this.tilemap.tileSize;
        const tiles = crop.getTileIds();
        if (tiles.length === 0) return;

        if (crop.alpha < 1) {
            ctx.save();
            ctx.globalAlpha = crop.alpha;
        }

        for (const tile of tiles) {
            const sourceRect = this.tilemap.getTilesetSourceRect(tile.id);
            const worldX = crop.tileX * tileSize;
            const worldY = (crop.tileY + tile.offsetY) * tileSize;

            ctx.drawImage(
                this.tilemap.tilesetImage,
                sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                worldX, worldY, tileSize, tileSize
            );
        }

        if (crop.alpha < 1) {
            ctx.restore();
        }
    }

    /**
     * Render the forest (grass + trees)
     */
    render(ctx, camera) {
        const tileSize = this.tilemap.tileSize;
        const bounds = camera.getVisibleBounds();

        const startCol = Math.floor(bounds.left / tileSize) - 1;
        const endCol = Math.ceil(bounds.right / tileSize) + 1;
        const startRow = Math.floor(bounds.top / tileSize) - 1;
        const endRow = Math.ceil(bounds.bottom / tileSize) + 1;

        const overlap = 0.5;

        // Render grass first - only render tiles OUTSIDE the main tilemap
        // (forest grass should not overlap with allocated chunks)
        if (this.grassLayer) {
            for (let row = startRow; row <= endRow; row++) {
                for (let col = startCol; col <= endCol; col++) {
                    // Skip tiles that are within the main tilemap (allocated chunks)
                    if (col >= 0 && col < this.tilemap.mapWidth &&
                        row >= 0 && row < this.tilemap.mapHeight) {
                        continue; // This tile is in an allocated chunk, skip forest grass
                    }
                    
                    const key = `${col},${row}`;
                    const tileId = this.grassLayer.get(key);

                    if (tileId === undefined) continue;

                    const sourceRect = this.tilemap.getTilesetSourceRectWithPadding(tileId, overlap);
                    const worldX = col * tileSize;
                    const worldY = row * tileSize;

                    ctx.drawImage(
                        this.tilemap.tilesetImage,
                        sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                        worldX - overlap, worldY - overlap,
                        tileSize + overlap * 2, tileSize + overlap * 2
                    );
                }
            }
        }

        // Don't render trees here - they'll be rendered via depth sorting in Game.js
    }

    /**
     * Render a single tree's trunk and shadow (behind player)
     */
    renderTreeBackground(ctx, tree) {
        if (tree.isGone) return;

        const tileSize = this.tilemap.tileSize;
        const tiles = tree.getTrunkAndShadowTiles();
        if (tiles.length === 0) return;

        if (tree.alpha < 1) {
            ctx.save();
            ctx.globalAlpha = tree.alpha;
        }

        const overlap = 0.5;
        for (const tile of tiles) {
            const sourceRect = this.tilemap.getTilesetSourceRectWithPadding(tile.tileId, overlap);
            const worldX = tile.x * tileSize;
            const worldY = tile.y * tileSize;

            ctx.drawImage(
                this.tilemap.tilesetImage,
                sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                worldX - overlap, worldY - overlap,
                tileSize + overlap * 2, tileSize + overlap * 2
            );
        }

        if (tree.alpha < 1) {
            ctx.restore();
        }
    }

    /**
     * Render a single tree's crown (in front of player)
     */
    renderTreeForeground(ctx, tree) {
        if (tree.isGone) return;

        const tileSize = this.tilemap.tileSize;
        const tiles = tree.getCrownTiles();
        if (tiles.length === 0) return;

        if (tree.alpha < 1) {
            ctx.save();
            ctx.globalAlpha = tree.alpha;
        }

        const overlap = 0.5;
        for (const tile of tiles) {
            const sourceRect = this.tilemap.getTilesetSourceRectWithPadding(tile.tileId, overlap);
            const worldX = tile.x * tileSize;
            const worldY = tile.y * tileSize;

            ctx.drawImage(
                this.tilemap.tilesetImage,
                sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                worldX - overlap, worldY - overlap,
                tileSize + overlap * 2, tileSize + overlap * 2
            );
        }

        if (tree.alpha < 1) {
            ctx.restore();
        }
    }

    /**
     * Render all tree backgrounds (trunk and shadow) - call before characters
     */
    renderAllTreeBackgrounds(ctx, camera) {
        for (const tree of this.trees) {
            if (!tree.isGone) {
                this.renderTreeBackground(ctx, tree);
            }
        }
    }

    /**
     * Render all tree foregrounds (crowns) - call after characters
     */
    renderAllTreeForegrounds(ctx, camera) {
        for (const tree of this.trees) {
            if (!tree.isGone) {
                this.renderTreeForeground(ctx, tree);
            }
        }
    }

    /**
     * Render chopping effects
     */
    renderEffects(ctx, camera) {
        const tileSize = this.tilemap.tileSize;

        for (const effect of this.choppingEffects) {
            ctx.save();
            ctx.globalAlpha = effect.alpha;

            const sourceRect = this.tilemap.getTilesetSourceRect(effect.tileId);
            ctx.drawImage(
                this.tilemap.tilesetImage,
                sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
                effect.x - tileSize / 2, effect.y - tileSize / 2,
                tileSize, tileSize
            );

            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.font = 'bold 8px Arial';
            ctx.textAlign = 'center';
            ctx.strokeText('+1', effect.x, effect.y - tileSize / 2 - 2);
            ctx.fillText('+1', effect.x, effect.y - tileSize / 2 - 2);

            ctx.restore();
        }
    }

    /**
     * Get all trees for depth-sorted rendering
     */
    getTrees() {
        return this.trees.filter(t => !t.isGone);
    }

    /**
     * Get tree count
     */
    getTreeCount() {
        return this.trees.filter(t => !t.isGone).length;
    }

    /**
     * Check if a tile position is within the forest bounds (extended area around tilemap)
     */
    isWithinForestBounds(tileX, tileY) {
        return tileX >= this.extendedMinX && tileX < this.extendedMaxX &&
               tileY >= this.extendedMinY && tileY < this.extendedMaxY;
    }

    /**
     * Check if a tile position is blocked by a forest tree
     */
    isBlockedByTree(tileX, tileY) {
        // Use trunkTileMap for O(1) lookup instead of linear scan
        const tree = this.trunkTileMap.get(`${tileX},${tileY}`);
        return tree !== undefined && !tree.isGone && tree.resourcesRemaining > 0;
    }

    /**
     * Check if a tile is a forest tree trunk (for pathfinding inside tilemap bounds).
     * Uses trunkTileMap for O(1) lookup — works regardless of tilemap boundary.
     */
    isForestTreeTrunk(tileX, tileY) {
        const tree = this.trunkTileMap.get(`${tileX},${tileY}`);
        return tree !== undefined && !tree.isGone && tree.resourcesRemaining > 0;
    }

    /**
     * Check if a tile is blocked by the bottom row of a pocket ore vein (for pathfinding).
     * Pocket ore veins are 2x2; only their bottom tiles (tileY + 1) are obstacles.
     */
    isPocketOreObstacle(tileX, tileY) {
        for (const ore of this.pocketOreVeins) {
            if (ore.isGone) continue;
            if (tileY === ore.tileY + 1 && (tileX === ore.tileX || tileX === ore.tileX + 1)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if a tile position in the forest area is walkable
     * (within bounds, has grass, and not blocked by a tree)
     */
    isWalkable(tileX, tileY) {
        // Must be within forest bounds but outside main tilemap
        if (!this.isWithinForestBounds(tileX, tileY)) {
            return false;
        }

        // If within main tilemap, let the tilemap handle it
        if (tileX >= 0 && tileX < this.tilemap.mapWidth &&
            tileY >= 0 && tileY < this.tilemap.mapHeight) {
            return false; // Not our responsibility
        }

        // Check if blocked by a tree
        if (this.isBlockedByTree(tileX, tileY)) {
            return false;
        }

        // Forest grass tiles are walkable
        return this.grassLayer && this.grassLayer.has(`${tileX},${tileY}`);
    }

    /**
     * Get the grass tile ID at a position (for rendering/consistency)
     */
    getGrassTileAt(tileX, tileY) {
        if (!this.grassLayer) return null;
        return this.grassLayer.get(`${tileX},${tileY}`) || null;
    }

    /**
     * Set the tile at a forest position (for hoeing, etc.)
     */
    setTileAt(tileX, tileY, tileId) {
        if (!this.grassLayer) return false;
        const key = `${tileX},${tileY}`;
        if (!this.grassLayer.has(key)) return false;

        this.grassLayer.set(key, tileId);
        return true;
    }

    /**
     * Check if a position is within forest bounds (outside main tilemap)
     */
    isForestPosition(tileX, tileY) {
        if (!this.isWithinForestBounds(tileX, tileY)) return false;
        // Must be outside main tilemap
        return tileX < 0 || tileX >= this.tilemap.mapWidth ||
               tileY < 0 || tileY >= this.tilemap.mapHeight;
    }

    /**
     * Generate forest content within a specific chunk's tile bounds.
     * Called when a player purchases a forest chunk.
     * Places trees in a diamond grid with moderate density, plus 1-2 clearings.
     */
    generateForChunk(chunkX, chunkY, chunkWidth, chunkHeight, {
        density = 0.5 + Math.random() * 0.3,  // 0.5–0.8 random per chunk
        pathExcludeYMin = null,
        pathExcludeYMax = null,
        noPocket = false   // set true to skip pocket clearing (e.g. owned farm areas)
    } = {}) {
        const litChance = 0.2;

        // Single clearing at chunk center, matching chunk-test (1 pocket per chunk, centered)
        const newPockets = [];
        if (!noPocket) {
            const pocketRadius = 6;
            const pocketCx = chunkX + Math.floor(chunkWidth / 2);
            const pocketCy = chunkY + Math.floor(chunkHeight / 2);
            const pocketTypes = [POCKET_TYPES.ORE, POCKET_TYPES.STONE, POCKET_TYPES.CROP];
            const pocketType = pocketTypes[Math.floor(Math.random() * pocketTypes.length)];
            const pocket = { centerX: pocketCx, centerY: pocketCy, radius: pocketRadius, type: pocketType };
            newPockets.push(pocket);
            this.pockets.push(pocket);
            // Mark pocket tiles so trees are excluded from the clearing
            for (let dy = -pocketRadius; dy <= pocketRadius; dy++) {
                for (let dx = -pocketRadius; dx <= pocketRadius; dx++) {
                    if (dx * dx + dy * dy <= pocketRadius * pocketRadius) {
                        this.pocketOccupiedTiles.add(`${pocketCx + dx},${pocketCy + dy}`);
                    }
                }
            }
        }

        // Place trees on diamond grid within chunk — margin=0 so trees reach chunk edges,
        // giving seamless adjacency with neighbouring chunks (no visible gap at seams).
        for (let y = chunkY + 1; y < chunkY + chunkHeight - 1; y++) {
            for (let x = chunkX; x < chunkX + chunkWidth - 1; x++) {
                if ((x + y) % 2 !== 0) continue;
                if (this.isInPocket(x, y)) continue;
                if (this.treeMap.has(`${x},${y}`)) continue; // Skip if tree already exists
                
                // Check for existing ore veins (from TreeManager or other sources)
                if (this.tilemap.oreManager) {
                    const existingOre = this.tilemap.oreManager.getOreAt(x, y);
                    if (existingOre) continue; // Skip if ore exists here
                }

                // Ensure tree fits (2 wide × 3 tall: crown at y-1, trunk at y, shadow at y+1)
                if (y - 1 < chunkY || y + 1 >= chunkY + chunkHeight) continue;
                if (x + 1 >= chunkX + chunkWidth) continue;

                // Skip trees with trunks landing ON the great path zone (y=60-63).
                // Trunks at y=59 (shadow at y=60) and y=64 (crown at y=63) are ALLOWED —
                // they render over/under the great path, which is the desired appearance.
                if (pathExcludeYMin !== null && pathExcludeYMax !== null) {
                    if (y >= pathExcludeYMin && y < pathExcludeYMax) continue;
                }

                if (Math.random() < density) {
                    const isLit = Math.random() < litChance;
                    const tree = new ForestTree(x, y, isLit);
                    this.trees.push(tree);
                    this.treeMap.set(`${x},${y}`, tree);
                    this.trunkTileMap.set(`${x},${y}`, tree);
                    this.trunkTileMap.set(`${x + 1},${y}`, tree);
                }
            }
        }

        // Update neighbour flags for all trees (cheap, covers newly added trees)
        this.updateNeighborFlags();

        // Populate new pockets
        this._populateSpecificPockets(newPockets);

        log.debug(`generateForChunk (${chunkX},${chunkY}): placed trees (density=${density.toFixed(2)}) + ${newPockets.length} pockets`);
    }

    /**
     * Place seam trees at the N-S boundary between two adjacent chunks.
     * The top chunk's last row (topChunkY + chunkHeight - 1) gets tree trunks;
     * their shadow sprites spill one tile into the bottom chunk — matching
     * exactly how chunk-test renders cross-chunk seam trees.
     *
     * Call this AFTER both adjacent chunks have been generated.
     */
    generateNSSeamTrees(topChunkX, topChunkY, chunkWidth, chunkHeight, density = 0.65) {
        const seamY = topChunkY + chunkHeight - 1; // last row of top chunk (trunk position)
        const litChance = 0.2;

        for (let x = topChunkX; x < topChunkX + chunkWidth - 1; x++) {
            if ((x + seamY) % 2 !== 0) continue;             // diamond grid
            if (this.treeMap.has(`${x},${seamY}`)) continue; // already occupied
            if (this.isInPocket(x, seamY)) continue;
            if (this.tilemap.oreManager?.getOreAt(x, seamY)) continue;

            if (Math.random() < density) {
                const isLit = Math.random() < litChance;
                const tree = new ForestTree(x, seamY, isLit);
                this.trees.push(tree);
                this.treeMap.set(`${x},${seamY}`, tree);
                this.trunkTileMap.set(`${x},${seamY}`, tree);
                this.trunkTileMap.set(`${x + 1},${seamY}`, tree);
            }
        }
        this.updateNeighborFlags();
    }

    /**
     * Place seam trees at the E-W boundary between two adjacent chunks.
     * A tree is placed with its LEFT trunk column in the left chunk's last column
     * and its RIGHT column in the right chunk's first column, matching chunk-test's
     * E-W seam approach. Both trunk-x positions are written to treeMap so the right
     * chunk's generator won't place an overlapping tree.
     *
     * Call this AFTER both adjacent chunks have been generated.
     */
    generateEWSeamTrees(leftChunkX, leftChunkY, chunkWidth, chunkHeight, density = 0.65) {
        const seamX = leftChunkX + chunkWidth - 1; // last column of left chunk (trunk left)
        const litChance = 0.2;

        for (let y = leftChunkY + 1; y < leftChunkY + chunkHeight - 1; y++) {
            if ((seamX + y) % 2 !== 0) continue;                  // diamond grid
            if (this.treeMap.has(`${seamX},${y}`)) continue;      // left-trunk occupied
            if (this.treeMap.has(`${seamX + 1},${y}`)) continue;  // right-trunk occupied
            if (y - 1 < leftChunkY || y + 1 >= leftChunkY + chunkHeight) continue;
            if (this.isInPocket(seamX, y)) continue;
            if (this.tilemap.oreManager?.getOreAt(seamX, y)) continue;

            if (Math.random() < density) {
                const isLit = Math.random() < litChance;
                const tree = new ForestTree(seamX, y, isLit);
                this.trees.push(tree);
                // Mark both trunk columns so neither chunk re-places a tree here
                this.treeMap.set(`${seamX},${y}`, tree);
                this.treeMap.set(`${seamX + 1},${y}`, tree);
                this.trunkTileMap.set(`${seamX},${y}`, tree);
                this.trunkTileMap.set(`${seamX + 1},${y}`, tree);
            }
        }
        this.updateNeighborFlags();
    }

    /**
     * Place trees at the very first row of a chunk so their crowns spill above the chunk boundary.
     * Trunks sit at y = chunkY (world), crowns render at y - 1 (may be void space or great path).
     * This fills the visual gap left by the interior loop (which starts at chunkY + 1).
     *
     * Call for forest chunks that have no directly adjacent forest chunk above them — i.e.:
     *   - Top-of-world chunks (row=0): crowns render in the void above
     *   - Farm-row forest chunks (row=2): crowns at y=63 render over the great path S-grass
     */
    generateNorthEdgeTrees(chunkX, chunkY, chunkWidth, density = 0.65) {
        const northEdgeY = chunkY; // trunk row — crown at chunkY-1 spills above
        const litChance = 0.2;

        for (let x = chunkX; x < chunkX + chunkWidth - 1; x++) {
            if ((x + northEdgeY) % 2 !== 0) continue;              // diamond grid parity
            if (this.treeMap.has(`${x},${northEdgeY}`)) continue;  // already occupied
            if (this.isInPocket(x, northEdgeY)) continue;
            if (this.tilemap.oreManager?.getOreAt(x, northEdgeY)) continue;
            if (x + 1 >= chunkX + chunkWidth) continue;            // needs 2 cols wide

            if (Math.random() < density) {
                const isLit = Math.random() < litChance;
                const tree = new ForestTree(x, northEdgeY, isLit);
                this.trees.push(tree);
                this.treeMap.set(`${x},${northEdgeY}`, tree);
                this.trunkTileMap.set(`${x},${northEdgeY}`, tree);
                this.trunkTileMap.set(`${x + 1},${northEdgeY}`, tree);
            }
        }
        this.updateNeighborFlags();
    }

    /**
     * Populate a given list of pocket objects with resources.
     * Simplified version of populatePockets() that targets only the provided pockets.
     */
    _populateSpecificPockets(pockets) {
        const oreTypes = Object.keys(ORE_TYPES).filter(k => k !== 'ROCK');
        const cropTypes = Object.keys(CROP_TYPES).filter(k => k !== 'WEED');

        for (const pocket of pockets) {
            const { centerX: cx, centerY: cy, radius, type } = pocket;
            const tiles = [];
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (dx * dx + dy * dy <= radius * radius) {
                        tiles.push({ x: cx + dx, y: cy + dy });
                    }
                }
            }
            // Shuffle tiles
            for (let i = tiles.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
            }

            const occupied = new Set();
            const markOccupied = (tx, ty, w = 1, h = 1) => {
                for (let dy = 0; dy < h; dy++) {
                    for (let dx = 0; dx < w; dx++) {
                        occupied.add(`${tx + dx},${ty + dy}`);
                        this.pocketOccupiedTiles.add(`${tx + dx},${ty + dy}`);
                    }
                }
            };

            if (type === POCKET_TYPES.ORE || type === POCKET_TYPES.STONE) {
                const oreCount = Math.floor(radius / 2) + 1;
                const oreKey = type === POCKET_TYPES.ORE
                    ? oreTypes[Math.floor(Math.random() * oreTypes.length)]
                    : 'ROCK';
                let placed = 0;
                for (const t of tiles) {
                    if (placed >= oreCount) break;
                    if (occupied.has(`${t.x},${t.y}`) || occupied.has(`${t.x + 1},${t.y}`) ||
                        occupied.has(`${t.x},${t.y + 1}`) || occupied.has(`${t.x + 1},${t.y + 1}`)) continue;
                    const ore = new OreVein(t.x, t.y, ORE_TYPES[oreKey]);
                    this.pocketOreVeins.push(ore);
                    markOccupied(t.x, t.y, 2, 2);
                    placed++;
                }
            } else if (type === POCKET_TYPES.CROP) {
                const cropKey = cropTypes[Math.floor(Math.random() * cropTypes.length)];
                const cropCount = Math.floor(radius * 1.5) + 2;
                let placed = 0;
                for (const t of tiles) {
                    if (placed >= cropCount) break;
                    if (occupied.has(`${t.x},${t.y}`)) continue;
                    const cropType = CROP_TYPES[cropKey];
                    const crop = new Crop(t.x, t.y, cropType);
                    this.pocketCrops.push(crop);
                    markOccupied(t.x, t.y);
                    placed++;
                }
            }
        }
    }

    /**
     * Clear all trees
     */
    clear() {
        this.trees = [];
        this.treeMap.clear();
        this.trunkTileMap.clear();
        this.grassLayer = null;
        this.choppingEffects = [];
    }
}
