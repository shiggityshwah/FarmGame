import { Camera } from './Camera.js';
import { TilemapRenderer } from './TilemapRenderer.js';
import { SpriteAnimator } from './SpriteAnimator.js';
import { InputManager } from './InputManager.js';
import { CropManager } from './CropManager.js';
import { Crop, CROP_TYPES } from './Crop.js';
import { Toolbar } from './Toolbar.js';
import { TileSelector } from './TileSelector.js';
import { JobManager } from './JobManager.js';
import { Pathfinder } from './Pathfinder.js';
import { TileOverlayManager } from './TileOverlayManager.js';
import { EnemyManager } from './EnemyManager.js';
import { OreManager } from './OreManager.js';
import { TreeManager } from './TreeManager.js';
import { FlowerManager } from './FlowerManager.js';
import { Inventory, RESOURCE_TYPES } from './Inventory.js';
import { UIManager } from './UIManager.js';
import { ORE_TYPES } from './OreVein.js';
import { CONFIG } from './config.js';
import { ForestGenerator } from './ForestGenerator.js';
import { JobQueueUI } from './JobQueueUI.js';

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

        // Inventory and UI
        this.inventory = null;
        this.uiManager = null;
        this.jobQueueUI = null;

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

        // Animation session counter - incremented each time animation changes
        // Used to invalidate stale callbacks from previous animations
        this.animationSession = 0;

        // Input mode and tool state
        this.inputMode = 'pan';  // 'pan' | 'tool'
        this.currentTool = null;

        // Character movement
        this.currentPath = null;
        this.moveSpeed = CONFIG.player.moveSpeed;

        // Character direction (false = right, true = left)
        this.facingLeft = false;

        // Current work tile (the tile being worked on, character stands adjacent)
        this.currentWorkTile = null;

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
            console.log('Initializing game...');

            // Initialize camera
            this.camera = new Camera(this.canvas.width, this.canvas.height);

            // Initialize tilemap with home map (house + grass area below)
            this.tilemap = new TilemapRenderer();
            await this.tilemap.generateHomeMap('Tileset/spr_tileset_sunnysideworld_16px.png');

            // Center camera on the house
            const houseCenter = this.tilemap.getHouseCenter();
            this.camera.x = houseCenter.x;
            this.camera.y = houseCenter.y;

            // Initialize forest generator and generate forest around the playable area
            this.forestGenerator = new ForestGenerator(this.tilemap);
            this.forestGenerator.generate({
                borderWidth: 12,         // Width of forest border in tree units (bigger forest)
                density: 0.75,           // 75% chance to place tree at valid position
                excludeRect: {           // Exclude the playable area
                    x: 0,
                    y: 0,
                    width: this.tilemap.mapWidth,
                    height: this.tilemap.mapHeight
                },
                litChance: 0.25,         // 25% chance for lit tree variants
                pocketCount: 8,          // Number of clearings in the forest
                pocketMinSize: 4,        // Minimum pocket radius
                pocketMaxSize: 7         // Maximum pocket radius
            });

            // Initialize enemy manager before creating characters
            this.enemyManager = new EnemyManager(this.tilemap);

            // Track occupied base tiles to prevent overlapping spawns
            const occupiedBaseTiles = new Set();

            // Create characters at random positions
            await this.createCharacters(occupiedBaseTiles);

            // Initialize tree manager and spawn one random tree
            this.treeManager = new TreeManager(this.tilemap);
            this.treeManager.spawnRandomTrees(1, occupiedBaseTiles);
            // Update occupied tiles with tree base positions
            for (const pos of this.treeManager.getOccupiedBaseTiles()) {
                occupiedBaseTiles.add(pos);
            }

            // Initialize crop manager and spawn crops (avoiding occupied tiles)
            this.cropManager = new CropManager(this.tilemap);
            this.spawnCropsAvoidingOccupied(15, occupiedBaseTiles);

            // Initialize ore manager and spawn ores (avoiding occupied tiles)
            // Always spawn one stone ore for testing crafting, plus one random ore
            this.oreManager = new OreManager(this.tilemap);
            this.spawnOresAvoidingOccupied(1, occupiedBaseTiles, ORE_TYPES.ROCK); // Stone ore for crafting
            this.spawnOresAvoidingOccupied(1, occupiedBaseTiles); // Random ore

            // Initialize inventory system
            this.inventory = new Inventory();
            // Give player starting gold
            this.inventory.addGold(100);

            // Initialize UI manager
            this.uiManager = new UIManager(this);

            // Initialize input manager
            this.inputManager = new InputManager(this.canvas, this.camera);
            this.inputManager.init();

            // Set up click handler for harvesting
            this.inputManager.setClickCallback((worldX, worldY) => {
                try {
                    this.onWorldClick(worldX, worldY);
                } catch (error) {
                    console.error('Error in click handler:', error);
                }
            });

            // Initialize new systems
            this.pathfinder = new Pathfinder(this.tilemap);
            this.pathfinder.setForestGenerator(this.forestGenerator);
            this.overlayManager = new TileOverlayManager(this.tilemap);
            this.tileSelector = new TileSelector(this.tilemap, this.camera, this.overlayManager, this.cropManager);
            this.tileSelector.setEnemyManager(this.enemyManager);
            this.tileSelector.setOreManager(this.oreManager);
            this.tileSelector.setTreeManager(this.treeManager);
            this.jobManager = new JobManager(this);
            // Register workers (characters that can process jobs)
            this.jobManager.registerWorker('human');
            this.jobManager.registerWorker('goblin');
            this.toolbar = new Toolbar(this, this.tilemap);

            // Initialize job queue UI panel
            this.jobQueueUI = new JobQueueUI(this);

            // Initialize flower manager (spawns flowers on grass tiles over time)
            this.flowerManager = new FlowerManager(this.tilemap, this.overlayManager);
            this.flowerManager.setCropManager(this.cropManager);
            this.flowerManager.setTreeManager(this.treeManager);
            this.flowerManager.setOreManager(this.oreManager);
            this.flowerManager.setEnemyManager(this.enemyManager);
            this.flowerManager.setForestGenerator(this.forestGenerator);

            // Connect flower manager to tile selector (for weed checking)
            this.tileSelector.setFlowerManager(this.flowerManager);

            // Connect forest generator to tile selector (for forest tree selection)
            this.tileSelector.setForestGenerator(this.forestGenerator);

            // Connect enemy manager to pathfinder and game
            this.enemyManager.setPathfinder(this.pathfinder);
            this.enemyManager.setGame(this);

            // Set up drag callbacks for tile selection
            this.inputManager.setDragStartCallback((worldX, worldY) => {
                try {
                    if (this.inputMode === 'tool' && this.currentTool) {
                        this.tileSelector.startSelection(worldX, worldY);
                    }
                } catch (error) {
                    console.error('Error in drag start handler:', error);
                }
            });

            this.inputManager.setDragMoveCallback((worldX, worldY) => {
                try {
                    if (this.inputMode === 'tool' && this.currentTool) {
                        this.tileSelector.updateSelection(worldX, worldY);
                    }
                } catch (error) {
                    console.error('Error in drag move handler:', error);
                }
            });

            this.inputManager.setDragEndCallback((worldX, worldY, hasMoved) => {
                try {
                    if (this.inputMode === 'tool' && this.currentTool) {
                        this.onTileSelectionComplete();
                    }
                } catch (error) {
                    console.error('Error in drag end handler:', error);
                }
            });

            console.log('Game initialized successfully!');
        } catch (error) {
            console.error('Failed to initialize game:', error);
            throw error;
        }
    }

    async createCharacters(occupiedBaseTiles) {
        // Create Human character at the spawn position (bottom center of house)
        const spawnPos = this.tilemap.getPlayerSpawnPosition();
        this.humanPosition = { x: spawnPos.x, y: spawnPos.y };
        occupiedBaseTiles.add(`${spawnPos.tileX},${spawnPos.tileY}`);
        await this.loadHumanSprites();
        console.log(`Human placed at tile (${spawnPos.tileX}, ${spawnPos.tileY})`);

        // Create Goblin NPC 2 tiles to the right of the human
        const goblinTileX = spawnPos.tileX + 2;
        const goblinTileY = spawnPos.tileY;
        const tileSize = this.tilemap.tileSize;
        this.goblinPosition = {
            x: goblinTileX * tileSize + tileSize / 2,
            y: goblinTileY * tileSize + tileSize / 2
        };
        occupiedBaseTiles.add(`${goblinTileX},${goblinTileY}`);
        await this.loadGoblinSprite();
        console.log(`Goblin placed at tile (${goblinTileX}, ${goblinTileY})`);

        // Create Skeleton enemy in the grass area via EnemyManager
        let position;
        let positionKey;
        do {
            position = this.tilemap.getRandomTilePosition();
            positionKey = `${position.tileX},${position.tileY}`;
        } while (occupiedBaseTiles.has(positionKey));
        occupiedBaseTiles.add(positionKey);

        await this.enemyManager.spawnEnemyAtWorld(position.x, position.y, 'skeleton');
        console.log(`Skeleton placed at tile (${position.tileX}, ${position.tileY})`);
    }

    // Spawn crops avoiding occupied base tiles
    spawnCropsAvoidingOccupied(count, occupiedBaseTiles) {
        const cropTypeKeys = Object.keys(CROP_TYPES);

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

            // Random crop type
            const randomType = cropTypeKeys[Math.floor(Math.random() * cropTypeKeys.length)];
            const cropType = CROP_TYPES[randomType];

            const crop = new Crop(position.tileX, position.tileY, cropType);
            this.cropManager.crops.push(crop);
        }

        console.log(`Spawned ${this.cropManager.crops.length} crops`);
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

        console.log(`Spawned ${this.oreManager.oreVeins.length} ore veins`);
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

        const sprite = new SpriteAnimator(this.goblinPosition.x, this.goblinPosition.y, frameCount, 8, framesPerRow);
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
        console.log(`[Game.setAnimation] Called with animation=${animation}, loop=${loop}, hasCallback=${!!onComplete}`);

        // COMBAT GUARD: Prevent work animations during combat
        // This is a fail-safe in case something tries to start a work animation
        if (this.isInCombat && !['IDLE', 'WALKING', 'ATTACK', 'HURT', 'DEATH'].includes(animation)) {
            console.warn(`Blocked work animation "${animation}" during combat!`);
            return;
        }

        // CRITICAL FIX: If we're changing animations while player is attacking, reset the attack flag
        // This prevents isPlayerAttacking from getting stuck when attack animation is interrupted
        if (this.isPlayerAttacking && animation !== 'ATTACK') {
            console.log('[Game.setAnimation] Resetting isPlayerAttacking flag');
            this.isPlayerAttacking = false;
        }

        // Increment session counter - this invalidates any pending callbacks
        this.animationSession++;
        const sessionAtStart = this.animationSession;
        console.log(`[Game.setAnimation] Session: ${sessionAtStart}, currentAnimation: ${this.currentAnimation}`);

        // Allow re-triggering same animation with different loop settings
        const forceReload = this.currentAnimation === animation && !loop;

        if (this.currentAnimation !== animation || forceReload) {
            console.log(`[Game.setAnimation] Loading sprites for ${animation} (forceReload=${forceReload})`);
            // Pass session and animation name so loadHumanSprites knows what to load
            const spritesAssigned = await this.loadHumanSprites(sessionAtStart, animation);
            if (!spritesAssigned) {
                // Sprites were discarded because session changed - abort
                // IMPORTANT: Don't set currentAnimation here - sprites weren't actually assigned
                console.log(`[Game.setAnimation] Sprites not assigned (session changed), aborting`);
                return;
            }
            // Only set currentAnimation AFTER sprites are successfully loaded
            // This prevents subsequent calls from skipping sprite load while we're still loading
            this.currentAnimation = animation;
            console.log(`[Game.setAnimation] Sprites loaded and assigned for ${animation}`);
        } else {
            console.log(`[Game.setAnimation] Skipping sprite load (already ${animation})`);
        }

        // Check if animation was changed while we were loading
        if (this.animationSession !== sessionAtStart) {
            // Another animation was started, don't configure this one
            console.log(`[Game.setAnimation] Session changed during load (${sessionAtStart} -> ${this.animationSession}), aborting`);
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
            console.log(`[Game.setAnimation] Animation ${animation} configured successfully, loop=${loop}`);
        } else {
            console.log(`[Game.setAnimation] WARNING: humanSprites is null/undefined!`);
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
        // Check for interactable buildings first (works in any mode)
        const interactable = this.tilemap.getInteractableAt(worldX, worldY);
        if (interactable && interactable.action) {
            this.handleInteractableAction(interactable.action);
            return;
        }

        // Only handle harvest clicks in pan mode
        if (this.inputMode !== 'pan') return;

        // Convert world coordinates to tile coordinates
        const tileX = Math.floor(worldX / this.tilemap.tileSize);
        const tileY = Math.floor(worldY / this.tilemap.tileSize);

        // Try to harvest a crop first
        const harvested = this.cropManager.tryHarvest(tileX, tileY);
        if (harvested) {
            // Add to inventory
            if (this.inventory) {
                this.inventory.addCropByIndex(harvested.index);
            }
            console.log(`Collected: ${harvested.name}`);
            return;
        }

        // Try to harvest a flower
        if (this.flowerManager) {
            const flowerHarvest = this.flowerManager.tryHarvest(tileX, tileY);
            if (flowerHarvest) {
                // Add to inventory
                if (this.inventory) {
                    this.inventory.add(RESOURCE_TYPES.FLOWER, flowerHarvest.yield);
                }
                console.log(`Collected: ${flowerHarvest.flowerType.name} x${flowerHarvest.yield}`);
                return;
            }

            // Try to remove a weed
            const weedResult = this.flowerManager.tryRemoveWeed(tileX, tileY);
            if (weedResult !== null) {
                // Weed was clicked (may or may not be removed yet)
                return;
            }
        }

        // Try to harvest forest pocket crops
        if (this.forestGenerator) {
            const forestCropHarvest = this.forestGenerator.harvestPocketCrop(tileX, tileY);
            if (forestCropHarvest) {
                if (this.inventory) {
                    this.inventory.addCropByIndex(forestCropHarvest.index);
                }
                console.log(`Collected from forest: ${forestCropHarvest.name}`);
                return;
            }
        }
    }

    handleInteractableAction(action) {
        console.log(`Interactable action: ${action}`);

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

            default:
                console.warn('Unknown interactable action:', action);
        }
    }

    // Tool selection handlers (called by Toolbar)
    onToolSelected(tool) {
        this.inputMode = 'tool';
        this.currentTool = tool;
        this.tileSelector.setTool(tool);
        this.inputManager.setPanningEnabled(false);
        console.log(`Tool selected: ${tool.name}`);
    }

    onToolDeselected() {
        this.inputMode = 'pan';
        this.currentTool = null;
        this.tileSelector.setTool(null);
        this.tileSelector.cancelSelection();
        this.inputManager.setPanningEnabled(true);
        console.log('Tool deselected');
    }

    onTileSelectionComplete() {
        const tiles = this.tileSelector.endSelection();
        if (tiles.length > 0 && this.currentTool) {
            this.jobManager.addJob(this.currentTool, tiles);
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
            console.log(`Enemy engaged! ${this.engagedEnemies.size} enemies in combat`);
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
                console.log(`Enemy died and disengaged! ${this.engagedEnemies.size} enemies remaining`);
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
        console.log('Entering combat mode!');

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

        console.log('Exiting combat mode - resuming work');

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

    // Player takes damage from an enemy
    takeDamage(amount, source) {
        this.playerHealth -= amount;
        this.playerDamageFlashing = true;
        this.playerDamageFlashTimer = CONFIG.player.damageFlashDuration;

        console.log(`Player took ${amount} damage from ${source.type}! Health: ${this.playerHealth}/${this.playerMaxHealth}`);

        if (this.playerHealth <= 0) {
            this.playerHealth = 0;
            this.onPlayerDeath();
        }
    }

    onPlayerDeath() {
        console.log('Player died!');

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
                console.log(`Player attacked ${enemy.type} for ${this.playerDamage} damage!`);

                if (died) {
                    // Remove from engaged set
                    this.engagedEnemies.delete(enemy);
                    console.log(`${enemy.type} defeated!`);
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

        // Character can ONLY work on a tile if standing directly to its LEFT or RIGHT
        // Check if character is already in a valid working position
        const isDirectlyLeft = (startTileX === workTileX - 1) && (startTileY === workTileY);
        const isDirectlyRight = (startTileX === workTileX + 1) && (startTileY === workTileY);

        if (isDirectlyLeft || isDirectlyRight) {
            // Already in position - face the work tile and work
            this.currentWorkTile = { x: workTileX, y: workTileY };
            this.setFacingDirection(isDirectlyRight); // face left if standing to the right
            this.jobManager.onTileReached();
            return;
        }

        // Need to move to a valid position (left or right of work tile)
        const adjacentTile = this.findAdjacentStandingTile(startTileX, startTileY, workTileX, workTileY);

        if (!adjacentTile) {
            // No valid position to work from - skip this tile
            console.log(`Cannot reach valid position for tile (${workTileX}, ${workTileY}) - skipping`);
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
            console.log(`No path to tile (${workTileX}, ${workTileY}) - skipping`);
            this.currentWorkTile = null;
            this.jobManager.skipCurrentTile();
        }
    }

    // Find best adjacent tile to stand on while working on workTile
    // Only allows standing to the LEFT or RIGHT of the work tile (not above/below)
    findAdjacentStandingTile(startX, startY, workTileX, workTileY) {
        // Only horizontal positions - character must stand to left or right of work tile
        const adjacentPositions = [
            { x: workTileX - 1, y: workTileY },  // left of work tile (character faces right)
            { x: workTileX + 1, y: workTileY },  // right of work tile (character faces left)
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

            // Move toward waypoint
            const moveDistance = this.moveSpeed * deltaTime / 1000;
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

        // Check if goblin is already in a valid working position
        const isDirectlyLeft = (startTileX === workTileX - 1) && (startTileY === workTileY);
        const isDirectlyRight = (startTileX === workTileX + 1) && (startTileY === workTileY);

        if (isDirectlyLeft || isDirectlyRight) {
            // Already in position
            this.goblinCurrentWorkTile = { x: workTileX, y: workTileY };
            this.setGoblinFacingDirection(isDirectlyRight);
            this.jobManager.onTileReachedForWorker('goblin');
            return;
        }

        // Find adjacent tile to stand on
        const adjacentTile = this.findAdjacentStandingTile(startTileX, startTileY, workTileX, workTileY);

        if (!adjacentTile) {
            console.log(`[Goblin] Cannot reach valid position for tile (${workTileX}, ${workTileY}) - skipping`);
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
            console.log(`[Goblin] No path to tile (${workTileX}, ${workTileY}) - skipping`);
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

            // Move toward waypoint
            const moveDistance = this.moveSpeed * deltaTime / 1000;
            const ratio = Math.min(moveDistance, distance) / distance;

            this.goblinPosition.x += dx * ratio;
            this.goblinPosition.y += dy * ratio;

            // Update sprite position
            if (this.goblinSprite) {
                this.goblinSprite.setPosition(this.goblinPosition.x, this.goblinPosition.y);
            }
        }
    }

    renderWorkQueueOverlay() {
        if (!this.jobManager) return;

        const queuedTiles = this.jobManager.getAllQueuedTiles();
        if (queuedTiles.length === 0) return;

        const tileSize = this.tilemap.tileSize;

        for (const tile of queuedTiles) {
            const worldX = tile.x * tileSize;
            const worldY = tile.y * tileSize;

            // Draw a blue overlay for queued work tiles
            this.ctx.fillStyle = 'rgba(100, 150, 255, 0.4)';
            this.ctx.fillRect(worldX, worldY, tileSize, tileSize);

            // Draw border
            this.ctx.strokeStyle = 'rgba(100, 150, 255, 0.8)';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(worldX + 0.5, worldY + 0.5, tileSize - 1, tileSize - 1);
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

        // Update character movement (human)
        this.updateCharacterMovement(deltaTime);

        // Update goblin movement
        this.updateGoblinMovement(deltaTime);

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

        // Update player damage flash
        if (this.playerDamageFlashing) {
            this.playerDamageFlashTimer -= deltaTime;
            if (this.playerDamageFlashTimer <= 0) {
                this.playerDamageFlashing = false;
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

        // Ensure image smoothing stays disabled after transform
        this.ctx.imageSmoothingEnabled = false;

        // Render tilemap
        this.tilemap.render(this.ctx, this.camera);

        // Render forest grass layer (surrounding the playable area)
        if (this.forestGenerator) {
            this.forestGenerator.render(this.ctx, this.camera);
            // Render tree trunk and shadow tiles (behind characters)
            this.forestGenerator.renderAllTreeBackgrounds(this.ctx, this.camera);
        }

        // Render tile overlays (holes, etc.) on top of tilemap
        if (this.overlayManager) {
            this.overlayManager.render(this.ctx, this.camera);
        }

        // Render tile selection highlight
        if (this.tileSelector) {
            this.tileSelector.render(this.ctx, this.camera);
        }

        // Render work queue overlay (tiles waiting to be worked on)
        this.renderWorkQueueOverlay();

        // === DEPTH-SORTED RENDERING ===
        // Collect all entities that need depth sorting
        const tileSize = this.tilemap.tileSize;
        const depthEntities = [];

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

        // Sort by Y position (entities with lower Y render first, so higher Y appears in front)
        depthEntities.sort((a, b) => a.sortY - b.sortY);

        // Render in sorted order
        for (const item of depthEntities) {
            switch (item.type) {
                case 'crop':
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
            }
        }

        // Render forest tree crowns (in front of characters)
        if (this.forestGenerator) {
            this.forestGenerator.renderAllTreeForegrounds(this.ctx, this.camera);
        }

        // Render upper layers (Buildings Upper) - above characters
        this.tilemap.renderUpperLayers(this.ctx, this.camera);

        // Render effects on top of everything (floating +1 icons, etc.)
        if (this.cropManager) {
            this.cropManager.renderEffects(this.ctx, this.camera);
        }
        if (this.oreManager) {
            this.oreManager.renderEffects(this.ctx, this.camera);
        }
        if (this.treeManager) {
            this.treeManager.renderEffects(this.ctx, this.camera);
        }
        if (this.flowerManager) {
            this.flowerManager.renderEffects(this.ctx, this.camera);
        }
        if (this.forestGenerator) {
            this.forestGenerator.renderEffects(this.ctx, this.camera);
        }

        // Render player health bar if damaged (on top of sprites)
        if (this.playerHealth < this.playerMaxHealth) {
            this.renderPlayerHealthBar();
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
            console.error('Error in game loop:', error);
            // Continue running despite errors to prevent complete freeze
        }

        // Continue loop
        requestAnimationFrame((time) => this.loop(time));
    }

    start() {
        console.log('Starting game loop...');
        this.running = true;
        this.lastTime = 0;
        requestAnimationFrame((time) => this.loop(time));
    }

    stop() {
        this.running = false;
    }
}
