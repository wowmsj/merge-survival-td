# English Canvas UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make fixed-size Phaser canvas UI surfaces readable in English without changing board geometry or Chinese layout.

**Architecture:** Rendering code checks the existing `getLanguage()` accessor and applies compact, fixed two-line text only in English. Existing Phaser `wordWrap` provides the layout behavior; no common text-fitting framework is introduced.

**Tech Stack:** TypeScript, Phaser 4, existing `npm.cmd` smoke scripts.

---

## File Structure

- Modify: `src/phaser/ui/TaskBar.ts` - Render English task requirements inside fixed card rows.
- Modify: `src/phaser/ui/InfoBar.ts` - Reserve a stable English title and description stack.
- Modify: `src/phaser/ui/BagPanel.ts` - Replace four-character item names with two-line labels.
- Modify: `src/phaser/ui/SpawnerProductsPanel.ts` - Replace five-character product names with two-line labels.
- Modify: `src/phaser/scenes/BaseScene.ts` - Use the English building-card title size at the existing title coordinates.
- Modify: `scripts/runtime-ui-i18n-smoke.ts` - Assert the source-level layout safeguards remain present.

### Task 1: Add Failing Layout Contract Check

**Files:**
- Modify: `scripts/runtime-ui-i18n-smoke.ts`

- [x] **Step 1: Add source assertions for all English layout boundaries**

```ts
const layoutChecks = [
  ['src/phaser/ui/TaskBar.ts', 'maxLines: compactRow ? 1 : 2', 'TaskBar'],
  ['src/phaser/ui/InfoBar.ts', "const isEnglish = getLanguage() === 'en';", 'InfoBar'],
  ['src/phaser/ui/BagPanel.ts', 'maxLines: isEnglish ? 2 : undefined', 'BagPanel'],
  ['src/phaser/ui/SpawnerProductsPanel.ts', 'maxLines: isEnglish ? 2 : undefined', 'SpawnerProductsPanel'],
  ['src/phaser/scenes/BaseScene.ts', "const buildingTitleFontSize = getLanguage() === 'en' ? '28px' : '34px';", 'BaseScene']
] as const;
const missingLayoutChecks = layoutChecks.filter(([file, text]) => !readFileSync(resolve(process.cwd(), file), 'utf8').includes(text));
if (missingLayoutChecks.length) throw new Error(`Missing English layout safeguards: ${missingLayoutChecks.map(([, , label]) => label).join(', ')}`);
```

- [x] **Step 2: Run the new check before production edits**

Run: `npm.cmd run smoke:i18n`

Expected: FAIL because the five required layout strings are absent.

### Task 2: Keep Task and Selection Text Inside Fixed Regions

**Files:**
- Modify: `src/phaser/ui/TaskBar.ts`
- Modify: `src/phaser/ui/InfoBar.ts`

- [x] **Step 1: Add English-specific task row layout**

```ts
const isEnglish = getLanguage() === 'en';
const compactRow = isEnglish && needs.length > 1;
const text = this.scene.add.text(textX, rowY, `${getPropName(need.id)} ${has}/${need.num}`, {
  fontSize: compactRow ? '17px' : (isEnglish ? '19px' : '22px'),
  color: enough ? '#8ce99a' : '#ffffff',
  stroke: '#000000',
  strokeThickness: 2,
  wordWrap: { width: isEnglish ? 210 : 250, useAdvancedWrap: true },
  maxLines: compactRow ? 1 : 2
});
```

- [x] **Step 2: Reserve the English InfoBar title height before rendering its description**

```ts
const isEnglish = getLanguage() === 'en';
this.infoText.setStyle({ fontSize: isEnglish ? '22px' : '26px', wordWrap: { width: 380, useAdvancedWrap: true } });
this.infoText.setText(`${getPropName(item.id)}  Lv.${prop?.luna ?? 1}`);
this.descText.setY(isEnglish ? 58 : 36).setText(getPropDescription(item.id));
```

- [x] **Step 3: Run the layout contract check**

Run: `npm.cmd run smoke:i18n`

Expected: TaskBar and InfoBar assertions pass; bag, spawner, and base-card assertions still fail.

### Task 3: Remove Item-Name Character Slicing

**Files:**
- Modify: `src/phaser/ui/BagPanel.ts`
- Modify: `src/phaser/ui/SpawnerProductsPanel.ts`

- [x] **Step 1: Replace the backpack label slice with a centered fixed two-line label**

```ts
const label = this.scene.add.text(x, y + cellSize / 2 - 38, prop ? getPropName(prop.id) : `${item.id}`, {
  fontSize: '18px', color: '#ffffff', align: 'center', fontStyle: 'bold',
  stroke: '#000000', strokeThickness: 3,
  wordWrap: { width: cellSize - 16, useAdvancedWrap: true }, maxLines: 2
}).setOrigin(0.5);
```

- [x] **Step 2: Replace the spawner product label slice with a centered fixed two-line label and keep its status below it**

```ts
const name = this.scene.add.text(x, y - cellH / 2 + 120, getPropName(view.id), {
  fontSize: '18px', color: view.unlocked ? '#ffffff' : '#777777', align: 'center', fontStyle: 'bold',
  stroke: '#000000', strokeThickness: 3, padding: { top: 2, bottom: 2 },
  wordWrap: { width: cellW - 14, useAdvancedWrap: true }, maxLines: 2
}).setOrigin(0.5);
const status = this.scene.add.text(x, y - cellH / 2 + 164, statusText, {
  fontSize: '22px', color: view.unlocked ? '#8ce99a' : '#ff8787', fontStyle: 'bold',
  stroke: '#000000', strokeThickness: 3, padding: { top: 4, bottom: 2 }
}).setOrigin(0.5);
```

- [x] **Step 3: Run the layout contract check**

Run: `npm.cmd run smoke:i18n`

Expected: TaskBar, InfoBar, BagPanel, and SpawnerProductsPanel assertions pass; BaseScene assertion still fails.

### Task 4: Compact English Building Titles and Verify

**Files:**
- Modify: `src/phaser/scenes/BaseScene.ts`
- Modify: `scripts/runtime-ui-i18n-smoke.ts`

- [x] **Step 1: Define and use the English building title size for both unlocked and locked cards**

```ts
const buildingTitleFontSize = getLanguage() === 'en' ? '28px' : '34px';
// Use `fontSize: buildingTitleFontSize` for both getBuildingName(cfg.id) title texts.
```

- [x] **Step 2: Complete the exact smoke assertions and run all checks**

Run: `npm.cmd run smoke && npm.cmd run smoke:i18n && npm.cmd run build`

Expected: all smoke assertions pass and webpack emits a production `dist` bundle.

- [x] **Step 3: Inspect both language layouts at native portrait resolution**

Check the GameScene task bar, selected-item bar, bag, spawner list, and BaseScene building cards in English; switch to Chinese and verify their original positions and font sizes remain unchanged.

### Task 5: Deploy the Verified Bundle

**Files:**
- Upload: `dist/` to `ubuntu@154.8.151.82:~/merge-survival/dist.release-20260811-english-ui`

- [x] **Step 1: Upload and verify the staged bundle**

Run: `scp -r dist ubuntu@154.8.151.82:merge-survival/dist.release-20260811-english-ui`

Expected: remote `index.html` and its referenced bundle both exist.

- [x] **Step 2: Atomically activate the release and verify HTTP status**

Run: rename the current `dist` to `dist.previous-20260811-english-ui`, rename the staged release to `dist`, then request `http://154.8.151.82/`.

Expected: HTTP 200.
