import { CONFIG } from './config.js';
import { SpriteAnimator } from './SpriteAnimator.js';

const WALK_FRAMES = 8;

export class Traveler {
    constructor(x, y, direction, hairStyle, stand = null) {
        this.x = x;
        this.y = y;
        this.startY = y;          // original path Y (992px)
        this.direction = direction;   // 'east' (moving right) or 'west' (moving left)
        this.facingLeft = direction === 'west';
        this.hairStyle = hairStyle;

        this.sprites = [];            // [baseSprite, hairSprite]
        this.loaded = false;
        this.isDespawned = false;
        this.isStopped = false;

        // Set by TravelerManager at spawn time: the X the traveler walks to before despawning
        this.despawnX = null;

        // Roadside stand support
        this.stand = stand;               // RoadsideStand reference (set by TravelerManager)
        this.likedItems   = [];           // resource IDs the traveler is drawn to
        this.hatedItems   = [];           // resource IDs the traveler avoids
        this.gold         = 0;            // spending budget (100–1000)
        this.visitStand   = false;        // computed at spawn time
        this.wantedPurchases = [];        // ordered slot indices to buy
        this.currentPurchaseIndex = 0;
        this.standStopWorldX  = null;     // world pixel X to stop east/west movement
        this.standStopWorldY  = null;     // world pixel Y to stop south movement (center of tile y=63)

        // Internal movement phase flags
        this._reachedStandX      = false; // true once traveler has reached standStopWorldX
        this._repositionTargetX  = null;  // non-null while walking to a new slot X between purchases
        this._returningToPath    = false; // true while walking back north to startY after purchases

        // Purchase pause — 1 s hold at each item before the transaction executes
        this._purchasePending    = false;
        this._purchasePauseTimer = 0;

        // House-walking state (set after milestone recruitment via walkToHouse())
        this._goingToHouse  = false;
        this._housePhase    = 0;    // 0 = walk east/west to first waypoint X, 1 = follow waypoints
        this._waypoints     = [];   // [{x,y}] world-pixel centres, great-path entry → door tile
        this._waypointIndex = 0;    // current target waypoint
    }

    /**
     * Pause the traveler for `ms` milliseconds before signalling that the
     * purchase at the current slot is ready to execute.
     * When the timer expires, `stand._onPurchaseReady(this)` is called.
     */
    startPurchasePause(ms = 1000) {
        this._purchasePending    = true;
        this._purchasePauseTimer = ms;
        this.isStopped           = true;
    }

    async load() {
        const basePath = `Characters/Human/WALKING/base_walk_strip${WALK_FRAMES}.png`;
        const hairPath = `Characters/Human/WALKING/${this.hairStyle}hair_walk_strip${WALK_FRAMES}.png`;

        const baseSprite = new SpriteAnimator(this.x, this.y, WALK_FRAMES, 8);
        const hairSprite = new SpriteAnimator(this.x, this.y, WALK_FRAMES, 8);

        await Promise.all([baseSprite.load(basePath), hairSprite.load(hairPath)]);

        baseSprite.setFacingLeft(this.facingLeft);
        hairSprite.setFacingLeft(this.facingLeft);

        this.sprites = [baseSprite, hairSprite];
        this.loaded = true;
    }

    update(deltaTime) {
        if (!this.loaded || this.isDespawned) return;

        // ── Phase 0: 1-second pause before purchase executes ────────────────────
        if (this._purchasePending) {
            this._purchasePauseTimer -= deltaTime;
            if (this._purchasePauseTimer <= 0) {
                this._purchasePending = false;
                if (this.stand?._onPurchaseReady) this.stand._onPurchaseReady(this);
            }
            return;
        }

        // ── Phase 1: walk east/west to the first slot's X ───────────────────────
        if (this.visitStand && this.standStopWorldX !== null && !this._reachedStandX && !this.isStopped) {
            const reached = this.direction === 'east'
                ? this.x >= this.standStopWorldX
                : this.x <= this.standStopWorldX;
            if (reached) {
                this.x = this.standStopWorldX;
                this._reachedStandX = true;
                for (const s of this.sprites) s.setPosition(this.x, this.y);
                // fall through immediately to phase 2 this frame
            }
        }

        // ── Phase 2: walk south until reaching standStopWorldY ──────────────────
        if (this._reachedStandX && !this.isStopped) {
            if (this.standStopWorldY === null || this.y >= this.standStopWorldY) {
                if (this.standStopWorldY !== null) this.y = this.standStopWorldY;
                this.isStopped = true;
                for (const s of this.sprites) s.setPosition(this.x, this.y);
                if (this.stand?._onTravelerArrived) this.stand._onTravelerArrived(this);
                return;
            }
            this.y += CONFIG.traveler.speed * deltaTime / 1000;
            if (this.y >= this.standStopWorldY) {
                this.y = this.standStopWorldY;
                this.isStopped = true;
                for (const s of this.sprites) s.setPosition(this.x, this.y);
                if (this.stand?._onTravelerArrived) this.stand._onTravelerArrived(this);
                return;
            }
            for (const s of this.sprites) {
                s.setPosition(this.x, this.y);
                s.update(deltaTime);
            }
            return;
        }

        // ── Phase 3: reposition horizontally to next slot X (between purchases) ─
        if (this._repositionTargetX !== null) {
            const targetX = this._repositionTargetX;
            const step = CONFIG.traveler.speed * deltaTime / 1000;
            const dx = targetX - this.x;
            if (Math.abs(dx) <= step) {
                this.x = targetX;
                this._repositionTargetX = null;
                for (const s of this.sprites) s.setPosition(this.x, this.y);
                // Pause 1 s at this slot before the next purchase executes
                this.startPurchasePause(1000);
            } else {
                this.x += dx > 0 ? step : -step;
                for (const s of this.sprites) {
                    s.setPosition(this.x, this.y);
                    s.update(deltaTime);
                }
            }
            return;
        }

        // ── Phase 4: walk north back to original path Y after all purchases ─────
        if (this._returningToPath) {
            if (this.y > this.startY) {
                this.y = Math.max(this.startY, this.y - CONFIG.traveler.speed * deltaTime / 1000);
                for (const s of this.sprites) {
                    s.setPosition(this.x, this.y);
                    s.update(deltaTime);
                }
                if (this.y > this.startY) return;
            }
            // Reached path Y — resume normal walking (or begin house-walk if flagged)
            this.y = this.startY;
            this._returningToPath = false;
            // fall through (to Phase 5 if _goingToHouse, else normal walking)
        }

        // ── Phase 5: walk to house after milestone recruitment ───────────────────
        if (this._goingToHouse) {
            const speed = CONFIG.traveler.speed * deltaTime / 1000;

            if (this._waypoints.length === 0) {
                this.isDespawned = true;
                return;
            }

            if (this._housePhase === 0) {
                // Walk east/west along great path to first waypoint X, keeping current Y
                const targetX = this._waypoints[0].x;
                const dx = targetX - this.x;
                if (Math.abs(dx) <= speed) {
                    this.x = targetX;
                    this._housePhase = 1;
                    this._waypointIndex = 0;
                    for (const s of this.sprites) s.setPosition(this.x, this.y);
                } else {
                    const facingLeft = dx < 0;
                    this.x += dx > 0 ? speed : -speed;
                    for (const s of this.sprites) {
                        s.setFacingLeft(facingLeft);
                        s.setPosition(this.x, this.y);
                        s.update(deltaTime);
                    }
                }
                return;
            }

            if (this._housePhase === 1) {
                // Follow waypoints in order: great-path entry → door tile
                if (this._waypointIndex >= this._waypoints.length) {
                    this.isDespawned = true;
                    return;
                }
                const wp = this._waypoints[this._waypointIndex];
                const dx = wp.x - this.x;
                const dy = wp.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= speed) {
                    this.x = wp.x;
                    this.y = wp.y;
                    for (const s of this.sprites) s.setPosition(this.x, this.y);
                    this._waypointIndex++;
                    if (this._waypointIndex >= this._waypoints.length) {
                        this.isDespawned = true;
                    }
                } else {
                    const ratio = speed / dist;
                    this.x += dx * ratio;
                    this.y += dy * ratio;
                    const facingLeft = dx < 0;
                    for (const s of this.sprites) {
                        s.setFacingLeft(facingLeft);
                        s.setPosition(this.x, this.y);
                        s.update(deltaTime);
                    }
                }
                return;
            }
        }

        if (this.isStopped) return;

        // ── Normal walking east or west ──────────────────────────────────────────
        const dx = this.direction === 'east' ? CONFIG.traveler.speed : -CONFIG.traveler.speed;
        this.x += dx * deltaTime / 1000;

        for (const sprite of this.sprites) {
            sprite.setPosition(this.x, this.y);
            sprite.update(deltaTime);
        }
    }

    // Called by Game.js to reposition traveler to the next slot's X while remaining
    // at standStopWorldY (between consecutive purchases at the same stand visit).
    moveToNextSlot(newSlotX) {
        this.standStopWorldX      = newSlotX;
        this._repositionTargetX   = newSlotX;
        this.isStopped            = false;
    }

    /**
     * Called after milestone recruitment or debug villager spawn.
     * Redirects the traveler to walk along path tiles to their house, then disappear.
     *
     * @param {{x:number,y:number}[]} waypoints  World-pixel centres ordered
     *   great-path-entry → door tile.  First waypoint must lie on the great path so
     *   the traveler aligns horizontally before following the path northward/southward.
     */
    walkToHouse(waypoints) {
        this.isStopped          = false;
        this.visitStand         = false;
        this.wantedPurchases    = [];
        this._reachedStandX     = false;
        this._repositionTargetX = null;
        this._goingToHouse      = true;
        this._housePhase        = 0;
        this._waypoints         = waypoints ?? [];
        this._waypointIndex     = 0;
        // First walk back north to great path Y, then begin house-walk
        if (this.y > this.startY) {
            this._returningToPath = true;
        }
    }

    // Called by Game.js after all purchases are done (or if stand is busy/unavailable)
    resumeWalking() {
        this.isStopped           = false;
        this.visitStand          = false;
        this.wantedPurchases     = [];
        this._reachedStandX      = false;
        this._repositionTargetX  = null;
        // Walk back north to the original path Y before resuming east/west movement
        if (this.y > this.startY) {
            this._returningToPath = true;
        }
    }

    render(ctx, camera) {
        if (!this.loaded || this.isDespawned) return;
        for (const sprite of this.sprites) {
            sprite.render(ctx, camera);
        }
    }

    getSortY() {
        return this.y;
    }
}
