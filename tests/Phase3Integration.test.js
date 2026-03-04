/**
 * Integration tests for Phase 3 additions:
 *   - New inventory resource types (flower colors, potions)
 *   - Recipe data structures (CAULDRON, ANVIL, SHRINE)
 *   - CropManager growth-speed multiplier (shrine upgrade)
 *   - JobManager craft job creation and cancel-refund
 *   - IdleManager fill_well activity evaluation
 */

import { describe, it, expect, beforeEach } from './TestRunner.js';
import { Inventory, RESOURCE_TYPES } from '../js/Inventory.js';
import { CAULDRON_RECIPES, ANVIL_RECIPES, SHRINE_RECIPES, UPGRADES } from '../js/UIManager.js';
import { CropManager } from '../js/CropManager.js';
import { JobManager } from '../js/JobManager.js';
import { IdleManager } from '../js/IdleManager.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal mock game sufficient for JobManager to construct without throwing. */
function makeMockGame() {
    const inventory = new Inventory();
    inventory.addGold(100);
    return {
        inventory,
        wateringCanWater: 20,
        wateringCanMaxWater: 20,
        goblinWaterCanWater: 20,
        goblinWaterCanMaxWater: 20,
        humanPosition: { x: 272, y: 880 },
        goblinPosition: { x: 352, y: 624 },
        currentPath: null,
        currentWorkTile: null,
        goblinCurrentPath: null,
        goblinCurrentWorkTile: null,
        playerDamage: 10,
        toolAnimationMultipliers: {},
        well: null,
        idleManager: null,
        overlayManager: null,
        tilemap: { tileSize: 16 },
        homeUpgrades: {
            slots: [null],
            shrineUpgrades: { fertileSoilLevel: 0, bountifulHarvest: false, roadsideReplenishment: false },
            purchasedToolUpgrades: new Set()
        },
        setAnimation(name, loop, cb) {},
        setGoblinAnimation(name, loop, cb) {},
        moveCharacterTo(x, y) { this.humanPosition = { x, y }; },
        moveGoblinTo(x, y) { this.goblinPosition = { x, y }; },
        moveCharacterToTile(x, y) {},
        moveGoblinToTile(x, y) {},
        getToolAnimationMultiplier(id) { return this.toolAnimationMultipliers[id] ?? 1.0; },
        applyCraftingEffect() {},
        _refreshWellMenuStatus() {},
        findPath() { return null; }
    };
}

/** Create a JobManager with both workers registered. */
function makeJobManager(game) {
    const jm = new JobManager(game ?? makeMockGame());
    jm.registerWorker('human');
    jm.registerWorker('goblin');
    return jm;
}

// ── New RESOURCE_TYPES — flower colors ────────────────────────────────────────

describe('RESOURCE_TYPES — Phase 3 flower color types', () => {
    it('should define FLOWER_BLUE with flower category', () => {
        expect(RESOURCE_TYPES.FLOWER_BLUE).toBeDefined();
        expect(RESOURCE_TYPES.FLOWER_BLUE.category).toBe('flower');
        expect(RESOURCE_TYPES.FLOWER_BLUE.id).toBe('flower_blue');
        expect(RESOURCE_TYPES.FLOWER_BLUE.sell_price).toBeGreaterThan(0);
    });

    it('should define FLOWER_RED with flower category', () => {
        expect(RESOURCE_TYPES.FLOWER_RED).toBeDefined();
        expect(RESOURCE_TYPES.FLOWER_RED.category).toBe('flower');
        expect(RESOURCE_TYPES.FLOWER_RED.id).toBe('flower_red');
    });

    it('should define FLOWER_WHITE with flower category', () => {
        expect(RESOURCE_TYPES.FLOWER_WHITE).toBeDefined();
        expect(RESOURCE_TYPES.FLOWER_WHITE.category).toBe('flower');
        expect(RESOURCE_TYPES.FLOWER_WHITE.id).toBe('flower_white');
    });

    it('should include flower color types in the flower category query', () => {
        const inv = new Inventory();
        inv.add(RESOURCE_TYPES.FLOWER_BLUE, 1);
        inv.add(RESOURCE_TYPES.FLOWER_RED, 2);

        const flowers = inv.getByCategory('flower');
        const ids = flowers.map(f => f.resource.id);
        expect(ids).toContain('flower_blue');
        expect(ids).toContain('flower_red');
    });
});

// ── New RESOURCE_TYPES — potions ─────────────────────────────────────────────

describe('RESOURCE_TYPES — Phase 3 potion types', () => {
    it('should define MINOR_HEALTH_POTION with potion category', () => {
        expect(RESOURCE_TYPES.MINOR_HEALTH_POTION).toBeDefined();
        expect(RESOURCE_TYPES.MINOR_HEALTH_POTION.category).toBe('potion');
        expect(RESOURCE_TYPES.MINOR_HEALTH_POTION.sell_price).toBeGreaterThan(0);
    });

    it('should define STAMINA_TONIC with potion category', () => {
        expect(RESOURCE_TYPES.STAMINA_TONIC).toBeDefined();
        expect(RESOURCE_TYPES.STAMINA_TONIC.category).toBe('potion');
    });

    it('should define GROWTH_ELIXIR with potion category', () => {
        expect(RESOURCE_TYPES.GROWTH_ELIXIR).toBeDefined();
        expect(RESOURCE_TYPES.GROWTH_ELIXIR.category).toBe('potion');
    });

    it('should define VITALITY_BREW with potion category', () => {
        expect(RESOURCE_TYPES.VITALITY_BREW).toBeDefined();
        expect(RESOURCE_TYPES.VITALITY_BREW.category).toBe('potion');
    });

    it('should return potions via getByCategory("potion")', () => {
        const inv = new Inventory();
        inv.add(RESOURCE_TYPES.MINOR_HEALTH_POTION, 1);
        inv.add(RESOURCE_TYPES.GROWTH_ELIXIR, 3);

        const potions = inv.getByCategory('potion');
        expect(potions.length).toBe(2);
        expect(potions.some(p => p.resource.id === 'minor_health_potion')).toBe(true);
        expect(potions.some(p => p.resource.id === 'growth_elixir')).toBe(true);
    });

    it('should have sell prices in ascending order by tier', () => {
        const minor = RESOURCE_TYPES.MINOR_HEALTH_POTION.sell_price;
        const stamina = RESOURCE_TYPES.STAMINA_TONIC.sell_price;
        const growth = RESOURCE_TYPES.GROWTH_ELIXIR.sell_price;
        const vitality = RESOURCE_TYPES.VITALITY_BREW.sell_price;
        expect(minor).toBeLessThan(stamina);
        expect(stamina).toBeLessThan(growth);
        expect(growth).toBeLessThan(vitality);
    });

    it('should have unique IDs for all potion types', () => {
        const ids = [
            RESOURCE_TYPES.MINOR_HEALTH_POTION.id,
            RESOURCE_TYPES.STAMINA_TONIC.id,
            RESOURCE_TYPES.GROWTH_ELIXIR.id,
            RESOURCE_TYPES.VITALITY_BREW.id
        ];
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
    });
});

// ── CAULDRON_RECIPES ──────────────────────────────────────────────────────────

describe('CAULDRON_RECIPES structure', () => {
    it('should export 4 cauldron recipes', () => {
        expect(Array.isArray(CAULDRON_RECIPES)).toBe(true);
        expect(CAULDRON_RECIPES.length).toBe(4);
    });

    it('should have required fields on every recipe', () => {
        for (const recipe of CAULDRON_RECIPES) {
            expect(recipe.id).toBeDefined();
            expect(recipe.name).toBeDefined();
            expect(recipe.craftingCycles).toBeGreaterThan(0);
            expect(Array.isArray(recipe.ingredients)).toBe(true);
            expect(recipe.ingredients.length).toBeGreaterThan(0);
            expect(recipe.output).toBeDefined();
        }
    });

    it('should have unique recipe ids', () => {
        const ids = CAULDRON_RECIPES.map(r => r.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('every ingredient should reference a valid RESOURCE_TYPES entry', () => {
        const validIds = new Set(Object.values(RESOURCE_TYPES).map(r => r.id));
        for (const recipe of CAULDRON_RECIPES) {
            for (const ing of recipe.ingredients) {
                expect(ing.resource).toBeDefined();
                expect(validIds.has(ing.resource.id)).toBe(true);
                expect(ing.amount).toBeGreaterThan(0);
            }
        }
    });

    it('every output should reference a valid RESOURCE_TYPES entry', () => {
        const validIds = new Set(Object.values(RESOURCE_TYPES).map(r => r.id));
        for (const recipe of CAULDRON_RECIPES) {
            expect(validIds.has(recipe.output.id)).toBe(true);
            expect(recipe.output.category).toBe('potion');
        }
    });
});

// ── ANVIL_RECIPES ─────────────────────────────────────────────────────────────

describe('ANVIL_RECIPES structure', () => {
    it('should export the same number of recipes as UPGRADES', () => {
        expect(Array.isArray(ANVIL_RECIPES)).toBe(true);
        expect(ANVIL_RECIPES.length).toBe(Object.keys(UPGRADES).length);
    });

    it('should have required fields on every recipe', () => {
        for (const recipe of ANVIL_RECIPES) {
            expect(recipe.id).toBeDefined();
            expect(recipe.name).toBeDefined();
            expect(recipe.craftingCycles).toBeGreaterThan(0);
            expect(Array.isArray(recipe.ingredients)).toBe(true);
            expect(recipe.ingredients.length).toBeGreaterThan(0);
        }
    });

    it('should mark every anvil recipe as one-time', () => {
        for (const recipe of ANVIL_RECIPES) {
            expect(recipe.oneTime).toBe(true);
        }
    });

    it('should use the same ids as the source UPGRADES', () => {
        const upgradeIds = new Set(Object.values(UPGRADES).map(u => u.id));
        for (const recipe of ANVIL_RECIPES) {
            expect(upgradeIds.has(recipe.id)).toBe(true);
        }
    });
});

// ── SHRINE_RECIPES ────────────────────────────────────────────────────────────

describe('SHRINE_RECIPES structure', () => {
    it('should export 4 shrine recipes', () => {
        expect(Array.isArray(SHRINE_RECIPES)).toBe(true);
        expect(SHRINE_RECIPES.length).toBe(4);
    });

    it('should have required fields on every recipe', () => {
        for (const recipe of SHRINE_RECIPES) {
            expect(recipe.id).toBeDefined();
            expect(recipe.name).toBeDefined();
            expect(recipe.craftingCycles).toBeGreaterThan(0);
            expect(recipe.description).toBeDefined();
            expect(Array.isArray(recipe.ingredients)).toBe(true);
            expect(recipe.ingredients.length).toBeGreaterThan(0);
        }
    });

    it('should include fertile_soil_1 and fertile_soil_2', () => {
        const ids = SHRINE_RECIPES.map(r => r.id);
        expect(ids).toContain('fertile_soil_1');
        expect(ids).toContain('fertile_soil_2');
    });

    it('should include bountiful_harvest and roadside_replenishment', () => {
        const ids = SHRINE_RECIPES.map(r => r.id);
        expect(ids).toContain('bountiful_harvest');
        expect(ids).toContain('roadside_replenishment');
    });

    it('fertile_soil_2 should require fertile_soil_1 as prerequisite', () => {
        const fs2 = SHRINE_RECIPES.find(r => r.id === 'fertile_soil_2');
        expect(fs2.prerequisite).toBe('fertile_soil_1');
    });

    it('every ingredient should reference a valid RESOURCE_TYPES entry', () => {
        const validIds = new Set(Object.values(RESOURCE_TYPES).map(r => r.id));
        for (const recipe of SHRINE_RECIPES) {
            for (const ing of recipe.ingredients) {
                expect(ing.resource).toBeDefined();
                expect(validIds.has(ing.resource.id)).toBe(true);
                expect(ing.amount).toBeGreaterThan(0);
            }
        }
    });
});

// ── CropManager growth-speed multiplier ───────────────────────────────────────

describe('CropManager._getGrowthSpeedMultiplier', () => {
    let cm;

    beforeEach(() => {
        cm = new CropManager({ tileSize: 16, getTileAt: () => 0, setTileAt: () => {} });
    });

    it('should return 1.0 when fertileSoilLevel is 0', () => {
        cm.setGame({ homeUpgrades: { shrineUpgrades: { fertileSoilLevel: 0 } } });
        expect(cm._getGrowthSpeedMultiplier()).toBe(1.0);
    });

    it('should return 1/0.85 (~1.176) when fertileSoilLevel is 1', () => {
        cm.setGame({ homeUpgrades: { shrineUpgrades: { fertileSoilLevel: 1 } } });
        // Level 1: −15% growth time means the timer advances 1/0.85× faster
        expect(cm._getGrowthSpeedMultiplier()).toBeCloseTo(1 / 0.85, 4);
    });

    it('should return 1/0.70 (~1.429) when fertileSoilLevel is 2', () => {
        cm.setGame({ homeUpgrades: { shrineUpgrades: { fertileSoilLevel: 2 } } });
        // Level 2: −30% growth time
        expect(cm._getGrowthSpeedMultiplier()).toBeCloseTo(1 / 0.70, 4);
    });

    it('should return 1.0 when game has no homeUpgrades', () => {
        cm.setGame({});
        expect(cm._getGrowthSpeedMultiplier()).toBe(1.0);
    });

    it('should return 1.0 when game reference is null', () => {
        cm.setGame(null);
        expect(cm._getGrowthSpeedMultiplier()).toBe(1.0);
    });

    it('level 2 multiplier should be greater than level 1 multiplier', () => {
        cm.setGame({ homeUpgrades: { shrineUpgrades: { fertileSoilLevel: 1 } } });
        const mult1 = cm._getGrowthSpeedMultiplier();

        cm.setGame({ homeUpgrades: { shrineUpgrades: { fertileSoilLevel: 2 } } });
        const mult2 = cm._getGrowthSpeedMultiplier();

        expect(mult2).toBeGreaterThan(mult1);
    });
});

// ── JobManager.addCraftJob ────────────────────────────────────────────────────

describe('JobManager.addCraftJob', () => {
    let game;
    let jm;

    beforeEach(() => {
        game = makeMockGame();
        jm = makeJobManager(game);
    });

    it('should return a job object', () => {
        const job = jm.addCraftJob('minor_health_potion', 3, []);
        expect(job).toBeDefined();
        expect(job.id).toBeDefined();
    });

    it('should set craftingRecipeId on the job', () => {
        const job = jm.addCraftJob('growth_elixir', 5, []);
        expect(job.craftingRecipeId).toBe('growth_elixir');
    });

    it('should set craftingCycles on the job', () => {
        const job = jm.addCraftJob('stamina_tonic', 4, []);
        expect(job.craftingCycles).toBe(4);
    });

    it('should initialize craftingCyclesCompleted to 0', () => {
        const job = jm.addCraftJob('minor_health_potion', 3, []);
        expect(job.craftingCyclesCompleted).toBe(0);
    });

    it('should store the provided refundItems on the job', () => {
        const refund = [
            { resource: RESOURCE_TYPES.CROP_CARROT, amount: 3 },
            { resource: RESOURCE_TYPES.FLOWER_RED,  amount: 2 }
        ];
        const job = jm.addCraftJob('minor_health_potion', 3, refund);
        expect(job.refundItems).toBe(refund);
    });

    it('should use the craft tool with id "craft"', () => {
        const job = jm.addCraftJob('stamina_tonic', 4, []);
        expect(job.tool.id).toBe('craft');
    });

    it('should target the house-front tile (17, 57)', () => {
        const job = jm.addCraftJob('minor_health_potion', 3, []);
        expect(job.tiles[0]).toEqual({ x: 17, y: 57 });
    });
});

// ── JobManager.cancelJob — ingredient refund ──────────────────────────────────

describe('JobManager.cancelJob refund', () => {
    let game;
    let jm;

    beforeEach(() => {
        game = makeMockGame();
        jm = makeJobManager(game);
    });

    it('should refund ingredients to inventory when canceling a craft job', () => {
        // Pre-add the inventory items that would have been deducted
        game.inventory.add(RESOURCE_TYPES.CROP_CARROT, 0); // ensure entry exists

        const refund = [
            { resource: RESOURCE_TYPES.CROP_CARROT, amount: 3 },
            { resource: RESOURCE_TYPES.FLOWER_RED,  amount: 2 }
        ];
        const job = jm.addCraftJob('minor_health_potion', 3, refund);

        const before_carrot = game.inventory.getCount(RESOURCE_TYPES.CROP_CARROT);
        const before_flower = game.inventory.getCount(RESOURCE_TYPES.FLOWER_RED);

        jm.cancelJob(job.id);

        expect(game.inventory.getCount(RESOURCE_TYPES.CROP_CARROT)).toBe(before_carrot + 3);
        expect(game.inventory.getCount(RESOURCE_TYPES.FLOWER_RED)).toBe(before_flower + 2);
    });

    it('should not refund if refundItems is null or empty', () => {
        const job = jm.addCraftJob('minor_health_potion', 3, null);
        const goldBefore = game.inventory.getGold();

        jm.cancelJob(job.id);

        // Inventory should be unchanged (no crash, no phantom refunds)
        expect(game.inventory.getGold()).toBe(goldBefore);
    });

    it('should return true when cancel succeeds', () => {
        const job = jm.addCraftJob('minor_health_potion', 3, []);
        expect(jm.cancelJob(job.id)).toBe(true);
    });

    it('should return false for an unknown job id', () => {
        expect(jm.cancelJob('nonexistent_job_id')).toBe(false);
    });
});

// ── JobManager.addJobToQueue ──────────────────────────────────────────────────

describe('JobManager.addJobToQueue', () => {
    let game;
    let jm;

    beforeEach(() => {
        game = makeMockGame();
        // plant jobs require a hoed tile and seeds; set up the mock accordingly
        game.overlayManager = { hoedTiles: new Set(['10,10', '1,1']), hasOverlay: () => false };
        game.inventory.add(RESOURCE_TYPES.SEED_CARROT, 5);
        jm = makeJobManager(game);
    });

    it('should add a job to the specified queue', () => {
        const tool = { id: 'plant', name: 'Plant', animation: 'DOING', seedType: 0, seedName: 'Carrot' };
        const tiles = [{ x: 10, y: 10 }];

        jm.addJobToQueue(tool, tiles, 'all');

        // The job should appear in the 'all' queue (or have been assigned to a worker)
        const queues = jm.getAllJobsByQueue();
        const allJobs = [...queues.all.queued, ...(queues.all.active ? [queues.all.active] : [])];
        const humanWorker = jm.workers.get('human');
        const jobExists = allJobs.some(j => j.tool.id === 'plant') ||
                          humanWorker?.currentJob?.tool.id === 'plant';
        expect(jobExists).toBe(true);
    });

    it('should return null for empty tile list', () => {
        const tool = { id: 'plant', name: 'Plant', animation: 'DOING' };
        const result = jm.addJobToQueue(tool, [], 'all');
        expect(result).toBeNull();
    });

    it('should set the correct tool on the returned job', () => {
        const tool = { id: 'plant', name: 'Plant', animation: 'DOING', seedType: 0, seedName: 'Carrot' };
        const job = jm.addJobToQueue(tool, [{ x: 1, y: 1 }], 'all');
        // job may be null if tryAssignJobs moved it to currentJob; check via workers
        const humanWorker = jm.workers.get('human');
        const activeJob = humanWorker?.currentJob;
        if (job) {
            expect(job.tool.id).toBe('plant');
        } else if (activeJob) {
            expect(activeJob.tool.id).toBe('plant');
        }
    });
});

// ── IdleManager fill_well evaluation ─────────────────────────────────────────

describe('IdleManager._evaluateActivity fill_well', () => {
    function makeIdleGame({ waterLevel = 20, wellExists = true } = {}) {
        return {
            humanPosition: { x: 272, y: 880 }, // tile (17, 55)
            tilemap: { tileSize: 16 },
            wateringCanWater: waterLevel,
            well: wellExists
                ? { getAdjacentServiceTile() { return { x: 23, y: 54 }; } }
                : null,
            findPath(x1, y1, x2, y2) {
                return [{ x: x1, y: y1 }, { x: x2, y: y2 }]; // 2-tile path
            }
        };
    }

    it('should return null when the watering can still has water', () => {
        const mgr = new IdleManager(makeIdleGame({ waterLevel: 10 }));
        const result = mgr._evaluateActivity('fill_well');
        expect(result).toBeNull();
    });

    it('should return null when the can is full', () => {
        const mgr = new IdleManager(makeIdleGame({ waterLevel: 20 }));
        const result = mgr._evaluateActivity('fill_well');
        expect(result).toBeNull();
    });

    it('should return null when no well exists', () => {
        const mgr = new IdleManager(makeIdleGame({ waterLevel: 0, wellExists: false }));
        const result = mgr._evaluateActivity('fill_well');
        expect(result).toBeNull();
    });

    it('should return null when findPath returns null (unreachable well)', () => {
        const game = makeIdleGame({ waterLevel: 0 });
        game.findPath = () => null;
        const mgr = new IdleManager(game);
        const result = mgr._evaluateActivity('fill_well');
        expect(result).toBeNull();
    });

    it('should return an evaluation result when can is empty and well is reachable', () => {
        const mgr = new IdleManager(makeIdleGame({ waterLevel: 0 }));
        const result = mgr._evaluateActivity('fill_well');
        expect(result).toBeDefined();
        expect(result).not.toBeNull();
        expect(result.item).toBeDefined();
        expect(result.item.tileX).toBe(23);
        expect(result.item.tileY).toBe(54);
        expect(result.pathLength).toBeGreaterThan(0);
    });

    it('should reflect the actual path length returned by findPath', () => {
        const game = makeIdleGame({ waterLevel: 0 });
        game.findPath = () => [1, 2, 3, 4, 5]; // 5-step path
        const mgr = new IdleManager(game);
        const result = mgr._evaluateActivity('fill_well');
        expect(result.pathLength).toBe(5);
    });
});
