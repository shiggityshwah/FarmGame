import { getRandomDirtTile, CONFIG } from './config.js';

// Job status constants
const JOB_STATUS = {
    PENDING: 'pending',
    WALKING: 'walking',
    WORKING: 'working',
    COMPLETED: 'completed',
    PAUSED: 'paused'
};

export class JobManager {
    constructor(game) {
        this.game = game;
        this.queue = [];
        this.currentJob = null;
        this.isProcessing = false;
        this.jobIdCounter = 0;
        this.isPausedForCombat = false;
        this.savedJobState = null; // Save state when paused
    }

    addJob(tool, tiles) {
        if (tiles.length === 0) return null;

        const job = {
            id: `job_${this.jobIdCounter++}`,
            tool: tool,
            tiles: tiles,
            currentTileIndex: 0,
            status: JOB_STATUS.PENDING
        };

        this.queue.push(job);
        console.log(`Job added: ${job.id} - ${tool.name} on ${tiles.length} tiles`);

        // Start processing if not already
        if (!this.isProcessing) {
            this.processNextJob();
        }

        return job;
    }

    processNextJob() {
        if (this.queue.length === 0) {
            this.isProcessing = false;
            this.currentJob = null;
            // Return to idle animation
            this.game.setAnimation('IDLE');
            return;
        }

        this.isProcessing = true;
        this.currentJob = this.queue.shift();
        this.currentJob.status = JOB_STATUS.WALKING;

        console.log(`Processing job: ${this.currentJob.id}`);

        // Start walking to first tile
        this.walkToCurrentTile();
    }

    walkToCurrentTile() {
        if (!this.currentJob) return;

        const tile = this.currentJob.tiles[this.currentJob.currentTileIndex];
        if (!tile) {
            this.completeJob();
            return;
        }

        const tileSize = this.game.tilemap.tileSize;
        let targetTileX = tile.x;
        let targetTileY = tile.y;

        // For multi-tile objects, find the closest base tile to walk to
        if (tile.multiTileBaseTiles && tile.multiTileBaseTiles.length > 1) {
            const playerX = this.game.humanPosition.x;
            const playerY = this.game.humanPosition.y;

            let closestDist = Infinity;
            for (const baseTile of tile.multiTileBaseTiles) {
                const baseCenterX = baseTile.x * tileSize + tileSize / 2;
                const baseCenterY = baseTile.y * tileSize + tileSize / 2;
                const dist = Math.abs(playerX - baseCenterX) + Math.abs(playerY - baseCenterY);
                if (dist < closestDist) {
                    closestDist = dist;
                    targetTileX = baseTile.x;
                    targetTileY = baseTile.y;
                }
            }
        }

        // Store which tile we're actually working on (for the animation/effect)
        this.currentJob.workTileX = targetTileX;
        this.currentJob.workTileY = targetTileY;

        // Calculate world position (center of tile)
        const targetX = targetTileX * tileSize + tileSize / 2;
        const targetY = targetTileY * tileSize + tileSize / 2;

        // Tell game to move character to this position
        this.game.moveCharacterTo(targetX, targetY);
    }

    onTileReached() {
        if (!this.currentJob) return;

        // Don't start work if paused for combat
        if (this.isPausedForCombat) {
            console.log('JobManager: Tile reached but paused for combat - will resume later');
            return;
        }

        // Start working animation
        this.currentJob.status = JOB_STATUS.WORKING;
        const animation = this.currentJob.tool.animation;
        const toolId = this.currentJob.tool.id;

        // Get animation speed multiplier from upgrades
        const speedMultiplier = this.game.getToolAnimationMultiplier(toolId);

        // Set animation to non-looping and wait for completion
        this.game.setAnimation(animation, false, () => {
            this.onAnimationComplete();
        }, speedMultiplier);
    }

    onAnimationComplete() {
        // If paused for combat, don't continue the job
        if (this.isPausedForCombat) {
            console.log('JobManager: Animation complete but paused for combat');
            return;
        }

        if (!this.currentJob) return;

        const tile = this.currentJob.tiles[this.currentJob.currentTileIndex];
        const tool = this.currentJob.tool;

        // Use the actual work tile position (may differ from tile.x/y for multi-tile objects)
        const workX = this.currentJob.workTileX !== undefined ? this.currentJob.workTileX : tile.x;
        const workY = this.currentJob.workTileY !== undefined ? this.currentJob.workTileY : tile.y;

        // Get animation speed multiplier for this tool
        const speedMultiplier = this.game.getToolAnimationMultiplier(tool.id);

        // Special handling for plant tool - needs two animation phases
        if (tool.id === 'plant') {
            // Check if we need to do the second phase
            if (!this.currentJob.plantingPhase) {
                this.currentJob.plantingPhase = 1;
            }

            if (this.currentJob.plantingPhase === 1) {
                // First animation complete - apply phase 1 effect (create crop, half-closed hole)
                this.applyPlantPhase1(tool, workX, workY);
                this.currentJob.plantingPhase = 2;

                // Do second animation
                this.game.setAnimation(tool.animation, false, () => {
                    this.onAnimationComplete();
                }, speedMultiplier);
                return;
            } else {
                // Second animation complete - apply phase 2 effect (fully planted)
                this.applyPlantPhase2(workX, workY);
                this.currentJob.plantingPhase = 0; // Reset for next tile
            }
        } else if (tool.id === 'sword') {
            // Attack enemy - continue until dead
            const shouldContinue = this.attackEnemy(workX, workY);
            if (shouldContinue) {
                // Enemy still alive, attack again
                this.game.setAnimation(tool.animation, false, () => {
                    this.onAnimationComplete();
                }, speedMultiplier);
                return;
            }
        } else if (tool.id === 'pickaxe') {
            // Mine ore - continue until depleted
            const shouldContinue = this.mineOre(workX, workY);
            if (shouldContinue) {
                // Ore still has more to mine, mine again
                this.game.setAnimation(tool.animation, false, () => {
                    this.onAnimationComplete();
                }, speedMultiplier);
                return;
            }
        } else if (tool.id === 'axe') {
            // Chop tree - continue until removed
            const shouldContinue = this.chopTree(workX, workY);
            if (shouldContinue) {
                // Tree still has more to chop, chop again
                this.game.setAnimation(tool.animation, false, () => {
                    this.onAnimationComplete();
                }, speedMultiplier);
                return;
            }
        } else {
            // Apply tool effect to tile (other tools)
            this.applyToolEffect(tool, workX, workY);
        }

        // Clear the work tile reference
        this.game.currentWorkTile = null;

        // Move to next tile
        this.moveToNextTile();
    }

    skipCurrentTile() {
        if (!this.currentJob) return;

        console.log(`Skipping tile ${this.currentJob.currentTileIndex + 1}/${this.currentJob.tiles.length}`);

        // Clear the work tile reference
        this.game.currentWorkTile = null;

        // Move to next tile without applying effect
        this.moveToNextTile();
    }

    moveToNextTile() {
        if (!this.currentJob) return;

        this.currentJob.currentTileIndex++;

        if (this.currentJob.currentTileIndex >= this.currentJob.tiles.length) {
            // Job complete
            this.completeJob();
        } else {
            // Walk to next tile
            this.currentJob.status = JOB_STATUS.WALKING;
            this.walkToCurrentTile();
        }
    }

    applyToolEffect(tool, tileX, tileY) {
        console.log(`Applying ${tool.name} effect at (${tileX}, ${tileY})`);

        switch (tool.id) {
            case 'hoe':
                // Remove any flower on this tile (destroyed by hoeing, not harvested)
                // FlowerManager handles all flowers including those in the forest
                if (this.game.flowerManager) {
                    const flower = this.game.flowerManager.getFlowerAt(tileX, tileY);
                    if (flower) {
                        flower.isHarvested = true; // Mark as gone without yielding
                        flower.isGone = true;
                        console.log(`Flower destroyed by hoeing at (${tileX}, ${tileY})`);
                    }
                }

                // Randomize dirt tile using config helper
                const dirtTileId = getRandomDirtTile();

                // Change tile to hoed ground (check if in main tilemap or forest)
                if (this.game.forestGenerator && this.game.forestGenerator.isForestPosition(tileX, tileY)) {
                    // Forest tile - modify forest grass layer
                    this.game.forestGenerator.setTileAt(tileX, tileY, dirtTileId);
                } else {
                    // Main tilemap tile
                    this.game.tilemap.setTileAt(tileX, tileY, dirtTileId);
                }

                // Mark tile as hoed and update edge overlays
                if (this.game.overlayManager) {
                    this.game.overlayManager.markTileAsHoed(tileX, tileY);
                    // Also update edge overlays for neighboring hoed tiles
                    this.updateNeighborEdgeOverlays(tileX, tileY);
                }
                break;

            case 'shovel':
                // Add hole overlay
                if (this.game.overlayManager) {
                    this.game.overlayManager.addOverlay(tileX, tileY, CONFIG.tiles.holeOverlay);
                }
                break;

            case 'plant':
                // Plant tool is handled separately via applyPlantPhase1/2
                // This case should not be reached
                console.log('Plant tool should use phase methods');
                break;

            case 'watering_can':
                // Water the crop at this tile
                if (this.game.cropManager) {
                    this.game.cropManager.waterCrop(tileX, tileY);
                }
                break;

            // Sword and pickaxe are handled in onAnimationComplete for continuous action
            case 'sword':
            case 'pickaxe':
                // These should not reach here - handled specially in onAnimationComplete
                break;

            // Other tools can be implemented later
            default:
                console.log(`No effect implemented for ${tool.name}`);
                break;
        }
    }

    // Plant phase 1: Remove hole overlay, create crop in PLANTING_PHASE1 stage (shows half-closed hole)
    applyPlantPhase1(tool, tileX, tileY) {
        console.log(`Planting phase 1 at (${tileX}, ${tileY})`);

        // Remove the hole overlay first
        if (this.game.overlayManager) {
            this.game.overlayManager.removeOverlay(tileX, tileY);
        }

        // Consume the seed from inventory
        if (this.game.inventory && tool.seedType !== undefined) {
            const seedResource = this.game.inventory.getSeedByCropIndex(tool.seedType);
            if (seedResource) {
                this.game.inventory.useSeed(seedResource);
                console.log(`Used 1 ${seedResource.name}`);
            }
        }

        // Plant the crop with the seed type from the tool (starts in PLANTING_PHASE1)
        if (this.game.cropManager && tool.seedType !== undefined) {
            this.game.cropManager.plantCrop(tileX, tileY, tool.seedType);
        }
    }

    // Plant phase 2: Advance crop to PLANTED stage (shows closed dry hole)
    applyPlantPhase2(tileX, tileY) {
        console.log(`Planting phase 2 at (${tileX}, ${tileY})`);

        // Get the crop and advance its planting phase
        if (this.game.cropManager) {
            const crop = this.game.cropManager.getCropAt(tileX, tileY);
            if (crop) {
                crop.advancePlantingPhase();
            }
        }
    }

    // Update edge overlays for neighboring tiles when a new tile is hoed
    updateNeighborEdgeOverlays(tileX, tileY) {
        if (!this.game.overlayManager) return;

        // Check all four neighbors and update their edge overlays if they're hoed
        const neighbors = [
            { x: tileX, y: tileY - 1 },  // Above
            { x: tileX - 1, y: tileY },  // Left
            { x: tileX, y: tileY + 1 },  // Below
            { x: tileX + 1, y: tileY }   // Right
        ];

        for (const neighbor of neighbors) {
            if (this.game.overlayManager.isHoedTile(neighbor.x, neighbor.y)) {
                this.game.overlayManager.updateEdgeOverlays(neighbor.x, neighbor.y);
            }
        }
    }

    // Attack an enemy at the specified tile
    // Returns true if enemy is still alive and should continue attacking
    attackEnemy(tileX, tileY) {
        if (!this.game.enemyManager) return false;

        const enemy = this.game.enemyManager.getEnemyAt(tileX, tileY);
        if (!enemy || !enemy.isAlive) {
            console.log(`No alive enemy at (${tileX}, ${tileY})`);
            return false;
        }

        // Make enemy face the player
        const playerX = this.game.humanPosition.x;
        enemy.setFacingLeft(playerX > enemy.x);

        // Deal damage to the enemy
        const damage = this.game.playerDamage;
        const enemyDied = enemy.takeDamage(damage);

        console.log(`Player attacked ${enemy.type} for ${damage} damage!`);

        if (enemyDied) {
            console.log(`${enemy.type} has been defeated!`);
            return false; // Stop attacking
        }

        return true; // Continue attacking
    }

    // Mine an ore vein at the specified tile
    // Returns true if ore is still mineable and should continue mining
    mineOre(tileX, tileY) {
        // Try main tilemap ore first
        if (this.game.oreManager) {
            const ore = this.game.oreManager.getOreAt(tileX, tileY);
            if (ore && ore.canBeMined()) {
                // Mine the ore vein
                const result = this.game.oreManager.mineOre(tileX, tileY);

                if (result && result.oreYielded) {
                    // Add ore to inventory
                    if (this.game.inventory) {
                        this.game.inventory.addOreByName(ore.oreType.name);
                    }
                    console.log(`Mined ${ore.oreType.name} ore!`);
                }

                // Check if we should continue mining
                if (ore.canBeMined()) {
                    return true; // Continue mining
                }

                console.log(`${ore.oreType.name} ore vein depleted!`);
                return false; // Stop mining
            }
        }

        // Try forest pocket ore
        if (this.game.forestGenerator) {
            const forestOre = this.game.forestGenerator.getPocketOreAt(tileX, tileY);
            if (forestOre && forestOre.canBeMined()) {
                // Mine the forest ore vein
                const result = this.game.forestGenerator.minePocketOre(tileX, tileY);

                if (result && result.oreYielded) {
                    // Add ore to inventory
                    if (this.game.inventory) {
                        this.game.inventory.addOreByName(forestOre.oreType.name);
                    }
                    console.log(`Mined ${forestOre.oreType.name} ore from forest!`);
                }

                // Check if we should continue mining
                if (forestOre.canBeMined()) {
                    return true; // Continue mining
                }

                console.log(`${forestOre.oreType.name} forest ore vein depleted!`);
                return false; // Stop mining
            }
        }

        console.log(`No mineable ore at (${tileX}, ${tileY})`);
        return false;
    }

    // Chop a tree at the specified tile (regular tree or forest tree)
    // Returns true if tree is still choppable and should continue chopping
    chopTree(tileX, tileY) {
        // Try regular tree first
        if (this.game.treeManager) {
            const tree = this.game.treeManager.getTreeAt(tileX, tileY);
            if (tree && tree.canBeChopped()) {
                // Chop the regular tree
                const result = this.game.treeManager.chopTree(tileX, tileY);

                if (result && result.woodYielded) {
                    // Add wood to inventory
                    if (this.game.inventory) {
                        this.game.inventory.addWood();
                    }
                    console.log(`Chopped ${tree.treeType.name}!`);
                }

                // Check if we should continue chopping
                if (tree.canBeChopped()) {
                    return true; // Continue chopping
                }

                console.log(`${tree.treeType.name} removed!`);
                return false; // Stop chopping
            }
        }

        // Try forest tree
        if (this.game.forestGenerator) {
            const forestTree = this.game.forestGenerator.getTreeAt(tileX, tileY);
            if (forestTree && forestTree.canBeChopped()) {
                // Chop the forest tree
                const result = this.game.forestGenerator.chopTree(tileX, tileY);

                if (result && result.woodYielded) {
                    // Add wood to inventory
                    if (this.game.inventory) {
                        this.game.inventory.addWood();
                    }
                    console.log(`Chopped forest tree!`);
                }

                // Check if we should continue chopping
                if (forestTree.canBeChopped()) {
                    return true; // Continue chopping
                }

                console.log(`Forest tree removed!`);
                return false; // Stop chopping
            }
        }

        console.log(`No choppable tree at (${tileX}, ${tileY})`);
        return false;
    }

    completeJob() {
        if (this.currentJob) {
            this.currentJob.status = JOB_STATUS.COMPLETED;
            console.log(`Job completed: ${this.currentJob.id}`);
        }

        // Process next job in queue
        this.processNextJob();
    }

    cancelCurrentJob() {
        if (this.currentJob) {
            console.log(`Job cancelled: ${this.currentJob.id}`);
            this.currentJob = null;
        }
        this.isProcessing = false;
        this.game.setAnimation('IDLE');
    }

    clearQueue() {
        this.queue = [];
        this.cancelCurrentJob();
    }

    update(deltaTime) {
        // JobManager doesn't need frame updates - it's event-driven
        // Movement and animation updates happen in Game.js
    }

    isWorking() {
        return this.isProcessing;
    }

    getCurrentJob() {
        return this.currentJob;
    }

    getQueueLength() {
        return this.queue.length;
    }

    // Get all tiles that are queued or being worked on (for overlay display)
    // For multi-tile objects, this expands to show all base tiles
    getAllQueuedTiles() {
        const tiles = [];

        // Helper to add tile(s) - expands multi-tile objects to all their base tiles
        const addTileOrExpand = (tile) => {
            if (tile.multiTileBaseTiles && tile.multiTileBaseTiles.length > 0) {
                // Multi-tile object: add all base tiles for display
                for (const baseTile of tile.multiTileBaseTiles) {
                    tiles.push({ x: baseTile.x, y: baseTile.y });
                }
            } else {
                // Regular tile
                tiles.push({ x: tile.x, y: tile.y });
            }
        };

        // Add tiles from current job (remaining tiles)
        if (this.currentJob) {
            for (let i = this.currentJob.currentTileIndex; i < this.currentJob.tiles.length; i++) {
                addTileOrExpand(this.currentJob.tiles[i]);
            }
        }

        // Add tiles from queued jobs
        for (const job of this.queue) {
            for (const tile of job.tiles) {
                addTileOrExpand(tile);
            }
        }

        return tiles;
    }

    // Pause job processing for combat - save current state
    pauseForCombat() {
        if (this.isPausedForCombat) return;

        this.isPausedForCombat = true;
        console.log('JobManager: Pausing for combat');

        // Save current job state if we're in the middle of something
        if (this.currentJob) {
            const status = this.currentJob.status;
            if (status === JOB_STATUS.WALKING || status === JOB_STATUS.WORKING) {
                this.savedJobState = {
                    status: status,
                    // If working, we'll need to redo this tile
                    needsRedo: status === JOB_STATUS.WORKING
                };
                this.currentJob.status = JOB_STATUS.PAUSED;
                console.log(`JobManager: Saved state - was ${status}, needsRedo: ${status === JOB_STATUS.WORKING}`);
            }
        }
    }

    // Resume job processing after combat
    resumeFromCombat() {
        if (!this.isPausedForCombat) return;

        this.isPausedForCombat = false;
        console.log('JobManager: Resuming from combat');

        // Clear saved state
        this.savedJobState = null;

        // Restore job state and continue
        if (this.currentJob) {
            // Always walk back to the current tile (player may have moved during combat)
            this.currentJob.status = JOB_STATUS.WALKING;
            console.log(`JobManager: Resuming - walking to tile ${this.currentJob.currentTileIndex}`);
            this.walkToCurrentTile();
        } else if (this.queue.length > 0) {
            // No current job but queue has items - start next job
            this.processNextJob();
        } else {
            // No jobs - return to idle
            this.game.setAnimation('IDLE');
        }
    }

    // Check if paused for combat
    isPaused() {
        return this.isPausedForCombat;
    }
}

export { JOB_STATUS };
