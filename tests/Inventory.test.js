/**
 * Unit tests for Inventory system
 */

import { describe, it, expect, beforeEach } from './TestRunner.js';
import { Inventory, RESOURCE_TYPES, getResourceByCropIndex, getResourceByOreName } from '../js/Inventory.js';

describe('Inventory', () => {
    let inventory;

    beforeEach(() => {
        inventory = new Inventory();
    });

    // === Basic Operations ===

    it('should initialize with zero quantities for all resources', () => {
        expect(inventory.getCount(RESOURCE_TYPES.WOOD)).toBe(0);
        expect(inventory.getCount(RESOURCE_TYPES.GOLD)).toBe(0);
        expect(inventory.getCount(RESOURCE_TYPES.CROP_CARROT)).toBe(0);
    });

    it('should add resources correctly', () => {
        inventory.add(RESOURCE_TYPES.WOOD, 5);
        expect(inventory.getCount(RESOURCE_TYPES.WOOD)).toBe(5);

        inventory.add(RESOURCE_TYPES.WOOD, 3);
        expect(inventory.getCount(RESOURCE_TYPES.WOOD)).toBe(8);
    });

    it('should add 1 by default when amount not specified', () => {
        inventory.add(RESOURCE_TYPES.GOLD);
        expect(inventory.getCount(RESOURCE_TYPES.GOLD)).toBe(1);
    });

    it('should remove resources correctly', () => {
        inventory.add(RESOURCE_TYPES.WOOD, 10);
        const result = inventory.remove(RESOURCE_TYPES.WOOD, 3);

        expect(result).toBe(true);
        expect(inventory.getCount(RESOURCE_TYPES.WOOD)).toBe(7);
    });

    it('should fail to remove more than available', () => {
        inventory.add(RESOURCE_TYPES.WOOD, 5);
        const result = inventory.remove(RESOURCE_TYPES.WOOD, 10);

        expect(result).toBe(false);
        expect(inventory.getCount(RESOURCE_TYPES.WOOD)).toBe(5); // Unchanged
    });

    it('should check if player has enough resources', () => {
        inventory.add(RESOURCE_TYPES.GOLD, 100);

        expect(inventory.has(RESOURCE_TYPES.GOLD, 50)).toBe(true);
        expect(inventory.has(RESOURCE_TYPES.GOLD, 100)).toBe(true);
        expect(inventory.has(RESOURCE_TYPES.GOLD, 101)).toBe(false);
    });

    // === Gold Operations ===

    it('should add gold correctly', () => {
        inventory.addGold(50);
        expect(inventory.getGold()).toBe(50);

        inventory.addGold(25);
        expect(inventory.getGold()).toBe(75);
    });

    it('should spend gold correctly', () => {
        inventory.addGold(100);
        const result = inventory.spendGold(30);

        expect(result).toBe(true);
        expect(inventory.getGold()).toBe(70);
    });

    it('should fail to spend more gold than available', () => {
        inventory.addGold(50);
        const result = inventory.spendGold(100);

        expect(result).toBe(false);
        expect(inventory.getGold()).toBe(50); // Unchanged
    });

    // === Wood Operations ===

    it('should add wood correctly', () => {
        inventory.addWood(3);
        expect(inventory.getCount(RESOURCE_TYPES.WOOD)).toBe(3);
    });

    // === Crop Operations ===

    it('should add crops by index', () => {
        inventory.addCropByIndex(0, 5); // Carrot
        expect(inventory.getCount(RESOURCE_TYPES.CROP_CARROT)).toBe(5);

        inventory.addCropByIndex(2, 3); // Pumpkin
        expect(inventory.getCount(RESOURCE_TYPES.CROP_PUMPKIN)).toBe(3);
    });

    it('should handle invalid crop index gracefully', () => {
        const result = inventory.addCropByIndex(999, 1);
        expect(result).toBe(false);
    });

    // === Ore Operations ===

    it('should add ores by name', () => {
        inventory.addOreByName('Iron', 5);
        expect(inventory.getCount(RESOURCE_TYPES.ORE_IRON)).toBe(5);

        inventory.addOreByName('Gold', 3);
        expect(inventory.getCount(RESOURCE_TYPES.ORE_GOLD)).toBe(3);
    });

    it('should handle invalid ore name gracefully', () => {
        const result = inventory.addOreByName('FakeOre', 1);
        expect(result).toBe(false);
    });

    // === Category Queries ===

    it('should get items by category', () => {
        inventory.add(RESOURCE_TYPES.CROP_CARROT, 5);
        inventory.add(RESOURCE_TYPES.CROP_POTATO, 3);
        inventory.add(RESOURCE_TYPES.WOOD, 10);

        const crops = inventory.getByCategory('crop');

        expect(crops.length).toBe(2);
        expect(crops.some(item => item.resource.id === 'crop_carrot')).toBe(true);
        expect(crops.some(item => item.resource.id === 'crop_potato')).toBe(true);
    });

    it('should only return items with count > 0 in category', () => {
        inventory.add(RESOURCE_TYPES.CROP_CARROT, 5);
        // CROP_POTATO has 0 (default)

        const crops = inventory.getByCategory('crop');

        expect(crops.length).toBe(1);
        expect(crops[0].resource.id).toBe('crop_carrot');
    });

    it('should get all non-zero items', () => {
        inventory.add(RESOURCE_TYPES.WOOD, 5);
        inventory.add(RESOURCE_TYPES.ORE_IRON, 3);
        inventory.addGold(100);

        const allItems = inventory.getAllItems();

        expect(allItems.length).toBe(3);
    });

    // === Seed Operations ===

    it('should get seed by crop index', () => {
        const seed = inventory.getSeedByCropIndex(0); // Carrot seeds
        expect(seed).not.toBeNull();
        expect(seed.id).toBe('seed_carrot');
        expect(seed.cropIndex).toBe(0);
    });

    it('should return null for invalid crop index seed lookup', () => {
        const seed = inventory.getSeedByCropIndex(999);
        expect(seed).toBeNull();
    });

    it('should use seeds correctly', () => {
        const seed = RESOURCE_TYPES.SEED_CARROT;
        inventory.add(seed, 5);

        const result = inventory.useSeed(seed);

        expect(result).toBe(true);
        expect(inventory.getCount(seed)).toBe(4);
    });

    it('should fail to use seed when none available', () => {
        const seed = RESOURCE_TYPES.SEED_CARROT;
        // Don't add any seeds

        const result = inventory.useSeed(seed);

        expect(result).toBe(false);
    });

    it('should reject non-seed resources in useSeed', () => {
        inventory.add(RESOURCE_TYPES.WOOD, 5);

        const result = inventory.useSeed(RESOURCE_TYPES.WOOD);

        expect(result).toBe(false);
    });

    // === Change Callback ===

    it('should call onChange callback when adding', () => {
        let callCount = 0;
        inventory.onChange(() => callCount++);

        inventory.add(RESOURCE_TYPES.WOOD, 5);

        expect(callCount).toBe(1);
    });

    it('should call onChange callback when removing', () => {
        let callCount = 0;
        inventory.add(RESOURCE_TYPES.WOOD, 10);

        inventory.onChange(() => callCount++);
        inventory.remove(RESOURCE_TYPES.WOOD, 5);

        expect(callCount).toBe(1);
    });

    it('should not call onChange when removal fails', () => {
        let callCount = 0;
        inventory.onChange(() => callCount++);

        inventory.remove(RESOURCE_TYPES.WOOD, 5); // Will fail - no wood

        expect(callCount).toBe(0);
    });

    // === Edge Cases ===

    it('should handle null/undefined resource type gracefully in add', () => {
        const result = inventory.add(null, 5);
        expect(result).toBe(false);
    });

    it('should handle null/undefined resource type gracefully in remove', () => {
        const result = inventory.remove(undefined, 5);
        expect(result).toBe(false);
    });

    it('should handle null/undefined resource type gracefully in has', () => {
        const result = inventory.has(null, 5);
        expect(result).toBe(false);
    });

    it('should handle null/undefined resource type gracefully in getCount', () => {
        const result = inventory.getCount(undefined);
        expect(result).toBe(0);
    });
});

describe('Resource Helpers', () => {
    it('should get resource by crop index', () => {
        const carrot = getResourceByCropIndex(0);
        expect(carrot).not.toBeNull();
        expect(carrot.name).toBe('Carrot');

        const wheat = getResourceByCropIndex(9);
        expect(wheat).not.toBeNull();
        expect(wheat.name).toBe('Wheat');
    });

    it('should return null for invalid crop index', () => {
        const result = getResourceByCropIndex(999);
        expect(result).toBeNull();
    });

    it('should get resource by ore name', () => {
        const iron = getResourceByOreName('Iron');
        expect(iron).not.toBeNull();
        expect(iron.name).toBe('Iron Ore');

        const gold = getResourceByOreName('Gold');
        expect(gold).not.toBeNull();
        expect(gold.name).toBe('Gold Ore');
    });

    it('should return null for invalid ore name', () => {
        const result = getResourceByOreName('Unobtanium');
        expect(result).toBeNull();
    });
});

describe('RESOURCE_TYPES', () => {
    it('should have all crop types defined', () => {
        expect(RESOURCE_TYPES.CROP_CARROT).toBeDefined();
        expect(RESOURCE_TYPES.CROP_CAULIFLOWER).toBeDefined();
        expect(RESOURCE_TYPES.CROP_PUMPKIN).toBeDefined();
        expect(RESOURCE_TYPES.CROP_SUNFLOWER).toBeDefined();
        expect(RESOURCE_TYPES.CROP_RADISH).toBeDefined();
        expect(RESOURCE_TYPES.CROP_PARSNIP).toBeDefined();
        expect(RESOURCE_TYPES.CROP_POTATO).toBeDefined();
        expect(RESOURCE_TYPES.CROP_CABBAGE).toBeDefined();
        expect(RESOURCE_TYPES.CROP_BEETROOT).toBeDefined();
        expect(RESOURCE_TYPES.CROP_WHEAT).toBeDefined();
    });

    it('should have all seed types with correct crop indices', () => {
        expect(RESOURCE_TYPES.SEED_CARROT.cropIndex).toBe(0);
        expect(RESOURCE_TYPES.SEED_CAULIFLOWER.cropIndex).toBe(1);
        expect(RESOURCE_TYPES.SEED_PUMPKIN.cropIndex).toBe(2);
        expect(RESOURCE_TYPES.SEED_WHEAT.cropIndex).toBe(9);
    });

    it('should have all ore types defined', () => {
        expect(RESOURCE_TYPES.ORE_IRON).toBeDefined();
        expect(RESOURCE_TYPES.ORE_COAL).toBeDefined();
        expect(RESOURCE_TYPES.ORE_MITHRIL).toBeDefined();
        expect(RESOURCE_TYPES.ORE_GOLD).toBeDefined();
        expect(RESOURCE_TYPES.ORE_STONE).toBeDefined();
    });

    it('should have sell prices for crops', () => {
        expect(RESOURCE_TYPES.CROP_CARROT.sell_price).toBeGreaterThan(0);
        expect(RESOURCE_TYPES.CROP_PUMPKIN.sell_price).toBeGreaterThan(0);
    });

    it('should have buy prices for seeds', () => {
        expect(RESOURCE_TYPES.SEED_CARROT.price).toBeGreaterThan(0);
        expect(RESOURCE_TYPES.SEED_PUMPKIN.price).toBeGreaterThan(0);
    });
});
