import { Camera } from './Camera.js';
import { Well } from './Well.js';
import { TilemapRenderer } from './TilemapRenderer.js';
import { SpriteAnimator } from './SpriteAnimator.js';
import { InputManager } from './InputManager.js';
import { CropManager } from './CropManager.js';
import { Crop, CROP_TYPES } from './Crop.js';
import { Toolbar } from './Toolbar.js';
import { TileSelector } from './TileSelector.js';
import { JobManager } from './JobManager.js';
import { Pathfinder, PATH_TILES } from './Pathfinder.js';
import { TileOverlayManager } from './TileOverlayManager.js';
import { EnemyManager } from './EnemyManager.js';
import { OreManager } from './OreManager.js';
import { TreeManager } from './TreeManager.js';
import { FlowerManager } from './FlowerManager.js';
import { Inventory, RESOURCE_TYPES } from './Inventory.js';
import { UIManager } from './UIManager.js';
import { ORE_TYPES } from './OreVein.js';
import { CONFIG, getRandomPathTile } from './config.js';
import { ForestGenerator } from './ForestGenerator.js';
import { ChunkManager } from './ChunkManager.js';
import { ChunkGeneratorRegistry } from './ChunkGeneratorRegistry.js';
import { ForestChunkGenerator, DenseForestChunkGenerator, SparseForestChunkGenerator } from './ForestChunkGenerator.js';
import { JobQueueUI } from './JobQueueUI.js';
import { IdleManager } from './IdleManager.js';
import { TravelerManager } from './TravelerManager.js';
import { RoadsideStand } from './RoadsideStand.js';
import { createHarvestEffect, updateEffects, renderEffects as renderFloatingEffects, renderEffectsMulti } from './EffectUtils.js';
import { ReplenishZoneManager } from './ReplenishZoneManager.js';
import { SaveManager } from './SaveManager.js';
import { BuildingManager } from './BuildingManager.js';
import { BUILDING_DEFS, VILLAGER_MILESTONES } from './BuildingRegistry.js';
import { PathConnectivity } from './PathConnectivity.js';
import { VillagerManager } from './VillagerManager.js';
import { Logger } from './Logger.js';

const log = Logger.create('Game');

// Animation frame counts for human character
const ANIMATION_DATA = {
    ATTACK: 10,
    AXE: 10,
    CARRY: 8,
    CASTING: 15,
    CAUGHT: 10,
    DEATH: 13,
    DIG: 13,
    DOING: 8,
    HAMMERING: 23,
    HURT: 8,
    IDLE: 9,
    JUMP: 9,
    MINING: 10,
    REELING: 13,
    ROLL: 10,
    RUN: 8,
    SWIMMING: 12,
    WAITING: 9,
    WALKING: 8,
    WATERING: 5
};

// Animation frame counts for goblin character
// Some sprites have incorrect frame counts in filenames or use multi-row layouts
const GOBLIN_ANIMATION_DATA = {
    ATTACK: { frames: 9, framesPerRow: null },      // Filename says 10, actual is 9
    AXE: { frames: 10, framesPerRow: null },
    CARRY: { frames: 8, framesPerRow: null },
    CASTING: { frames: 15, framesPerRow: 10 },      // Multi-row: 960x128
    CAUGHT: { frames: 10, framesPerRow: null },
    DEATH: { frames: 9, framesPerRow: null },       // Filename says 13, actual is 9
    DIG: { frames: 13, framesPerRow: 10 },          // Multi-row: 960x128
    DOING: { frames: 8, framesPerRow: null },
    HAMMERING: { frames: 23, framesPerRow: 10 },    // Multi-row: 960x192
    HURT: { frames: 8, framesPerRow: null },
    IDLE: { frames: 8, framesPerRow: null },        // Filename says 9, actual is 8
    JUMP: { frames: 9, framesPerRow: null },
    MINING: { frames: 10, framesPerRow: null },
    REELING: { frames: 13, framesPerRow: 10 },      // Multi-row: 960x128
    ROLL: { frames: 10, framesPerRow: null },
    RUN: { frames: 8, framesPerRow: null },
    SWIMMING: { frames: 12, framesPerRow: null },   // 32px wide frames
    WAITING: { frames: 8, framesPerRow: null },     // Filename says 9, actual is 8
    WALKING: { frames: 8, framesPerRow: null },
    WATERING: { frames: 5, framesPerRow: null }
};

export class Game {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        // Disable image smoothing for pixel-perfect rendering
        this.ctx.imageSmoothingEnabled = false;

        // Set canvas to fill window
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.camera = null;
        this.tilemap = null;
        this.characters = [];
        this.inputManager = null;
        this.cropManager = null;

        // Human character state
        this.humanSprites = null;
        this.humanPosition = null;
        this.currentHairStyle = 'curly';
        this.currentAnimation = 'IDLE';

        // Goblin character state
        this.goblinSprite = null;
        this.goblinPosition = null;
        this.goblinAnimation = 'IDLE';
        this.goblinFacingLeft = false;

        // Goblin movement state
        this.goblinCurrentPath = null;
        this.goblinCurrentWorkTile = null;
        this.goblinAnimationSession = 0; // For callback invalidation

        // Goblin health (from config)
        this.goblinMaxHealth = CONFIG.goblin.maxHealth;
        this.goblinHealth = this.goblinMaxHealth;
        this.goblinLastDamageTime = 0; // For regen delay tracking
        this.goblinDamageFlashing = false;
        this.goblinDamageFlashTimer = 0;

        // New systems
        this.toolbar = null;
        this.tileSelector = null;
        this.jobManager = null;
        this.pathfinder = null;
        this.overlayManager = null;
        this.enemyManager = null;
        this.oreManager = null;
        this.treeManager = null;
        this.flowerManager = null;
        this.forestGenerator = null;
        this.chunkGeneratorRegistry = null;
        this.chunkManager = null;

        // Inventory and UI
        this.inventory = null;
        this.uiManager = null;
        this.jobQueueUI = null;
        this.idleManager = null;

        // Gold display (count-up animation)
        this.displayedGold = 0;    // Currently shown value (animates toward targetGold)
        this.targetGold = 0;       // Actual gold in inventory
        this._goldAmountEl = null; // DOM span element

        // Floating effects for seed drops (wild crop harvests)
        this._seedEffects = [];

        // Physics-based seed drop effects from fully-depleted trees
        this._treeSeedDropEffects = [];

        // Pre-allocated depth-sort entity list — reused every frame to avoid GC pressure
        this._depthEntities = [];

        // Goblin hire state (UI shows goblin controls only after hiring)
        this.goblinHired = false;

        // Goblin house (claimed when hired; null if no active_empty small_house available)
        this.goblinHouseBuilding = null;
        this._goblinNeedsHouse = false;  // true when hired without an available house
        this._goblinIdleTimer  = 0;      // ms since goblin last had a job (for home-return)

        // Home upgrade state (Phase 3)
        this.homeUpgrades = {
            slots: [null],  // Level 1 = 1 slot; value: null | 'cauldron' | 'anvil' | 'shrine'
            shrineUpgrades: {
                fertileSoilLevel: 0,        // 0=none, 1=−15%, 2=−30%
                bountifulHarvest: false,
                roadsideReplenishment: false
            },
            purchasedToolUpgrades: new Set()
        };

        // Replenishable zone manager (auto-replanting system)
        this.replenishZoneManager = null;

        // Save/load manager
        this.saveManager = null;

        // Phase 4a: Building placement + path system
        this.buildingManager = null;
        this.playerPlacedPaths = new Set();   // "tileX,tileY" keys for player-placed path tiles
        this._buildPlacementMode = null;      // null | { type:'path' } | { type:'building', defId, zeroCost }
        this._buildPlacementTileX = 0;
        this._buildPlacementTileY = 0;
        this._buildPlacementValid = false;
        this._showPathDebug = false;
        this._showBuildingDebug = false;

        // Phase 4a: Milestone tracking
        this.milestones = {
            totalGoldEarned:        0,
            totalCropsHarvested:    0,
            totalCropsPlanted:      0,
            totalPotionsCrafted:    0,
            totalAnvilUpgrades:     0,
            totalShrineUpgrades:    0,
            totalChunksOwned:       1,  // Starts at 1 (farm chunk)
            totalVillagersRecruited:0,
            goblinEverHired:        false,
        };
        this._prevInventoryGold = 50;  // Track for totalGoldEarned delta

        // Town chunk expansion (villager-gated; 0 = no town chunks claimed yet)
        this.townChunksUnlocked = 0;

        // Phase 4a: Villager + path connectivity (initialized in init())
        this.pathConnectivity = null;
        this.villagerManager = null;

        // Roadside stand and traveler service
        this.roadsideStand = null;
        this.standService = { state: 'idle', workerId: null, slotIndex: -1, traveler: null, waitTimer: 0 };
        this.standQueue = [];   // Array of { traveler, waitTimer } waiting for the stand

        // Well (placed on farm chunk, east of house)
        this.well = null;

        // Watering can water levels (human + goblin)
        this.wateringCanWater = CONFIG.watering.canMaxCapacity;
        this.wateringCanMaxWater = CONFIG.watering.canMaxCapacity;
        this.goblinWaterCanWater = CONFIG.watering.canMaxCapacity;
        this.goblinWaterCanMaxWater = CONFIG.watering.canMaxCapacity;

        // Chimney smoke animation (rendered above roof when player is outside new house)
        this.chimneySmoke = null;
        this.chimneySmokePauseTimer = 0; // seconds remaining in gap between smoke cycles

        // Tool animation speed multipliers (modified by upgrades)
        this.toolAnimationMultipliers = {};

        // Player combat stats (from config)
        this.playerMaxHealth = CONFIG.player.maxHealth;
        this.playerHealth = this.playerMaxHealth;
        this.playerDamage = CONFIG.player.damage;
        this.playerVisionRange = CONFIG.player.visionRange;
        this.playerAttackRange = CONFIG.player.attackRange;

        // Combat state
        this.isInCombat = false;
        this.combatTarget = null; // Current enemy being attacked
        this.engagedEnemies = new Set(); // Enemies that have engaged the player
        this.isPlayerAttacking = false;
        this.playerAttackCooldown = CONFIG.player.attackCooldown;
        this.lastPlayerAttackTime = 0;

        // Damage flash effect for player
        this.playerDamageFlashing = false;
        this.playerDamageFlashTimer = 0;
        this.playerLastDamageTime = 0; // For health regen delay tracking

        // Animation session counter - incremented each time animation changes
        // Used to invalidate stale callbacks from previous animations
        this.animationSession = 0;

        // Input mode and tool state
        this.inputMode = 'pan';  // 'pan' | 'tool'
        this.currentTool = null;

        // Character movement
        this.currentPath = null;
        this.moveSpeed = CONFIG.player.moveSpeed;
        this.pathPositions = [];

        // Character direction (false = right, true = left)
        this.facingLeft = false;

        // Current work tile (the tile being worked on, character stands adjacent)
        this.currentWorkTile = null;

        // Pixel-precise slide state — sub-tile glide after pathfinding completes
        this.humanPixelTarget = null;    // {px, py} pending slide destination, or null
        this.humanIsSliding = false;
        this.humanSlideStart = null;
        this.humanSlideTarget = null;
        this.humanSlideElapsed = 0;
        this.goblinPixelTarget = null;
        this.goblinIsSliding = false;
        this.goblinSlideStart = null;
        this.goblinSlideTarget = null;
        this.goblinSlideElapsed = 0;

        this.lastTime = 0;
        this.running = false;
    }

    resize() {
        // Account for device pixel ratio to prevent subpixel rendering artifacts
        const dpr = window.devicePixelRatio || 1;
        const displayWidth = window.innerWidth;
        const displayHeight = window.innerHeight;

        // Set canvas internal resolution to match device pixels
        this.canvas.width = Math.floor(displayWidth * dpr);
        this.canvas.height = Math.floor(displayHeight * dpr);

        // Camera handles DPR scaling in applyTransform
        if (this.camera) {
            this.camera.updateCanvasSize(displayWidth, displayHeight);
        }
    }

    async init() {
        try {
            log.info('Initializing game...');

            // Initialize camera with CSS display dimensions (not DPR-scaled canvas.width)
            this.camera = new Camera(window.innerWidth, window.innerHeight);

            // Initialize tilemap with chunk-based world map (210×240 tiles)
            this.tilemap = new TilemapRenderer();
            await this.tilemap.generateChunkMap('Tileset/spr_tileset_sunnysideworld_16px.png');

            // Initialize chunk manager and set up 3×5 initial grid
            this.chunkManager = new ChunkManager(this.tilemap);
            this.chunkManager.initialize();
            this.chunkManager.onChunkPurchased = (chunk) => {
                this._onChunkPurchased(chunk);
            };

            // Place path tiles in the new chunk layout
            this.placePathTilesInMap();

            // Initialize roadside stand (placed at north edge of farm, x=23-26, y=49)
            this.roadsideStand = new RoadsideStand(this.tilemap);
            this.roadsideStand.registerInteractable();
            this.roadsideStand._onTravelerArrived = (t) => this._onTravelerAtStand(t);
            this.roadsideStand._onPurchaseReady   = (t) => this._onPurchaseReady(t);

            // Initialize well (placed on farm chunk, x=23-24, y=39-41 east of house)
            this.well = new Well(this.tilemap);
            this.well.registerInteractable();

            // Center camera on the new house (farm chunk)
            const houseCenter = this.tilemap.getHouseCenter();
            this.camera.x = houseCenter.x;
            this.camera.y = houseCenter.y;

            // Initialize forest generator — per-chunk generation with random density.
            // Each initial forest chunk is generated independently so it has its own
            // density and resources (pocket ores/crops). Using generateForChunk() instead
            // of generate() avoids the "outside tilemap" restriction in the pocket placement
            // logic, meaning resources actually spawn in the initial forest chunks.
            this.forestGenerator = new ForestGenerator(this.tilemap, this.chunkManager);
            this._generatedSeams = new Set(); // tracks "col,row,S/E/NE" keys so seams are only placed once

            // Wire the extensible chunk generator registry so ChunkManager can resolve
            // biome types and generate correct ground tiles for future chunk types.
            this.chunkGeneratorRegistry = new ChunkGeneratorRegistry();
            this.chunkGeneratorRegistry.register(new ForestChunkGenerator(this.forestGenerator));
            this.chunkGeneratorRegistry.register(new DenseForestChunkGenerator(this.forestGenerator));
            this.chunkGeneratorRegistry.register(new SparseForestChunkGenerator(this.forestGenerator));
            this.chunkManager.generatorRegistry = this.chunkGeneratorRegistry;

            // Assign biomes to all chunks north of the great path.
            // Center col town chunk gets sparse_forest — lightly treed, player clears it.
            // All other north chunks get dense_forest (permanently locked, no clearings).
            const { homeCol, homeRow } = CONFIG.chunks;
            const northForestMap = {};
            for (let row = 0; row <= homeRow; row++) {
                for (let col = 0; col < CONFIG.chunks.initialGridCols; col++) {
                    if (col === homeCol && row === homeRow) {
                        northForestMap[`${col},${row}`] = 'sparse_forest'; // town chunk
                    } else {
                        northForestMap[`${col},${row}`] = 'dense_forest';  // flanking locked forest
                    }
                }
            }
            this.chunkGeneratorRegistry.setDesignerMap(northForestMap);

            // Great path exclusion zone: tree trunks must not land on y=45-48 (the great path strip).
            // Trunks at y=44 (shadow at y=45) and y=49 (crown at y=48) ARE allowed — they render
            // over/under the great path visually, which is the desired appearance.
            const pathYMin = CONFIG.chunks.mainPathY;                          // 45
            const pathYMax = CONFIG.chunks.mainPathY + CONFIG.chunks.mainPathGap; // 49

            // Generate each initial forest chunk independently.
            // Farm (col=1,row=3) is skipped (it has its own separate setup below).
            // Former town chunks (store/home col=1) are now type 'forest' and ARE generated here.
            // North forest: dense (noPocket, density=0.9); former town: sparse (noPocket, density=0.3).
            for (const chunk of this.chunkManager.chunks.values()) {
                if (chunk.type !== 'forest') continue;
                const bounds = this.chunkManager.getChunkBounds(chunk.col, chunk.row);
                // Pass path exclusion only for chunks whose world y-range overlaps y=45-48
                const needsPathExclude = (bounds.y + bounds.height) > pathYMin && bounds.y < pathYMax;
                this.forestGenerator.generateForChunk(
                    bounds.x, bounds.y, bounds.width, bounds.height,
                    {
                        pathExcludeYMin: needsPathExclude ? pathYMin : null,
                        pathExcludeYMax: needsPathExclude ? pathYMax : null,
                        noPocket: chunk.row <= CONFIG.chunks.homeRow // dense_forest: no pocket
                    }
                );
            }

            // Generate seam trees between every adjacent pair of initial forest chunks.
            // Mark each generated seam in _generatedSeams so _onChunkPurchased never re-runs them.
            for (const chunk of this.chunkManager.chunks.values()) {
                if (chunk.type !== 'forest') continue;
                const bounds = this.chunkManager.getChunkBounds(chunk.col, chunk.row);

                const southChunk = this.chunkManager.getChunkAt(chunk.col, chunk.row + 1);
                if (southChunk && southChunk.type === 'forest') {
                    this.forestGenerator.generateNSSeamTrees(
                        bounds.x, bounds.y, bounds.width, bounds.height
                    );
                    this._generatedSeams.add(`${chunk.col},${chunk.row},S`);
                }

                const eastChunk = this.chunkManager.getChunkAt(chunk.col + 1, chunk.row);
                if (eastChunk && eastChunk.type === 'forest') {
                    this.forestGenerator.generateEWSeamTrees(
                        bounds.x, bounds.y, bounds.width, bounds.height
                    );
                    this._generatedSeams.add(`${chunk.col},${chunk.row},E`);
                }
            }

            // Generate north edge trees (trunks at first row, crowns spill above chunk).
            // Mark each in _generatedSeams so they are never re-generated on chunk purchase.
            //   - NS seam trees (trunks at chunkY-1) and north edge trees (trunks at chunkY)
            //     occupy complementary diamond-grid positions ((x+y)%2 alternates), so they
            //     coexist in treeMap without conflicts and fill all positions at the seam.
            //   - Top-of-world chunks (row=0): crowns at y=-1 render into void (invisible)
            //   - Farm-adjacent forest chunks (row=3): crowns at y=48 render over great path S-grass
            for (const chunk of this.chunkManager.chunks.values()) {
                if (chunk.type !== 'forest') continue;
                const bounds = this.chunkManager.getChunkBounds(chunk.col, chunk.row);
                this.forestGenerator.generateNorthEdgeTrees(bounds.x, bounds.y, bounds.width);
                this._generatedSeams.add(`${chunk.col},${chunk.row},NE`);
            }

            // Initialize enemy manager before creating characters
            this.enemyManager = new EnemyManager(this.tilemap);

            // Track occupied base tiles to prevent overlapping spawns
            let occupiedBaseTiles = new Set();

            // Create characters at random positions
            await this.createCharacters(occupiedBaseTiles);

            // Mark all path tiles as occupied to prevent entity spawning
            for (const pos of this.pathPositions) {
                occupiedBaseTiles.add(`${pos.x},${pos.y}`);
            }

            // Initialize tree manager (no initial TreeManager trees — farm chunk has no trees;
            // surrounding forest chunks use ForestGenerator-style trees for visual consistency)
            this.treeManager = new TreeManager(this.tilemap);

            // Mark forest tree trunk positions as occupied to prevent ore/crop overlap
            for (const key of this.forestGenerator.trunkTileMap.keys()) {
                occupiedBaseTiles.add(key);
            }

            // Initialize crop manager and spawn a few wild tier-1 crops on the farm
            this.cropManager = new CropManager(this.tilemap);
            this.cropManager.setGame(this);
            this.spawnCropsAvoidingOccupied(['CARROT', 'RADISH', 'PARSNIP'], occupiedBaseTiles);

            // Initialize ore manager and spawn ores (avoiding occupied tiles)
            // Always spawn one stone ore for testing crafting, plus one random ore
            this.oreManager = new OreManager(this.tilemap);
            this.spawnOresAvoidingOccupied(1, occupiedBaseTiles, ORE_TYPES.ROCK); // Stone ore for crafting
            this.spawnOresAvoidingOccupied(1, occupiedBaseTiles); // Random ore

            // Initialize inventory system
            this.inventory = new Inventory();
            // Give player starting gold (enough to buy a few cheap seeds to start)
            this.inventory.addGold(50);

            // Wire inventory and game ref into chunk manager
            if (this.chunkManager) {
                this.chunkManager.inventory = this.inventory;
                this.chunkManager.game = this;
            }

            // Initialize UI manager
            this.uiManager = new UIManager(this);

            // Initialize gold display and subscribe to inventory changes.
            // Must be called AFTER UIManager so that chaining onto onChange() captures
            // UIManager's callback as the "existing" subscriber.
            this._initGoldDisplay();

            // Initialize debug menu
            this._initDebugMenu();

            // Initialize zone management panel event listeners
            this._initZonePanel();

            // Initialize input manager
            this.inputManager = new InputManager(this.canvas, this.camera);
            this.inputManager.init();

            // Set up click handler for harvesting
            this.inputManager.setClickCallback((worldX, worldY) => {
                try {
                    this.onWorldClick(worldX, worldY);
                } catch (error) {
                    log.error('Error in click handler:', error);
                }
            });

            // Hover callback for building ghost preview
            this.inputManager.setHoverCallback((worldX, worldY) => {
                if (this._buildPlacementMode?.type === 'building') {
                    const tileSize = this.tilemap.tileSize;
                    this._buildPlacementTileX = Math.floor(worldX / tileSize);
                    this._buildPlacementTileY = Math.floor(worldY / tileSize);
                    this._buildPlacementValid = this._validateBuildingPlacement(
                        this._buildPlacementMode.defId,
                        this._buildPlacementTileX,
                        this._buildPlacementTileY
                    );
                }
            });

            // Key callback for cancelling build placement with Escape
            this.inputManager.setKeyCallback((key) => {
                if (key === 'Escape' && this._buildPlacementMode) {
                    this._cancelBuildPlacement();
                }
            });

            // Initialize new systems
            this.pathfinder = new Pathfinder(this.tilemap);
            this.pathfinder.setForestGenerator(this.forestGenerator);
            this.pathfinder.setTreeManager(this.treeManager);
            this.pathfinder.setOreManager(this.oreManager);
            if (this.roadsideStand) this.pathfinder.setRoadsideStand(this.roadsideStand);
            if (this.well) this.pathfinder.setWell(this.well);

            // Building manager for player-placed buildings
            this.buildingManager = new BuildingManager(this.tilemap);
            this.buildingManager.onBuildingCompleted = (b) => this._onBuildingCompleted(b);
            this.pathfinder.setBuildingManager(this.buildingManager);

            // Path connectivity (BFS from building doors to great path)
            this.pathConnectivity = new PathConnectivity(this.tilemap);
            this.pathConnectivity.setPlayerPlacedPaths(this.playerPlacedPaths);

            // Villager system
            this.villagerManager = new VillagerManager(this);
            this.overlayManager = new TileOverlayManager(this.tilemap);
            this.overlayManager.setForestGenerator(this.forestGenerator);
            this.initPathEdgeOverlays();
            this.tileSelector = new TileSelector(this.tilemap, this.camera, this.overlayManager, this.cropManager);
            this.tileSelector.setDependencies({
                enemyManager: this.enemyManager,
                oreManager: this.oreManager,
                treeManager: this.treeManager,
            });
            this.jobManager = new JobManager(this);
            // Register workers (characters that can process jobs)
            this.jobManager.registerWorker('human');
            this.jobManager.registerWorker('goblin');
            this.toolbar = new Toolbar(this, this.tilemap);

            // Initialize job queue UI panel
            this.jobQueueUI = new JobQueueUI(this);

            // Initialize idle manager (character auto-tasks when queue is empty)
            this.idleManager = new IdleManager(this);
            this.idleManager.init();

            // Initialize replenishable zone manager (auto-replanting system)
            this.replenishZoneManager = new ReplenishZoneManager(this, this.jobManager, this.inventory);
            // Subscribe: reactivate paused zones when seeds are acquired
            this.inventory.onChange(() => this.replenishZoneManager.checkPausedZones());

            // Subscribe: track gold earned for milestone system
            this.inventory.onChange(() => {
                const gold = this.inventory.getGold();
                if (gold > this._prevInventoryGold) {
                    this.milestones.totalGoldEarned += gold - this._prevInventoryGold;
                }
                this._prevInventoryGold = gold;
            });

            // Spawn enemies from forest pockets
            await this.spawnForestPocketEnemies();

            // Initialize flower manager (spawns flowers on grass tiles over time)
            this.flowerManager = new FlowerManager(this.tilemap, this.overlayManager);
            this.flowerManager.setDependencies({
                cropManager: this.cropManager,
                treeManager: this.treeManager,
                oreManager: this.oreManager,
                enemyManager: this.enemyManager,
                forestGenerator: this.forestGenerator,
                chunkManager: this.chunkManager ?? null,
            });

            // Initialize traveler manager (spawns NPC travelers on the great path)
            this.travelerManager = new TravelerManager(this.tilemap);
            if (this.roadsideStand) this.travelerManager.setStand(this.roadsideStand);
            this.travelerManager.setCamera(this.camera);
            this.travelerManager.setVillagerManager(this.villagerManager);

            // Wire remaining TileSelector dependencies (deferred until their managers are ready)
            this.tileSelector.setDependencies({
                flowerManager: this.flowerManager,
                chunkManager: this.chunkManager ?? null,
                forestGenerator: this.forestGenerator,
                game: this,
            });

            // Connect enemy manager to pathfinder and game
            this.enemyManager.setPathfinder(this.pathfinder);
            this.enemyManager.setGame(this);

            // Set up drag callbacks for tile selection
            this.inputManager.setDragStartCallback((worldX, worldY) => {
                try {
                    const canDrag = this.inputMode === 'tool' &&
                        (this.currentTool || this.tileSelector.zoneExpansionMode);
                    if (canDrag) {
                        this.tileSelector.startSelection(worldX, worldY);
                    }
                } catch (error) {
                    log.error('Error in drag start handler:', error);
                }
            });

            this.inputManager.setDragMoveCallback((worldX, worldY) => {
                try {
                    const canDrag = this.inputMode === 'tool' &&
                        (this.currentTool || this.tileSelector.zoneExpansionMode);
                    if (canDrag) {
                        this.tileSelector.updateSelection(worldX, worldY);
                    }
                } catch (error) {
                    log.error('Error in drag move handler:', error);
                }
            });

            this.inputManager.setDragEndCallback((worldX, worldY, hasMoved) => {
                try {
                    const canDrag = this.inputMode === 'tool' &&
                        (this.currentTool || this.tileSelector.zoneExpansionMode);
                    if (canDrag) {
                        this.onTileSelectionComplete();
                    }
                } catch (error) {
                    log.error('Error in drag end handler:', error);
                }
            });

            // Initialize chimney smoke animation for the new house (tile 349 = chimney in Roof Detail)
            // Chimney is at Roof Detail local (2,2) = world (newHouseOffsetX+2, newHouseOffsetY+2).
            // Smoke renders on the tile ABOVE the chimney: world (newHouseOffsetX+2, newHouseOffsetY+1).
            // In chunk map: newHouseOffsetX=16, newHouseOffsetY=52 → chimney at (18, 54), smoke at (18, 53).
            {
                const tileSize = this.tilemap.tileSize;
                const smokeWorldX = (this.tilemap.newHouseOffsetX + 2) * tileSize + tileSize / 2 - 1;
                const smokeWorldY = (this.tilemap.newHouseOffsetY + 1) * tileSize + tileSize / 2 - 4;
                // chimneysmoke_02_strip30.png: 300x30px → 30 frames, each 10x30px
                this.chimneySmoke = new SpriteAnimator(smokeWorldX, smokeWorldY, 30, 12);
                await this.chimneySmoke.load('Elements/VFX/Chimney Smoke/chimneysmoke_02_strip30.png');
                this.chimneySmoke.setLooping(false);
                this.chimneySmoke.setOnComplete(() => { this.chimneySmokePauseTimer = 2; });
            }

            // Initialize save manager and start auto-save
            this.saveManager = new SaveManager(this);
            this.saveManager.startAutoSave();

            log.info('Game initialized successfully!');
        } catch (error) {
            log.error('Failed to initialize game:', error);
            throw error;
        }
    }

    async createCharacters(occupiedBaseTiles) {
        // Create Human character at the spawn position (bottom center of house)
        const spawnPos = this.tilemap.getPlayerSpawnPosition();
        this.humanPosition = { x: spawnPos.x, y: spawnPos.y };
        occupiedBaseTiles.add(`${spawnPos.tileX},${spawnPos.tileY}`);
        await this.loadHumanSprites();
        log.debug(`Human placed at tile (${spawnPos.tileX}, ${spawnPos.tileY})`);

        // Goblin is hidden until hired from debug menu — goblinPosition stays null.
        // Load the sprite at an off-screen position so it's ready when hire is called.
        await this.loadGoblinSprite();
        log.debug('Goblin sprite loaded (hidden until hired)');

        // No initial skeleton enemy — enemies spawn from forest pockets only
    }

    // Spawn crops avoiding occupied base tiles
    // Spawn 1-2 wild crops of each given type key (e.g. ['CARROT','RADISH','PARSNIP']).
    // Crops spawned here are wild: startAsPlanted=false → wateringState='growing', no watering needed.
    spawnCropsAvoidingOccupied(cropTypeKeys, occupiedBaseTiles) {
        for (const key of cropTypeKeys) {
            const cropType = CROP_TYPES[key];
            if (!cropType) continue;

            const count = 1 + Math.floor(Math.random() * 2); // 1 or 2
            for (let i = 0; i < count; i++) {
                let position, posKey;
                let attempts = 0;

                do {
                    position = this.tilemap.getRandomTilePosition();
                    posKey = `${position.tileX},${position.tileY}`;
                    attempts++;
                } while (occupiedBaseTiles.has(posKey) && attempts < 100);

                if (attempts >= 100) continue;

                occupiedBaseTiles.add(posKey);

                // startAsPlanted=false → wild crop, auto-grows without watering
                const crop = new Crop(position.tileX, position.tileY, cropType);
                this.cropManager.crops.push(crop);
            }
        }

        log.debug(`Spawned ${this.cropManager.crops.length} wild crops`);
    }

    // Spawn ore veins avoiding occupied base tiles
    // Optional oreType parameter to spawn a specific type
    spawnOresAvoidingOccupied(count, occupiedBaseTiles, oreType = null) {
        for (let i = 0; i < count; i++) {
            let tileX, tileY;
            let attempts = 0;
            let conflict;

            do {
                const pos = this.tilemap.getRandomTilePosition();
                // Ensure room for 2x2 ore
                tileX = Math.min(pos.tileX, this.tilemap.mapWidth - 2);
                tileY = Math.min(pos.tileY, this.tilemap.mapHeight - 2);

                // Make sure we're in the grass area
                const grassStartY = this.tilemap.houseOffsetY + this.tilemap.houseHeight;
                if (tileY < grassStartY) {
                    tileY = grassStartY;
                }

                // Check all 4 base tiles of the 2x2 ore for conflicts
                conflict = false;
                for (let ox = 0; ox < 2; ox++) {
                    for (let oy = 0; oy < 2; oy++) {
                        if (occupiedBaseTiles.has(`${tileX + ox},${tileY + oy}`)) {
                            conflict = true;
                            break;
                        }
                    }
                    if (conflict) break;
                }

                attempts++;
            } while (conflict && attempts < 100);

            if (attempts >= 100) continue;

            // Mark all 4 tiles as occupied
            for (let ox = 0; ox < 2; ox++) {
                for (let oy = 0; oy < 2; oy++) {
                    occupiedBaseTiles.add(`${tileX + ox},${tileY + oy}`);
                }
            }

            this.oreManager.spawnOre(tileX, tileY, oreType);
        }

        log.debug(`Spawned ${this.oreManager.oreVeins.length} ore veins`);
    }

    // Spawn enemies from forest pockets
    async spawnForestPocketEnemies() {
        if (!this.forestGenerator || !this.enemyManager) return;

        const pendingSpawns = this.forestGenerator.getPendingEnemySpawns();
        for (const spawn of pendingSpawns) {
            await this.enemyManager.spawnEnemy(spawn.tileX, spawn.tileY, spawn.type);
        }

        if (pendingSpawns.length > 0) {
            log.debug(`Spawned ${pendingSpawns.length} enemies in forest pockets`);
        }
    }

    async loadHumanSprites(expectedSession = null, animationToLoad = null) {
        // Use passed animation name, or fall back to currentAnimation for backwards compatibility
        const animation = animationToLoad || this.currentAnimation;
        const frameCount = ANIMATION_DATA[animation];

        // Handle filename variations in asset files
        let animLower;
        if (animation === 'HAMMERING') {
            animLower = 'hamering'; // Misspelling in assets
        } else if (animation === 'WALKING') {
            animLower = 'walk'; // Uses "walk" not "walking"
        } else {
            animLower = animation.toLowerCase();
        }

        const basePath = `Characters/Human/${animation}/base_${animLower}_strip${frameCount}.png`;
        const hairPath = `Characters/Human/${animation}/${this.currentHairStyle}hair_${animLower}_strip${frameCount}.png`;
        const toolsPath = `Characters/Human/${animation}/tools_${animLower}_strip${frameCount}.png`;

        const baseSprite = new SpriteAnimator(this.humanPosition.x, this.humanPosition.y, frameCount, 8);
        const hairSprite = new SpriteAnimator(this.humanPosition.x, this.humanPosition.y, frameCount, 8);
        const toolsSprite = new SpriteAnimator(this.humanPosition.x, this.humanPosition.y, frameCount, 8);

        await baseSprite.load(basePath);
        await hairSprite.load(hairPath);
        await toolsSprite.load(toolsPath);

        // CRITICAL FIX: Only assign sprites if session hasn't changed during loading
        // This prevents a race condition where a slower-loading animation overwrites
        // a faster-loading one that was started later
        if (expectedSession !== null && this.animationSession !== expectedSession) {
            return false; // Indicate sprites were not assigned (superseded by newer animation)
        }

        this.humanSprites = [baseSprite, hairSprite, toolsSprite];
        return true; // Indicate sprites were assigned
    }

    async loadGoblinSprite(animationToLoad = null) {
        const animation = animationToLoad || this.goblinAnimation;
        const animData = GOBLIN_ANIMATION_DATA[animation];
        const frameCount = animData.frames;
        const framesPerRow = animData.framesPerRow;

        // Handle filename variations (same as human assets)
        let animLower;
        if (animation === 'HAMMERING') {
            animLower = 'hammering';
        } else if (animation === 'WALKING') {
            animLower = 'walk';
        } else {
            animLower = animation.toLowerCase();
        }

        // Get the original filename frame count (may differ from actual frames)
        const filenameFrameCount = this.getGoblinFilenameFrameCount(animation);
        const spritePath = `Characters/Goblin/PNG/spr_${animLower}_strip${filenameFrameCount}.png`;

        const spawnX = this.goblinPosition?.x ?? -1000;
        const spawnY = this.goblinPosition?.y ?? -1000;
        const sprite = new SpriteAnimator(spawnX, spawnY, frameCount, 8, framesPerRow);
        await sprite.load(spritePath);

        this.goblinSprite = sprite;
        this.goblinSprite.setFacingLeft(this.goblinFacingLeft);
        return true;
    }

    // Get the frame count used in the filename (may differ from actual frame count)
    getGoblinFilenameFrameCount(animation) {
        const filenameFrameCounts = {
            ATTACK: 10, AXE: 10, CARRY: 8, CASTING: 15, CAUGHT: 10,
            DEATH: 13, DIG: 13, DOING: 8, HAMMERING: 23, HURT: 8,
            IDLE: 9, JUMP: 9, MINING: 10, REELING: 13, ROLL: 10,
            RUN: 8, SWIMMING: 12, WAITING: 9, WALKING: 8, WATERING: 5
        };
        return filenameFrameCounts[animation] || GOBLIN_ANIMATION_DATA[animation].frames;
    }

    async setHairStyle(hairStyle) {
        if (this.currentHairStyle === hairStyle) return;
        this.currentHairStyle = hairStyle;
        await this.loadHumanSprites();
    }

    async setAnimation(animation, loop = true, onComplete = null, speedMultiplier = 1.0) {
        log.debug(`[setAnimation] Called with animation=${animation}, loop=${loop}, hasCallback=${!!onComplete}`);

        // COMBAT GUARD: Prevent work animations during combat
        // This is a fail-safe in case something tries to start a work animation
        if (this.isInCombat && !['IDLE', 'WALKING', 'ATTACK', 'HURT', 'DEATH'].includes(animation)) {
            log.warn(`Blocked work animation "${animation}" during combat!`);
            return;
        }

        // CRITICAL FIX: If we're changing animations while player is attacking, reset the attack flag
        // This prevents isPlayerAttacking from getting stuck when attack animation is interrupted
        if (this.isPlayerAttacking && animation !== 'ATTACK') {
            log.debug('[setAnimation] Resetting isPlayerAttacking flag');
            this.isPlayerAttacking = false;
        }

        // Increment session counter - this invalidates any pending callbacks
        this.animationSession++;
        const sessionAtStart = this.animationSession;
        log.debug(`[setAnimation] Session: ${sessionAtStart}, currentAnimation: ${this.currentAnimation}`);

        // Allow re-triggering same animation with different loop settings
        const forceReload = this.currentAnimation === animation && !loop;

        if (this.currentAnimation !== animation || forceReload) {
            log.debug(`[setAnimation] Loading sprites for ${animation} (forceReload=${forceReload})`);
            // Pass session and animation name so loadHumanSprites knows what to load
            const spritesAssigned = await this.loadHumanSprites(sessionAtStart, animation);
            if (!spritesAssigned) {
                // Sprites were discarded because session changed - abort
                // IMPORTANT: Don't set currentAnimation here - sprites weren't actually assigned
                log.debug(`[setAnimation] Sprites not assigned (session changed), aborting`);
                return;
            }
            // Only set currentAnimation AFTER sprites are successfully loaded
            // This prevents subsequent calls from skipping sprite load while we're still loading
            this.currentAnimation = animation;
            log.debug(`[setAnimation] Sprites loaded and assigned for ${animation}`);
        } else {
            log.debug(`[setAnimation] Skipping sprite load (already ${animation})`);
        }

        // Check if animation was changed while we were loading
        if (this.animationSession !== sessionAtStart) {
            // Another animation was started, don't configure this one
            log.debug(`[setAnimation] Session changed during load (${sessionAtStart} -> ${this.animationSession}), aborting`);
            return;
        }

        // Wrap the callback to check session validity
        const wrappedCallback = onComplete ? () => {
            // Only fire callback if this is still the current animation session
            if (this.animationSession === sessionAtStart) {
                onComplete();
            }
            // Callback silently ignored if session changed (animation was superseded)
        } : null;

        // Configure animation settings
        if (this.humanSprites) {
            for (let i = 0; i < this.humanSprites.length; i++) {
                const sprite = this.humanSprites[i];
                sprite.setLooping(loop);
                // Only set callback on FIRST sprite layer to avoid multiple triggers
                sprite.setOnComplete(i === 0 ? wrappedCallback : null);
                sprite.resetAnimation();
                sprite.setFacingLeft(this.facingLeft);
                // Apply speed multiplier
                sprite.setSpeedMultiplier(speedMultiplier);
            }
            log.debug(`[setAnimation] Animation ${animation} configured successfully, loop=${loop}`);
        } else {
            log.warn(`[setAnimation] humanSprites is null/undefined!`);
        }
    }

    // Get the animation speed multiplier for a tool (from upgrades)
    getToolAnimationMultiplier(toolId) {
        return this.toolAnimationMultipliers[toolId] || 1.0;
    }

    setFacingDirection(facingLeft) {
        this.facingLeft = facingLeft;
        if (this.humanSprites) {
            for (const sprite of this.humanSprites) {
                sprite.setFacingLeft(facingLeft);
            }
        }
    }

    getHairStyle() {
        return this.currentHairStyle;
    }

    getAnimation() {
        return this.currentAnimation;
    }

    async setGoblinAnimation(animation, loop = true, onComplete = null, speedMultiplier = 1.0) {
        // Increment session counter to invalidate pending callbacks
        this.goblinAnimationSession++;
        const sessionAtStart = this.goblinAnimationSession;

        // Allow re-triggering same animation with different loop settings
        const forceReload = this.goblinAnimation === animation && !loop;

        if (this.goblinAnimation !== animation || forceReload) {
            await this.loadGoblinSprite(animation);
            // Check if session changed during load
            if (this.goblinAnimationSession !== sessionAtStart) {
                return; // Another animation was started
            }
            this.goblinAnimation = animation;
        }

        // Wrap callback to check session validity
        const wrappedCallback = onComplete ? () => {
            if (this.goblinAnimationSession === sessionAtStart) {
                onComplete();
            }
        } : null;

        if (this.goblinSprite) {
            this.goblinSprite.setLooping(loop);
            this.goblinSprite.setOnComplete(wrappedCallback);
            this.goblinSprite.resetAnimation();
            this.goblinSprite.setFacingLeft(this.goblinFacingLeft);
            this.goblinSprite.setSpeedMultiplier(speedMultiplier);
        }
    }

    setGoblinFacingDirection(facingLeft) {
        this.goblinFacingLeft = facingLeft;
        if (this.goblinSprite) {
            this.goblinSprite.setFacingLeft(facingLeft);
        }
    }

    getGoblinAnimation() {
        return this.goblinAnimation;
    }

    onWorldClick(worldX, worldY) {
        // Check for chunk purchase sign clicks (always active)
        if (this.chunkManager) {
            const purchasableChunk = this.chunkManager.getPurchasableChunkAtWorld(worldX, worldY);
            if (purchasableChunk) {
                this.chunkManager.purchaseChunk(purchasableChunk.col, purchasableChunk.row);
                return;
            }
        }

        // Check for interactable buildings first (works in any mode)
        const interactable = this.tilemap.getInteractableAt(worldX, worldY);
        if (interactable && interactable.action) {
            this.handleInteractableAction(interactable.action);
            return;
        }

        // Convert world coordinates to tile coordinates
        const tileX = Math.floor(worldX / this.tilemap.tileSize);
        const tileY = Math.floor(worldY / this.tilemap.tileSize);

        // Building placement mode: confirm or cancel
        if (this._buildPlacementMode?.type === 'building') {
            if (this._buildPlacementValid) {
                const { defId, zeroCost } = this._buildPlacementMode;
                this._confirmBuildingPlacement(defId, tileX, tileY, zeroCost);
            }
            // Click always exits placement mode (even invalid — user can try again)
            // Invalid click just cancels without placing
            if (!this._buildPlacementValid) this._cancelBuildPlacement();
            return;
        }

        // Zone manage mode: clicking a tile opens the zone panel for that tile's zone
        if (this.toolbar?.zoneManageMode) {
            const zone = this.replenishZoneManager?.getZoneForTile(tileX, tileY);
            if (zone) {
                this._openZonePanel(zone);
            } else {
                this.toolbar.exitZoneManageMode();
            }
            return;
        }

        // Check for placed building clicks (in pan mode, no active tool)
        if (this.inputMode === 'pan' && this.buildingManager) {
            const clickedBuilding = this.buildingManager.getBuildingAt(tileX, tileY);
            if (clickedBuilding && clickedBuilding.state !== 'under_construction') {
                this._openBuildingMenu(clickedBuilding);
                return;
            }
        }

        // Only handle harvest clicks in pan mode
        if (this.inputMode !== 'pan') return;

        const tileOwned = this.chunkManager && this.chunkManager.isPlayerOwned(tileX, tileY);

        // Try to harvest a crop first (owned chunks only)
        if (tileOwned) {
            const harvested = this.cropManager.tryHarvest(tileX, tileY);
            if (harvested) {
                if (this.inventory) {
                    const bountyBonus = this.homeUpgrades?.shrineUpgrades?.bountifulHarvest ? 1 : 0;
                    this.inventory.addCropByIndex(harvested.index, 1 + bountyBonus);
                    this.milestones.totalCropsHarvested++;
                    // Notify replenish zone manager so it can queue auto-replant
                    if (this.replenishZoneManager) {
                        this.replenishZoneManager.onHarvest(tileX, tileY);
                    }

                    // Seed drop on harvest: 75% for wild crops (non-hoed), 25% for planted crops (hoed)
                    const underTileId = this.tilemap.getTileAt(tileX, tileY);
                    const isHoed = underTileId !== null && CONFIG.tiles.hoedGround.includes(underTileId);
                    const seedDropChance = isHoed ? 0.25 : 0.75;
                    if (Math.random() < seedDropChance) {
                        const seedRes = this.inventory.getSeedByCropIndex(harvested.index);
                        if (seedRes) {
                            this.inventory.add(seedRes, 1);
                            const wx = tileX * this.tilemap.tileSize + this.tilemap.tileSize / 2;
                            const wy = tileY * this.tilemap.tileSize;
                            this._seedEffects.push(createHarvestEffect(wx, wy, seedRes.tileId));
                        }
                    }
                }
                log.debug(`Collected: ${harvested.name}`);
                return;
            }
        }

        // Try to harvest a flower or remove a weed
        if (this.flowerManager) {
            // Flowers only on owned chunks
            if (tileOwned) {
                const flowerHarvest = this.flowerManager.tryHarvest(tileX, tileY);
                if (flowerHarvest) {
                    // Add to inventory using color-specific resource type
                    if (this.inventory) {
                        const flowerName = flowerHarvest.flowerType.name; // 'Blue Flower' / 'Red Flower' / 'White Flower'
                        const flowerResource = flowerName === 'Blue Flower'  ? RESOURCE_TYPES.FLOWER_BLUE
                                             : flowerName === 'Red Flower'   ? RESOURCE_TYPES.FLOWER_RED
                                             : flowerName === 'White Flower' ? RESOURCE_TYPES.FLOWER_WHITE
                                             : RESOURCE_TYPES.FLOWER;
                        this.inventory.add(flowerResource, flowerHarvest.yield);
                    }
                    log.debug(`Collected: ${flowerHarvest.flowerType.name} x${flowerHarvest.yield}`);
                    return;
                }
            }

            // Weeds can be removed on owned chunks and the town chunk
            const canRemoveWeed = tileOwned ||
                (this.chunkManager && this.chunkManager.isTownChunk(tileX, tileY));
            if (canRemoveWeed) {
                const weedResult = this.flowerManager.tryRemoveWeed(tileX, tileY);
                if (weedResult !== null) {
                    // Weed was clicked (may or may not be removed yet)
                    return;
                }
            }
        }

        // Try to harvest forest pocket crops (owned chunks only)
        if (tileOwned && this.forestGenerator) {
            const forestCropHarvest = this.forestGenerator.harvestPocketCrop(tileX, tileY);
            if (forestCropHarvest) {
                if (this.inventory) {
                    this.inventory.addCropByIndex(forestCropHarvest.index);
                }
                log.debug(`Collected from forest: ${forestCropHarvest.name}`);
                return;
            }
        }
    }

    handleInteractableAction(action) {
        log.debug(`Interactable action: ${action}`);

        switch (action) {
            case 'openStorage':
                if (this.uiManager) {
                    this.uiManager.openStorage();
                }
                break;

            case 'openCrafting':
                if (this.uiManager) {
                    this.uiManager.openCrafting();
                }
                break;

            case 'openShop':
                if (this.uiManager) {
                    this.uiManager.openShop();
                }
                break;

            case 'openStand':
                if (this.uiManager && this.roadsideStand) {
                    this.uiManager.openStand(this.roadsideStand);
                }
                break;

            case 'openWell':
                this._openWellMenu();
                break;

            default:
                log.warn('Unknown interactable action:', action);
        }
    }

    // Open the well menu via UIManager's standard overlay
    _openWellMenu() {
        if (this.uiManager) this.uiManager.openWellMenu(this);
    }

    _refreshWellMenuStatus() {
        if (this.uiManager) this.uiManager.refreshWellMenuIfOpen(this);
    }

    // Queue a fill-well job for the specified worker (called by UIManager well menu)
    _queueFillWellJob(workerId) {
        if (!this.well || !this.jobManager) return;
        const fillTool = { id: 'fill_well', name: 'Fill Well', animation: 'DOING' };
        const tile = this.well.getAdjacentServiceTile();
        this.jobManager.addJob(fillTool, [tile], workerId, workerId);
    }

    // Called when the player purchases a new chunk
    _onChunkPurchased(chunk) {
        log.info(`Chunk purchased: (${chunk.col}, ${chunk.row}) type=${chunk.type}`);
        const bounds = this.chunkManager.getChunkBounds(chunk.col, chunk.row);

        // Invalidate FlowerManager spawn area cache — new chunk adds new valid spawn tiles
        this.flowerManager?.invalidateSpawnAreasCache();

        // Wire expansion path helpers into ChunkManager now that overlay/path are ready
        this.chunkManager._pathPositions = this.pathPositions;
        this.chunkManager._overlayManager = this.overlayManager;
        this.chunkManager._getRandomPathTile = getRandomPathTile;

        // Great path exclusion zone: exclude tree trunks landing ON the great path (y=45-48)
        const pathYMin = CONFIG.chunks.mainPathY;                          // 45 inclusive
        const pathYMax = CONFIG.chunks.mainPathY + CONFIG.chunks.mainPathGap; // 49 exclusive

        const dirs8 = [
            { dc: 0, dr: -1 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 },
            { dc: -1, dr: -1 }, { dc: 1, dr: -1 }, { dc: -1, dr: 1 }, { dc: 1, dr: 1 }
        ];

        // ── Generate content for the newly owned chunk ────────────────────────────
        // chunk.generated is still false here (ChunkManager sets it true after this callback).
        const gen = this.chunkGeneratorRegistry?.getGenerator(chunk.type);
        if (gen && !chunk.generated) {
            const needsPathExclude = (bounds.y + bounds.height) > pathYMin && bounds.y < pathYMax;
            gen.generateContent(chunk.col, chunk.row, bounds, {
                pathExcludeYMin: needsPathExclude ? pathYMin : null,
                pathExcludeYMax: needsPathExclude ? pathYMax : null
            });
        }

        // ── Generate content for newly created LOCKED neighbor chunks (8-way) ────
        // purchaseChunk() allocates all 8 neighbors; those created fresh have generated=false
        // and need content placed. Initial 3×5 chunks have generated=true and are skipped.
        for (const { dc, dr } of dirs8) {
            const nb = this.chunkManager.getChunkAt(chunk.col + dc, chunk.row + dr);
            if (nb && !nb.generated) {
                // Use exact generator lookup (no fallback) so town/farm chunks are skipped.
                const nbGen = this.chunkGeneratorRegistry?.generators.get(nb.type) ?? null;
                if (nbGen) {
                    const nbBounds = this.chunkManager.getChunkBounds(nb.col, nb.row);
                    const needsPathExclude = (nbBounds.y + nbBounds.height) > pathYMin && nbBounds.y < pathYMax;
                    nbGen.generateContent(nb.col, nb.row, nbBounds, {
                        pathExcludeYMin: needsPathExclude ? pathYMin : null,
                        pathExcludeYMax: needsPathExclude ? pathYMax : null
                    });
                    nb.generated = true;
                }
            }
        }

        // ── Generate seam trees for each boundary that hasn't been placed yet ─────
        // _generatedSeams tracks every seam that has been placed (keyed "col,row,S/E/NE").
        // A seam is only generated here if it wasn't already placed during init or a prior
        // purchase. We only mark it done when the neighbor chunk actually exists (so a seam
        // toward a not-yet-created chunk stays eligible until that chunk appears).
        const affectedCells = [
            { col: chunk.col, row: chunk.row },
            ...dirs8.map(({ dc, dr }) => ({ col: chunk.col + dc, row: chunk.row + dr }))
        ];
        for (const { col, row } of affectedCells) {
            const c = this.chunkManager.getChunkAt(col, row);
            if (!c) continue;
            // Use exact lookup so town/farm chunks don't get forest seams generated.
            const cGen = this.chunkGeneratorRegistry?.generators.get(c.type) ?? null;
            if (!cGen) continue;

            const cb = this.chunkManager.getChunkBounds(col, row);

            // South seam
            const seamKeyS = `${col},${row},S`;
            if (!this._generatedSeams.has(seamKeyS)) {
                const south = this.chunkManager.getChunkAt(col, row + 1);
                if (south) {
                    const southGen = this.chunkGeneratorRegistry?.generators.get(south.type) ?? null;
                    cGen.generateSeam('S', cb, southGen);
                    this._generatedSeams.add(seamKeyS);
                }
            }

            // East seam
            const seamKeyE = `${col},${row},E`;
            if (!this._generatedSeams.has(seamKeyE)) {
                const east = this.chunkManager.getChunkAt(col + 1, row);
                if (east) {
                    const eastGen = this.chunkGeneratorRegistry?.generators.get(east.type) ?? null;
                    cGen.generateSeam('E', cb, eastGen);
                    this._generatedSeams.add(seamKeyE);
                }
            }

            // North edge trees
            const seamKeyNE = `${col},${row},NE`;
            if (!this._generatedSeams.has(seamKeyNE)) {
                cGen.generateNorthEdge(cb);
                this._generatedSeams.add(seamKeyNE);
            }
        }

        // Great path (y=45-48) is a separate virtual tilemap — no setTileAt() needed.
        // renderGreatPath() in TilemapRenderer automatically spans the full map width,
        // so new columns are covered as soon as _updateMapBounds() expands mapWidth.
        // Pathfinder speed boost at y=46-47 is provided by getTileAt() returning tile 482.

        this.milestones.totalChunksOwned++;
    }

    // Clear all forest/resource content from a purchased town chunk and reset tiles to grass
    _clearChunkResources(col, row) {
        const bounds = this.chunkManager.getChunkBounds(col, row);
        const { x, y, width, height } = bounds;

        // Clear forest trees (ForestGenerator)
        if (this.forestGenerator) {
            for (const tree of this.forestGenerator.trees) {
                if (tree.baseX >= x && tree.baseX < x + width &&
                    tree.baseY >= y && tree.baseY < y + height) {
                    tree.isGone = true;
                }
            }
            for (const ore of this.forestGenerator.pocketOreVeins) {
                if (ore.tileX >= x && ore.tileX < x + width &&
                    ore.tileY >= y && ore.tileY < y + height) {
                    ore.isGone = true;
                }
            }
            for (const crop of this.forestGenerator.pocketCrops) {
                if (crop.tileX >= x && crop.tileX < x + width &&
                    crop.tileY >= y && crop.tileY < y + height) {
                    crop.isGone = true;
                }
            }
        }

        // Clear managed trees/ores (TreeManager, OreManager)
        if (this.treeManager) {
            for (const tree of this.treeManager.resources) {
                if (tree.tileX >= x && tree.tileX < x + width &&
                    tree.tileY >= y && tree.tileY < y + height) {
                    tree.isGone = true;
                }
            }
        }
        if (this.oreManager) {
            for (const ore of this.oreManager.resources) {
                if (ore.tileX >= x && ore.tileX < x + width &&
                    ore.tileY >= y && ore.tileY < y + height) {
                    ore.isGone = true;
                }
            }
        }

        // Clear enemies
        if (this.enemyManager) {
            const ts = this.tilemap.tileSize;
            for (const enemy of this.enemyManager.enemies) {
                const ex = Math.floor(enemy.x / ts);
                const ey = Math.floor(enemy.y / ts);
                if (ex >= x && ex < x + width && ey >= y && ey < y + height) {
                    enemy.isAlive = false;
                    enemy.health = 0;
                }
            }
        }

        // Clear flowers and weeds
        if (this.flowerManager) {
            for (const f of this.flowerManager.flowers) {
                if (f.tileX >= x && f.tileX < x + width &&
                    f.tileY >= y && f.tileY < y + height) {
                    f.isGone = true;
                }
            }
            for (const w of this.flowerManager.weeds) {
                if (w.tileX >= x && w.tileX < x + width &&
                    w.tileY >= y && w.tileY < y + height) {
                    w.isGone = true;
                }
            }
        }

        // Reset all tiles in the chunk to grass
        const grass = CONFIG.tiles.grass;
        for (let tx = x; tx < x + width; tx++) {
            for (let ty = y; ty < y + height; ty++) {
                this.tilemap.setTileAt(tx, ty, grass[0]);
            }
        }

        log.info(`Cleared chunk resources at (${col},${row}): bounds (${x},${y}) ${width}×${height}`);
    }

    _renderPathDebug() {
        if (!this.pathConnectivity) return;
        const ctx = this.ctx;
        const ts = this.tilemap.tileSize;
        const bounds = this.camera.getVisibleBounds();
        const tileXMin = Math.floor(bounds.left / ts);
        const tileXMax = Math.ceil(bounds.right / ts);
        const tileYMin = Math.floor(bounds.top / ts);
        const tileYMax = Math.ceil(bounds.bottom / ts);
        ctx.save();
        for (let ty = tileYMin; ty <= tileYMax; ty++) {
            for (let tx = tileXMin; tx <= tileXMax; tx++) {
                if (!this.pathConnectivity.isPathTile(tx, ty)) continue;
                const connected = this.pathConnectivity.isConnectedToGreatPath(tx, ty);
                ctx.fillStyle = connected ? 'rgba(0,255,80,0.35)' : 'rgba(255,60,60,0.35)';
                ctx.fillRect(tx * ts, ty * ts, ts, ts);
            }
        }
        ctx.restore();
    }

    // Called when player places or removes a path tile
    _onPathChanged() {
        if (!this.pathConnectivity) return;
        this.pathConnectivity.invalidate();
        this.tilemap?.invalidateBridgeCache(); // invalidate north-bridge column cache
        for (const b of this.buildingManager?.placedBuildings ?? []) {
            if (b.state === 'under_construction') continue;
            this._updateBuildingConnectivity(b);
        }
        this._updateNorthBridgeOverlays();
    }

    // Called when a building's construction is complete
    _onBuildingCompleted(building) {
        log.info(`Building completed: ${building.id} (${building.definitionId}) at (${building.tileX},${building.tileY})`);
        this._ejectWorkerFromBuilding('human', building);
        this._ejectWorkerFromBuilding('goblin', building);
        this._updateBuildingConnectivity(building);
        if (this.villagerManager) {
            this.villagerManager.onHouseReady(building);
        }
    }

    // If a worker is standing inside the building footprint, teleport them to the nearest
    // walkable tile just outside it so they don't get stuck in a wall.
    _ejectWorkerFromBuilding(workerId, building) {
        const pos = workerId === 'human' ? this.humanPosition : this.goblinPosition;
        if (!pos) return;
        const ts = this.tilemap.tileSize;
        const def = BUILDING_DEFS[building.definitionId];
        if (!def) return;
        const tx = Math.floor(pos.x / ts);
        const ty = Math.floor(pos.y / ts);
        // Check if worker is inside the footprint
        if (tx < building.tileX || tx >= building.tileX + def.footprint.width ||
            ty < building.tileY || ty >= building.tileY + def.footprint.height) return;

        // BFS outward from footprint border to find nearest walkable tile
        const bx = building.tileX, by = building.tileY;
        const bw = def.footprint.width, bh = def.footprint.height;
        const visited = new Set();
        const queue = [];
        // Seed with all border-adjacent tiles
        for (let dx = -1; dx <= bw; dx++) {
            queue.push([bx + dx, by - 1]);
            queue.push([bx + dx, by + bh]);
        }
        for (let dy = 0; dy < bh; dy++) {
            queue.push([bx - 1, by + dy]);
            queue.push([bx + bw, by + dy]);
        }
        let ejected = false;
        for (const [ex, ey] of queue) {
            const key = `${ex},${ey}`;
            if (visited.has(key)) continue;
            visited.add(key);
            if (this.isTileWalkable(ex, ey)) {
                const wx = ex * ts + ts / 2;
                const wy = ey * ts + ts / 2;
                pos.x = wx;
                pos.y = wy;
                if (workerId === 'human') {
                    this.humanSprites?.forEach(s => s.setPosition(wx, wy));
                } else {
                    this.goblinSprite?.setPosition(wx, wy);
                }
                log.info(`Ejected ${workerId} from completed building to (${ex},${ey})`);
                ejected = true;
                break;
            }
        }
        if (!ejected) log.warn(`Could not find walkable ejection tile for ${workerId} near building ${building.id}`);
    }

    // Check whether a building's door is path-connected to the great path and update its state.
    _updateBuildingConnectivity(building) {
        if (!this.pathConnectivity) return;
        const def = BUILDING_DEFS[building.definitionId];
        if (!def) return;

        // Check one tile south of the door (where the visitor would stand)
        const doorX = building.tileX + def.doorOffset.x;
        const doorY = building.tileY + def.doorOffset.y + 1;
        const connected = this.pathConnectivity.isConnectedToGreatPath(doorX, doorY);
        const wasConnected = building.pathConnected;
        building.pathConnected = connected;

        if (!wasConnected && connected && building.state === 'inactive') {
            building.state = 'active_empty';
            log.info(`Building ${building.id} is now active (path connected)`);
            // If goblin was hired but had no house, claim this one
            if (this.goblinHired && this._goblinNeedsHouse && building.definitionId === 'small_house') {
                this._goblinClaimHouse(building);
            } else if (this.villagerManager) {
                this.villagerManager.onHouseReady(building);
            }
        } else if (wasConnected && !connected &&
                   (building.state === 'active_empty' || building.state === 'active_occupied')) {
            // Displace the villager before setting state to inactive
            if (building.state === 'active_occupied' && this.villagerManager) {
                this.villagerManager.onHouseDisconnected(building);
            }
            building.state = 'inactive';
            log.info(`Building ${building.id} went inactive (path disconnected)`);
        }
    }

    // ===== Building menu (deconstruct) =====

    _openBuildingMenu(building) {
        const def = BUILDING_DEFS[building.definitionId];
        if (!def) return;
        this._buildingMenuBuilding = building;
        if (this.uiManager) {
            this.uiManager.openBuildingMenu(building, def, () => this._deconstructBuilding(building));
        }
    }

    _closeBuildingMenu() {
        if (this._buildingMenuBuilding) {
            this._buildingMenuBuilding = null;
            if (this.uiManager?.activeMenu === 'building') this.uiManager.closeMenu();
        }
    }

    _deconstructBuilding(building) {
        const def = BUILDING_DEFS[building.definitionId];
        if (!def) return;

        // Refund materials
        if (def.cost.wood)  this.inventory.add(RESOURCE_TYPES.WOOD, def.cost.wood);
        if (def.cost.stone) this.inventory.add(RESOURCE_TYPES.ORE_STONE, def.cost.stone);
        if (def.cost.gold)  this.inventory.addGold(def.cost.gold);

        // Displace villager if occupied
        if (building.state === 'active_occupied' && building.occupant && this.villagerManager) {
            this.villagerManager.onHouseDeconstructed(building);
        }

        // Remove from building manager
        this.buildingManager.deconstructBuilding(building.id);

        // Invalidate path connectivity
        this._onPathChanged();

        this._closeBuildingMenu();
        log.info(`Building deconstructed: ${building.id} (${def.name})`);
    }

    // ===== Build placement mode methods =====

    enterBuildingPlacementMode(defId, zeroCost = false) {
        this._buildPlacementMode = { type: 'building', defId, zeroCost };
        this._buildPlacementValid = false;
        this.inputManager.setPanningEnabled(false);
        // Deselect any active tool
        if (this.currentTool) {
            this.tileSelector.deselectTool?.();
            this.currentTool = null;
            this.inputMode = 'pan';
        }
        document.body.style.cursor = 'crosshair';
        log.info(`Entered building placement mode for: ${defId}`);
    }

    enterPathPlacementMode() {
        this._buildPlacementMode = { type: 'path' };
        const pathTool = { id: 'path', tileId: 482, animation: 'DIG', name: 'Path' };
        this.onToolSelected(pathTool);
        // Use the build tool cursor icon so the player knows build mode is active
        const buildCursorUrl = this.toolbar?.cursorDataUrls?.get('build');
        document.body.style.cursor = buildCursorUrl
            ? `url(${buildCursorUrl}) 16 16, auto`
            : 'crosshair';
        log.info('Entered path placement mode');
    }

    _cancelBuildPlacement() {
        this._buildPlacementMode = null;
        this._buildPlacementValid = false;
        this.inputManager.setPanningEnabled(true);
        document.body.style.cursor = 'default';
        log.info('Build placement cancelled');
    }

    _validateBuildingPlacement(defId, tileX, tileY) {
        const def = BUILDING_DEFS[defId];
        if (!def) return false;
        for (let dy = 0; dy < def.footprint.height; dy++) {
            for (let dx = 0; dx < def.footprint.width; dx++) {
                const tx = tileX + dx;
                const ty = tileY + dy;
                // Must be in a town chunk
                if (!this.chunkManager.isTownChunk(tx, ty)) return false;
                // Must not be occupied by existing building
                if (this.buildingManager.isObstacle(tx, ty)) return false;
                // Must not have a tree
                if (this.treeManager?.getTreeAt?.(tx, ty)) return false;
                if (this.forestGenerator?.getTreeAt?.(tx, ty)) return false;
                // Must not have an ore vein
                if (this.oreManager?.getOreAt?.(tx, ty)) return false;
                // Must not have the well
                if (this.well?.isObstacle?.(tx, ty)) return false;
                // Must not have a crop
                if (this.cropManager?.getCropAt?.(tx, ty)) return false;
            }
        }
        return true;
    }

    _deductBuildingCost(cost) {
        // Check all costs first
        if (cost.gold  && this.inventory.getGold() < cost.gold) {
            this._showNotification?.('Not enough gold');
            return false;
        }
        if (cost.wood  && !this.inventory.has(RESOURCE_TYPES.WOOD, cost.wood)) {
            this._showNotification?.('Not enough wood');
            return false;
        }
        if (cost.stone && !this.inventory.has(RESOURCE_TYPES.ORE_STONE, cost.stone)) {
            this._showNotification?.('Not enough stone');
            return false;
        }
        // Deduct
        if (cost.gold)  this.inventory.spendGold(cost.gold);
        if (cost.wood)  this.inventory.remove(RESOURCE_TYPES.WOOD, cost.wood);
        if (cost.stone) this.inventory.remove(RESOURCE_TYPES.ORE_STONE, cost.stone);
        return true;
    }

    async _confirmBuildingPlacement(defId, tileX, tileY, zeroCost) {
        const def = BUILDING_DEFS[defId];
        if (!zeroCost && !this._deductBuildingCost(def.cost)) return;
        try {
            const building = await this.buildingManager.placeBuilding(defId, tileX, tileY, 'under_construction');
            if (this.jobManager) {
                this.jobManager.addConstructJob(building);
            }
            log.info(`Placed building ${defId} at (${tileX},${tileY})`);
        } catch (err) {
            log.error('Failed to place building:', err);
        }
        this._cancelBuildPlacement();
    }

    // Tool selection handlers (called by Toolbar)
    onToolSelected(tool) {
        this.inputMode = 'tool';
        this.currentTool = tool;
        this.tileSelector.setTool(tool);
        this.inputManager.setPanningEnabled(false);
        log.debug(`Tool selected: ${tool.name}`);
    }

    onToolDeselected() {
        this.inputMode = 'pan';
        this.currentTool = null;
        this.tileSelector.setTool(null);
        this.tileSelector.cancelSelection();
        this.inputManager.setPanningEnabled(true);
        log.debug('Tool deselected');
    }

    onTileSelectionComplete() {
        // Zone-expansion drag mode: add tiles to existing zone instead of creating a job
        if (this.tileSelector.zoneExpansionMode && this.tileSelector.zoneExpansionTargetId) {
            const expandZoneId = this.tileSelector.zoneExpansionTargetId;
            const tiles = this.tileSelector.endSelection();
            if (tiles.length > 0 && this.replenishZoneManager) {
                this.replenishZoneManager.expandZone(expandZoneId, tiles);
            }
            this.tileSelector.clearSelection();
            this.tileSelector.zoneExpansionMode = false;
            this.tileSelector.zoneExpansionTargetId = null;
            // Hide indicator; re-open zone panel for same zone if it still exists
            const indicator = document.getElementById('zone-expand-indicator');
            if (indicator) indicator.style.display = 'none';
            const zone = this.replenishZoneManager?.zones?.get(expandZoneId);
            if (zone) this._openZonePanel(zone);
            this.inputMode = 'pan';
            this.inputManager.setPanningEnabled(true);
            return;
        }

        const tiles = this.tileSelector.endSelection();
        if (tiles.length > 0 && this.currentTool) {
            this.jobManager.addJob(this.currentTool, tiles);

            // If replenishMode is on and this is a plant job, create a zone
            if (this.toolbar?.replenishMode && this.currentTool.id === 'plant' && this.currentTool.seedType !== undefined) {
                if (this.replenishZoneManager) {
                    this.replenishZoneManager.createZone(tiles, this.currentTool.seedType);
                }
            }
        }
        this.tileSelector.clearSelection();

        // Auto-deselect tool and return to pan mode after selection
        if (this.toolbar) {
            this.toolbar.deselectTool();
        }
    }

    // === COMBAT SYSTEM ===

    // Called by EnemyManager when an enemy spots the player
    onEnemyEngaged(enemy) {
        if (!this.engagedEnemies.has(enemy)) {
            this.engagedEnemies.add(enemy);
            log.debug(`Enemy engaged! ${this.engagedEnemies.size} enemies in combat`);
        }

        // If not already in combat, enter combat mode
        if (!this.isInCombat) {
            this.enterCombat();
        }
    }

    // Called by EnemyManager when an enemy loses sight of player
    onEnemyDisengaged(enemy) {
        // Don't disengage if we're actively fighting - the player will continue
        // attacking until the enemy is dead or they manually flee
        // Only truly disengage if the enemy is dead
        if (!enemy.isAlive) {
            if (this.engagedEnemies.has(enemy)) {
                this.engagedEnemies.delete(enemy);
                log.debug(`Enemy died and disengaged! ${this.engagedEnemies.size} enemies remaining`);
            }

            // If no more enemies, exit combat
            if (this.engagedEnemies.size === 0 && this.isInCombat) {
                this.exitCombat();
            }
        }
        // If enemy is still alive but lost sight, keep them in the engaged list
        // The player will chase them down
    }

    // Enter combat mode - interrupts current work
    async enterCombat() {
        if (this.isInCombat) return;

        this.isInCombat = true;
        log.debug('Entering combat mode!');

        // Pause current job processing (will resume after combat)
        if (this.jobManager) {
            this.jobManager.pauseForCombat();
        }

        // Clear current movement path
        this.currentPath = null;
        this.currentWorkTile = null;

        // CRITICAL: Clear all callbacks on current sprites IMMEDIATELY
        // This prevents any pending work animation callbacks from firing
        if (this.humanSprites) {
            for (const sprite of this.humanSprites) {
                sprite.setOnComplete(null);
            }
        }

        // Switch to idle and WAIT for it to complete
        // This ensures the new sprites are loaded before combat continues
        await this.setAnimation('IDLE', true);
    }

    // Exit combat mode - resume work
    exitCombat() {
        if (!this.isInCombat) return;

        log.debug('Exiting combat mode - resuming work');

        // CRITICAL: Reset ALL combat state to prevent any stuck flags
        this.isInCombat = false;
        this.combatTarget = null;
        this.isPlayerAttacking = false;

        // Clear any combat-related movement path
        // (but only if not mid-movement - let movement complete)
        if (this.currentPath && this.currentPath.length === 0) {
            this.currentPath = null;
        }

        // Ensure engaged enemies set is cleared
        this.engagedEnemies.clear();

        // Resume job processing - the job manager will handle setting IDLE when appropriate
        if (this.jobManager) {
            this.jobManager.resumeFromCombat();
            // Don't set IDLE here - let the job manager handle animation after resuming
            // This prevents race conditions with async setAnimation calls
        } else {
            // No job manager - set IDLE directly
            if (this.currentAnimation !== 'IDLE' && !this.currentPath) {
                this.setAnimation('IDLE', true);
            }
        }
    }

    // --- Facade methods for subsystem access ---
    // These prevent callers (IdleManager, EnemyManager, etc.) from reaching 2+ levels deep.

    findPath(fromX, fromY, toX, toY) {
        return this.pathfinder.findPath(fromX, fromY, toX, toY);
    }

    isTileWalkable(x, y) {
        return this.pathfinder.isWalkable(x, y);
    }

    isTileOwned(x, y) {
        return this.chunkManager.isPlayerOwned(x, y);
    }

    // --- Facade methods: keep subsystems from reaching 2+ levels deep ---

    isTileHoed(x, y) {
        return !!(this.overlayManager?.hoedTiles.has(`${x},${y}`));
    }

    markTileHoed(x, y) {
        this.overlayManager?.markTileAsHoed(x, y);
    }

    addHoleOverlay(x, y) {
        this.overlayManager?.addOverlay(x, y, CONFIG.tiles.holeOverlay);
    }

    hasHoleOverlay(x, y) {
        return !!(this.overlayManager?.hasOverlay(x, y, CONFIG.tiles.holeOverlay));
    }

    removeHoleOverlay(x, y) {
        this.overlayManager?.removeOverlay(x, y);
    }

    isHoedTileEdge(x, y) {
        return !!(this.overlayManager?.isHoedTile(x, y));
    }

    updateHoedEdgeOverlays(x, y) {
        this.overlayManager?.updateEdgeOverlays(x, y);
    }

    incrementMilestone(key, amount = 1) {
        if (this.milestones) this.milestones[key] += amount;
    }

    getWaterLevel(workerId) {
        return workerId === 'goblin'
            ? (this.goblinWaterCanWater ?? 0)
            : (this.wateringCanWater ?? 0);
    }

    getWaterMax(workerId) {
        return workerId === 'goblin'
            ? (this.goblinWaterCanMaxWater ?? 20)
            : (this.wateringCanMaxWater ?? 20);
    }

    deductWater(workerId, amount = 1) {
        if (workerId === 'goblin') {
            this.goblinWaterCanWater = Math.max(0, (this.goblinWaterCanWater ?? 1) - amount);
        } else {
            this.wateringCanWater = Math.max(0, (this.wateringCanWater ?? 1) - amount);
        }
    }

    fillWateringCan(workerId) {
        if (workerId === 'goblin') {
            this.goblinWaterCanWater = this.goblinWaterCanMaxWater ?? 20;
        } else {
            this.wateringCanWater = this.wateringCanMaxWater ?? 20;
        }
    }

    getCropsArray() {
        return this.cropManager?.crops ?? [];
    }

    /** Called by JobManager when a player job preempts the idle job. */
    onIdlePreempted() {
        this.idleManager?.onIdlePreempted();
    }

    // --- Building lifecycle orchestration (keeps VillagerManager/BuildingManager decoupled) ---

    /** Called when a villager occupies a building (starts chimney smoke, etc.). */
    onBuildingOccupied(building) {
        this.buildingManager?.onBuildingOccupied(building);
    }

    /** Called when a building loses its occupant (stops chimney smoke, etc.). */
    onBuildingVacated(building) {
        this.buildingManager?.onBuildingVacated(building);
    }

    /** Returns live combat targets for EnemyManager to choose from. */
    getCombatTargets() {
        const targets = [];
        if (this.playerHealth > 0 && this.humanPosition) {
            targets.push({
                position: this.humanPosition,
                type: 'human',
                onHit: (dmg, enemy) => this.takeDamage(dmg, enemy)
            });
        }
        if (this.goblinHealth > 0 && this.goblinPosition) {
            targets.push({
                position: this.goblinPosition,
                type: 'goblin',
                onHit: (dmg, enemy) => this.takeGoblinDamage(dmg, enemy)
            });
        }
        return targets;
    }

    // Player takes damage from an enemy
    takeDamage(amount, source) {
        this.playerHealth -= amount;
        this.playerDamageFlashing = true;
        this.playerDamageFlashTimer = CONFIG.player.damageFlashDuration;
        this.playerLastDamageTime = performance.now(); // Track for regen delay

        log.debug(`Player took ${amount} damage from ${source.type}! Health: ${this.playerHealth}/${this.playerMaxHealth}`);

        if (this.playerHealth <= 0) {
            this.playerHealth = 0;
            this.onPlayerDeath();
        }
    }

    // Goblin takes damage from an enemy
    takeGoblinDamage(amount, source) {
        this.goblinHealth -= amount;
        this.goblinLastDamageTime = performance.now(); // Track for regen delay
        this.goblinDamageFlashing = true;
        this.goblinDamageFlashTimer = CONFIG.player.damageFlashDuration; // Reuse player flash duration

        log.debug(`Goblin took ${amount} damage from ${source.type}! Health: ${this.goblinHealth}/${this.goblinMaxHealth}`);

        if (this.goblinHealth <= 0) {
            this.goblinHealth = 0;
            this.onGoblinDeath();
        }
    }

    onGoblinDeath() {
        log.info('Goblin died!');
        // Could implement respawn logic here
        this.setGoblinAnimation('DEATH', false);
    }

    onPlayerDeath() {
        log.info('Player died!');

        // CRITICAL FIX: Reset attack flag before changing animation
        // This prevents isPlayerAttacking from getting stuck when death interrupts attack
        this.isPlayerAttacking = false;

        // Exit combat since player is dead
        this.isInCombat = false;
        this.combatTarget = null;
        this.engagedEnemies.clear();

        // Could implement respawn logic here
        this.setAnimation('DEATH', false);
    }

    // Update health regeneration for player and goblin
    updateHealthRegen(deltaTime) {
        const currentTime = performance.now();

        // Player health regeneration (only when out of combat and after delay)
        if (!this.isInCombat && this.playerHealth > 0 && this.playerHealth < this.playerMaxHealth) {
            const timeSinceDamage = currentTime - this.playerLastDamageTime;
            if (timeSinceDamage >= CONFIG.player.healthRegenDelay) {
                const regenAmount = CONFIG.player.healthRegen * (deltaTime / 1000);
                this.playerHealth = Math.min(this.playerMaxHealth, this.playerHealth + regenAmount);
            }
        }

        // Goblin health regeneration (always regenerates after delay)
        if (this.goblinHealth > 0 && this.goblinHealth < this.goblinMaxHealth) {
            const timeSinceDamage = currentTime - this.goblinLastDamageTime;
            if (timeSinceDamage >= CONFIG.goblin.healthRegenDelay) {
                const regenAmount = CONFIG.goblin.healthRegen * (deltaTime / 1000);
                this.goblinHealth = Math.min(this.goblinMaxHealth, this.goblinHealth + regenAmount);
            }
        }
    }

    // Update combat - check for enemies in range and attack
    updateCombat(deltaTime) {
        if (!this.isInCombat || !this.enemyManager) return;

        const currentTime = performance.now();
        const tileSize = this.tilemap.tileSize;

        // Remove dead enemies from engaged set
        for (const enemy of this.engagedEnemies) {
            if (!enemy.isAlive) {
                this.engagedEnemies.delete(enemy);
            }
        }

        // Exit combat if no enemies left
        if (this.engagedEnemies.size === 0) {
            this.exitCombat();
            return;
        }

        // Find closest enemy to attack - first check engaged enemies, then vision range
        let closestEnemy = null;

        // Prioritize enemies we're already engaged with
        if (this.engagedEnemies.size > 0) {
            let closestDistance = Infinity;
            for (const enemy of this.engagedEnemies) {
                if (!enemy.isAlive) continue;
                const dx = enemy.x - this.humanPosition.x;
                const dy = enemy.y - this.humanPosition.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestEnemy = enemy;
                }
            }
        }

        // Fallback to any enemy in vision range
        if (!closestEnemy) {
            closestEnemy = this.enemyManager.getClosestEnemyInRange(
                this.humanPosition.x,
                this.humanPosition.y,
                this.playerVisionRange
            );
        }

        if (!closestEnemy) {
            // No enemies at all - exit combat
            this.combatTarget = null;
            this.exitCombat();
            return;
        }

        this.combatTarget = closestEnemy;

        // Check if enemy is in attack range
        const playerTileX = Math.floor(this.humanPosition.x / tileSize);
        const playerTileY = Math.floor(this.humanPosition.y / tileSize);
        const enemyTileX = Math.floor(closestEnemy.x / tileSize);
        const enemyTileY = Math.floor(closestEnemy.y / tileSize);
        const distance = Math.abs(playerTileX - enemyTileX) + Math.abs(playerTileY - enemyTileY);

        if (distance <= this.playerAttackRange) {
            // In attack range - attack if cooldown allows
            if (!this.isPlayerAttacking && currentTime - this.lastPlayerAttackTime >= this.playerAttackCooldown) {
                this.performPlayerAttack(closestEnemy, currentTime);
            }
        } else {
            // Move towards enemy
            if (!this.isPlayerAttacking && (!this.currentPath || this.currentPath.length === 0)) {
                this.moveToAttackEnemy(closestEnemy);
            }
        }
    }

    // Perform a player attack on an enemy
    async performPlayerAttack(enemy, currentTime) {
        if (this.isPlayerAttacking || this.playerHealth <= 0) return;

        this.isPlayerAttacking = true;
        this.lastPlayerAttackTime = currentTime;

        // Face the enemy
        this.setFacingDirection(enemy.x < this.humanPosition.x);

        // Play attack animation
        await this.setAnimation('ATTACK', false, () => {
            // Check if we're still in combat (could have been interrupted)
            if (!this.isInCombat) {
                this.isPlayerAttacking = false;
                return;
            }

            // Deal damage at end of animation
            if (enemy.isAlive) {
                const died = enemy.takeDamage(this.playerDamage);
                log.debug(`Player attacked ${enemy.type} for ${this.playerDamage} damage!`);

                if (died) {
                    // Remove from engaged set
                    this.engagedEnemies.delete(enemy);
                    log.info(`${enemy.type} defeated!`);
                }
            }

            this.isPlayerAttacking = false;

            // Always go to idle after attack if still in combat
            // The next updateCombat frame will trigger another attack if needed
            if (this.isInCombat) {
                this.setAnimation('IDLE', true);
            }
        });
    }

    // Move player towards enemy for attack
    moveToAttackEnemy(enemy) {
        const tileSize = this.tilemap.tileSize;
        const playerTileX = Math.floor(this.humanPosition.x / tileSize);
        const playerTileY = Math.floor(this.humanPosition.y / tileSize);
        const enemyTileX = Math.floor(enemy.x / tileSize);
        const enemyTileY = Math.floor(enemy.y / tileSize);

        // Find adjacent tile to enemy
        const adjacentTile = this.findAdjacentStandingTile(playerTileX, playerTileY, enemyTileX, enemyTileY);

        if (adjacentTile) {
            this.currentPath = this.pathfinder.findPath(playerTileX, playerTileY, adjacentTile.x, adjacentTile.y);

            if (this.currentPath && this.currentPath.length > 0) {
                // Remove starting tile
                if (this.currentPath[0].x === playerTileX && this.currentPath[0].y === playerTileY) {
                    this.currentPath.shift();
                }
                this.setAnimation('WALKING', true);
            }
        }
    }

    // Character movement for job system
    moveCharacterTo(targetX, targetY) {
        const tileSize = this.tilemap.tileSize;
        const startTileX = Math.floor(this.humanPosition.x / tileSize);
        const startTileY = Math.floor(this.humanPosition.y / tileSize);
        const workTileX = Math.floor(targetX / tileSize);
        const workTileY = Math.floor(targetY / tileSize);

        // Character can work on a tile if standing directly adjacent (left, right, above, or below)
        // Check if character is already in a valid working position
        const isDirectlyLeft = (startTileX === workTileX - 1) && (startTileY === workTileY);
        const isDirectlyRight = (startTileX === workTileX + 1) && (startTileY === workTileY);
        const isDirectlyAbove = (startTileX === workTileX) && (startTileY === workTileY - 1);
        const isDirectlyBelow = (startTileX === workTileX) && (startTileY === workTileY + 1);

        if (isDirectlyLeft || isDirectlyRight || isDirectlyAbove || isDirectlyBelow) {
            // Already in position - face the work tile and work
            this.currentWorkTile = { x: workTileX, y: workTileY };
            // Face left if work tile is to the left, otherwise face right
            this.setFacingDirection(workTileX < startTileX);
            this.jobManager.onTileReached();
            return;
        }

        // Need to move to a valid position (left or right of work tile)
        const adjacentTile = this.findAdjacentStandingTile(startTileX, startTileY, workTileX, workTileY);

        if (!adjacentTile) {
            // No valid position to work from - skip this tile
            log.debug(`Cannot reach valid position for tile (${workTileX}, ${workTileY}) - skipping`);
            this.jobManager.skipCurrentTile();
            return;
        }

        // Store the work tile
        this.currentWorkTile = { x: workTileX, y: workTileY };

        // Find path to the adjacent tile
        this.currentPath = this.pathfinder.findPath(startTileX, startTileY, adjacentTile.x, adjacentTile.y);

        if (this.currentPath && this.currentPath.length > 0) {
            // Remove starting tile if character is already there
            if (this.currentPath.length > 1) {
                const firstTile = this.currentPath[0];
                if (firstTile.x === startTileX && firstTile.y === startTileY) {
                    this.currentPath.shift();
                }
            }
            this.setAnimation('WALKING', true, null);
        } else {
            // No path found - skip this tile
            log.debug(`No path to tile (${workTileX}, ${workTileY}) - skipping`);
            this.currentWorkTile = null;
            this.jobManager.skipCurrentTile();
        }
    }

    // Walk directly to the exact tile (skips findAdjacentStandingTile).
    // Used for stand service jobs where the destination IS the working position.
    moveCharacterToTile(tileX, tileY) {
        const tileSize = this.tilemap.tileSize;
        const startTileX = Math.floor(this.humanPosition.x / tileSize);
        const startTileY = Math.floor(this.humanPosition.y / tileSize);

        this.currentWorkTile = { x: tileX, y: tileY };

        if (startTileX === tileX && startTileY === tileY) {
            this.jobManager.onTileReached();
            return;
        }

        this.currentPath = this.pathfinder.findPath(startTileX, startTileY, tileX, tileY);
        if (this.currentPath && this.currentPath.length > 0) {
            if (this.currentPath.length > 1) {
                const first = this.currentPath[0];
                if (first.x === startTileX && first.y === startTileY) this.currentPath.shift();
            }
            this.setAnimation('WALKING', true, null);
        } else {
            this.currentWorkTile = null;
            this.jobManager.skipCurrentTile();
        }
    }

    // Goblin variant of moveCharacterToTile
    moveGoblinToTile(tileX, tileY) {
        const tileSize = this.tilemap.tileSize;
        const startTileX = Math.floor(this.goblinPosition.x / tileSize);
        const startTileY = Math.floor(this.goblinPosition.y / tileSize);

        this.goblinCurrentWorkTile = { x: tileX, y: tileY };

        if (startTileX === tileX && startTileY === tileY) {
            this.jobManager.onTileReachedForWorker('goblin');
            return;
        }

        this.goblinCurrentPath = this.pathfinder.findPath(startTileX, startTileY, tileX, tileY);
        if (this.goblinCurrentPath && this.goblinCurrentPath.length > 0) {
            if (this.goblinCurrentPath.length > 1) {
                const first = this.goblinCurrentPath[0];
                if (first.x === startTileX && first.y === startTileY) this.goblinCurrentPath.shift();
            }
            this.setGoblinAnimation('WALKING', true, null);
        } else {
            this.goblinCurrentWorkTile = null;
            this.jobManager.skipCurrentTileForWorker('goblin');
        }
    }

    // Find best adjacent tile to stand on while working on workTile
    // Allows standing to the LEFT, RIGHT, ABOVE, or BELOW the work tile
    findAdjacentStandingTile(startX, startY, workTileX, workTileY) {
        // All four cardinal directions around work tile
        const adjacentPositions = [
            { x: workTileX - 1, y: workTileY },  // left of work tile
            { x: workTileX + 1, y: workTileY },  // right of work tile
            { x: workTileX, y: workTileY - 1 },  // above work tile
            { x: workTileX, y: workTileY + 1 },  // below work tile
        ];

        // Sort by distance to current position (prefer closer tile)
        adjacentPositions.sort((a, b) => {
            const distA = Math.abs(a.x - startX) + Math.abs(a.y - startY);
            const distB = Math.abs(b.x - startX) + Math.abs(b.y - startY);
            return distA - distB;
        });

        // Find first walkable adjacent tile
        for (const pos of adjacentPositions) {
            if (this.pathfinder.isWalkable(pos.x, pos.y)) {
                return pos;
            }
        }

        return null;
    }

    updateCharacterMovement(deltaTime) {
        if (!this.currentPath || this.currentPath.length === 0) return;

        const tileSize = this.tilemap.tileSize;
        const target = this.currentPath[0];
        const targetWorldX = target.x * tileSize + tileSize / 2;
        const targetWorldY = target.y * tileSize + tileSize / 2;

        const dx = targetWorldX - this.humanPosition.x;
        const dy = targetWorldY - this.humanPosition.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < CONFIG.movement.waypointThreshold) {
            // Reached waypoint
            this.currentPath.shift();

            if (this.currentPath.length === 0) {
                // Reached final destination
                // If in combat, this is combat movement - don't trigger job callbacks
                if (this.isInCombat) {
                    // Combat movement complete - updateCombat will handle attack
                    return;
                }

                // Pixel-precise slide: glide to exact pixel instead of calling onTileReached
                if (this.humanPixelTarget) {
                    this.humanSlideStart = { x: this.humanPosition.x, y: this.humanPosition.y };
                    this.humanSlideTarget = this.humanPixelTarget;
                    this.humanPixelTarget = null;
                    this.humanSlideElapsed = 0;
                    this.humanIsSliding = true;
                    return; // Non-job movement — no onTileReached callback
                }

                // Job movement - face the work tile and notify job manager
                if (this.currentWorkTile) {
                    const workTileWorldX = this.currentWorkTile.x * tileSize + tileSize / 2;
                    this.setFacingDirection(workTileWorldX < this.humanPosition.x);
                }
                this.jobManager.onTileReached();
            }
        } else {
            // Update facing direction based on movement
            if (Math.abs(dx) > 1) {
                this.setFacingDirection(dx < 0);
            }

            // Move toward waypoint - apply path speed boost if on a path tile
            let effectiveSpeed = this.moveSpeed;
            const currentTileX = Math.floor(this.humanPosition.x / tileSize);
            const currentTileY = Math.floor(this.humanPosition.y / tileSize);
            const currentTileId = this.tilemap.getTileAt(currentTileX, currentTileY);
            if (currentTileId !== null && PATH_TILES.has(currentTileId)) {
                effectiveSpeed *= CONFIG.path.speedMultiplier;
            }
            // Move at half speed when carrying out an idle task
            if (this.jobManager?.currentJob?.isIdleJob) {
                effectiveSpeed *= 0.5;
            }
            const moveDistance = effectiveSpeed * deltaTime / 1000;
            const ratio = Math.min(moveDistance, distance) / distance;

            this.humanPosition.x += dx * ratio;
            this.humanPosition.y += dy * ratio;

            // Update sprite positions
            if (this.humanSprites) {
                for (const sprite of this.humanSprites) {
                    sprite.setPosition(this.humanPosition.x, this.humanPosition.y);
                }
            }
        }
    }

    // Goblin movement for job system
    moveGoblinTo(targetX, targetY) {
        const tileSize = this.tilemap.tileSize;
        const startTileX = Math.floor(this.goblinPosition.x / tileSize);
        const startTileY = Math.floor(this.goblinPosition.y / tileSize);
        const workTileX = Math.floor(targetX / tileSize);
        const workTileY = Math.floor(targetY / tileSize);

        // Check if goblin is already in a valid working position (left, right, above, or below)
        const isDirectlyLeft = (startTileX === workTileX - 1) && (startTileY === workTileY);
        const isDirectlyRight = (startTileX === workTileX + 1) && (startTileY === workTileY);
        const isDirectlyAbove = (startTileX === workTileX) && (startTileY === workTileY - 1);
        const isDirectlyBelow = (startTileX === workTileX) && (startTileY === workTileY + 1);

        if (isDirectlyLeft || isDirectlyRight || isDirectlyAbove || isDirectlyBelow) {
            // Already in position
            this.goblinCurrentWorkTile = { x: workTileX, y: workTileY };
            // Face left if work tile is to the left, otherwise face right
            this.setGoblinFacingDirection(workTileX < startTileX);
            this.jobManager.onTileReachedForWorker('goblin');
            return;
        }

        // Find adjacent tile to stand on
        const adjacentTile = this.findAdjacentStandingTile(startTileX, startTileY, workTileX, workTileY);

        if (!adjacentTile) {
            log.debug(`[Goblin] Cannot reach valid position for tile (${workTileX}, ${workTileY}) - skipping`);
            this.jobManager.skipCurrentTileForWorker('goblin');
            return;
        }

        this.goblinCurrentWorkTile = { x: workTileX, y: workTileY };

        // Find path
        this.goblinCurrentPath = this.pathfinder.findPath(startTileX, startTileY, adjacentTile.x, adjacentTile.y);

        if (this.goblinCurrentPath && this.goblinCurrentPath.length > 0) {
            if (this.goblinCurrentPath.length > 1) {
                const firstTile = this.goblinCurrentPath[0];
                if (firstTile.x === startTileX && firstTile.y === startTileY) {
                    this.goblinCurrentPath.shift();
                }
            }
            this.setGoblinAnimation('WALKING', true, null);
        } else {
            log.debug(`[Goblin] No path to tile (${workTileX}, ${workTileY}) - skipping`);
            this.goblinCurrentWorkTile = null;
            this.jobManager.skipCurrentTileForWorker('goblin');
        }
    }

    updateGoblinMovement(deltaTime) {
        if (!this.goblinCurrentPath || this.goblinCurrentPath.length === 0) return;

        const tileSize = this.tilemap.tileSize;
        const target = this.goblinCurrentPath[0];
        const targetWorldX = target.x * tileSize + tileSize / 2;
        const targetWorldY = target.y * tileSize + tileSize / 2;

        const dx = targetWorldX - this.goblinPosition.x;
        const dy = targetWorldY - this.goblinPosition.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < CONFIG.movement.waypointThreshold) {
            // Reached waypoint
            this.goblinCurrentPath.shift();

            if (this.goblinCurrentPath.length === 0) {
                // Pixel-precise slide for goblin
                if (this.goblinPixelTarget) {
                    this.goblinSlideStart = { x: this.goblinPosition.x, y: this.goblinPosition.y };
                    this.goblinSlideTarget = this.goblinPixelTarget;
                    this.goblinPixelTarget = null;
                    this.goblinSlideElapsed = 0;
                    this.goblinIsSliding = true;
                    return;
                }

                // Reached final destination - face work tile and notify
                if (this.goblinCurrentWorkTile) {
                    const workTileWorldX = this.goblinCurrentWorkTile.x * tileSize + tileSize / 2;
                    this.setGoblinFacingDirection(workTileWorldX < this.goblinPosition.x);
                }
                this.jobManager.onTileReachedForWorker('goblin');
            }
        } else {
            // Update facing direction
            if (Math.abs(dx) > 1) {
                this.setGoblinFacingDirection(dx < 0);
            }

            // Move toward waypoint - apply path speed boost if on a path tile
            let effectiveSpeed = this.moveSpeed;
            const goblinTileX = Math.floor(this.goblinPosition.x / tileSize);
            const goblinTileY = Math.floor(this.goblinPosition.y / tileSize);
            const goblinTileId = this.tilemap.getTileAt(goblinTileX, goblinTileY);
            if (goblinTileId !== null && PATH_TILES.has(goblinTileId)) {
                effectiveSpeed *= CONFIG.path.speedMultiplier;
            }
            const moveDistance = effectiveSpeed * deltaTime / 1000;
            const ratio = Math.min(moveDistance, distance) / distance;

            this.goblinPosition.x += dx * ratio;
            this.goblinPosition.y += dy * ratio;

            // Update sprite position
            if (this.goblinSprite) {
                this.goblinSprite.setPosition(this.goblinPosition.x, this.goblinPosition.y);
            }
        }
    }

    // ── Pixel-precise slide helpers ───────────────────────────────────────────

    /**
     * Shared sub-tile slide updater (300 ms lerp).
     * Handles both human and goblin — keyed by workerId.
     */
    _updateSlide(workerId, deltaTime) {
        const SLIDE_DURATION = 300;
        if (workerId === 'human') {
            if (!this.humanIsSliding) return;
            this.humanSlideElapsed += deltaTime;
            const t = Math.min(1, this.humanSlideElapsed / SLIDE_DURATION);
            this.humanPosition.x = this.humanSlideStart.x + (this.humanSlideTarget.px - this.humanSlideStart.x) * t;
            this.humanPosition.y = this.humanSlideStart.y + (this.humanSlideTarget.py - this.humanSlideStart.y) * t;
            if (this.humanSprites) {
                for (const sprite of this.humanSprites) sprite.setPosition(this.humanPosition.x, this.humanPosition.y);
            }
            if (t >= 1) { this.humanIsSliding = false; this.setAnimation('IDLE', true); }
        } else {
            if (!this.goblinIsSliding) return;
            this.goblinSlideElapsed += deltaTime;
            const t = Math.min(1, this.goblinSlideElapsed / SLIDE_DURATION);
            this.goblinPosition.x = this.goblinSlideStart.x + (this.goblinSlideTarget.px - this.goblinSlideStart.x) * t;
            this.goblinPosition.y = this.goblinSlideStart.y + (this.goblinSlideTarget.py - this.goblinSlideStart.y) * t;
            if (this.goblinSprite) this.goblinSprite.setPosition(this.goblinPosition.x, this.goblinPosition.y);
            if (t >= 1) { this.goblinIsSliding = false; this.setGoblinAnimation('IDLE', true, null); }
        }
    }

    /** Update sub-tile slide for the human character (300 ms lerp). */
    _updateHumanSlide(deltaTime) { this._updateSlide('human', deltaTime); }

    /** Update sub-tile slide for the goblin character (300 ms lerp). */
    _updateGoblinSlide(deltaTime) { this._updateSlide('goblin', deltaTime); }

    /**
     * Move a worker to an exact pixel position via A* (to nearest tile) + sub-tile slide.
     * This is standalone movement — does NOT interact with the job system.
     */
    moveWorkerToPixel(workerId, px, py) {
        const tileSize = this.tilemap.tileSize;
        const tileX = Math.floor(px / tileSize);
        const tileY = Math.floor(py / tileSize);

        const startSlide = (pos, spriteUpdater) => {
            const slideStart = { x: pos.x, y: pos.y };
            const slideTarget = { px, py };
            // Already on the target tile — just slide
            return { slideStart, slideTarget };
        };

        if (workerId === 'human') {
            const startTileX = Math.floor(this.humanPosition.x / tileSize);
            const startTileY = Math.floor(this.humanPosition.y / tileSize);
            if (startTileX === tileX && startTileY === tileY) {
                const { slideStart, slideTarget } = startSlide(this.humanPosition);
                this.humanSlideStart = slideStart;
                this.humanSlideTarget = slideTarget;
                this.humanPixelTarget = null;
                this.humanSlideElapsed = 0;
                this.humanIsSliding = true;
            } else {
                this.humanPixelTarget = { px, py };
                this.currentWorkTile = null;
                this.currentPath = this.pathfinder.findPath(startTileX, startTileY, tileX, tileY);
                if (this.currentPath?.length > 0) {
                    if (this.currentPath[0].x === startTileX && this.currentPath[0].y === startTileY) {
                        this.currentPath.shift();
                    }
                    this.setAnimation('WALKING', true, null);
                } else {
                    this.humanPixelTarget = null; // Unreachable
                }
            }
        } else if (workerId === 'goblin') {
            const startTileX = Math.floor(this.goblinPosition.x / tileSize);
            const startTileY = Math.floor(this.goblinPosition.y / tileSize);
            if (startTileX === tileX && startTileY === tileY) {
                const { slideStart, slideTarget } = startSlide(this.goblinPosition);
                this.goblinSlideStart = slideStart;
                this.goblinSlideTarget = slideTarget;
                this.goblinPixelTarget = null;
                this.goblinSlideElapsed = 0;
                this.goblinIsSliding = true;
            } else {
                this.goblinPixelTarget = { px, py };
                this.goblinCurrentWorkTile = null;
                this.goblinCurrentPath = this.pathfinder.findPath(startTileX, startTileY, tileX, tileY);
                if (this.goblinCurrentPath?.length > 0) {
                    if (this.goblinCurrentPath[0].x === startTileX && this.goblinCurrentPath[0].y === startTileY) {
                        this.goblinCurrentPath.shift();
                    }
                    this.setGoblinAnimation('WALKING', true, null);
                } else {
                    this.goblinPixelTarget = null;
                }
            }
        }
    }

    placePathTilesInMap() {
        this.pathPositions = [];
        const map = this.tilemap;
        const { mainPathY, mainPathGap } = CONFIG.chunks;

        // All coordinates are absolute world tile positions (45×79 total: 3 cols × 5 rows + 4-tile path gap).
        //
        // Store chunk: col=1, row=1 → x=15-29, y=15-29 (now sparse forest — no pre-placed paths)
        // Home chunk:  col=1, row=2 → x=15-29, y=30-44 (now sparse forest — player places paths)
        // Great path:  world y=45-48  (separate renderer — NOT set via setTileAt)
        // Farm chunk:  col=1, row=3 → x=15-29, world y=49-63
        //
        // Path network (pre-placed):
        //   1. Great path (y=45-48): separate tilemap, handled by TilemapRenderer.renderGreatPath()
        //   2. House east-side path: x=22, y=49–57
        //   3. House front E-W: y=57, x=16–22
        // The dynamic north bridge (y=45) responds to player-placed paths at y=44.

        const placeRow = (y, x0, x1) => {
            for (let x = x0; x <= x1; x++) {
                map.setTileAt(x, y, getRandomPathTile());
                this.pathPositions.push({ x, y });
            }
        };
        const placeCol = (x, y0, y1) => {
            for (let y = y0; y <= y1; y++) {
                map.setTileAt(x, y, getRandomPathTile());
                this.pathPositions.push({ x, y });
            }
        };

        const farmTop = mainPathY + mainPathGap; // 49 (first farm tile row)

        // 1. Great path (y=45-48) is handled entirely by TilemapRenderer.renderGreatPath().
        //    No setTileAt() calls here.

        // 2. House east-side path — from farm top (y=49) down to house front row (y=57)
        //    House at x=16–21; path at x=22 (one tile east of house)
        const houseEastX = map.newHouseOffsetX + map.newHouseWidth; // 16+6=22
        const houseFrontY = map.newHouseOffsetY + map.newHouseHeight - 1; // 52+5=57
        placeCol(houseEastX, farmTop, houseFrontY); // x=22, y=49–57

        // 6. House front E-W — in front of door (y=42), from left of house to shed front
        //    Door at local (1,4) → world (17, 41); houseFrontY=42 is the row below house bottom
        const doorX = map.newHouseOffsetX + 1; // 17
        placeRow(houseFrontY, doorX - 1, 28); // y=42, x=16–28 (extends past well to shed front)

        // 7. Door threshold paths — at each TMX tile-206 position from store/home tilemaps.
        //    These mark the tile directly in front of each building entrance; the path tile
        //    renders underneath the door decor tile in the layer stack.
        if (map.doorTilePositions) {
            for (const pos of map.doorTilePositions) {
                map.setTileAt(pos.x, pos.y, getRandomPathTile());
                this.pathPositions.push({ x: pos.x, y: pos.y });
            }
        }
    }

    initPathEdgeOverlays() {
        if (!this.overlayManager || this.pathPositions.length === 0) return;

        for (const pos of this.pathPositions) {
            this.overlayManager.markTileAsPath(pos.x, pos.y);
        }

        if (this.tilemap.mapType === 'chunk') {
            const { mainPathY, mainPathGap } = CONFIG.chunks;
            const map = this.tilemap;
            const farmCrossX = map.newHouseOffsetX + map.newHouseWidth;   // 22 (farm house path column)

            // South bridge: farm house path (x=22) enters from south → mark y=48 (S-grass row)
            this.overlayManager.markTileAsPath(farmCrossX, mainPathY + mainPathGap - 1); // (22, 48)

            // North bridge: dynamic — any player path at y=44 creates a bridge at y=45.
            // Set initial overlays based on current path tiles at y=44.
            this._updateNorthBridgeOverlays();

            // Clean up any path edge overlays that spilled sideways onto the great path strip.
            for (const [key] of this.overlayManager.overlays) {
                const comma = key.indexOf(',');
                const y = parseInt(key.slice(comma + 1), 10);
                if (y >= mainPathY && y < mainPathY + mainPathGap) {
                    const x = parseInt(key.slice(0, comma), 10);
                    this.overlayManager.removePathEdgeOverlays(x, y);
                }
            }
        }
    }

    // Scan y=44 (home chunk bottom row) for player-placed path tiles and update
    // bridge overlays at y=45 (great path N-grass row) accordingly.
    _updateNorthBridgeOverlays() {
        if (!this.overlayManager || this.tilemap.mapType !== 'chunk') return;
        const { mainPathY } = CONFIG.chunks;
        const bridgeY = mainPathY;      // 45 (N-grass row)
        const scanY = mainPathY - 1;   // 44 (home chunk bottom)
        for (let x = 0; x < this.tilemap.mapWidth; x++) {
            const tile = this.tilemap.getTileAt(x, scanY);
            if (CONFIG.tiles.path.includes(tile)) {
                this.overlayManager.markTileAsPath(x, bridgeY);
            } else {
                this.overlayManager.removePathEdgeOverlays(x, bridgeY);
            }
        }
    }

    // Called when a tree is fully depleted. Spawns a physics-based seed icon that falls
    // then homes in on the worker, awarding 1 seed to inventory on arrival.
    _onTreeDepleted(tileX, tileY, seedKey, workerId) {
        const resource = RESOURCE_TYPES[seedKey];
        if (!resource) return;
        const tileSize = this.tilemap.tileSize;
        this._treeSeedDropEffects.push({
            x: (tileX + 0.5) * tileSize,
            y: (tileY - 1) * tileSize,
            vx: (Math.random() - 0.5) * 60,
            vy: 0,
            resource,
            workerId,
            phase: 'falling',
            timer: 0,
            fallDuration: 400,
            alpha: 1,
            scale: 1 / 3
        });
    }

    renderWorkQueueOverlay() {
        if (!this.jobManager) return;

        const queuedTiles = this.jobManager.getAllQueuedTiles();
        if (queuedTiles.length === 0) return;

        const tileSize = this.tilemap.tileSize;

        // Color scheme: red = human claimed, green = goblin claimed, blue = unassigned/queued
        const COLORS = {
            human:  { fill: 'rgba(220, 80,  80,  0.4)', stroke: 'rgba(220, 80,  80,  0.8)' },
            goblin: { fill: 'rgba(80,  200, 80,  0.4)', stroke: 'rgba(10, 150, 10, 0.8)' },
            none:   { fill: 'rgba(100, 150, 255, 0.4)', stroke: 'rgba(100, 150, 255, 0.8)' }
        };

        this.ctx.lineWidth = 1;

        // Group tiles by color bucket to minimise style-state changes
        const buckets = { human: [], goblin: [], none: [] };
        for (const tile of queuedTiles) {
            const key = tile.assignedTo === 'human' ? 'human'
                      : tile.assignedTo === 'goblin' ? 'goblin'
                      : 'none';
            buckets[key].push(tile);
        }

        for (const [key, group] of Object.entries(buckets)) {
            if (group.length === 0) continue;
            const { fill, stroke } = COLORS[key];
            this.ctx.fillStyle = fill;
            this.ctx.strokeStyle = stroke;
            for (const tile of group) {
                const worldX = tile.x * tileSize;
                const worldY = tile.y * tileSize;
                this.ctx.fillRect(worldX, worldY, tileSize, tileSize);
                this.ctx.strokeRect(worldX + 0.5, worldY + 0.5, tileSize - 1, tileSize - 1);
            }
        }
    }

    update(deltaTime) {
        // Update input
        this.inputManager.update(deltaTime);

        // Update enemies FIRST - this handles enemy vision/engagement
        // Must happen before sprite animations so combat state is set
        // before any animation callbacks fire
        if (this.enemyManager) {
            this.enemyManager.update(deltaTime);
        }

        // Update combat system (takes priority over jobs)
        this.updateCombat(deltaTime);

        // Update health regeneration for player and goblin
        this.updateHealthRegen(deltaTime);

        // Update crops
        if (this.cropManager) {
            this.cropManager.update(deltaTime);
        }

        // Update flowers (spawning and harvest effects)
        if (this.flowerManager) {
            this.flowerManager.update(deltaTime);
        }

        // Update job manager (only if not in combat)
        if (this.jobManager && !this.isInCombat) {
            this.jobManager.update(deltaTime);
        }

        // Update idle manager – triggers auto-tasks when job queue is empty
        if (this.idleManager) {
            this.idleManager.update(deltaTime);
        }

        // Update character movement (human) + sub-tile slide
        this.updateCharacterMovement(deltaTime);
        this._updateHumanSlide(deltaTime);

        // Update goblin movement + sub-tile slide
        this.updateGoblinMovement(deltaTime);
        this._updateGoblinSlide(deltaTime);

        // Goblin idle home-return: after 10s with no jobs, walk to house door
        if (this.goblinHired && this.goblinHouseBuilding && this.goblinPosition) {
            const goblinHasJob = (this.jobManager?.workers.get('goblin')?.currentJob != null)
                || (this.jobManager?.queues.goblin?.length ?? 0) > 0;
            if (!goblinHasJob) {
                this._goblinIdleTimer += deltaTime;
                if (this._goblinIdleTimer >= 10000) {
                    this._goblinIdleTimer = 0;
                    const def = BUILDING_DEFS[this.goblinHouseBuilding.definitionId];
                    const ts  = this.tilemap.tileSize;
                    const doorPx = (this.goblinHouseBuilding.tileX + (def?.doorOffset?.x ?? 2)) * ts + ts / 2;
                    const doorPy = (this.goblinHouseBuilding.tileY + (def?.doorOffset?.y ?? 4)) * ts + ts / 2;
                    this.moveWorkerToPixel('goblin', doorPx, doorPy);
                }
            } else {
                this._goblinIdleTimer = 0;
            }
        }

        // Update human character animations
        // Note: Animation callbacks fire here - combat state must be set before this
        if (this.humanSprites) {
            for (const sprite of this.humanSprites) {
                sprite.update(deltaTime);
            }
        }

        // Update goblin character animation
        if (this.goblinSprite) {
            this.goblinSprite.update(deltaTime);
        }

        // Update NPC travelers
        if (this.travelerManager) {
            this.travelerManager.update(deltaTime);
        }

        // Update stand service state machine and sale effects
        this._updateStandService(deltaTime);
        if (this.roadsideStand) this.roadsideStand.update(deltaTime);

        // Update player damage flash
        if (this.playerDamageFlashing) {
            this.playerDamageFlashTimer -= deltaTime;
            if (this.playerDamageFlashTimer <= 0) {
                this.playerDamageFlashing = false;
            }
        }

        // Update goblin damage flash
        if (this.goblinDamageFlashing) {
            this.goblinDamageFlashTimer -= deltaTime;
            if (this.goblinDamageFlashTimer <= 0) {
                this.goblinDamageFlashing = false;
            }
        }

        // Update ore veins
        if (this.oreManager) {
            this.oreManager.update(deltaTime);
        }

        // Update trees
        if (this.treeManager) {
            this.treeManager.update(deltaTime);
        }

        // Update forest trees
        if (this.forestGenerator) {
            this.forestGenerator.update(deltaTime);
        }

        // Update chimney smoke animation (always runs, rendering is conditional)
        if (this.chimneySmoke) {
            if (this.chimneySmokePauseTimer > 0) {
                this.chimneySmokePauseTimer -= deltaTime / 1000;
                if (this.chimneySmokePauseTimer <= 0) {
                    this.chimneySmokePauseTimer = 0;
                    this.chimneySmoke.resetAnimation();
                }
            } else {
                this.chimneySmoke.update(deltaTime);
            }
        }

        // Update chimney smoke for all occupied small_houses
        if (this.buildingManager) {
            this.buildingManager.updateChimneys(deltaTime);
        }

        // Animate gold display count-up (~500ms to complete)
        if (this._goldAmountEl && this.displayedGold !== this.targetGold) {
            const diff = this.targetGold - this.displayedGold;
            const speed = Math.max(Math.abs(diff) / 0.5, 2); // coins per second (min 2/s)
            const step = Math.sign(diff) * Math.min(Math.abs(diff), speed * deltaTime / 1000);
            this.displayedGold += step;
            if (Math.abs(this.targetGold - this.displayedGold) < 0.5) {
                this.displayedGold = this.targetGold;
            }
            this._goldAmountEl.textContent = Math.floor(this.displayedGold);
        }

        // Update floating seed drop effects
        updateEffects(this._seedEffects, deltaTime);

        // Update physics-based tree seed drop effects
        for (let i = this._treeSeedDropEffects.length - 1; i >= 0; i--) {
            const e = this._treeSeedDropEffects[i];
            e.timer += deltaTime;
            if (e.phase === 'falling') {
                e.vy += 200 * (deltaTime / 1000);
                e.x += e.vx * (deltaTime / 1000);
                e.y += e.vy * (deltaTime / 1000);
                if (e.timer >= e.fallDuration) {
                    e.phase = 'homing';
                    e.timer = 0;
                }
            } else { // homing
                const target = e.workerId === 'goblin' ? this.goblinPosition : this.humanPosition;
                if (!target) { this._treeSeedDropEffects.splice(i, 1); continue; }
                const dx = target.x - e.x;
                const dy = target.y - e.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 12) {
                    this.inventory.add(e.resource, 1);
                    this._seedEffects.push(createHarvestEffect(target.x, target.y - 16, e.resource.tileId));
                    this._treeSeedDropEffects.splice(i, 1);
                } else {
                    const speed = Math.min(dist * 5, 400) * (deltaTime / 1000);
                    e.x += (dx / dist) * speed;
                    e.y += (dy / dist) * speed;
                }
            }
        }

        // Update other character animations (non-enemy NPCs)
        for (const character of this.characters) {
            character.update(deltaTime);
        }
    }

    render() {
        // Clear canvas
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Apply camera transformation
        this.camera.applyTransform(this.ctx);

        // Compute visible bounds once per frame and share with all render systems
        const renderBounds = this.camera.getVisibleBounds();

        // Update door-opening state for both tilemap and building renderers
        this.tilemap.setCharacterPositions([this.humanPosition, this.goblinPosition]);

        // Render tilemap (chunk tiles — great path zone y=45-48 is skipped here)
        this.tilemap.render(this.ctx, this.camera);

        // Render the great path strip (y=45-48): separate 4-row tilemap between home and farm.
        // Placed right after chunk tiles so tree backgrounds render OVER it (crowns/shadows).
        this.tilemap.renderGreatPath(this.ctx, this.camera);

        // Render chunk borders only (dashed outlines) — purchase signs rendered later above trees
        if (this.chunkManager) {
            this.chunkManager.render(this.ctx, this.camera);
        }

        // Render forest grass layer (surrounding the playable area)
        if (this.forestGenerator) {
            this.forestGenerator.render(this.ctx, this.camera);
        }

        // Render edge overlays (path/hoed tile borders) before building layers and tree bottoms
        if (this.overlayManager) {
            this.overlayManager.renderEdgeOverlays(this.ctx, this.camera, renderBounds);
        }

        // Render building layers (Decor, Buildings Base/Detail) AFTER path edge overlays
        // so path borders appear underneath building walls/decor.
        this.tilemap.renderBuildingLayers(this.ctx, this.camera);

        // Render tree trunk and shadow tiles (behind characters) - includes tree bottoms that should be on top of edge overlays
        if (this.forestGenerator) {
            this.forestGenerator.renderAllTreeBackgrounds(this.ctx, this.camera);
        }

        // Render non-edge overlays (holes, etc.) after tree backgrounds
        if (this.overlayManager) {
            this.overlayManager.renderNonEdgeOverlays(this.ctx, this.camera, renderBounds);
        }

        // Render new house ground/floor layers AFTER all path/overlay rendering so they
        // appear on top of path tiles and path edge overlays
        this.tilemap.renderGroundLayers(this.ctx, this.camera);

        // Render placed building ground/wall layers (above path overlays, below entities)
        if (this.buildingManager) {
            this.buildingManager.setCharacterPositions([this.humanPosition, this.goblinPosition]);
            this.buildingManager.render(this.ctx, this.camera, 'ground', null);
        }

        // Render tile selection highlight
        if (this.tileSelector) {
            this.tileSelector.render(this.ctx, this.camera);
        }

        // Render work queue overlay (tiles waiting to be worked on)
        this.renderWorkQueueOverlay();

        // Render replenishable zone borders (green=active, grey=paused) — drawn after ground tiles
        // so the border is visible on top of the dirt/hoed ground, but below crops and characters
        if (this.replenishZoneManager) {
            this.replenishZoneManager.render(this.ctx, this.camera, this.tilemap.tileSize);
        }

        // === DEPTH-SORTED RENDERING ===
        // Reuse pre-allocated array to avoid per-frame GC pressure
        const tileSize = this.tilemap.tileSize;
        const depthEntities = this._depthEntities;
        depthEntities.length = 0;

        // Add crops
        if (this.cropManager) {
            for (const crop of this.cropManager.getCrops()) {
                if (!crop.isGone) {
                    depthEntities.push({
                        type: 'crop',
                        entity: crop,
                        sortY: crop.getSortY(tileSize)
                    });
                }
            }
        }

        // Add ore veins
        if (this.oreManager) {
            for (const ore of this.oreManager.getOreVeins()) {
                if (!ore.isGone) {
                    depthEntities.push({
                        type: 'ore',
                        entity: ore,
                        sortY: ore.getSortY(tileSize)
                    });
                }
            }
        }

        // Add trees
        if (this.treeManager) {
            for (const tree of this.treeManager.getTrees()) {
                if (!tree.isGone) {
                    depthEntities.push({
                        type: 'tree',
                        entity: tree,
                        sortY: tree.getSortY(tileSize)
                    });
                }
            }
        }

        // Forest trees are NOT added here - trunk/shadow rendered in background pass,
        // crowns rendered in foreground pass after all depth-sorted entities

        // Add flowers
        if (this.flowerManager) {
            for (const flower of this.flowerManager.getFlowers()) {
                if (!flower.isGone) {
                    depthEntities.push({
                        type: 'flower',
                        entity: flower,
                        sortY: flower.getSortY(tileSize)
                    });
                }
            }
            // Add weeds
            for (const weed of this.flowerManager.getWeeds()) {
                if (!weed.isGone) {
                    depthEntities.push({
                        type: 'weed',
                        entity: weed,
                        sortY: weed.getSortY(tileSize)
                    });
                }
            }
        }

        // Add forest pocket contents
        if (this.forestGenerator) {
            // Add pocket ore veins
            for (const ore of this.forestGenerator.getPocketOreVeins()) {
                if (!ore.isGone) {
                    depthEntities.push({
                        type: 'forestOre',
                        entity: ore,
                        sortY: ore.getSortY(tileSize)
                    });
                }
            }
            // Add pocket crops
            for (const crop of this.forestGenerator.getPocketCrops()) {
                if (!crop.isGone) {
                    depthEntities.push({
                        type: 'forestCrop',
                        entity: crop,
                        sortY: crop.getSortY(tileSize)
                    });
                }
            }
        }

        // Add enemies
        if (this.enemyManager) {
            for (const enemy of this.enemyManager.getEnemies()) {
                depthEntities.push({
                    type: 'enemy',
                    entity: enemy,
                    sortY: enemy.getSortY()
                });
            }
        }

        // Add human character
        // Use center position for depth sorting
        // This ensures characters in tiles above the bottom tile of multi-tile sprites appear behind
        if (this.humanPosition) {
            depthEntities.push({
                type: 'human',
                entity: null,
                sortY: this.humanPosition.y
            });
        }

        // Add goblin character
        if (this.goblinPosition && this.goblinSprite) {
            depthEntities.push({
                type: 'goblin',
                entity: this.goblinSprite,
                sortY: this.goblinPosition.y
            });
        }

        // Add other characters (non-enemy NPCs)
        for (const character of this.characters) {
            depthEntities.push({
                type: 'character',
                entity: character,
                sortY: character.y
            });
        }

        // Add NPC travelers
        if (this.travelerManager) {
            for (const traveler of this.travelerManager.getTravelers()) {
                depthEntities.push({
                    type: 'traveler',
                    entity: traveler,
                    sortY: traveler.getSortY()
                });
            }
        }

        // Add roadside stand items (rendered at table surface level)
        if (this.roadsideStand) {
            depthEntities.push({
                type: 'stand',
                entity: this.roadsideStand,
                sortY: this.roadsideStand.getSortY()
            });
        }

        // Add well base (middle + bottom rows)
        if (this.well) {
            depthEntities.push({
                type: 'well',
                entity: this.well,
                sortY: this.well.getSortY()
            });
        }

        // Sort by Y position (entities with lower Y render first, so higher Y appears in front)
        depthEntities.sort((a, b) => a.sortY - b.sortY);

        // Render in sorted order
        for (const item of depthEntities) {
            switch (item.type) {
                case 'crop':
                    this.cropManager.renderCropGroundTile(this.ctx, item.entity);
                    this.cropManager.renderCrop(this.ctx, item.entity);
                    break;
                case 'ore':
                    this.oreManager.renderOre(this.ctx, item.entity);
                    break;
                case 'tree':
                    this.treeManager.renderTree(this.ctx, item.entity);
                    break;
                case 'flower':
                    this.flowerManager.renderFlower(this.ctx, item.entity);
                    break;
                case 'weed':
                    this.flowerManager.renderWeed(this.ctx, item.entity);
                    break;
                case 'forestOre':
                    this.forestGenerator.renderPocketOre(this.ctx, item.entity);
                    break;
                case 'forestCrop':
                    this.forestGenerator.renderPocketCrop(this.ctx, item.entity);
                    break;
                case 'enemy':
                    this.enemyManager.renderEnemy(this.ctx, item.entity, this.camera);
                    break;
                case 'human':
                    this.renderHuman();
                    break;
                case 'goblin':
                    this.renderGoblin();
                    break;
                case 'character':
                    item.entity.render(this.ctx, this.camera);
                    break;
                case 'traveler':
                    item.entity.render(this.ctx, this.camera);
                    if (item.entity.isMilestone && item.entity.comboItems?.length) {
                        this._renderComboDisplay(item.entity);
                    }
                    break;
                case 'stand':
                    item.entity.renderBase(this.ctx);
                    item.entity.renderTableItems(this.ctx);
                    break;
                case 'well':
                    item.entity.renderBase(this.ctx);
                    break;
            }
        }

        // Render forest tree crowns (in front of characters)
        if (this.forestGenerator) {
            this.forestGenerator.renderAllTreeForegrounds(this.ctx, this.camera);
        }

        // Render chunk purchase signs above trees and all entities
        if (this.chunkManager) {
            this.chunkManager.renderPurchaseSigns(this.ctx, this.camera);
        }

        // Render upper layers (Buildings Upper) - above characters
        this.tilemap.renderUpperLayers(this.ctx, this.camera);

        // Render placed building upper/roof layers (above characters)
        if (this.buildingManager) {
            // Hide roof of the building whose menu is currently open
            const buildingMenuOpen = this.uiManager?.activeMenu === 'building';
            const menuBuildingId = buildingMenuOpen ? (this._buildingMenuBuilding?.id ?? null) : null;
            this.buildingManager.render(this.ctx, this.camera, 'upper', null);
            this.buildingManager.render(this.ctx, this.camera, 'roof', menuBuildingId);
        }

        // Render roadside stand banner (y=63, above all characters)
        if (this.roadsideStand) {
            this.roadsideStand.renderBanner(this.ctx, this.camera);
        }

        // Render well top row (above characters, like stand banner)
        if (this.well) {
            this.well.renderTop(this.ctx);
        }

        // House roof hidden when home upgrade (crafting) menu is open; shed roof hidden when storage menu is open
        const craftingMenuOpen = this.uiManager?.activeMenu === 'crafting';
        const storageMenuOpen = this.uiManager?.activeMenu === 'storage';
        if (!craftingMenuOpen) {
            this.tilemap.renderHouseRoofLayers(this.ctx, this.camera);
        }
        if (!storageMenuOpen) {
            this.tilemap.renderShedRoofLayers(this.ctx, this.camera);
        }
        // Chimney smoke renders above the house roof when it is visible
        if (this.chimneySmoke && !craftingMenuOpen) {
            this.chimneySmoke.render(this.ctx, this.camera);
        }

        // Render chimney smoke for occupied small_houses
        if (this.buildingManager) {
            this.buildingManager.renderChimneys(this.ctx, this.camera);
        }

        // Render all standard floating icon effects in one batched pass (1 save/restore total)
        {
            const tilesetImage = this.tilemap.tilesetImage;
            const getTilesetSourceRect = id => this.tilemap.getTilesetSourceRect(id);
            const tileSize = this.tilemap.tileSize;
            renderEffectsMulti(this.ctx, [
                this.cropManager?.effects,
                this.oreManager?.effects,
                this.treeManager?.effects,
                this.forestGenerator?.choppingEffects,
                this.flowerManager?.harvestEffects,
                this._seedEffects,
            ], tilesetImage, getTilesetSourceRect, tileSize);
        }
        // FlowerManager weed click effects (physics-based leaf particles — not standard icons)
        if (this.flowerManager) {
            this.flowerManager.renderWeedEffects(this.ctx, this.camera);
        }
        if (this.roadsideStand) {
            this.roadsideStand.renderSaleEffects(this.ctx);
        }

        // Render physics-based tree seed drop effects (1/3-scale seed icons)
        if (this._treeSeedDropEffects.length > 0) {
            const tileSize = this.tilemap.tileSize;
            this.ctx.save();
            this.ctx.imageSmoothingEnabled = false;
            for (const e of this._treeSeedDropEffects) {
                const sz = tileSize * e.scale; // 1/3 size
                const src = this.tilemap.getTilesetSourceRect(e.resource.tileId);
                if (!src) continue;
                const sx = this.camera.worldToScreenX(e.x);
                const sy = this.camera.worldToScreenY(e.y);
                this.ctx.globalAlpha = e.alpha;
                this.ctx.drawImage(
                    this.tilemap.tilesetImage,
                    src.x, src.y, src.width, src.height,
                    sx - sz / 2, sy - sz / 2, sz, sz
                );
            }
            this.ctx.restore();
        }

        // Render player health bar if damaged (on top of sprites)
        if (this.playerHealth < this.playerMaxHealth) {
            this.renderPlayerHealthBar();
        }

        // Render goblin health bar if damaged
        if (this.goblinHealth < this.goblinMaxHealth) {
            this.renderGoblinHealthBar();
        }

        // Building placement ghost preview
        if (this._buildPlacementMode?.type === 'building' && this.buildingManager) {
            const def = BUILDING_DEFS[this._buildPlacementMode.defId];
            if (def?.hasTilemap) {
                this.buildingManager.renderGhost(
                    this.ctx, this.camera,
                    this._buildPlacementMode.defId,
                    this._buildPlacementTileX, this._buildPlacementTileY,
                    this._buildPlacementValid
                );
            }
        }

        // Debug overlays (path connectivity, building states)
        if (this._showBuildingDebug && this.buildingManager) {
            this.buildingManager.renderDebugOverlay(this.ctx, this.camera);
        }
        if (this._showPathDebug) {
            this._renderPathDebug();
        }

        // Reset transformation for UI (if needed later)
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // Render the human character (extracted for depth-sorted rendering)
    renderHuman() {
        if (this.humanSprites) {
            for (const sprite of this.humanSprites) {
                sprite.render(this.ctx, this.camera);
            }
        }
    }

    // Render the goblin character (extracted for depth-sorted rendering)
    renderGoblin() {
        if (this.goblinSprite) {
            this.goblinSprite.render(this.ctx, this.camera);
        }
    }

    renderPlayerHealthBar() {
        if (!this.humanPosition) return;

        const barWidth = 32;
        const barHeight = 5;
        const barX = this.humanPosition.x - barWidth / 2;
        const barY = this.humanPosition.y - 24; // Above the sprite

        // Background (dark red)
        this.ctx.fillStyle = '#8B0000';
        this.ctx.fillRect(barX, barY, barWidth, barHeight);

        // Health (green to yellow to red based on health)
        const healthPercent = this.playerHealth / this.playerMaxHealth;
        if (healthPercent > 0.5) {
            this.ctx.fillStyle = '#32CD32'; // Green
        } else if (healthPercent > 0.25) {
            this.ctx.fillStyle = '#FFD700'; // Yellow
        } else {
            this.ctx.fillStyle = '#FF4500'; // Orange-red
        }
        this.ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);

        // Border
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(barX, barY, barWidth, barHeight);
    }

    renderGoblinHealthBar() {
        if (!this.goblinPosition) return;

        const barWidth = 32;
        const barHeight = 5;
        const barX = this.goblinPosition.x - barWidth / 2;
        const barY = this.goblinPosition.y - 24; // Above the sprite

        // Background (dark red)
        this.ctx.fillStyle = '#8B0000';
        this.ctx.fillRect(barX, barY, barWidth, barHeight);

        // Health (green to yellow to red based on health)
        const healthPercent = this.goblinHealth / this.goblinMaxHealth;
        if (healthPercent > 0.5) {
            this.ctx.fillStyle = '#32CD32'; // Green
        } else if (healthPercent > 0.25) {
            this.ctx.fillStyle = '#FFD700'; // Yellow
        } else {
            this.ctx.fillStyle = '#FF4500'; // Orange-red
        }
        this.ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);

        // Border
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(barX, barY, barWidth, barHeight);
    }

    loop(currentTime) {
        if (!this.running) return;

        try {
            // Calculate delta time
            const deltaTime = this.lastTime ? currentTime - this.lastTime : 0;
            this.lastTime = currentTime;

            // Update and render
            this.update(deltaTime);
            this.render();
        } catch (error) {
            log.error('Error in game loop:', error);
            // Continue running despite errors to prevent complete freeze
        }

        // Continue loop
        requestAnimationFrame((time) => this.loop(time));
    }

    start() {
        log.info('Starting game loop...');
        this.running = true;
        this.lastTime = 0;
        requestAnimationFrame((time) => this.loop(time));
    }

    // === Roadside Stand Service State Machine ===

    // Called by Traveler when it stops at the stand
    _onTravelerAtStand(traveler) {
        // Milestone travelers: check if their full combo is stocked, then buy all at once
        if (traveler.isMilestone && traveler.comboItems?.length) {
            this._handleMilestoneTravelerAtStand(traveler);
            return;
        }

        if (!traveler.wantedPurchases?.length) {
            log.debug(`Traveler leaving stand immediately: no wantedPurchases`);
            traveler.resumeWalking();
            return;
        }
        if (this.standService.state !== 'idle') {
            // Stand is busy — join the queue and wait
            this.standQueue.push({ traveler, waitTimer: 0 });
            log.debug(`Traveler queued at stand (queue length=${this.standQueue.length}, state=${this.standService.state})`);
            traveler.isStopped = true;
            return;
        }
        this._beginServingTraveler(traveler);
    }

    _handleMilestoneTravelerAtStand(traveler) {
        const stand = this.roadsideStand;
        if (!stand) { traveler.resumeWalking(); return; }

        // combo items use RESOURCE_TYPES key names (e.g. 'CROP_RADISH');
        // resolve to the lowercase resource.id used by stand slots (e.g. 'crop_radish')
        const combo = traveler.comboItems;
        const resolvedCombo = combo.map(item => ({
            resourceId: RESOURCE_TYPES[item.id]?.id ?? item.id,
            count: item.count
        }));

        // Check if all combo items are available at the stand in required counts
        const canBuy = resolvedCombo.every(item => {
            const count = stand.getCountOfResource?.(item.resourceId) ?? 0;
            return count >= item.count;
        });

        if (!canBuy) {
            log.debug(`Milestone traveler ${traveler.villagerType}: combo not fully stocked, leaving`);
            traveler.resumeWalking();
            return;
        }

        // Buy the entire combo
        let totalGold = 0;
        for (const item of resolvedCombo) {
            const removed = stand.removeResourceCount?.(item.resourceId, item.count);
            if (removed) totalGold += removed;
        }
        if (totalGold > 0) this.inventory.addGold(totalGold);

        log.info(`Milestone traveler ${traveler.villagerType} bought combo (+${totalGold}g), recruiting`);

        // Recruit the villager into the target house
        if (traveler.targetHouse && this.villagerManager) {
            this.villagerManager.onVillagerRecruited(traveler.villagerType, traveler.targetHouse);
        }

        // Stand UI refresh
        if (this.uiManager) this.uiManager.refreshStandMenuIfOpen();

        // Traveler walks to their new house instead of resuming path travel
        if (traveler.targetHouse) {
            const def = BUILDING_DEFS[traveler.targetHouse.definitionId];
            const ts = this.tilemap.tileSize;
            const doorOffX = def?.doorOffset?.x ?? 2;
            const doorOffY = def?.doorOffset?.y ?? 4;
            const doorX = traveler.targetHouse.tileX + doorOffX;
            // doorPathY = tile one south of door = path-connected tile used by PathConnectivity
            const doorPathY = traveler.targetHouse.tileY + doorOffY + 1;
            const doorY     = traveler.targetHouse.tileY + doorOffY;

            let waypoints = this.pathConnectivity?.getWaypointsToGreatPath(doorX, doorPathY, ts) ?? null;
            if (waypoints) {
                // Append the actual door tile as the final destination
                waypoints.push({ x: doorX * ts + ts / 2, y: doorY * ts + ts / 2 });
            } else {
                // Fallback: straight walk to door (building not path-connected somehow)
                waypoints = [
                    { x: doorX * ts + ts / 2, y: CONFIG.traveler.pathCenterY },
                    { x: doorX * ts + ts / 2, y: doorY * ts + ts / 2 },
                ];
            }
            traveler.walkToHouse(waypoints);
        } else {
            traveler.resumeWalking();
        }
    }

    /**
     * Render floating combo icons above a milestone traveler.
     * Drawn in world space (camera transform already active) so the display
     * tracks the traveler exactly at all zoom levels and DPR values.
     * Each icon: 32×32 screen-px tileset tile, count badge bottom-center, ✓/✗ top-right.
     */
    _renderComboDisplay(traveler) {
        const combo = traveler.comboItems;  // [{ id: 'CROP_RADISH', count: N }]
        if (!combo?.length) return;

        const ctx = this.ctx;
        const z = this.camera.zoom;
        const tilesetImage = this.tilemap.tilesetImage;
        const stand = this.roadsideStand;
        const tileSize = this.tilemap.tileSize;  // 16 world px

        // All sizes are in world units (divide screen-px by zoom so they appear
        // at a fixed screen size regardless of zoom level).
        const iconSize = 32 / z;
        const iconGap  = 4  / z;
        const pad      = 2  / z;
        const totalW   = combo.length * iconSize + (combo.length - 1) * iconGap;

        // Place icons above the traveler's head.
        // Sprite is centered at traveler.y; head is ~1 tile above center.
        const rowY   = traveler.y - tileSize - iconSize - (6 / z);
        const startX = traveler.x - totalW / 2;

        ctx.save();

        for (let i = 0; i < combo.length; i++) {
            const item = combo[i];
            const resource = RESOURCE_TYPES[item.id];
            if (!resource) continue;

            const ix = startX + i * (iconSize + iconGap);
            const iy = rowY;

            // Draw semi-transparent dark background
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(ix - pad, iy - pad, iconSize + 2 * pad, iconSize + 2 * pad);

            // Draw tileset icon
            if (tilesetImage) {
                const src = this.tilemap.getTilesetSourceRect(resource.tileId);
                if (src) {
                    ctx.drawImage(tilesetImage, src.x, src.y, src.width, src.height, ix, iy, iconSize, iconSize);
                }
            }

            // Count badge (bottom-center, only if > 1)
            if (item.count > 1) {
                ctx.font = `bold ${9 / z}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillStyle = '#000';
                ctx.fillText(item.count, ix + iconSize / 2 + 1 / z, iy + iconSize - 1 / z);
                ctx.fillStyle = '#fff';
                ctx.fillText(item.count, ix + iconSize / 2, iy + iconSize - 2 / z);
            }

            // Check/X overlay (top-right corner)
            const resolvedId = resource.id;
            const stocked = stand ? (stand.getCountOfResource?.(resolvedId) ?? 0) : 0;
            const satisfied = stocked >= item.count;

            ctx.font = `bold ${11 / z}px sans-serif`;
            ctx.textAlign = 'left';
            // Shadow
            ctx.fillStyle = '#000';
            ctx.fillText(satisfied ? '✓' : '✗', ix + iconSize - 9 / z, iy + 12 / z);
            // Color
            ctx.fillStyle = satisfied ? '#44ff44' : '#ff4444';
            ctx.fillText(satisfied ? '✓' : '✗', ix + iconSize - 10 / z, iy + 11 / z);
        }

        ctx.restore();
    }

    // Begin a new stand service session for the given traveler.
    _beginServingTraveler(traveler) {
        this.standService = {
            state: 'dispatching',
            workerId: null,
            slotIndex: traveler.wantedPurchases[0],
            traveler,
            waitTimer: 0
        };
        // Pause 1 s at the item before executing the purchase
        traveler.startPurchasePause(1000);
        log.debug(`Serving traveler at stand, slot=${traveler.wantedPurchases[0]}`);
    }

    // When the stand becomes idle, pull the next queued traveler (if any).
    _dequeueNextTraveler() {
        // Purge any despawned entries first
        this.standQueue = this.standQueue.filter(e => !e.traveler.isDespawned);
        if (this.standQueue.length === 0) {
            this.standService = { state: 'idle', workerId: null, slotIndex: -1, traveler: null, waitTimer: 0 };
            return;
        }
        const next = this.standQueue.shift();
        log.debug(`Dequeuing next traveler (queue remaining=${this.standQueue.length})`);
        this._beginServingTraveler(next.traveler);
    }

    // Called by Traveler after a 1-second pause — now execute the purchase
    _onPurchaseReady(traveler) {
        if (this.standService.traveler !== traveler) return; // stale / superseded
        this._dispatchStandServiceWorker();
    }

    // Find the closest idle-eligible worker to the given stand slot
    _findClosestWorkerToStand(slotIndex) {
        const tx = this.roadsideStand.getSlotTileX(slotIndex);
        const ty = this.roadsideStand.getServiceTileY();
        const ts = this.tilemap.tileSize;
        const dist = (pos) => Math.abs(Math.floor(pos.x / ts) - tx) + Math.abs(Math.floor(pos.y / ts) - ty);

        const humanOk  = this.humanPosition  && !this.jobManager.workers.get('human')?.isPausedForCombat;
        const goblinOk = this.goblinPosition && !this.jobManager.workers.get('goblin')?.isPausedForCombat;

        if (humanOk && goblinOk) {
            return dist(this.humanPosition) <= dist(this.goblinPosition) ? 'human' : 'goblin';
        }
        if (humanOk) return 'human';
        if (goblinOk) return 'goblin';
        return null;
    }

    // Dispatch the right worker to serve the current traveler's next item
    _dispatchStandServiceWorker() {
        const { slotIndex, traveler } = this.standService;
        const slot = this.roadsideStand.slots[slotIndex];

        if (!slot?.resource) {
            log.debug(`Traveler slot ${slotIndex} is empty (sold since evaluation), advancing`);
            this._advanceTravelerPurchase();
            return;
        }

        const workerId = this._findClosestWorkerToStand(slotIndex);
        if (!workerId) {
            log.debug(`Traveler leaving stand: no available worker to serve slot ${slotIndex}`);
            traveler.resumeWalking();
            this._dequeueNextTraveler();
            return;
        }

        this.standService.workerId = workerId;
        const standTileX = this.roadsideStand.getSlotTileX(slotIndex);
        // Workers stand at the service tile (one south of stand base, y=65)
        const standTileY = this.roadsideStand.getServiceTileY();

        this.jobManager.dispatchStandService(workerId, standTileX, standTileY, {
            slotIndex,
            resource: slot.resource,
            price: slot.resource.sell_price
        });
    }

    // Move to the traveler's next wanted purchase, or release them if done
    _advanceTravelerPurchase() {
        const { traveler } = this.standService;
        if (!traveler) {
            this._dequeueNextTraveler();
            return;
        }

        traveler.currentPurchaseIndex++;
        if (traveler.currentPurchaseIndex >= traveler.wantedPurchases.length) {
            traveler.resumeWalking();
            this._dequeueNextTraveler();
            return;
        }

        const nextSlotIndex = traveler.wantedPurchases[traveler.currentPurchaseIndex];
        this.standService.slotIndex = nextSlotIndex;
        this.standService.state = 'dispatching';
        // Move traveler horizontally to the new slot; worker is dispatched after the
        // traveler's 1-second pause fires _onPurchaseReady (via Traveler Phase 3 completion)
        traveler.moveToNextSlot(this.roadsideStand.getSlotWorldX(nextSlotIndex));
    }

    // Called by JobManager after the stand_service transaction completes
    onStandServiceComplete(workerId, slotIndex) {
        this.standService.state = 'waiting';
        this.standService.waitTimer = 0;
        log.debug(`Stand service complete slot=${slotIndex}, worker=${workerId} waiting ${CONFIG.stand.waitDuration}ms`);
    }

    // After a sale, check if a spare item exists to refill an auto-replenish slot.
    // "Spare" = owned count minus items already claimed by other slots.
    // If a spare exists, restore the resource and keep autoReplenish on.
    // Otherwise the slot stays cleared (autoReplenish was already reset by clearSlot).
    tryReplenishStandSlot(slotIndex, resource) {
        const stand = this.roadsideStand;
        const claimedByOthers = stand.slots.filter((s, i) =>
            i !== slotIndex && s.resource?.id === resource.id
        ).length;
        const available = this.inventory.getCount(resource) - claimedByOthers;
        if (available > 0) {
            stand.slots[slotIndex].resource = resource;
            stand.slots[slotIndex].autoReplenish = true;
            log.info(`Auto-replenished slot ${slotIndex} with ${resource.name}`);
        } else {
            log.info(`Auto-replenish slot ${slotIndex}: no spare ${resource.name}, slot cleared`);
        }
    }

    // Update the stand service state machine each frame
    _updateStandService(deltaTime) {
        // Tick patience for queued travelers; drop any who give up
        if (this.standQueue.length > 0) {
            const patience = CONFIG.stand.traveler.queuePatience;
            this.standQueue = this.standQueue.filter(entry => {
                if (entry.traveler.isDespawned) return false;
                entry.waitTimer += deltaTime;
                if (entry.waitTimer >= patience) {
                    log.debug(`Queued traveler lost patience after ${Math.round(entry.waitTimer)}ms`);
                    entry.traveler.resumeWalking();
                    return false;
                }
                return true;
            });
        }

        if (this.standService.state !== 'waiting') return;

        this.standService.waitTimer += deltaTime;
        const { traveler, workerId } = this.standService;

        // If traveler despawned mid-service, clean up immediately
        if (!traveler || traveler.isDespawned) {
            if (workerId) this.jobManager.resumeWorkerFromStand(workerId);
            this._dequeueNextTraveler();
            return;
        }

        if (this.standService.waitTimer >= CONFIG.stand.waitDuration) {
            if (workerId) this.jobManager.resumeWorkerFromStand(workerId);
            this._advanceTravelerPurchase();
        }
    }

    // Subscribe to inventory changes and keep gold display in sync
    _initGoldDisplay() {
        this._goldAmountEl = document.getElementById('gold-amount');
        if (!this._goldAmountEl) return;

        // Seed initial displayed value from current inventory
        this.targetGold = this.inventory.getGold();
        this.displayedGold = this.targetGold;
        this._goldAmountEl.textContent = this.displayedGold;

        this.inventory.onChange(() => { this.targetGold = this.inventory.getGold(); });
    }

    // Well menu is now handled by UIManager.openWellMenu() — no static DOM wiring needed.

    // === Zone Management Panel ===

    _openZonePanel(zone) {
        if (this.toolbar) this.toolbar.exitZoneManageMode();

        const panel = document.getElementById('zone-manage-panel');
        if (!panel) return;

        panel.dataset.zoneId = zone.id;
        panel.querySelector('#zone-panel-title').textContent = `Zone: ${zone.cropName}`;
        panel.style.display = 'flex';

        // Change seed picker (seed buttons)
        const seedPicker = panel.querySelector('#zone-seed-picker');
        if (seedPicker) seedPicker.style.display = 'none';
    }

    _closeZonePanel() {
        const panel = document.getElementById('zone-manage-panel');
        if (panel) {
            panel.style.display = 'none';
            delete panel.dataset.zoneId;
        }
    }

    _initZonePanel() {
        const panel = document.getElementById('zone-manage-panel');
        if (!panel) return;

        panel.querySelector('#zone-panel-close').addEventListener('click', () => this._closeZonePanel());

        panel.querySelector('#zone-delete-btn').addEventListener('click', () => {
            const zoneId = panel.dataset.zoneId;
            if (zoneId && this.replenishZoneManager) {
                this.replenishZoneManager.deleteZone(zoneId);
            }
            this._closeZonePanel();
        });

        panel.querySelector('#zone-change-seed-btn').addEventListener('click', () => {
            const seedPicker = panel.querySelector('#zone-seed-picker');
            if (seedPicker) seedPicker.style.display = seedPicker.style.display === 'none' ? 'flex' : 'none';
        });

        panel.querySelector('#zone-expand-btn').addEventListener('click', () => {
            const zoneId = panel.dataset.zoneId;
            if (!zoneId) return;
            this._closeZonePanel();
            // Enter zone expansion mode
            this.tileSelector.zoneExpansionMode = true;
            this.tileSelector.zoneExpansionTargetId = zoneId;
            const indicator = document.getElementById('zone-expand-indicator');
            if (indicator) {
                indicator.style.display = 'flex';
                indicator.querySelector('.zone-indicator-label').textContent = 'Drag to add tiles to zone…';
            }
            // Switch to tool mode so drag selection works, disable map panning
            this.inputMode = 'tool';
            this.inputManager.setPanningEnabled(false);
        });

        // Seed picker buttons
        const seedPicker = panel.querySelector('#zone-seed-picker');
        if (seedPicker) {
            for (const cropKey of ['CARROT','RADISH','PARSNIP','POTATO','BEETROOT','CABBAGE',
                                   'CAULIFLOWER','SUNFLOWER','WHEAT','PUMPKIN']) {
                const cropData = { CARROT:0, RADISH:4, PARSNIP:5, POTATO:6, BEETROOT:8, CABBAGE:7,
                                   CAULIFLOWER:1, SUNFLOWER:3, WHEAT:9, PUMPKIN:2 };
                const idx = cropData[cropKey];
                const cropNames = { 0:'Carrot',1:'Cauliflower',2:'Pumpkin',3:'Sunflower',4:'Radish',
                                    5:'Parsnip',6:'Potato',7:'Cabbage',8:'Beetroot',9:'Wheat' };
                const btn = document.createElement('button');
                btn.className = 'zone-seed-pick-btn';
                btn.textContent = cropNames[idx];
                btn.addEventListener('click', () => {
                    const zoneId = panel.dataset.zoneId;
                    if (zoneId && this.replenishZoneManager) {
                        this.replenishZoneManager.changeSeed(zoneId, idx);
                        panel.querySelector('#zone-panel-title').textContent = `Zone: ${cropNames[idx]}`;
                    }
                    seedPicker.style.display = 'none';
                });
                seedPicker.appendChild(btn);
            }
        }

        // Cancel button on expand indicator
        const indicator = document.getElementById('zone-expand-indicator');
        if (indicator) {
            indicator.querySelector('.zone-indicator-cancel').addEventListener('click', () => {
                this.tileSelector.zoneExpansionMode = false;
                this.tileSelector.zoneExpansionTargetId = null;
                indicator.style.display = 'none';
                this.inputMode = 'pan';
                this.inputManager.setPanningEnabled(true);
                if (this.toolbar) this.toolbar.exitZoneManageMode();
            });
        }
    }

    // Apply the crafting effect for a completed recipe (called by JobManager after cycles done)
    applyCraftingEffect(recipeId) {
        switch (recipeId) {
            // Cauldron — potions added to inventory
            case 'minor_health_potion':
                this.inventory.add(RESOURCE_TYPES.MINOR_HEALTH_POTION, 1);
                this.milestones.totalPotionsCrafted++;
                break;
            case 'stamina_tonic':
                this.inventory.add(RESOURCE_TYPES.STAMINA_TONIC, 1);
                this.milestones.totalPotionsCrafted++;
                break;
            case 'growth_elixir':
                this.inventory.add(RESOURCE_TYPES.GROWTH_ELIXIR, 1);
                this.milestones.totalPotionsCrafted++;
                break;
            case 'vitality_brew':
                this.inventory.add(RESOURCE_TYPES.VITALITY_BREW, 1);
                this.milestones.totalPotionsCrafted++;
                break;

            // Anvil — tool speed upgrades (same logic as old instant crafting)
            case 'faster_hoe':
            case 'faster_axe':
            case 'faster_pickaxe': {
                const toolId = recipeId === 'faster_hoe' ? 'hoe'
                             : recipeId === 'faster_axe' ? 'axe'
                             : 'pickaxe';
                this.toolAnimationMultipliers[toolId] = (this.toolAnimationMultipliers[toolId] || 1) * 2;
                this.homeUpgrades.purchasedToolUpgrades.add(recipeId);
                this.milestones.totalAnvilUpgrades++;
                break;
            }
            case 'vitality_boost':
                this.playerMaxHealth = Math.round(this.playerMaxHealth * 1.5);
                this.playerHealth = Math.min(this.playerHealth, this.playerMaxHealth);
                this.homeUpgrades.purchasedToolUpgrades.add('vitality_boost');
                this.milestones.totalAnvilUpgrades++;
                break;

            // Shrine — permanent bonuses
            case 'fertile_soil_1':
                this.homeUpgrades.shrineUpgrades.fertileSoilLevel = 1;
                this.milestones.totalShrineUpgrades++;
                break;
            case 'fertile_soil_2':
                this.homeUpgrades.shrineUpgrades.fertileSoilLevel = 2;
                this.milestones.totalShrineUpgrades++;
                break;
            case 'bountiful_harvest':
                this.homeUpgrades.shrineUpgrades.bountifulHarvest = true;
                this.milestones.totalShrineUpgrades++;
                break;
            case 'roadside_replenishment':
                this.homeUpgrades.shrineUpgrades.roadsideReplenishment = true;
                this.milestones.totalShrineUpgrades++;
                if (this.uiManager) this.uiManager.refreshStandMenuIfOpen();
                break;

            default:
                log.warn(`applyCraftingEffect: unknown recipeId '${recipeId}'`);
        }
        log.info(`Crafting effect applied: ${recipeId}`);
    }

    // Remove all trees, flowers, and weeds from every TOWN chunk (preserves buildings & paths)
    _clearTownChunkContent() {
        const { CHUNK_STATES } = window._chunkStates ?? {};
        for (const chunk of this.chunkManager.chunks.values()) {
            if (chunk.state !== 'town') continue;
            const cb = this.chunkManager.getChunkBounds(chunk.col, chunk.row);
            const bx = cb.x;
            const by = cb.y;
            const cs = CONFIG.chunks.size;

            // Flowers & weeds
            if (this.flowerManager) {
                for (const f of this.flowerManager.flowers) {
                    if (f.tileX >= bx && f.tileX < bx + cs && f.tileY >= by && f.tileY < by + cs)
                        f.isGone = true;
                }
                for (const w of this.flowerManager.weeds) {
                    if (w.tileX >= bx && w.tileX < bx + cs && w.tileY >= by && w.tileY < by + cs)
                        w.isGone = true;
                }
            }

            // Forest trees (sparse ForestGenerator trees)
            if (this.forestGenerator) {
                const toRemove = this.forestGenerator.trees.filter(t =>
                    t.baseX >= bx && t.baseX < bx + cs && t.baseY >= by && t.baseY < by + cs
                );
                for (const tree of toRemove) {
                    const idx = this.forestGenerator.trees.indexOf(tree);
                    if (idx !== -1) this.forestGenerator.trees.splice(idx, 1);
                    this.forestGenerator.trunkTileMap.delete(`${tree.baseX},${tree.baseY}`);
                    this.forestGenerator.trunkTileMap.delete(`${tree.baseX + 1},${tree.baseY}`);
                }
                if (toRemove.length > 0 && typeof this.forestGenerator.updateNeighborFlags === 'function') {
                    this.forestGenerator.updateNeighborFlags();
                }
            }
        }
        log.info('Cleared trees/flowers/weeds from all town chunks');
    }

    // Add cheat buttons to the debug menu and make the gear button visible
    _initDebugMenu() {
        const menu = document.getElementById('customize-menu');
        if (!menu) return;

        const cheatSection = document.createElement('div');
        cheatSection.className = 'debug-cheat-section';
        cheatSection.innerHTML = `
            <h3>Cheats</h3>
            <div class="debug-btn-row">
                <button class="debug-cheat-btn" id="cheat-gold-100">+100g</button>
                <button class="debug-cheat-btn" id="cheat-gold-1000">+1000g</button>
                <button class="debug-cheat-btn" id="cheat-gold-10000">+10000g</button>
            </div>
            <div class="debug-btn-row">
                <button class="debug-cheat-btn" id="cheat-seeds">+10 Each Seed</button>
                <button class="debug-cheat-btn" id="cheat-crops">+10 Each Crop</button>
            </div>
            <div class="debug-btn-row">
                <button class="debug-cheat-btn" id="cheat-hire-goblin">Hire Goblin</button>
                <button class="debug-cheat-btn" id="cheat-fire-goblin" style="display:none">Fire Goblin</button>
            </div>
            <div class="debug-btn-row">
                <button class="debug-cheat-btn" id="cheat-unlock-replenishment">Unlock Replenishment</button>
            </div>
            <div class="debug-btn-row">
                <button class="debug-cheat-btn" id="cheat-add-resources">Add All Resources</button>
                <button class="debug-cheat-btn" id="cheat-buy-town-chunk">Buy Town Chunk</button>
            </div>
            <div class="debug-btn-row">
                <button class="debug-cheat-btn" id="cheat-spawn-milestone-traveler">Spawn Milestone Traveler</button>
                <button class="debug-cheat-btn" id="cheat-place-test-building">Place Test Building</button>
            </div>
            <div class="debug-btn-row">
                <button class="debug-cheat-btn" id="cheat-toggle-path-debug">Toggle Path Debug</button>
                <button class="debug-cheat-btn" id="cheat-toggle-building-debug">Toggle Building Debug</button>
            </div>
            <div class="debug-btn-row">
                <button class="debug-cheat-btn" id="cheat-add-villager-housed">Add Villager (Housed)</button>
                <button class="debug-cheat-btn" id="cheat-add-villager-unhoused">Add Villager (Unhoused)</button>
            </div>
            <div class="debug-btn-row">
                <button class="debug-cheat-btn" id="cheat-clear-town-chunks">Clear Town Chunks</button>
            </div>
        `;
        menu.appendChild(cheatSection);

        document.getElementById('cheat-gold-100').addEventListener('click', () => this.inventory.addGold(100));
        document.getElementById('cheat-gold-1000').addEventListener('click', () => this.inventory.addGold(1000));
        document.getElementById('cheat-gold-10000').addEventListener('click', () => this.inventory.addGold(10000));

        document.getElementById('cheat-seeds').addEventListener('click', () => {
            for (const key of Object.keys(RESOURCE_TYPES)) {
                if (RESOURCE_TYPES[key].category === 'seed') {
                    this.inventory.add(RESOURCE_TYPES[key], 10);
                }
            }
        });

        document.getElementById('cheat-crops').addEventListener('click', () => {
            for (const key of Object.keys(RESOURCE_TYPES)) {
                if (RESOURCE_TYPES[key].category === 'crop' && RESOURCE_TYPES[key].id !== 'crop_weed') {
                    this.inventory.add(RESOURCE_TYPES[key], 10);
                }
            }
        });

        document.getElementById('cheat-hire-goblin').addEventListener('click', () => {
            this.hireGoblin();
            document.getElementById('cheat-hire-goblin').style.display = 'none';
            document.getElementById('cheat-fire-goblin').style.display = '';
        });
        document.getElementById('cheat-fire-goblin').addEventListener('click', () => {
            this.fireGoblin();
            document.getElementById('cheat-fire-goblin').style.display = 'none';
            document.getElementById('cheat-hire-goblin').style.display = '';
        });

        document.getElementById('cheat-unlock-replenishment').addEventListener('click', () => {
            this.homeUpgrades.shrineUpgrades.roadsideReplenishment = true;
            if (this.uiManager) this.uiManager.refreshStandMenuIfOpen();
            log.info('Replenishment unlocked via debug cheat');
        });

        document.getElementById('cheat-add-resources').addEventListener('click', () => {
            this.inventory.addGold(10000);
            this.inventory.add(RESOURCE_TYPES.WOOD, 100);
            this.inventory.add(RESOURCE_TYPES.ORE_STONE, 100);
            this.inventory.add(RESOURCE_TYPES.ORE_IRON, 100);
            this.inventory.add(RESOURCE_TYPES.ORE_COAL, 100);
            this.inventory.add(RESOURCE_TYPES.ORE_GOLD, 100);
            this.inventory.add(RESOURCE_TYPES.ORE_MITHRIL, 100);
            log.info('Added all resources via debug cheat');
        });

        document.getElementById('cheat-buy-town-chunk').addEventListener('click', () => {
            if (!this.chunkManager) return;
            for (const chunk of this.chunkManager.chunks.values()) {
                if (chunk.state === 'purchasable' && chunk.isTownPlot) {
                    this.chunkManager.purchaseChunk(chunk.col, chunk.row, true);
                    log.info(`Debug: purchased town chunk (${chunk.col},${chunk.row})`);
                    return;
                }
            }
            log.info('No purchasable town chunks available');
        });

        document.getElementById('cheat-spawn-milestone-traveler').addEventListener('click', () => {
            if (!this.travelerManager) return;
            // Use eligible milestones first; fall back to first milestone in the list for debug
            const eligibleIds = this.villagerManager?.getEligibleMilestoneIds() ?? [];
            const milestoneId = eligibleIds[0] ?? VILLAGER_MILESTONES[0]?.id;
            if (!milestoneId) { log.info('No milestone definitions found'); return; }
            const readyBuildings = this.buildingManager?.placedBuildings.filter(b => b.state === 'active_empty') ?? [];
            if (readyBuildings.length === 0) {
                this._showNotification?.('No active_empty building — build & connect a house first');
                log.info('No active_empty building available for milestone traveler');
                return;
            }
            this.travelerManager._spawnMilestoneTraveler(milestoneId, readyBuildings[0]);
        });

        document.getElementById('cheat-place-test-building').addEventListener('click', async () => {
            if (!this.buildingManager) return;
            const def = BUILDING_DEFS['small_house'];
            if (!def) return;
            // Place at top-left of home chunk (col=1, row=2, world x=15, world y=30)
            const { homeCol, homeRow, size: chunkSize } = CONFIG.chunks;
            const tileX = homeCol * chunkSize; // 15
            const tileY = homeRow * chunkSize; // 30
            try {
                const building = await this.buildingManager.placeBuilding('small_house', tileX, tileY, 'active_empty');
                building.pathConnected = true;
                log.info(`Debug: placed small_house at (${tileX},${tileY})`);
            } catch (e) { log.error('Failed to place test building:', e); }
        });

        document.getElementById('cheat-toggle-path-debug').addEventListener('click', () => {
            this._showPathDebug = !this._showPathDebug;
            log.info(`Path debug: ${this._showPathDebug}`);
        });

        document.getElementById('cheat-toggle-building-debug').addEventListener('click', () => {
            this._showBuildingDebug = !this._showBuildingDebug;
            log.info(`Building debug: ${this._showBuildingDebug}`);
        });

        // "Add Villager (Housed)": spawns a walking entity on the great path that walks to nearest
        // empty active house and claims it, then increments the villager count on arrival.
        document.getElementById('cheat-add-villager-housed').addEventListener('click', () => {
            if (!this.buildingManager || !this.villagerManager) {
                log.warn('Debug: buildingManager or villagerManager not ready');
                return;
            }
            const house = this.buildingManager.placedBuildings.find(
                b => b.definitionId === 'small_house' && b.state === 'active_empty' && b.pathConnected
            );
            if (house) {
                this.travelerManager.spawnDebugVillager(house, this.pathConnectivity);
            } else {
                this.villagerManager.pendingDebugVillagers++;
                log.info(`Debug: no empty house — pendingDebugVillagers=${this.villagerManager.pendingDebugVillagers}`);
            }
        });

        // "Add Villager (Unhoused)": instantly increments the villager total without housing.
        document.getElementById('cheat-add-villager-unhoused').addEventListener('click', () => {
            this.milestones.totalVillagersRecruited++;
            log.info(`Debug: unhoused villager — totalVillagersRecruited=${this.milestones.totalVillagersRecruited}`);
        });

        // "Clear Town Chunks": removes trees, flowers, weeds from all TOWN state chunks.
        document.getElementById('cheat-clear-town-chunks').addEventListener('click', () => {
            this._clearTownChunkContent();
        });

        // ── Save / Load section ───────────────────────────────────────────────
        const saveSection = document.createElement('div');
        saveSection.className = 'debug-cheat-section';
        saveSection.innerHTML = `
            <h3>Save / Load</h3>
            <div class="debug-btn-row">
                <button class="debug-cheat-btn" id="save-game-btn">Save Game</button>
                <button class="debug-cheat-btn" id="download-save-btn">Download Save</button>
            </div>
            <div class="debug-btn-row">
                <button class="debug-cheat-btn" id="copy-save-btn">Copy to Clipboard</button>
                <button class="debug-cheat-btn" id="paste-load-btn">Paste &amp; Load</button>
            </div>
            <div id="paste-load-area" style="display:none; margin-top:6px;">
                <textarea id="paste-json-input" rows="5" style="width:100%; box-sizing:border-box; font-size:10px; resize:vertical;" placeholder="Paste save JSON here..."></textarea>
                <div class="debug-btn-row" style="margin-top:4px;">
                    <button class="debug-cheat-btn" id="paste-json-confirm">Load</button>
                    <button class="debug-cheat-btn" id="paste-json-cancel">Cancel</button>
                </div>
            </div>
            <div class="debug-btn-row" style="margin-top:4px;">
                <button class="debug-cheat-btn" id="new-game-btn" style="background:#8b2222;">New Game</button>
            </div>
            <div id="new-game-confirm" style="display:none; color:#f87; font-size:0.85em; margin-top:4px; text-align:center;">
                Click again to confirm — all progress will be lost!
            </div>
        `;
        menu.appendChild(saveSection);

        // Helper: briefly flash button text then restore
        const flashBtn = (id, msg, duration = 1200) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            const orig = btn.textContent;
            btn.textContent = msg;
            btn.disabled = true;
            setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, duration);
        };

        document.getElementById('save-game-btn').addEventListener('click', () => {
            if (this.saveManager?.saveToStorage()) flashBtn('save-game-btn', 'Saved!');
        });

        document.getElementById('download-save-btn').addEventListener('click', () => {
            this.saveManager?.downloadSave();
        });

        document.getElementById('copy-save-btn').addEventListener('click', async () => {
            await this.saveManager?.copyToClipboard();
            flashBtn('copy-save-btn', 'Copied!');
        });

        document.getElementById('paste-load-btn').addEventListener('click', () => {
            const area = document.getElementById('paste-load-area');
            area.style.display = area.style.display === 'none' ? '' : 'none';
        });

        document.getElementById('paste-json-confirm').addEventListener('click', async () => {
            const json = document.getElementById('paste-json-input').value.trim();
            if (!json) return;
            try {
                await this.saveManager.loadFromJson(json);
                document.getElementById('paste-load-area').style.display = 'none';
                document.getElementById('paste-json-input').value = '';
            } catch (e) {
                alert('Load failed: ' + e.message);
            }
        });

        document.getElementById('paste-json-cancel').addEventListener('click', () => {
            document.getElementById('paste-load-area').style.display = 'none';
        });

        // Two-click confirm for New Game
        let newGamePending = false;
        let newGameTimeout = null;
        document.getElementById('new-game-btn').addEventListener('click', () => {
            if (!newGamePending) {
                newGamePending = true;
                document.getElementById('new-game-confirm').style.display = '';
                newGameTimeout = setTimeout(() => {
                    newGamePending = false;
                    document.getElementById('new-game-confirm').style.display = 'none';
                }, 4000);
            } else {
                clearTimeout(newGameTimeout);
                this.saveManager?.newGame();
            }
        });
    }

    // Make goblin controls visible (toolbar queue buttons + job queue sections)
    hireGoblin() {
        if (this.goblinHired) return;
        this.goblinHired = true;
        this.milestones.goblinEverHired = true;

        // Spawn goblin on the great path (tile 22, 31 — first path tile in new layout)
        if (!this.goblinPosition) {
            const tileSize = this.tilemap.tileSize;
            this.goblinPosition = {
                x: 22 * tileSize + tileSize / 2,
                y: 31 * tileSize + tileSize / 2
            };
            if (this.goblinSprite) {
                this.goblinSprite.setPosition(this.goblinPosition.x, this.goblinPosition.y);
            }
        }

        if (this.toolbar) this.toolbar.setGoblinHired(true);
        if (this.jobQueueUI) this.jobQueueUI.setGoblinHired(true);
        log.info('Goblin hired! Spawned at (22, 31)');

        // Claim the first available active_empty small_house, or mark as needing one
        if (this.buildingManager) {
            const house = this.buildingManager.placedBuildings.find(
                b => b.definitionId === 'small_house' && b.state === 'active_empty'
            );
            if (house) {
                this._goblinClaimHouse(house);
            } else {
                this._goblinNeedsHouse = true;
                log.info('Goblin hired but no house available — will claim the next one');
            }
        }
    }

    /** Assign a small_house to the goblin. */
    _goblinClaimHouse(building) {
        this.goblinHouseBuilding = building;
        this._goblinNeedsHouse  = false;
        this._goblinIdleTimer   = 0;
        // Register as a villager (this also starts chimney smoke via VillagerManager)
        this.villagerManager?.onVillagerRecruited('goblin_elder', building);
        log.info(`Goblin claimed house ${building.id}`);
    }

    // Remove goblin from job system and hide all goblin UI.
    // Any player-submitted jobs the goblin was doing or had queued are moved
    // to queues.all so the human can pick them up.
    fireGoblin() {
        if (!this.goblinHired) return;
        this.goblinHired = false;

        if (this.jobManager) {
            const goblinState = this.jobManager.workers.get('goblin');
            const SYSTEM_TOOLS = new Set(['fill_well', 'stand_service', 'sword']);

            // Re-queue remaining tiles of the active job (if it's a player job)
            if (goblinState?.currentJob) {
                const job = goblinState.currentJob;
                if (!job.isIdleJob && !SYSTEM_TOOLS.has(job.tool.id)) {
                    const remaining = job.tiles.slice(job.currentTileIndex);
                    if (remaining.length > 0) {
                        const requeued = this.jobManager._buildJob(job.tool, remaining, 'all');
                        this.jobManager.queues.all.push(requeued);
                        log.info(`Goblin fired — re-queued ${remaining.length} tiles of job ${job.id} to queues.all`);
                    }
                }
                // Clear goblin worker state directly (skip cancelJob to avoid its cleanup callbacks)
                goblinState.currentJob = null;
                goblinState.isProcessing = false;
            }

            // Re-queue any player jobs waiting in the goblin's private queue
            for (const queuedJob of this.jobManager.queues.goblin) {
                if (!queuedJob.isIdleJob && !SYSTEM_TOOLS.has(queuedJob.tool.id)) {
                    const requeued = this.jobManager._buildJob(queuedJob.tool, queuedJob.tiles, 'all');
                    this.jobManager.queues.all.push(requeued);
                    log.info(`Goblin fired — moved queued job ${queuedJob.id} to queues.all`);
                }
            }
            this.jobManager.queues.goblin = [];

            // Clear goblin movement state
            this.goblinCurrentPath = null;
            this.goblinCurrentWorkTile = null;

            if (this.jobManager.onQueueChange) this.jobManager.onQueueChange();
            this.jobManager.tryAssignJobs();
        }

        // Reset goblin to idle animation
        this.setGoblinAnimation('IDLE', true);

        // Hide goblin UI controls
        if (this.toolbar) this.toolbar.setGoblinHired(false);
        if (this.jobQueueUI) this.jobQueueUI.setGoblinHired(false);

        // Release goblin's claimed house
        if (this.goblinHouseBuilding) {
            const h = this.goblinHouseBuilding;
            h.state = 'active_empty';
            h.occupant = null;
            this.buildingManager?.onBuildingVacated(h);
            if (this.villagerManager) {
                this.villagerManager.villagers = this.villagerManager.villagers.filter(
                    v => v.houseId !== h.id
                );
            }
            this.goblinHouseBuilding = null;
        }
        this._goblinNeedsHouse = false;
        this._goblinIdleTimer  = 0;

        // Hide well goblin fill button if the well menu is open
        const fillGoblinBtn = document.getElementById('well-fill-goblin-btn');
        if (fillGoblinBtn) fillGoblinBtn.style.display = 'none';

        log.info('Goblin fired!');
    }

    stop() {
        this.running = false;
    }
}
