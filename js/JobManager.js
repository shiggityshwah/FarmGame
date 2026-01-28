import { getRandomDirtTile, CONFIG } from './config.js';
import { Logger } from './Logger.js';

// Create logger for this module
const log = Logger.create('JobManager');

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
        this.jobIdCounter = 0;

        // Multi-queue system: shared queue + private queues per worker
        this.queues = {
            all: [],      // Shared queue - any worker can take jobs
            human: [],    // Private human queue
            goblin: []    // Private goblin queue
        };

        // Worker state tracking
        this.workers = new Map(); // workerId -> { currentJob, isProcessing, isPausedForCombat, savedJobState }

        // Which queue new jobs go to (controlled by UI selector)
        this.activeQueueTarget = 'all';

        // Callback for UI updates when queue changes
        this.onQueueChange = null;
    }

    // Legacy property accessors - delegate to 'human' worker state
    get currentJob() {
        const workerState = this.workers.get('human');
        return workerState ? workerState.currentJob : null;
    }

    get isProcessing() {
        const workerState = this.workers.get('human');
        return workerState ? workerState.isProcessing : false;
    }

    get isPausedForCombat() {
        const workerState = this.workers.get('human');
        return workerState ? workerState.isPausedForCombat : false;
    }

    // Legacy queue accessor for backward compatibility
    get queue() {
        return this.queues.all;
    }

    // Register a worker (character) that can process jobs
    registerWorker(workerId) {
        this.workers.set(workerId, {
            currentJob: null,
            isProcessing: false,
            isPausedForCombat: false,
            savedJobState: null
        });
        log.debug(` Registered worker: ${workerId}`);
    }

    // Set which queue new jobs should be added to
    setActiveQueueTarget(target) {
        if (this.queues.hasOwnProperty(target)) {
            this.activeQueueTarget = target;
            log.debug(` Active queue target set to: ${target}`);
        } else {
            log.warn(` Invalid queue target: ${target}`);
        }
    }

    // Get the active queue target
    getActiveQueueTarget() {
        return this.activeQueueTarget;
    }

    addJob(tool, tiles) {
        if (tiles.length === 0) return null;

        const job = {
            id: `job_${this.jobIdCounter++}`,
            tool: tool,
            tiles: tiles,
            currentTileIndex: 0,
            status: JOB_STATUS.PENDING,
            // New multi-queue fields
            assignedTo: null,                    // 'human' | 'goblin' | null (unassigned)
            targetQueue: this.activeQueueTarget, // Which queue it was added to
            createdAt: Date.now()                // For ordering
        };

        // For sword tool, extract target enemies from tiles
        if (tool.id === 'sword') {
            job.targetEnemies = tiles
                .filter(t => t.targetEnemy)
                .map(t => t.targetEnemy);
            log.info(`Job added: ${job.id} - ${tool.name} targeting ${job.targetEnemies.length} enemies to queue: ${this.activeQueueTarget}`);
        } else {
            log.info(`Job added: ${job.id} - ${tool.name} on ${tiles.length} tiles to queue: ${this.activeQueueTarget}`);
        }

        // Add to the appropriate queue
        this.queues[this.activeQueueTarget].push(job);

        // Notify UI of queue change
        if (this.onQueueChange) {
            this.onQueueChange();
        }

        // Try to assign jobs to idle workers
        this.tryAssignJobs();

        return job;
    }

    // Try to assign jobs to any idle workers
    tryAssignJobs() {
        for (const [workerId, workerState] of this.workers) {
            if (!workerState.isProcessing && !workerState.isPausedForCombat) {
                this.assignJobToWorker(workerId);
            }
        }
    }

    // Assign a job to a specific worker
    assignJobToWorker(workerId) {
        const workerState = this.workers.get(workerId);
        if (!workerState || workerState.isProcessing || workerState.isPausedForCombat) {
            return false;
        }

        // Check private queue first
        if (this.queues[workerId] && this.queues[workerId].length > 0) {
            const job = this.queues[workerId].shift();
            this.startJobForWorker(workerId, job);
            return true;
        }

        // Check shared queue
        if (this.queues.all.length > 0) {
            const job = this.queues.all.shift();
            this.startJobForWorker(workerId, job);
            return true;
        }

        return false;
    }

    // Start a job for a specific worker
    startJobForWorker(workerId, job) {
        const workerState = this.workers.get(workerId);
        if (!workerState) return;

        job.assignedTo = workerId;
        job.status = JOB_STATUS.WALKING;
        workerState.currentJob = job;
        workerState.isProcessing = true;

        log.debug(` Starting job ${job.id} for worker: ${workerId}`);

        // Notify UI of queue change
        if (this.onQueueChange) {
            this.onQueueChange();
        }

        // Start walking to first tile
        this.walkToCurrentTileForWorker(workerId);
    }

    // Walk to current tile for a specific worker
    async walkToCurrentTileForWorker(workerId) {
        const workerState = this.workers.get(workerId);
        if (!workerState || !workerState.currentJob) return;

        const job = workerState.currentJob;
        const tileSize = this.game.tilemap.tileSize;

        // Get worker position
        const workerPosition = this.getWorkerPosition(workerId);
        if (!workerPosition) {
            log.warn(` No position found for worker: ${workerId}`);
            return;
        }

        // Special handling for sword - track enemy's current position
        if (job.tool.id === 'sword' && job.targetEnemies) {
            const enemy = job.targetEnemies[job.currentTileIndex];
            if (!enemy || !enemy.isAlive) {
                log.debug(`[${workerId}] walkToCurrentTile: Enemy dead/gone, setting IDLE`);
                await this.setWorkerAnimation(workerId, 'IDLE', true);
                this.moveToNextTileForWorker(workerId);
                return;
            }

            const enemyTileX = Math.floor(enemy.x / tileSize);
            const enemyTileY = Math.floor(enemy.y / tileSize);

            job.currentTargetEnemy = enemy;
            job.workTileX = enemyTileX;
            job.workTileY = enemyTileY;

            const targetX = enemyTileX * tileSize + tileSize / 2;
            const targetY = enemyTileY * tileSize + tileSize / 2;

            this.moveWorkerTo(workerId, targetX, targetY);
            return;
        }

        const tile = job.tiles[job.currentTileIndex];
        if (!tile) {
            this.completeJobForWorker(workerId);
            return;
        }

        let targetTileX = tile.x;
        let targetTileY = tile.y;

        // For multi-tile objects, find the closest base tile
        if (tile.multiTileBaseTiles && tile.multiTileBaseTiles.length > 1) {
            let closestDist = Infinity;
            for (const baseTile of tile.multiTileBaseTiles) {
                const baseCenterX = baseTile.x * tileSize + tileSize / 2;
                const baseCenterY = baseTile.y * tileSize + tileSize / 2;
                const dist = Math.abs(workerPosition.x - baseCenterX) + Math.abs(workerPosition.y - baseCenterY);
                if (dist < closestDist) {
                    closestDist = dist;
                    targetTileX = baseTile.x;
                    targetTileY = baseTile.y;
                }
            }
        }

        job.workTileX = targetTileX;
        job.workTileY = targetTileY;

        const targetX = targetTileX * tileSize + tileSize / 2;
        const targetY = targetTileY * tileSize + tileSize / 2;

        this.moveWorkerTo(workerId, targetX, targetY);
    }

    // Get worker position based on worker ID
    getWorkerPosition(workerId) {
        if (workerId === 'human') {
            return this.game.humanPosition;
        } else if (workerId === 'goblin') {
            return this.game.goblinPosition;
        }
        return null;
    }

    // Move a worker to a target position
    moveWorkerTo(workerId, targetX, targetY) {
        if (workerId === 'human') {
            this.game.moveCharacterTo(targetX, targetY);
        } else if (workerId === 'goblin') {
            this.game.moveGoblinTo(targetX, targetY);
        }
    }

    // Set animation for a worker
    async setWorkerAnimation(workerId, animation, loop, onComplete, speedMultiplier) {
        if (workerId === 'human') {
            return this.game.setAnimation(animation, loop, onComplete, speedMultiplier);
        } else if (workerId === 'goblin') {
            return this.game.setGoblinAnimation(animation, loop, onComplete, speedMultiplier);
        }
    }

    // Called when a worker reaches their target tile
    onTileReachedForWorker(workerId) {
        const workerState = this.workers.get(workerId);
        if (!workerState || !workerState.currentJob) return;

        if (workerState.isPausedForCombat) {
            log.debug(`[${workerId}] Tile reached but paused for combat`);
            return;
        }

        const job = workerState.currentJob;
        job.status = JOB_STATUS.WORKING;
        const animation = job.tool.animation;
        const toolId = job.tool.id;

        const speedMultiplier = this.game.getToolAnimationMultiplier(toolId);

        this.setWorkerAnimation(workerId, animation, false, () => {
            this.onAnimationCompleteForWorker(workerId);
        }, speedMultiplier);
    }

    // Called when a worker's animation completes
    async onAnimationCompleteForWorker(workerId) {
        const workerState = this.workers.get(workerId);
        if (!workerState || !workerState.currentJob) return;

        if (workerState.isPausedForCombat) {
            log.debug(`[${workerId}] Animation complete but paused for combat`);
            return;
        }

        const job = workerState.currentJob;
        const tile = job.tiles[job.currentTileIndex];
        const tool = job.tool;

        const workX = job.workTileX !== undefined ? job.workTileX : tile.x;
        const workY = job.workTileY !== undefined ? job.workTileY : tile.y;

        const speedMultiplier = this.game.getToolAnimationMultiplier(tool.id);

        // Handle tool-specific logic
        if (tool.id === 'plant') {
            if (!job.plantingPhase) {
                job.plantingPhase = 1;
            }

            if (job.plantingPhase === 1) {
                this.applyPlantPhase1(tool, workX, workY);
                job.plantingPhase = 2;
                this.setWorkerAnimation(workerId, tool.animation, false, () => {
                    this.onAnimationCompleteForWorker(workerId);
                }, speedMultiplier);
                return;
            } else {
                this.applyPlantPhase2(workX, workY);
                job.plantingPhase = 0;
            }
        } else if (tool.id === 'sword') {
            const targetEnemy = job.currentTargetEnemy;
            const shouldContinue = this.attackEnemyTargetForWorker(workerId, targetEnemy);
            if (shouldContinue) {
                this.setWorkerAnimation(workerId, tool.animation, false, () => {
                    this.onAnimationCompleteForWorker(workerId);
                }, speedMultiplier);
                return;
            }
            await this.setWorkerAnimation(workerId, 'IDLE', true);
        } else if (tool.id === 'pickaxe') {
            const shouldContinue = this.mineOre(workX, workY);
            if (shouldContinue) {
                this.setWorkerAnimation(workerId, tool.animation, false, () => {
                    this.onAnimationCompleteForWorker(workerId);
                }, speedMultiplier);
                return;
            }
        } else if (tool.id === 'axe') {
            const shouldContinue = this.chopTree(workX, workY);
            if (shouldContinue) {
                this.setWorkerAnimation(workerId, tool.animation, false, () => {
                    this.onAnimationCompleteForWorker(workerId);
                }, speedMultiplier);
                return;
            }
        } else {
            this.applyToolEffect(tool, workX, workY);
        }

        // Clear work tile and move to next
        if (workerId === 'human') {
            this.game.currentWorkTile = null;
        } else if (workerId === 'goblin') {
            this.game.goblinCurrentWorkTile = null;
        }

        this.moveToNextTileForWorker(workerId);
    }

    // Attack enemy for a specific worker
    attackEnemyTargetForWorker(workerId, enemy) {
        if (!enemy || !enemy.isAlive) {
            return false;
        }

        const workerPosition = this.getWorkerPosition(workerId);
        if (workerPosition) {
            enemy.setFacingLeft(workerPosition.x > enemy.x);
        }

        const damage = this.game.playerDamage;
        const enemyDied = enemy.takeDamage(damage);

        log.debug(`[${workerId}] Attacked ${enemy.type} for ${damage} damage!`);

        if (enemyDied) {
            log.debug(`[${workerId}] ${enemy.type} has been defeated!`);
            return false;
        }

        return true;
    }

    // Move to next tile for a specific worker
    moveToNextTileForWorker(workerId) {
        const workerState = this.workers.get(workerId);
        if (!workerState || !workerState.currentJob) return;

        const job = workerState.currentJob;
        job.currentTileIndex++;

        const totalTargets = (job.tool.id === 'sword' && job.targetEnemies)
            ? job.targetEnemies.length
            : job.tiles.length;

        if (job.currentTileIndex >= totalTargets) {
            this.completeJobForWorker(workerId);
        } else {
            job.status = JOB_STATUS.WALKING;
            this.walkToCurrentTileForWorker(workerId);
        }

        // Notify UI
        if (this.onQueueChange) {
            this.onQueueChange();
        }
    }

    // Complete job for a specific worker
    completeJobForWorker(workerId) {
        const workerState = this.workers.get(workerId);
        if (!workerState) return;

        if (workerState.currentJob) {
            workerState.currentJob.status = JOB_STATUS.COMPLETED;
            log.debug(`[${workerId}] Job completed: ${workerState.currentJob.id}`);

            if (workerState.currentJob.tool.id === 'sword') {
                workerState.currentJob.currentTargetEnemy = null;
                workerState.currentJob.targetEnemies = null;
            }
        }

        workerState.currentJob = null;
        workerState.isProcessing = false;

        // Notify UI
        if (this.onQueueChange) {
            this.onQueueChange();
        }

        // Try to get next job
        if (!this.assignJobToWorker(workerId)) {
            // No more jobs - set worker to idle
            this.setWorkerAnimation(workerId, 'IDLE', true);
        }
    }

    // Skip current tile for a specific worker
    skipCurrentTileForWorker(workerId) {
        const workerState = this.workers.get(workerId);
        if (!workerState || !workerState.currentJob) return;

        log.debug(`[${workerId}] Skipping tile ${workerState.currentJob.currentTileIndex + 1}`);

        if (workerId === 'human') {
            this.game.currentWorkTile = null;
        } else if (workerId === 'goblin') {
            this.game.goblinCurrentWorkTile = null;
        }

        this.moveToNextTileForWorker(workerId);
    }

    // Pause worker for combat
    pauseWorkerForCombat(workerId) {
        const workerState = this.workers.get(workerId);
        if (!workerState || workerState.isPausedForCombat) return;

        workerState.isPausedForCombat = true;

        if (workerState.currentJob) {
            const status = workerState.currentJob.status;
            if (status === JOB_STATUS.WALKING || status === JOB_STATUS.WORKING) {
                workerState.savedJobState = {
                    status: status,
                    needsRedo: status === JOB_STATUS.WORKING
                };
                workerState.currentJob.status = JOB_STATUS.PAUSED;
            }
        }

        log.debug(`[${workerId}] Paused for combat`);
    }

    // Resume worker from combat
    resumeWorkerFromCombat(workerId) {
        const workerState = this.workers.get(workerId);
        if (!workerState || !workerState.isPausedForCombat) return;

        workerState.isPausedForCombat = false;
        workerState.savedJobState = null;

        if (workerState.currentJob) {
            workerState.currentJob.status = JOB_STATUS.WALKING;
            this.walkToCurrentTileForWorker(workerId);
        } else if (!this.assignJobToWorker(workerId)) {
            this.setWorkerAnimation(workerId, 'IDLE', true);
        }

        log.debug(`[${workerId}] Resumed from combat`);
    }

    // Legacy method - delegates to worker-based system for 'human'
    processNextJob() {
        this.assignJobToWorker('human');
    }

    // Legacy method - delegates to worker-based system for 'human'
    walkToCurrentTile() {
        this.walkToCurrentTileForWorker('human');
    }

    // Legacy method - delegates to worker-based system for 'human'
    onTileReached() {
        this.onTileReachedForWorker('human');
    }

    // Legacy method - delegates to worker-based system for 'human'
    onAnimationComplete() {
        this.onAnimationCompleteForWorker('human');
    }

    // Legacy method - delegates to worker-based system for 'human'
    skipCurrentTile() {
        this.skipCurrentTileForWorker('human');
    }

    // Legacy method - delegates to worker-based system for 'human'
    moveToNextTile() {
        this.moveToNextTileForWorker('human');
    }

    applyToolEffect(tool, tileX, tileY) {
        log.debug(`Applying ${tool.name} effect at (${tileX}, ${tileY})`);

        switch (tool.id) {
            case 'hoe':
                // Remove any flower on this tile (destroyed by hoeing, not harvested)
                // FlowerManager handles all flowers including those in the forest
                if (this.game.flowerManager) {
                    const flower = this.game.flowerManager.getFlowerAt(tileX, tileY);
                    if (flower) {
                        flower.isHarvested = true; // Mark as gone without yielding
                        flower.isGone = true;
                        log.debug(`Flower destroyed by hoeing at (${tileX}, ${tileY})`);
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
                log.warn('Plant tool should use phase methods');
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
                log.warn(`No effect implemented for ${tool.name}`);
                break;
        }
    }

    // Plant phase 1: Remove hole overlay, create crop in PLANTING_PHASE1 stage (shows half-closed hole)
    applyPlantPhase1(tool, tileX, tileY) {
        log.debug(`Planting phase 1 at (${tileX}, ${tileY})`);

        // Remove the hole overlay first
        if (this.game.overlayManager) {
            this.game.overlayManager.removeOverlay(tileX, tileY);
        }

        // Consume the seed from inventory
        if (this.game.inventory && tool.seedType !== undefined) {
            const seedResource = this.game.inventory.getSeedByCropIndex(tool.seedType);
            if (seedResource) {
                this.game.inventory.useSeed(seedResource);
                log.debug(`Used 1 ${seedResource.name}`);
            }
        }

        // Plant the crop with the seed type from the tool (starts in PLANTING_PHASE1)
        if (this.game.cropManager && tool.seedType !== undefined) {
            this.game.cropManager.plantCrop(tileX, tileY, tool.seedType);
        }
    }

    // Plant phase 2: Advance crop to PLANTED stage (shows closed dry hole)
    applyPlantPhase2(tileX, tileY) {
        log.debug(`Planting phase 2 at (${tileX}, ${tileY})`);

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

    // Attack an enemy at the specified tile (legacy method for backwards compatibility)
    // Returns true if enemy is still alive and should continue attacking
    attackEnemy(tileX, tileY) {
        if (!this.game.enemyManager) return false;

        const enemy = this.game.enemyManager.getEnemyAt(tileX, tileY);
        return this.attackEnemyTarget(enemy);
    }

    // Attack a specific enemy target
    // Returns true if enemy is still alive and should continue attacking
    attackEnemyTarget(enemy) {
        if (!enemy || !enemy.isAlive) {
            log.debug(`No alive enemy to attack`);
            return false;
        }

        // Make enemy face the player
        const playerX = this.game.humanPosition.x;
        enemy.setFacingLeft(playerX > enemy.x);

        // Deal damage to the enemy
        const damage = this.game.playerDamage;
        const enemyDied = enemy.takeDamage(damage);

        log.debug(`Player attacked ${enemy.type} for ${damage} damage!`);

        if (enemyDied) {
            log.info(`${enemy.type} has been defeated!`);
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
                    log.debug(`Mined ${ore.oreType.name} ore!`);
                }

                // Check if we should continue mining
                if (ore.canBeMined()) {
                    return true; // Continue mining
                }

                log.info(`${ore.oreType.name} ore vein depleted!`);
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
                    log.debug(`Mined ${forestOre.oreType.name} ore from forest!`);
                }

                // Check if we should continue mining
                if (forestOre.canBeMined()) {
                    return true; // Continue mining
                }

                log.info(`${forestOre.oreType.name} forest ore vein depleted!`);
                return false; // Stop mining
            }
        }

        log.debug(`No mineable ore at (${tileX}, ${tileY})`);
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
                    log.debug(`Chopped ${tree.treeType.name}!`);
                }

                // Check if we should continue chopping
                if (tree.canBeChopped()) {
                    return true; // Continue chopping
                }

                log.info(`${tree.treeType.name} removed!`);
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
                    log.debug(`Chopped forest tree!`);
                }

                // Check if we should continue chopping
                if (forestTree.canBeChopped()) {
                    return true; // Continue chopping
                }

                log.info(`Forest tree removed!`);
                return false; // Stop chopping
            }
        }

        log.debug(`No choppable tree at (${tileX}, ${tileY})`);
        return false;
    }

    // Legacy method - delegates to worker-based system for 'human'
    completeJob() {
        this.completeJobForWorker('human');
    }

    // Legacy method - delegates to worker-based system for 'human'
    cancelCurrentJob() {
        const workerState = this.workers.get('human');
        if (workerState && workerState.currentJob) {
            log.info(`Job cancelled: ${workerState.currentJob.id}`);
            workerState.currentJob = null;
            workerState.isProcessing = false;
        }
        this.game.setAnimation('IDLE');
    }

    // Clear all queues and cancel current job
    clearQueue() {
        this.queues.all = [];
        this.queues.human = [];
        this.queues.goblin = [];
        this.cancelCurrentJob();
        // Also cancel goblin's current job
        const goblinState = this.workers.get('goblin');
        if (goblinState && goblinState.currentJob) {
            goblinState.currentJob = null;
            goblinState.isProcessing = false;
            this.game.setGoblinAnimation('IDLE', true);
        }
        if (this.onQueueChange) {
            this.onQueueChange();
        }
    }

    update(deltaTime) {
        // JobManager doesn't need frame updates - it's event-driven
        // Movement and animation updates happen in Game.js
    }

    // Legacy method - uses getter which delegates to 'human' worker
    isWorking() {
        return this.isProcessing;
    }

    // Legacy method - uses getter which delegates to 'human' worker
    getCurrentJob() {
        return this.currentJob;
    }

    // Get combined queue length (all queues)
    getQueueLength() {
        return this.queues.all.length + this.queues.human.length + this.queues.goblin.length;
    }

    // Get all tiles that are queued or being worked on (for overlay display)
    // For multi-tile objects, this expands to show all base tiles
    // For sword jobs with enemies, shows enemy's current position
    getAllQueuedTiles() {
        const tiles = [];
        const tileSize = this.game.tilemap.tileSize;

        // Helper to add tile(s) - expands multi-tile objects to all their base tiles
        const addTileOrExpand = (tile, job) => {
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

        // Helper to add enemy's current position
        const addEnemyPosition = (enemy) => {
            if (enemy && enemy.isAlive) {
                const enemyTileX = Math.floor(enemy.x / tileSize);
                const enemyTileY = Math.floor(enemy.y / tileSize);
                tiles.push({ x: enemyTileX, y: enemyTileY });
            }
        };

        // Add tiles from current job (remaining tiles/enemies)
        if (this.currentJob) {
            if (this.currentJob.tool.id === 'sword' && this.currentJob.targetEnemies) {
                // For sword jobs, show enemy current positions
                for (let i = this.currentJob.currentTileIndex; i < this.currentJob.targetEnemies.length; i++) {
                    addEnemyPosition(this.currentJob.targetEnemies[i]);
                }
            } else {
                // Standard job - show tile positions
                for (let i = this.currentJob.currentTileIndex; i < this.currentJob.tiles.length; i++) {
                    addTileOrExpand(this.currentJob.tiles[i], this.currentJob);
                }
            }
        }

        // Add tiles from queued jobs
        for (const job of this.queue) {
            if (job.tool.id === 'sword' && job.targetEnemies) {
                // For sword jobs, show enemy current positions
                for (const enemy of job.targetEnemies) {
                    addEnemyPosition(enemy);
                }
            } else {
                // Standard job - show tile positions
                for (const tile of job.tiles) {
                    addTileOrExpand(tile, job);
                }
            }
        }

        return tiles;
    }

    // Legacy method - delegates to worker-based system for 'human'
    pauseForCombat() {
        this.pauseWorkerForCombat('human');
    }

    // Legacy method - delegates to worker-based system for 'human'
    resumeFromCombat() {
        this.resumeWorkerFromCombat('human');
    }

    // Legacy method - uses getter which delegates to 'human' worker
    isPaused() {
        return this.isPausedForCombat;
    }

    // ============ UI Helper Methods ============

    // Get all jobs organized by queue for UI display
    getAllJobsByQueue() {
        const result = {
            human: {
                active: null,
                queued: [...this.queues.human]
            },
            goblin: {
                active: null,
                queued: [...this.queues.goblin]
            },
            all: {
                active: null,
                queued: [...this.queues.all]
            }
        };

        // Add active jobs from workers
        for (const [workerId, workerState] of this.workers) {
            if (workerState.currentJob) {
                result[workerId].active = workerState.currentJob;
            }
        }

        return result;
    }

    // Get total job count across all queues
    getTotalJobCount() {
        let count = this.queues.all.length + this.queues.human.length + this.queues.goblin.length;

        // Count active jobs
        for (const [workerId, workerState] of this.workers) {
            if (workerState.currentJob) count++;
        }

        // Legacy active job
        if (this.currentJob) count++;

        return count;
    }

    // Cancel a job by ID (from any queue or active job)
    cancelJob(jobId) {
        // Check current human job (legacy)
        if (this.currentJob && this.currentJob.id === jobId) {
            log.debug(`Cancelling active human job: ${jobId}`);
            this.currentJob = null;
            this.isProcessing = false;
            this.game.setAnimation('IDLE');
            this.game.currentPath = null;
            this.game.currentWorkTile = null;
            if (this.onQueueChange) this.onQueueChange();
            return true;
        }

        // Check worker active jobs
        for (const [workerId, workerState] of this.workers) {
            if (workerState.currentJob && workerState.currentJob.id === jobId) {
                log.debug(`Cancelling active job for ${workerId}: ${jobId}`);
                workerState.currentJob = null;
                workerState.isProcessing = false;
                this.setWorkerAnimation(workerId, 'IDLE', true);

                if (workerId === 'human') {
                    this.game.currentPath = null;
                    this.game.currentWorkTile = null;
                } else if (workerId === 'goblin') {
                    this.game.goblinCurrentPath = null;
                    this.game.goblinCurrentWorkTile = null;
                }

                if (this.onQueueChange) this.onQueueChange();
                return true;
            }
        }

        // Check all queues
        for (const queueName of ['human', 'goblin', 'all']) {
            const queue = this.queues[queueName];
            const index = queue.findIndex(job => job.id === jobId);
            if (index !== -1) {
                log.debug(`Removing job from ${queueName} queue: ${jobId}`);
                queue.splice(index, 1);
                if (this.onQueueChange) this.onQueueChange();
                return true;
            }
        }

        log.warn(`Job not found: ${jobId}`);
        return false;
    }

    // Clear all queues
    clearAllQueues() {
        this.queues.all = [];
        this.queues.human = [];
        this.queues.goblin = [];

        // Cancel all active jobs
        for (const [workerId, workerState] of this.workers) {
            if (workerState.currentJob) {
                workerState.currentJob = null;
                workerState.isProcessing = false;
                this.setWorkerAnimation(workerId, 'IDLE', true);
            }
        }

        // Legacy
        this.cancelCurrentJob();

        if (this.onQueueChange) this.onQueueChange();
    }

    // Check if a specific worker is working
    isWorkerWorking(workerId) {
        const workerState = this.workers.get(workerId);
        return workerState ? workerState.isProcessing : false;
    }

    // Get current job for a specific worker
    getWorkerCurrentJob(workerId) {
        const workerState = this.workers.get(workerId);
        return workerState ? workerState.currentJob : null;
    }
}

export { JOB_STATUS };
