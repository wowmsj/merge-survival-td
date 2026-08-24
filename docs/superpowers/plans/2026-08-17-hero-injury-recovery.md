# Hero Injury And Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let deployed heroes take night-combat damage, recover by day, and become unavailable for seven days after being downed.

**Architecture:** Persist hero HP and critical recovery state in `IHeroState`. `HeroSystem` owns deployment eligibility and daily recovery; `NightSystem` applies adjacent zombie melee damage and removes downed heroes from the field. Phaser scenes render this state only.

**Tech Stack:** TypeScript, Phaser 4, existing `scripts/smoke.ts` assertion harness.

---

### Task 1: Persisted Hero Health

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/config/HeroConfig.ts`
- Modify: `src/core/config/data/hero.json`
- Modify: `src/core/config/StoryConfig.ts`
- Modify: `src/core/systems/StorageSystem.ts`
- Test: `scripts/smoke.ts`

- [ ] **Step 1: Write failing smoke assertions for default and legacy hero health.**

```ts
assert(joined.hp === joined.maxHp, 'new hero joins at full HP');
assert(loaded!.heroes[0].hp === loaded!.heroes[0].maxHp, 'legacy hero save restores full HP');
```

- [ ] **Step 2: Run the smoke suite and verify failure.**

Run: `npm.cmd run smoke`
Expected: failure because `IHeroState` has no health fields.

- [ ] **Step 3: Add `hp`, `maxHp`, and optional `recoveryDays` to hero state, add `hp` to hero config, and normalize missing saved values.**

```ts
export interface IHeroState { key: string; row: number; col: number; hp: number; maxHp: number; recoveryDays?: number; }

for (const hero of data.state.heroes) {
  const maxHp = getHeroConfig(hero.key)?.hp ?? 100;
  hero.maxHp = Math.max(1, hero.maxHp ?? maxHp);
  hero.hp = Math.min(hero.maxHp, Math.max(0, hero.hp ?? hero.maxHp));
}
```

- [ ] **Step 4: Run the smoke suite and verify the persistence assertions pass.**

Run: `npm.cmd run smoke`
Expected: `0 failed`.

### Task 2: Deployment And Recovery Rules

**Files:**
- Modify: `src/core/systems/HeroSystem.ts`
- Modify: `src/core/systems/NightSystem.ts`
- Modify: `src/core/i18n/zh-CN.ts`
- Modify: `src/core/i18n/en.ts`
- Test: `scripts/smoke.ts`

- [ ] **Step 1: Write failing tests for injury recovery and critical deployment lock.**

```ts
hero.hp = 50; hero.maxHp = 100; heroSystem.recoverForNewDay(state);
assert(hero.hp === 70, 'injured hero restores 20% max HP each day');
hero.hp = 0; hero.recoveryDays = 7;
assert(!heroSystem.deploy(state, hero.key, 5, 5), 'critical hero cannot deploy');
```

- [ ] **Step 2: Run the smoke suite and verify failure.**

Run: `npm.cmd run smoke`
Expected: failure because no recovery API or critical deployment guard exists.

- [ ] **Step 3: Add a `recoverForNewDay` method and call it only after a victorious night advances `state.day`.**

```ts
if (hero.recoveryDays) {
  hero.recoveryDays -= 1;
  if (hero.recoveryDays === 0) hero.hp = hero.maxHp;
} else if (hero.hp > 0) {
  hero.hp = Math.min(hero.maxHp, hero.hp + Math.ceil(hero.maxHp * 0.2));
}
```

- [ ] **Step 4: Guard `HeroSystem.deploy` when `hp <= 0` or `recoveryDays > 0`, emitting a localized critical-state toast.**

```ts
if (hero.hp <= 0 || hero.recoveryDays) {
  eventBus.emit(GameEvents.TOAST_SHOW, getText('toast.heroCritical', { days: hero.recoveryDays ?? 0 }));
  return false;
}
```

- [ ] **Step 5: Run the smoke suite and verify recovery and deployment tests pass.**

Run: `npm.cmd run smoke`
Expected: `0 failed`.

### Task 3: Night Melee Damage

**Files:**
- Modify: `src/core/events/EventBus.ts`
- Modify: `src/core/systems/NightSystem.ts`
- Test: `scripts/smoke.ts`

- [ ] **Step 1: Write a failing battle test for adjacent zombie attacks.**

```ts
assert(hero.hp < hero.maxHp, 'adjacent zombie damages deployed hero');
assert(hero.row === -1 && hero.recoveryDays === 7, 'downed hero is recalled and enters critical recovery');
```

- [ ] **Step 2: Run the smoke suite and verify failure.**

Run: `npm.cmd run smoke`
Expected: failure because zombie movement ignores heroes.

- [ ] **Step 3: Before building damage, select a deployed hero within Chebyshev distance 1, subtract zombie attack, and emit a dedicated hero-hit event.**

```ts
const hero = this.findAdjacentHero(state, z.row, z.col);
if (hero && z.attackCd <= 0) {
  this.damageHero(state, hero, z.attack ?? cfg.attack);
  z.attackCd = cfg.attackInterval ?? 1000;
  return;
}
```

- [ ] **Step 4: Run the smoke suite and verify hero damage and existing building tests pass.**

Run: `npm.cmd run smoke`
Expected: `0 failed`.

### Task 4: Hero Health Presentation

**Files:**
- Modify: `src/phaser/scenes/BaseScene.ts`
- Modify: `src/phaser/scenes/NightScene.ts`
- Test: `scripts/runtime-ui-i18n-smoke.ts`

- [ ] **Step 1: Render a fixed-size HP bar under each deployed hero and add HP / critical text to hero cards and detail dialog.**

```ts
const ratio = hero.maxHp ? hero.hp / hero.maxHp : 0;
drawHealthBar(graphics, x, y, ratio, hero.recoveryDays ? 0x777777 : 0x6bd36b);
```

- [ ] **Step 2: Disable critical hero cards without changing the existing recall behavior of healthy deployed heroes.**

```ts
const critical = hero.hp <= 0 || !!hero.recoveryDays;
if (critical) card.setAlpha(0.45);
```

- [ ] **Step 3: Run UI localization smoke verification.**

Run: `npm.cmd run smoke:i18n`
Expected: `0 failed`.

### Task 5: Full Verification

**Files:**
- Modify: no additional files

- [ ] **Step 1: Compile without emitting files.**

Run: `npx.cmd tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 2: Run gameplay and localization smoke suites.**

Run: `npm.cmd run smoke`
Expected: `0 failed`.

Run: `npm.cmd run smoke:i18n`
Expected: `0 failed`.

- [ ] **Step 3: Build the production bundle.**

Run: `npm.cmd run build`
Expected: `compiled successfully`.
