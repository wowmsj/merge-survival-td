/**
 * 通用工具函数
 */

/** 按权重随机取一个值 */
export function getRandomByWeight<T extends { weight: number }>(arr: T[]): T | null {
  if (!arr || arr.length === 0) return null;
  const total = arr.reduce((sum, item) => sum + (item.weight || 0), 0);
  if (total <= 0) return arr[0] || null;

  let rand = Math.random() * total;
  for (const item of arr) {
    rand -= item.weight;
    if (rand <= 0) return item;
  }
  return arr[arr.length - 1];
}

/** 获取当前时间戳（毫秒），方便后期替换为服务器时间） */
export function now(): number {
  return Date.now();
}
