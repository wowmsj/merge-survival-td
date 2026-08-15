import { en, enRuntimeUi } from './en';
import { zhCN, zhCNRuntimeUi } from './zh-CN';
import type { IStoryBeat } from '../config/StoryConfig';
import type { CharacterBio, Language, LocaleData } from './types';

export type { Language, LocaleData } from './types';

export function resolveLanguage(language?: string): Language {
  const candidate = language ?? (typeof navigator === 'undefined' ? undefined : navigator.language);
  return candidate?.toLowerCase().startsWith('en') ? 'en' : 'zh-CN';
}

let activeLanguage = resolveLanguage();

export function setLanguage(language: Language): void {
  activeLanguage = language;
}

export function getLanguage(): Language {
  return activeLanguage;
}

export function getLocaleData(language: Language): LocaleData {
  return language === 'en' ? en : zhCN;
}

export function getText(key: string, params: Record<string, string | number> = {}): string {
  const runtimeUi = activeLanguage === 'en' ? enRuntimeUi : zhCNRuntimeUi;
  const text = getLocaleData(activeLanguage).ui[key] ?? runtimeUi[key] ?? zhCN.ui[key] ?? zhCNRuntimeUi[key] ?? key;
  return text.replace(/\{([^{}]+)\}/g, (match, name) => params[name] === undefined ? match : String(params[name]));
}

export function getPropName(id: number): string {
  return getLocaleData(activeLanguage).props[id] ?? zhCN.props[id] ?? String(id);
}

export function getPropDescription(id: number): string {
  return getLocaleData(activeLanguage).propDescriptions[id] ?? zhCN.propDescriptions[id] ?? getPropName(id);
}

export function getBuildingName(id: number): string {
  return getLocaleData(activeLanguage).buildings[id] ?? zhCN.buildings[id] ?? String(id);
}

export function getHeroName(key: string): string {
  return getLocaleData(activeLanguage).heroes[key] ?? zhCN.heroes[key] ?? key;
}

export function getHeroDescription(key: string): string {
  return getLocaleData(activeLanguage).heroDescriptions[key] ?? zhCN.heroDescriptions[key] ?? key;
}

export function getSpeakerName(key: string): string {
  return getLocaleData(activeLanguage).speakers[key] ?? zhCN.speakers[key] ?? key;
}

export function getCharacterBio(key: string): CharacterBio | undefined {
  return getLocaleData(activeLanguage).characterBios[key] ?? zhCN.characterBios[key];
}

export function getStoryRewardText(id: number): string | undefined {
  return getLocaleData(activeLanguage).storyRewards[id] ?? zhCN.storyRewards[id];
}

export function getStoryUnlockCondition(beat: Pick<IStoryBeat, 'trigger'>): string {
  if (beat.trigger.type === 'newGame') return getText('archive.unlock.newGame');
  if (beat.trigger.type === 'day') return getText('archive.unlock.day', { day: beat.trigger.value ?? '' });
  return getText('archive.unlock.continue');
}

export function getZombieName(id: number): string {
  return getLocaleData(activeLanguage).zombies[id] ?? zhCN.zombies[id] ?? String(id);
}

export function getStoryLines(id: number, adHocLines?: { who: string; text: string }[]) {
  if (id < 0 && adHocLines) return adHocLines;
  return getLocaleData(activeLanguage).story[id] ?? zhCN.story[id] ?? [];
}
