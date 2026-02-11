import { Logger } from './Logger.js';

const log = Logger.create('SpriteAnimator');

// Static image cache to prevent memory leaks from repeated loading
const imageCache = new Map();

// Cache statistics for debugging
let cacheHits = 0;
let cacheMisses = 0;

export class SpriteAnimator {
    constructor(x, y, frameCount, fps = 8, framesPerRow = null) {
        this.x = x;
        this.y = y;
        this.frameCount = frameCount;
        this.framesPerRow = framesPerRow; // null = single row (all frames in one row)
        this.currentFrame = 0;
        this.baseFps = fps;
        this.frameTime = 1000 / fps; // milliseconds per frame
        this.timeSinceLastFrame = 0;
        this.image = null;
        this.imagePath = null; // Track loaded path for cache reference
        this.frameWidth = 0;
        this.frameHeight = 0;
        this.loaded = false;

        // Animation control
        this.looping = true;
        this.onAnimationComplete = null;
        this.animationFinished = false;

        // Direction (for flipping sprite)
        this.facingLeft = false;

        // Speed multiplier (1.0 = normal, lower = faster animation)
        this.speedMultiplier = 1.0;
    }

    async load(imagePath) {
        try {
            this.imagePath = imagePath;
            this.image = await this.loadImage(imagePath);

            if (this.framesPerRow) {
                // Multi-row sprite: calculate frame dimensions from framesPerRow
                this.frameWidth = Math.floor(this.image.width / this.framesPerRow);
                const numRows = Math.ceil(this.frameCount / this.framesPerRow);
                this.frameHeight = Math.floor(this.image.height / numRows);
            } else {
                // Single-row sprite: all frames in one horizontal strip
                this.frameWidth = Math.floor(this.image.width / this.frameCount);
                this.frameHeight = this.image.height;
            }

            this.loaded = true;
        } catch (error) {
            log.error('Failed to load sprite:', error);
            throw error;
        }
    }

    loadImage(path) {
        // Check cache first
        if (imageCache.has(path)) {
            cacheHits++;
            return Promise.resolve(imageCache.get(path));
        }

        cacheMisses++;
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // Store in cache for reuse
                imageCache.set(path, img);
                resolve(img);
            };
            img.onerror = () => reject(new Error(`Failed to load image: ${path}`));
            img.src = path;
        });
    }

    // Clean up this animator instance
    dispose() {
        this.onAnimationComplete = null;
        this.image = null;
        this.loaded = false;
    }

    // Static method to get cache statistics
    static getCacheStats() {
        return {
            size: imageCache.size,
            hits: cacheHits,
            misses: cacheMisses,
            hitRate: cacheHits + cacheMisses > 0
                ? (cacheHits / (cacheHits + cacheMisses) * 100).toFixed(1) + '%'
                : '0%'
        };
    }

    // Static method to clear cache (useful for testing or memory management)
    static clearCache() {
        imageCache.clear();
        cacheHits = 0;
        cacheMisses = 0;
    }

    update(deltaTime) {
        if (!this.loaded) return;
        if (this.animationFinished) return;

        this.timeSinceLastFrame += deltaTime;

        // Apply speed multiplier to frame time
        const effectiveFrameTime = this.frameTime * this.speedMultiplier;

        while (this.timeSinceLastFrame >= effectiveFrameTime) {
            this.timeSinceLastFrame -= effectiveFrameTime;
            this.currentFrame++;

            if (this.currentFrame >= this.frameCount) {
                if (this.looping) {
                    this.currentFrame = 0;
                } else {
                    // Stay on last frame
                    this.currentFrame = this.frameCount - 1;
                    this.animationFinished = true;

                    // Fire completion callback
                    if (this.onAnimationComplete) {
                        this.onAnimationComplete();
                    }
                    return;
                }
            }
        }
    }

    render(ctx, camera) {
        if (!this.loaded) return;

        // Calculate source position (handle multi-row sprites)
        let sourceX, sourceY;
        if (this.framesPerRow) {
            const col = this.currentFrame % this.framesPerRow;
            const row = Math.floor(this.currentFrame / this.framesPerRow);
            sourceX = col * this.frameWidth;
            sourceY = row * this.frameHeight;
        } else {
            sourceX = this.currentFrame * this.frameWidth;
            sourceY = 0;
        }

        // Save context state for potential flipping
        ctx.save();

        if (this.facingLeft) {
            // Flip horizontally: translate to position, scale -1 on X, draw at negative offset
            ctx.translate(this.x, this.y - this.frameHeight / 2);
            ctx.scale(-1, 1);
            ctx.drawImage(
                this.image,
                sourceX, sourceY, this.frameWidth, this.frameHeight,
                -this.frameWidth / 2, 0,
                this.frameWidth, this.frameHeight
            );
        } else {
            // Normal rendering
            ctx.drawImage(
                this.image,
                sourceX, sourceY, this.frameWidth, this.frameHeight,
                this.x - this.frameWidth / 2, this.y - this.frameHeight / 2,
                this.frameWidth, this.frameHeight
            );
        }

        ctx.restore();
    }

    setPosition(x, y) {
        this.x = x;
        this.y = y;
    }

    setLooping(looping) {
        this.looping = looping;
    }

    setOnComplete(callback) {
        this.onAnimationComplete = callback;
    }

    resetAnimation() {
        this.currentFrame = 0;
        this.timeSinceLastFrame = 0;
        this.animationFinished = false;
    }

    setFacingLeft(facingLeft) {
        this.facingLeft = facingLeft;
    }

    setSpeedMultiplier(multiplier) {
        this.speedMultiplier = multiplier;
    }
}
