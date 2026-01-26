# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FarmGame is a browser-based 2D farming simulation game built with vanilla JavaScript and HTML5 Canvas. No build system, frameworks, or external dependencies.

## Running the Game

Open `index.html` directly in a web browser. No build step required. Refresh browser to see code changes.

## Architecture

### Core Systems (js/)

- **config.js** - Centralized game configuration constants (player stats, enemy stats, camera, tiles). Import CONFIG object to access values
- **main.js** - Entry point. DOMContentLoaded initialization of Game and CharacterCustomizer with error handling
- **Game.js** - Main engine class. Manages game loop (update/render via requestAnimationFrame), initializes all subsystems, handles character loading, movement, and combat
- **Camera.js** - Pan/zoom camera with world-to-screen coordinate conversion. Zoom range: 0.5x-4x
- **InputManager.js** - Unified input handling for keyboard (WASD/arrows), mouse (drag/wheel/click), and touch (drag/pinch/tap). Supports drag callbacks and panning toggle
- **TilemapRenderer.js** - Loads CSV tilemap and renders visible tiles from tileset PNG (16px tiles, 64x64 grid = 4096 tiles). Supports runtime tile modification via setTileAt()
- **SpriteAnimator.js** - Horizontal strip sprite animation with configurable FPS (default 8 FPS). Supports non-looping animations with completion callbacks
- **CharacterCustomizer.js** - UI panel for hair style and animation selection

### Inventory & UI Systems (js/)

- **Inventory.js** - Resource tracking system. Manages crops (10 types), seeds (10 types), flowers, ores (Iron, Coal, Mithril, Gold, Stone), wood, and gold currency. Methods: `add()`, `remove()`, `has()`, `getCount()`, `getByCategory()`
- **UIManager.js** - Menu system with three panels:
  - **Storage Menu**: Display inventory items grouped by category with tile icons
  - **Crafting Menu**: Purchase upgrades (Efficient Hoe, Sharp Axe, Reinforced Pickaxe, Vitality Boost)
  - **Shop Menu**: Buy seeds and sell crops/flowers for gold

### Farming Systems (js/)

- **CropManager.js** / **Crop.js** - Crop lifecycle: 5 growth stages (3 seconds each), harvest with floating "+1" feedback, post-harvest decay effects
- **Flower.js** - Wild flower system with 3 rarity types: Blue (10%), Red (30%), White (60%). Each has 4 tile variations. Harvest yields 1-2 with fade-out animation
- **FlowerManager.js** - Spawning and management of flowers and weeds. Dynamic spawn rate based on grass coverage. 75% weeds vs 25% flowers
- **Weed.js** - Invasive plants with 4 growth stages over 2 minutes. Each click regresses one stage. Multi-tile at stages 3-4 (2 tiles tall)

### Resource Gathering Systems (js/)

- **Tree.js** - Tree harvesting. Two types: Thin (1x3 tiles, 2-5 wood) and Thick (2x3 tiles, 5-10 wood). Each chop yields 1 wood
- **TreeManager.js** - Tree spawning and tracking. Floating "+1 wood" harvest effects, fade-out when depleted
- **OreVein.js** - Mining system with 5 ore types: Iron, Coal, Mithril, Gold, Rock. 2x2 tile footprint, 5-10 ore per vein. Visual degradation stages: Full → Partial → Depleted
- **OreManager.js** - Ore vein spawning and extraction. Floating "+1 ore" mining effects

### Combat System (js/)

- **Enemy.js** - Enemy AI (Skeleton). Stats: 30 HP, 5 damage, vision range 5 tiles, attack range 1 tile. Animations: IDLE, WALK, ATTACK, HURT, DEATH. A* pathfinding toward player, damage flash effect, health bar rendering
- **EnemyManager.js** - Enemy spawning and coordination. Vision detection, combat engagement tracking, 1-second attack cooldown, dead enemy cleanup after fade-out

### Tool & Job Systems (js/)

- **Toolbar.js** - Bottom toolbar with tool icons extracted from tileset at 400% scale. Handles tool selection and cursor changes
- **TileSelector.js** - Click/drag tile selection with rectangle highlight. Validates tiles against tool acceptability rules and resource occupancy
- **JobManager.js** - Job queue for character tasks. Coordinates walk → animate → apply effect → next tile sequence
- **Pathfinder.js** - A* pathfinding with MinHeap for O(n log n) performance. Finds paths avoiding obstacles (water, rocks). Returns null if no path found (no longer falls back to direct path through obstacles)
- **TileOverlayManager.js** - Manages sprite overlays on tiles (holes from digging)

### Game.js Combat Properties

```javascript
playerMaxHealth: 100      playerHealth: 100
playerDamage: 10          playerVisionRange: 5
playerAttackRange: 1      isInCombat: false
combatTarget: null        engagedEnemies: Set
toolAnimationMultipliers  // Modified by crafting upgrades
animationSession          // For stale callback invalidation
```

### Rendering Order
1. Canvas clear → 2. Tilemap → 3. Tile overlays → 4. Crops → 5. Flowers/Weeds → 6. Trees → 7. Ore veins → 8. Tile selection highlight → 9. Characters → 10. Enemies → 11. Effects → 12. UI

### Coordinate Systems
- World coordinates (pixels) ↔ Tile coordinates (grid positions) ↔ Screen coordinates (canvas viewport)
- Camera class provides conversion methods

## Asset Structure

- **Characters/Human/** - Player character with 3 layers: `base_[anim].png`, `[style]hair_[anim].png`, `tools_[anim].png`. 6 hair styles, 20 animations
- **Characters/Skeleton/PNG/** - Enemy character with animations: idle, walk, attack, hurt, death, jump
- **Characters/Goblin/PNG/** - Pre-made NPC with full 20 animation set
- **Elements/Crops/** - Crop growth stage sprites
- **Tileset/** - `spr_tileset_sunnysideworld_16px.png` (1024x1024), `testing.csv` (main tilemap)
- **Tileset/store*.csv** - Store map layers: `store_Ground.csv`, `store_Buildings (Upper).csv`, `store_Decor.csv`
- **UI/** - Interface elements

## Configuration Constants

### config.js (Centralized Game Configuration)

All major game balance values are centralized in `config.js`. Import with:
```javascript
import { CONFIG, getRandomDirtTile } from './config.js';
```

**CONFIG.player** - Player stats (maxHealth, damage, moveSpeed, visionRange, attackRange, attackCooldown, damageFlashDuration)

**CONFIG.enemy.skeleton** - Skeleton enemy stats (maxHealth, damage, moveSpeed, visionRange, attackRange, attackCooldown, fadeDuration)

**CONFIG.camera** - Zoom limits (minZoom, maxZoom), pan speed

**CONFIG.tiles** - Common tile IDs (hoedGround array, holeOverlay)

**CONFIG.pathfinding** - maxIterations to prevent infinite loops

**Helper functions**:
- `getRandomDirtTile()` - Returns random dirt tile ID (80% common, 20% rare variants)

### Other Configuration Locations

**Game.js ANIMATION_DATA** - Frame counts per animation (e.g., WAITING: 9, WALKING: 8, HAMMERING: 23)

**Crop.js** - Growth timing (GROWTH_TIME: 3000ms), crop types (11 types with tile offsets), tile ID ranges (691-1139)

**Inventory.js** - Resource categories: CROPS, SEEDS, FLOWERS, ORES, WOOD, GOLD

**UIManager.js UPGRADES** - Crafting upgrades with costs and effects (tool speed multipliers, health boost)

## Known Asset Quirks

Animation filenames have inconsistencies the code handles:
- "HAMMERING" → filename uses "hamering" (typo in assets)
- "WALKING" → filename uses "walk" (shortened)

## Tool System

**Available tools** (Toolbar.js TOOLS constant):
- Watering Can (2858), Axe (2922), Hoe (2986), Sword (3050)
- Shovel (3114), Fishing Rod (3178), Pickaxe (3113), Plant (2857)

**Implemented tool actions**:
- **Hoe**: Changes grass/dirt tiles to hoed ground (tile ID 67). Uses AXE animation
- **Shovel**: Only works on hoed tiles (67). Adds hole overlay (tile ID 1138). Uses DIG animation
- **Axe**: Chops trees. Each hit yields 1 wood. Uses AXE animation
- **Pickaxe**: Mines ore veins. Each hit yields 1 ore. Uses AXE animation
- **Sword**: Attacks enemies. Uses ATTACK animation. Damage based on playerDamage stat

**Character behavior**: Character walks to an adjacent tile, faces the work tile, then performs the tool animation. Sprite flips horizontally when facing left.

**Tool upgrades**: Crafting menu allows purchasing upgrades that modify `toolAnimationMultipliers` to speed up tool animations

**Adding a new tool action**: In JobManager.js applyToolEffect(), add case for tool.id

**Acceptable tiles**: Defined in TileSelector.js ACCEPTABLE_TILES object per tool. Also checks for resource occupancy (trees, ore, enemies)

## Extending the Game

**New crop type**: Add to CROP_TYPES in Crop.js with index, assign tile ID in TILE_BASE

**New animation**: Add frame count to ANIMATION_DATA in Game.js, create sprite files, add button to HTML

**New NPC**: Create SpriteAnimator in Game.createCharacters(), load sprite, push to this.characters array

**New enemy type**: Add stats to CONFIG.enemy in config.js, add animations to ENEMY_ANIMATIONS in Enemy.js, spawn via EnemyManager

**Modify tilemap**: Edit testing.csv (comma-separated tile IDs), refresh browser

**New tool**: Add to TOOLS in Toolbar.js, add acceptable tiles in TileSelector.js, add action in JobManager.js

**New ore type**: Add to OreVein.js ORE_TYPES with tile IDs and resource name

**New upgrade**: Add to UIManager.js UPGRADES with cost, effect callback, and description

**New inventory item**: Add to Inventory.js with category and update UIManager.js for display

## Important Implementation Notes

### Error Handling
- Game loop (update/render) is wrapped in try-catch to prevent crashes
- All input callbacks (click, drag start/move/end) have error boundaries
- Errors are logged to console but don't freeze the game

### Resource Management
- Seeds are consumed from inventory when planting (JobManager.applyPlantPhase1)
- Enemy sprites clear callbacks before creating new ones to prevent memory leaks
- Animation session counter in Game.js invalidates stale callbacks when animations change rapidly

### Data Structures
- `engagedEnemies` in Game.js is a Set (not Array) for O(1) lookup/add/delete
- Pathfinder uses MinHeap for O(log n) node extraction instead of array sort
