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
- **Game.js** - Main engine class. Manages game loop (update/render via requestAnimationFrame), initializes all subsystems, handles character loading, movement, and combat. Exposes facade methods so subsystems don't reach 2+ levels deep: `findPath()`, `isTileWalkable()`, `isTileOwned()`, `getCombatTargets()` (returns `[{position, type, onHit}]` for each living combatant). `hireGoblin()` reveals goblin toolbar buttons and job queue sections (`goblinHired` flag). `fireGoblin()` reverses hireGoblin: re-queues active/pending goblin player jobs to `queues.all`, clears goblin state, hides goblin UI. `_initGoldDisplay()` subscribes to inventory onChange and sets `targetGold`; `update()` animates `displayedGold` toward `targetGold` over ~500ms. `_initDebugMenu()` injects cheat buttons into `#customize-menu` (includes "Fire Goblin" toggle paired with "Hire Goblin"). `_seedEffects` array holds floating seed-drop effects for wild crop harvests (created via `createHarvestEffect`, rendered via `renderFloatingEffects` from EffectUtils.js). Wild crop seed drop: on click-harvest of a crop whose underlying tile is NOT `CONFIG.tiles.hoedGround`, 50% chance to add matching seed to inventory and spawn a floating effect. Watering can state: `wateringCanWater/wateringCanMaxWater` (human, from `CONFIG.watering.canMaxCapacity`), `goblinWaterCanWater/goblinWaterCanMaxWater` (goblin). Well created in init and passed to pathfinder. Pixel-precise slide state: `humanPixelTarget`, `humanIsSliding`, `humanSlideStart`, `humanSlideTarget`, `humanSlideElapsed` (and goblin equivalents); `moveWorkerToPixel(workerId, px, py)` pathfinds then slides 300ms to exact position; `_updateHumanSlide(dt)` / `_updateGoblinSlide(dt)` lerp each frame. Starter crops: 1–2 wild instances each of CARROT, RADISH, PARSNIP (tier-1 only, startAsPlanted=false → auto-grow, no watering). Phase 3: `homeUpgrades` object (slots, shrineUpgrades, purchasedToolUpgrades). `applyCraftingEffect(recipeId)` dispatches crafting completion to inventory/homeUpgrades/CropManager. `_openZonePanel(zone)` / `_closeZonePanel()` / `_initZonePanel()` manage the zone management panel. Harvest hook calls `replenishZoneManager.onHarvest()`. Bountiful harvest bonus: +1 crop yield when `shrineUpgrades.bountifulHarvest`. Stand queue: `standQueue` array holds `{traveler, waitTimer}` entries when stand is busy; `_beginServingTraveler(traveler)` starts a service session; `_dequeueNextTraveler()` called when stand becomes idle (purges despawned entries, pulls next or resets to idle); `_updateStandService()` ticks patience (`CONFIG.stand.traveler.queuePatience`) and drops travelers who give up. Zone expansion drag: `inputManager.setPanningEnabled(false)` when entering expansion mode, `true` on complete/cancel.
- **Camera.js** - Pan/zoom camera with world-to-screen coordinate conversion. Zoom range: 0.5x-4x
- **InputManager.js** - Unified input handling for keyboard (WASD/arrows), mouse (drag/wheel/click), and touch (drag/pinch/tap). Supports drag callbacks and panning toggle
- **TilemapRenderer.js** - Sparse chunk-based world renderer. `generateChunkMap()` creates the initial 3×5 grid using `chunkTiles` Map (sparse storage). Supports `setTileAt()`/`getTileAt()` for runtime tile modification. Renders multi-layer TMX maps (home, store, new house ground/roof layers). `renderGreatPath()` draws the y=45–48 path strip separately.
- **TileUtils.js** - Pure stateless coordinate helpers: `worldToTile`, `tileToWorld`, `tileCenterWorld`, `manhattanDist`. Import instead of inlining `Math.floor(x/tileSize)`.
- **SpriteAnimator.js** - Horizontal strip sprite animation with configurable FPS (default 8 FPS). Supports non-looping animations with completion callbacks
- **CharacterCustomizer.js** - UI panel for hair style and animation selection. Triggered by `#debug-btn` (gear icon, bottom-right). Debug menu is always visible. The panel (`#customize-menu`) also contains cheat buttons injected by `Game._initDebugMenu()`.
- **Logger.js** - Structured logging with configurable log level (`CONFIG.debug.logLevel`). Use `Logger.create('ModuleName')` per module
- **EffectUtils.js** - Shared floating harvest/resource effect utilities. Functions: `createHarvestEffect(x, y, tileId)` → effect object (duration from `CONFIG.effects.floatingDuration`), `updateEffects(effects, deltaTime)` → mutates array in-place (float up, fade, remove expired), `renderEffects(ctx, effects, tilesetImage, getTilesetSourceRect, tileSize)` → draws tile icon + "+1" text. Imported by ResourceManager base class and ForestGenerator.
- **ResourceManager.js** - Shared base class for entity managers that track a list of resources (trees, ore veins, crops). Provides: unified `this.effects` array (updated/rendered same way across subclasses), reverse-splice `_cleanupGone()` hook, template-method pattern. `update(deltaTime)` calls `_updateResources()` → `_cleanupGone()` → `updateEffects()`. `renderEffects(ctx, camera)` delegates to EffectUtils. Subclasses assign `this.resources` alias (e.g. `this.crops = this.resources`) and override `_updateResources()` if needed. Extended by CropManager, TreeManager, OreManager.

### Chunk World System (js/)

- **ChunkManager.js** - Sparse dynamic chunk grid. Stores chunks in a `Map("col,row" → chunk)`. Initial 3×5 grid = 3,375 tiles (vs old 50,400). Chunk states: `OWNED`, `TOWN`, `PURCHASABLE`, `LOCKED`. Chunk types: `FARM`, `TOWN`, `FOREST`. Key methods: `initialize()`, `purchaseChunk()` (deducts gold via `inventory.spendGold()`; returns false if can't afford), `getChunkPrice(col, row)` (Manhattan distance from farm chunk → CONFIG.chunks.purchasePrices), `getChunkForTile()`, `isPlayerOwned()`, `isTownChunk()`, `isAccessible()`, `getChunkBounds()`, `render()` (borders), `renderPurchaseSigns()` (shows price in gold or red if unaffordable). Fires `onChunkPurchased` callback. Holds pluggable `generatorRegistry`. Holds `inventory` reference (set by Game.init() after Inventory is created; needed for gold-gated purchases). North forest chunks (rows 0–2) are permanently LOCKED and never become purchasable.
- **ChunkContentGenerator.js** - Base class/interface for per-biome chunk generators. Override `type`, `generateGround()`, `generateContent()`, `generateSeam()`, `generateNorthEdge()`. All methods are safe no-ops in the base class.
- **ChunkGeneratorRegistry.js** - Maps biome type strings to `ChunkContentGenerator` instances. Resolves biome type via: (1) designer map override (`setDesignerMap()`), (2) deterministic weighted random hash of (col,row) (`setBiomeWeights()`). Methods: `register()`, `getGenerator()`, `resolveType()`.
- **ForestChunkGenerator.js** - `ChunkContentGenerator` implementation for forest biome. Wraps `ForestGenerator` and delegates all tree/pocket/seam logic to it. Registered during `Game.init()`. Also exports `DenseForestChunkGenerator` (type `'dense_forest'`) — overrides `generateContent()` with `noPocket:true, density:0.9` for permanently locked north-of-path forest chunks. Calculates Manhattan distance from farm chunk and passes it to `generateForChunk()` as `distance` option — controls ore quality and crop tier in pocket clearings. `ForestGenerator._weightedOreType(dist)` and `_weightedCropType(dist)` use distance-indexed weight tables (dist≤2: stone/iron/tier-1 crops; dist≤4: mid-tier; dist>4: gold/mithril/tier-3–4 crops).

### Inventory & UI Systems (js/)

- **Inventory.js** - Resource tracking system. Manages crops (10 types), seeds (10 types), flowers (generic + FLOWER_BLUE/RED/WHITE color variants), ores (Iron, Coal, Mithril, Gold, Stone), wood, potions (4 types), and gold currency. Methods: `add()`, `remove()`, `has()`, `getCount()`, `getByCategory()`, `getSeedByCropIndex(cropIndex)`, `spendGold(amount)`. Seed prices follow exponential progression: 5g (Carrot) → 50,000g (Pumpkin), ordered cheapest-first. Crop sell_prices (stand full value) range 10g–100,000g. `onChange(callback)` uses multi-subscriber `_changeListeners` array — calling `onChange(fn)` **pushes** fn (does NOT replace); `onChange(null)` clears all listeners. No manual chaining needed — each subsystem calls `onChange()` independently. Potion category: MINOR_HEALTH_POTION (50g), STAMINA_TONIC (150g), GROWTH_ELIXIR (500g), VITALITY_BREW (2000g). Flower colors: FLOWER_BLUE (10% rarity), FLOWER_RED (30%), FLOWER_WHITE (60%) — Flower.js harvest now adds color-specific type instead of generic FLOWER.
- **UIManager.js** - Menu system with three panels:
  - **Storage Menu**: Display inventory items grouped by category with tile icons (includes potions)
  - **Crafting Menu** (Phase 3): Slot-based home upgrade system. Shows 1 upgrade slot (Level 1). Click slot → install Cauldron/Anvil/Shrine. Installed upgrade shows recipes below: Cauldron (4 potions), Anvil (4 tool upgrades as craft jobs), Shrine (4 permanent bonuses). Recipe cards show ingredient counts (grey if can't afford). Clicking recipe deducts resources and queues a 'craft' job. Swap Shrine confirmation is inline HTML (no `window.confirm()`). `refreshStandMenuIfOpen()` helper re-renders open stand menus.
  - **Shop Menu**: Buy seeds (price from RESOURCE_TYPES[].price) and sell crops/flowers/ores/potions for gold. Store sell price = `Math.floor(sell_price / 2)` — half of roadside stand value.
- **JobQueueUI.js** - Overlay panel showing queued jobs per worker (Human, Goblin, Shared). Displays active/queued jobs with cancel buttons. Idle jobs shown with "Idle" badge and distinct styling. Goblin and Shared sections are hidden (`display:none`) by default. Call `setGoblinHired(true)` to reveal them.

### Farming Systems (js/)

- **Well.js** - Well structure at world tile (24, 53): 2-tile wide × 3-tile tall. Top row (tiles 1256–1257, y=53) visual-only rendered above characters; middle + bottom rows (tiles 1320–1321 / 1384–1385, y=54–55) block movement. `isObstacle(x,y)` checks middle+bottom rows. `getAdjacentServiceTile()` → (24, 55). `registerInteractable()` registers click area for `'openWell'` action. Rendered in depth-sorted pass (`getSortY()`) + upper-layers pass (`renderTop()`). Well menu (`#well-menu`) opened by click, has Fill buttons for human/goblin cans. `game.wateringCanWater/Max` and `game.goblinWaterCanWater/Max` (all default 20).
- **CropManager.js** / **Crop.js** - Extends `ResourceManager` (`this.crops = this.resources`). Crop lifecycle: 5 growth stages (variable time per crop), harvest with floating "+1" feedback via `this.effects`, post-harvest decay effects. Overrides `_updateResources(deltaTime)` to apply shrine growth-speed multiplier before passing to each crop. Multi-step watering state machine: `wateringState` ∈ `'needs_water' | 'watering_cooldown' | 'growing'`; `wateringsPerStage` per crop type (1 for most, 2 for PUMPKIN/WHEAT/SUNFLOWER); 30s cooldown between multi-waterings. Crop visual feedback uses tile ID: dry ground tile (818) when `needs_water`, wet ground tile (882) when growing/cooldown — no overlay dots. Wild crops (startAsPlanted=false) begin in `'growing'` state, never need watering. `get isWatered()` backward-compat getter. Phase 3: `setGame(game)` called after init; `_getGrowthSpeedMultiplier()` reads `game.homeUpgrades.shrineUpgrades.fertileSoilLevel` (0=1.0×, 1=0.85×, 2=0.70×); `update()` uses `effectiveDt = dt * speedMultiplier` for stage advancement.
- **Flower.js** - Wild flower system with 3 rarity types: Blue (10%), Red (30%), White (60%). Each has 4 tile variations. Harvest yields 1-2 with fade-out animation. Phase 3: harvest adds FLOWER_BLUE/RED/WHITE color-specific resource types to inventory (not generic FLOWER).
- **ReplenishZoneManager.js** - Auto-replanting zone system. `createZone(tiles, cropTypeIndex)` → zones are Sets of `"x,y"` tile keys with eviction logic (tile can only belong to one zone). `onHarvest(tileX, tileY)` queues plant job via `jobManager.addJobToQueue()` if seeds available, else pauses zone (grey border). `checkPausedZones()` reactivates on inventory change and queues replant for any hoed-but-empty tiles. `pauseZonesForCrop(cropTypeIndex)` marks all active zones for that crop type as inactive (called by JobManager when seeds exhaust mid-job so missed tiles get retried on restock). `expandZone(id, newTiles)` merges additional tiles. `changeSeed(id, cropTypeIndex)` updates zone's seed type. `deleteZone(id)` removes all tiles. `render(ctx, camera, tileSize)` draws perimeter edges (skips shared edges); world-pixel coords used directly since camera transform already applied — `lineWidth = 2 / zoom`; active zones green, paused zones grey. Zone management panel (`#zone-manage-panel`) opened by clicking a zone tile in zone manage mode; shows Delete, Change Seed, Expand buttons.
- **FlowerManager.js** - Spawning and management of flowers and weeds. Dynamic spawn rate based on grass coverage. 75% weeds vs 25% flowers. `_getSpawnAreas()` returns farm grass, both town chunks (store + home), and all allocated forest chunk areas.
- **Weed.js** - Invasive plants with 4 growth stages over 2 minutes. Each click regresses one stage. Multi-tile at stages 3-4 (2 tiles tall)

### Resource Gathering Systems (js/)

- **Tree.js** - Tree harvesting. Two types: Thin (1x3 tiles, 2-5 wood) and Thick (2x3 tiles, 5-10 wood). Each chop yields 1 wood
- **TreeManager.js** - Tree spawning and tracking. Extends `ResourceManager` (`this.trees = this.resources`). Floating "+1 wood" harvest effects via `this.effects`, fade-out when depleted
- **OreVein.js** - Mining system with 5 ore types: Iron, Coal, Mithril, Gold, Rock. 2x2 tile footprint, 5-10 ore per vein. Visual degradation stages: Full → Partial → Depleted
- **OreManager.js** - Ore vein spawning and extraction. Extends `ResourceManager` (`this.oreVeins = this.resources`). Floating "+1 ore" mining effects via `this.effects`

### Combat System (js/)

- **Enemy.js** - Enemy AI (Skeleton). Stats: 30 HP, 5 damage, vision range 5 tiles, attack range 1 tile. Animations: IDLE, WALK, ATTACK, HURT, DEATH. A* pathfinding toward player, damage flash effect, health bar rendering
- **EnemyManager.js** - Enemy spawning and coordination. Vision detection, combat engagement tracking, 1-second attack cooldown, dead enemy cleanup after fade-out. Uses `game.getCombatTargets()` to find human/goblin targets — does not access `game.humanPosition`/`goblinPosition` directly.

### Tool & Job Systems (js/)

- **Toolbar.js** - Bottom toolbar with tool icons extracted from tileset at 400% scale. Handles tool selection and cursor changes. Seed submenu shows owned-count badges (`.seed-count-badge`) and dims/disables buttons when count is 0 (`.seed-unavailable`). Goblin and All queue-selector buttons are hidden by default; call `setGoblinHired(hired)` to reveal them. `refreshSeedSubmenu()` is called on inventory change. Watering can button shows water level badge (`.water-level-badge`) displaying `cur/max`; `refreshWaterDisplay()` updates it after each use or refill. Phase 3: seed submenu includes "⟳ Auto-Replant" toggle (`replenishMode` flag) and "⬚ Manage Zones" button (`zoneManageMode` flag). `_enterZoneManageMode()` deactivates any active tool (including plant button in open-submenu state) and shows `#zone-expand-indicator`. `exitZoneManageMode()` cleans up. Phase 4a: BUILD tool (tileId 3045, HAMMERING animation) added to toolbar with a build submenu; `createBuildSubmenu()` shows a "Paths" section (Stone Path, 1 stone/tile) and a "Houses" section (small_house, any villager-unlocked specials). `refreshBuildSubmenu()` updates special-building availability based on `villagerManager.getUnlockedSpecialBuildings()`.
- **TileSelector.js** - Click/drag tile selection with rectangle highlight. Validates tiles against tool acceptability rules and resource occupancy. Chunk ownership gate: non-owned forest chunks → sword + shovel-on-weed only; owned → all tools. Per-drag `_acceptabilityCache` Map (key `"x,y"`) avoids redundant checks; cleared on drag start and tool change. `_getChoppableTreeAt()` checks both treeManager and forestGenerator. Phase 3: `zoneExpansionMode` flag and `zoneExpansionTargetId` — when true, `startSelection()` bypasses tool check, `updateSelectedTiles()` marks all tiles valid (no tool validation), `endSelection()` returns all selected tiles. Zone expansion drag calls `replenishZoneManager.expandZone()` instead of creating a job.
- **JobManager.js** - Multi-queue job system. Queues: `all` (shared), `human`, `goblin`. Each worker tracks current job independently. Supports `isIdleJob` flag for idle-sourced jobs. Methods: `addJob()`, `addIdleJob()`, `cancelJob()`, `getAllJobsByQueue()`. `_buildJob(tool, tiles, targetQueue)` creates a plain job object — used internally by `addJob()`, `addIdleJob()`, and `fireGoblin()` to avoid code duplication. `assignJobToWorker()` guards: skips goblin if `!game.goblinHired`. Plant jobs guard seed availability: `isTileJobAlreadyDone` skips a tile if no seed in inventory and calls `replenishZoneManager.pauseZonesForCrop()` so missed tiles are retried on restock; `applyPlantPhase1` cancels all plant jobs for that worker if seeds run out mid-job and calls `replenishZoneManager.pauseZonesForCrop()`. Idle harvest notifies `replenishZoneManager.onHarvest()` so zone auto-replant triggers for idle-harvested tiles. Watering can auto-refill: `_autoQueueWellFill(workerId)` saves remaining tiles to `pendingWateringResume`, aborts the watering job, inserts a `fill_well` job at the front of the worker's private queue; after fill completes, `applyToolEffect('fill_well')` restores and re-queues the saved watering tiles. Phase 3: `addJobToQueue(tool, tiles, queueName)` — public method that routes directly to a named queue. 'craft' job type: `job.craftingRecipeId`, `job.craftingCycles`, `job.craftingCyclesCompleted`, `job.refundItems` (for cancel refund). `applyToolEffect('craft')` increments cycles; on completion calls `game.applyCraftingEffect(recipeId)`. `cancelJob()` refunds ingredients if `job.refundItems` is set.
- **Pathfinder.js** - A* pathfinding with MinHeap for O(n log n) performance. Path tiles have 1.5x speed boost (lower cost). Finds paths avoiding obstacles. Returns null if no path found. `setWell(well)` registers the well as an obstacle (checks `well.isObstacle(x,y)` in `isWalkable()`).
- **TileOverlayManager.js** - Manages sprite overlays on tiles (holes from digging, path edge sprites)
- **IdleManager.js** - Autonomous idle activity system for the human character. State machine: `inactive → waiting (3-5s) → active`. Evaluates harvest, water, fill_well, flower-pick, and weed-clear tasks using actual A* path lengths (not just Euclidean distance). `fill_well` activity (weight 30): only evaluates when `game.wateringCanWater === 0` and a well exists; pathfinds to well service tile. After cancelling an idle job, immediately calls `jobManager.tryAssignJobs()` so queued player jobs don't stall. All distance/backoff constants from `CONFIG.idle` (maxEuclideanDistance: 20, maxPathLength: 35, pathCheckCandidates: 3, backoffMax: 15000). Backs off exponentially on failure. Returns home when nothing to do. All activities filter to owned chunks; weed-clearing also allows town chunk. Uses game facade methods (`game.findPath()`, `game.isTileWalkable()`, `game.isTileOwned()`) instead of accessing subsystems directly.

### Building & Villager Systems (js/) — Phase 4a

- **BuildingRegistry.js** - Static configuration for all player-buildable structures and villager milestones. `BUILDING_DEFS` maps string keys to building definitions with fields: `id`, `name`, `category` (`'house'|'special'`), `tilemapPrefix` (CSV path prefix), `footprint` (`{width,height}`), `layers` (array of `{csvSuffix, renderPass}`; renderPass ∈ `'ground'|'upper'|'roof'`), `cost` (`{wood,stone,gold,ore_iron,...}`), `constructionCycles`, `doorOffset` (`{x,y}` local tile), `unlockedBy` (villager id or null), `unique`, `hasTilemap`, `debugOnly`. Current buildings: `small_house` (5×5, hasTilemap:true, tilemapPrefix:'Tileset/house1'), `debug_home` (10×10, debugOnly), plus 14 special buildings (pub, workshop, apothecary, cafe, shrine_temple, forge, trading_post, bakery, dock, goblin_den, theater, laboratory, stable, jewelry_shop, town_hall — all hasTilemap:true, tilemapPrefix:'Tileset/home', footprint 10×10). `VILLAGER_MILESTONES` array — each milestone: `{id, name, trigger(milestones)→bool, combo:[{id,count}]}`. 15 milestones from innkeeper to mayor, each tied to a BUILDING_DEFS `unlockedBy`. `buildingCostToRefundItems(cost)` converts cost object to `[{resource, amount}]` refund items for JobManager cancel-refund.
- **BuildingManager.js** - Manages all player-placed buildings. `placedBuildings` array; `_layerCache` Map caches CSV layer data per defId. `loadDefinitionLayers(defId)` fetches CSV files async (safe no-op for hasTilemap:false). `placeBuilding(defId, tileX, tileY, state='under_construction')` returns building object. Building states: `under_construction` (passable, rendered at 0.3 alpha) → `inactive` (path-connected required) → `active_empty` → `active_occupied`. `completeBuildingById(id)` → sets state to `'inactive'`, fires `onBuildingCompleted(building)` callback. `deconstructBuilding(id)` removes and returns building. `getBuildingAt(tileX, tileY)` checks footprint. `getFootprintTiles(building)` returns all `{x,y}` tiles in footprint. `isObstacle(tileX, tileY)` — under_construction buildings are passable; completed ones block. `isPlayerInsideBuilding(playerTileX, playerTileY)` — returns matching building or null (used for roof-hiding). `render(ctx, camera, pass, playerTile)` renders all buildings for a pass; `renderGhost(ctx, camera, defId, tileX, tileY, valid)` shows 50% alpha placement preview with green/red tint. `renderDebugOverlay(ctx, camera)` draws colored state overlays. `setTileset(image)` sets the tileset image.
- **PathConnectivity.js** - BFS utility to determine if a tile is connected to the great path strip (y = mainPathY … mainPathY+mainPathGap-1). `playerPlacedPaths` Set (`"tileX,tileY"`) tracks player-placed path tiles for pickaxe-removability (not used for BFS — BFS detects path tiles via tilemap tileId). `isPathTile(x, y)` — true for great path rows and tilemap tiles matching CONFIG.tiles.path IDs. `isConnectedToGreatPath(x, y)` — cached BFS result (returns false if start is not a path tile). `invalidate()` clears cache — call after any path tile change. BFS explores 4-directional neighbors; terminates true when any visited tile is on the great path strip.
- **VillagerManager.js** - Manages recruited villagers and displacement. `villagers` array `[{id, type, houseId}]`. `displacedQueue` FIFO of villager type strings awaiting new houses. `getEligibleMilestoneIds()` — checks `game.milestones` against each VILLAGER_MILESTONE trigger, excludes already-recruited types. `onHouseReady(building)` — if displaced villager waiting, assigns immediately; else pushes to `_readyHouses` and notifies `game.travelerManager.onEmptyHouseAvailable(building)`. `onVillagerRecruited(villagerType, building)` — adds villager, sets building to `active_occupied`, increments `game.milestones.totalVillagersRecruited`, calls `toolbar.refreshBuildSubmenu()`. `onHouseDeconstructed(building)` — pushes occupant to displaced queue, removes from villagers. `getVillagerCount()`, `hasVillagerType(type)`. `getUnlockedSpecialBuildings()` — returns defIds of hasTilemap:true special buildings whose `unlockedBy` matches a recruited villager.
- **ForestGenerator.js (updated)** - `ForestTree.initiallyLit` field: preserved after first chop (isLit is cleared). `chopTree()` attaches `result.wasInitiallyLit` when tree is depleted. `pickSeedType(wasInitiallyLit)` — weighted random seed key from 10 seed types; non-lit trees favour cheap seeds (exponential decay weights), initially-lit trees favour mid-tier seeds (shifted bell distribution). Called by `JobManager.chopTree()` on depletion to select the dropped seed.
- **TravelerManager.js (updated)** - Now supports milestone travelers. `villagerManager` reference (set via `setVillagerManager(vm)`). `regularTravelersSinceMilestone` counter. `_pendingEmptyHouse` set by `onEmptyHouseAvailable(building)`. On spawn tick: if pendingEmptyHouse + eligible milestones + counter ≥ `CONFIG.villagers.maxRegularTravelersBeforeMilestone` → spawns milestone traveler (`_spawnMilestoneTraveler(villagerMilestoneId, house)`). Milestone traveler: `isMilestone:true`, `villagerType`, `villagerName`, `targetHouse`, `comboItems:[{id,count}]` — combo items are required at the stand; visiting triggers recruitment on completion.

### Chunk World Layout (initial 3×4 grid = 45 wide × 64 tall)

```
Row 0:  [dense forest] [dense forest] [dense forest]  worldY = 0–14
Row 1:  [dense forest] [TOWN chunk]   [dense forest]  worldY = 15–29  (sparse forest, TOWN state)
         ---- great path y=30–33 (4 tiles, full map width) ----
Row 2:  [forest+res]   [farm+stand]   [forest+res]    worldY = 34–48
Row 3:  [forest+res]   [forest+res]   [forest+res]    worldY = 49–63
```

- **Chunk size**: 15×15 tiles (`CONFIG.chunks.size = 15`)
- **Town chunk**: col=1, row=1 → world x=15–29, y=15–29 (TOWN state; sparse forest, no TMX home)
- **Farm chunk**: col=1, row=2 → world x=15–29, y=34–48 (OWNED; shifted 4 tiles by `mainPathGap`)
- **North forest chunks** (rows 0–1, flanking cols): permanently LOCKED, dense forest (no clearings, density 0.9), no purchase signs ever shown
- **South forest chunks** (rows 2+): LOCKED until adjacent to OWNED, then PURCHASABLE; forest with resource clearings (pocket radius 3)
- **Great path strip**: world y=30–33 — SEPARATE tilemap, NOT chunk tiles (virtual in `getTileAt`)
  - y=30: N-grass + `'S'` edge overlay; y=31–32: path tiles (speed boost); y=33: S-grass + `'N'` edge overlay
  - Rendered by `tilemap.renderGreatPath()` after `tilemap.render()`
  - North bridge: DYNAMIC — scans y=29 for path tiles to create bridge column(s); south bridge at x=22 (farm house path)
- **New house** (house.tmx, 6×6): world (16, 37) — in farm chunk (`newHouseOffsetX=16, newHouseOffsetY=37`)
- **Player spawn**: world tile (17, 40) in farm chunk
- **Goblin NPC**: world (22, 31) — on great path (y=31 first path tile); hidden until hired
- **Chimney smoke**: world tile (18, 38)

### Farm Chunk Zones (within col=1 row=2)

- **House footprint**: x=16–21, y=37–42
- **Farm grass** (flowers/crops): y=43–48, x=15–29 (`grassStartY = newHouseOffsetY + newHouseHeight = 43`)
- **No south forest** — the farm chunk has no trees
- **Roadside stand**: tileX=23, tileY=34 (north edge of farm = mainPathY+mainPathGap)
- **Well**: tileX=24, tileY=38 (farmTop(34)+4, east of house)

### New House (house.tmx)

- 6×6 tile footprint placed at world tile (16, 37)
- Layers: `Ground`, `Ground Detail`, `Wall`, `Wall Detail` (rendered above path overlays via `renderGroundLayers()`), `Roof`, `Roof Detail` (rendered above character, hidden when player inside)
- Roof hidden when player tile is within x:16–21, y:37–42 (`isPlayerInsideNewHouse`)
- Door at local tile (1,4) → world (17, 41); path endpoint = y=42 (under house tilemap bottom row)
- Chimney smoke SpriteAnimator at world tile (18, 38): `chimneysmoke_02_strip30.png`, 30 frames @ 12fps. Only shown when player is outside

### Path Routing (chunk world)

- Path tile IDs: `[482, 490, 491, 554, 555]`. Speed multiplier: 1.5x
- **Great path** (y=30–33): SEPARATE tilemap via `renderGreatPath()` — no `setTileAt` calls
- **House east-side path**: x=22, y=34–42 (east of house, from farm top to house front)
- **House front E-W**: y=42, x=16–22

### Game.js Combat Properties

```javascript
playerMaxHealth: 100      playerHealth: 100
playerDamage: 10          playerVisionRange: 5
playerAttackRange: 1      isInCombat: false
combatTarget: null        engagedEnemies: Set
toolAnimationMultipliers  // Modified by crafting upgrades
animationSession          // For stale callback invalidation
goblinHired: false        // true after hireGoblin() — reveals goblin UI; false after fireGoblin()
displayedGold: 0          // animates toward targetGold (count-up display)
targetGold: 0             // actual gold from inventory.getGold()
_seedEffects: []          // floating effects for wild crop seed drops
// Phase 2 additions:
well: Well                // Well instance (tileX=24, tileY=38)
wateringCanWater: CONFIG.watering.canMaxCapacity      wateringCanMaxWater: CONFIG.watering.canMaxCapacity
goblinWaterCanWater: CONFIG.watering.canMaxCapacity   goblinWaterCanMaxWater: CONFIG.watering.canMaxCapacity
humanPixelTarget: null    humanIsSliding: false        // sub-tile slide
humanSlideStart: null     humanSlideTarget: null       humanSlideElapsed: 0
goblinPixelTarget: null   goblinIsSliding: false       // goblin slide
// Phase 3 additions:
homeUpgrades: {
  slots: [null],              // Level 1: 1 slot; values: null|'cauldron'|'anvil'|'shrine'
  shrineUpgrades: {
    fertileSoilLevel: 0,      // 0=none, 1=−15% growth time, 2=−30% growth time
    bountifulHarvest: false,  // if true: each harvest yields +1 bonus item
    roadsideReplenishment: false  // if true: ⟳ auto-replenish shown on stand slots
  },
  purchasedToolUpgrades: Set  // tracks anvil upgrade IDs already purchased (one-time)
}
replenishZoneManager: ReplenishZoneManager  // auto-replanting zone system
standQueue: []            // {traveler, waitTimer} entries waiting while stand is busy
standService: { state, workerId, slotIndex, traveler, waitTimer }
// hireGoblin() — reveals goblin UI; fireGoblin() — re-queues player jobs to queues.all, hides goblin UI
// applyCraftingEffect(recipeId) — dispatches craft completion to inventory/homeUpgrades
// _openZonePanel(zone) / _closeZonePanel() / _initZonePanel() — zone management UI
// _beginServingTraveler(traveler) / _dequeueNextTraveler() — stand queue management
// Harvest hook: calls replenishZoneManager.onHarvest(tileX, tileY) after crop harvest
// Bountiful harvest: inventory.addCropByIndex(idx, 1 + (bountifulHarvest ? 1 : 0))
// Phase 4a additions:
buildingManager: BuildingManager    // manages placed buildings (under_construction/inactive/active_empty/active_occupied)
playerPlacedPaths: Set              // "tileX,tileY" keys for player-placed path tiles (pickaxe-removable)
pathConnectivity: PathConnectivity  // BFS checker: isConnectedToGreatPath(x, y)
villagerManager: VillagerManager    // villager recruitment, displacement, milestone eligibility
milestones: {                       // all milestone counters (updated as player progresses)
  totalGoldEarned: 0,
  totalCropsHarvested: 0, totalCropsPlanted: 0,
  totalPotionsCrafted: 0, totalAnvilUpgrades: 0, totalShrineUpgrades: 0,
  totalChunksOwned: 1, totalVillagersRecruited: 0, goblinEverHired: false
}
_buildPlacementMode: null | { type:'path' } | { type:'building', defId, zeroCost }
// _showPathDebug / _showBuildingDebug toggle debug overlays
```

### Rendering Order
1. Canvas clear
2. `tilemap.render()` — base chunk tiles + store/home layers (Ground, Decor, Buildings Base/Detail); SKIPS y=30–33
3. `tilemap.renderGreatPath()` — great path strip at y=30–33 (OVER chunk tiles)
4. `chunkManager.render()` — ownership borders (OWNED chunks against non-OWNED neighbors)
5. `overlayManager.renderEdgeOverlays()` — path edge sprites
6. Forest tree backgrounds (shadows/trunks; render OVER great path)
7. `overlayManager.renderNonEdgeOverlays()` — holes
8. `tilemap.renderGroundLayers()` — new house floor/walls (ABOVE overlays)
9. `tileSelector.render()` — selection highlight + work queue overlay
10. `cropManager.renderAllCropGroundTiles()` — hoed/wet ground under crops
11. `replenishZoneManager.render()` — zone perimeter borders (green/grey); drawn after ground tiles, before crops/characters
12. Depth-sorted entities (crops, flowers/weeds, trees, ore veins, characters, enemies, effects)
13. Forest foregrounds (tree crowns; render OVER great path)
14. `chunkManager.renderPurchaseSigns()` — purchase "?" signs ABOVE trees (north chunks show NO signs)
15. `tilemap.renderUpperLayers()` — store/home upper building layers
16. `tilemap.renderRoofLayers()` — new house roof (hidden when player inside)
17. Chimney smoke (when player outside)
18. UI

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
- `size: 15` — tiles per chunk side
- `initialGridCols: 3`, `initialGridRows: 4` — initial sparse grid (3×4 = 12 chunks, 2,700 tiles)
- `homeCol: 1`, `homeRow: 1` — town chunk position (world x=15–29, y=15–29; single starting TOWN chunk)
- `farmCol: 1`, `farmRow: 2` — farm chunk position (world x=15–29, y=34–48)
- `pathBoundaryRow: 1` — last chunk row north of great path (= homeRow); used in worldY gap formula
- `mainPathY: 30` — world Y of great path top row (y=30 N-grass, y=31–32 path, y=33 S-grass)
- `mainPathGap: 4` — world tile rows reserved for great path between town and farm chunks
- Gap formula: `worldY(row) = row * 15 + (row > pathBoundaryRow ? mainPathGap : 0)`
- `purchasePrices: [100, 500, 2000, 10000, 50000]` — gold costs by Manhattan distance index (dist-1) from farm chunk
- No `storeCol`/`storeRow` — single town chunk (no separate store chunk)

**CONFIG.watering** - `canMaxCapacity: 20` — starting capacity for human and goblin cans

**CONFIG.flowers** - `maxCount: 100`, `maxSpawnAttempts: 50` (used by FlowerManager)

**CONFIG.effects** - `floatingDuration: 1000` — ms for floating "+1 item" effect (used by EffectUtils)

**CONFIG.idle** - `maxEuclideanDistance: 20`, `maxPathLength: 35`, `pathCheckCandidates: 3`, `backoffMax: 15000` (all used by IdleManager)

**CONFIG.stand.traveler** - `queuePatience: 15000` — ms a queued traveler will wait before giving up

**CONFIG.villagers** - `maxRegularTravelersBeforeMilestone: 5` — regular travelers spawned before a milestone traveler can spawn

**CONFIG.build** - `pathCostPerTile: 1` — stone cost per path tile placed by the player

**CONFIG.debug** - logLevel, showFps, showPathfinding, developmentMode (true = debug menu always shown)

**Helper functions**:
- `getRandomDirtTile()` - Returns random dirt tile ID (80% common, 20% rare variants)
- `getRandomPathTile()` - Returns random path tile ID (60% common tile 482, 40% variants)

### Other Configuration Locations

**Game.js ANIMATION_DATA** - Frame counts per animation for human (e.g., WAITING: 9, WALKING: 8, HAMMERING: 23, DOING: 8, WATERING: 5)

**Game.js GOBLIN_ANIMATION_DATA** - Frame counts + framesPerRow for goblin (handles multi-row sprites)

**Crop.js** - Growth timing (GROWTH_TIME: 3000ms), crop types (11 types with tile offsets), tile ID ranges (691-1139)

**Inventory.js** - Resource categories: CROPS, SEEDS, FLOWERS, ORES, WOOD, GOLD

**UIManager.js UPGRADES** - Crafting upgrades with costs and effects (tool speed multipliers, health boost)

**IdleManager.js** - Activity weights (harvest:30, water:30, fill_well:30, flower:20, weed:20); distance/backoff constants from `CONFIG.idle`

## Known Asset Quirks

Animation filenames have inconsistencies the code handles:
- "HAMMERING" → filename uses "hamering" (typo in assets)
- "WALKING" → filename uses "walk" (shortened)
- Goblin CASTING and DIG are multi-row sprite sheets (framesPerRow in GOBLIN_ANIMATION_DATA)

## Tool System

**Available tools** (Toolbar.js TOOLS constant):
- Watering Can (2858), Axe (2922), Hoe (2986), Sword (3050)
- Shovel (3114), Fishing Rod (3178), Pickaxe (3113), Plant (2857), Build (3045)

**Implemented tool actions**:
- **Hoe**: Changes grass/dirt tiles to hoed ground (tile ID 67). Uses AXE animation
- **Shovel**: Only works on hoed tiles (67). Adds hole overlay (tile ID 1138). Uses DIG animation
- **Axe**: Chops trees. Each hit yields 1 wood. Uses AXE animation
- **Pickaxe**: Mines ore veins. Each hit yields 1 ore. Uses AXE animation
- **Sword**: Attacks enemies. Uses ATTACK animation. Damage based on playerDamage stat
- **Watering Can**: Waters crops in `needs_water` state. Deducts from `wateringCanWater` (human) or `goblinWaterCanWater` (goblin). Auto-refills at well when empty. Uses WATERING animation
- **fill_well** (internal): Worker walks to well service tile, plays DOING animation once, refills the can to max. Not selectable from toolbar — created automatically by `_autoQueueWellFill()`
- **Build (path)**: Player selects "Stone Path" from build submenu, drags over tiles → places path tile IDs via `setTileAt`, deducts 1 stone per tile (`CONFIG.build.pathCostPerTile`), adds to `game.playerPlacedPaths`, invalidates PathConnectivity cache. Uses HAMMERING animation.
- **Build (building)**: Player selects a building from build submenu → enters ghost placement mode (`_buildPlacementMode = {type:'building', defId}`). Ghost renders via `buildingManager.renderGhost()`. On click: checks cost + ownership + no overlap → calls `buildingManager.placeBuilding()` → queues HAMMERING job cycles → on completion calls `buildingManager.completeBuildingById()` → checks PathConnectivity → if connected sets `active_empty` and calls `villagerManager.onHouseReady()`.

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

**New building type**: Add entry to `BUILDING_DEFS` in BuildingRegistry.js with all required fields. If `hasTilemap:true`, create matching CSV layer files under `Tileset/`. Add building CSV handling to `BuildingManager.loadDefinitionLayers()` if layers differ from standard format. For villager-unlocked specials, set `unlockedBy` to a VILLAGER_MILESTONES id.

**New villager milestone**: Add entry to `VILLAGER_MILESTONES` in BuildingRegistry.js with `id`, `name`, `trigger(milestones)→bool`, and `combo`. Add a matching BUILDING_DEFS entry with `unlockedBy` = the milestone id. Ensure `game.milestones` tracks any new counter the trigger reads.

## Important Implementation Notes

### Error Handling
- Game loop (update/render) is wrapped in try-catch to prevent crashes
- All input callbacks (click, drag start/move/end) have error boundaries
- Errors are logged to console but don't freeze the game

### Resource Management
- Seeds are consumed from inventory when planting (JobManager.applyPlantPhase1)
- Enemy sprites clear callbacks before creating new ones to prevent memory leaks
- Animation session counter in Game.js invalidates stale callbacks when animations change rapidly
- Wild crop seed drops (50% on non-hoed tiles) use `_seedEffects` array in Game.js
- Inventory onChange is multi-subscriber (`_changeListeners` array): each subsystem calls `inventory.onChange(fn)` independently without chaining — no capture-existing pattern needed

### Data Structures
- `engagedEnemies` in Game.js is a Set (not Array) for O(1) lookup/add/delete
- Pathfinder uses MinHeap for O(log n) node extraction instead of array sort
- JobManager uses `workers` Map (workerId → state) and `queues` object (all/human/goblin)
- ChunkManager uses sparse `Map("col,row" → chunk)` — unallocated chunks return default grass (tile 65) when read
- TilemapRenderer uses `chunkTiles` Map (`"col,row"` → Uint16Array(225)) for sparse tile storage
- `getTileAt`/`setTileAt` support negative tile coords (chunk mode) — no `x<0||y<0` guard

### Chunk Ownership Rules
- **OWNED** chunks: full farming/gathering access for all tools
- **TOWN** chunks (store + home): walk-through + weed-clearing only (no farming or resource gathering)
- **PURCHASABLE** chunks: displayed with "?" sign; click to purchase
- **LOCKED** chunks: walk-through only, shown as forest; must be adjacent to OWNED to become PURCHASABLE
- **North forest chunks** (rows 0–1, flanking cols): permanently LOCKED regardless of adjacency — `_updatePurchasableChunks()` only promotes chunks where `row >= farmRow` (2). No purchase signs ever rendered for these.
- Purchasing a chunk allocates all 8 neighbor chunks (if they don't exist) and fires `onChunkPurchased`

### Logging
- Use `Logger.create('ModuleName')` at the top of each file
- Log level configured via `CONFIG.debug.logLevel` ('debug', 'info', 'warn', 'error', 'none')
- Prefer `log.debug()` for frequent/verbose output, `log.info()` for significant events

## Tests

Tests live in `tests/`. Run by opening `tests/index.html` in a browser (uses a lightweight `TestRunner.js`).

- **tests/ChunkSystem.test.js** - Unit tests for `ChunkContentGenerator`, `ChunkGeneratorRegistry`, and `ForestChunkGenerator`. All tests use plain mock objects — no canvas, tilemap, or DOM required.
- **tests/EffectUtils.test.js** - Unit tests for `createHarvestEffect`, `updateEffects`, and `renderEffects`. Uses a mock canvas context — no DOM or tilemap required.
- **tests/Phase1Economy.test.js** - Unit tests for seed price progression, crop sell prices, `CONFIG.chunks.purchasePrices`, `ChunkManager.getChunkPrice()` / `purchaseChunk()`, and `CONFIG.tiles.hoedGround`.
- **tests/Phase2Farming.test.js** - Unit tests for `Well` obstacle detection, `CROP_TYPES` watering state machine (single + multi-water), wild crops starting in `'growing'` state, and `ForestGenerator` distance-based ore/crop selection.
- **tests/Phase3Integration.test.js** - Integration tests for new inventory resource types (flower colors, potions), recipe data structures (CAULDRON/ANVIL/SHRINE), CropManager growth-speed multiplier, JobManager craft job creation/cancel-refund, and IdleManager `fill_well` activity evaluation.
- **tests/ReplenishZoneManager.test.js** - Unit tests for `ReplenishZoneManager`: zone creation, tile eviction, `onHarvest()` queuing, `pauseZonesForCrop()`, `checkPausedZones()` reactivation, `expandZone()`, `changeSeed()`, `deleteZone()`. All dependencies mocked.
- **tests/Phase4a.test.js** - Unit tests for Phase 4a systems: `BUILDING_DEFS` structure/layer renderPass values, `VILLAGER_MILESTONES` structure/trigger functions/uniqueness, `buildingCostToRefundItems()` resource mapping, `BuildingManager` placement/state-transitions/obstacle-checking/footprint/deconstruct, `PathConnectivity` isPathTile/BFS/caching/invalidation, `VillagerManager` milestone eligibility/recruitment/displacement/onHouseReady displaced-queue logic, `CONFIG.villagers` and `CONFIG.build` additions.
- **tests/Phase4b.test.js** - Unit tests for Phase 4b additions: `ForestGenerator.pickSeedType()` weighted distribution (lit vs non-lit), `TravelerManager` milestone state initialization/`setVillagerManager`/`onEmptyHouseAvailable`, `JobManager.addConstructJob()` job properties/queue management, `CONFIG.chunks` 3×4 world layout constants (mainPathY:30, farmRow:2, homeRow:1).
