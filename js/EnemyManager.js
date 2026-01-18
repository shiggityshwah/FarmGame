import { Enemy } from './Enemy.js';

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
        console.log(`Spawned ${type} at tile (${tileX}, ${tileY})`);

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
        console.log(`Spawned ${type} at world (${worldX}, ${worldY})`);

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
        // Remove enemies that have finished their death animation
        this.enemies = this.enemies.filter(e => {
            if (!e.isAlive && e.sprite && e.sprite.animationFinished) {
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

            // Check if player is in vision range
            if (this.game && this.game.humanPosition) {
                const playerPos = this.game.humanPosition;

                if (enemy.isInVisionRange(playerPos.x, playerPos.y, tileSize)) {
                    // Player spotted - set as target
                    if (!enemy.target) {
                        enemy.setTarget({ x: playerPos.x, y: playerPos.y });
                        console.log(`${enemy.type} spotted player!`);

                        // Notify game that enemy engaged player
                        if (this.game.onEnemyEngaged) {
                            this.game.onEnemyEngaged(enemy);
                        }
                    } else {
                        // Update target position (player moves)
                        enemy.target.x = playerPos.x;
                        enemy.target.y = playerPos.y;
                    }

                    // Check if in attack range
                    if (enemy.isInAttackRange(playerPos.x, playerPos.y, tileSize)) {
                        // Attack the player
                        enemy.performAttack({ x: playerPos.x, y: playerPos.y }, currentTime, (damage) => {
                            // Damage callback - hurt the player
                            if (this.game.takeDamage) {
                                this.game.takeDamage(damage, enemy);
                            }
                        });
                    } else if (!enemy.isAttacking) {
                        // Move towards player
                        enemy.moveTowardsTarget(tileSize, deltaTime);
                    }
                } else {
                    // Player out of vision range
                    if (enemy.target) {
                        enemy.clearTarget();
                        console.log(`${enemy.type} lost sight of player`);

                        // Notify game that enemy disengaged
                        if (this.game.onEnemyDisengaged) {
                            this.game.onEnemyDisengaged(enemy);
                        }
                    }
                }
            }
        }

        // Optionally clean up dead enemies after some time
        // this.removeDeadEnemies();
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
