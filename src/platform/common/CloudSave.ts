import type { IGameState } from '../../core/types';
import { getCurrentUser, getSupabaseClient, isLoggedIn } from './Auth';
import { SAVE_KEY, SAVE_VERSION, StorageSystem } from '../../core/systems/StorageSystem';

/**
 * 云存档同步（Supabase Postgres `saves` 表，RLS 限定只能读写自己的行）。
 *
 * 原则：localStorage 永远是第一落点——saveState 先写本地成功，这里再异步上传；
 * 未登录/未配凭据/上传失败一律静默（console.warn），绝不影响本地保存，
 * 失败的上传会在下次 save 时重试。
 */

export interface ICloudSave {
  /** 经 StorageSystem.normalizeState 兼容回填后的状态；云端数据非法时为 null */
  state: IGameState | null;
  /** 云端 updated_at 换算的 epoch 毫秒 */
  updatedAt: number;
  /** 云端档的天数（冲突弹窗展示用） */
  day: number;
}

const TABLE = 'saves';
const UPLOAD_INTERVAL = 30000;
/** state.timestamp 与云端 updated_at 的容差：5 秒内视为同一份存档 */
export const SAVE_TIME_TOLERANCE = 5000;

let lastUploadAt = 0;
let uploadQueued = false;
let uploading = false;
let hideFlushInstalled = false;

/** 拉取当前登录用户的云端存档；未登录/无档/失败返回 null */
export async function loadCloudSave(): Promise<ICloudSave | null> {
  const sb = getSupabaseClient();
  const user = getCurrentUser();
  if (!sb || !user) return null;
  try {
    const { data, error } = await sb
      .from(TABLE)
      .select('data, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.warn('[CloudSave] load failed:', error.message);
      return null;
    }
    if (!data) return null;
    const rawState = data.data?.state;
    const state = new StorageSystem().normalizeState(rawState);
    return {
      state,
      updatedAt: new Date(data.updated_at as string).getTime(),
      day: state?.day ?? (typeof rawState?.day === 'number' ? rawState.day : 0)
    };
  } catch (e) {
    console.warn('[CloudSave] load failed:', e);
    return null;
  }
}

/** 节流上传：30 秒内最多一次；未登录直接 return（本地保存不受影响） */
export function throttledCloudUpload(): void {
  if (!getCurrentUser()) return;
  if (Date.now() - lastUploadAt < UPLOAD_INTERVAL) return;
  void uploadFromLocal();
}

/** 立即上传（页面隐藏/绑定账号/手动同步时调用）；失败静默，返回是否成功 */
export async function flushCloudUpload(): Promise<boolean> {
  if (!getCurrentUser()) return false;
  return uploadFromLocal();
}

/** 页面隐藏时立即 flush 一次云上传；只安装一次，防止重复绑定 */
export function installCloudFlushOnHide(): void {
  if (hideFlushInstalled || typeof document === 'undefined') return;
  hideFlushInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void flushCloudUpload();
  });
}

/**
 * 启动时解析云端 vs 本地（多设备 last-write-wins，弹窗只出现在登录绑定环节）：
 * - 仅云端有效 → 云端档写入 localStorage，随后走正常 loadState
 * - 仅本地有效 → 不动，下次存档心跳自动上传
 * - 两边都有 → 时间差在容差内视为同一份；否则新的那份为准
 * 本地明显更新时保留本地，云端 updated_at 旧，心跳上传后自然覆盖云端。
 */
export async function resolveCloudSaveOnBoot(): Promise<void> {
  if (!isLoggedIn()) return;
  let cloud: ICloudSave | null = null;
  try {
    cloud = await loadCloudSave();
  } catch (e) {
    console.warn('[CloudSave] boot resolve failed:', e);
  }
  if (!cloud?.state) return;
  const storage = new StorageSystem();
  const local = storage.loadRawInfo();
  if (!local || local.timestamp <= 0) {
    storage.adoptState(cloud.state);
    return;
  }
  if (local.timestamp - cloud.updatedAt < -SAVE_TIME_TOLERANCE) {
    // 云端更新：用云端覆盖本地
    storage.adoptState(cloud.state);
  }
}

/** 从 localStorage 读最新档并 upsert 到云端（本地为第一落点，上传源就是本地 JSON） */
async function uploadFromLocal(): Promise<boolean> {
  const sb = getSupabaseClient();
  const user = getCurrentUser();
  if (!sb || !user) return false;
  if (uploading) {
    uploadQueued = true;
    return false;
  }
  uploading = true;
  let ok = false;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed.version !== SAVE_VERSION) return false;
    const { error } = await sb
      .from(TABLE)
      .upsert({ user_id: user.id, data: parsed }, { onConflict: 'user_id' });
    if (error) {
      console.warn('[CloudSave] upload failed:', error.message);
    } else {
      lastUploadAt = Date.now();
      ok = true;
    }
  } catch (e) {
    console.warn('[CloudSave] upload failed:', e);
  } finally {
    uploading = false;
    if (uploadQueued) {
      uploadQueued = false;
      void uploadFromLocal();
    }
  }
  return ok;
}
