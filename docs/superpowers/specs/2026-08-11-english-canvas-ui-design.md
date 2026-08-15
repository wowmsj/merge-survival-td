# English Canvas UI Layout

## Goal

Keep the existing 1080x1920 Phaser canvas layout and board bounds unchanged while making English labels readable in their fixed UI regions.

## Scope

- `TaskBar`: English requirement names use the available card text area. A single requirement may use two lines; two-requirement cards use a smaller single line per row so rows never overlap.
- `InfoBar`: English title and description reserve stable vertical space, preventing the title from covering its description or action buttons.
- `BagPanel` and `SpawnerProductsPanel`: replace fixed character slicing with centered, two-line wrapped item names.
- `BaseScene`: use a smaller English title size for building cards and locked-card titles. Descriptions retain their existing text region.
- `BaseScene` category tabs resolve their locale text when rendering, rather than caching the language selected during module load.

## Constraints

- Chinese layout and gameplay geometry remain unchanged.
- No DOM UI, dynamic viewport font scaling, text abbreviations, or new UI framework.
- Buttons retain their current dimensions. Existing English menu labels already fit the 180px menu buttons.
- Wrapped text has a fixed maximum of two lines. It must not resize its card, move the board, or overlap adjacent controls.

## Behavior

The components query the existing active language accessor during rendering. English applies only the constrained style above; Chinese preserves its existing font sizes and positions. Scene restart after language switching continues to rebuild the same components, so no new persistence logic is needed.

## Verification

- Extend the existing runtime i18n smoke check to assert that task, bag, spawner, info, and building-card source paths contain the English layout constraints.
- Run `npm.cmd run smoke`, `npm.cmd run smoke:i18n`, and `npm.cmd run build`.
- Inspect the English game and base scene in Play Mode at the native portrait resolution.
