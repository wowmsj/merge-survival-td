# Monster Codex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an eight-entry monster codex to the GameScene bottom navigation.

**Architecture:** Reuse `BasePanel`, `getAllZombieConfigs`, `getZombieName`, and existing `zombie.tag.*` locale keys. Render a compact two-column grid; add only locale labels and one panel file.

**Tech Stack:** Phaser, TypeScript, existing i18n.

---

### Task 1: Panel and navigation

- [ ] Create `src/phaser/ui/MonsterPanel.ts` with an existing `BasePanel` mask/chrome and two-column/four-row cards.
- [ ] Add `monsterPanel` state and a `menu.monsters` button to `GameScene.ts`; include it in `inputBlocked`.

### Task 2: Locales and checks

- [ ] Add Chinese and English labels for title and stat fields.
- [ ] Add smoke assertions for menu wiring, eight configs, and translated ability text.
- [ ] Run `npx.cmd tsc --noEmit`, `npm.cmd run smoke`, and `npm.cmd run build`.
