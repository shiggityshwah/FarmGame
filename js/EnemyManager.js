import { Enemy } from './Enemy.js';
import { Logger } from './Logger.js';

const log = Logger.create('EnemyManager');

export class EnemyManager {
    constructor(tilemap) {
        this.tilemap = tilemap;
        this.enemies = [];
        this.pathfinder = null;
        this.game = null; // Reference to game for player access
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

            const enemyTileX = Math.floor(enemy.x / tileSize);
            const enemyTileY = Math.floor(enemy.y / tileSize);

            if (enemyTileX === tileX && enemyTileY === tileY) {
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
        return this.enemies.filter(e => e.isAlive);
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
                        // Damage callback - hurt the target
                        if (type === 'human' && this.game.takeDamage) {
                            this.game.takeDamage(damage, enemy);
                        } else if (type === 'goblin' && this.game.takeGoblinDamage) {
                            this.game.takeGoblinDamage(damage, enemy);
                        }
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
        const targets = [];

        // Check human
        if (this.game && this.game.humanPosition && this.game.playerHealth > 0) {
            const humanPos = this.game.humanPosition;
            if (enemy.isInVisionRange(humanPos.x, humanPos.y, tileSize)) {
                const dx = humanPos.x - enemy.x;
                const dy = humanPos.y - enemy.y;
                targets.push({
                    target: humanPos,
                    type: 'human',
                    distance: Math.sqrt(dx * dx + dy * dy)
                });
            }
        }

        // Check goblin
        if (this.game && this.game.goblinPosition && this.game.goblinHealth > 0) {
            const goblinPos = this.game.goblinPosition;
            if (enemy.isInVisionRange(goblinPos.x, goblinPos.y, tileSize)) {
                const dx = goblinPos.x - enemy.x;
                const dy = goblinPos.y - enemy.y;
                targets.push({
                    target: goblinPos,
                    type: 'goblin',
                    distance: Math.sqrt(dx * dx + dy * dy)
                });
            }
        }

        // Return closest target or null if none found
        if (targets.length === 0) return null;
        targets.sort((a, b) => a.distance - b.distance);
        return targets[0];
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
        return this.enemies.filter(e => e.isAlive).length;
    }

    // Get all enemies currently in combat with the player
    getEngagedEnemies() {
        return this.enemies.filter(e => e.isAlive && e.isInCombat);
    }

    // Get enemies within a certain range of a position (for player vision check)
    getEnemiesInRange(worldX, worldY, rangeTiles) {
        const tileSize = this.tilemap.tileSize;
        const centerTileX = Math.floor(worldX / tileSize);
        const centerTileY = Math.floor(worldY / tileSize);

        return this.enemies.filter(e => {
            if (!e.isAlive) return false;
            const enemyTileX = Math.floor(e.x / tileSize);
            const enemyTileY = Math.floor(e.y / tileSize);
            const distance = Math.abs(centerTileX - enemyTileX) + Math.abs(centerTileY - enemyTileY);
            return distance <= rangeTiles;
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
