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

        // New systems
        this.toolbar = null;
        this.tileSelector = null;
        this.jobManager = null;
        this.pathfinder = null;
        this.overlayManager = null;
        this.enemyManager = null;
        this.oreManager = null;
        this.treeManager = null;

        // Player combat stats
        this.playerMaxHealth = 100;
        this.playerHealth = this.playerMaxHealth;
        this.playerDamage = 10;
        this.playerVisionRange = 5; // tiles
        this.playerAttackRange = 1; // tiles (must be adjacent)

        // Combat state
        this.isInCombat = false;
        this.combatTarget = null; // Current enemy being attacked
        this.engagedEnemies = []; // Enemies that have engaged the player
        this.isPlayerAttacking = false;
        this.playerAttackCooldown = 800; // ms between attacks
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
        this.moveSpeed = 80;  // pixels per second

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

            // Initialize ore manager and spawn one random ore (avoiding occupied tiles)
            this.oreManager = new OreManager(this.tilemap);
            this.spawnOresAvoidingOccupied(1, occupiedBaseTiles);

            // Initialize input manager
            this.inputManager = new InputManager(this.canvas, this.camera);
            this.inputManager.init();

            // Set up click handler for harvesting
            this.inputManager.setClickCallback((worldX, worldY) => {
                this.onWorldClick(worldX, worldY);
            });

            // Initialize new systems
            this.pathfinder = new Pathfinder(this.tilemap);
            this.overlayManager = new TileOverlayManager(this.tilemap);
            this.tileSelector = new TileSelector(this.tilemap, this.camera, this.overlayManager, this.cropManager);
            this.tileSelector.setEnemyManager(this.enemyManager);
            this.tileSelector.setOreManager(this.oreManager);
            this.tileSelector.setTreeManager(this.treeManager);
            this.jobManager = new JobManager(this);
            this.toolbar = new Toolbar(this, this.tilemap);

            // Connect enemy manager to pathfinder and game
            this.enemyManager.setPathfinder(this.pathfinder);
            this.enemyManager.setGame(this);

            // Set up drag callbacks for tile selection
            this.inputManager.setDragStartCallback((worldX, worldY) => {
                if (this.inputMode === 'tool' && this.currentTool) {
                    this.tileSelector.startSelection(worldX, worldY);
                }
            });

            this.inputManager.setDragMoveCallback((worldX, worldY) => {
                if (this.inputMode === 'tool' && this.currentTool) {
                    this.tileSelector.updateSelection(worldX, worldY);
                }
            });

            this.inputManager.setDragEndCallback((worldX, worldY, hasMoved) => {
                if (this.inputMode === 'tool' && this.currentTool) {
                    this.onTileSelectionComplete();
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
    spawnOresAvoidingOccupied(count, occupiedBaseTiles) {
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

            this.oreManager.spawnOre(tileX, tileY);
        }

        console.log(`Spawned ${this.oreManager.oreVeins.length} ore veins`);
    }

    async loadHumanSprites() {
        const frameCount = ANIMATION_DATA[this.currentAnimation];

        // Handle filename variations in asset files
        let animLower;
        if (this.currentAnimation === 'HAMMERING') {
            animLower = 'hamering'; // Misspelling in assets
        } else if (this.currentAnimation === 'WALKING') {
            animLower = 'walk'; // Uses "walk" not "walking"
        } else {
            animLower = this.currentAnimation.toLowerCase();
        }

        const basePath = `Characters/Human/${this.currentAnimation}/base_${animLower}_strip${frameCount}.png`;
        const hairPath = `Characters/Human/${this.currentAnimation}/${this.currentHairStyle}hair_${animLower}_strip${frameCount}.png`;
        const toolsPath = `Characters/Human/${this.currentAnimation}/tools_${animLower}_strip${frameCount}.png`;

        const baseSprite = new SpriteAnimator(this.humanPosition.x, this.humanPosition.y, frameCount, 8);
        const hairSprite = new SpriteAnimator(this.humanPosition.x, this.humanPosition.y, frameCount, 8);
        const toolsSprite = new SpriteAnimator(this.humanPosition.x, this.humanPosition.y, frameCount, 8);

        await baseSprite.load(basePath);
        await hairSprite.load(hairPath);
        await toolsSprite.load(toolsPath);

        this.humanSprites = [baseSprite, hairSprite, toolsSprite];
    }

    async setHairStyle(hairStyle) {
        if (this.currentHairStyle === hairStyle) return;
        this.currentHairStyle = hairStyle;
        await this.loadHumanSprites();
    }

    async setAnimation(animation, loop = true, onComplete = null) {
        // COMBAT GUARD: Prevent work animations during combat
        // This is a fail-safe in case something tries to start a work animation
        if (this.isInCombat && !['IDLE', 'WALKING', 'ATTACK', 'HURT', 'DEATH'].includes(animation)) {
            console.warn(`Blocked work animation "${animation}" during combat!`);
            return;
        }

        // Increment session counter - this invalidates any pending callbacks
        this.animationSession++;
        const sessionAtStart = this.animationSession;

        // Allow re-triggering same animation with different loop settings
        const forceReload = this.currentAnimation === animation && !loop;

        if (this.currentAnimation !== animation || forceReload) {
            this.currentAnimation = animation;
            await this.loadHumanSprites();
        }

        // Check if animation was changed while we were loading
        if (this.animationSession !== sessionAtStart) {
            // Another animation was started, don't configure this one
            return;
        }

        // Wrap the callback to check session validity
        const wrappedCallback = onComplete ? () => {
            // Only fire callback if this is still the current animation session
            if (this.animationSession === sessionAtStart) {
                onComplete();
            }
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
            }
        }
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

    onWorldClick(worldX, worldY) {
        // Only handle harvest clicks in pan mode
        if (this.inputMode !== 'pan') return;

        // Convert world coordinates to tile coordinates
        const tileX = Math.floor(worldX / this.tilemap.tileSize);
        const tileY = Math.floor(worldY / this.tilemap.tileSize);

        // Try to harvest a crop
        const harvested = this.cropManager.tryHarvest(tileX, tileY);
        if (harvested) {
            console.log(`Collected: ${harvested.name}`);
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
        if (!this.engagedEnemies.includes(enemy)) {
            this.engagedEnemies.push(enemy);
            console.log(`Enemy engaged! ${this.engagedEnemies.length} enemies in combat`);
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
            const index = this.engagedEnemies.indexOf(enemy);
            if (index !== -1) {
                this.engagedEnemies.splice(index, 1);
                console.log(`Enemy died and disengaged! ${this.engagedEnemies.length} enemies remaining`);
            }

            // If no more enemies, exit combat
            if (this.engagedEnemies.length === 0 && this.isInCombat) {
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

        this.isInCombat = false;
        this.combatTarget = null;
        this.isPlayerAttacking = false;
        console.log('Exiting combat mode - resuming work');

        // Resume job processing
        if (this.jobManager) {
            this.jobManager.resumeFromCombat();
        }
    }

    // Player takes damage from an enemy
    takeDamage(amount, source) {
        this.playerHealth -= amount;
        this.playerDamageFlashing = true;
        this.playerDamageFlashTimer = 200;

        console.log(`Player took ${amount} damage from ${source.type}! Health: ${this.playerHealth}/${this.playerMaxHealth}`);

        if (this.playerHealth <= 0) {
            this.playerHealth = 0;
            this.onPlayerDeath();
        }
    }

    onPlayerDeath() {
        console.log('Player died!');
        // Could implement respawn logic here
        this.setAnimation('DEATH', false);
    }

    // Update combat - check for enemies in range and attack
    updateCombat(deltaTime) {
        if (!this.isInCombat || !this.enemyManager) return;

        const currentTime = performance.now();
        const tileSize = this.tilemap.tileSize;

        // Remove dead enemies from engaged list
        this.engagedEnemies = this.engagedEnemies.filter(e => e.isAlive);

        // Exit combat if no enemies left
        if (this.engagedEnemies.length === 0) {
            this.exitCombat();
            return;
        }

        // Find closest enemy to attack - first check engaged enemies, then vision range
        let closestEnemy = null;

        // Prioritize enemies we're already engaged with
        if (this.engagedEnemies.length > 0) {
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
                    // Remove from engaged list
                    const index = this.engagedEnemies.indexOf(enemy);
                    if (index !== -1) {
                        this.engagedEnemies.splice(index, 1);
                    }
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

        if (distance < 2) {
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

        // Update job manager (only if not in combat)
        if (this.jobManager && !this.isInCombat) {
            this.jobManager.update(deltaTime);
        }

        // Update character movement
        this.updateCharacterMovement(deltaTime);

        // Update human character animations
        // Note: Animation callbacks fire here - combat state must be set before this
        if (this.humanSprites) {
            for (const sprite of this.humanSprites) {
                sprite.update(deltaTime);
            }
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
                case 'enemy':
                    this.enemyManager.renderEnemy(this.ctx, item.entity, this.camera);
                    break;
                case 'human':
                    this.renderHuman();
                    break;
                case 'character':
                    item.entity.render(this.ctx, this.camera);
                    break;
            }
        }

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

        // Calculate delta time
        const deltaTime = this.lastTime ? currentTime - this.lastTime : 0;
        this.lastTime = currentTime;

        // Update and render
        this.update(deltaTime);
        this.render();

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
