import { CONFIG } from './config.js';
import { Logger } from './Logger.js';
import { Traveler } from './Traveler.js';
import { RESOURCE_TYPES } from './Inventory.js';

const log = Logger.create('TravelerManager');

export class TravelerManager {
    constructor(tilemap) {
        this.tilemap = tilemap;
        this.travelers = [];
        this.spawnTimer = 0;
        this.spawnInterval = this._randomInterval();
        this.stand = null;   // RoadsideStand reference, set via setStand()
        this.camera = null;  // Camera reference, set via setCamera()
    }

    setStand(stand) {
        this.stand = stand;
    }

    setCamera(camera) {
        this.camera = camera;
    }

    _randomInterval() {
        const { spawnIntervalMin, spawnIntervalMax } = CONFIG.traveler;
        return spawnIntervalMin + Math.random() * (spawnIntervalMax - spawnIntervalMin);
    }

    // Returns the current visible left/right bounds in world pixels.
    // Falls back to map tile bounds if no camera is set.
    _getVisibleBounds() {
        if (this.camera) {
            const bounds = this.camera.getVisibleBounds();
            return { leftPx: bounds.left, rightPx: bounds.right };
        }
        const tileSize = this.tilemap.tileSize;
        const leftPx = (this.tilemap.mapStartX || 0) * tileSize;
        const rightPx = ((this.tilemap.mapStartX || 0) + this.tilemap.mapWidth) * tileSize;
        return { leftPx, rightPx };
    }

    async _spawnTraveler() {
        const { leftPx, rightPx } = this._getVisibleBounds();
        const margin = CONFIG.traveler.despawnMargin;
        const { hairStyles, pathCenterY } = CONFIG.traveler;

        const direction = Math.random() < 0.5 ? 'east' : 'west';

        // Spawn just outside the player's current viewport so they always appear
        // walking onto screen rather than teleporting in from a distant map edge.
        const spawnX  = direction === 'east' ? leftPx  - margin : rightPx + margin;
        const despawnX = direction === 'east' ? rightPx + margin : leftPx  - margin;

        const hairStyle = hairStyles[Math.floor(Math.random() * hairStyles.length)];

        const traveler = new Traveler(spawnX, pathCenterY, direction, hairStyle, this.stand);
        traveler.despawnX = despawnX;  // walk to the opposite viewport edge then despawn
        this._initTravelerPreferences(traveler);
        await traveler.load();
        this.travelers.push(traveler);

        log.debug(`Spawned traveler dir=${direction} hair=${hairStyle} x=${Math.round(spawnX)} despawnX=${Math.round(despawnX)} visitStand=${traveler.visitStand}`);
    }

    // Generate randomized likes, hates, and gold for the traveler; evaluate stand visit
    _initTravelerPreferences(traveler) {
        if (!this.stand) return;

        const tCfg = CONFIG.stand.traveler;

        // All resources with sell_price are eligible items
        const pool = Object.values(RESOURCE_TYPES).filter(r => r.sell_price !== undefined);
        const shuffled = [...pool].sort(() => Math.random() - 0.5);

        // Pick 2–3 liked items
        const likedCount = 2 + Math.floor(Math.random() * (tCfg.likedItemCount - 1));
        const liked = shuffled.slice(0, Math.min(likedCount, shuffled.length));
        traveler.likedItems = liked.map(r => r.id);

        // Pick 2–3 hated items from the remaining pool (mutually exclusive)
        const remaining = shuffled.slice(liked.length);
        const hatedCount = 2 + Math.floor(Math.random() * (tCfg.hatedItemCount - 1));
        traveler.hatedItems = remaining.slice(0, Math.min(hatedCount, remaining.length)).map(r => r.id);

        // Random gold budget
        traveler.gold = tCfg.goldMin + Math.floor(Math.random() * (tCfg.goldMax - tCfg.goldMin + 1));

        this._evaluateStandVisit(traveler);
    }

    // Determine whether the traveler stops at the stand and what they intend to buy
    _evaluateStandVisit(traveler) {
        const stand = this.stand;
        const tCfg = CONFIG.stand.traveler;
        const listedIds = stand.getListedResourceIds();

        if (!listedIds.length) {
            traveler.visitStand = false;
            return;
        }

        const hasLiked = listedIds.some(id => traveler.likedItems.includes(id));
        const allHated = listedIds.every(id => traveler.hatedItems.includes(id));

        if (hasLiked) {
            traveler.visitStand = true;
        } else if (allHated) {
            traveler.visitStand = false;
            return;
        } else {
            traveler.visitStand = Math.random() < tCfg.neutralVisitChance;
        }

        if (!traveler.visitStand) return;

        // Build ordered purchase list
        const likedSlots = [];
        const neutralSlots = [];

        for (let i = 0; i < stand.slots.length; i++) {
            const r = stand.slots[i].resource;
            if (!r) continue;
            const price = r.sell_price || 0;
            if (traveler.likedItems.includes(r.id) && traveler.gold >= price) {
                likedSlots.push({ index: i, price });
            } else if (!traveler.hatedItems.includes(r.id)) {
                neutralSlots.push({ index: i, price, resource: r });
            }
        }

        // Sort liked slots: most expensive first
        likedSlots.sort((a, b) => b.price - a.price);

        const purchases = [];
        let gold = traveler.gold;

        for (const s of likedSlots) {
            if (gold >= s.price) {
                purchases.push(s.index);
                gold -= s.price;
            }
        }

        // Neutral items with decaying probability
        let prob = tCfg.neutralBaseProbability;
        for (const s of neutralSlots) {
            if (gold >= s.price && Math.random() < prob) {
                purchases.push(s.index);
                gold -= s.price;
                prob -= tCfg.neutralDecayRate;
                if (prob <= 0) break;
            }
        }

        if (!purchases.length) {
            traveler.visitStand = false;
            return;
        }

        traveler.wantedPurchases = purchases;
        traveler.standStopWorldX = stand.getSlotWorldX(purchases[0]);
        // Center of tile y=63 (S-grass, just north of stand base at y=64)
        traveler.standStopWorldY = (stand.tileY - 1) * stand.tileSize + stand.tileSize / 2;

        log.debug(`Traveler will stop at stand, purchases=${JSON.stringify(purchases)}, stopX=${Math.round(traveler.standStopWorldX)}, stopY=${Math.round(traveler.standStopWorldY)}`);
    }

    update(deltaTime) {
        // Spawn timer
        this.spawnTimer += deltaTime;
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer = 0;
            this.spawnInterval = this._randomInterval();
            this._spawnTraveler();
        }

        for (const traveler of this.travelers) {
            traveler.update(deltaTime);

            // Despawn when the traveler has crossed past its predetermined despawn X
            if (traveler.despawnX !== null && !traveler.isStopped && !traveler._returningToPath) {
                const past = traveler.direction === 'east'
                    ? traveler.x > traveler.despawnX
                    : traveler.x < traveler.despawnX;
                if (past) {
                    traveler.isDespawned = true;
                    log.debug(`Despawned traveler at x=${Math.round(traveler.x)}`);
                }
            }
        }

        this.travelers = this.travelers.filter(t => !t.isDespawned);
    }

    getTravelers() {
        return this.travelers;
    }
}
