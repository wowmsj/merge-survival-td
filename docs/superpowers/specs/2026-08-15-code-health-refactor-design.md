# Code Health Refactor Design

## Goal

Reduce structural overhead and duplication without changing game rules, save data, or visible UI behavior.

## Scope

1. Replace the one-system ECS wrapper with a fixed-interval board tick.
2. Remove confirmed unused imports, fields, constants, and local bindings; make TypeScript reject new unused symbols.
3. Type the existing event bus with a single event-to-payload map.
4. Extract the shared page/grid layout used by the base building and hero palettes.
5. Replace the single story reward migration with a generic configured-reward backfill.

## Non-Goals

- Do not change combat, economy, task selection, save version, or art/UI layout.
- Do not merge BaseScene and NightScene renderers; their display rules differ enough that a shared renderer would be harder to read.
- Do not introduce a dependency, framework, or new runtime service.

## Design

`GameScene` owns the board maintenance timer and calls `SpawnSystem.update` every 500 ms. `World` and the unused ECS base classes are removed because no other system participates in a world update loop.

The event bus receives a typed map for existing `GameEvents`; event names and payloads remain unchanged. Palette pagination becomes one private layout helper in `BaseScene`, used twice rather than creating a separate generic UI framework. Save loading derives missing story-prop claims from all `storySeen` beats that declare `spawnProps`, replacing the beat-103 special case.

## Verification

- Add smoke coverage that board maintenance is not tied to render-frame calls and that configured story rewards backfill once.
- Run the unused-symbol compiler check, normal type-check, i18n smoke, full smoke suite, and production build.
