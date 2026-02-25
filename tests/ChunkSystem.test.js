/**
 * Tests for the extensible chunk generation system:
 *   ChunkContentGenerator, ChunkGeneratorRegistry, ForestChunkGenerator
 *
 * All tests use plain mock objects — no canvas, tilemap, or DOM required.
 */

import { describe, it, expect } from './TestRunner.js';
import { ChunkContentGenerator } from '../js/ChunkContentGenerator.js';
import { ChunkGeneratorRegistry } from '../js/ChunkGeneratorRegistry.js';
import { ForestChunkGenerator } from '../js/ForestChunkGenerator.js';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

class StubGenerator extends ChunkContentGenerator {
    constructor(type) {
        super();
        this._type = type;
        this.seamCalls = [];
        this.northEdgeCalls = [];
        this.contentCalls = [];
    }
    get type() { return this._type; }
    generateGround(col, row, chunkData, chunkSize) { chunkData.fill(42); }
    generateContent(col, row, bounds, options) { this.contentCalls.push({ col, row }); }
    generateSeam(direction, bounds, neighborGen) {
        this.seamCalls.push({ direction, neighborType: neighborGen?.type ?? null });
    }
    generateNorthEdge(bounds) { this.northEdgeCalls.push(bounds); }
}

class MockForestGenerator {
    constructor() {
        this.generateForChunkCalls = [];
        this.generateNSSeamCalls = [];
        this.generateEWSeamCalls = [];
        this.generateNorthEdgeCalls = [];
    }
    generateForChunk(x, y, w, h, opts) { this.generateForChunkCalls.push({ x, y, w, h, opts }); }
    generateNSSeamTrees(x, y, w, h)    { this.generateNSSeamCalls.push({ x, y, w, h }); }
    generateEWSeamTrees(x, y, w, h)    { this.generateEWSeamCalls.push({ x, y, w, h }); }
    generateNorthEdgeTrees(x, y, w)    { this.generateNorthEdgeCalls.push({ x, y, w }); }
}

// ─── ChunkContentGenerator base class ────────────────────────────────────────

describe('ChunkContentGenerator', () => {
    it('type returns "unknown"', () => {
        expect(new ChunkContentGenerator().type).toBe('unknown');
    });

    it('generateGround fills array with tile 65', () => {
        const gen = new ChunkContentGenerator();
        const data = new Uint16Array(9);
        gen.generateGround(0, 0, data, 3);
        for (let i = 0; i < 9; i++) expect(data[i]).toBe(65);
    });

    it('generateContent is a no-op', () => {
        // Should not throw
        new ChunkContentGenerator().generateContent(0, 0, { x: 0, y: 0, width: 30, height: 30 });
        expect(true).toBeTruthy();
    });

    it('generateSeam is a no-op', () => {
        new ChunkContentGenerator().generateSeam('S', { x: 0, y: 0, width: 30, height: 30 }, null);
        expect(true).toBeTruthy();
    });

    it('generateNorthEdge is a no-op', () => {
        new ChunkContentGenerator().generateNorthEdge({ x: 0, y: 0, width: 30, height: 30 });
        expect(true).toBeTruthy();
    });
});

// ─── ChunkGeneratorRegistry — registration ───────────────────────────────────

describe('ChunkGeneratorRegistry — registration', () => {
    it('register() stores generator by type', () => {
        const reg = new ChunkGeneratorRegistry();
        const gen = new StubGenerator('meadow');
        reg.register(gen);
        expect(reg.generators.get('meadow')).toBe(gen);
    });

    it('getGenerator() returns the registered generator', () => {
        const reg = new ChunkGeneratorRegistry();
        const gen = new StubGenerator('meadow');
        reg.register(gen);
        expect(reg.getGenerator('meadow')).toBe(gen);
    });

    it('getGenerator() falls back to forest for unknown type', () => {
        const reg = new ChunkGeneratorRegistry();
        const forestGen = new StubGenerator('forest');
        reg.register(forestGen);
        expect(reg.getGenerator('unknown_biome')).toBe(forestGen);
    });

    it('getGenerator() returns null when forest is also absent', () => {
        expect(new ChunkGeneratorRegistry().getGenerator('anything')).toBeNull();
    });

    it('register() replaces previous generator for the same type', () => {
        const reg = new ChunkGeneratorRegistry();
        const a = new StubGenerator('forest');
        const b = new StubGenerator('forest');
        reg.register(a);
        reg.register(b);
        expect(reg.getGenerator('forest')).toBe(b);
    });
});

// ─── ChunkGeneratorRegistry — biome resolution ───────────────────────────────

describe('ChunkGeneratorRegistry — biome resolution', () => {
    it('resolveType() checks designer map first', () => {
        const reg = new ChunkGeneratorRegistry();
        reg.setDesignerMap({ '5,3': 'lake' });
        expect(reg.resolveType(5, 3)).toBe('lake');
    });

    it('resolveType() returns weighted biome for unmapped coords', () => {
        const reg = new ChunkGeneratorRegistry();
        reg.setBiomeWeights([{ type: 'forest', weight: 1 }]);
        expect(reg.resolveType(0, 0)).toBe('forest');
        expect(reg.resolveType(99, -42)).toBe('forest');
    });

    it('resolveType() is deterministic for the same (col, row)', () => {
        const reg = new ChunkGeneratorRegistry();
        reg.setBiomeWeights([{ type: 'forest', weight: 5 }, { type: 'meadow', weight: 5 }]);
        expect(reg.resolveType(7, 13)).toBe(reg.resolveType(7, 13));
    });

    it('designer map takes priority over random for same coord', () => {
        const reg = new ChunkGeneratorRegistry();
        reg.setBiomeWeights([{ type: 'forest', weight: 1 }]);
        reg.setDesignerMap({ '0,0': 'desert' });
        expect(reg.resolveType(0, 0)).toBe('desert');
    });

    it('resolveType() with 100% one biome always returns it', () => {
        const reg = new ChunkGeneratorRegistry();
        reg.setBiomeWeights([{ type: 'lake', weight: 1 }]);
        for (const [col, row] of [[0,0],[1,2],[-3,5],[100,-1]]) {
            expect(reg.resolveType(col, row)).toBe('lake');
        }
    });

    it('resolveType() is stable across repeated calls for many coords', () => {
        const reg = new ChunkGeneratorRegistry();
        reg.setBiomeWeights([{ type: 'a', weight: 1 }, { type: 'b', weight: 1 }, { type: 'c', weight: 1 }]);
        for (let col = -5; col <= 5; col++) {
            for (let row = -5; row <= 5; row++) {
                expect(reg.resolveType(col, row)).toBe(reg.resolveType(col, row));
            }
        }
    });

    it('respects weight distribution across a large sample of coords', () => {
        const reg = new ChunkGeneratorRegistry();
        reg.setBiomeWeights([{ type: 'forest', weight: 8 }, { type: 'meadow', weight: 2 }]);
        let forestCount = 0;
        for (let col = -25; col <= 24; col++) {
            for (let row = -10; row <= 9; row++) {
                if (reg.resolveType(col, row) === 'forest') forestCount++;
            }
        }
        // 1000 samples, 80% forest expected → allow generous margin
        expect(forestCount).toBeGreaterThan(700);
        expect(forestCount).toBeLessThan(900);
    });
});

// ─── ForestChunkGenerator ─────────────────────────────────────────────────────

describe('ForestChunkGenerator', () => {
    it('type returns "forest"', () => {
        expect(new ForestChunkGenerator(new MockForestGenerator()).type).toBe('forest');
    });

    it('generateGround fills array with known grass tile IDs', () => {
        const valid = new Set([66, 129, 130, 131, 192, 193, 194, 195, 197, 199, 257, 258]);
        const fg = new ForestChunkGenerator(new MockForestGenerator());
        const data = new Uint16Array(4);
        fg.generateGround(0, 0, data, 2);
        for (let i = 0; i < 4; i++) expect(valid.has(data[i])).toBeTruthy();
    });

    it('generateGround fills the entire chunkSize² array (no zeros)', () => {
        const fg = new ForestChunkGenerator(new MockForestGenerator());
        const data = new Uint16Array(30 * 30);
        fg.generateGround(1, 2, data, 30);
        expect(Array.from(data).filter(v => v === 0).length).toBe(0);
    });

    it('generateContent delegates to forestGenerator.generateForChunk', () => {
        const mockFG = new MockForestGenerator();
        const fg = new ForestChunkGenerator(mockFG);
        const bounds = { x: 60, y: 0, width: 30, height: 30 };
        fg.generateContent(2, 0, bounds, {});
        expect(mockFG.generateForChunkCalls.length).toBe(1);
        expect(mockFG.generateForChunkCalls[0].x).toBe(60);
        expect(mockFG.generateForChunkCalls[0].y).toBe(0);
    });

    it('generateSeam("S", ..., forest) calls generateNSSeamTrees', () => {
        const mockFG = new MockForestGenerator();
        const fg = new ForestChunkGenerator(mockFG);
        fg.generateSeam('S', { x: 0, y: 0, width: 30, height: 30 }, new StubGenerator('forest'));
        expect(mockFG.generateNSSeamCalls.length).toBe(1);
        expect(mockFG.generateEWSeamCalls.length).toBe(0);
    });

    it('generateSeam("E", ..., forest) calls generateEWSeamTrees', () => {
        const mockFG = new MockForestGenerator();
        const fg = new ForestChunkGenerator(mockFG);
        fg.generateSeam('E', { x: 0, y: 0, width: 30, height: 30 }, new StubGenerator('forest'));
        expect(mockFG.generateEWSeamCalls.length).toBe(1);
        expect(mockFG.generateNSSeamCalls.length).toBe(0);
    });

    it('generateSeam("N", ...) is a no-op', () => {
        const mockFG = new MockForestGenerator();
        const fg = new ForestChunkGenerator(mockFG);
        fg.generateSeam('N', { x: 0, y: 0, width: 30, height: 30 }, new StubGenerator('forest'));
        expect(mockFG.generateNSSeamCalls.length).toBe(0);
        expect(mockFG.generateEWSeamCalls.length).toBe(0);
    });

    it('generateSeam("S", ..., non-forest neighbor) is a no-op', () => {
        const mockFG = new MockForestGenerator();
        const fg = new ForestChunkGenerator(mockFG);
        fg.generateSeam('S', { x: 0, y: 0, width: 30, height: 30 }, new StubGenerator('meadow'));
        expect(mockFG.generateNSSeamCalls.length).toBe(0);
    });

    it('generateSeam("S", ..., null) is a no-op', () => {
        const mockFG = new MockForestGenerator();
        const fg = new ForestChunkGenerator(mockFG);
        fg.generateSeam('S', { x: 0, y: 0, width: 30, height: 30 }, null);
        expect(mockFG.generateNSSeamCalls.length).toBe(0);
    });

    it('generateNorthEdge delegates to forestGenerator.generateNorthEdgeTrees', () => {
        const mockFG = new MockForestGenerator();
        const fg = new ForestChunkGenerator(mockFG);
        fg.generateNorthEdge({ x: 30, y: 64, width: 30, height: 30 });
        expect(mockFG.generateNorthEdgeCalls.length).toBe(1);
        expect(mockFG.generateNorthEdgeCalls[0].x).toBe(30);
        expect(mockFG.generateNorthEdgeCalls[0].y).toBe(64);
    });
});
