/**
 * Unit tests for Crop and CropManager systems
 */

import { describe, it, expect, beforeEach } from './TestRunner.js';

// Mock Crop for testing without actual game dependencies
class MockCrop {
    constructor(tileX, tileY, cropType, isPlanted = false) {
        this.tileX = tileX;
        this.tileY = tileY;
        this.cropType = cropType;
        this.growthStage = isPlanted ? 1 : 0;
        this.isHarvested = false;
        this.isGone = false;
        this.isWatered = false;
        this.alpha = 1;
        this.growthTimer = 0;
        this.maxGrowthStage = 5;
    }

    update(deltaTime) {
        if (this.isHarvested) {
            // Simulate fade out
            this.alpha -= deltaTime / 500;
            if (this.alpha <= 0) {
                this.alpha = 0;
                this.isGone = true;
            }
        }
    }

    water() {
        if (this.isWatered || this.isHarvested) return false;
        this.isWatered = true;
        return true;
    }

    isReadyToHarvest() {
        return this.growthStage >= this.maxGrowthStage && !this.isHarvested;
    }

    harvest() {
        if (!this.isReadyToHarvest()) return false;
        this.isHarvested = true;
        return true;
    }

    containsTile(x, y) {
        return x === this.tileX && y === this.tileY;
    }

    getSortY(tileSize) {
        return (this.tileY + 1) * tileSize;
    }
}

// Mock CropManager for testing
class MockCropManager {
    constructor() {
        this.crops = [];
        this.harvestEffects = [];
    }

    plantCrop(tileX, tileY, cropType) {
        // Check if there's already a crop here
        if (this.getCropAt(tileX, tileY)) {
            return null;
        }

        const crop = new MockCrop(tileX, tileY, cropType, true);
        this.crops.push(crop);
        return crop;
    }

    getCropAt(tileX, tileY) {
        for (const crop of this.crops) {
            if (crop.isHarvested || crop.isGone) continue;
            if (crop.containsTile(tileX, tileY)) {
                return crop;
            }
        }
        return null;
    }

    tryHarvest(tileX, tileY) {
        for (const crop of this.crops) {
            if (crop.containsTile(tileX, tileY) && crop.isReadyToHarvest()) {
                crop.harvest();
                return crop.cropType;
            }
        }
        return null;
    }

    waterCrop(tileX, tileY) {
        const crop = this.getCropAt(tileX, tileY);
        if (crop && !crop.isWatered) {
            return crop.water();
        }
        return false;
    }

    update(deltaTime) {
        for (const crop of this.crops) {
            crop.update(deltaTime);
        }
        // Clean up gone crops
        this.crops = this.crops.filter(crop => !crop.isGone);
    }

    getCrops() {
        return this.crops;
    }

    getActiveCropCount() {
        return this.crops.filter(c => !c.isHarvested && !c.isGone).length;
    }
}

describe('Crop', () => {
    let crop;
    const mockCropType = { name: 'Carrot', index: 0 };

    beforeEach(() => {
        crop = new MockCrop(5, 5, mockCropType);
    });

    // === Initialization ===

    it('should store tile position correctly', () => {
        expect(crop.tileX).toBe(5);
        expect(crop.tileY).toBe(5);
    });

    it('should store crop type', () => {
        expect(crop.cropType.name).toBe('Carrot');
        expect(crop.cropType.index).toBe(0);
    });

    it('should start at growth stage 0 when not planted', () => {
        expect(crop.growthStage).toBe(0);
    });

    it('should start at growth stage 1 when planted', () => {
        const plantedCrop = new MockCrop(5, 5, mockCropType, true);
        expect(plantedCrop.growthStage).toBe(1);
    });

    it('should not be harvested initially', () => {
        expect(crop.isHarvested).toBe(false);
        expect(crop.isGone).toBe(false);
    });

    // === Watering ===

    it('should start unwatered', () => {
        expect(crop.isWatered).toBe(false);
    });

    it('should become watered when watered', () => {
        const result = crop.water();
        expect(result).toBe(true);
        expect(crop.isWatered).toBe(true);
    });

    it('should not water an already watered crop', () => {
        crop.water();
        const result = crop.water();
        expect(result).toBe(false);
    });

    // === Harvesting ===

    it('should not be ready to harvest before max growth', () => {
        crop.growthStage = 3;
        expect(crop.isReadyToHarvest()).toBe(false);
    });

    it('should be ready to harvest at max growth', () => {
        crop.growthStage = 5;
        expect(crop.isReadyToHarvest()).toBe(true);
    });

    it('should harvest successfully when ready', () => {
        crop.growthStage = 5;
        const result = crop.harvest();
        expect(result).toBe(true);
        expect(crop.isHarvested).toBe(true);
    });

    it('should not harvest when not ready', () => {
        crop.growthStage = 3;
        const result = crop.harvest();
        expect(result).toBe(false);
        expect(crop.isHarvested).toBe(false);
    });

    it('should not harvest twice', () => {
        crop.growthStage = 5;
        crop.harvest();
        const result = crop.harvest();
        expect(result).toBe(false);
    });

    // === Tile Detection ===

    it('should contain its own tile', () => {
        expect(crop.containsTile(5, 5)).toBe(true);
    });

    it('should not contain other tiles', () => {
        expect(crop.containsTile(6, 5)).toBe(false);
        expect(crop.containsTile(5, 6)).toBe(false);
    });

    // === Fade Out ===

    it('should fade out after harvest', () => {
        crop.growthStage = 5;
        crop.harvest();
        crop.update(250); // 250ms
        expect(crop.alpha).toBeLessThan(1);
    });

    it('should become gone after fully faded', () => {
        crop.growthStage = 5;
        crop.harvest();
        crop.update(600); // More than 500ms
        expect(crop.isGone).toBe(true);
    });
});

describe('CropManager', () => {
    let cropManager;
    const carrotType = { name: 'Carrot', index: 0 };
    const potatoType = { name: 'Potato', index: 6 };

    beforeEach(() => {
        cropManager = new MockCropManager();
    });

    // === Planting ===

    it('should plant crop successfully', () => {
        const crop = cropManager.plantCrop(5, 5, carrotType);
        expect(crop).not.toBeNull();
        expect(cropManager.crops.length).toBe(1);
    });

    it('should not plant on occupied tile', () => {
        cropManager.plantCrop(5, 5, carrotType);
        const secondCrop = cropManager.plantCrop(5, 5, potatoType);
        expect(secondCrop).toBeNull();
        expect(cropManager.crops.length).toBe(1);
    });

    it('should plant on different tiles', () => {
        cropManager.plantCrop(5, 5, carrotType);
        cropManager.plantCrop(6, 5, potatoType);
        expect(cropManager.crops.length).toBe(2);
    });

    // === Getting Crops ===

    it('should get crop at specific tile', () => {
        cropManager.plantCrop(5, 5, carrotType);
        const crop = cropManager.getCropAt(5, 5);
        expect(crop).not.toBeNull();
        expect(crop.cropType.name).toBe('Carrot');
    });

    it('should return null for empty tile', () => {
        const crop = cropManager.getCropAt(10, 10);
        expect(crop).toBeNull();
    });

    it('should not return harvested crops', () => {
        const crop = cropManager.plantCrop(5, 5, carrotType);
        crop.growthStage = 5;
        crop.harvest();

        const result = cropManager.getCropAt(5, 5);
        expect(result).toBeNull();
    });

    // === Watering ===

    it('should water crop successfully', () => {
        cropManager.plantCrop(5, 5, carrotType);
        const result = cropManager.waterCrop(5, 5);
        expect(result).toBe(true);
    });

    it('should not water empty tile', () => {
        const result = cropManager.waterCrop(10, 10);
        expect(result).toBe(false);
    });

    // === Harvesting ===

    it('should harvest ready crop', () => {
        const crop = cropManager.plantCrop(5, 5, carrotType);
        crop.growthStage = 5;

        const result = cropManager.tryHarvest(5, 5);
        expect(result).not.toBeNull();
        expect(result.name).toBe('Carrot');
    });

    it('should not harvest unready crop', () => {
        cropManager.plantCrop(5, 5, carrotType);
        const result = cropManager.tryHarvest(5, 5);
        expect(result).toBeNull();
    });

    // === Cleanup ===

    it('should clean up gone crops', () => {
        const crop = cropManager.plantCrop(5, 5, carrotType);
        crop.growthStage = 5;
        crop.harvest();

        // Simulate time passing until crop is gone
        cropManager.update(600);

        expect(cropManager.crops.length).toBe(0);
    });

    it('should count active crops correctly', () => {
        cropManager.plantCrop(5, 5, carrotType);
        cropManager.plantCrop(6, 5, potatoType);

        expect(cropManager.getActiveCropCount()).toBe(2);

        const crop = cropManager.crops[0];
        crop.growthStage = 5;
        crop.harvest();

        expect(cropManager.getActiveCropCount()).toBe(1);
    });
});

describe('Crop Growth Stages', () => {
    it('should have 5 growth stages', () => {
        const crop = new MockCrop(0, 0, { name: 'Test' });
        expect(crop.maxGrowthStage).toBe(5);
    });

    it('should progress through stages', () => {
        const crop = new MockCrop(0, 0, { name: 'Test' }, true);

        expect(crop.growthStage).toBe(1);
        crop.growthStage = 2;
        expect(crop.growthStage).toBe(2);
        crop.growthStage = 5;
        expect(crop.isReadyToHarvest()).toBe(true);
    });
});
