/**
 * Tests for Phase 1 economy features:
 *   - Seed price exponential progression
 *   - Crop sell prices and sell-back formula
 *   - CONFIG.chunks.purchasePrices
 *   - ChunkManager.getChunkPrice() distance-based pricing
 *   - ChunkManager.purchaseChunk() gold deduction and state changes
 *   - CONFIG.tiles.hoedGround (gate for wild crop seed drops)
 */

import { describe, it, expect, beforeEach } from './TestRunner.js';
import { RESOURCE_TYPES } from '../js/Inventory.js';
import { ChunkManager, CHUNK_STATES } from '../js/ChunkManager.js';
import { CONFIG } from '../js/config.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Minimal tilemap mock — _allocateTileChunk and _updateMapBounds both guard on
 * `tilemap.mapType !== 'chunk'` and return early, so only tileSize is strictly needed.
 */
function makeMockTilemap() {
    return { tileSize: 16 };
}

function makeMockInventory(gold = 0) {
    let _gold = gold;
    return {
        getGold()          { return _gold; },
        addGold(n)         { _gold += n; },
        spendGold(amount)  {
            if (_gold < amount) return false;
            _gold -= amount;
            return true;
        }
    };
}

// ── Seed price data ───────────────────────────────────────────────────────────

describe('Seed prices — Phase 1', () => {
    const seeds = Object.values(RESOURCE_TYPES).filter(r => r.category === 'seed');

    it('should define all 10 seed types', () => {
        expect(seeds.length).toBe(10);
    });

    it('should give every seed a positive integer price', () => {
        for (const seed of seeds) {
            expect(Number.isInteger(seed.price)).toBe(true);
            expect(seed.price).toBeGreaterThan(0);
        }
    });

    it('SEED_CARROT should be the cheapest seed at 5g', () => {
        expect(RESOURCE_TYPES.SEED_CARROT.price).toBe(5);
    });

    it('SEED_PUMPKIN should be the most expensive seed at 50000g', () => {
        expect(RESOURCE_TYPES.SEED_PUMPKIN.price).toBe(50000);
    });

    it('seed prices should span at least 3 orders of magnitude (exponential range)', () => {
        const prices = seeds.map(s => s.price);
        const maxPrice = Math.max(...prices);
        const minPrice = Math.min(...prices);
        expect(maxPrice / minPrice).toBeGreaterThanOrEqual(1000);
    });

    it('should include all expected price tiers', () => {
        const prices = new Set(seeds.map(s => s.price));
        for (const expected of [5, 15, 40, 100, 300, 800, 2000, 5000, 15000, 50000]) {
            expect(prices.has(expected)).toBe(true);
        }
    });

    it('every seed should reference a valid cropIndex', () => {
        for (const seed of seeds) {
            expect(typeof seed.cropIndex).toBe('number');
            expect(seed.cropIndex).toBeGreaterThanOrEqual(0);
        }
    });
});

// ── Crop sell prices ──────────────────────────────────────────────────────────

describe('Crop sell prices — Phase 1', () => {
    // CROP_WEED has category 'crop' but is not sellable (no sell_price)
    const sellableCrops = Object.values(RESOURCE_TYPES).filter(
        r => r.category === 'crop' && r.sell_price !== undefined
    );

    it('should define exactly 10 sellable crop types', () => {
        expect(sellableCrops.length).toBe(10);
    });

    it('CROP_CARROT should be the cheapest crop at 10g', () => {
        expect(RESOURCE_TYPES.CROP_CARROT.sell_price).toBe(10);
    });

    it('CROP_PUMPKIN should be the most expensive crop at 100000g', () => {
        expect(RESOURCE_TYPES.CROP_PUMPKIN.sell_price).toBe(100000);
    });

    it('crop sell_price should exceed the matching seed price', () => {
        expect(RESOURCE_TYPES.CROP_CARROT.sell_price).toBeGreaterThan(RESOURCE_TYPES.SEED_CARROT.price);
        expect(RESOURCE_TYPES.CROP_RADISH.sell_price).toBeGreaterThan(RESOURCE_TYPES.SEED_RADISH.price);
        expect(RESOURCE_TYPES.CROP_PUMPKIN.sell_price).toBeGreaterThan(RESOURCE_TYPES.SEED_PUMPKIN.price);
        expect(RESOURCE_TYPES.CROP_POTATO.sell_price).toBeGreaterThan(RESOURCE_TYPES.SEED_POTATO.price);
    });

    it('all sellable crop sell prices should be positive integers', () => {
        for (const crop of sellableCrops) {
            expect(Number.isInteger(crop.sell_price)).toBe(true);
            expect(crop.sell_price).toBeGreaterThan(0);
        }
    });
});

// ── Store 50% sell-back pricing ───────────────────────────────────────────────

describe('Store sell-back pricing (50% of stand price) — Phase 1', () => {
    it('Carrot store price = Math.floor(sell_price / 2) = 5', () => {
        expect(Math.floor(RESOURCE_TYPES.CROP_CARROT.sell_price / 2)).toBe(5);
    });

    it('Pumpkin store price = Math.floor(sell_price / 2) = 50000', () => {
        expect(Math.floor(RESOURCE_TYPES.CROP_PUMPKIN.sell_price / 2)).toBe(50000);
    });

    it('store price should be strictly less than the stand price for every sellable crop', () => {
        const sellableCrops = Object.values(RESOURCE_TYPES).filter(
            r => r.category === 'crop' && r.sell_price !== undefined
        );
        for (const crop of sellableCrops) {
            const storePrice = Math.floor(crop.sell_price / 2);
            expect(storePrice).toBeLessThan(crop.sell_price);
        }
    });

    it('store price uses floor (never rounds up)', () => {
        const sellableCrops = Object.values(RESOURCE_TYPES).filter(
            r => r.category === 'crop' && r.sell_price !== undefined
        );
        for (const crop of sellableCrops) {
            const storePrice = Math.floor(crop.sell_price / 2);
            expect(storePrice).toBeLessThanOrEqual(crop.sell_price / 2);
        }
    });

    it('potion store sell prices are 50% of their stand sell_price', () => {
        const potions = Object.values(RESOURCE_TYPES).filter(r => r.category === 'potion');
        expect(potions.length).toBeGreaterThan(0);
        for (const potion of potions) {
            const storePrice = Math.floor(potion.sell_price / 2);
            expect(storePrice).toBeGreaterThan(0);
            expect(storePrice).toBeLessThan(potion.sell_price);
        }
    });
});

// ── CONFIG.chunks.purchasePrices ──────────────────────────────────────────────

describe('CONFIG.chunks.purchasePrices — Phase 1', () => {
    const { purchasePrices } = CONFIG.chunks;

    it('should be a non-empty array', () => {
        expect(Array.isArray(purchasePrices)).toBe(true);
        expect(purchasePrices.length).toBeGreaterThan(0);
    });

    it('distance 1 costs 100g', () => { expect(purchasePrices[0]).toBe(100); });
    it('distance 2 costs 500g', () => { expect(purchasePrices[1]).toBe(500); });
    it('distance 3 costs 2000g', () => { expect(purchasePrices[2]).toBe(2000); });
    it('distance 4 costs 10000g', () => { expect(purchasePrices[3]).toBe(10000); });
    it('distance 5+ cap is 50000g', () => { expect(purchasePrices[4]).toBe(50000); });

    it('prices should be in strictly ascending order', () => {
        for (let i = 1; i < purchasePrices.length; i++) {
            expect(purchasePrices[i]).toBeGreaterThan(purchasePrices[i - 1]);
        }
    });
});

// ── ChunkManager.getChunkPrice() ──────────────────────────────────────────────

describe('ChunkManager.getChunkPrice — Phase 1', () => {
    let cm;

    beforeEach(() => {
        // getChunkPrice() is a pure calculation — no initialize() needed
        cm = new ChunkManager(makeMockTilemap());
    });

    // farmCol=1, farmRow=2 — dist = |col-1| + |row-2|
    it('distance-1 neighbours cost 100g', () => {
        expect(cm.getChunkPrice(1, 3)).toBe(100); // |0| + |1| = 1
        expect(cm.getChunkPrice(0, 2)).toBe(100); // |1| + |0| = 1
        expect(cm.getChunkPrice(2, 2)).toBe(100); // |1| + |0| = 1
    });

    it('distance-2 chunks cost 500g', () => {
        expect(cm.getChunkPrice(1, 4)).toBe(500); // |0| + |2| = 2
        expect(cm.getChunkPrice(0, 3)).toBe(500); // |1| + |1| = 2
        expect(cm.getChunkPrice(3, 2)).toBe(500); // |2| + |0| = 2
    });

    it('distance-3 chunks cost 2000g', () => {
        expect(cm.getChunkPrice(1, 5)).toBe(2000); // dist 3
        expect(cm.getChunkPrice(4, 2)).toBe(2000); // dist 3
    });

    it('distance-4 chunks cost 10000g', () => {
        expect(cm.getChunkPrice(5, 2)).toBe(10000); // dist 4
        expect(cm.getChunkPrice(1, 6)).toBe(10000); // dist 4
    });

    it('distance-5+ chunks cap at 50000g', () => {
        expect(cm.getChunkPrice(6, 2)).toBe(50000);  // dist 5
        expect(cm.getChunkPrice(10, 2)).toBe(50000); // dist 9
        expect(cm.getChunkPrice(1, 99)).toBe(50000); // dist 97
    });
});

// ── ChunkManager.purchaseChunk() ──────────────────────────────────────────────

describe('ChunkManager.purchaseChunk — Phase 1', () => {
    let cm;
    let inventory;

    beforeEach(() => {
        cm = new ChunkManager(makeMockTilemap());
        cm.initialize(); // sets up initial 3×5 grid and runs _updatePurchasableChunks
        inventory = makeMockInventory(10000);
        cm.inventory = inventory;
    });

    it('adjacent-to-farm chunks should be PURCHASABLE after initialize()', () => {
        // farmRow=2: adjacent south=(1,3), left=(0,2), right=(2,2)
        for (const [col, row] of [[0, 2], [2, 2], [1, 3]]) {
            const chunk = cm.getChunkAt(col, row);
            expect(chunk).not.toBeNull();
            expect(chunk.state).toBe(CHUNK_STATES.PURCHASABLE);
        }
    });

    it('should return false for a LOCKED chunk', () => {
        // North forest chunks are permanently locked and never purchasable
        expect(cm.purchaseChunk(0, 0)).toBe(false);
    });

    it('should return false when player cannot afford the chunk', () => {
        cm.inventory = makeMockInventory(0); // no gold
        expect(cm.purchaseChunk(1, 4)).toBe(false);
    });

    it('should return false when player has exactly 1g less than the price', () => {
        const price = cm.getChunkPrice(1, 4); // 100g
        cm.inventory = makeMockInventory(price - 1);
        expect(cm.purchaseChunk(1, 4)).toBe(false);
    });

    it('should deduct the exact chunk price from inventory on purchase', () => {
        const goldBefore = inventory.getGold();
        const price = cm.getChunkPrice(1, 3); // dist-1 from farmRow=2, costs 100g
        cm.purchaseChunk(1, 3);
        expect(inventory.getGold()).toBe(goldBefore - price);
    });

    it('should set the purchased chunk state to OWNED', () => {
        cm.purchaseChunk(1, 3);
        const chunk = cm.getChunkAt(1, 3);
        expect(chunk).not.toBeNull();
        expect(chunk.state).toBe(CHUNK_STATES.OWNED);
    });

    it('should return false if the same chunk is purchased twice', () => {
        cm.purchaseChunk(1, 3);
        expect(cm.purchaseChunk(1, 3)).toBe(false);
    });

    it('should not deduct gold when purchase fails (already owned)', () => {
        cm.purchaseChunk(1, 3);
        const goldAfterFirst = inventory.getGold();
        cm.purchaseChunk(1, 3); // should fail
        expect(inventory.getGold()).toBe(goldAfterFirst);
    });

    it('north forest chunks (row < farmRow) should remain LOCKED after initialize()', () => {
        // Rows 0-1 flanking cols are permanently locked — no purchase signs ever shown
        // (row 2 flanking cols become PURCHASABLE since they are adjacent to the farm)
        for (const [col, row] of [[0, 0], [0, 1], [2, 0], [2, 1]]) {
            const chunk = cm.getChunkAt(col, row);
            if (chunk) {
                expect(chunk.state).not.toBe(CHUNK_STATES.PURCHASABLE);
                expect(chunk.state).not.toBe(CHUNK_STATES.OWNED);
            }
        }
    });
});

// ── CONFIG.tiles.hoedGround — wild crop seed drop gate ───────────────────────

describe('CONFIG.tiles.hoedGround — Phase 1 wild crop seed drop gate', () => {
    it('should be a non-empty array', () => {
        expect(Array.isArray(CONFIG.tiles.hoedGround)).toBe(true);
        expect(CONFIG.tiles.hoedGround.length).toBeGreaterThan(0);
    });

    it('all entries should be positive integers', () => {
        for (const tileId of CONFIG.tiles.hoedGround) {
            expect(typeof tileId).toBe('number');
            expect(Number.isInteger(tileId)).toBe(true);
            expect(tileId).toBeGreaterThan(0);
        }
    });

    it('should NOT include the default grass tile (65) — grass is not hoed ground', () => {
        expect(CONFIG.tiles.hoedGround.includes(65)).toBe(false);
    });

    it('should NOT include tile 66 (another grass variant)', () => {
        expect(CONFIG.tiles.hoedGround.includes(66)).toBe(false);
    });

    it('wild crop seed drop check: non-hoed tile (65) is not in hoedGround', () => {
        // The in-game check is: if NOT hoedGround → eligible for seed drop
        const grassTile = 65;
        expect(CONFIG.tiles.hoedGround.includes(grassTile)).toBe(false);
    });

    it('should contain all entries from CONFIG.tiles.hoedGround in a valid range', () => {
        for (const tileId of CONFIG.tiles.hoedGround) {
            expect(tileId).toBeGreaterThanOrEqual(1);
            expect(tileId).toBeLessThanOrEqual(65536); // sanity bound for tile ID range
        }
    });
});
