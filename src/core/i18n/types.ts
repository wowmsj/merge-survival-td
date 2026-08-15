export type Language = 'zh-CN' | 'en';

export interface CharacterBio {
  title: string;
  bio: string;
}

export interface LocaleData {
  ui: Record<string, string>;
  props: Record<number, string>;
  propDescriptions: Record<number, string>;
  buildings: Record<number, string>;
  heroes: Record<string, string>;
  heroDescriptions: Record<string, string>;
  speakers: Record<string, string>;
  characterBios: Record<string, CharacterBio>;
  storyRewards: Record<number, string>;
  zombies: Record<number, string>;
  story: Record<number, { who: string; text: string }[]>;
}
