# -*- coding: utf-8 -*-
"""生成 STORY_DIALOGUE.md：剧情对白全集文档。

数据源（均为唯一事实来源，本文档不手改）：
  - src/core/config/data/story.json      全部剧情 beat（触发器 + 台词）
  - src/core/config/StoryConfig.ts       角色显示名 STORY_CHARACTERS / 简介 CHARACTER_BIOS
  - src/core/config/data/building.json   建筑 id -> 名称
  - src/core/config/data/prop_prop.json  物品 id -> 名称
  - STORY_FRAMEWORK.md                   章节排期表（天 -> 章名）

用法：python scripts/gen-story-doc.py
"""
import io
import json
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'src' / 'core' / 'config' / 'data'


def load_json(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))


def parse_story_config():
    """从 StoryConfig.ts 正则提取角色名与简介（避免硬编码重复维护）。"""
    ts = (ROOT / 'src' / 'core' / 'config' / 'StoryConfig.ts').read_text(encoding='utf-8')
    chars = dict(re.findall(r"(\w+):\s*\{\s*name:\s*'([^']*)'", ts))
    bios = {m.group(1): (m.group(2), m.group(3)) for m in re.finditer(
        r"(\w+):\s*\{\s*title:\s*'((?:[^'\\]|\\.)*)',\s*bio:\s*'((?:[^'\\]|\\.)*)'\s*\}", ts)}
    return chars, bios


def parse_chapter_titles():
    """从 STORY_FRAMEWORK.md 排期表提取 天 -> 章名。"""
    md = (ROOT / 'STORY_FRAMEWORK.md').read_text(encoding='utf-8')
    titles = {}
    for m in re.finditer(r'^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|', md, re.M):
        titles[int(m.group(1))] = m.group(2).strip()
    return titles


BEATS = load_json('story.json')
BUILDINGS = {b['id']: b['name'] for b in load_json('building.json')}
PROPS = {p['id']: p['name'] for p in load_json('prop_prop.json')}
TASKS = {t['id']: t.get('name', '') for t in load_json('task_newTask.json')}
CHARS, BIOS = parse_story_config()
CHAPTER_TITLES = parse_chapter_titles()

ZOMBIE_TYPES = {'ground': '地面僵尸', 'fly': '飞行僵尸', 'burrow': '钻地僵尸'}


def char_name(who):
    return CHARS.get(who, who)


def trigger_desc(t):
    ty, v = t['type'], t.get('value')
    if ty == 'newGame':
        return '新开局'
    if ty == 'merge':
        return '首次合成成功'
    if ty == 'task':
        if v is None:
            return '首次提交订单'
        return f'完成任务「{TASKS.get(int(v), "")}」(任务 id={v})'
    if ty == 'coin':
        return f'金币持有 ≥ {v}'
    if ty == 'nightWin':
        return '首次守夜胜利'
    if ty == 'nightLose':
        return '首次守夜失败'
    if ty == 'level':
        return f'玩家等级 ≥ {v}'
    if ty == 'building':
        return f'首次建成「{BUILDINGS.get(int(v), "?")}」(建筑 id={v})'
    if ty == 'blueprint':
        return f'首次用蓝图解锁「{BUILDINGS.get(int(v), "?")}」(建筑 id={v})'
    if ty == 'item':
        return f'「{PROPS.get(int(v), "?")}」(物品 id={v}) 首次出现在棋盘'
    if ty == 'zombie':
        return f'首次出现{ZOMBIE_TYPES.get(str(v), v)}'
    if ty == 'day':
        return f'进入第 {v} 天（守完第 {int(v) - 1} 夜天亮）'
    return f'{ty}={v}'


def beat_md(b):
    out = [f'触发：{trigger_desc(b["trigger"])}', '']
    for line in b['lines']:
        if line['who'] == 'narrator':
            out.append(f'- 旁白：{line["text"]}')
        else:
            out.append(f'- **{char_name(line["who"])}**：{line["text"]}')
    notes = []
    if b.get('rewardCoin'):
        speaker = next((char_name(l['who']) for l in b['lines'] if l['who'] != 'narrator'), 'NPC')
        notes.append(b.get('rewardText') or f'{speaker}额外打赏了 {b["rewardCoin"]} 金币')
    if b.get('joinHero'):
        notes.append(f'英雄「{char_name(b["joinHero"])}」加入堡垒（可部署内圈协防）')
    if notes:
        out += ['', '> ' + '；'.join(notes)]
    return out


def is_main(b):
    return b['trigger']['type'] in ('newGame', 'day')


def chapter_heading(b):
    t = b['trigger']
    if t['type'] == 'newGame':
        day = 1
    elif t['type'] == 'day':
        day = int(t['value'])
    else:
        day = None
    title = CHAPTER_TITLES.get(day, '') if day else ''
    if day:
        return f'第 {day} 章 · {title}' if title else f'第 {day} 章'
    return f'第 {b["chapter"]} 章段'


lines = []
lines.append('# 《合合堡垒》剧情对白全集')
lines.append('')
lines.append('> 本文档由 `scripts/gen-story-doc.py` 自动生成，请勿手改。')
lines.append('> 改对白请编辑 `src/core/config/data/story.json`，改角色名/简介请编辑 `src/core/config/StoryConfig.ts`，然后重跑该脚本。')
lines.append('')
total_lines = sum(len(b['lines']) for b in BEATS)
main = [b for b in BEATS if is_main(b)]
side = [b for b in BEATS if not is_main(b)]
lines.append(f'共 **{len(BEATS)}** 段剧情（主线 {len(main)} 段 + 引导/事件 {len(side)} 段），**{total_lines}** 条对白。')
lines.append('')
lines.append('- 主线章节：序章（新开局）+ 第 2~30 天各一章，收录进游戏内「剧情回顾」，一天一章。')
lines.append('- 引导/事件：合成、订单、建成建筑、新物品、新僵尸等首次触发的小剧场，不收录进剧情回顾，只播一次。')
lines.append('')

# 一、角色表
lines.append('## 一、角色表')
lines.append('')
lines.append('| 角色 | 称号 | 背景 |')
lines.append('|------|------|------|')
order = ['hero', 'mancang', 'laogui', 'laoqiang', 'pangshen', 'doctor',
         'xiaodian', 'douzi', 'xiaoman', 'beian', 'tiezhua', 'officer', 'wensente']
for key in order:
    name = char_name(key)
    title, bio = BIOS.get(key, ('', ''))
    lines.append(f'| {name}（`{key}`） | {title} | {bio} |')
lines.append('')

# 二、主线章节
lines.append('## 二、主线章节（剧情回顾收录）')
lines.append('')
def day_key(b):
    t = b['trigger']
    return 1 if t['type'] == 'newGame' else int(t['value'])
for b in sorted(main, key=day_key):
    lines.append(f'### {chapter_heading(b)}（Beat #{b["id"]}）')
    lines.append('')
    lines += beat_md(b)
    lines.append('')

# 三、引导与事件剧情
lines.append('## 三、引导与事件剧情（不收录进剧情回顾）')
lines.append('')
cur_ch = None
for b in sorted(side, key=lambda x: (x['chapter'], x['id'])):
    if b['chapter'] != cur_ch:
        cur_ch = b['chapter']
        lines.append(f'### 第 {cur_ch} 章段')
        lines.append('')
    lines.append(f'#### Beat #{b["id"]}')
    lines.append('')
    lines += beat_md(b)
    lines.append('')

out = ROOT / 'STORY_DIALOGUE.md'
out.write_text('\n'.join(lines), encoding='utf-8')
print(f'已生成 {out.name}：{len(BEATS)} 段剧情 / {total_lines} 条对白 / {len(lines)} 行')
