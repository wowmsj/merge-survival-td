# -*- coding: utf-8 -*-
"""Render every sliced atlas on white and report obvious slicing failures."""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


THUMB = 92
COLS = 4
ROWS = 4
PANEL_W = COLS * THUMB + 20
PANEL_H = ROWS * (THUMB + 14) + 34
PANELS_PER_SHEET = 9


def alpha_stats(image: Image.Image) -> dict:
    alpha = np.asarray(image.getchannel('A'))
    foreground = (alpha > 8).astype(np.uint8)
    count, _, stats, _ = cv2.connectedComponentsWithStats(foreground, 8)
    components = sorted((int(stats[i, cv2.CC_STAT_AREA]) for i in range(1, count)), reverse=True)
    ys, xs = np.where(foreground)
    return {
        'pixels': int(foreground.sum()),
        'components': components[:3],
        'touches_edge': bool(len(xs) and (xs.min() == 0 or ys.min() == 0 or xs.max() == 511 or ys.max() == 511)),
    }


def main(root: Path, output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    atlas_dirs = sorted(path for path in root.iterdir() if path.is_dir())
    report = []
    for sheet_index in range(0, len(atlas_dirs), PANELS_PER_SHEET):
        batch = atlas_dirs[sheet_index:sheet_index + PANELS_PER_SHEET]
        sheet = Image.new('RGB', (PANEL_W * 3, PANEL_H * 3), 'white')
        draw = ImageDraw.Draw(sheet)
        for index, atlas in enumerate(batch):
            px, py = (index % 3) * PANEL_W, (index // 3) * PANEL_H
            draw.text((px + 5, py + 5), f'{sheet_index + index + 1}. {atlas.name[:26]}', fill='black')
            entries = []
            for icon_index, path in enumerate(sorted(atlas.glob('L*.png'))):
                image = Image.open(path).convert('RGBA')
                entries.append({'file': path.name, **alpha_stats(image)})
                image.thumbnail((THUMB, THUMB), Image.Resampling.LANCZOS)
                tile = Image.new('RGB', (THUMB, THUMB), 'white')
                tile.paste(image, ((THUMB - image.width) // 2, (THUMB - image.height) // 2), image)
                tx = px + 5 + (icon_index % COLS) * THUMB
                ty = py + 22 + (icon_index // COLS) * (THUMB + 14)
                sheet.paste(tile, (tx, ty))
                draw.text((tx + 2, ty + THUMB), path.stem, fill='black')
            report.append({'atlas': atlas.name, 'icons': entries})
        sheet.save(output / f'audit-{sheet_index // PANELS_PER_SHEET + 1}.png')
    (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    problems = []
    for atlas in report:
        for icon in atlas['icons']:
            if icon['pixels'] < 500 or icon['touches_edge'] or len(icon['components']) > 1:
                problems.append(f"{atlas['atlas']}/{icon['file']}: {icon}")
    (output / 'flags.txt').write_text('\n'.join(problems), encoding='utf-8')
    print(f"atlases={len(atlas_dirs)} icons={sum(len(a['icons']) for a in report)} flags={len(problems)}")


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(sys.argv[2]))
