# Monster Codex

Add a bottom-navigation Monster entry that opens a single-page codex for all eight configured zombie types. The panel reads `getAllZombieConfigs()` and localized names/tags, showing color badge, name, first day, HP, attack, armor, and a concise counter/ability line. The panel uses the existing `BasePanel`/Phaser canvas UI, with two columns and four rows sized inside the existing portrait viewport. No duplicate monster data or new assets are introduced.

Success: the GameScene button opens/closes the codex, all eight rows render without clipping, and English/Chinese text is localized.
