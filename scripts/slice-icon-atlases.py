# -*- coding: utf-8 -*-
"""Slice 4x3 generated icon atlases into transparent preview PNGs."""
import sys
import re
from collections import deque
from pathlib import Path

import numpy as np
import cv2
from PIL import Image, ImageFilter

CANVAS = 512


def level_count(name: str) -> int:
    match = re.search(r'L(\d+)[–-](\d+)', name)
    if match:
        return int(match.group(2)) - int(match.group(1)) + 1
    match = re.search(r'(\d+)\s*级', name)
    if not match:
        raise ValueError(f'cannot infer level count from {name}')
    return int(match.group(1))


def grid_for_count(count: int) -> tuple[int, int]:
    if count <= 3:
        return count, 1
    if count <= 6:
        return 3, 2
    return 4, 2 if count <= 8 else 3


def remove_checkerboard(rgb: np.ndarray, preserve_enclosed: bool = True) -> Image.Image:
    height, width, _ = rgb.shape
    rgba = np.dstack([rgb, np.full((height, width), 255, np.uint8)])
    border = np.concatenate((rgb[:20].reshape(-1, 3), rgb[-20:].reshape(-1, 3),
                             rgb[:, :20].reshape(-1, 3), rgb[:, -20:].reshape(-1, 3)))
    border_brightness = border.mean(axis=1)
    low, high = float(border_brightness.min()), float(border_brightness.max())
    for _ in range(5):
        near_low = np.abs(border_brightness - low) <= np.abs(border_brightness - high)
        low = float(border_brightness[near_low].mean())
        high = float(border_brightness[~near_low].mean())
    brightness = rgb.mean(axis=2)
    saturation = rgb.max(axis=2).astype(np.int16) - rgb.min(axis=2).astype(np.int16)
    # Match either checker color. Do not flood-fill: white/gray parts of an
    # icon can touch the background and must remain opaque.
    if preserve_enclosed:
        background = ((saturation <= 24) & (
            (np.abs(brightness - low) <= 36) | (np.abs(brightness - high) <= 36)
        )).astype(np.uint8)
        count, labels, _, _ = cv2.connectedComponentsWithStats(background, 8)
        edge_labels = set(np.unique(np.concatenate((labels[0], labels[-1], labels[:, 0], labels[:, -1]))).tolist())
        edge_labels.discard(0)
        background = np.isin(labels, list(edge_labels))
    else:
        # Grid-only sheets have saturated art and neutral checkerboard pixels.
        background = saturation <= 24
    rgba[background, 3] = 0
    icon = Image.fromarray(rgba, 'RGBA')
    alpha = icon.getchannel('A').filter(ImageFilter.GaussianBlur(1.2))
    icon.putalpha(alpha)
    return icon


def icon_boxes(rgba: np.ndarray, expected: int) -> list[tuple[int, int, int, int]]:
    foreground = (rgba[:, :, 3] > 8).astype(np.uint8)
    for size in range(15, 62, 6):
        grouped = cv2.dilate(foreground, np.ones((size, size), np.uint8))
        count, labels, stats, _ = cv2.connectedComponentsWithStats(grouped)
        boxes = []
        for label in range(1, count):
            component = labels == label
            ys, xs = np.where(component & (foreground > 0))
            if len(xs) < 250:
                continue
            boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        if len(boxes) == expected:
            rows: list[list[tuple[int, int, int, int]]] = []
            for box in sorted(boxes, key=lambda b: (b[1] + b[3]) // 2):
                center_y = (box[1] + box[3]) // 2
                if not rows or abs(center_y - (rows[-1][0][1] + rows[-1][0][3]) // 2) > 100:
                    rows.append([box])
                else:
                    rows[-1].append(box)
            return [box for row in rows for box in sorted(row, key=lambda b: (b[0] + b[2]) // 2)]
    raise ValueError(f'expected {expected} objects, detected {len(boxes)}')


def largest_component_boxes(rgba: np.ndarray, expected: int | None = None) -> list[tuple[int, int, int, int]]:
    foreground = (rgba[:, :, 3] > 8).astype(np.uint8)
    count, _, stats, _ = cv2.connectedComponentsWithStats(foreground)
    ids = [label for label in range(1, count) if stats[label, cv2.CC_STAT_AREA] > 1000]
    if expected is not None and len(ids) < expected:
        raise ValueError(f'expected {expected} objects, detected {len(ids)}')
    ids = sorted(ids, key=lambda label: stats[label, cv2.CC_STAT_AREA], reverse=True)
    if expected is not None:
        ids = ids[:expected]
    boxes = [tuple(int(stats[label, index]) for index in (cv2.CC_STAT_LEFT, cv2.CC_STAT_TOP, cv2.CC_STAT_WIDTH, cv2.CC_STAT_HEIGHT)) for label in ids]
    boxes = [(left, top, left + width, top + height) for left, top, width, height in boxes]
    rows: list[list[tuple[int, int, int, int]]] = []
    for box in sorted(boxes, key=lambda b: (b[1] + b[3]) // 2):
        center_y = (box[1] + box[3]) // 2
        if not rows or abs(center_y - (rows[-1][0][1] + rows[-1][0][3]) // 2) > 80:
            rows.append([box])
        else:
            rows[-1].append(box)
    return [box for row in rows for box in sorted(row, key=lambda b: (b[0] + b[2]) // 2)]


def grid_boxes(width: int, height: int, cols: int, rows: int, count: int) -> list[tuple[int, int, int, int]]:
    # Atlases are laid out on square cells; unused space is left below the last row.
    cell_width = width // cols
    cell_height = cell_width
    return [
        (col * cell_width, row * cell_height, (col + 1) * cell_width, (row + 1) * cell_height)
        for row in range(rows) for col in range(cols)
    ][:count]


def largest_component_crop(rgba: np.ndarray, box: tuple[int, int, int, int]) -> Image.Image:
    left, top, right, bottom = box
    cell = rgba[top:bottom, left:right]
    mask = (cell[:, :, 3] > 8).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    if count <= 1:
        return Image.fromarray(cell, 'RGBA')
    label = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    ys, xs = np.where(labels == label)
    return Image.fromarray(cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 'RGBA')


COMPONENT_LAYOUTS = {
    '#14 拾荒推车链（7 级）',
    '#30 草药篮链（9 级）',
    '#31 草药链（9 级）',
}

RAW_GRID_LAYOUTS = {'#17 地图碎片链·第一张（L1–7）', '#17 地图碎片链·第二张（L8–13）'}


def raw_grid_for_source(stem: str) -> tuple[int, int, int] | None:
    if stem.startswith('#17 ') or stem.startswith('#19 ') or stem.startswith('#24 ') or stem.startswith('#29 '):
        return (7, 3, 3) if '第一张' in stem else (9, 3, 3)
    return None


def strip_edge_background(icon: Image.Image) -> Image.Image:
    return icon.convert('RGBA')


def remove_checker_artifacts(icon: Image.Image) -> Image.Image:
    rgba = np.asarray(icon.convert('RGBA')).copy()
    rgb = rgba[:, :, :3]
    brightness = rgb.mean(axis=2)
    saturation = rgb.max(axis=2).astype(np.int16) - rgb.min(axis=2).astype(np.int16)
    core = ((rgba[:, :, 3] > 8) & (saturation > 60)).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(core, 8)
    if count > 1:
        core = (labels == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
    contours, _ = cv2.findContours(core, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    keep = np.zeros_like(core)
    if contours:
        cv2.drawContours(keep, [max(contours, key=cv2.contourArea)], -1, 1, cv2.FILLED)
    keep = cv2.dilate(keep, np.ones((3, 3), np.uint8))
    rgba[~keep, 3] = 0
    return Image.fromarray(rgba, 'RGBA')

def write_icon(icon: Image.Image, output: Path) -> None:
    icon = strip_edge_background(icon)
    bbox = icon.getchannel('A').getbbox()
    if bbox:
        icon = icon.crop(bbox)
    pad = max(8, round(max(icon.size) * 0.06))
    scale = (CANVAS - pad * 2) / max(icon.size)
    icon = icon.resize(tuple(max(1, round(size * scale)) for size in icon.size), Image.LANCZOS)
    canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(icon, ((CANVAS - icon.width) // 2, (CANVAS - icon.height) // 2), icon)
    canvas.save(output)


def main(source_dir: Path, output_dir: Path) -> None:
    for source in sorted(source_dir.glob('*.png')):
        image = Image.open(source).convert('RGB')
        if image.size != (1024, 1024):
            print(f'SKIP {source.name}: expected 1024x1024, got {image.size}')
            continue
        count = level_count(source.name)
        atlas_dir = output_dir / source.stem
        atlas_dir.mkdir(parents=True, exist_ok=True)
        raw_grid = raw_grid_for_source(source.stem)
        rgba = np.asarray(remove_checkerboard(np.asarray(image), preserve_enclosed=not bool(raw_grid)))
        if raw_grid:
            actual_count, cols, rows = raw_grid
            boxes = grid_boxes(image.width, image.height, cols, rows, actual_count)
        else:
            boxes = largest_component_boxes(rgba)
        for level, (left, top, right, bottom) in enumerate(boxes, 1):
            icon = Image.fromarray(rgba[top:bottom, left:right], 'RGBA')
            if source.stem.startswith('#3 '):
                icon = remove_checker_artifacts(icon)
            write_icon(icon, atlas_dir / f'L{level:02d}.png')
        print(f'{source.name}: {len(boxes)} icons')


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(sys.argv[2]))
