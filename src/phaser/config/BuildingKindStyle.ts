import { BuildingKind } from '../../core/types';

/** 建筑大类 → 显示色（图标纹理缺失时回退色块） */
export const KIND_COLORS: Record<BuildingKind, number> = {
  core: 0xffd43b,
  tower: 0xe8590c,
  resource: 0x51cf66,
  trap: 0xbe4bdb,
  wall: 0x868e96,
  ruin: 0x5f5148
};

/** 建筑大类 → 图标纹理 key（无纹理时回退 KIND_COLORS 色块） */
export const KIND_ICON_KEYS: Record<BuildingKind, string> = {
  core: 'build-icon-core',
  tower: 'build-icon-tower',
  resource: 'build-icon-resource',
  trap: 'build-icon-trap',
  wall: 'build-icon-wall',
  ruin: 'build-icon-ruin'
};
