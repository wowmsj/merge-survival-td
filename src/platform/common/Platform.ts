/**
 * 平台适配层接口
 * 微信/抖音小游戏可继承实现
 */
export interface IPlatform {
  readonly name: string;
  /** 初始化 */
  init(): Promise<void>;
  /** 登录 */
  login(): Promise<{ openid?: string; token?: string }>;
  /** 本地存储 */
  setStorage(key: string, value: string): void;
  getStorage(key: string): string | null;
  removeStorage(key: string): void;
  /** 分享 */
  share?(title: string, imageUrl?: string): Promise<void>;
  /** 激励视频 */
  showRewardedAd?(adId: string): Promise<boolean>;
  /** 震动 */
  vibrateShort?(): void;
}

/** Web/默认平台 */
export class WebPlatform implements IPlatform {
  readonly name = 'web';

  async init(): Promise<void> {
    console.log('WebPlatform init');
  }

  async login(): Promise<{ openid?: string; token?: string }> {
    return { openid: 'web_guest', token: '' };
  }

  setStorage(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (e) { /* ignore */ }
  }

  getStorage(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  removeStorage(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (e) { /* ignore */ }
  }
}

/** 当前平台实例 */
let platformInstance: IPlatform = new WebPlatform();

export function setPlatform(p: IPlatform): void {
  platformInstance = p;
}

export function getPlatform(): IPlatform {
  return platformInstance;
}
