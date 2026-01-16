export class SpriteAnimator {
    constructor(x, y, frameCount, fps = 8) {
        this.x = x;
        this.y = y;
        this.frameCount = frameCount;
        this.currentFrame = 0;
        this.frameTime = 1000 / fps; // milliseconds per frame
        this.timeSinceLastFrame = 0;
        this.image = null;
        this.frameWidth = 0;
        this.frameHeight = 0;
        this.loaded = false;

        // Animation control
        this.looping = true;
        this.onAnimationComplete = null;
        this.animationFinished = false;

        // Direction (for flipping sprite)
        this.facingLeft = false;
    }

    async load(imagePath) {
        try {
            this.image = await this.loadImage(imagePath);
            this.frameWidth = Math.floor(this.image.width / this.frameCount);
            this.frameHeight = this.image.height;
            this.loaded = true;
            console.log(`Sprite loaded: ${imagePath} (${this.frameCount} frames, ${this.frameWidth}x${this.frameHeight}px each)`);
        } catch (error) {
            console.error('Failed to load sprite:', error);
            throw error;
        }
    }

    loadImage(path) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load image: ${path}`));
            img.src = path;
        });
    }

    update(deltaTime) {
        if (!this.loaded) return;
        if (this.animationFinished) return;

        this.timeSinceLastFrame += deltaTime;

        while (this.timeSinceLastFrame >= this.frameTime) {
            this.timeSinceLastFrame -= this.frameTime;
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

        const sourceX = this.currentFrame * this.frameWidth;
        const sourceY = 0;

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
}
