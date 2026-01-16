import { Camera } from './Camera.js';
import { TilemapRenderer } from './TilemapRenderer.js';
import { SpriteAnimator } from './SpriteAnimator.js';
import { InputManager } from './InputManager.js';
import { CropManager } from './CropManager.js';
import { Toolbar } from './Toolbar.js';
import { TileSelector } from './TileSelector.js';
import { JobManager } from './JobManager.js';
import { Pathfinder } from './Pathfinder.js';
import { TileOverlayManager } from './TileOverlayManager.js';

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
        this.currentAnimation = 'WAITING';

        // New systems
        this.toolbar = null;
        this.tileSelector = null;
        this.jobManager = null;
        this.pathfinder = null;
        this.overlayManager = null;

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

            // Initialize tilemap
            this.tilemap = new TilemapRenderer();
            await this.tilemap.load('Tileset/testing.csv', 'Tileset/spr_tileset_sunnysideworld_16px.png');

            // Center camera on map
            this.camera.x = this.tilemap.getWorldWidth() / 2;
            this.camera.y = this.tilemap.getWorldHeight() / 2;

            // Create characters at random positions
            await this.createCharacters();

            // Initialize crop manager and spawn crops
            this.cropManager = new CropManager(this.tilemap);
            this.cropManager.spawnRandomCrops(15);

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
            this.tileSelector = new TileSelector(this.tilemap, this.camera, this.overlayManager);
            this.jobManager = new JobManager(this);
            this.toolbar = new Toolbar(this, this.tilemap);

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

    async createCharacters() {
        // Generate unique random positions for each character
        const usedPositions = new Set();

        // Create Human character
        let position;
        let positionKey;
        do {
            position = this.tilemap.getRandomTilePosition();
            positionKey = `${position.tileX},${position.tileY}`;
        } while (usedPositions.has(positionKey));
        usedPositions.add(positionKey);

        this.humanPosition = { x: position.x, y: position.y };
        await this.loadHumanSprites();
        console.log(`Human placed at tile (${position.tileX}, ${position.tileY})`);

        // Create Skeleton character
        do {
            position = this.tilemap.getRandomTilePosition();
            positionKey = `${position.tileX},${position.tileY}`;
        } while (usedPositions.has(positionKey));
        usedPositions.add(positionKey);

        const skeletonSprite = new SpriteAnimator(position.x, position.y, 6, 8);
        await skeletonSprite.load('Characters/Skeleton/PNG/skeleton_idle_strip6.png');
        this.characters.push(skeletonSprite);
        console.log(`Skeleton placed at tile (${position.tileX}, ${position.tileY})`);
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
        // Allow re-triggering same animation with different loop settings
        const forceReload = this.currentAnimation === animation && !loop;

        if (this.currentAnimation !== animation || forceReload) {
            this.currentAnimation = animation;
            await this.loadHumanSprites();
        }

        // Configure animation settings
        if (this.humanSprites) {
            for (let i = 0; i < this.humanSprites.length; i++) {
                const sprite = this.humanSprites[i];
                sprite.setLooping(loop);
                // Only set callback on FIRST sprite layer to avoid multiple triggers
                sprite.setOnComplete(i === 0 ? onComplete : null);
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
                // Reached final destination - face the work tile
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

        // Update crops
        if (this.cropManager) {
            this.cropManager.update(deltaTime);
        }

        // Update job manager
        if (this.jobManager) {
            this.jobManager.update(deltaTime);
        }

        // Update character movement
        this.updateCharacterMovement(deltaTime);

        // Update human character animations
        if (this.humanSprites) {
            for (const sprite of this.humanSprites) {
                sprite.update(deltaTime);
            }
        }

        // Update other character animations
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

        // Render crops on top of tilemap
        if (this.cropManager) {
            this.cropManager.render(this.ctx, this.camera);
        }

        // Render tile selection highlight
        if (this.tileSelector) {
            this.tileSelector.render(this.ctx, this.camera);
        }

        // Render work queue overlay (tiles waiting to be worked on)
        this.renderWorkQueueOverlay();

        // Render human character
        if (this.humanSprites) {
            for (const sprite of this.humanSprites) {
                sprite.render(this.ctx, this.camera);
            }
        }

        // Render other characters
        for (const character of this.characters) {
            character.render(this.ctx, this.camera);
        }

        // Reset transformation for UI (if needed later)
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
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
