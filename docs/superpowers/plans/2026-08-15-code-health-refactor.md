# Code Health Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove confirmed architectural overhead and duplication while preserving all game behavior.

**Architecture:** `GameScene` will drive board maintenance on a 500 ms Phaser timer, so the one-system ECS wrapper can be deleted. Existing UI and story behavior will be preserved through focused smoke tests, typed event payloads, and generic reward backfill.

**Tech Stack:** TypeScript, Phaser 4, webpack, existing Node smoke scripts.

---

### Task 1: Board Tick and ECS Removal

**Files:**
- Delete: `src/core/ecs/System.ts`
- Delete: `src/core/ecs/World.ts`
- Modify: `src/core/init/GameInitializer.ts`
- Modify: `src/core/systems/SpawnSystem.ts`
- Modify: `src/phaser/scenes/GameScene.ts`
- Test: `scripts/smoke.ts`

- [ ] Confirm the existing expired-CD smoke assertions pass before the scheduling refactor.
- [ ] Replace `World` registration/update with a 500 ms Phaser timer that calls `spawnSystem.update(state, 500)`.
- [ ] Remove `System` inheritance and the unused `createWorld()` helper.
- [ ] Run `npm.cmd run smoke` and confirm all checks pass.

### Task 2: Event and Save Structure

**Files:**
- Modify: `src/core/events/EventBus.ts`
- Modify: `src/core/systems/StorySystem.ts`
- Modify: `src/core/systems/StorageSystem.ts`
- Modify: `scripts/smoke.ts`

- [ ] Add smoke coverage for backfilling each configured story `spawnProps` reward once.
- [ ] Run `npm.cmd run smoke` and confirm the generic-reward assertion fails while only beat 103 is backfilled.
- [ ] Add a `GameEventMap` and generic `on`, `off`, and `emit` methods without changing event names or payload shapes.
- [ ] Replace the beat-103 migration with iteration over configured seen beats that declare `spawnProps`.
- [ ] Run `npm.cmd run smoke` and confirm all checks pass.

### Task 3: UI Duplication and Compiler Hygiene

**Files:**
- Modify: `src/phaser/scenes/BaseScene.ts`
- Modify: `src/phaser/scenes/NightScene.ts`
- Modify: `src/core/systems/BaseSystem.ts`
- Modify: `src/core/systems/EconomySystem.ts`
- Modify: `src/core/systems/NightSystem.ts`
- Modify: `src/core/systems/TaskSystem.ts`
- Modify: `src/phaser/ui/CharacterPanel.ts`
- Modify: `src/phaser/ui/SpawnerProductsPanel.ts`
- Modify: `src/phaser/ui/StoryArchivePanel.ts`
- Modify: `src/main.ts`
- Modify: `tsconfig.json`

- [ ] Extract one `BaseScene` page-layout helper shared by building and hero palettes.
- [ ] Remove the 19 symbols reported by TypeScript unused-symbol checks.
- [ ] Enable `noUnusedLocals` and `noUnusedParameters`.
- [ ] Run `npx.cmd tsc --noEmit --noUnusedLocals --noUnusedParameters` and confirm success.

### Task 4: Full Verification

**Files:**
- Test: `scripts/smoke.ts`
- Test: `scripts/runtime-ui-i18n-smoke.ts`

- [ ] Run `npm.cmd run smoke` and confirm 0 failures.
- [ ] Run `npm.cmd run smoke:i18n` and confirm success.
- [ ] Run `npm.cmd run build` and confirm webpack compilation succeeds.
