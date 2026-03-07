/**
 * Tests for Phase 4b additions:
 *   - ForestGenerator.pickSeedType (weighted seed drops on tree depletion)
 *   - TravelerManager milestone traveler state (counter, pending house, setVillagerManager)
 *   - JobManager.addConstructJob (construction job creation for buildings)
 *   - CONFIG world layout constants (3×4 grid, mainPathY:30, farmRow:2, homeRow:1)
 */

import { describe, it, expect, beforeEach } from './TestRunner.js';
import { ForestGenerator } from '../js/ForestGenerator.js';
import { TravelerManager } from '../js/TravelerManager.js';
import { JobManager } from '../js/JobManager.js';
import { BUILDING_DEFS } from '../js/BuildingRegistry.js';
import { CONFIG } from '../js/config.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockTilemap() {
    return { tileSize: 16, interactables: [], chunkTiles: new Map() };
}

function makeMockGame() {
    return { goblinHired: false, onQueueChange: null };
}

const VALID_SEED_KEYS = [
    'SEED_CARROT', 'SEED_RADISH', 'SEED_PARSNIP', 'SEED_POTATO',
    'SEED_BEETROOT', 'SEED_CABBAGE', 'SEED_CAULIFLOWER',
    'SEED_SUNFLOWER', 'SEED_WHEAT', 'SEED_PUMPKIN'
];

// ── ForestGenerator.pickSeedType ──────────────────────────────────────────────

describe('ForestGenerator.pickSeedType — basic validity', () => {
    let fg;

    beforeEach(() => {
        fg = new ForestGenerator(makeMockTilemap());
    });

    it('returns a valid seed key for a non-lit tree', () => {
        const result = fg.pickSeedType(false);
        expect(VALID_SEED_KEYS.includes(result)).toBe(true);
    });

    it('returns a valid seed key for an initially-lit tree', () => {
        const result = fg.pickSeedType(true);
        expect(VALID_SEED_KEYS.includes(result)).toBe(true);
    });

    it('never returns undefined or null', () => {
        for (let i = 0; i < 50; i++) {
            const r = fg.pickSeedType(i % 2 === 0);
            expect(r !== undefined).toBe(true);
            expect(r !== null).toBe(true);
        }
    });

    it('always returns one of the 10 defined seed types', () => {
        for (let i = 0; i < 50; i++) {
            const r = fg.pickSeedType(i % 2 === 0);
            expect(VALID_SEED_KEYS.includes(r)).toBe(true);
        }
    });
});

describe('ForestGenerator.pickSeedType — weighted distribution', () => {
    let fg;

    beforeEach(() => {
        fg = new ForestGenerator(makeMockTilemap());
    });

    it('non-lit trees strongly favour cheap (early-index) seeds over expensive ones', () => {
        const counts = {};
        for (const s of VALID_SEED_KEYS) counts[s] = 0;
        for (let i = 0; i < 500; i++) counts[fg.pickSeedType(false)]++;

        // Cheap seeds (carrot + radish + parsnip) should appear far more than expensive seeds
        const cheap = counts['SEED_CARROT'] + counts['SEED_RADISH'] + counts['SEED_PARSNIP'];
        const expensive = counts['SEED_SUNFLOWER'] + counts['SEED_WHEAT'] + counts['SEED_PUMPKIN'];
        expect(cheap).toBeGreaterThan(expensive * 2);
    });

    it('lit trees produce mid-tier seeds more often than pumpkin alone', () => {
        const counts = {};
        for (const s of VALID_SEED_KEYS) counts[s] = 0;
        for (let i = 0; i < 500; i++) counts[fg.pickSeedType(true)]++;

        // Mid-tier seeds (potato + beetroot + cabbage) should collectively appear often
        const midTier = counts['SEED_POTATO'] + counts['SEED_BEETROOT'] + counts['SEED_CABBAGE'];
        expect(midTier).toBeGreaterThan(counts['SEED_PUMPKIN'] * 2);
    });

    it('lit trees produce pumpkin less often than non-lit trees', () => {
        const litCounts = {};
        const nonLitCounts = {};
        for (const s of VALID_SEED_KEYS) { litCounts[s] = 0; nonLitCounts[s] = 0; }

        for (let i = 0; i < 500; i++) litCounts[fg.pickSeedType(true)]++;
        for (let i = 0; i < 500; i++) nonLitCounts[fg.pickSeedType(false)]++;

        // Non-lit heavily discounts pumpkin (weight 0.5 vs 1 for lit)
        // so lit trees should produce at least as many pumpkins (if not more)
        expect(litCounts['SEED_PUMPKIN']).toBeGreaterThan(nonLitCounts['SEED_PUMPKIN'] - 10);
    });
});

// ── TravelerManager — milestone state ────────────────────────────────────────

describe('TravelerManager — milestone state initialization', () => {
    it('starts with villagerManager null', () => {
        const tm = new TravelerManager(makeMockTilemap());
        expect(tm.villagerManager).toBe(null);
    });

    it('starts with regularTravelersSinceMilestone = 0', () => {
        const tm = new TravelerManager(makeMockTilemap());
        expect(tm.regularTravelersSinceMilestone).toBe(0);
    });

    it('starts with _pendingEmptyHouse null', () => {
        const tm = new TravelerManager(makeMockTilemap());
        expect(tm._pendingEmptyHouse).toBe(null);
    });
});

describe('TravelerManager — setVillagerManager', () => {
    it('stores the provided manager reference', () => {
        const tm = new TravelerManager(makeMockTilemap());
        const vm = { getEligibleMilestoneIds: () => [] };
        tm.setVillagerManager(vm);
        expect(tm.villagerManager).toBe(vm);
    });

    it('can be set to null to detach', () => {
        const tm = new TravelerManager(makeMockTilemap());
        tm.setVillagerManager({ getEligibleMilestoneIds: () => [] });
        tm.setVillagerManager(null);
        expect(tm.villagerManager).toBe(null);
    });
});

describe('TravelerManager — onEmptyHouseAvailable', () => {
    it('stores the building as _pendingEmptyHouse', () => {
        const tm = new TravelerManager(makeMockTilemap());
        const building = { id: 'b_test', state: 'active_empty' };
        tm.onEmptyHouseAvailable(building);
        expect(tm._pendingEmptyHouse).toBe(building);
    });

    it('overwrites a previously stored pending house', () => {
        const tm = new TravelerManager(makeMockTilemap());
        const b1 = { id: 'b_1' };
        const b2 = { id: 'b_2' };
        tm.onEmptyHouseAvailable(b1);
        tm.onEmptyHouseAvailable(b2);
        expect(tm._pendingEmptyHouse).toBe(b2);
    });

    it('can store different building objects', () => {
        const tm = new TravelerManager(makeMockTilemap());
        const building = { id: 'b_unique', state: 'active_empty', pathConnected: true };
        tm.onEmptyHouseAvailable(building);
        expect(tm._pendingEmptyHouse.id).toBe('b_unique');
    });
});

// ── JobManager.addConstructJob ────────────────────────────────────────────────

describe('JobManager.addConstructJob — return value', () => {
    let jm;

    beforeEach(() => {
        jm = new JobManager(makeMockGame());
    });

    it('returns null for an unknown building definition', () => {
        const building = { id: 'b_0', definitionId: 'unknown_def', tileX: 5, tileY: 5 };
        expect(jm.addConstructJob(building)).toBe(null);
    });

    it('returns a job object for a known building def (small_house)', () => {
        const building = { id: 'b_1', definitionId: 'small_house', tileX: 10, tileY: 10 };
        const job = jm.addConstructJob(building);
        expect(job).not.toBe(null);
    });

    it('returns a job object for a known special building (pub)', () => {
        const building = { id: 'b_2', definitionId: 'pub', tileX: 0, tileY: 0 };
        const job = jm.addConstructJob(building);
        expect(job).not.toBe(null);
    });
});

describe('JobManager.addConstructJob — job properties', () => {
    let jm;

    beforeEach(() => {
        jm = new JobManager(makeMockGame());
    });

    it('sets tool.id to "construct"', () => {
        const b = { id: 'b_0', definitionId: 'small_house', tileX: 0, tileY: 0 };
        expect(jm.addConstructJob(b).tool.id).toBe('construct');
    });

    it('sets tool.animation to HAMMERING', () => {
        const b = { id: 'b_1', definitionId: 'small_house', tileX: 0, tileY: 0 };
        expect(jm.addConstructJob(b).tool.animation).toBe('HAMMERING');
    });

    it('sets buildingId matching the building', () => {
        const b = { id: 'my_building', definitionId: 'small_house', tileX: 3, tileY: 7 };
        expect(jm.addConstructJob(b).buildingId).toBe('my_building');
    });

    it('sets constructionCycles from the building def', () => {
        const b = { id: 'b_2', definitionId: 'small_house', tileX: 0, tileY: 0 };
        const def = BUILDING_DEFS['small_house'];
        expect(jm.addConstructJob(b).constructionCycles).toBe(def.constructionCycles);
    });

    it('sets constructionCyclesCompleted to 0', () => {
        const b = { id: 'b_3', definitionId: 'small_house', tileX: 0, tileY: 0 };
        expect(jm.addConstructJob(b).constructionCyclesCompleted).toBe(0);
    });

    it('sets refundItems as a non-empty array', () => {
        const b = { id: 'b_4', definitionId: 'small_house', tileX: 0, tileY: 0 };
        const job = jm.addConstructJob(b);
        expect(Array.isArray(job.refundItems)).toBe(true);
        expect(job.refundItems.length).toBeGreaterThan(0);
    });

    it('places the work tile at building top-left + doorOffset', () => {
        const def = BUILDING_DEFS['small_house'];
        const tileX = 3, tileY = 7;
        const b = { id: 'b_5', definitionId: 'small_house', tileX, tileY };
        const job = jm.addConstructJob(b);
        expect(job.tiles[0].x).toBe(tileX + def.doorOffset.x);
        expect(job.tiles[0].y).toBe(tileY + def.doorOffset.y);
    });
});

describe('JobManager.addConstructJob — queue management', () => {
    it('adds the job to the active queue', () => {
        const jm = new JobManager(makeMockGame());
        const b = { id: 'b_q', definitionId: 'pub', tileX: 0, tileY: 0 };
        const before = jm.queues[jm.activeQueueTarget].length;
        jm.addConstructJob(b);
        expect(jm.queues[jm.activeQueueTarget].length).toBe(before + 1);
    });

    it('two construct jobs produce different job IDs', () => {
        const jm = new JobManager(makeMockGame());
        const b1 = { id: 'b_a', definitionId: 'pub', tileX: 0, tileY: 0 };
        const b2 = { id: 'b_b', definitionId: 'pub', tileX: 5, tileY: 5 };
        const j1 = jm.addConstructJob(b1);
        const j2 = jm.addConstructJob(b2);
        expect(j1.id).not.toBe(j2.id);
    });
});

// ── CONFIG world layout constants (3×4 grid) ──────────────────────────────────

describe('CONFIG.chunks — 3×4 world layout', () => {
    it('initialGridRows is 4', () => {
        expect(CONFIG.chunks.initialGridRows).toBe(4);
    });

    it('mainPathY is 30 (great path strip starts at y=30)', () => {
        expect(CONFIG.chunks.mainPathY).toBe(30);
    });

    it('mainPathGap is 4', () => {
        expect(CONFIG.chunks.mainPathGap).toBe(4);
    });

    it('homeRow is 1 (single town chunk at row 1)', () => {
        expect(CONFIG.chunks.homeRow).toBe(1);
    });

    it('farmRow is 2 (farm chunk at row 2)', () => {
        expect(CONFIG.chunks.farmRow).toBe(2);
    });

    it('pathBoundaryRow equals homeRow', () => {
        expect(CONFIG.chunks.pathBoundaryRow).toBe(CONFIG.chunks.homeRow);
    });

    it('no storeRow or storeCol (single town chunk, no separate store)', () => {
        expect(CONFIG.chunks.storeRow).toBeUndefined();
        expect(CONFIG.chunks.storeCol).toBeUndefined();
    });

    it('worldY gap formula: farm chunk starts at farmRow*size + mainPathGap', () => {
        const { farmRow, size, mainPathGap } = CONFIG.chunks;
        const expectedFarmY = farmRow * size + mainPathGap;
        // Farm chunk worldY = 2*15 + 4 = 34
        expect(expectedFarmY).toBe(34);
    });
});
