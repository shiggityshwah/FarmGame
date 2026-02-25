import { SpriteAnimator } from './SpriteAnimator.js';
import { CONFIG } from './config.js';
import { Logger } from './Logger.js';
import { worldToTile, manhattanDist } from './TileUtils.js';

const log = Logger.create('Enemy');

// Enemy animation data
const ENEMY_ANIMATIONS = {
    skeleton: {
        IDLE: { file: 'skeleton_idle_strip6.png', frames: 6 },
        WALK: { file: 'skeleton_walk_strip8.png', frames: 8 },
        ATTACK: { file: 'skeleton_attack_strip7.png', frames: 7 },
        HURT: { file: 'skeleton_hurt_strip7.png', frames: 7 },
        DEATH: { file: 'skeleton_death_strip10.png', frames: 10 },
        JUMP: { file: 'skeleton_jump_strip10.png', frames: 10 }
    }
};

export class Enemy {
    constructor(x, y, type = 'skeleton') {
        this.x = x;
        this.y = y;
        this.type = type;

        // Get stats from config based on enemy type
        const stats = CONFIG.enemy[type] || CONFIG.enemy.skeleton;

        // Stats
        this.maxHealth = stats.maxHealth;
        this.health = this.maxHealth;
        this.damage = stats.damage;
        this.isAlive = true;
        this.isDying = false;

        // Vision and combat
        this.visionRange = stats.visionRange;
        this.attackRange = stats.attackRange;
        this.attackCooldown = stats.attackCooldown;
        this.lastAttackTime = 0;
        this.target = null; // Current target to attack
        this.isInCombat = false;
        this.isAttacking = false;

        // Movement
        this.moveSpeed = stats.moveSpeed;
        this.currentPath = null;
        this.pathfinder = null; // Set by EnemyManager
        this.lastPathfindTime = 0;
        this.pathfindCooldown = stats.pathfindCooldown;

        // Sprite
        this.sprite = null;
        this.currentAnimation = 'IDLE';
        this.facingLeft = false;

        // Tile position (for selection)
        this.tileX = 0;
        this.tileY = 0;

        // Damage flash effect
        this.damageFlashTimer = 0;
        this.isDamageFlashing = false;

        // Fade out after death
        this.isFadingOut = false;
        this.fadeAlpha = 1.0;
        this.fadeDuration = stats.fadeDuration;
    }

    async load(tileSize) {
        // Calculate tile position
        this.tileX = Math.floor(this.x / tileSize);
        this.tileY = Math.floor(this.y / tileSize);

        // Load initial sprite
        await this.setAnimation('IDLE');
    }

    async setAnimation(animationName, loop = true, onComplete = null) {
        const animations = ENEMY_ANIMATIONS[this.type];
        if (!animations || !animations[animationName]) {
            log.error(`Animation ${animationName} not found for ${this.type}`);
            return;
        }

        const animData = animations[animationName];
        this.currentAnimation = animationName;

        // CRITICAL FIX: If we're changing animations while attacking, reset the attack flag
        // This prevents isAttacking from getting stuck when attack animation is interrupted
        // (e.g., enemy takes damage during attack and switches to HURT animation)
        if (this.isAttacking && animationName !== 'ATTACK') {
            this.isAttacking = false;
        }

        // Dispose of old sprite to prevent memory leaks and stale callbacks
        if (this.sprite) {
            this.sprite.setOnComplete(null);
            this.sprite = null;
        }

        // Create new sprite for this animation
        const basePath = `Characters/${this.type.charAt(0).toUpperCase() + this.type.slice(1)}/PNG/`;

        this.sprite = new SpriteAnimator(this.x, this.y, animData.frames, 8);
        await this.sprite.load(basePath + animData.file);

        this.sprite.setLooping(loop);
        this.sprite.setOnComplete(onComplete);
        this.sprite.setFacingLeft(this.facingLeft);
    }

    setPosition(x, y) {
        this.x = x;
        this.y = y;
        if (this.sprite) {
            this.sprite.setPosition(x, y);
        }
    }

    setFacingLeft(facingLeft) {
        this.facingLeft = facingLeft;
        if (this.sprite) {
            this.sprite.setFacingLeft(facingLeft);
        }
    }

    takeDamage(amount) {
        if (!this.isAlive || this.isDying) return false;

        this.health -= amount;
        this.isDamageFlashing = true;
        const stats = CONFIG.enemy[this.type] || CONFIG.enemy.skeleton;
        this.damageFlashTimer = stats.damageFlashDuration;

        log.debug(`${this.type} took ${amount} damage! Health: ${this.health}/${this.maxHealth}`);

        if (this.health <= 0) {
            this.health = 0;
            this.die();
            return true; // Enemy died
        }

        // Play hurt animation
        this.playHurtAnimation();
        return false;
    }

    async playHurtAnimation() {
        if (this.isDying) return;

        await this.setAnimation('HURT', false, () => {
            // Return to idle after hurt
            if (this.isAlive && !this.isDying) {
                this.setAnimation('IDLE', true);
            }
        });
    }

    async die() {
        this.isDying = true;
        this.isAlive = false;

        log.info(`${this.type} died!`);

        await this.setAnimation('DEATH', false, () => {
            // Start fading out after death animation completes
            log.debug(`${this.type} death animation complete, starting fade out`);
            this.isFadingOut = true;
        });
    }

    setPathfinder(pathfinder) {
        this.pathfinder = pathfinder;
    }

    // Check if a target position is within vision range
    isInVisionRange(targetX, targetY, tileSize) {
        return manhattanDist(
            worldToTile(this.x, tileSize), worldToTile(this.y, tileSize),
            worldToTile(targetX, tileSize), worldToTile(targetY, tileSize)
        ) <= this.visionRange;
    }

    // Check if target is within attack range (adjacent tile)
    isInAttackRange(targetX, targetY, tileSize) {
        return manhattanDist(
            worldToTile(this.x, tileSize), worldToTile(this.y, tileSize),
            worldToTile(targetX, tileSize), worldToTile(targetY, tileSize)
        ) <= this.attackRange;
    }

    // Set a target to pursue and attack
    setTarget(target) {
        this.target = target;
        this.isInCombat = target !== null;
    }

    // Clear the current target
    clearTarget() {
        this.target = null;
        this.isInCombat = false;
        this.currentPath = null;
        if (!this.isDying && this.isAlive && !this.isAttacking) {
            this.setAnimation('IDLE', true);
        }
    }

    // Move towards target using pathfinding
    moveTowardsTarget(tileSize, deltaTime) {
        if (!this.target || !this.pathfinder || this.isDying || this.isAttacking) return;

        const currentTime = performance.now();
        const targetTileX = worldToTile(this.target.x, tileSize);
        const targetTileY = worldToTile(this.target.y, tileSize);
        const myTileX = worldToTile(this.x, tileSize);
        const myTileY = worldToTile(this.y, tileSize);

        // Check if we need a new path (with cooldown to prevent excessive pathfinding)
        if (!this.currentPath || this.currentPath.length === 0) {
            // Only recalculate path if cooldown has passed
            if (currentTime - this.lastPathfindTime < this.pathfindCooldown) {
                return; // Wait for cooldown
            }
            this.lastPathfindTime = currentTime;

            // Find path to adjacent tile of target
            const adjacentTile = this.findAdjacentTile(myTileX, myTileY, targetTileX, targetTileY);
            if (adjacentTile) {
                this.currentPath = this.pathfinder.findPath(myTileX, myTileY, adjacentTile.x, adjacentTile.y);
                if (this.currentPath && this.currentPath.length > 0) {
                    // Remove starting tile
                    if (this.currentPath[0].x === myTileX && this.currentPath[0].y === myTileY) {
                        this.currentPath.shift();
                    }
                    if (this.currentAnimation !== 'WALK') {
                        this.setAnimation('WALK', true);
                    }
                }
            }
        }

        // Follow path
        if (this.currentPath && this.currentPath.length > 0) {
            const nextTile = this.currentPath[0];
            const targetWorldX = nextTile.x * tileSize + tileSize / 2;
            const targetWorldY = nextTile.y * tileSize + tileSize / 2;

            const dx = targetWorldX - this.x;
            const dy = targetWorldY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < CONFIG.movement.waypointThreshold) {
                // Reached waypoint
                this.currentPath.shift();
                // Update tile position
                this.tileX = nextTile.x;
                this.tileY = nextTile.y;
            } else {
                // Update facing direction
                if (Math.abs(dx) > 1) {
                    this.setFacingLeft(dx < 0);
                }

                // Move towards waypoint
                const moveDistance = this.moveSpeed * deltaTime / 1000;
                const ratio = Math.min(moveDistance, distance) / distance;

                this.x += dx * ratio;
                this.y += dy * ratio;

                if (this.sprite) {
                    this.sprite.setPosition(this.x, this.y);
                }
            }
        }
    }

    // Find an adjacent tile to stand on while attacking
    findAdjacentTile(startX, startY, targetX, targetY) {
        const adjacentPositions = [
            { x: targetX - 1, y: targetY },
            { x: targetX + 1, y: targetY },
            { x: targetX, y: targetY - 1 },
            { x: targetX, y: targetY + 1 }
        ];

        // Sort by distance to current position
        adjacentPositions.sort((a, b) => {
            const distA = Math.abs(a.x - startX) + Math.abs(a.y - startY);
            const distB = Math.abs(b.x - startX) + Math.abs(b.y - startY);
            return distA - distB;
        });

        // Find first walkable tile
        for (const pos of adjacentPositions) {
            if (this.pathfinder && this.pathfinder.isWalkable(pos.x, pos.y)) {
                return pos;
            }
        }

        return null;
    }

    // Perform attack on target
    async performAttack(target, currentTime, onDamageDealt) {
        if (this.isAttacking || this.isDying || !this.isAlive) return;
        if (currentTime - this.lastAttackTime < this.attackCooldown) return;

        this.isAttacking = true;
        this.lastAttackTime = currentTime;

        // Face the target
        this.setFacingLeft(target.x < this.x);

        await this.setAnimation('ATTACK', false, () => {
            // Deal damage at end of attack animation
            if (onDamageDealt) {
                onDamageDealt(this.damage);
            }
            this.isAttacking = false;

            // Return to appropriate animation
            if (this.isInCombat && this.isAlive && !this.isDying) {
                this.setAnimation('IDLE', true);
            }
        });
    }

    update(deltaTime) {
        if (this.sprite) {
            this.sprite.update(deltaTime);
        }

        // Update damage flash
        if (this.isDamageFlashing) {
            this.damageFlashTimer -= deltaTime;
            if (this.damageFlashTimer <= 0) {
                this.isDamageFlashing = false;
            }
        }

        // Update fade out after death
        if (this.isFadingOut) {
            this.fadeAlpha -= deltaTime / this.fadeDuration;
            if (this.fadeAlpha <= 0) {
                this.fadeAlpha = 0;
            }
        }
    }

    // Check if enemy has completely faded out and can be removed
    isFullyFaded() {
        return this.isFadingOut && this.fadeAlpha <= 0;
    }

    render(ctx, camera) {
        if (!this.sprite) return;

        // Don't render if fully faded
        if (this.fadeAlpha <= 0) return;

        ctx.save();

        // Apply fade out effect
        if (this.isFadingOut && this.fadeAlpha < 1) {
            ctx.globalAlpha = this.fadeAlpha;
        }

        // Apply damage flash effect (tint red)
        if (this.isDamageFlashing) {
            ctx.globalCompositeOperation = 'source-atop';
        }

        this.sprite.render(ctx, camera);

        ctx.restore();

        // Render health bar if damaged and alive
        if (this.isAlive && this.health < this.maxHealth) {
            this.renderHealthBar(ctx);
        }
    }

    renderHealthBar(ctx) {
        const barWidth = 24;
        const barHeight = 4;
        const barX = this.x - barWidth / 2;
        const barY = this.y - 20; // Above the sprite

        // Background (red)
        ctx.fillStyle = '#8B0000';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // Health (green)
        const healthPercent = this.health / this.maxHealth;
        ctx.fillStyle = '#32CD32';
        ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);

        // Border
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
    }

    // Check if a point is within this enemy's tile
    containsPoint(worldX, worldY, tileSize) {
        return worldToTile(this.x, tileSize) === worldToTile(worldX, tileSize) &&
               worldToTile(this.y, tileSize) === worldToTile(worldY, tileSize);
    }

    getTilePosition(tileSize) {
        return {
            x: worldToTile(this.x, tileSize),
            y: worldToTile(this.y, tileSize)
        };
    }

    // Get the Y position for depth sorting
    // Uses center position for proper depth with multi-tile sprites
    getSortY() {
        return this.y;
    }
}

export { ENEMY_ANIMATIONS };
