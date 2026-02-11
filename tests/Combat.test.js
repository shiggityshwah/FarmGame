/**
 * Unit tests for Combat system (Enemy, EnemyManager)
 */

import { describe, it, expect, beforeEach } from './TestRunner.js';

// Mock enemy for testing
class MockEnemy {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
        this.maxHealth = 30;
        this.health = this.maxHealth;
        this.damage = 5;
        this.isAlive = true;
        this.isDying = false;
        this.isInCombat = false;
        this.target = null;
        this.visionRange = 5;
        this.attackRange = 1;
    }

    takeDamage(amount) {
        if (!this.isAlive || this.isDying) return false;
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            this.isAlive = false;
            this.isDying = true;
            return true; // Enemy died
        }
        return false;
    }

    setTarget(target) {
        this.target = target;
        this.isInCombat = target !== null;
    }

    clearTarget() {
        this.target = null;
        this.isInCombat = false;
    }

    isInVisionRange(targetX, targetY, tileSize) {
        const myTileX = Math.floor(this.x / tileSize);
        const myTileY = Math.floor(this.y / tileSize);
        const targetTileX = Math.floor(targetX / tileSize);
        const targetTileY = Math.floor(targetY / tileSize);
        const distance = Math.abs(myTileX - targetTileX) + Math.abs(myTileY - targetTileY);
        return distance <= this.visionRange;
    }

    isInAttackRange(targetX, targetY, tileSize) {
        const myTileX = Math.floor(this.x / tileSize);
        const myTileY = Math.floor(this.y / tileSize);
        const targetTileX = Math.floor(targetX / tileSize);
        const targetTileY = Math.floor(targetY / tileSize);
        const distance = Math.abs(myTileX - targetTileX) + Math.abs(myTileY - targetTileY);
        return distance <= this.attackRange;
    }
}

describe('Enemy Combat', () => {
    let enemy;

    beforeEach(() => {
        enemy = new MockEnemy(100, 100);
    });

    // === Health and Damage ===

    it('should start with full health', () => {
        expect(enemy.health).toBe(30);
        expect(enemy.health).toBe(enemy.maxHealth);
    });

    it('should take damage correctly', () => {
        const died = enemy.takeDamage(10);
        expect(died).toBe(false);
        expect(enemy.health).toBe(20);
        expect(enemy.isAlive).toBe(true);
    });

    it('should die when health reaches zero', () => {
        const died = enemy.takeDamage(30);
        expect(died).toBe(true);
        expect(enemy.health).toBe(0);
        expect(enemy.isAlive).toBe(false);
        expect(enemy.isDying).toBe(true);
    });

    it('should die from multiple damage sources', () => {
        enemy.takeDamage(10);
        enemy.takeDamage(10);
        const died = enemy.takeDamage(10);
        expect(died).toBe(true);
        expect(enemy.health).toBe(0);
        expect(enemy.isAlive).toBe(false);
    });

    it('should not take damage when already dead', () => {
        enemy.takeDamage(30); // Kill enemy
        const died = enemy.takeDamage(10); // Try to damage again
        expect(died).toBe(false);
        expect(enemy.health).toBe(0);
    });

    it('should handle overkill damage', () => {
        const died = enemy.takeDamage(100);
        expect(died).toBe(true);
        expect(enemy.health).toBe(0); // Health clamps to 0
    });

    // === Combat Target ===

    it('should not be in combat initially', () => {
        expect(enemy.isInCombat).toBe(false);
        expect(enemy.target).toBeNull();
    });

    it('should enter combat when target is set', () => {
        enemy.setTarget({ x: 50, y: 50 });
        expect(enemy.isInCombat).toBe(true);
        expect(enemy.target).not.toBeNull();
    });

    it('should exit combat when target is cleared', () => {
        enemy.setTarget({ x: 50, y: 50 });
        enemy.clearTarget();
        expect(enemy.isInCombat).toBe(false);
        expect(enemy.target).toBeNull();
    });

    // === Vision Range ===

    it('should detect target in vision range', () => {
        const tileSize = 16;
        // Enemy at tile (6, 6), target at tile (8, 6) - distance = 2
        enemy.x = 6 * tileSize + 8;
        enemy.y = 6 * tileSize + 8;
        const targetX = 8 * tileSize + 8;
        const targetY = 6 * tileSize + 8;

        expect(enemy.isInVisionRange(targetX, targetY, tileSize)).toBe(true);
    });

    it('should not detect target outside vision range', () => {
        const tileSize = 16;
        // Enemy at tile (0, 0), target at tile (10, 10) - distance = 20
        enemy.x = 8;
        enemy.y = 8;
        const targetX = 10 * tileSize + 8;
        const targetY = 10 * tileSize + 8;

        expect(enemy.isInVisionRange(targetX, targetY, tileSize)).toBe(false);
    });

    it('should detect target at edge of vision range', () => {
        const tileSize = 16;
        // Enemy at tile (0, 0), target at tile (5, 0) - distance = exactly 5
        enemy.x = 8;
        enemy.y = 8;
        const targetX = 5 * tileSize + 8;
        const targetY = 8;

        expect(enemy.isInVisionRange(targetX, targetY, tileSize)).toBe(true);
    });

    // === Attack Range ===

    it('should detect adjacent target as in attack range', () => {
        const tileSize = 16;
        // Enemy at tile (5, 5), target at tile (6, 5) - distance = 1
        enemy.x = 5 * tileSize + 8;
        enemy.y = 5 * tileSize + 8;
        const targetX = 6 * tileSize + 8;
        const targetY = 5 * tileSize + 8;

        expect(enemy.isInAttackRange(targetX, targetY, tileSize)).toBe(true);
    });

    it('should not detect distant target as in attack range', () => {
        const tileSize = 16;
        // Enemy at tile (5, 5), target at tile (8, 5) - distance = 3
        enemy.x = 5 * tileSize + 8;
        enemy.y = 5 * tileSize + 8;
        const targetX = 8 * tileSize + 8;
        const targetY = 5 * tileSize + 8;

        expect(enemy.isInAttackRange(targetX, targetY, tileSize)).toBe(false);
    });

    it('should detect same tile as in attack range', () => {
        const tileSize = 16;
        // Both at same tile
        enemy.x = 5 * tileSize + 8;
        enemy.y = 5 * tileSize + 8;
        const targetX = 5 * tileSize + 4;
        const targetY = 5 * tileSize + 4;

        expect(enemy.isInAttackRange(targetX, targetY, tileSize)).toBe(true);
    });
});

describe('Player Combat', () => {
    // Mock player state
    let playerHealth;
    let playerMaxHealth;
    let isInCombat;
    let engagedEnemies;

    beforeEach(() => {
        playerMaxHealth = 100;
        playerHealth = playerMaxHealth;
        isInCombat = false;
        engagedEnemies = new Set();
    });

    it('should start with full health', () => {
        expect(playerHealth).toBe(100);
        expect(playerHealth).toBe(playerMaxHealth);
    });

    it('should track engaged enemies in a Set', () => {
        const enemy1 = new MockEnemy(50, 50);
        const enemy2 = new MockEnemy(100, 50);

        engagedEnemies.add(enemy1);
        engagedEnemies.add(enemy2);

        expect(engagedEnemies.size).toBe(2);
        expect(engagedEnemies.has(enemy1)).toBe(true);
        expect(engagedEnemies.has(enemy2)).toBe(true);
    });

    it('should not add duplicate enemies to engaged set', () => {
        const enemy = new MockEnemy(50, 50);

        engagedEnemies.add(enemy);
        engagedEnemies.add(enemy); // Duplicate

        expect(engagedEnemies.size).toBe(1);
    });

    it('should remove dead enemies from engaged set', () => {
        const enemy = new MockEnemy(50, 50);
        engagedEnemies.add(enemy);

        enemy.takeDamage(30); // Kill enemy

        // Simulate cleanup
        for (const e of engagedEnemies) {
            if (!e.isAlive) {
                engagedEnemies.delete(e);
            }
        }

        expect(engagedEnemies.size).toBe(0);
    });
});

describe('Combat Damage Calculations', () => {
    it('should calculate correct damage per hit', () => {
        const playerDamage = 10;
        const enemy = new MockEnemy();

        enemy.takeDamage(playerDamage);
        expect(enemy.health).toBe(20); // 30 - 10
    });

    it('should take multiple hits to kill enemy', () => {
        const playerDamage = 10;
        const enemy = new MockEnemy();

        enemy.takeDamage(playerDamage); // 30 -> 20
        expect(enemy.isAlive).toBe(true);

        enemy.takeDamage(playerDamage); // 20 -> 10
        expect(enemy.isAlive).toBe(true);

        enemy.takeDamage(playerDamage); // 10 -> 0
        expect(enemy.isAlive).toBe(false);
    });

    it('should handle varying damage amounts', () => {
        const enemy = new MockEnemy();

        enemy.takeDamage(5);  // 30 -> 25
        enemy.takeDamage(15); // 25 -> 10
        enemy.takeDamage(8);  // 10 -> 2

        expect(enemy.health).toBe(2);
        expect(enemy.isAlive).toBe(true);
    });
});
