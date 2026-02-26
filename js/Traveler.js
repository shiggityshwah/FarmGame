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
                this.isStopped = true;
                for (const s of this.sprites) s.setPosition(this.x, this.y);
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
            // Reached path Y — resume normal walking
            this.y = this.startY;
            this._returningToPath = false;
            // fall through to normal walking
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
