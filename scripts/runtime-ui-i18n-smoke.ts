import { readFileSync } from 'fs';
import { resolve } from 'path';

const RUNTIME_FILES = [
  'src/phaser/objects/GridRenderer.ts', 'src/phaser/objects/ItemSprite.ts',
  'src/phaser/scenes/BaseScene.ts', 'src/phaser/scenes/BootScene.ts', 'src/phaser/scenes/GameScene.ts', 'src/phaser/scenes/NightScene.ts',
  'src/phaser/ui/BagPanel.ts', 'src/phaser/ui/BasePanel.ts', 'src/phaser/ui/CardBar.ts', 'src/phaser/ui/CharacterPanel.ts',
  'src/phaser/ui/HandGuide.ts', 'src/phaser/ui/HUD.ts', 'src/phaser/ui/InfoBar.ts', 'src/phaser/ui/SpawnerProductsPanel.ts',
  'src/phaser/ui/SettingsPanel.ts', 'src/phaser/ui/StoryArchivePanel.ts', 'src/phaser/ui/StoryDialog.ts', 'src/phaser/ui/TaskBar.ts', 'src/phaser/ui/TaskChainPanel.ts', 'src/phaser/ui/UiStyle.ts', 'src/phaser/ui/UiWidgets.ts'
] as const;

// Texture keys and non-visible asset paths only. Keep every exception explicit.
const ALLOWED_LITERALS: Partial<Record<(typeof RUNTIME_FILES)[number], readonly string[]>> = {};

interface Literal { line: number; value: string; }

function getStringLiterals(source: string): Literal[] {
  const literals: Literal[] = [];
  let index = 0;
  let line = 1;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      index += 2;
      while (index < source.length && source[index] !== '\n') index++;
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        if (source[index++] === '\n') line++;
      }
      index += 2;
      continue;
    }
    if (char !== '\'' && char !== '"' && char !== '`') {
      if (char === '\n') line++;
      index++;
      continue;
    }

    const quote = char;
    const startLine = line;
    let value = '';
    index++;
    while (index < source.length && source[index] !== quote) {
      if (source[index] === '\\') {
        value += source[index++];
        if (index < source.length) value += source[index++];
        continue;
      }
      value += source[index];
      if (source[index++] === '\n') line++;
    }
    if (index < source.length) index++;
    literals.push({ line: startLine, value });
  }
  return literals;
}

const violations = RUNTIME_FILES.flatMap(file => {
  const allowed = new Set(ALLOWED_LITERALS[file] ?? []);
  return getStringLiterals(readFileSync(resolve(process.cwd(), file), 'utf8'))
    .filter(literal => /[\u3400-\u9fff]/u.test(literal.value) && !allowed.has(literal.value))
    .map(literal => `${file}:${literal.line}: ${literal.value.replace(/\s+/g, ' ').trim()}`);
});

if (violations.length > 0) {
  throw new Error(`Raw CJK runtime UI literals:\n${violations.join('\n')}`);
}

const layoutChecks = [
  ['src/phaser/ui/TaskBar.ts', 'const TASK_SLOT_W = 204;', 'TaskBar five-column layout'],
  ['src/phaser/ui/TaskBar.ts', 'const itemX = x + (needs.length === 1 ? 48 : 30 + n * 58);', 'TaskBar icon-only requirements'],
  ['src/phaser/ui/CardBar.ts', "import { getItemIconKey } from '../config/ItemIconMap';", 'CardBar icon renderer'],
  ['src/phaser/ui/CardBar.ts', 'const CARD_SLOT_PITCH = 124;', 'CardBar compact slot pitch'],
  ['src/phaser/ui/CardBar.ts', 'const remaining = Math.max(0, cards.length - 3);', 'CardBar three-card plus-more layout'],
  ['src/phaser/ui/CardBar.ts', 'const iconKey = getItemIconKey(id, this.scene.textures);', 'CardBar icon lookup'],
  ['src/phaser/ui/InfoBar.ts', "const isEnglish = getLanguage() === 'en';", 'InfoBar'],
  ['src/phaser/ui/InfoBar.ts', 'const INFO_X = 536;', 'InfoBar clear of card bar'],
  ['src/phaser/ui/InfoBar.ts', 'const INFO_W = 506;', 'InfoBar fixed layout width'],
  ['src/phaser/ui/InfoBar.ts', 'const DESC_W = 224;', 'InfoBar description bounds'],
  ['src/phaser/ui/InfoBar.ts', 'maxLines: 2', 'InfoBar description line limit'],
  ['src/phaser/ui/InfoBar.ts', 'this.icon.setTexture(iconKey).setDisplaySize(92, 92).setVisible(true);', 'InfoBar selected icon fixed size'],
  ['src/phaser/ui/TaskChainPanel.ts', 'const cols = Math.min(path.length, 5);', 'Task chain five-node single-row layout'],
  ['src/phaser/scenes/GameScene.ts', 'this.spawnerPanel.open(this.getHighestSpawnerId(it.id));', 'Spawner panel highest board level'],
  ['src/phaser/ui/BagPanel.ts', 'maxLines: isEnglish ? 2 : undefined', 'BagPanel'],
  ['src/phaser/ui/SpawnerProductsPanel.ts', 'maxLines: isEnglish ? 2 : undefined', 'SpawnerProductsPanel'],
  ['src/phaser/scenes/BaseScene.ts', "const buildingTitleFontSize = getLanguage() === 'en' ? '28px' : '34px';", 'BaseScene']
] as const;
const missingLayoutChecks = layoutChecks.filter(([file, text]) => !readFileSync(resolve(process.cwd(), file), 'utf8').includes(text));
if (missingLayoutChecks.length > 0) {
  throw new Error(`Missing English layout safeguards: ${missingLayoutChecks.map(([, , label]) => label).join(', ')}`);
}

const baseSceneSource = readFileSync(resolve(process.cwd(), 'src/phaser/scenes/BaseScene.ts'), 'utf8');
if (!baseSceneSource.includes("{ kind: 'tower', labelKey: 'base.tab.tower' }") || !baseSceneSource.includes('getText(tab.labelKey)')) {
  throw new Error('BaseScene tab labels must resolve at render time after a language switch.');
}
if (baseSceneSource.includes('getBuildingName(cfg.id).substring(0, 3)') || baseSceneSource.includes("getHeroName(cfg.key) : hero.key).substring(0, 3)")) {
  throw new Error('BaseScene grid labels must not truncate English names to three characters.');
}
if (baseSceneSource.includes('SIDE_NAMES[')) {
  throw new Error('Night preview attack directions must use localized side keys.');
}
if (!baseSceneSource.includes("getText(`side.${s.side}`)")) {
  throw new Error('Night preview must resolve each attack direction through i18n.');
}
if (!baseSceneSource.includes('enemyList.setMask(listMask)') || !baseSceneSource.includes("this.input.on('wheel', onWheel)")) {
  throw new Error('Night preview enemy list must be clipped and scrollable.');
}

const hudSource = readFileSync(resolve(process.cwd(), 'src/phaser/ui/HUD.ts'), 'utf8');
if (hudSource.includes("this.texts['fuel'].setText")) {
  throw new Error('HUD refresh must not update the removed fuel slot.');
}

const cardBarSource = readFileSync(resolve(process.cwd(), 'src/phaser/ui/CardBar.ts'), 'utf8');
if (cardBarSource.includes('getPropName') || cardBarSource.includes("getText('card.count'")) {
  throw new Error('CardBar must render card icons instead of truncated item or count labels.');
}
if (!cardBarSource.includes('onOpenAllCards') || !cardBarSource.includes('this.openAllCards()') || !cardBarSource.includes('Math.max(0, cards.length - 3)')) {
  throw new Error('CardBar must expose a +N button that opens all queued cards.');
}

const taskBarSource = readFileSync(resolve(process.cwd(), 'src/phaser/ui/TaskBar.ts'), 'utf8');
const gameSceneSource = readFileSync(resolve(process.cwd(), 'src/phaser/scenes/GameScene.ts'), 'utf8');
const taskChainSource = readFileSync(resolve(process.cwd(), 'src/phaser/ui/TaskChainPanel.ts'), 'utf8');
const mainSource = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8');
const indexSource = readFileSync(resolve(process.cwd(), 'public/index.html'), 'utf8');
if (!taskBarSource.includes('onViewChain') || !taskBarSource.includes("bg.on('pointerup', () => this.onViewChain(task))")) {
  throw new Error('Incomplete task cards must open their merge-chain view.');
}
if (!gameSceneSource.includes('new TaskChainPanel(this)') || !gameSceneSource.includes('this.taskBar.onViewChain')) {
  throw new Error('GameScene must wire task cards to the merge-chain panel.');
}
if (!gameSceneSource.includes("label: getText('menu.shop')") || !gameSceneSource.includes("openBlackMarket: true")) {
  throw new Error('GameScene must expose a direct Shop button that opens the black market.');
}
if (!baseSceneSource.includes('openBlackMarket?: boolean') || !baseSceneSource.includes('this.openBlackMarket();')) {
  throw new Error('BaseScene must open the black market when entered from Shop.');
}
if (baseSceneSource.includes('const marketBtn = this.add.graphics()')) {
  throw new Error('BaseScene must not duplicate the bottom Shop entry with a top-bar Black Market button.');
}
if (!baseSceneSource.includes("'res-icon-star'") || !baseSceneSource.includes("'res-icon-diamond'") || !baseSceneSource.includes("'prop_coin1'")) {
  throw new Error('Black market balances and exchange must use resource icons.');
}
if (baseSceneSource.includes("getText('base.marketExchange')")) {
  throw new Error('Black market exchange must use the icon-only layout instead of an English label.');
}
if (!taskChainSource.includes('getMergeChain') || !taskChainSource.includes('getItemIconKey')) {
  throw new Error('Task merge-chain panel must use real config chains and item icons.');
}
if (!mainSource.includes("addEventListener('touchmove'") || !mainSource.includes('passive: false')) {
  throw new Error('Mobile edge drags must be handled with a non-passive touch listener.');
}
if (!indexSource.includes('overscroll-behavior-x: none')) {
  throw new Error('Mobile browser horizontal overscroll must be disabled.');
}

console.log(`Runtime UI i18n smoke passed (${RUNTIME_FILES.length} files).`);
