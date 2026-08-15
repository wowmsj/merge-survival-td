# Water Filter Story Reward Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grant the refrigerator generator once when the Day 3 water-cutoff story completes, including one backfill for older saves that already completed it.

**Architecture:** Story beat `103` declares its existing item reward through `spawnProps`. StorySystem records every item-reward beat that it grants. StorageSystem initializes that record and backfills only beat `103` when an old save has already seen it, preventing duplicate rewards on later loads and story replays.

**Tech Stack:** TypeScript, Phaser game state, JSON story config, existing smoke script.

---

### Task 1: Lock the Story Reward Behavior

**Files:**
- Modify: `scripts/smoke.ts`

- [ ] **Step 1: Write failing story completion and old-save assertions**

```ts
const waterStory = new StorySystem();
const waterState = createInitialGameState();
waterStory.checkNightEnd(waterState, true, 3);
waterStory.beatDone(waterState);
assert(hasItemOrCard(waterState, 20001), '第三天水源剧情发放废弃冷藏箱发射器');
assert(waterState.storyRewardClaims.includes(103), '水源剧情奖励记录为已领取');

const oldWaterState = createInitialGameState();
oldWaterState.storySeen = [103];
delete (oldWaterState as Partial<typeof oldWaterState>).storyRewardClaims;
storage.saveState(oldWaterState);
const loadedWaterState = storage.loadState()!;
assert(hasItemOrCard(loadedWaterState, 20001), '旧档已播水源剧情补发废弃冷藏箱发射器');
```

- [ ] **Step 2: Run the smoke suite and verify it fails because the reward field and backfill do not exist**

Run: `npm.cmd run smoke`

Expected: failure for the new Day 3 reward assertion or missing `storyRewardClaims`.

### Task 2: Add the Minimal Reward and Migration

**Files:**
- Modify: `src/core/config/data/story.json`
- Modify: `src/core/types.ts`
- Modify: `src/core/model/GameState.ts`
- Modify: `src/core/systems/StorySystem.ts`
- Modify: `src/core/systems/StorageSystem.ts`

- [ ] **Step 1: Configure beat 103 with its existing refrigerator generator item**

```json
"spawnProps": [20001]
```

- [ ] **Step 2: Persist claimed story item rewards and grant each beat only once**

```ts
storyRewardClaims: number[];

if (beat && state && beat.spawnProps && !state.storyRewardClaims.includes(beat.id)) {
  for (const pid of beat.spawnProps) this.economy.giveItemToBoardOrCard(state, pid);
  state.storyRewardClaims.push(beat.id);
}
```

- [ ] **Step 3: Backfill only the new Day 3 reward for old saves that have seen beat 103**

```ts
if (state.storySeen.includes(103) && !state.storyRewardClaims.includes(103)) {
  this.economy.giveItemToBoardOrCard(state, 20001);
  state.storyRewardClaims.push(103);
}
```

- [ ] **Step 4: Run the smoke suite and verify it passes**

Run: `npm.cmd run smoke`

Expected: `0 failures`.

### Task 3: Validate and Publish

**Files:**
- Build output: `dist/`

- [ ] **Step 1: Run localization and production build checks**

Run: `npm.cmd run smoke:i18n`

Expected: `Runtime UI i18n smoke passed`.

Run: `npm.cmd run build`

Expected: `compiled successfully`.

- [ ] **Step 2: Upload the built dist directory to a timestamped release and atomically replace `/home/ubuntu/merge-survival/dist`**

```powershell
scp -i C:\Users\Administrator\.ssh\arkyv_deploy_key -r dist ubuntu@154.8.151.82:/home/ubuntu/merge-survival/releases/<release>
ssh -i C:\Users\Administrator\.ssh\arkyv_deploy_key ubuntu@154.8.151.82 "mv /home/ubuntu/merge-survival/dist /home/ubuntu/merge-survival/dist.previous.<stamp> && mv /home/ubuntu/merge-survival/releases/<release>/dist /home/ubuntu/merge-survival/dist"
```

- [ ] **Step 3: Verify the server serves the newly built bundle referenced by `dist/index.html`**

Run: `ssh -i C:\Users\Administrator\.ssh\arkyv_deploy_key ubuntu@154.8.151.82 "grep -o 'bundle\.[^\" ]*\.js' /home/ubuntu/merge-survival/dist/index.html"`

Expected: the new local bundle filename.
