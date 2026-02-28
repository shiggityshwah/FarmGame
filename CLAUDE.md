# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FarmGame is a browser-based 2D farming simulation game built with vanilla JavaScript and HTML5 Canvas. No build system, frameworks, or external dependencies.

## Running the Game

Open `index.html` directly in a web browser. No build step required. Refresh browser to see code changes.

## Architecture

### Core Systems (js/)

- **config.js** - Centralized game configuration constants (player stats, enemy stats, camera, tiles, path system, goblin stats, chunk system). Import CONFIG object to access values
- **main.js** - Entry point. DOMContentLoaded initialization of Game and CharacterCustomizer with error handling
- **Game.js** - Main engine class. Manages game loop (update/render via requestAnimationFrame), initializes all subsystems, handles character loading, movement, and combat. Exposes facade methods so subsystems don't reach 2+ levels deep: `findPath()`, `isTileWalkable()`, `isTileOwned()`, `getCombatTargets()` (returns `[{position, type, onHit}]` for each living combatant)
- **Camera.js** - Pan/zoom camera with world-to-screen coordinate conversion. Zoom range: 0.5x-4x
- **InputManager.js** - Unified input handling for keyboard (WASD/arrows), mouse (drag/wheel/click), and touch (drag/pinch/tap). Supports drag callbacks and panning toggle
- **TilemapRenderer.js** - Sparse chunk-based world renderer. `generateChunkMap()` creates the initial 3×4 grid using `chunkTiles` Map (sparse storage). Supports `setTileAt()`/`getTileAt()` for runtime tile modification. Renders multi-layer TMX maps (home, store, new house ground/roof layers). `renderGreatPath()` draws the y=60–63 path strip separately.
- **TileUtils.js** - Pure stateless coordinate helpers: `worldToTile`, `tileToWorld`, `tileCenterWorld`, `manhattanDist`. Import instead of inlining `Math.floor(x/tileSize)`.
- **SpriteAnimator.js** - Horizontal strip sprite animation with configurable FPS (default 8 FPS). Supports non-looping animations with completion callbacks
- **CharacterCustomizer.js** - UI panel for hair style and animation selection
- **Logger.js** - Structured logging with configurable log level (`CONFIG.debug.logLevel`). Use `Logger.create('ModuleName')` per module
- **EffectUtils.js** - Shared floating harvest/resource effect utilities. Functions: `createHarvestEffect(x, y, tileId)` → effect object, `updateEffects(effects, deltaTime)` → mutates array in-place (float up, fade, remove expired), `renderEffects(ctx, effects, tilesetImage, getTilesetSourceRect, tileSize)` → draws tile icon + "+1" text. Imported by CropManager, TreeManager, OreManager, ForestGenerator.

### Chunk World System (js/)

- **ChunkManager.js** - Sparse dynamic chunk grid. Stores chunks in a `Map("col,row" → chunk)`. Initial 3×4 grid = 3,600 tiles (vs old 50,400). Chunk states: `OWNED`, `TOWN`, `PURCHASABLE`, `LOCKED`. Chunk types: `FARM`, `TOWN`, `FOREST`. Key methods: `initialize()`, `purchaseChunk()`, `getChunkForTile()`, `isPlayerOwned()`, `isTownChunk()`, `isAccessible()`, `getChunkBounds()`, `render()` (borders), `renderPurchaseSigns()`. Fires `onChunkPurchased` callback. Holds pluggable `generatorRegistry`.
- **ChunkContentGenerator.js** - Base class/interface for per-biome chunk generators. Override `type`, `generateGround()`, `generateContent()`, `generateSeam()`, `generateNorthEdge()`. All methods are safe no-ops in the base class.
- **ChunkGeneratorRegistry.js** - Maps biome type strings to `ChunkContentGenerator` instances. Resolves biome type via: (1) designer map override (`setDesignerMap()`), (2) deterministic weighted random hash of (col,row) (`setBiomeWeights()`). Methods: `register()`, `getGenerator()`, `resolveType()`.
- **ForestChunkGenerator.js** - `ChunkContentGenerator` implementation for forest biome. Wraps `ForestGenerator` and delegates all tree/pocket/seam logic to it. Registered during `Game.init()` as `registry.register(new ForestChunkGenerator(this.forestGenerator))`.

### Inventory & UI Systems (js/)

- **Inventory.js** - Resource tracking system. Manages crops (10 types), seeds (10 types), flowers, ores (Iron, Coal, Mithril, Gold, Stone), wood, and gold currency. Methods: `add()`, `remove()`, `has()`, `getCount()`, `getByCategory()`
- **UIManager.js** - Menu system with three panels:
  - **Storage Menu**: Display inventory items grouped by category with tile icons
  - **Crafting Menu**: Purchase upgrades (Efficient Hoe, Sharp Axe, Reinforced Pickaxe, Vitality Boost)
  - **Shop Menu**: Buy seeds and sell crops/flowers for gold
- **JobQueueUI.js** - Overlay panel showing queued jobs per worker (Human, Goblin, Shared). Displays active/queued jobs with cancel buttons. Idle jobs shown with "Idle" badge and distinct styling

### Farming Systems (js/)

- **CropManager.js** / **Crop.js** - Crop lifecycle: 5 growth stages (3 seconds each), harvest with floating "+1" feedback, post-harvest decay effects
- **Flower.js** - Wild flower system with 3 rarity types: Blue (10%), Red (30%), White (60%). Each has 4 tile variations. Harvest yields 1-2 with fade-out animation
- **FlowerManager.js** - Spawning and management of flowers and weeds. Dynamic spawn rate based on grass coverage. 75% weeds vs 25% flowers. `_getSpawnAreas()` returns farm grass, town chunk, and all allocated forest chunk areas.
- **Weed.js** - Invasive plants with 4 growth stages over 2 minutes. Each click regresses one stage. Multi-tile at stages 3-4 (2 tiles tall)

### Resource Gathering Systems (js/)

- **Tree.js** - Tree harvesting. Two types: Thin (1x3 tiles, 2-5 wood) and Thick (2x3 tiles, 5-10 wood). Each chop yields 1 wood
- **TreeManager.js** - Tree spawning and tracking. Floating "+1 wood" harvest effects, fade-out when depleted
- **OreVein.js** - Mining system with 5 ore types: Iron, Coal, Mithril, Gold, Rock. 2x2 tile footprint, 5-10 ore per vein. Visual degradation stages: Full → Partial → Depleted
- **OreManager.js** - Ore vein spawning and extraction. Floating "+1 ore" mining effects

### Combat System (js/)

- **Enemy.js** - Enemy AI (Skeleton). Stats: 30 HP, 5 damage, vision range 5 tiles, attack range 1 tile. Animations: IDLE, WALK, ATTACK, HURT, DEATH. A* pathfinding toward player, damage flash effect, health bar rendering
- **EnemyManager.js** - Enemy spawning and coordination. Vision detection, combat engagement tracking, 1-second attack cooldown, dead enemy cleanup after fade-out. Uses `game.getCombatTargets()` to find human/goblin targets — does not access `game.humanPosition`/`goblinPosition` directly.

### Tool & Job Systems (js/)

- **Toolbar.js** - Bottom toolbar with tool icons extracted from tileset at 400% scale. Handles tool selection and cursor changes
- **TileSelector.js** - Click/drag tile selection with rectangle highlight. Validates tiles against tool acceptability rules and resource occupancy. Chunk ownership gate: non-owned forest chunks → sword + shovel-on-weed only; owned → all tools. Per-drag `_acceptabilityCache` Map (key `"x,y"`) avoids redundant checks; cleared on drag start and tool change. `_getChoppableTreeAt()` checks both treeManager and forestGenerator.
- **JobManager.js** - Multi-queue job system. Queues: `all` (shared), `human`, `goblin`. Each worker tracks current job independently. Supports `isIdleJob` flag for idle-sourced jobs. Methods: `addJob()`, `addIdleJob()`, `cancelJob()`, `getAllJobsByQueue()`
- **Pathfinder.js** - A* pathfinding with MinHeap for O(n log n) performance. Path tiles have 1.5x speed boost (lower cost). Finds paths avoiding obstacles. Returns null if no path found
- **TileOverlayManager.js** - Manages sprite overlays on tiles (holes from digging, path edge sprites)
- **IdleManager.js** - Autonomous idle activity system for the human character. State machine: `inactive → waiting (3-5s) → active`. Evaluates harvest, water, flower-pick, and weed-clear tasks using actual A* path lengths (not just Euclidean distance). Prefers tasks with path length ≤ 35 tiles. Backs off exponentially on failure. Returns home when nothing to do. All activities filter to owned chunks; weed-clearing also allows town chunk. Uses game facade methods (`game.findPath()`, `game.isTileWalkable()`, `game.isTileOwned()`) instead of accessing subsystems directly.

### Chunk World Layout (initial 3×4 grid = 90 wide × 124 tall)

- **Town chunk**: col=1, row=1 → world x=30–59, y=30–59
- **Farm chunk**: col=1, row=2 → world x=30–59, world y=64–93 (shifted 4 tiles by `mainPathGap`)
- **All other chunks**: forest type (LOCKED or PURCHASABLE)
- **Great path strip**: world y=60–63 — SEPARATE tilemap, NOT chunk tiles (virtual in `getTileAt`)
  - y=60: N-grass + `'S'` edge overlay; y=61–62: path tiles (speed boost); y=63: S-grass + `'N'` edge overlay
  - Rendered by `tilemap.renderGreatPath()` after `tilemap.render()`
- **Store** (10×10): world (34, 35) — in town chunk
- **Town home** (home.tmx, 10×10): world (48, 47) — bottom-right of town chunk (`townHomeOffsetX=48, townHomeOffsetY=47`)
- **New house** (house.tmx, 6×6): world (32, 67) — in farm chunk (`newHouseOffsetX=32, newHouseOffsetY=67`)
- **Player spawn**: approx world tile (33, 70) in farm chunk
- **Goblin NPC**: world (46, 55) near town home entrance
- **Chimney smoke**: world tile (34, 68)

### Farm Chunk Zones (within col=1 row=2)

- **House footprint**: x=32–37, y=67–72
- **Farm grass** (flowers/crops): y=73–79, x=30–59 (`grassStartY = newHouseOffsetY + newHouseHeight = 73`)
- **South forest** (trees): y=80–93, x=30–59 — generated via `forestGenerator.generateForChunk(density=0.7, noPocket:true)`. Same tile art as forest chunks; choppable via axe.

### New House (house.tmx)

- 6×6 tile footprint placed at world tile (32, 67)
- Layers: `Ground`, `Ground Detail`, `Wall`, `Wall Detail` (rendered above path overlays via `renderGroundLayers()`), `Roof`, `Roof Detail` (rendered above character, hidden when player inside)
- Roof hidden when player tile is within x:32–37, y:67–72 (`isPlayerInsideNewHouse`)
- Door at local tile (1,4) → world (33, 71); path endpoint = y=72 (under house tilemap bottom row)
- Chimney smoke SpriteAnimator at world tile (34, 68): `chimneysmoke_02_strip30.png`, 30 frames @ 12fps. Only shown when player is outside

### Path Routing (chunk world)

- Path tile IDs: `[482, 490, 491, 554, 555]`. Speed multiplier: 1.5x
- **Great path** (y=60–63): SEPARATE tilemap via `renderGreatPath()` — no `setTileAt` calls
- **Town E-W path**: y=45, x=30–59
- **Town N-S connector**: x=45, y=46–59 (terminates just above great path at y=60)
- **Town home approach**: y=57 (branch east from connector at x=45), x=46–53
- **House approach N-S**: x=38 (east of house), y=64–72
- **House front E-W**: y=72, x=32–38

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
1. Canvas clear
2. `tilemap.render()` — base chunk tiles + store/home layers (Ground, Decor, Buildings Base/Detail); SKIPS y=60–63
3. `tilemap.renderGreatPath()` — great path strip at y=60–63 (OVER chunk tiles)
4. `chunkManager.render()` — ownership borders (OWNED chunks against non-OWNED neighbors)
5. `overlayManager.renderEdgeOverlays()` — path edge sprites
6. Forest tree backgrounds (shadows/trunks; render OVER great path)
7. `overlayManager.renderNonEdgeOverlays()` — holes
8. `tilemap.renderGroundLayers()` — new house floor/walls (ABOVE overlays)
9. Depth-sorted entities (crops, flowers/weeds, trees, ore veins, tile highlight, characters, enemies, effects)
10. Forest foregrounds (tree crowns; render OVER great path)
11. `chunkManager.renderPurchaseSigns()` — purchase "?" signs ABOVE trees
12. `tilemap.renderUpperLayers()` — store/home upper building layers
13. `tilemap.renderRoofLayers()` — new house roof (hidden when player inside)
14. Chimney smoke (when player outside)
15. UI

### Coordinate Systems
- World coordinates (pixels) ↔ Tile coordinates (grid positions) ↔ Screen coordinates (canvas viewport)
- Camera class provides conversion methods
- `TileUtils.js` provides pure helpers: `worldToTile(px, tileSize)`, `tileToWorld(tx, tileSize)`, `tileCenterWorld(tx, tileSize)`, `manhattanDist(ax, ay, bx, by)`
- `mapStartX`/`mapStartY` on TilemapRenderer are in tile units and may be negative when world expands left/north

## Asset Structure

- **Characters/Human/** - Player character with 3 layers: `base_[anim].png`, `[style]hair_[anim].png`, `tools_[anim].png`. 6 hair styles, 20 animations
- **Characters/Skeleton/PNG/** - Enemy character with animations: idle, walk, attack, hurt, death, jump
- **Characters/Goblin/PNG/** - NPC with full 20 animation set (some multi-row sprites; see GOBLIN_ANIMATION_DATA in Game.js)
- **Elements/Crops/** - Crop growth stage sprites
- **Tileset/** - `spr_tileset_sunnysideworld_16px.png` (1024x1024)
- **Tileset/store*.csv** - Store map layers: `store_Ground.csv`, `store_Buildings (Upper).csv`, `store_Decor.csv`
- **Tileset/house.tmx** - New house map (6×6). Layers: Ground, Ground Detail, Wall, Wall Detail, Roof, Roof Detail. Exported as `house_[Layer].csv`
- **Tileset/home.tmx** - Town home map (10×10). Layers: Ground, Decor, Buildings (Base/Detail/Upper)
- **Elements/chimney/** - `chimneysmoke_02_strip30.png` (300×30, 30 frames)
- **UI/** - Interface elements

## Configuration Constants

### config.js (Centralized Game Configuration)

All major game balance values are centralized in `config.js`. Import with:
```javascript
import { CONFIG, getRandomDirtTile, getRandomPathTile } from './config.js';
```

**CONFIG.player** - Player stats (maxHealth, damage, moveSpeed, visionRange, attackRange, attackCooldown, damageFlashDuration, healthRegen, healthRegenDelay)

**CONFIG.goblin** - Goblin NPC stats (maxHealth, healthRegen, healthRegenDelay)

**CONFIG.enemy.skeleton** - Skeleton enemy stats (maxHealth, damage, moveSpeed, visionRange, attackRange, attackCooldown, fadeDuration, pathfindCooldown, damageFlashDuration)

**CONFIG.camera** - Zoom limits (minZoom, maxZoom), pan speed

**CONFIG.path** - `speedMultiplier: 1.5` — speed boost on path tiles

**CONFIG.tiles** - Common tile IDs (grass: 16 IDs, hoedGround: 7 IDs, holeOverlay, path IDs, pathEdgeOverlays directions). Single source of truth — do NOT redefine in other files.

**CONFIG.pathfinding** - maxIterations to prevent infinite loops

**CONFIG.forestPockets** - enemySpawnChance (0.4), minEnemiesPerPocket (1), maxEnemiesPerPocket (3)

**CONFIG.chunks** - Chunk world constants:
- `size: 30` — tiles per chunk side
- `initialGridCols: 3`, `initialGridRows: 4` — initial sparse grid (3×4 = 12 chunks, 3,600 tiles)
- `townCol: 1`, `townRow: 1` — town chunk position (world x=30–59, y=30–59)
- `farmCol: 1`, `farmRow: 2` — farm chunk position (world x=30–59, y=64–93)
- `mainPathY: 60` — world Y of great path top row
- `mainPathGap: 4` — world tile rows reserved for great path between townRow and farmRow
- Gap formula: `worldY(row) = row * 30 + (row > townRow ? mainPathGap : 0)`

**CONFIG.debug** - logLevel, showFps, showPathfinding

**Helper functions**:
- `getRandomDirtTile()` - Returns random dirt tile ID (80% common, 20% rare variants)
- `getRandomPathTile()` - Returns random path tile ID (60% common tile 482, 40% variants)

### Other Configuration Locations

**Game.js ANIMATION_DATA** - Frame counts per animation for human (e.g., WAITING: 9, WALKING: 8, HAMMERING: 23, DOING: 8, WATERING: 5)

**Game.js GOBLIN_ANIMATION_DATA** - Frame counts + framesPerRow for goblin (handles multi-row sprites)

**Crop.js** - Growth timing (GROWTH_TIME: 3000ms), crop types (11 types with tile offsets), tile ID ranges (691-1139)

**Inventory.js** - Resource categories: CROPS, SEEDS, FLOWERS, ORES, WOOD, GOLD

**UIManager.js UPGRADES** - Crafting upgrades with costs and effects (tool speed multipliers, health boost)

**IdleManager.js** - Activity weights (harvest:30, water:30, flower:20, weed:20), MAX_IDLE_DISTANCE: 20, MAX_IDLE_PATH_LENGTH: 35, PATH_CHECK_CANDIDATES: 3, NEAR_HOUSE_RADIUS: 15

## Known Asset Quirks

Animation filenames have inconsistencies the code handles:
- "HAMMERING" → filename uses "hamering" (typo in assets)
- "WALKING" → filename uses "walk" (shortened)
- Goblin CASTING and DIG are multi-row sprite sheets (framesPerRow in GOBLIN_ANIMATION_DATA)

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
- **Watering Can** (idle only): Waters un-watered crops. Uses WATERING animation

**Character behavior**: Character walks to an adjacent tile, faces the work tile, then performs the tool animation. Sprite flips horizontally when facing left.

**Tool upgrades**: Crafting menu allows purchasing upgrades that modify `toolAnimationMultipliers` to speed up tool animations

**Adding a new tool action**: In JobManager.js applyToolEffect(), add case for tool.id

**Acceptable tiles**: Defined in TileSelector.js ACCEPTABLE_TILES object per tool. Also checks for resource occupancy (trees, ore, enemies). Hoe extra exclusion: ore vein tiles always block hoe.

## Idle System

The `IdleManager` gives the human character autonomous behavior when no player jobs are queued and not in combat:

1. **Wait phase**: 3–5 seconds after becoming idle before acting
2. **Evaluate**: Scans for harvestable crops, unwanted crops, flowers, weeds — picks closest by actual A* path length
3. **Act**: Submits job via `jobManager.addIdleJob()` (jobs tagged `isIdleJob: true`)
4. **Backoff**: Exponential backoff (up to 15s) on repeated fast-failure
5. **Return home**: Goes to spawn area when nothing else to do
6. **Preemption**: Any player-submitted job immediately cancels the idle job

## Extending the Game

**New crop type**: Add to CROP_TYPES in Crop.js with index, assign tile ID in TILE_BASE

**New animation**: Add frame count to ANIMATION_DATA in Game.js, create sprite files, add button to HTML

**New NPC**: Create SpriteAnimator in Game.createCharacters(), load sprite, push to this.characters array

**New enemy type**: Add stats to CONFIG.enemy in config.js, add animations to ENEMY_ANIMATIONS in Enemy.js, spawn via EnemyManager

**New biome type**: Create a class extending `ChunkContentGenerator`, implement `get type()`, `generateGround()`, `generateContent()`, `generateSeam()`. Register with `chunkGeneratorRegistry.register(new YourGenerator(...))` in Game.init(). Optionally add to `setBiomeWeights()` or `setDesignerMap()`.

**New tool**: Add to TOOLS in Toolbar.js, add acceptable tiles in TileSelector.js, add action in JobManager.js

**New ore type**: Add to OreVein.js ORE_TYPES with tile IDs and resource name

**New upgrade**: Add to UIManager.js UPGRADES with cost, effect callback, and description

**New inventory item**: Add to Inventory.js with category and update UIManager.js for display

**New idle activity**: Add weight entry to ACTIVITY_WEIGHTS in IdleManager.js, add case to `_evaluateActivity()` and `_createJobForEvaluation()`

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
- JobManager uses `workers` Map (workerId → state) and `queues` object (all/human/goblin)
- ChunkManager uses sparse `Map("col,row" → chunk)` — unallocated chunks return default grass (tile 65) when read
- TilemapRenderer uses `chunkTiles` Map (`"col,row"` → Uint16Array(900)) for sparse tile storage
- `getTileAt`/`setTileAt` support negative tile coords (chunk mode) — no `x<0||y<0` guard

### Chunk Ownership Rules
- **OWNED** chunks: full farming/gathering access for all tools
- **TOWN** chunk: walk-through + weed-clearing only (no farming or resource gathering)
- **PURCHASABLE** chunks: displayed with "?" sign; click to purchase
- **LOCKED** chunks: walk-through only, shown as forest; must be adjacent to OWNED to become PURCHASABLE
- Purchasing a chunk allocates all 8 neighbor chunks (if they don't exist) and fires `onChunkPurchased`

### Logging
- Use `Logger.create('ModuleName')` at the top of each file
- Log level configured via `CONFIG.debug.logLevel` ('debug', 'info', 'warn', 'error', 'none')
- Prefer `log.debug()` for frequent/verbose output, `log.info()` for significant events

## Tests

Tests live in `tests/`. Run by opening `tests/index.html` in a browser (uses a lightweight `TestRunner.js`).

- **tests/ChunkSystem.test.js** - Unit tests for `ChunkContentGenerator`, `ChunkGeneratorRegistry`, and `ForestChunkGenerator`. All tests use plain mock objects — no canvas, tilemap, or DOM required.
- **tests/EffectUtils.test.js** - Unit tests for `createHarvestEffect`, `updateEffects`, and `renderEffects`. Uses a mock canvas context — no DOM or tilemap required.
