/**
 * Unit tests for EffectUtils — shared floating harvest effect utilities
 */

import { describe, it, expect, beforeEach } from './TestRunner.js';
import { createHarvestEffect, updateEffects, renderEffects } from '../js/EffectUtils.js';

describe('createHarvestEffect', () => {
    it('should return an object with correct initial values', () => {
        const e = createHarvestEffect(100, 200, 42);
        expect(e.x).toBe(100);
        expect(e.y).toBe(200);
        expect(e.tileId).toBe(42);
        expect(e.timer).toBe(0);
        expect(e.duration).toBe(1000);
        expect(e.alpha).toBe(1);
    });

    it('should create independent objects (no shared reference)', () => {
        const a = createHarvestEffect(0, 0, 1);
        const b = createHarvestEffect(0, 0, 1);
        a.timer = 500;
        expect(b.timer).toBe(0);
    });
});

describe('updateEffects', () => {
    let effects;

    beforeEach(() => {
        effects = [createHarvestEffect(50, 100, 1)];
    });

    it('should advance timer by deltaTime', () => {
        updateEffects(effects, 200);
        expect(effects[0].timer).toBe(200);
    });

    it('should float effect upward (decrease y)', () => {
        const initialY = effects[0].y;
        updateEffects(effects, 100);
        expect(effects[0].y).toBeLessThan(initialY);
    });

    it('should fade alpha from 1 toward 0 as timer advances', () => {
        updateEffects(effects, 500); // half duration
        expect(effects[0].alpha).toBeCloseTo(0.5, 3);
    });

    it('should have alpha near 0 just before expiry', () => {
        // At 999/1000ms the effect is still alive but nearly transparent
        updateEffects(effects, 999);
        expect(effects[0].alpha).toBeCloseTo(0.001, 2);
    });

    it('should remove effects whose timer reaches duration', () => {
        updateEffects(effects, 1000);
        expect(effects.length).toBe(0);
    });

    it('should not remove effects whose timer is just under duration', () => {
        updateEffects(effects, 999);
        expect(effects.length).toBe(1);
    });

    it('should handle multiple effects and remove only expired ones', () => {
        effects.push(createHarvestEffect(60, 110, 2));
        effects.push(createHarvestEffect(70, 120, 3));

        // Advance first two to expiry
        effects[0].timer = 999;
        effects[1].timer = 999;

        updateEffects(effects, 1); // +1ms pushes first two to 1000, third to 1
        expect(effects.length).toBe(1);
        expect(effects[0].tileId).toBe(3); // only the third (unexpired) remains
    });

    it('should be safe on empty array', () => {
        const empty = [];
        updateEffects(empty, 100);
        expect(empty.length).toBe(0);
    });

    it('should mutate the array in-place', () => {
        const original = effects;
        updateEffects(effects, 100);
        expect(effects).toBe(original); // same array reference
    });
});

describe('renderEffects', () => {
    let draws;
    let textCalls;
    let mockCtx;
    let mockTilesetImage;
    let calls;

    beforeEach(() => {
        draws = [];
        textCalls = [];
        calls = [];

        mockCtx = {
            save: () => calls.push('save'),
            restore: () => calls.push('restore'),
            drawImage: (...args) => draws.push(args),
            strokeText: (text, x, y) => textCalls.push({ type: 'stroke', text, x, y }),
            fillText: (text, x, y) => textCalls.push({ type: 'fill', text, x, y }),
            set globalAlpha(v) { calls.push({ globalAlpha: v }); },
            fillStyle: null,
            strokeStyle: null,
            lineWidth: null,
            font: null,
            textAlign: null
        };

        mockTilesetImage = { width: 256, height: 256 };
    });

    const mockGetRect = (id) => ({ x: id * 16, y: 0, width: 16, height: 16 });

    it('should call save and restore for each effect', () => {
        const effects = [createHarvestEffect(48, 64, 5)];
        renderEffects(mockCtx, effects, mockTilesetImage, mockGetRect, 16);
        expect(calls[0]).toBe('save');
        expect(calls[calls.length - 1]).toBe('restore');
    });

    it('should call drawImage with the tilesetImage', () => {
        const effects = [createHarvestEffect(48, 64, 5)];
        renderEffects(mockCtx, effects, mockTilesetImage, mockGetRect, 16);
        expect(draws.length).toBe(1);
        expect(draws[0][0]).toBe(mockTilesetImage);
    });

    it('should draw "+1" text (stroke and fill) for each effect', () => {
        const effects = [createHarvestEffect(48, 64, 5)];
        renderEffects(mockCtx, effects, mockTilesetImage, mockGetRect, 16);
        expect(textCalls.length).toBe(2);
        expect(textCalls[0].text).toBe('+1');
        expect(textCalls[1].text).toBe('+1');
        expect(textCalls[0].type).toBe('stroke');
        expect(textCalls[1].type).toBe('fill');
    });

    it('should draw +1 text centered on effect x', () => {
        const effects = [createHarvestEffect(48, 64, 5)];
        renderEffects(mockCtx, effects, mockTilesetImage, mockGetRect, 16);
        expect(textCalls[0].x).toBe(48);
        expect(textCalls[1].x).toBe(48);
    });

    it('should set globalAlpha to the effect alpha', () => {
        const effects = [createHarvestEffect(48, 64, 5)];
        effects[0].alpha = 0.5;
        renderEffects(mockCtx, effects, mockTilesetImage, mockGetRect, 16);
        const alphaSet = calls.find(c => c && typeof c === 'object' && 'globalAlpha' in c);
        expect(alphaSet.globalAlpha).toBeCloseTo(0.5, 3);
    });

    it('should not call drawImage for an empty effects array', () => {
        renderEffects(mockCtx, [], mockTilesetImage, mockGetRect, 16);
        expect(draws.length).toBe(0);
        expect(calls.length).toBe(0);
    });

    it('should call save/restore N times for N effects', () => {
        const effects = [
            createHarvestEffect(10, 10, 1),
            createHarvestEffect(20, 20, 2),
            createHarvestEffect(30, 30, 3)
        ];
        renderEffects(mockCtx, effects, mockTilesetImage, mockGetRect, 16);
        const saves = calls.filter(c => c === 'save');
        const restores = calls.filter(c => c === 'restore');
        expect(saves.length).toBe(3);
        expect(restores.length).toBe(3);
    });

    it('should use getTilesetSourceRect result for drawImage source coords', () => {
        const effects = [createHarvestEffect(48, 64, 7)];
        renderEffects(mockCtx, effects, mockTilesetImage, mockGetRect, 16);
        const expected = mockGetRect(7); // { x:112, y:0, w:16, h:16 }
        // drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
        expect(draws[0][1]).toBe(expected.x);
        expect(draws[0][2]).toBe(expected.y);
        expect(draws[0][3]).toBe(expected.width);
        expect(draws[0][4]).toBe(expected.height);
    });
});
