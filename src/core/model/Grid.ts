import { ICell, IGrid, IItemData, IPoint } from '../types';

/** 创建空棋盘 */
export function createGrid(rowNum: number, colNum: number): IGrid {
  const cells: ICell[][] = [];
  for (let r = 0; r < rowNum; r++) {
    const row: ICell[] = [];
    for (let c = 0; c < colNum; c++) {
      row.push({ item: null });
    }
    cells.push(row);
  }
  return { rowNum, colNum, cells };
}

/** 判断坐标是否在棋盘内 */
export function inGrid(grid: IGrid, row: number, col: number): boolean {
  return row >= 0 && row < grid.rowNum && col >= 0 && col < grid.colNum;
}

/** 获取格子 */
export function getCell(grid: IGrid, row: number, col: number): ICell | null {
  if (!inGrid(grid, row, col)) return null;
  return grid.cells[row][col];
}

/** 获取物品 */
export function getItem(grid: IGrid, row: number, col: number): IItemData | null {
  const cell = getCell(grid, row, col);
  return cell ? cell.item : null;
}

/** 设置物品 */
export function setItem(grid: IGrid, row: number, col: number, item: IItemData | null): void {
  if (!inGrid(grid, row, col)) return;
  grid.cells[row][col].item = item;
}

/** 遍历棋盘每个格子（item 可能为 null） */
export function forEachCell(grid: IGrid, cb: (item: IItemData | null, row: number, col: number) => void): void {
  for (let r = 0; r < grid.rowNum; r++) {
    for (let c = 0; c < grid.colNum; c++) {
      cb(grid.cells[r][c].item, r, c);
    }
  }
}

/** 从上到下、从左到右找第一个空格子 */
export function findEmptyCell(grid: IGrid): IPoint | null {
  for (let r = 0; r < grid.rowNum; r++) {
    for (let c = 0; c < grid.colNum; c++) {
      if (!grid.cells[r][c].item) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

/** 交换两个格子物品 */
export function swapItems(grid: IGrid, src: IPoint, target: IPoint): void {
  const a = getItem(grid, src.row, src.col);
  const b = getItem(grid, target.row, target.col);
  setItem(grid, src.row, src.col, b);
  setItem(grid, target.row, target.col, a);
}

/** 十字四方向偏移 */
const CROSS_DIRS = [[-1, 0], [0, -1], [0, 1], [1, 0]];

/** 九宫八方向偏移（不含自身） */
const NINE_DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1]
];

/** 十字四邻接格子（合成后戳破纸箱用） */
export function getCrossNeighbors(grid: IGrid, row: number, col: number): IPoint[] {
  const res: IPoint[] = [];
  for (const [dr, dc] of CROSS_DIRS) {
    const nr = row + dr;
    const nc = col + dc;
    if (inGrid(grid, nr, nc)) {
      res.push({ row: nr, col: nc });
    }
  }
  return res;
}

/** 九宫格空位（自动生成器用） */
export function getNineEmptyCells(grid: IGrid, row: number, col: number): IPoint[] {
  const res: IPoint[] = [];
  for (const [dr, dc] of NINE_DIRS) {
    const nr = row + dr;
    const nc = col + dc;
    if (inGrid(grid, nr, nc) && !grid.cells[nr][nc].item) {
      res.push({ row: nr, col: nc });
    }
  }
  return res;
}

/** 九宫格所有格子（加速装置用） */
export function getNineNeighbors(grid: IGrid, row: number, col: number): IPoint[] {
  const res: IPoint[] = [];
  for (const [dr, dc] of NINE_DIRS) {
    const nr = row + dr;
    const nc = col + dc;
    if (inGrid(grid, nr, nc)) {
      res.push({ row: nr, col: nc });
    }
  }
  return res;
}
