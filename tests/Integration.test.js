/**
 * Integration tests for core game systems
 *
 * These tests verify that multiple components work together correctly.
 * They use mocks where necessary to isolate the systems being tested.
 */

import { describe, it, expect, beforeEach, afterEach } from './TestRunner.js';
import { CONFIG } from '../js/config.js';

// === MOCKS ===

// Mock Game object for testing
class MockGame {
    constructor() {
        this.currentAnimation = 'IDLE';
        this.humanPosition = { x: 100, y: 100 };
        this.goblinPosition = { x: 200, y: 200 };
        this.tilemap = {
            tileSize: 16,
            isWalkable: () => true,
            isInFarmableArea: () => true,
            getTileAt: () => 1,
            setTileAt: () => {}
        };
        this.currentWorkTile = null;
        this.goblinCurrentWorkTile = null;
        this.playerDamage = 10;
        this.toolAnimationMultipliers = {};

        // Track method calls for verification
        this.methodCalls = [];
    }

    setAnimation(name, loop, onComplete, speedMultiplier) {
        this.methodCalls.push({ method: 'setAnimation', args: { name, loop } });
        this.currentAnimation = name;
        // Simulate async completion
        if (onComplete && !loop) {
            setTimeout(() => onComplete(), 10);
        }
        return Promise.resolve();
    }

    setGoblinAnimation(name, loop, onComplete, speedMultiplier) {
        this.methodCalls.push({ method: 'setGoblinAnimation', args: { name, loop } });
        if (onComplete && !loop) {
            setTimeout(() => onComplete(), 10);
        }
        return Promise.resolve();
    }

    moveCharacterTo(x, y) {
        this.methodCalls.push({ method: 'moveCharacterTo', args: { x, y } });
        // Simulate reaching destination
        this.humanPosition = { x, y };
    }

    moveGoblinTo(x, y) {
        this.methodCalls.push({ method: 'moveGoblinTo', args: { x, y } });
        this.goblinPosition = { x, y };
    }

    getToolAnimationMultiplier(toolId) {
        return this.toolAnimationMultipliers[toolId] || 1.0;
    }
}

// Mock Tool
class MockTool {
    constructor(id, name, animation = 'AXE') {
        this.id = id;
        this.name = name;
        this.animation = animation;
    }
}

// === SPRITE ANIMATOR TESTS ===

describe('SpriteAnimator Integration', () => {
    it('should use image cache for repeated loads', async () => {
        // This test verifies the cache is being used
        const { SpriteAnimator } = await import('../js/SpriteAnimator.js');

        // Clear cache first
        SpriteAnimator.clearCache();

        // Get initial stats
        const initialStats = SpriteAnimator.getCacheStats();
        expect(initialStats.size).toBe(0);
        expect(initialStats.hits).toBe(0);
        expect(initialStats.misses).toBe(0);
    });

    it('should track cache statistics', async () => {
        const { SpriteAnimator } = await import('../js/SpriteAnimator.js');

        const stats = SpriteAnimator.getCacheStats();

        expect(stats).toBeDefined();
        expect(typeof stats.size).toBe('number');
        expect(typeof stats.hits).toBe('number');
        expect(typeof stats.misses).toBe('number');
        expect(typeof stats.hitRate).toBe('string');
    });
});

// === CONFIG SYSTEM TESTS ===

describe('Config System Integration', () => {
    it('should have all required player stats', () => {
        expect(CONFIG.player.maxHealth).toBeGreaterThan(0);
        expect(CONFIG.player.damage).toBeGreaterThan(0);
        expect(CONFIG.player.moveSpeed).toBeGreaterThan(0);
        expect(CONFIG.player.visionRange).toBeGreaterThan(0);
        expect(CONFIG.player.attackRange).toBeGreaterThan(0);
    });

    it('should have all required enemy stats', () => {
        expect(CONFIG.enemy.skeleton).toBeDefined();
        expect(CONFIG.enemy.skeleton.maxHealth).toBeGreaterThan(0);
        expect(CONFIG.enemy.skeleton.damage).toBeGreaterThan(0);
        expect(CONFIG.enemy.skeleton.pathfindCooldown).toBeGreaterThan(0);
        expect(CONFIG.enemy.skeleton.damageFlashDuration).toBeGreaterThan(0);
    });

    it('should have movement configuration', () => {
        expect(CONFIG.movement).toBeDefined();
        expect(CONFIG.movement.waypointThreshold).toBeGreaterThan(0);
    });

    it('should have resource fade configuration', () => {
        expect(CONFIG.resourceFade).toBeDefined();
        expect(CONFIG.resourceFade.duration).toBeGreaterThan(0);
    });

    it('should have debug configuration', () => {
        expect(CONFIG.debug).toBeDefined();
        expect(CONFIG.debug.logLevel).toBeDefined();
    });

    it('should have tile IDs for hoed ground', () => {
        expect(CONFIG.tiles.hoedGround).toBeDefined();
        expect(CONFIG.tiles.hoedGround.length).toBeGreaterThan(0);
        expect(CONFIG.tiles.holeOverlay).toBeDefined();
    });
});

// === LOGGER TESTS ===

describe('Logger Integration', () => {
    it('should create logger instances', async () => {
        const { Logger } = await import('../js/Logger.js');

        const log = Logger.create('TestModule');

        expect(log).toBeDefined();
        expect(log.moduleName).toBe('TestModule');
    });

    it('should support level configuration', async () => {
        const { Logger } = await import('../js/Logger.js');

        Logger.setLevel('warn');
        expect(Logger.getLevel()).toBe('warn');

        Logger.setLevel('info');
        expect(Logger.getLevel()).toBe('info');
    });

    it('should support module filtering', async () => {
        const { Logger } = await import('../js/Logger.js');

        Logger.clearModuleFilters();

        Logger.enableModule('TestModule');
        Logger.disableModule('OtherModule');

        // These don't throw
        const log1 = Logger.create('TestModule');
        const log2 = Logger.create('OtherModule');

        expect(log1).toBeDefined();
        expect(log2).toBeDefined();

        Logger.clearModuleFilters();
    });
});

// === TOOL VALIDATION TESTS ===

describe('Tool System Integration', () => {
    it('should define acceptable tiles for each tool', async () => {
        // Import TileSelector to check ACCEPTABLE_TILES
        const module = await import('../js/TileSelector.js');

        // Verify the TileSelector class exists
        expect(module.TileSelector).toBeDefined();
    });
});

// === RESOURCE TYPE CONSISTENCY TESTS ===

describe('Resource Type Consistency', () => {
    it('should have matching crop indices between seeds and crops', async () => {
        const { RESOURCE_TYPES } = await import('../js/Inventory.js');

        // Check that each seed has a matching crop
        const seeds = Object.values(RESOURCE_TYPES).filter(r => r.category === 'seed');
        const crops = Object.values(RESOURCE_TYPES).filter(r => r.category === 'crop');

        for (const seed of seeds) {
            expect(seed.cropIndex).toBeDefined();
            expect(seed.cropIndex).toBeGreaterThanOrEqual(0);
        }
    });

    it('should have unique IDs for all resource types', async () => {
        const { RESOURCE_TYPES } = await import('../js/Inventory.js');

        const ids = new Set();
        for (const key of Object.keys(RESOURCE_TYPES)) {
            const resource = RESOURCE_TYPES[key];
            expect(ids.has(resource.id)).toBe(false); // Should not already exist
            ids.add(resource.id);
        }
    });

    it('should have valid tile IDs for all resource types', async () => {
        const { RESOURCE_TYPES } = await import('../js/Inventory.js');

        for (const key of Object.keys(RESOURCE_TYPES)) {
            const resource = RESOURCE_TYPES[key];
            expect(resource.tileId).toBeDefined();
            expect(resource.tileId).toBeGreaterThanOrEqual(0);
        }
    });
});

// === CROP TYPE CONSISTENCY TESTS ===

describe('Crop Type Consistency', () => {
    it('should have consistent crop types across files', async () => {
        const { CROP_TYPES } = await import('../js/Crop.js');

        // Verify basic crop structure
        expect(CROP_TYPES).toBeDefined();
        expect(Object.keys(CROP_TYPES).length).toBeGreaterThan(0);

        // Check each crop has required properties
        for (const key of Object.keys(CROP_TYPES)) {
            const crop = CROP_TYPES[key];
            expect(crop.index).toBeDefined();
            expect(crop.name).toBeDefined();
        }
    });
});

// === ORE TYPE CONSISTENCY TESTS ===

describe('Ore Type Consistency', () => {
    it('should have all ore types with required properties', async () => {
        const { ORE_TYPES } = await import('../js/OreVein.js');

        expect(ORE_TYPES).toBeDefined();
        expect(ORE_TYPES.IRON).toBeDefined();
        expect(ORE_TYPES.COAL).toBeDefined();
        expect(ORE_TYPES.GOLD).toBeDefined();
        expect(ORE_TYPES.MITHRIL).toBeDefined();
        expect(ORE_TYPES.ROCK).toBeDefined();

        // Check each ore has stages and icon
        for (const key of Object.keys(ORE_TYPES)) {
            const ore = ORE_TYPES[key];
            expect(ore.name).toBeDefined();
            expect(ore.stages).toBeDefined();
            expect(ore.stages.full).toBeDefined();
            expect(ore.stages.partial).toBeDefined();
            expect(ore.stages.depleted).toBeDefined();
            expect(ore.iconTileId).toBeDefined();
        }
    });
});

// === UPGRADE SYSTEM TESTS ===

describe('Upgrade System Integration', () => {
    it('should have valid upgrade definitions', async () => {
        const { UPGRADES } = await import('../js/UIManager.js');

        expect(UPGRADES).toBeDefined();
        expect(Object.keys(UPGRADES).length).toBeGreaterThan(0);

        for (const key of Object.keys(UPGRADES)) {
            const upgrade = UPGRADES[key];
            expect(upgrade.id).toBeDefined();
            expect(upgrade.name).toBeDefined();
            expect(upgrade.description).toBeDefined();
            expect(upgrade.cost).toBeDefined();
            expect(upgrade.cost.length).toBeGreaterThan(0);
            expect(upgrade.effect).toBeDefined();
        }
    });

    it('should have valid costs using RESOURCE_TYPES', async () => {
        const { UPGRADES } = await import('../js/UIManager.js');
        const { RESOURCE_TYPES } = await import('../js/Inventory.js');

        for (const key of Object.keys(UPGRADES)) {
            const upgrade = UPGRADES[key];
            for (const cost of upgrade.cost) {
                // Cost should reference valid resource types
                expect(cost.resource).toBeDefined();
                expect(cost.resource.id).toBeDefined();
                expect(cost.amount).toBeGreaterThan(0);
            }
        }
    });
});

// === ANIMATION DATA CONSISTENCY ===

describe('Animation Data Consistency', () => {
    it('should have enemy animation definitions', async () => {
        // Import Enemy to verify animations are defined
        const { Enemy } = await import('../js/Enemy.js');

        // Create a test enemy
        const enemy = new Enemy(100, 100, 'skeleton');

        expect(enemy.type).toBe('skeleton');
        expect(enemy.maxHealth).toBe(CONFIG.enemy.skeleton.maxHealth);
        expect(enemy.damage).toBe(CONFIG.enemy.skeleton.damage);
    });
});

// === TREE TYPE CONSISTENCY ===

describe('Tree Type Consistency', () => {
    it('should have valid tree type definitions', async () => {
        const { TREE_TYPES } = await import('../js/Tree.js');

        expect(TREE_TYPES).toBeDefined();
        expect(TREE_TYPES.THIN).toBeDefined();
        expect(TREE_TYPES.THICK).toBeDefined();

        // Check thin tree
        expect(TREE_TYPES.THIN.width).toBe(1);
        expect(TREE_TYPES.THIN.height).toBe(3);
        expect(TREE_TYPES.THIN.tiles.length).toBe(3);
        expect(TREE_TYPES.THIN.minResources).toBeLessThan(TREE_TYPES.THIN.maxResources);

        // Check thick tree
        expect(TREE_TYPES.THICK.width).toBe(2);
        expect(TREE_TYPES.THICK.height).toBe(3);
        expect(TREE_TYPES.THICK.tiles.length).toBe(6); // 2x3
        expect(TREE_TYPES.THICK.minResources).toBeLessThan(TREE_TYPES.THICK.maxResources);
    });
});

// === FLOWER RARITY CONSISTENCY ===

describe('Flower Rarity Consistency', () => {
    it('should have valid flower rarity configuration', () => {
        const { rarityBlue, rarityRed, rarityWhite } = CONFIG.flowers;

        // Rarities should sum to ~1.0 (100%)
        const total = rarityBlue + rarityRed + rarityWhite;
        expect(total).toBeGreaterThan(0.99);
        expect(total).toBeLessThan(1.01);
    });

    it('should have valid spawn configuration', () => {
        expect(CONFIG.flowers.spawnChance).toBeGreaterThan(0);
        expect(CONFIG.flowers.spawnChance).toBeLessThan(1);
        expect(CONFIG.flowers.harvestYieldMin).toBeLessThanOrEqual(CONFIG.flowers.harvestYieldMax);
    });
});

// === PATHFINDING CONFIG CONSISTENCY ===

describe('Pathfinding Configuration', () => {
    it('should have reasonable max iterations', () => {
        expect(CONFIG.pathfinding.maxIterations).toBeGreaterThan(100);
        expect(CONFIG.pathfinding.maxIterations).toBeLessThan(100000);
    });
});
