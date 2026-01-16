// Job status constants
const JOB_STATUS = {
    PENDING: 'pending',
    WALKING: 'walking',
    WORKING: 'working',
    COMPLETED: 'completed'
};

export class JobManager {
    constructor(game) {
        this.game = game;
        this.queue = [];
        this.currentJob = null;
        this.isProcessing = false;
        this.jobIdCounter = 0;
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
            this.game.setAnimation('WAITING');
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

        // Calculate world position (center of tile)
        const tileSize = this.game.tilemap.tileSize;
        const targetX = tile.x * tileSize + tileSize / 2;
        const targetY = tile.y * tileSize + tileSize / 2;

        // Tell game to move character to this position
        this.game.moveCharacterTo(targetX, targetY);
    }

    onTileReached() {
        if (!this.currentJob) return;

        // Start working animation
        this.currentJob.status = JOB_STATUS.WORKING;
        const animation = this.currentJob.tool.animation;

        // Set animation to non-looping and wait for completion
        this.game.setAnimation(animation, false, () => {
            this.onAnimationComplete();
        });
    }

    onAnimationComplete() {
        if (!this.currentJob) return;

        // Apply tool effect to tile
        const tile = this.currentJob.tiles[this.currentJob.currentTileIndex];
        this.applyToolEffect(this.currentJob.tool, tile.x, tile.y);

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
                // Change tile to hoed ground (tile ID 67)
                this.game.tilemap.setTileAt(tileX, tileY, 67);
                break;

            case 'shovel':
                // Add hole overlay (tile ID 1138)
                if (this.game.overlayManager) {
                    this.game.overlayManager.addOverlay(tileX, tileY, 1138);
                }
                break;

            // Other tools can be implemented later
            default:
                console.log(`No effect implemented for ${tool.name}`);
                break;
        }
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
        this.game.setAnimation('WAITING');
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
    getAllQueuedTiles() {
        const tiles = [];

        // Add tiles from current job (remaining tiles)
        if (this.currentJob) {
            for (let i = this.currentJob.currentTileIndex; i < this.currentJob.tiles.length; i++) {
                tiles.push(this.currentJob.tiles[i]);
            }
        }

        // Add tiles from queued jobs
        for (const job of this.queue) {
            for (const tile of job.tiles) {
                tiles.push(tile);
            }
        }

        return tiles;
    }
}

export { JOB_STATUS };
