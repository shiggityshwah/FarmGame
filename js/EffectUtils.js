/**
 * Shared utilities for floating harvest/resource effects.
 * Used by CropManager, TreeManager, OreManager, and ForestGenerator.
 *
 * Effect struct: { x, y, tileId, timer, duration, alpha }
 */

/**
 * Create a floating harvest effect object.
 * @param {number} x - World pixel X (center of tile)
 * @param {number} y - World pixel Y (top of tile)
 * @param {number} tileId - Tileset tile ID to render as the icon
 * @returns {{ x, y, tileId, timer, duration, alpha }}
 */
export function createHarvestEffect(x, y, tileId) {
    return { x, y, tileId, timer: 0, duration: 1000, alpha: 1 };
}

/**
 * Update all effects in an array (float upward, fade out, remove when done).
 * Mutates the array in-place using reverse iteration for safe splicing.
 * @param {Array} effects
 * @param {number} deltaTime - Elapsed ms since last frame
 */
export function updateEffects(effects, deltaTime) {
    for (let i = effects.length - 1; i >= 0; i--) {
        const e = effects[i];
        e.timer += deltaTime;
        e.y -= deltaTime * 0.05;
        e.alpha = 1 - (e.timer / e.duration);
        if (e.timer >= e.duration) effects.splice(i, 1);
    }
}

/**
 * Render all effects as a tileset icon + "+1" text.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} effects
 * @param {HTMLImageElement} tilesetImage
 * @param {function(number): {x,y,width,height}} getTilesetSourceRect
 * @param {number} tileSize
 */
export function renderEffects(ctx, effects, tilesetImage, getTilesetSourceRect, tileSize) {
    for (const e of effects) {
        ctx.save();
        ctx.globalAlpha = e.alpha;
        const src = getTilesetSourceRect(e.tileId);
        ctx.drawImage(
            tilesetImage,
            src.x, src.y, src.width, src.height,
            e.x - tileSize / 2, e.y - tileSize / 2, tileSize, tileSize
        );
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.font = 'bold 8px Arial';
        ctx.textAlign = 'center';
        const textY = e.y - tileSize / 2 - 2;
        ctx.strokeText('+1', e.x, textY);
        ctx.fillText('+1', e.x, textY);
        ctx.restore();
    }
}
