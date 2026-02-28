import { GROWTH_STAGE } from './Crop.js';
import { Logger } from './Logger.js';
import { worldToTile } from './TileUtils.js';

const log = Logger.create('IdleManager');

// Pseudo-tool definitions for idle-only actions
const IDLE_TOOLS = {
    HARVEST: { id: 'idle_harvest', name: 'Harvest',     animation: 'DOING' },
    FLOWER:  { id: 'idle_flower',  name: 'Pick Flower', animation: 'DOING' },
    WEED:    { id: 'idle_weed',    name: 'Clear Weed',  animation: 'DOING' },
    RETURN:  { id: 'idle_return',  name: 'Return Home', animation: 'IDLE'  }
};

// Weighted activity list
const ACTIVITY_WEIGHTS = [
    { weight: 30, key: 'harvest' },
    { weight: 30, key: 'water'   },
    { weight: 20, key: 'flower'  },
    { weight: 20, key: 'weed'    }
];

// Max Euclidean distance (tiles) for the pre-filter – items further away are never checked
const MAX_IDLE_DISTANCE = 20;

// Actual path length (tiles) above which a task is considered "far" and deprioritised.
// A task over this limit is only picked if every other activity is also over the limit.
const MAX_IDLE_PATH_LENGTH = 35;

// How many Euclidean-closest candidates get actual pathfinding done per activity.
// Higher = more accurate but more CPU per idle decision.
const PATH_CHECK_CANDIDATES = 3;

// Weeds must be within this many tiles of the spawn/house
const NEAR_HOUSE_RADIUS = 15;

export class IdleManager {
    constructor(game) {
        this.game = game;

        // State machine: 'inactive' | 'waiting' | 'active'
        this.state = 'inactive';

        // Timer used only for the initial wait or the "nothing to do" back-off poll
        this.waitTimer = 0;
        this.waitDelay = 0;

        // ID of the currently running idle job (null when none)
        this.activeIdleJobId = null;

        // Timestamp (performance.now) when the current idle job was submitted.
        // Used to detect pathfinding failures that resolve almost instantly.
        this._activeJobStartTime = 0;

        // Consecutive jobs that failed (≈ instant completion). Drives backoff.
        this._consecutiveFailures = 0;

        // Cached values resolved during init()
        this._cachedSpawnPos   = null;
        this._cachedHomeTarget = null;   // nearest walkable tile to spawn
    }

    init() {
        if (this.game.tilemap) {
            this._cachedSpawnPos   = this.game.tilemap.getPlayerSpawnPosition();
            this._cachedHomeTarget = this._resolveHomeTarget();
        }
    }

    // ─── Main update ─────────────────────────────────────────────────────────

    update(deltaTime) {
        if (!this.game.jobManager || !this.game.humanPosition) return;

        if (this.game.isInCombat) {
            this._cancelActiveIdleJob();
            this.state = 'inactive';
            this.waitTimer = 0;
            return;
        }

        if (this._hasPlayerJobs()) {
            this._cancelActiveIdleJob();
            this.state = 'inactive';
            this.waitTimer = 0;
            return;
        }

        switch (this.state) {
            case 'inactive':
                this.state = 'waiting';
                this.waitDelay = 3000 + Math.random() * 2000;
                this.waitTimer = 0;
                log.debug(`Idle: waiting ${(this.waitDelay / 1000).toFixed(1)}s before first activity`);
                break;

            case 'waiting':
                this.waitTimer += deltaTime;
                if (this.waitTimer >= this.waitDelay) {
                    this._performIdleActivity();
                }
                break;

            case 'active':
                if (!this._isIdleJobRunning()) {
                    this.activeIdleJobId = null;
                    const elapsed = performance.now() - this._activeJobStartTime;

                    if (elapsed < 500) {
                        // Resolved almost instantly → pathfinding failed / tile skipped
                        this._consecutiveFailures++;
                        const backoff = Math.min(1000 * Math.pow(2, this._consecutiveFailures - 1), 15000);
                        this.state = 'waiting';
                        this.waitDelay = backoff;
                        this.waitTimer = 0;
                        log.debug(`Idle: task failed (${this._consecutiveFailures}x), backing off ${(backoff / 1000).toFixed(1)}s`);
                    } else {
                        this._consecutiveFailures = 0;
                        this._performIdleActivity();
                    }
                }
                break;
        }
    }

    // ─── Player-job / preemption helpers ─────────────────────────────────────

    _hasPlayerJobs() {
        const jm = this.game.jobManager;
        for (const queueName of ['all', 'human']) {
            for (const job of jm.queues[queueName]) {
                if (!job.isIdleJob) return true;
            }
        }
        const humanWorker = jm.workers.get('human');
        if (humanWorker?.currentJob && !humanWorker.currentJob.isIdleJob) return true;
        return false;
    }

    _isIdleJobRunning() {
        if (!this.activeIdleJobId) return false;
        const jm = this.game.jobManager;
        const humanWorker = jm.workers.get('human');
        if (humanWorker?.currentJob?.id === this.activeIdleJobId) return true;
        for (const queueName of ['all', 'human']) {
            for (const job of jm.queues[queueName]) {
                if (job.id === this.activeIdleJobId) return true;
            }
        }
        return false;
    }

    _cancelActiveIdleJob() {
        if (this.activeIdleJobId) {
            this.game.jobManager.cancelJob(this.activeIdleJobId);
            this.activeIdleJobId = null;
        }
    }

    onIdlePreempted() {
        this.activeIdleJobId = null;
        this.state = 'inactive';
        this.waitTimer = 0;
        this._consecutiveFailures = 0;
        log.debug('Idle: preempted by player job');
    }

    // ─── Activity dispatch ────────────────────────────────────────────────────

    /**
     * Evaluate all activities, then pick the best one with awareness of actual
     * path lengths. Tasks whose path length exceeds MAX_IDLE_PATH_LENGTH are
     * deprioritised – they are only chosen if no shorter-path task is available.
     */
    _performIdleActivity() {
        // Evaluate every activity: returns { key, item, pathLength } or nothing
        const evaluations = [];
        for (const { key } of ACTIVITY_WEIGHTS) {
            const result = this._evaluateActivity(key);
            if (result) evaluations.push({ key, ...result });
        }

        if (evaluations.length === 0) {
            const returnJob = this._returnHome();
            if (returnJob) {
                this._startIdleJob(returnJob, 'return');
            } else {
                this.state = 'waiting';
                this.waitDelay = 2000 + Math.random() * 1000;
                this.waitTimer = 0;
            }
            return;
        }

        // Weed-clearing is lowest priority — only do it when nothing else is available
        const nonWeed = evaluations.filter(e => e.key !== 'weed');
        const pool0   = nonWeed.length > 0 ? nonWeed : evaluations;

        // Prefer activities with a short enough path; fall back to any
        const short = pool0.filter(e => e.pathLength <= MAX_IDLE_PATH_LENGTH);
        const pool  = short.length > 0 ? short : pool0;

        const selected = this._weightedSelectFromPool(pool);
        const job = this._createJobForEvaluation(selected);

        if (job) {
            this._startIdleJob(job, selected.key);
        } else {
            this.state = 'waiting';
            this.waitDelay = 1000;
            this.waitTimer = 0;
        }
    }

    _startIdleJob(job, key) {
        this.activeIdleJobId = job.id;
        this._activeJobStartTime = performance.now();
        this.state = 'active';
        log.debug(`Idle: '${key}' → job ${job.id} (pathLen=${job._idlePathLength ?? '?'})`);
    }

    // ─── Chunk ownership helpers ──────────────────────────────────────────────

    /** Returns true if the character is allowed to idle-work at this tile. */
    _isOwnedForIdle(tileX, tileY, allowTown = false) {
        if (!this.game.chunkManager) return true; // no chunk system — allow everything
        if (this.game.isTileOwned(tileX, tileY)) return true;
        if (allowTown && this.game.chunkManager.isTownChunk(tileX, tileY)) return true;
        return false;
    }

    // ─── Per-activity evaluators ──────────────────────────────────────────────

    /** Returns { item, pathLength } for the best candidate, or null. */
    _evaluateActivity(key) {
        switch (key) {
            case 'harvest': {
                if (!this.game.cropManager) return null;
                const items = this.game.cropManager.getCrops().filter(
                    c => !c.isGone && !c.isHarvested && c.isReadyToHarvest() &&
                         this._isOwnedForIdle(c.tileX, c.tileY)
                );
                return this._getClosestReachable(items, c => c.tileX, c => c.tileY);
            }
            case 'water': {
                if (!this.game.cropManager) return null;
                const items = this.game.cropManager.getCrops().filter(c =>
                    !c.isGone && !c.isHarvested && !c.isWatered &&
                    c.stage >= GROWTH_STAGE.PLANTED && c.stage < GROWTH_STAGE.HARVESTABLE &&
                    this._isOwnedForIdle(c.tileX, c.tileY)
                );
                return this._getClosestReachable(items, c => c.tileX, c => c.tileY);
            }
            case 'flower': {
                if (!this.game.flowerManager) return null;
                const items = this.game.flowerManager.getFlowers().filter(
                    f => !f.isGone && !f.isHarvested && this._isOwnedForIdle(f.tileX, f.tileY)
                );
                return this._getClosestReachable(items, f => f.tileX, f => f.tileY);
            }
            case 'weed': {
                if (!this.game.flowerManager) return null;
                let items = this.game.flowerManager.getWeeds().filter(
                    w => !w.isGone && !w.isRemoved && this._isOwnedForIdle(w.tileX, w.tileY, true)
                );
                if (items.length === 0) return null;
                // Prefer weeds near house
                if (this._cachedSpawnPos) {
                    const sp = this._cachedSpawnPos;
                    const near = items.filter(w => {
                        const dx = w.tileX - sp.tileX, dy = w.tileY - sp.tileY;
                        return Math.sqrt(dx * dx + dy * dy) <= NEAR_HOUSE_RADIUS;
                    });
                    if (near.length > 0) items = near;
                }
                return this._getClosestReachable(items, w => w.tileX, w => w.tileY);
            }
        }
        return null;
    }

    /** Create the job from an evaluation result. */
    _createJobForEvaluation({ key, item, pathLength }) {
        const tile = { x: item.tileX, y: item.tileY };
        let tool;
        switch (key) {
            case 'harvest': tool = IDLE_TOOLS.HARVEST; break;
            case 'water':   tool = { id: 'watering_can', name: 'Watering Can', animation: 'WATERING' }; break;
            case 'flower':  tool = IDLE_TOOLS.FLOWER;  break;
            case 'weed':    tool = IDLE_TOOLS.WEED;    break;
            default: return null;
        }
        const job = this.game.jobManager.addIdleJob('human', tool, [tile]);
        if (job) job._idlePathLength = pathLength; // for debug log
        return job;
    }

    // ─── Path-length-aware closest-item finder ────────────────────────────────

    /**
     * From a list of items, finds the one with the shortest actual path from the
     * character's current tile position, subject to MAX_IDLE_DISTANCE.
     *
     * Strategy:
     *   1. Pre-filter by Euclidean distance (cheap).
     *   2. Sort by Euclidean distance, take up to PATH_CHECK_CANDIDATES.
     *   3. Run A* for each and return the one with the shortest real path.
     *
     * Returns { item, pathLength } or null.
     */
    _getClosestReachable(items, tileXFn, tileYFn) {
        if (!this.game.humanPosition) return null;

        const tileSize = this.game.tilemap.tileSize;
        const hx = worldToTile(this.game.humanPosition.x, tileSize);
        const hy = worldToTile(this.game.humanPosition.y, tileSize);

        // Euclidean pre-filter + sort
        const candidates = items
            .map(item => {
                const ix = tileXFn(item), iy = tileYFn(item);
                const dx = ix - hx, dy = iy - hy;
                return { item, ix, iy, euclidDist: Math.sqrt(dx * dx + dy * dy) };
            })
            .filter(c => c.euclidDist <= MAX_IDLE_DISTANCE)
            .sort((a, b) => a.euclidDist - b.euclidDist)
            .slice(0, PATH_CHECK_CANDIDATES);

        let best = null;
        let bestLen = Infinity;

        for (const { item, ix, iy } of candidates) {
            const adj = this.game.findAdjacentStandingTile(hx, hy, ix, iy);
            if (!adj) continue;

            const path = this.game.findPath(hx, hy, adj.x, adj.y);
            if (!path || path.length === 0) continue;

            if (path.length < bestLen) {
                bestLen = path.length;
                best = { item, pathLength: path.length };
            }
        }

        return best;
    }

    // ─── Weighted random selection from an evaluation pool ────────────────────

    /**
     * Picks one evaluation from `pool` using the original ACTIVITY_WEIGHTS.
     * Weights are normalised to only include keys present in the pool.
     */
    _weightedSelectFromPool(pool) {
        const keySet = new Set(pool.map(p => p.key));
        const applicable = ACTIVITY_WEIGHTS.filter(w => keySet.has(w.key));
        const total = applicable.reduce((s, w) => s + w.weight, 0);

        let rand = Math.random() * total;
        for (const w of applicable) {
            rand -= w.weight;
            if (rand <= 0) return pool.find(p => p.key === w.key);
        }
        return pool[pool.length - 1]; // safety fallback
    }

    // ─── Return home ──────────────────────────────────────────────────────────

    _returnHome() {
        if (!this._cachedHomeTarget) return null;
        const tileSize = this.game.tilemap.tileSize;
        const hx = worldToTile(this.game.humanPosition.x, tileSize);
        const hy = worldToTile(this.game.humanPosition.y, tileSize);
        const t = this._cachedHomeTarget;
        if (Math.sqrt((hx - t.x) ** 2 + (hy - t.y) ** 2) <= 2) return null;
        return this.game.jobManager.addIdleJob(
            'human', IDLE_TOOLS.RETURN, [{ x: t.x, y: t.y }]
        );
    }

    /**
     * Find the nearest walkable tile to the spawn position.
     * Expands outward in square rings (radius 0–6) until a walkable tile is found.
     */
    _resolveHomeTarget() {
        if (!this._cachedSpawnPos) return null;
        const sp = this._cachedSpawnPos;

        for (let r = 0; r <= 6; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring only
                    const tx = sp.tileX + dx, ty = sp.tileY + dy;
                    if (this.game.isTileWalkable(tx, ty)) {
                        log.debug(`Idle: home target = (${tx}, ${ty}) from spawn (${sp.tileX}, ${sp.tileY})`);
                        return { x: tx, y: ty };
                    }
                }
            }
        }

        log.warn(`Idle: no walkable tile near spawn (${sp.tileX}, ${sp.tileY})`);
        return null;
    }
}
