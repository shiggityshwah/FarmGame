/**
 * Unit tests for ReplenishZoneManager
 *
 * All dependencies are mocked — no canvas, tilemap, or DOM required.
 */

import { describe, it, expect, beforeEach } from './TestRunner.js';
import { ReplenishZoneManager } from '../js/ReplenishZoneManager.js';

// ── Factories ─────────────────────────────────────────────────────────────────

function makeInventory(hasSeed = true) {
    return {
        getSeedByCropIndex(idx) { return { id: `seed_${idx}`, category: 'seed' }; },
        has(_resource, _amount) { return hasSeed; }
    };
}

function makeJobManager() {
    return {
        addedJobs: [],
        addJobToQueue(tool, tiles, queue) {
            this.addedJobs.push({ tool, tiles: [...tiles], queue });
            return { id: `job_${this.addedJobs.length}` };
        }
    };
}

function makeZoneManager(hasSeed = true) {
    return new ReplenishZoneManager({}, makeJobManager(), makeInventory(hasSeed));
}

// ── createZone ────────────────────────────────────────────────────────────────

describe('ReplenishZoneManager.createZone', () => {
    let mgr;

    beforeEach(() => { mgr = makeZoneManager(true); });

    it('should create a zone and return its id', () => {
        const id = mgr.createZone([{ x: 1, y: 1 }], 0);
        expect(id).toBeDefined();
        expect(mgr.zones.has(id)).toBe(true);
    });

    it('should store all provided tiles in the zone', () => {
        const id = mgr.createZone([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }], 0);
        const zone = mgr.zones.get(id);
        expect(zone.tiles.size).toBe(3);
        expect(zone.tiles.has('1,1')).toBe(true);
        expect(zone.tiles.has('2,1')).toBe(true);
        expect(zone.tiles.has('3,1')).toBe(true);
    });

    it('should set the correct cropTypeIndex and cropName', () => {
        const id = mgr.createZone([{ x: 1, y: 1 }], 4); // Radish (index 4)
        const zone = mgr.zones.get(id);
        expect(zone.cropTypeIndex).toBe(4);
        expect(zone.cropName).toBe('Radish');
    });

    it('should mark the zone active when seeds are available', () => {
        const id = mgr.createZone([{ x: 1, y: 1 }], 0);
        expect(mgr.zones.get(id).active).toBe(true);
    });

    it('should mark the zone inactive when seeds are not available', () => {
        mgr = makeZoneManager(false);
        const id = mgr.createZone([{ x: 1, y: 1 }], 0);
        expect(mgr.zones.get(id).active).toBe(false);
    });

    it('should populate the reverse tile-to-zone lookup', () => {
        const id = mgr.createZone([{ x: 5, y: 5 }], 0);
        expect(mgr.getZoneForTile(5, 5)).toBe(mgr.zones.get(id));
    });

    it('should evict tiles that already belong to another zone', () => {
        const id1 = mgr.createZone([{ x: 1, y: 1 }, { x: 2, y: 2 }], 0);
        const id2 = mgr.createZone([{ x: 1, y: 1 }, { x: 3, y: 3 }], 1);

        // (1,1) was evicted from zone1
        expect(mgr.zones.get(id1).tiles.has('1,1')).toBe(false);
        // (2,2) is still in zone1
        expect(mgr.zones.get(id1).tiles.has('2,2')).toBe(true);
        // (1,1) is in zone2
        expect(mgr.zones.get(id2).tiles.has('1,1')).toBe(true);
        // reverse lookup points to zone2
        expect(mgr.getZoneForTile(1, 1)).toBe(mgr.zones.get(id2));
    });

    it('should delete a zone that becomes empty after tile eviction', () => {
        const id1 = mgr.createZone([{ x: 1, y: 1 }], 0); // single-tile zone
        const id2 = mgr.createZone([{ x: 1, y: 1 }], 1); // steals that tile

        expect(mgr.zones.has(id1)).toBe(false); // zone1 deleted
        expect(mgr.zones.has(id2)).toBe(true);
    });

    it('should generate unique ids for successive zones', () => {
        const id1 = mgr.createZone([{ x: 1, y: 1 }], 0);
        const id2 = mgr.createZone([{ x: 2, y: 2 }], 0);
        expect(id1).not.toBe(id2);
    });
});

// ── deleteZone ────────────────────────────────────────────────────────────────

describe('ReplenishZoneManager.deleteZone', () => {
    let mgr;

    beforeEach(() => { mgr = makeZoneManager(true); });

    it('should remove the zone from the zones map', () => {
        const id = mgr.createZone([{ x: 1, y: 1 }], 0);
        mgr.deleteZone(id);
        expect(mgr.zones.has(id)).toBe(false);
    });

    it('should clear all reverse tile-to-zone entries for the zone', () => {
        const id = mgr.createZone([{ x: 1, y: 1 }, { x: 2, y: 2 }], 0);
        mgr.deleteZone(id);
        expect(mgr.getZoneForTile(1, 1)).toBeNull();
        expect(mgr.getZoneForTile(2, 2)).toBeNull();
    });

    it('should be a no-op for an unknown zone id', () => {
        mgr.deleteZone('zone_nonexistent'); // must not throw
        expect(mgr.zones.size).toBe(0);
    });
});

// ── changeSeed ────────────────────────────────────────────────────────────────

describe('ReplenishZoneManager.changeSeed', () => {
    let mgr;

    beforeEach(() => { mgr = makeZoneManager(true); });

    it('should update the cropTypeIndex and cropName', () => {
        const id = mgr.createZone([{ x: 1, y: 1 }], 0); // Carrot
        mgr.changeSeed(id, 4); // Radish
        const zone = mgr.zones.get(id);
        expect(zone.cropTypeIndex).toBe(4);
        expect(zone.cropName).toBe('Radish');
    });

    it('should recompute active state based on new seed type', () => {
        const id = mgr.createZone([{ x: 1, y: 1 }], 0); // active
        expect(mgr.zones.get(id).active).toBe(true);

        mgr.inventory = makeInventory(false); // no seeds of any type
        mgr.changeSeed(id, 2); // Pumpkin — still no seed
        expect(mgr.zones.get(id).active).toBe(false);
    });

    it('should be a no-op for an unknown zone id', () => {
        mgr.changeSeed('zone_nonexistent', 0); // must not throw
    });
});

// ── expandZone ────────────────────────────────────────────────────────────────

describe('ReplenishZoneManager.expandZone', () => {
    let mgr;

    beforeEach(() => { mgr = makeZoneManager(true); });

    it('should add new tiles to the zone', () => {
        const id = mgr.createZone([{ x: 1, y: 1 }], 0);
        mgr.expandZone(id, [{ x: 2, y: 2 }, { x: 3, y: 3 }]);
        const zone = mgr.zones.get(id);
        expect(zone.tiles.size).toBe(3);
        expect(zone.tiles.has('2,2')).toBe(true);
        expect(zone.tiles.has('3,3')).toBe(true);
    });

    it('should register expanded tiles in the reverse lookup', () => {
        const id = mgr.createZone([{ x: 1, y: 1 }], 0);
        mgr.expandZone(id, [{ x: 9, y: 9 }]);
        expect(mgr.getZoneForTile(9, 9)).toBe(mgr.zones.get(id));
    });

    it('should evict expanded tiles from other zones and delete empty zones', () => {
        const id1 = mgr.createZone([{ x: 1, y: 1 }], 0);
        const id2 = mgr.createZone([{ x: 2, y: 2 }], 1); // single-tile

        mgr.expandZone(id1, [{ x: 2, y: 2 }]); // steal id2's only tile

        expect(mgr.zones.get(id1).tiles.has('2,2')).toBe(true);
        expect(mgr.zones.has(id2)).toBe(false); // deleted — became empty
        expect(mgr.getZoneForTile(2, 2)).toBe(mgr.zones.get(id1));
    });

    it('should not re-evict tiles already in the target zone', () => {
        const id = mgr.createZone([{ x: 1, y: 1 }], 0);
        mgr.expandZone(id, [{ x: 1, y: 1 }]); // "expand" with same tile
        expect(mgr.zones.get(id).tiles.size).toBe(1);
    });

    it('should be a no-op for an unknown zone id', () => {
        mgr.expandZone('zone_nonexistent', [{ x: 1, y: 1 }]); // must not throw
    });
});

// ── getZoneForTile ────────────────────────────────────────────────────────────

describe('ReplenishZoneManager.getZoneForTile', () => {
    let mgr;

    beforeEach(() => { mgr = makeZoneManager(true); });

    it('should return the zone for a tile that belongs to it', () => {
        const id = mgr.createZone([{ x: 5, y: 10 }], 0);
        const result = mgr.getZoneForTile(5, 10);
        expect(result).toBe(mgr.zones.get(id));
    });

    it('should return null for a tile not in any zone', () => {
        expect(mgr.getZoneForTile(99, 99)).toBeNull();
    });

    it('should return null after the zone is deleted', () => {
        const id = mgr.createZone([{ x: 5, y: 5 }], 0);
        mgr.deleteZone(id);
        expect(mgr.getZoneForTile(5, 5)).toBeNull();
    });
});

// ── onHarvest ─────────────────────────────────────────────────────────────────

describe('ReplenishZoneManager.onHarvest', () => {
    let mgr;
    let jobManager;

    beforeEach(() => {
        jobManager = makeJobManager();
        mgr = new ReplenishZoneManager({}, jobManager, makeInventory(true));
    });

    it('should queue a plant job when seeds are available', () => {
        const id = mgr.createZone([{ x: 3, y: 4 }], 0);
        mgr.onHarvest(3, 4);
        expect(jobManager.addedJobs.length).toBe(1);
        const { tool, tiles, queue } = jobManager.addedJobs[0];
        expect(tool.id).toBe('plant');
        expect(tiles[0]).toEqual({ x: 3, y: 4 });
        expect(queue).toBe('all');
    });

    it('should keep the zone active when seeds are available', () => {
        const id = mgr.createZone([{ x: 3, y: 4 }], 0);
        mgr.onHarvest(3, 4);
        expect(mgr.zones.get(id).active).toBe(true);
    });

    it('should use the zone cropTypeIndex in the replant tool', () => {
        const id = mgr.createZone([{ x: 1, y: 1 }], 4); // Radish
        mgr.onHarvest(1, 1);
        expect(jobManager.addedJobs[0].tool.seedType).toBe(4);
    });

    it('should pause the zone and queue no job when seeds are unavailable', () => {
        mgr.inventory = makeInventory(false);
        const id = mgr.createZone([{ x: 3, y: 4 }], 0);
        mgr.onHarvest(3, 4);
        expect(jobManager.addedJobs.length).toBe(0);
        expect(mgr.zones.get(id).active).toBe(false);
    });

    it('should be a no-op for tiles not belonging to any zone', () => {
        mgr.onHarvest(99, 99);
        expect(jobManager.addedJobs.length).toBe(0);
    });
});

// ── checkPausedZones ──────────────────────────────────────────────────────────

describe('ReplenishZoneManager.checkPausedZones', () => {
    let mgr;

    beforeEach(() => {
        // Start with no seeds so zones are created inactive
        mgr = makeZoneManager(false);
    });

    it('should reactivate paused zones when seeds become available', () => {
        const id = mgr.createZone([{ x: 1, y: 1 }], 0);
        expect(mgr.zones.get(id).active).toBe(false);

        mgr.inventory = makeInventory(true);
        mgr.checkPausedZones();

        expect(mgr.zones.get(id).active).toBe(true);
    });

    it('should leave already-active zones unchanged', () => {
        mgr.inventory = makeInventory(true);
        const id = mgr.createZone([{ x: 1, y: 1 }], 0);
        expect(mgr.zones.get(id).active).toBe(true);

        mgr.checkPausedZones(); // should be a no-op
        expect(mgr.zones.get(id).active).toBe(true);
    });

    it('should leave paused zones inactive when seeds are still unavailable', () => {
        const id = mgr.createZone([{ x: 1, y: 1 }], 0);
        mgr.checkPausedZones(); // inventory still empty
        expect(mgr.zones.get(id).active).toBe(false);
    });

    it('should handle multiple zones independently', () => {
        const id1 = mgr.createZone([{ x: 1, y: 1 }], 0); // inactive (no seeds)
        const id2 = mgr.createZone([{ x: 2, y: 2 }], 1); // inactive

        // Supply seeds for crop index 0 only (Carrot)
        mgr.inventory = {
            getSeedByCropIndex(idx) { return { id: `seed_${idx}` }; },
            has(resource, amount) { return resource.id === 'seed_0'; }
        };
        mgr.checkPausedZones();

        expect(mgr.zones.get(id1).active).toBe(true);  // reactivated
        expect(mgr.zones.get(id2).active).toBe(false); // still paused
    });
});
