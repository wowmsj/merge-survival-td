# -*- coding: utf-8 -*-
"""把 1024x1024 的 4x3 网格 AI 生成图切成单张道具图标并去灰底。

- 按 4 列 x 3 行切格 → 从格子边缘泛洪去底（容差 TOL）→ alpha 羽化 →
  按内容 bbox 自动裁剪 → 居中放进 512x512 透明画布
- 输出 assets/generated/icon_p<propId>.png，之后跑 npm run resize-assets 生成 webp

用法：python scripts/cut-grid-icons.py <源图> <map文件>
map 文件（json）：{"cells": {"<行,列(从0起)": propId, ...}, "tol": 40}
"""
import io
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'assets' / 'generated'
CANVAS = 512
PAD_RATIO = 0.06  # 内容外扩边距


def strip_bg(cell: np.ndarray, tol: int, lum_floor: int = 115) -> np.ndarray:
    """从四边泛洪去底：邻接色差 <= tol 且亮度 >= lum_floor 才并入背景。

    适应渐变/暗角底；亮度下限防止洪水从暗色背景漏进暗色主体。
    """
    h, w, _ = cell.shape
    rgba = np.dstack([cell, np.full((h, w), 255, np.uint8)])
    f = cell.astype(np.float32)
    lum = f.mean(axis=2)
    visited = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            visited[y, x] = True
            q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            visited[y, x] = True
            q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                if lum[ny, nx] >= lum_floor and np.abs(f[ny, nx] - f[y, x]).max() <= tol:
                    visited[ny, nx] = True
                    q.append((ny, nx))
    rgba[visited, 3] = 0
    return rgba


def process(src_path: str, mapping: dict, tol: int):
    im = Image.open(src_path).convert('RGB')
    W, H = im.size
    cw, ch = W // 4, H // 3
    arr = np.asarray(im)
    for key, prop_id in mapping.items():
        r, c = (int(v) for v in key.split(','))
        cell = arr[r*ch:(r+1)*ch if r < 2 else H, c*cw:(c+1)*cw if c < 3 else W]
        rgba = strip_bg(cell, tol)
        img = Image.fromarray(rgba, 'RGBA')
        # alpha 羽化去毛边
        a = img.getchannel('A').filter(ImageFilter.GaussianBlur(1.2))
        img.putalpha(a)
        bbox = img.getbbox()
        if not bbox:
            print(f'cell {key} -> {prop_id}: 空图，跳过')
            continue
        img = img.crop(bbox)
        pw, ph = img.size
        pad = int(max(pw, ph) * PAD_RATIO)
        scale = (CANVAS - 2 * pad) / max(pw, ph)
        img = img.resize((max(1, round(pw*scale)), max(1, round(ph*scale))), Image.LANCZOS)
        canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
        canvas.paste(img, ((CANVAS - img.size[0]) // 2, (CANVAS - img.size[1]) // 2), img)
        out = OUT_DIR / f'icon_p{prop_id}.png'
        canvas.save(out)
        print(f'cell {key} -> {out.name} 内容 {pw}x{ph}')


if __name__ == '__main__':
    src, map_file = sys.argv[1], sys.argv[2]
    cfg = json.loads(Path(map_file).read_text(encoding='utf-8'))
    process(src, cfg['cells'], cfg.get('tol', 40))
