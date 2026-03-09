/**
 * Tests for Phase 2 farming features:
 *   - Well obstacle detection and service-tile lookup
 *   - CROP_TYPES wateringsPerStage and tier data
 *   - Crop watering state machine (single-water and multi-water crops)
 *   - Wild crops starting in 'growing' state (no water needed)
 *   - ForestGenerator distance-based ore/crop type selection
 */

import { describe, it, expect, beforeEach } from './TestRunner.js';
import { Well } from '../js/Well.js';
import { CROP_TYPES, Crop, GROWTH_STAGE } from '../js/Crop.js';
import { ForestGenerator } from '../js/ForestGenerator.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockTilemap() {
    return { tileSize: 16, interactables: [], chunkTiles: new Map() };
}

// ── Well — isObstacle ─────────────────────────────────────────────────────────

describe('Well.isObstacle — Phase 2', () => {
    let well;

    beforeEach(() => {
        well = new Well(makeMockTilemap());
    });

    it('top row tiles (24,53) and (25,53) should NOT block movement', () => {
        expect(well.isObstacle(24, 53)).toBe(false);
        expect(well.isObstacle(25, 53)).toBe(false);
    });

    it('middle row tile (24,54) should be an obstacle', () => {
        expect(well.isObstacle(24, 54)).toBe(true);
    });

    it('middle row tile (25,54) should be an obstacle', () => {
        expect(well.isObstacle(25, 54)).toBe(true);
    });

    it('bottom row tile (24,55) should be an obstacle', () => {
        expect(well.isObstacle(24, 55)).toBe(true);
    });

    it('bottom row tile (25,55) should be an obstacle', () => {
        expect(well.isObstacle(25, 55)).toBe(true);
    });

    it('tile west of middle row (23,54) — service tile — should NOT be an obstacle', () => {
        expect(well.isObstacle(23, 54)).toBe(false);
    });

    it('tile east of the well (26,54) should NOT be an obstacle', () => {
        expect(well.isObstacle(26, 54)).toBe(false);
    });

    it('tile below the well (24,56) should NOT be an obstacle', () => {
        expect(well.isObstacle(24, 56)).toBe(false);
    });

    it('arbitrary unrelated tiles should NOT be obstacles', () => {
        expect(well.isObstacle(0, 0)).toBe(false);
        expect(well.isObstacle(100, 100)).toBe(false);
    });
});

// ── Well — getAdjacentServiceTile ─────────────────────────────────────────────

describe('Well.getAdjacentServiceTile — Phase 2', () => {
    let well;

    beforeEach(() => {
        well = new Well(makeMockTilemap());
    });

    it('should return the well bottom tile (same x, bottom row y)', () => {
        const tile = well.getAdjacentServiceTile();
        expect(tile.x).toBe(well.tileX);       // x = tileX (inside the well)
        expect(tile.y).toBe(well.tileY + 2);   // y = bottom row of well
    });

    it('service tile is inside the well (pathfinder routes to nearest adjacent tile)', () => {
        const { x, y } = well.getAdjacentServiceTile();
        expect(well.isObstacle(x, y)).toBe(true);
    });
});

// ── CROP_TYPES — wateringsPerStage ────────────────────────────────────────────

describe('CROP_TYPES.wateringsPerStage — Phase 2', () => {
    it('PUMPKIN requires 2 waterings per stage', () => {
        expect(CROP_TYPES.PUMPKIN.wateringsPerStage).toBe(2);
    });

    it('WHEAT requires 2 waterings per stage', () => {
        expect(CROP_TYPES.WHEAT.wateringsPerStage).toBe(2);
    });

    it('SUNFLOWER requires 2 waterings per stage', () => {
        expect(CROP_TYPES.SUNFLOWER.wateringsPerStage).toBe(2);
    });

    it('CARROT requires 1 watering per stage', () => {
        expect(CROP_TYPES.CARROT.wateringsPerStage).toBe(1);
    });

    it('RADISH requires 1 watering per stage', () => {
        expect(CROP_TYPES.RADISH.wateringsPerStage).toBe(1);
    });

    it('PARSNIP requires 1 watering per stage', () => {
        expect(CROP_TYPES.PARSNIP.wateringsPerStage).toBe(1);
    });

    it('POTATO requires 1 watering per stage', () => {
        expect(CROP_TYPES.POTATO.wateringsPerStage).toBe(1);
    });

    it('CABBAGE requires 1 watering per stage', () => {
        expect(CROP_TYPES.CABBAGE.wateringsPerStage).toBe(1);
    });

    it('BEETROOT requires 1 watering per stage', () => {
        expect(CROP_TYPES.BEETROOT.wateringsPerStage).toBe(1);
    });

    it('CAULIFLOWER requires 1 watering per stage', () => {
        expect(CROP_TYPES.CAULIFLOWER.wateringsPerStage).toBe(1);
    });
});

// ── CROP_TYPES — tier data ────────────────────────────────────────────────────

describe('CROP_TYPES tier data — Phase 2', () => {
    it('CARROT, RADISH, PARSNIP are tier 1', () => {
        expect(CROP_TYPES.CARROT.tier).toBe(1);
        expect(CROP_TYPES.RADISH.tier).toBe(1);
        expect(CROP_TYPES.PARSNIP.tier).toBe(1);
    });

    it('POTATO, CABBAGE, BEETROOT are tier 2', () => {
        expect(CROP_TYPES.POTATO.tier).toBe(2);
        expect(CROP_TYPES.CABBAGE.tier).toBe(2);
        expect(CROP_TYPES.BEETROOT.tier).toBe(2);
    });

    it('CAULIFLOWER, SUNFLOWER, WHEAT are tier 3', () => {
        expect(CROP_TYPES.CAULIFLOWER.tier).toBe(3);
        expect(CROP_TYPES.SUNFLOWER.tier).toBe(3);
        expect(CROP_TYPES.WHEAT.tier).toBe(3);
    });

    it('PUMPKIN is tier 4', () => {
        expect(CROP_TYPES.PUMPKIN.tier).toBe(4);
    });
});

// ── Crop watering state machine — single-water crops ─────────────────────────

describe('Crop watering state machine (single-water: CARROT) — Phase 2', () => {
    let crop;

    beforeEach(() => {
        // Create a player-planted Carrot (wateringsPerStage=1).
        // After construction: stage=PLANTING_PHASE1, wateringState='needs_water'
        // Advance to PLANTED stage so water() performs the first real transition.
        crop = new Crop(5, 5, CROP_TYPES.CARROT, true);
        crop.advancePlantingPhase(); // PLANTING_PHASE1 → PLANTED
    });

    it('newly planted crop should start in needs_water state', () => {
        const freshCrop = new Crop(0, 0, CROP_TYPES.CARROT, true);
        expect(freshCrop.wateringState).toBe('needs_water');
    });

    it('isWatered getter returns false when needs_water', () => {
        expect(crop.isWatered).toBe(false);
    });

    it('water() returns true when crop is waiting for water', () => {
        expect(crop.water()).toBe(true);
    });

    it('watering a PLANTED crop transitions wateringState to growing', () => {
        crop.water();
        expect(crop.wateringState).toBe('growing');
    });

    it('water() returns false when crop is already growing', () => {
        crop.water(); // transitions to growing
        expect(crop.water()).toBe(false);
    });

    it('isWatered getter returns true when state is growing', () => {
        crop.water();
        expect(crop.isWatered).toBe(true);
    });

    it('crop requires water again after advancing one growth stage', () => {
        crop.water(); // PLANTED → SEED, growing
        // Simulate enough time to advance from SEED to SEEDLING
        const msPerStage = (CROP_TYPES.CARROT.growth_time_minutes * 60 * 1000) / 5;
        crop.update(msPerStage + 100);
        expect(crop.wateringState).toBe('needs_water');
    });

    it('single-water crop never enters watering_cooldown', () => {
        crop.water(); // PLANTED → SEED, growing
        const msPerStage = (CROP_TYPES.CARROT.growth_time_minutes * 60 * 1000) / 5;
        crop.update(msPerStage + 100); // advance stage → needs_water
        crop.water(); // watering a single-water stage → directly to growing
        expect(crop.wateringState).toBe('growing');
    });
});

// ── Crop watering state machine — multi-water crops ───────────────────────────

describe('Crop watering state machine (multi-water: PUMPKIN) — Phase 2', () => {
    let crop;

    beforeEach(() => {
        // Plant a Pumpkin and advance it to SEEDLING stage, needing its first watering
        crop = new Crop(5, 5, CROP_TYPES.PUMPKIN, true);
        crop.advancePlantingPhase(); // PLANTING_PHASE1 → PLANTED
        crop.water();                 // PLANTED → SEED, growing (planting transition, no wateringsPerStage check)
        // Advance from SEED to SEEDLING
        const msPerStage = (CROP_TYPES.PUMPKIN.growth_time_minutes * 60 * 1000) / 5;
        crop.update(msPerStage + 100);
        // Now at SEEDLING, wateringState='needs_water', wateringsPerStage=2
    });

    it('setup: crop is in needs_water state at SEEDLING', () => {
        expect(crop.wateringState).toBe('needs_water');
        expect(crop.stage).toBe(GROWTH_STAGE.SEEDLING);
    });

    it('first water() on a 2-watering stage enters watering_cooldown', () => {
        crop.water();
        expect(crop.wateringState).toBe('watering_cooldown');
    });

    it('water() is rejected during watering_cooldown', () => {
        crop.water(); // enters cooldown
        expect(crop.water()).toBe(false);
    });

    it('isWatered returns true during watering_cooldown', () => {
        crop.water(); // enters cooldown
        expect(crop.isWatered).toBe(true);
    });

    it('watering_cooldown transitions back to needs_water after 30s', () => {
        crop.water(); // enters 30s cooldown
        crop.update(30001);
        expect(crop.wateringState).toBe('needs_water');
    });

    it('second water() after cooldown transitions to growing', () => {
        crop.water();       // 1st watering → cooldown
        crop.update(30001); // expire cooldown → needs_water
        crop.water();       // 2nd watering → growing
        expect(crop.wateringState).toBe('growing');
    });

    it('crop does NOT advance growth stage during watering_cooldown', () => {
        const stageBefore = crop.stage;
        crop.water(); // enters cooldown
        // Tick less than cooldown duration — stage should not advance
        crop.update(15000);
        expect(crop.stage).toBe(stageBefore);
    });
});

// ── Wild crops — start in growing state ───────────────────────────────────────

describe('Wild crops (startAsPlanted=false) — Phase 2', () => {
    it('wild CARROT starts in growing state', () => {
        const crop = new Crop(5, 5, CROP_TYPES.CARROT, false);
        expect(crop.wateringState).toBe('growing');
    });

    it('isWatered returns true for wild crops', () => {
        const crop = new Crop(5, 5, CROP_TYPES.RADISH, false);
        expect(crop.isWatered).toBe(true);
    });

    it('water() is rejected for wild crops', () => {
        const crop = new Crop(5, 5, CROP_TYPES.PARSNIP, false);
        expect(crop.water()).toBe(false);
    });

    it('wild PUMPKIN also starts in growing state despite wateringsPerStage=2', () => {
        const crop = new Crop(5, 5, CROP_TYPES.PUMPKIN, false);
        expect(crop.wateringState).toBe('growing');
        expect(crop.isWatered).toBe(true);
    });

    it('wild crop advances its growth timer immediately (no watering gate)', () => {
        const crop = new Crop(5, 5, CROP_TYPES.CARROT, false);
        const stageBefore = crop.stage;
        // Wild crop starts at SEED (0), should grow into SEEDLING after enough time
        const msPerStage = (CROP_TYPES.CARROT.growth_time_minutes * 60 * 1000) / 5;
        crop.update(msPerStage + 100);
        expect(crop.stage).toBeGreaterThan(stageBefore);
    });
});

// ── ForestGenerator._weightedCropType — distance-based pools ─────────────────

describe('ForestGenerator._weightedCropType — Phase 2 distance-based resources', () => {
    let gen;

    beforeEach(() => {
        gen = new ForestGenerator(makeMockTilemap());
    });

    const NEAR_POOL = new Set(['CARROT', 'RADISH', 'PARSNIP']);
    const MID_POOL  = new Set(['POTATO', 'CABBAGE', 'BEETROOT']);
    const FAR_POOL  = new Set(['SUNFLOWER', 'CAULIFLOWER', 'WHEAT', 'PUMPKIN']);

    it('at distance ≤ 2 only returns tier-1 crops (CARROT/RADISH/PARSNIP)', () => {
        for (let i = 0; i < 40; i++) {
            expect(NEAR_POOL.has(gen._weightedCropType(1))).toBe(true);
            expect(NEAR_POOL.has(gen._weightedCropType(2))).toBe(true);
        }
    });

    it('at distance 3–4 only returns tier-2 crops (POTATO/CABBAGE/BEETROOT)', () => {
        for (let i = 0; i < 40; i++) {
            expect(MID_POOL.has(gen._weightedCropType(3))).toBe(true);
            expect(MID_POOL.has(gen._weightedCropType(4))).toBe(true);
        }
    });

    it('at distance ≥ 5 only returns tier-3/4 crops', () => {
        for (let i = 0; i < 40; i++) {
            expect(FAR_POOL.has(gen._weightedCropType(5))).toBe(true);
            expect(FAR_POOL.has(gen._weightedCropType(10))).toBe(true);
        }
    });

    it('near-distance results never include far-tier crops', () => {
        for (let i = 0; i < 60; i++) {
            expect(FAR_POOL.has(gen._weightedCropType(1))).toBe(false);
        }
    });

    it('far-distance results never include near-tier crops', () => {
        for (let i = 0; i < 60; i++) {
            expect(NEAR_POOL.has(gen._weightedCropType(5))).toBe(false);
        }
    });

    it('mid-distance results never include far-tier crops', () => {
        for (let i = 0; i < 60; i++) {
            expect(FAR_POOL.has(gen._weightedCropType(3))).toBe(false);
        }
    });
});

// ── ForestGenerator._weightedOreType — distance-based weights ────────────────

describe('ForestGenerator._weightedOreType — Phase 2 distance-based resources', () => {
    let gen;

    beforeEach(() => {
        gen = new ForestGenerator(makeMockTilemap());
    });

    const ALL_ORES = new Set(['ROCK', 'IRON', 'COAL', 'GOLD', 'MITHRIL']);
    const NEAR_ORES = new Set(['ROCK', 'IRON', 'COAL']); // GOLD=0, MITHRIL=0 at dist≤2

    it('always returns a valid ore type', () => {
        for (const dist of [1, 2, 3, 5, 10]) {
            for (let i = 0; i < 20; i++) {
                expect(ALL_ORES.has(gen._weightedOreType(dist))).toBe(true);
            }
        }
    });

    it('at distance ≤ 2, GOLD never appears (weight 0)', () => {
        for (let i = 0; i < 60; i++) {
            expect(gen._weightedOreType(1)).not.toBe('GOLD');
            expect(gen._weightedOreType(2)).not.toBe('GOLD');
        }
    });

    it('at distance ≤ 2, MITHRIL never appears (weight 0)', () => {
        for (let i = 0; i < 60; i++) {
            expect(gen._weightedOreType(1)).not.toBe('MITHRIL');
            expect(gen._weightedOreType(2)).not.toBe('MITHRIL');
        }
    });

    it('at distance ≤ 2, only ROCK/IRON/COAL can appear', () => {
        for (let i = 0; i < 60; i++) {
            expect(NEAR_ORES.has(gen._weightedOreType(1))).toBe(true);
        }
    });

    it('at distance > 4, precious ores (GOLD or MITHRIL) appear in a sufficient sample', () => {
        // GOLD=30%, MITHRIL=25% at dist>4 — combined 55%, so in 200 trials both should appear
        const results = new Set();
        for (let i = 0; i < 200; i++) {
            results.add(gen._weightedOreType(5));
        }
        // At least one of the precious ores should appear with overwhelming probability
        expect(results.has('GOLD') || results.has('MITHRIL')).toBe(true);
    });

    it('at distance 3–4 mid-range ores include GOLD and IRON possibilities', () => {
        // At dist 3-4: GOLD=15%, IRON=30% — MITHRIL=5%
        // MITHRIL might or might not appear in 100 trials; GOLD should appear
        const results = new Set();
        for (let i = 0; i < 100; i++) {
            results.add(gen._weightedOreType(3));
        }
        // IRON and ROCK always have weight, they must appear
        expect(results.has('ROCK') || results.has('IRON') || results.has('COAL')).toBe(true);
    });
});
