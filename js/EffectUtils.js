/**
 * Shared utilities for floating harvest/resource effects.
 * Used by CropManager, TreeManager, OreManager, and ForestGenerator.
 *
 * Effect struct: { x, y, tileId, timer, duration, alpha }
 */

import { CONFIG } from './config.js';

/**
 * Apply optional alpha to a canvas context while drawing.
 * Skips save/restore entirely when alpha === 1 for maximum performance.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} alpha
 * @param {Function} drawFn
 */
export function withAlpha(ctx, alpha, drawFn) {
    if (alpha < 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
        drawFn();
        ctx.restore();
    } else {
        drawFn();
    }
}

/**
 * Create a floating harvest effect object.
 * @param {number} x - World pixel X (center of tile)
 * @param {number} y - World pixel Y (top of tile)
 * @param {number} tileId - Tileset tile ID to render as the icon
 * @returns {{ x, y, tileId, timer, duration, alpha }}
 */
export function createHarvestEffect(x, y, tileId) {
    return { x, y, tileId, timer: 0, duration: CONFIG.effects.floatingDuration, alpha: 1 };
}

/**
 * Update all effects in an array (float upward, fade out, remove when done).
 * Mutates the array in-place using reverse iteration for safe splicing.
 * @param {Array} effects
 * @param {number} deltaTime - Elapsed ms since last frame
 */
export function updateEffects(effects, deltaTime) {
    let hasExpired = false;
    for (let i = 0; i < effects.length; i++) {
        const e = effects[i];
        e.timer += deltaTime;
        e.y -= deltaTime * 0.05;
        e.alpha = 1 - (e.timer / e.duration);
        if (e.timer >= e.duration) hasExpired = true;
    }
    // Single-pass removal — avoids O(n) shifts per splice inside the loop
    if (hasExpired) {
        let write = 0;
        for (let i = 0; i < effects.length; i++) {
            if (effects[i].timer < effects[i].duration) effects[write++] = effects[i];
        }
        effects.length = write;
    }
}

/**
 * Render all effects as a tileset icon + text label using a single save/restore.
 * Only globalAlpha and fillStyle change per effect (all other state set once).
 * Effects may include optional `text` (default '+1') and `textColor` (default '#ffffff').
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} effects
 * @param {HTMLImageElement} tilesetImage
 * @param {function(number): {x,y,width,height}} getTilesetSourceRect
 * @param {number} tileSize
 */
export function renderEffects(ctx, effects, tilesetImage, getTilesetSourceRect, tileSize) {
    if (!effects.length) return;
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.font = 'bold 8px Arial';
    ctx.textAlign = 'center';
    for (const e of effects) {
        ctx.globalAlpha = e.alpha;
        const src = getTilesetSourceRect(e.tileId);
        ctx.drawImage(
            tilesetImage,
            src.x, src.y, src.width, src.height,
            e.x - tileSize / 2, e.y - tileSize / 2, tileSize, tileSize
        );
        const label = e.text ?? '+1';
        ctx.fillStyle = e.textColor ?? '#ffffff';
        const textY = e.y - tileSize / 2 - 2;
        ctx.strokeText(label, e.x, textY);
        ctx.fillText(label, e.x, textY);
    }
    ctx.restore();
}

/**
 * Render effects from multiple arrays in a single batched draw pass (one save/restore total).
 * Skips empty arrays with no overhead.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array[]} effectArrays - List of effect arrays from different managers
 * @param {HTMLImageElement} tilesetImage
 * @param {function(number): {x,y,width,height}} getTilesetSourceRect
 * @param {number} tileSize
 */
export function renderEffectsMulti(ctx, effectArrays, tilesetImage, getTilesetSourceRect, tileSize) {
    // Check if there's anything to render before paying save/restore cost
    let hasAny = false;
    for (const arr of effectArrays) { if (arr?.length) { hasAny = true; break; } }
    if (!hasAny) return;

    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.font = 'bold 8px Arial';
    ctx.textAlign = 'center';
    for (const effects of effectArrays) {
        if (!effects?.length) continue;
        for (const e of effects) {
            ctx.globalAlpha = e.alpha;
            const src = getTilesetSourceRect(e.tileId);
            ctx.drawImage(
                tilesetImage,
                src.x, src.y, src.width, src.height,
                e.x - tileSize / 2, e.y - tileSize / 2, tileSize, tileSize
            );
            const label = e.text ?? '+1';
            ctx.fillStyle = e.textColor ?? '#ffffff';
            const textY = e.y - tileSize / 2 - 2;
            ctx.strokeText(label, e.x, textY);
            ctx.fillText(label, e.x, textY);
        }
    }
    ctx.restore();
}
