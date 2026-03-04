import { updateEffects, renderEffects as renderFloatingEffects } from './EffectUtils.js';

/**
 * Shared base class for entity managers that track a list of resources
 * (trees, ore veins, crops). Provides:
 *  - Unified effects array updated/rendered the same way across all subclasses
 *  - Reverse-splice cleanup of gone resources
 *  - Template-method hooks: _updateResources(), _cleanupGone(), renderEffects()
 *
 * Subclasses must assign `this.resources` to their own named array alias
 * (e.g. `this.trees = this.resources`) and implement domain-specific methods.
 */
export class ResourceManager {
    constructor(tilemap) {
        this.tilemap = tilemap;
        this.resources = [];
        this.effects = []; // Floating "+1 item" harvest/mine/gather effects
    }

    /**
     * Update all resources, clean up gone ones, and tick effects.
     * CropManager overrides this to apply growth-speed multiplier.
     */
    update(deltaTime) {
        this._updateResources(deltaTime);
        this._cleanupGone();
        updateEffects(this.effects, deltaTime);
    }

    /** Iterate resources and call resource.update(). Override to wrap deltaTime. */
    _updateResources(deltaTime) {
        for (const resource of this.resources) {
            resource.update(deltaTime);
        }
    }

    /** Remove resources whose isGone flag is set (in-place, no allocation). */
    _cleanupGone() {
        for (let i = this.resources.length - 1; i >= 0; i--) {
            if (this.resources[i].isGone) this.resources.splice(i, 1);
        }
    }

    /** Render floating effects (identical across all subclasses). */
    renderEffects(ctx, camera) {
        const tileSize = this.tilemap.tileSize;
        renderFloatingEffects(ctx, this.effects, this.tilemap.tilesetImage,
            id => this.tilemap.getTilesetSourceRect(id), tileSize);
    }
}
