/**
 * Tests for Phase 4a additions:
 *   - BuildingRegistry (BUILDING_DEFS, VILLAGER_MILESTONES, buildingCostToRefundItems)
 *   - BuildingManager (placement, state transitions, obstacle checking, footprint)
 *   - PathConnectivity (BFS path-to-great-path detection, caching)
 *   - VillagerManager (milestone eligibility, recruitment, displacement)
 *   - CONFIG additions (villagers.maxRegularTravelersBeforeMilestone, build.pathCostPerTile)
 */

import { describe, it, expect, beforeEach } from './TestRunner.js';
import { BUILDING_DEFS, VILLAGER_MILESTONES, buildingCostToRefundItems } from '../js/BuildingRegistry.js';
import { BuildingManager } from '../js/BuildingManager.js';
import { PathConnectivity } from '../js/PathConnectivity.js';
import { VillagerManager } from '../js/VillagerManager.js';
import { CONFIG } from '../js/config.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockTilemap(tileIdMap = {}) {
    return {
        tileSize: 16,
        tilesetImage: null,
        chunkTiles: new Map(),
        getTileAt(x, y) { return tileIdMap[`${x},${y}`] ?? null; },
        getTilesetSourceRect(id) { return { x: 0, y: 0, width: 16, height: 16 }; },
    };
}

function makeMockGame(overrides = {}) {
    const milestones = {
        totalGoldEarned:         0,
        totalCropsHarvested:     0,
        totalCropsPlanted:       0,
        totalPotionsCrafted:     0,
        totalAnvilUpgrades:      0,
        totalShrineUpgrades:     0,
        totalChunksOwned:        1,
        totalVillagersRecruited: 0,
        goblinEverHired:         false,
        ...overrides.milestones,
    };
    return {
        milestones,
        travelerManager: null,
        toolbar: null,
        villagers: [],
        ...overrides,
    };
}

// ── BuildingRegistry — BUILDING_DEFS ─────────────────────────────────────────

describe('BuildingRegistry — BUILDING_DEFS structure', () => {
    it('should define small_house with required fields', () => {
        const def = BUILDING_DEFS['small_house'];
        expect(def).toBeDefined();
        expect(def.id).toBe('small_house');
        expect(def.name).toBe('Small House');
        expect(def.category).toBe('house');
        expect(def.footprint.width).toBeGreaterThan(0);
        expect(def.footprint.height).toBeGreaterThan(0);
        expect(def.cost).toBeDefined();
        expect(def.constructionCycles).toBeGreaterThan(0);
        expect(def.hasTilemap).toBe(true);
        expect(def.debugOnly).toBe(false);
    });

    it('should define special buildings with hasTilemap:true (using home.tmx tileset)', () => {
        for (const id of ['pub', 'workshop', 'apothecary', 'forge', 'town_hall']) {
            const def = BUILDING_DEFS[id];
            expect(def).toBeDefined();
            expect(def.hasTilemap).toBe(true);
            expect(def.unique).toBe(true);
            expect(def.unlockedBy).not.toBe(null);
        }
    });

    it('should have unique: false for house-category buildings', () => {
        const houses = Object.values(BUILDING_DEFS).filter(d => d.category === 'house' && !d.debugOnly);
        expect(houses.length).toBeGreaterThan(0);
        for (const h of houses) {
            expect(h.unique).toBe(false);
        }
    });

    it('each building def has layers array', () => {
        for (const def of Object.values(BUILDING_DEFS)) {
            expect(Array.isArray(def.layers)).toBe(true);
        }
    });

    it('building layers have valid renderPass values', () => {
        const validPasses = new Set(['ground', 'upper', 'roof']);
        for (const def of Object.values(BUILDING_DEFS)) {
            for (const layer of def.layers) {
                expect(validPasses.has(layer.renderPass)).toBe(true);
            }
        }
    });
});

// ── BuildingRegistry — VILLAGER_MILESTONES ────────────────────────────────────

describe('BuildingRegistry — VILLAGER_MILESTONES', () => {
    it('should define at least 10 milestones', () => {
        expect(VILLAGER_MILESTONES.length).toBeGreaterThanOrEqualTo(10);
    });

    it('each milestone has id, name, trigger function, and combo array', () => {
        for (const ms of VILLAGER_MILESTONES) {
            expect(typeof ms.id).toBe('string');
            expect(typeof ms.name).toBe('string');
            expect(typeof ms.trigger).toBe('function');
            expect(Array.isArray(ms.combo)).toBe(true);
            expect(ms.combo.length).toBeGreaterThan(0);
        }
    });

    it('milestone ids are unique', () => {
        const ids = VILLAGER_MILESTONES.map(m => m.id);
        const unique = new Set(ids);
        expect(unique.size).toBe(ids.length);
    });

    it('combo items have id (string) and count (number)', () => {
        for (const ms of VILLAGER_MILESTONES) {
            for (const item of ms.combo) {
                expect(typeof item.id).toBe('string');
                expect(typeof item.count).toBe('number');
                expect(item.count).toBeGreaterThan(0);
            }
        }
    });

    it('innkeeper triggers at totalGoldEarned >= 500', () => {
        const ms = VILLAGER_MILESTONES.find(m => m.id === 'innkeeper');
        expect(ms).toBeDefined();
        expect(ms.trigger({ totalGoldEarned: 499 })).toBe(false);
        expect(ms.trigger({ totalGoldEarned: 500 })).toBe(true);
        expect(ms.trigger({ totalGoldEarned: 1000 })).toBe(true);
    });

    it('carpenter triggers at totalChunksOwned >= 2', () => {
        const ms = VILLAGER_MILESTONES.find(m => m.id === 'carpenter');
        expect(ms).toBeDefined();
        expect(ms.trigger({ totalChunksOwned: 1 })).toBe(false);
        expect(ms.trigger({ totalChunksOwned: 2 })).toBe(true);
    });

    it('each milestone id corresponds to a BUILDING_DEFS unlockedBy entry', () => {
        const unlockedBys = new Set(
            Object.values(BUILDING_DEFS)
                .map(d => d.unlockedBy)
                .filter(Boolean)
        );
        for (const ms of VILLAGER_MILESTONES) {
            expect(unlockedBys.has(ms.id)).toBe(true);
        }
    });
});

// ── BuildingRegistry — buildingCostToRefundItems ──────────────────────────────

describe('buildingCostToRefundItems', () => {
    it('converts wood cost to WOOD resource', () => {
        const items = buildingCostToRefundItems({ wood: 20 });
        expect(items.length).toBe(1);
        expect(items[0].resource.id).toBe('wood');
        expect(items[0].amount).toBe(20);
    });

    it('converts gold cost to GOLD resource', () => {
        const items = buildingCostToRefundItems({ gold: 50 });
        expect(items.length).toBe(1);
        expect(items[0].resource.id).toBe('gold');
        expect(items[0].amount).toBe(50);
    });

    it('converts stone cost to ORE_STONE resource', () => {
        const items = buildingCostToRefundItems({ stone: 10 });
        expect(items.length).toBe(1);
        expect(items[0].resource.id).toBe('ore_stone');
        expect(items[0].amount).toBe(10);
    });

    it('handles multi-resource cost', () => {
        const items = buildingCostToRefundItems({ wood: 20, stone: 10, gold: 50 });
        expect(items.length).toBe(3);
        const ids = items.map(i => i.resource.id);
        expect(ids).toContain('wood');
        expect(ids).toContain('ore_stone');
        expect(ids).toContain('gold');
    });

    it('skips zero-amount entries', () => {
        const items = buildingCostToRefundItems({ wood: 5, stone: 0, gold: 10 });
        expect(items.length).toBe(2);
    });

    it('handles empty cost', () => {
        const items = buildingCostToRefundItems({});
        expect(items.length).toBe(0);
    });
});

// ── BuildingManager ────────────────────────────────────────────────────────────

describe('BuildingManager — initial state', () => {
    it('starts with no placed buildings', () => {
        const bm = new BuildingManager(makeMockTilemap());
        expect(bm.placedBuildings.length).toBe(0);
    });

    it('setTileset sets _tilesetImage', () => {
        const bm = new BuildingManager(makeMockTilemap());
        const img = {};
        bm.setTileset(img);
        expect(bm._tilesetImage).toBe(img);
    });
});

describe('BuildingManager — placeBuilding (hasTilemap: false, no fetch needed)', () => {
    let bm;

    beforeEach(() => {
        bm = new BuildingManager(makeMockTilemap());
    });

    it('places a building and returns it', async () => {
        const b = await bm.placeBuilding('pub', 10, 20);
        expect(b).toBeDefined();
        expect(b.definitionId).toBe('pub');
        expect(b.tileX).toBe(10);
        expect(b.tileY).toBe(20);
        expect(b.state).toBe('under_construction');
        expect(bm.placedBuildings.length).toBe(1);
    });

    it('assigns sequential IDs', async () => {
        const b1 = await bm.placeBuilding('pub', 0, 0);
        const b2 = await bm.placeBuilding('workshop', 5, 5);
        expect(b1.id).not.toBe(b2.id);
    });

    it('allows overriding initial state', async () => {
        const b = await bm.placeBuilding('pub', 0, 0, 'active_empty');
        expect(b.state).toBe('active_empty');
    });
});

describe('BuildingManager — getBuildingAt', () => {
    let bm;

    beforeEach(async () => {
        bm = new BuildingManager(makeMockTilemap());
        // pub has footprint 0×0 — use small_house (5×4) but no fetch needed
        // Actually all hasTilemap:false have footprint 0×0, so use debug_home (hasTilemap:true,
        // but loadDefinitionLayers will fail without fetch).
        // Instead, manually inject a building with a real def for footprint testing.
        // Use pub (footprint 0×0 won't match any tile), so manually set footprint via a stub:
    });

    it('returns null when no buildings placed', () => {
        expect(bm.getBuildingAt(5, 5)).toBe(null);
    });

    it('finds building when tile is in footprint (using injected building)', async () => {
        // Manually inject a building with a non-zero footprint for testing
        const b = await bm.placeBuilding('pub', 10, 10);
        // Patch the def footprint for this test
        const origDef = BUILDING_DEFS['pub'];
        const savedFP = origDef.footprint;
        origDef.footprint = { width: 4, height: 3 };
        try {
            expect(bm.getBuildingAt(10, 10)).toBe(b);
            expect(bm.getBuildingAt(13, 12)).toBe(b);  // last tile in footprint
            expect(bm.getBuildingAt(14, 10)).toBe(null); // just outside
        } finally {
            origDef.footprint = savedFP;
        }
    });
});

describe('BuildingManager — isObstacle', () => {
    let bm;

    beforeEach(() => {
        bm = new BuildingManager(makeMockTilemap());
    });

    it('returns false when no buildings placed', () => {
        expect(bm.isObstacle(5, 5)).toBe(false);
    });

    it('returns false for under_construction buildings (passable during construction)', async () => {
        const b = await bm.placeBuilding('pub', 5, 5);
        b.state = 'under_construction';
        const origFP = BUILDING_DEFS['pub'].footprint;
        BUILDING_DEFS['pub'].footprint = { width: 3, height: 3 };
        try {
            expect(bm.isObstacle(5, 5)).toBe(false);
        } finally {
            BUILDING_DEFS['pub'].footprint = origFP;
        }
    });

    it('returns true for completed buildings in footprint', async () => {
        const b = await bm.placeBuilding('pub', 5, 5, 'inactive');
        const origFP = BUILDING_DEFS['pub'].footprint;
        BUILDING_DEFS['pub'].footprint = { width: 3, height: 3 };
        try {
            expect(bm.isObstacle(5, 5)).toBe(true);
            expect(bm.isObstacle(7, 7)).toBe(true);
            expect(bm.isObstacle(8, 5)).toBe(false); // outside footprint
        } finally {
            BUILDING_DEFS['pub'].footprint = origFP;
        }
    });
});

describe('BuildingManager — completeBuildingById', () => {
    it('transitions state from under_construction to inactive', async () => {
        const bm = new BuildingManager(makeMockTilemap());
        const b = await bm.placeBuilding('pub', 0, 0);
        expect(b.state).toBe('under_construction');
        bm.completeBuildingById(b.id);
        expect(b.state).toBe('inactive');
    });

    it('fires onBuildingCompleted callback', async () => {
        const bm = new BuildingManager(makeMockTilemap());
        let called = null;
        bm.onBuildingCompleted = (building) => { called = building; };
        const b = await bm.placeBuilding('pub', 0, 0);
        bm.completeBuildingById(b.id);
        expect(called).toBe(b);
    });

    it('does nothing for unknown id', async () => {
        const bm = new BuildingManager(makeMockTilemap());
        expect(() => bm.completeBuildingById('nonexistent')).not.toThrow();
    });
});

describe('BuildingManager — deconstructBuilding', () => {
    it('removes building and returns it', async () => {
        const bm = new BuildingManager(makeMockTilemap());
        const b = await bm.placeBuilding('pub', 0, 0);
        const returned = bm.deconstructBuilding(b.id);
        expect(returned).toBe(b);
        expect(bm.placedBuildings.length).toBe(0);
    });

    it('returns null for unknown id', () => {
        const bm = new BuildingManager(makeMockTilemap());
        expect(bm.deconstructBuilding('nope')).toBe(null);
    });
});

describe('BuildingManager — getFootprintTiles', () => {
    it('returns correct tiles for footprint', async () => {
        const bm = new BuildingManager(makeMockTilemap());
        const b = await bm.placeBuilding('pub', 3, 7);
        const origFP = BUILDING_DEFS['pub'].footprint;
        BUILDING_DEFS['pub'].footprint = { width: 2, height: 3 };
        try {
            const tiles = bm.getFootprintTiles(b);
            expect(tiles.length).toBe(6); // 2 × 3
            const found = (x, y) => tiles.some(t => t.x === x && t.y === y);
            expect(found(3, 7)).toBe(true);
            expect(found(4, 7)).toBe(true);
            expect(found(3, 9)).toBe(true);
            expect(found(4, 9)).toBe(true);
        } finally {
            BUILDING_DEFS['pub'].footprint = origFP;
        }
    });
});

// ── PathConnectivity ──────────────────────────────────────────────────────────

describe('PathConnectivity — isPathTile', () => {
    const pathTileId = CONFIG.tiles.path[0]; // 482

    it('returns true for tiles on the great path strip', () => {
        const pc = new PathConnectivity(makeMockTilemap());
        const { mainPathY, mainPathGap } = CONFIG.chunks;
        expect(pc.isPathTile(0, mainPathY)).toBe(true);
        expect(pc.isPathTile(10, mainPathY + mainPathGap - 1)).toBe(true);
    });

    it('returns false for tiles above the great path strip', () => {
        const pc = new PathConnectivity(makeMockTilemap());
        const { mainPathY } = CONFIG.chunks;
        expect(pc.isPathTile(0, mainPathY - 1)).toBe(false);
    });

    it('returns false for tiles below the great path strip with no path tile', () => {
        const pc = new PathConnectivity(makeMockTilemap());
        const { mainPathY, mainPathGap } = CONFIG.chunks;
        expect(pc.isPathTile(0, mainPathY + mainPathGap)).toBe(false);
    });

    it('returns true for tiles with a path tile ID in the tilemap', () => {
        const tileMap = { '5,60': pathTileId };
        const pc = new PathConnectivity(makeMockTilemap(tileMap));
        expect(pc.isPathTile(5, 60)).toBe(true);
    });

    it('returns false for tiles with a non-path tile ID', () => {
        const tileMap = { '5,60': 65 }; // grass tile
        const pc = new PathConnectivity(makeMockTilemap(tileMap));
        expect(pc.isPathTile(5, 60)).toBe(false);
    });
});

describe('PathConnectivity — isConnectedToGreatPath', () => {
    const pathTileId = CONFIG.tiles.path[0];
    const { mainPathY } = CONFIG.chunks;

    it('returns true if start tile IS on the great path', () => {
        const pc = new PathConnectivity(makeMockTilemap());
        expect(pc.isConnectedToGreatPath(10, mainPathY)).toBe(true);
    });

    it('returns false for a non-path start tile', () => {
        const tileMap = { '5,60': 65 }; // grass
        const pc = new PathConnectivity(makeMockTilemap(tileMap));
        expect(pc.isConnectedToGreatPath(5, 60)).toBe(false);
    });

    it('finds connection via chain of path tiles to great path', () => {
        // Build a vertical chain: tiles at x=22, y=49..44 (mainPathY is 45)
        // Chain: 49 → 48 → 47 → 46 → 45 (great path)
        const tileMap = {};
        for (let y = 49; y >= mainPathY; y--) {
            tileMap[`22,${y}`] = pathTileId;
        }
        const pc = new PathConnectivity(makeMockTilemap(tileMap));
        expect(pc.isConnectedToGreatPath(22, 49)).toBe(true);
    });

    it('returns false for isolated path tile not connected to great path', () => {
        // Single path tile far from the great path, no connection
        const tileMap = { '5,70': pathTileId };
        const pc = new PathConnectivity(makeMockTilemap(tileMap));
        expect(pc.isConnectedToGreatPath(5, 70)).toBe(false);
    });

    it('caches results — same tile returns same result on second call', () => {
        const pc = new PathConnectivity(makeMockTilemap());
        const r1 = pc.isConnectedToGreatPath(10, mainPathY);
        const r2 = pc.isConnectedToGreatPath(10, mainPathY);
        expect(r1).toBe(r2);
        expect(pc._cache.size).toBeGreaterThan(0);
    });

    it('invalidate() clears the cache', () => {
        const pc = new PathConnectivity(makeMockTilemap());
        pc.isConnectedToGreatPath(10, mainPathY);
        expect(pc._cache.size).toBeGreaterThan(0);
        pc.invalidate();
        expect(pc._cache.size).toBe(0);
    });
});

// ── VillagerManager ────────────────────────────────────────────────────────────

describe('VillagerManager — getEligibleMilestoneIds', () => {
    it('returns innkeeper id when totalGoldEarned >= 500', () => {
        const game = makeMockGame({ milestones: { totalGoldEarned: 500 } });
        const vm = new VillagerManager(game);
        const ids = vm.getEligibleMilestoneIds();
        expect(ids).toContain('innkeeper');
    });

    it('returns empty when no milestone conditions are met', () => {
        const game = makeMockGame(); // all zeros
        const vm = new VillagerManager(game);
        const ids = vm.getEligibleMilestoneIds();
        // No conditions should be met with default zero milestones
        expect(ids.length).toBe(0);
    });

    it('excludes already-recruited villager types', () => {
        const game = makeMockGame({ milestones: { totalGoldEarned: 1000 } });
        const vm = new VillagerManager(game);
        // Pre-populate villagers as already recruited innkeeper
        vm.villagers = [{ id: 'v_0', type: 'innkeeper', houseId: 'b_0' }];
        const ids = vm.getEligibleMilestoneIds();
        expect(ids).not.toContain('innkeeper');
    });

    it('returns carpenter when totalChunksOwned >= 2', () => {
        const game = makeMockGame({ milestones: { totalChunksOwned: 3 } });
        const vm = new VillagerManager(game);
        const ids = vm.getEligibleMilestoneIds();
        expect(ids).toContain('carpenter');
    });
});

describe('VillagerManager — onVillagerRecruited', () => {
    it('adds villager to villagers array', () => {
        const game = makeMockGame();
        const vm = new VillagerManager(game);
        const building = { id: 'b_0', state: 'active_empty', occupant: null };
        vm.onVillagerRecruited('innkeeper', building);
        expect(vm.villagers.length).toBe(1);
        expect(vm.villagers[0].type).toBe('innkeeper');
        expect(vm.villagers[0].houseId).toBe('b_0');
    });

    it('sets building state to active_occupied', () => {
        const game = makeMockGame();
        const vm = new VillagerManager(game);
        const building = { id: 'b_1', state: 'active_empty', occupant: null };
        vm.onVillagerRecruited('carpenter', building);
        expect(building.state).toBe('active_occupied');
        expect(building.occupant).toBe('carpenter');
    });

    it('increments milestones.totalVillagersRecruited', () => {
        const game = makeMockGame();
        const vm = new VillagerManager(game);
        const building = { id: 'b_2', state: 'active_empty', occupant: null };
        expect(game.milestones.totalVillagersRecruited).toBe(0);
        vm.onVillagerRecruited('innkeeper', building);
        expect(game.milestones.totalVillagersRecruited).toBe(1);
    });
});

describe('VillagerManager — onHouseDeconstructed', () => {
    it('adds occupant to displaced queue', () => {
        const game = makeMockGame();
        const vm = new VillagerManager(game);
        const building = { id: 'b_0', state: 'active_occupied', occupant: 'innkeeper' };
        vm.villagers = [{ id: 'v_0', type: 'innkeeper', houseId: 'b_0' }];
        vm.onHouseDeconstructed(building);
        expect(vm.displacedQueue).toContain('innkeeper');
        expect(vm.villagers.length).toBe(0);
    });

    it('does nothing when building has no occupant', () => {
        const game = makeMockGame();
        const vm = new VillagerManager(game);
        const building = { id: 'b_0', state: 'inactive', occupant: null };
        vm.onHouseDeconstructed(building);
        expect(vm.displacedQueue.length).toBe(0);
    });
});

describe('VillagerManager — onHouseReady (displaced queue)', () => {
    it('assigns displaced villager immediately when house becomes ready', () => {
        const game = makeMockGame();
        const vm = new VillagerManager(game);
        vm.displacedQueue = ['innkeeper'];
        const building = { id: 'b_1', state: 'active_empty', occupant: null, pathConnected: true };
        vm.onHouseReady(building);
        expect(vm.displacedQueue.length).toBe(0);
        expect(building.state).toBe('active_occupied');
        expect(building.occupant).toBe('innkeeper');
    });

    it('returns early if building is not active_empty', () => {
        const game = makeMockGame();
        const vm = new VillagerManager(game);
        vm.displacedQueue = ['innkeeper'];
        const building = { id: 'b_1', state: 'inactive', occupant: null, pathConnected: true };
        vm.onHouseReady(building);
        expect(vm.displacedQueue.length).toBe(1); // not consumed
    });

    it('returns early if building is not path-connected', () => {
        const game = makeMockGame();
        const vm = new VillagerManager(game);
        vm.displacedQueue = ['innkeeper'];
        const building = { id: 'b_1', state: 'active_empty', occupant: null, pathConnected: false };
        vm.onHouseReady(building);
        expect(vm.displacedQueue.length).toBe(1); // not consumed
    });
});

describe('VillagerManager — hasVillagerType / getVillagerCount', () => {
    it('hasVillagerType returns false when no villagers', () => {
        const vm = new VillagerManager(makeMockGame());
        expect(vm.hasVillagerType('innkeeper')).toBe(false);
    });

    it('hasVillagerType returns true when villager is present', () => {
        const vm = new VillagerManager(makeMockGame());
        vm.villagers = [{ id: 'v_0', type: 'innkeeper', houseId: 'b_0' }];
        expect(vm.hasVillagerType('innkeeper')).toBe(true);
        expect(vm.hasVillagerType('carpenter')).toBe(false);
    });

    it('getVillagerCount returns correct count', () => {
        const vm = new VillagerManager(makeMockGame());
        expect(vm.getVillagerCount()).toBe(0);
        vm.villagers = [{ id: 'v_0', type: 'innkeeper', houseId: 'b_0' }];
        expect(vm.getVillagerCount()).toBe(1);
    });
});

describe('VillagerManager — getUnlockedSpecialBuildings', () => {
    it('returns empty array when no villagers recruited', () => {
        const vm = new VillagerManager(makeMockGame());
        expect(vm.getUnlockedSpecialBuildings().length).toBe(0);
    });

    it('returns special hasTilemap:true buildings unlocked by recruited villager types', () => {
        const vm = new VillagerManager(makeMockGame());
        vm.villagers = [{ id: 'v_0', type: 'innkeeper', houseId: 'b_0' }];
        // pub is unlocked by innkeeper and hasTilemap:true → should appear
        const unlocked = vm.getUnlockedSpecialBuildings();
        expect(unlocked).toContain('pub');
    });
});

// ── CONFIG Phase 4a additions ─────────────────────────────────────────────────

describe('CONFIG — Phase 4a additions', () => {
    it('defines CONFIG.villagers.maxRegularTravelersBeforeMilestone', () => {
        expect(CONFIG.villagers).toBeDefined();
        expect(typeof CONFIG.villagers.maxRegularTravelersBeforeMilestone).toBe('number');
        expect(CONFIG.villagers.maxRegularTravelersBeforeMilestone).toBeGreaterThan(0);
    });

    it('defines CONFIG.build.pathCostPerTile', () => {
        expect(CONFIG.build).toBeDefined();
        expect(typeof CONFIG.build.pathCostPerTile).toBe('number');
        expect(CONFIG.build.pathCostPerTile).toBeGreaterThan(0);
    });

    it('CONFIG.chunks has mainPathY and mainPathGap for PathConnectivity', () => {
        expect(typeof CONFIG.chunks.mainPathY).toBe('number');
        expect(typeof CONFIG.chunks.mainPathGap).toBe('number');
        expect(CONFIG.chunks.mainPathGap).toBeGreaterThan(0);
    });
});
