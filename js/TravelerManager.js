import { CONFIG } from './config.js';
import { Logger } from './Logger.js';
import { Traveler } from './Traveler.js';
import { RESOURCE_TYPES } from './Inventory.js';
import { VILLAGER_MILESTONES, BUILDING_DEFS } from './BuildingRegistry.js';

const log = Logger.create('TravelerManager');

export class TravelerManager {
    constructor(tilemap) {
        this.tilemap = tilemap;
        this.travelers = [];
        this.spawnTimer = 0;
        this.spawnInterval = this._randomInterval();
        this.stand = null;   // RoadsideStand reference, set via setStand()
        this.camera = null;  // Camera reference, set via setCamera()
        this.villagerManager = null;
        this.regularTravelersSinceMilestone = 0;
        this._pendingEmptyHouse = null;  // building waiting for a villager
    }

    setStand(stand) {
        this.stand = stand;
    }

    setCamera(camera) {
        this.camera = camera;
    }

    setVillagerManager(vm) {
        this.villagerManager = vm;
    }

    /** Called by VillagerManager when a building is ready for a villager. */
    onEmptyHouseAvailable(building) {
        this._pendingEmptyHouse = building;
        log.info(`Empty house available for milestone traveler: ${building.id}`);
    }

    _randomInterval() {
        const { spawnIntervalMin, spawnIntervalMax } = CONFIG.traveler;
        return spawnIntervalMin + Math.random() * (spawnIntervalMax - spawnIntervalMin);
    }

    // Returns the current world pixel bounds of the great path (map left/right edges).
    // mapStartX and mapWidth are updated by ChunkManager._updateMapBounds() on every
    // chunk purchase, so this automatically reflects the expanded world.
    _getWorldBounds() {
        const tileSize = this.tilemap.tileSize;
        const leftPx  = (this.tilemap.mapStartX || 0) * tileSize;
        const rightPx = (this.tilemap.mapWidth  || CONFIG.chunks.initialGridCols * CONFIG.chunks.size) * tileSize;
        return { leftPx, rightPx };
    }

    async _spawnTraveler() {
        const { leftPx, rightPx } = this._getWorldBounds();
        const margin = CONFIG.traveler.despawnMargin;
        const { hairStyles, pathCenterY } = CONFIG.traveler;

        const direction = Math.random() < 0.5 ? 'east' : 'west';

        // Spawn just off the world edge so they walk onto the great path naturally.
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

    async _spawnMilestoneTraveler(villagerMilestoneId, house) {
        const milestone = VILLAGER_MILESTONES.find(m => m.id === villagerMilestoneId);
        if (!milestone) return;

        const { leftPx, rightPx } = this._getWorldBounds();
        const margin = CONFIG.traveler.despawnMargin;
        const { hairStyles, pathCenterY } = CONFIG.traveler;
        const direction = Math.random() < 0.5 ? 'east' : 'west';
        const spawnX   = direction === 'east' ? leftPx  - margin : rightPx + margin;
        const despawnX = direction === 'east' ? rightPx + margin : leftPx  - margin;
        const hairStyle = hairStyles[Math.floor(Math.random() * hairStyles.length)];

        const traveler = new Traveler(spawnX, pathCenterY, direction, hairStyle, this.stand);
        traveler.despawnX = despawnX;
        traveler.isMilestone = true;
        traveler.villagerType = villagerMilestoneId;
        traveler.villagerName = milestone.name;
        traveler.targetHouse = house;
        traveler.comboItems = milestone.combo;  // [{ id, count }]
        traveler.visitStand = !!this.stand;

        if (this.stand) {
            traveler.standStopWorldX = this.stand.getSlotWorldX?.(0) ?? 0;
            traveler.standStopWorldY = (this.stand.tileY - 1) * this.tilemap.tileSize + this.tilemap.tileSize / 2;
        }

        await traveler.load();
        this.travelers.push(traveler);

        log.info(`Spawned milestone traveler: ${villagerMilestoneId} (${milestone.name})`);
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
            log.debug(`Traveler skips stand: stand is empty`);
            return;
        }

        const hasLiked = listedIds.some(id => traveler.likedItems.includes(id));
        const allHated = listedIds.every(id => traveler.hatedItems.includes(id));

        if (hasLiked) {
            traveler.visitStand = true;
        } else if (allHated) {
            traveler.visitStand = false;
            log.debug(`Traveler skips stand: all listed items are hated`);
            return;
        } else {
            traveler.visitStand = Math.random() < tCfg.neutralVisitChance;
            if (!traveler.visitStand) {
                log.debug(`Traveler skips stand: neutral visit chance failed`);
            }
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
            log.debug(`Traveler skips stand: no affordable purchases (gold=${traveler.gold}, liked=${traveler.likedItems.join(',')}, listed=${listedIds.join(',')})`);
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

            const eligibleIds = this.villagerManager?.getEligibleMilestoneIds() ?? [];
            const maxRegular = CONFIG.villagers?.maxRegularTravelersBeforeMilestone ?? 5;

            if (this._pendingEmptyHouse && eligibleIds.length > 0
                && this.regularTravelersSinceMilestone >= maxRegular) {
                this._spawnMilestoneTraveler(eligibleIds[0], this._pendingEmptyHouse);
                this.regularTravelersSinceMilestone = 0;
                this._pendingEmptyHouse = null;
            } else {
                this._spawnTraveler();
                this.regularTravelersSinceMilestone++;
            }
        }

        for (const traveler of this.travelers) {
            traveler.update(deltaTime);

            // Debug villager: detect arrival at house door (isDespawned set by walkToHouse phase 1)
            if (traveler.isDebugVillager && traveler.isDespawned && traveler._debugTargetBuilding) {
                const house = traveler._debugTargetBuilding;
                traveler._debugTargetBuilding = null;  // prevent double-fire
                if (this.villagerManager && house.state === 'active_empty') {
                    this.villagerManager.onVillagerRecruited('debug_villager', house);
                }
            }

            // Despawn when the traveler has crossed past its predetermined despawn X
            // (skip check for travelers walking to their house — they despawn at the door)
            if (traveler.despawnX !== null && !traveler.isStopped && !traveler._returningToPath && !traveler._goingToHouse) {
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

    /**
     * Spawn a debug villager entity on the great path that walks to the target house
     * following the player-placed path tiles.
     * When the entity reaches the door, it claims the house and increments villager count.
     *
     * @param {object} building         Building object (active_empty, pathConnected)
     * @param {PathConnectivity|null}   pathConnectivity  Used to trace the path route
     */
    async spawnDebugVillager(building, pathConnectivity = null) {
        const { leftPx, rightPx } = this._getWorldBounds();
        const margin = CONFIG.traveler.despawnMargin;
        const { hairStyles, pathCenterY } = CONFIG.traveler;
        const direction = Math.random() < 0.5 ? 'east' : 'west';
        const spawnX = direction === 'east' ? leftPx - margin : rightPx + margin;
        const hairStyle = hairStyles[Math.floor(Math.random() * hairStyles.length)];

        const traveler = new Traveler(spawnX, pathCenterY, direction, hairStyle, null);
        traveler.despawnX = null;         // don't despawn at world edge
        traveler.visitStand = false;
        traveler.isDebugVillager = true;
        traveler._debugTargetBuilding = building;

        const tileSize = this.tilemap.tileSize;
        const def = BUILDING_DEFS[building.definitionId];
        const doorOffsetX = def?.doorOffset?.x ?? 2;
        const doorOffsetY = def?.doorOffset?.y ?? 4;
        const doorX     = building.tileX + doorOffsetX;
        const doorPathY = building.tileY + doorOffsetY + 1; // path tile one south of door
        const doorY     = building.tileY + doorOffsetY;

        let waypoints = pathConnectivity?.getWaypointsToGreatPath(doorX, doorPathY, tileSize) ?? null;
        if (waypoints) {
            waypoints.push({ x: doorX * tileSize + tileSize / 2, y: doorY * tileSize + tileSize / 2 });
        } else {
            // Fallback: straight walk to door
            waypoints = [
                { x: doorX * tileSize + tileSize / 2, y: pathCenterY },
                { x: doorX * tileSize + tileSize / 2, y: doorY * tileSize + tileSize / 2 },
            ];
        }

        await traveler.load();
        traveler.walkToHouse(waypoints);
        this.travelers.push(traveler);
        log.info(`Debug villager spawned, heading to building ${building.id} at door (${doorX}, ${doorY})`);
    }

    getTravelers() {
        return this.travelers;
    }
}
