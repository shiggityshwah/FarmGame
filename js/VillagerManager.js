import { Logger } from './Logger.js';
import { VILLAGER_MILESTONES, BUILDING_DEFS } from './BuildingRegistry.js';

const log = Logger.create('VillagerManager');

export class VillagerManager {
    constructor(game) {
        this.game = game;
        this.villagers = [];         // { id, type, houseId }
        this.displacedQueue = [];    // FIFO of villagerTypeIds waiting for a new house
        this._idCounter = 0;
        this._readyHouses = [];      // buildings in active_empty awaiting a villager
        this.pendingDebugVillagers = 0; // debug "Add Villager (Housed)" requests waiting for a house
    }

    /** Returns milestone IDs whose trigger condition is met but the villager hasn't been recruited yet. */
    getEligibleMilestoneIds() {
        const m = this.game.milestones;
        const recruitedTypes = new Set(this.villagers.map(v => v.type));
        return VILLAGER_MILESTONES
            .filter(ms => !recruitedTypes.has(ms.id) && ms.trigger(m))
            .map(ms => ms.id);
    }

    /**
     * Called when a building completes construction or becomes path-connected.
     * If there's a displaced villager waiting, assign it immediately.
     * Otherwise, notify TravelerManager so it can spawn a milestone traveler.
     */
    onHouseReady(building) {
        if (building.state !== 'active_empty') return;
        if (!building.pathConnected) return;

        // First: try to assign a displaced villager
        if (this.displacedQueue.length > 0) {
            const villagerType = this.displacedQueue.shift();
            this.onVillagerRecruited(villagerType, building, true);
            log.info(`Displaced villager '${villagerType}' assigned to building ${building.id}`);
            return;
        }

        // Second: spawn a walking debug villager if one is pending (FIFO — 1 per house)
        if (this.pendingDebugVillagers > 0) {
            this.pendingDebugVillagers--;
            this.game.travelerManager?.spawnDebugVillager(building, this.game.pathConnectivity);
            log.info(`Debug villager spawned for building ${building.id} (pending left: ${this.pendingDebugVillagers})`);
            return;
        }

        // Otherwise: notify traveler manager that an empty house is available for a milestone traveler
        this._readyHouses.push(building);
        if (this.game.travelerManager?.onEmptyHouseAvailable) {
            this.game.travelerManager.onEmptyHouseAvailable(building);
        }
    }

    /** Called when a milestone traveler successfully recruits a villager, or a displaced villager returns.
     *  Pass isReturn=true when re-housing a displaced villager so milestone counters aren't double-counted. */
    onVillagerRecruited(villagerType, building, isReturn = false) {
        const villager = {
            id: `v_${this._idCounter++}`,
            type: villagerType,
            houseId: building.id
        };
        this.villagers.push(villager);
        building.state = 'active_occupied';
        building.occupant = villagerType;

        if (!isReturn) this.game.milestones.totalVillagersRecruited++;

        log.info(`Villager '${villagerType}' recruited into building ${building.id}`);

        // Start chimney smoke for this building
        this.game.buildingManager?.onBuildingOccupied(building);

        // Refresh toolbar special buildings section
        if (this.game.toolbar?.refreshBuildSubmenu) {
            this.game.toolbar.refreshBuildSubmenu();
        }

        // Remove from readyHouses if it was there
        const idx = this._readyHouses.indexOf(building);
        if (idx !== -1) this._readyHouses.splice(idx, 1);
    }

    /** Called when a building is deconstructed. Moves occupant to displaced queue. */
    onHouseDeconstructed(building) {
        if (building.occupant) {
            this.displacedQueue.push(building.occupant);
            log.info(`Villager '${building.occupant}' displaced from building ${building.id}`);
        }
        // Stop chimney smoke for this building
        this.game.buildingManager?.onBuildingVacated(building);
        // Remove from villagers array
        this.villagers = this.villagers.filter(v => v.houseId !== building.id);
    }

    /**
     * Called when a building loses path connectivity while occupied.
     * Displaces the villager to the displaced queue so they can return when
     * the path is reconnected. Does NOT remove the building itself.
     */
    onHouseDisconnected(building) {
        if (!building.occupant) return;
        const villagerType = building.occupant;
        this.displacedQueue.push(villagerType);
        log.info(`Villager '${villagerType}' displaced from building ${building.id} (path disconnected)`);
        // Stop chimney smoke
        this.game.buildingManager?.onBuildingVacated(building);
        // Clear occupant on the building
        building.occupant = null;
        // Remove from active villagers array
        this.villagers = this.villagers.filter(v => v.houseId !== building.id);
    }

    getVillagerCount() {
        return this.villagers.length;
    }

    hasVillagerType(type) {
        return this.villagers.some(v => v.type === type);
    }

    /**
     * Returns building def IDs of special buildings unlocked by recruited villagers
     * that have hasTilemap:true (i.e., are buildable).
     */
    getUnlockedSpecialBuildings() {
        const recruitedTypes = new Set(this.villagers.map(v => v.type));
        return Object.values(BUILDING_DEFS)
            .filter(def =>
                def.category === 'special' &&
                def.hasTilemap &&
                def.unlockedBy &&
                recruitedTypes.has(def.unlockedBy)
            )
            .map(def => def.id);
    }
}
