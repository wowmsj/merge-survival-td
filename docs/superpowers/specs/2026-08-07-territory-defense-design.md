# Territory Defense Design

## Goal

Turn the existing square base into an editable defensive territory without replacing the merge-board loop or existing building data.

## First Playable Slice

- Keep the existing 13x13 square map and saved building coordinates.
- Start with an owned core territory. A new outpost claims nearby frontier cells so players gradually gain buildable ground.
- Remove the inner/outer placement restriction: unlocked towers, resources, walls, and traps can be placed on any owned, empty cell.
- Ground enemies use cardinal A* paths to the core. Any blocking placement is rejected when it would remove every route from an active border entry to the core.
- The remaining route is the story-facing `引流走廊`: the core lures enemies through a controlled kill zone. The player controls its length and coverage with walls.

## Existing Systems Reused

- Coins retain construction and upgrade costs.
- Battery items still convert to fuel; generators still produce power.
- Scrap remains the future repair resource. Medicine remains the future emergency resource; neither gets a new subsystem in this slice.
- Existing walls, traps, towers, monster types, save version, and blueprints stay in place.

## Explicitly Deferred

- Road movement-speed preference and supply-line graphics.
- Local conduit networks, workforce, and multi-sector map growth beyond the current map.
- New combat art, new enemy classes, and changes to merge chains.

## Rules

1. A tile is owned when it is part of the initial core area or has been claimed by an outpost.
2. Only owned empty tiles can receive buildings.
3. Outposts can only be placed on an owned frontier tile and claim a 3x3 neighborhood.
4. Active border entries and the core must retain one cardinal path after every blocking placement.
5. The build UI previews unowned, occupied, and route-blocking cells as unavailable; the toast calls the final route a `引流走廊`.

