# Territory Defense Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add owned territory, outpost expansion, unrestricted owned-tile placement, and a guaranteed ground-enemy kill corridor.

**Architecture:** Store ownership in the existing base state, expose pure grid/path helpers from `Base.ts`, and let `BaseSystem` own placement validation. `NightSystem` consumes the same path helper so preview validation and runtime movement cannot disagree.

**Tech Stack:** TypeScript, Phaser 4, existing `scripts/smoke.ts` assert harness.

---

### Task 1: Base territory model

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/model/Base.ts`
- Modify: `scripts/smoke.ts`

- [ ] **Step 1: Write the failing smoke assertions**

```ts
const base = createDefaultBase();
assert(isClaimed(base, 6, 6), 'core area is initially claimed');
assert(!isClaimed(base, 0, 0), 'corner is initially unclaimed');
assert(claimAround(base, 3, 6, 1) > 0, 'outpost claim expands the frontier');
```

- [ ] **Step 2: Run the smoke test and verify the missing helpers fail**

Run: `npm.cmd run smoke`
Expected: TypeScript reports missing `isClaimed` and `claimAround` exports.

- [ ] **Step 3: Add `claimed` tiles and the minimal helpers**

```ts
export function isClaimed(base: IBaseState, row: number, col: number): boolean {
  return !!base.tiles?.[row]?.[col]?.claimed;
}
```

- [ ] **Step 4: Run smoke to verify the assertions pass**

Run: `npm.cmd run smoke`
Expected: all existing assertions and the three new assertions pass.

### Task 2: Outpost and placement validation

**Files:**
- Modify: `src/core/config/data/building.json`
- Modify: `src/core/config/BuildingConfig.ts`
- Modify: `src/core/systems/BaseSystem.ts`
- Modify: `scripts/smoke.ts`

- [ ] **Step 1: Write failing assertions for claimed placement and outposts**

```ts
assert(!baseSystem.canPlace(state, 101, 0, 0).ok, 'unclaimed tile cannot be built on');
assert(baseSystem.place(state, 204, 3, 6), 'frontier outpost can be placed');
assert(isClaimed(state.base, 2, 6), 'outpost claims nearby territory');
```

- [ ] **Step 2: Run smoke and verify the first assertion fails because current placement accepts the corner**

Run: `npm.cmd run smoke`
Expected: assertion failure for the unclaimed-tile rule.

- [ ] **Step 3: Add one `resource` outpost config and claim on placement**

```ts
if (cfg.claimRadius && isFrontierTile(base, row, col)) {
  claimAround(base, row, col, cfg.claimRadius);
}
```

- [ ] **Step 4: Run smoke to verify placement assertions pass**

Run: `npm.cmd run smoke`
Expected: all assertions pass.

### Task 3: Shared A* kill-corridor rules

**Files:**
- Modify: `src/core/model/Base.ts`
- Modify: `src/core/systems/BaseSystem.ts`
- Modify: `src/core/systems/NightSystem.ts`
- Modify: `scripts/smoke.ts`

- [ ] **Step 1: Write failing assertions for path existence and blocking a corridor**

```ts
for (const row of state.base.tiles) for (const tile of row) tile.claimed = true;
assert(hasKillCorridor(state.base), 'initial base has a route from an entry to the core');
assert(baseSystem.place(state, 401, 4, 12), 'first entry wall is allowed while another entry remains');
assert(baseSystem.place(state, 401, 5, 12), 'second entry wall is allowed while another entry remains');
assert(!baseSystem.canPlace(state, 401, 6, 12).ok, 'wall cannot close the final kill corridor');
```

- [ ] **Step 2: Run smoke and verify the closing-wall assertion fails**

Run: `npm.cmd run smoke`
Expected: the wall is currently accepted.

- [ ] **Step 3: Implement cardinal pathfinding once and use it from placement and enemies**

```ts
export function findPathToCore(base: IBaseState, start: IPoint): IPoint[] | null;
export function hasKillCorridor(base: IBaseState): boolean;
```

`BaseSystem.canPlace` validates the prospective base, while `NightSystem` moves ground enemies to the next point of that same path.

- [ ] **Step 4: Run smoke to verify all path assertions pass**

Run: `npm.cmd run smoke`
Expected: all assertions pass.

### Task 4: Base UI and legacy-save compatibility

**Files:**
- Modify: `src/core/systems/StorageSystem.ts`
- Modify: `src/phaser/scenes/BaseScene.ts`
- Modify: `scripts/smoke.ts`

- [ ] **Step 1: Write failing old-save fallback assertion**

```ts
delete (state.base as Partial<IBaseState>).tiles;
assert(storage.loadState()!.base.tiles.length > 0, 'old saves receive base territory tiles');
```

- [ ] **Step 2: Run smoke and verify legacy saves lack tiles**

Run: `npm.cmd run smoke`
Expected: the assertion fails before the fallback exists.

- [ ] **Step 3: Initialize missing tiles and tint unclaimed cells in the scene**

```ts
if (!isClaimed(base, row, col)) cell.setTint(0x384250);
```

- [ ] **Step 4: Run full smoke and production build**

Run: `npm.cmd run smoke`
Expected: 0 failures.

Run: `npm.cmd run build`
Expected: webpack compilation succeeds.
