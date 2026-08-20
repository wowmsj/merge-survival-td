# Night Threat Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the early linear night curve with the approved 20-night enemy, route, and black-market fragment progression.

**Architecture:** Keep wave timing and composition in `ZombieConfig.ts`, market product semantics in `BlackMarketSystem.ts`, and render only preview data in `BaseScene.ts`. A market purchase grants first-level fragments, never a final blueprint.

**Tech Stack:** TypeScript, Phaser 3, JSON configs, `scripts/smoke.ts`.

---

### Task 1: Threat Schedule and Wave Budget

**Files:**
- Modify: `src/core/config/ZombieConfig.ts`
- Modify: `scripts/smoke.ts`

- [ ] Write failing assertions: `getZombieLevel(4) === 1`, `getZombieLevel(5) === 2`, fast debuts at night 4, and first boss is night 20.
- [ ] Run `npm.cmd run smoke`; confirm the new schedule assertions fail.
- [ ] Add the 20-night type schedule, 80% debut threat budget, four-night level scaling, and night-20 first boss rule. Keep existing battle callers unchanged.
- [ ] Run `npm.cmd run smoke`; confirm all assertions pass.

### Task 2: Black-Market Fragment Packs and Recommendations

**Files:**
- Modify: `src/core/systems/BlackMarketSystem.ts`
- Modify: `scripts/smoke.ts`

- [ ] Write failing assertions that the fast-zombie recommendation is slow trap at 2 stars and a purchase grants two first-level fragments.
- [ ] Run `npm.cmd run smoke`; confirm the new assertions fail.
- [ ] Change market items to `{ cfgId, fragmentId, fragmentCount: 2, star }`, map each debut phase to one recommended item, and grant two fragments while retaining the current UI-facing purchase function.
- [ ] Run `npm.cmd run smoke`; confirm all assertions pass.

### Task 3: Preview and Market Presentation

**Files:**
- Modify: `src/phaser/scenes/BaseScene.ts`
- Modify: `src/core/i18n/zh-CN.ts`
- Modify: `src/core/i18n/en.ts`
- Modify: `scripts/smoke.ts`

- [ ] Write failing source/i18n assertions for `getRecommendedMarketItem(this.state.day)` and localized two-fragment pack text.
- [ ] Run `npm.cmd run smoke`; confirm the new assertions fail.
- [ ] Show the recommended counter in the existing night-preview section, sort it to the first market card, and label each item as a two-fragment pack. Keep the current scroll container unchanged.
- [ ] Run `npm.cmd run smoke`, `npx.cmd tsc --noEmit`, `npm.cmd run smoke:i18n`, and `npm.cmd run build`; all must exit 0.
- [ ] Commit only the files above with `git commit -m "feat: add staged night threat progression"`.
