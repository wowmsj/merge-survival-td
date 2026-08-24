# Hero Injury And Recovery

## Goal

Deployed heroes can take damage during night combat. Injured heroes recover during the day, while defeated heroes enter a temporary critical state.

## Rules

- Each hero state stores `hp`, `maxHp`, and an optional `recoveryDays` counter.
- A newly joined hero starts at full health.
- A zombie with a deployed hero at Chebyshev distance 1 attacks that hero before it attacks a building. Heroes do not block zombie movement.
- A hero with positive HP can deploy and fight normally.
- At each new day, a non-critical injured hero restores 20% of max HP, capped at max HP.
- When hero HP reaches 0, it is immediately removed from the battlefield and receives `recoveryDays = 7`.
- Each new day decrements `recoveryDays`. When it reaches 0, the hero returns at full HP.
- Critical heroes cannot deploy, move, or fight.

## UI

- Base grid and NightScene show a compact hero HP bar.
- Hero cards and hero detail panels show current HP.
- Critical cards are disabled and show remaining recovery days.
- Existing Chinese and English text tables provide all new labels and toasts.

## Compatibility And Tests

- Old saves without hero health fields are normalized to full health when loaded.
- Smoke coverage verifies recovery, critical countdown, deployment blocking, and zombie-to-hero damage.
- Existing building targeting remains unchanged when no eligible hero is adjacent.
