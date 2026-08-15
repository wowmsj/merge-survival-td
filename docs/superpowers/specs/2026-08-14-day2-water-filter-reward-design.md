# Day 3 Water Filter Reward

## Goal

After the player wins the second night, the Day 3 water-cutoff story grants one
`20001` abandoned refrigerator generator. Its existing merge chain reaches the
double-door refrigerator and then filtered water; no new item or task is added.

## Delivery

- Add `spawnProps: [20001]` to story beat `103`.
- Keep the existing StorySystem board-or-card delivery behavior.
- Track claimed story item rewards separately from `storySeen` so a story replay
  cannot grant another item and saves that saw beat 102 before this release are
  granted exactly one generator on load.

## Compatibility

- New saves receive the generator when beat 103 completes.
- Existing saves with beat 103 in `storySeen` receive one generator during load.
- The claim is persisted, so later loads do not duplicate it.

## Verification

- Beat 103 completion grants one `20001`.
- Replaying beat 103 grants nothing.
- A pre-change save with beat 103 already seen receives exactly one `20001`.
- Smoke, i18n smoke, and production build pass.
