import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { track } from './analytics';

/** webpack DefinePlugin 注入的 Supabase 凭据（未配置时为空字符串） */
declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;

/** 读取注入常量；编译产物外（如 smoke 测试）以 typeof 守卫避免 ReferenceError */
function injected(name: '__SUPABASE_URL__' | '__SUPABASE_ANON_KEY__'): string {
  try {
    return name === '__SUPABASE_URL__'
      ? (typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : '')
      : (typeof __SUPABASE_ANON_KEY__ !== 'undefined' ? __SUPABASE_ANON_KEY__ : '');
  } catch {
    return '';
  }
}

let client: SupabaseClient | null = null;
let currentUser: User | null = null;
const listeners = new Set<(user: User | null) => void>();

export function isAuthEnabled(): boolean {
  return !!injected('__SUPABASE_URL__') && !!injected('__SUPABASE_ANON_KEY__');
}

/** supabase client；无凭据或未初始化时为 null */
export function getSupabaseClient(): SupabaseClient | null {
  return client;
}

export function getCurrentUser(): User | null {
  return currentUser;
}

export function isLoggedIn(): boolean {
  return !!currentUser;
}

/** 订阅登录态变化，返回取消订阅函数 */
export function onAuthChange(cb: (user: User | null) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * 初始化账号系统：有凭据则创建 client 并恢复会话（supabase-js 自动持久化到 localStorage）；
 * 无凭据时全部静默 no-op，游戏行为与纯游客模式完全一致。
 */
export async function initAuth(): Promise<void> {
  const url = injected('__SUPABASE_URL__');
  const key = injected('__SUPABASE_ANON_KEY__');
  if (!url || !key) {
    currentUser = null;
    return;
  }
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: true, storageKey: 'mf_sb_auth', autoRefreshToken: true }
    });
    client.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user ?? null;
      for (const cb of listeners) cb(currentUser);
    });
  }
  try {
    const { data } = await client.auth.getSession();
    currentUser = data.session?.user ?? null;
  } catch (e) {
    console.warn('[Auth] session restore failed', e);
  }
}

export interface IAuthResult {
  ok: boolean;
  /** 项目开启邮件确认时注册成功但 session 为空，需要玩家去邮箱点验证链接 */
  needsEmailConfirm?: boolean;
  /** 失败时的 i18n key（account.error.*） */
  errorKey?: string;
}

export async function signUp(email: string, password: string): Promise<IAuthResult> {
  if (!client) return { ok: false, errorKey: 'account.error.generic' };
  try {
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) return { ok: false, errorKey: classifyError(error.message) };
    if (!data.session) return { ok: true, needsEmailConfirm: true };
    track('account_signup', { method: 'email' });
    return { ok: true };
  } catch (e) {
    console.warn('[Auth] signUp failed', e);
    return { ok: false, errorKey: 'account.error.generic' };
  }
}

export async function signIn(email: string, password: string): Promise<IAuthResult> {
  if (!client) return { ok: false, errorKey: 'account.error.generic' };
  try {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, errorKey: classifyError(error.message) };
    track('account_login', { method: 'email' });
    return { ok: true };
  } catch (e) {
    console.warn('[Auth] signIn failed', e);
    return { ok: false, errorKey: 'account.error.generic' };
  }
}

export async function signOut(): Promise<void> {
  if (!client) return;
  try {
    await client.auth.signOut();
  } catch (e) {
    console.warn('[Auth] signOut failed', e);
  }
  currentUser = null;
  for (const cb of listeners) cb(null);
  track('account_logout');
}

export async function sendPasswordReset(email: string): Promise<IAuthResult> {
  if (!client) return { ok: false, errorKey: 'account.error.generic' };
  try {
    const redirectTo = typeof location !== 'undefined' ? location.origin : undefined;
    const { error } = await client.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
    if (error) return { ok: false, errorKey: classifyError(error.message) };
    return { ok: true };
  } catch (e) {
    console.warn('[Auth] reset password failed', e);
    return { ok: false, errorKey: 'account.error.generic' };
  }
}

/** 把 supabase 错误信息归类为 i18n key（message 文案随服务端版本可能微调，只匹配稳定子串） */
function classifyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'account.error.invalidCredentials';
  if (m.includes('email not confirmed')) return 'account.error.emailNotConfirmed';
  if (m.includes('already registered') || m.includes('already exists') || m.includes('already been')) return 'account.error.emailTaken';
  if (m.includes('at least 6') || m.includes('6 characters')) return 'account.error.weakPassword';
  if (m.includes('invalid email')) return 'account.error.invalidEmail';
  if (m.includes('rate limit') || m.includes('too many')) return 'account.error.rateLimit';
  return 'account.error.generic';
}
