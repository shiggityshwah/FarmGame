import { Enemy } from './Enemy.js';
import { Logger } from './Logger.js';
import { worldToTile, manhattanDist } from './TileUtils.js';

const log = Logger.create('EnemyManager');

export class EnemyManager {
    constructor(tilemap) {
        this.tilemap = tilemap;
        this.enemies = [];
        this.pathfinder = null;
        this.game = null; // Reference to game for player access
        this._aliveEnemies = null; // Per-frame cache, invalidated at start of update()
    }

    setPathfinder(pathfinder) {
        this.pathfinder = pathfinder;
        // Update pathfinder for existing enemies
        for (const enemy of this.enemies) {
            enemy.setPathfinder(pathfinder);
        }
    }

    setGame(game) {
        this.game = game;
    }

    async spawnEnemy(tileX, tileY, type = 'skeleton') {
        const tileSize = this.tilemap.tileSize;
        const worldX = tileX * tileSize + tileSize / 2;
        const worldY = tileY * tileSize + tileSize / 2;

        const enemy = new Enemy(worldX, worldY, type);
        await enemy.load(tileSize);

        if (this.pathfinder) {
            enemy.setPathfinder(this.pathfinder);
        }

        this.enemies.push(enemy);
        log.debug(`Spawned ${type} at tile (${tileX}, ${tileY})`);

        return enemy;
    }

    async spawnEnemyAtWorld(worldX, worldY, type = 'skeleton') {
        const tileSize = this.tilemap.tileSize;

        const enemy = new Enemy(worldX, worldY, type);
        await enemy.load(tileSize);

        if (this.pathfinder) {
            enemy.setPathfinder(this.pathfinder);
        }

        this.enemies.push(enemy);
        log.debug(`Spawned ${type} at world (${worldX}, ${worldY})`);

        return enemy;
    }

    getEnemyAt(tileX, tileY) {
        const tileSize = this.tilemap.tileSize;

        for (const enemy of this.enemies) {
            if (!enemy.isAlive) continue;
            if (worldToTile(enemy.x, tileSize) === tileX &&
                worldToTile(enemy.y, tileSize) === tileY) {
                return enemy;
            }
        }

        return null;
    }

    getEnemyAtWorld(worldX, worldY) {
        const tileSize = this.tilemap.tileSize;
        const tileX = Math.floor(worldX / tileSize);
        const tileY = Math.floor(worldY / tileSize);

        return this.getEnemyAt(tileX, tileY);
    }

    getAllAliveEnemies() {
        if (!this._aliveEnemies) {
            this._aliveEnemies = this.enemies.filter(e => e.isAlive);
        }
        return this._aliveEnemies;
    }

    removeDeadEnemies() {
        // Remove enemies that have fully faded out after death
        this.enemies = this.enemies.filter(e => {
            if (e.isFullyFaded()) {
                log.debug(`Removing ${e.type} from game`);
                return false; // Remove
            }
            return true; // Keep
        });
    }

    update(deltaTime) {
        const tileSize = this.tilemap.tileSize;
        const currentTime = performance.now();

        // Invalidate per-frame alive cache at the start of each update
        this._aliveEnemies = null;

        for (const enemy of this.enemies) {
            enemy.update(deltaTime);

            // Skip AI for dead or dying enemies
            if (!enemy.isAlive || enemy.isDying) continue;

            // Find closest target (human or goblin) in vision range
            const closestTarget = this.findClosestTarget(enemy, tileSize);

            if (closestTarget) {
                const { target, type } = closestTarget;

                // Target spotted - set or update target
                if (!enemy.target || enemy.targetType !== type) {
                    enemy.setTarget({ x: target.x, y: target.y });
                    enemy.targetType = type; // Track which type we're targeting
                    log.debug(`${enemy.type} spotted ${type}!`);

                    // Notify game that enemy engaged player (only for human)
                    if (type === 'human' && this.game.onEnemyEngaged) {
                        this.game.onEnemyEngaged(enemy);
                    }
                } else {
                    // Update target position (target moves)
                    enemy.target.x = target.x;
                    enemy.target.y = target.y;
                }

                // Check if in attack range
                if (enemy.isInAttackRange(target.x, target.y, tileSize)) {
                    // Attack the target
                    enemy.performAttack({ x: target.x, y: target.y }, currentTime, (damage) => {
                        closestTarget.onHit(damage, enemy);
                    });
                } else if (!enemy.isAttacking) {
                    // Move towards target
                    enemy.moveTowardsTarget(tileSize, deltaTime);
                }
            } else {
                // No target in vision range
                if (enemy.target) {
                    const wasTargetingHuman = enemy.targetType === 'human';
                    enemy.clearTarget();
                    enemy.targetType = null;
                    log.debug(`${enemy.type} lost sight of target`);

                    // Notify game that enemy disengaged (only for human)
                    if (wasTargetingHuman && this.game.onEnemyDisengaged) {
                        this.game.onEnemyDisengaged(enemy);
                    }
                }
            }
        }

        // Clean up enemies that have fully faded out
        this.removeDeadEnemies();
    }

    // Find the closest valid target (human or goblin) in vision range
    findClosestTarget(enemy, tileSize) {
        if (!this.game) return null;

        let bestResult = null;
        let bestDistSq = Infinity;

        for (const ct of this.game.getCombatTargets()) {
            const pos = ct.position;
            if (!pos || !enemy.isInVisionRange(pos.x, pos.y, tileSize)) continue;
            const dx = pos.x - enemy.x;
            const dy = pos.y - enemy.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                bestResult = { target: pos, type: ct.type, onHit: ct.onHit };
            }
        }

        return bestResult;
    }

    render(ctx, camera) {
        for (const enemy of this.enemies) {
            enemy.render(ctx, camera);
        }
    }

    getEnemyCount() {
        return this.enemies.length;
    }

    getAliveEnemyCount() {
        return this.getAllAliveEnemies().length;
    }

    // Get all enemies currently in combat with the player
    getEngagedEnemies() {
        return this.enemies.filter(e => e.isAlive && e.isInCombat);
    }

    // Get enemies within a certain range of a position (for player vision check)
    getEnemiesInRange(worldX, worldY, rangeTiles) {
        const tileSize = this.tilemap.tileSize;
        const centerTileX = worldToTile(worldX, tileSize);
        const centerTileY = worldToTile(worldY, tileSize);

        return this.enemies.filter(e => {
            if (!e.isAlive) return false;
            return manhattanDist(
                centerTileX, centerTileY,
                worldToTile(e.x, tileSize), worldToTile(e.y, tileSize)
            ) <= rangeTiles;
        });
    }

    // Get the closest enemy within range
    getClosestEnemyInRange(worldX, worldY, rangeTiles) {
        const enemiesInRange = this.getEnemiesInRange(worldX, worldY, rangeTiles);
        if (enemiesInRange.length === 0) return null;

        let closestEnemy = null;
        let closestDistance = Infinity;

        for (const enemy of enemiesInRange) {
            const dx = enemy.x - worldX;
            const dy = enemy.y - worldY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestEnemy = enemy;
            }
        }

        return closestEnemy;
    }

    // Get all enemies for depth-sorted rendering
    getEnemies() {
        return this.enemies;
    }

    // Render a single enemy (for depth-sorted rendering)
    renderEnemy(ctx, enemy, camera) {
        enemy.render(ctx, camera);
    }
}
