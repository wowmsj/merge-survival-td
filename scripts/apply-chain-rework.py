# -*- coding: utf-8 -*-
"""应用《合成链重构设计.md》的设定层改动（一次性迁移脚本，已执行可留档）。

改动内容：
  1. 改名/改描述（name/mask/sonname），id 与数值字段一律不动：
     - 病毒线索链 30037-30048（原「废弃实验装置」，§4.1）
     - 远征装备链 30067-30071（原「露营补给」，§4.2）
     - 武器链 30072-30076（原「旧世游戏」，§4.3）
     - 布料护具链 40019-40026（sonname「手工玩偶」→「布料护具」，§4.4）
     - 变异萤后 40038（原「霓虹飞蛾」）
     - 合成核心链 60024-60031（原「跃迁装置」，§4.6）
  2. 鼠猫切断（§4.5）：新增 50036「实验鼠笼」作为鼠链 MAX；
     50021 变异鼠群 blessId 50022(猫窝) → 50036。
  3. story.json 追加 beat 131：流浪猫窝投放事件（level>=5 触发，spawnProps=[50022]）。

用法：python scripts/apply-chain-rework.py（幂等：重复执行结果相同）
"""
import io
import json
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent
PROP_PATH = ROOT / 'src/core/config/data/prop_prop.json'
STORY_PATH = ROOT / 'src/core/config/data/story.json'

# id -> (新 name, 新 mask)；sonname 改动在 SON_RENAME 里按区段统一处理
RENAMES = {
    # 病毒线索链（§4.1）
    30040: ('病毒样本', '贴着危险标签的样本管，里面封存着最早的病毒毒株。合成可获得泄漏警报。'),
    30042: ('空荡街道照片', '病毒爆发后的街拍，街道一夜之间空了。合成可获得废弃医院钥匙。'),
    30043: ('废弃医院钥匙', '废弃医院大门的钥匙，走廊里还散落着当年的病历。合成可获得隔离区通行证。'),
    30044: ('隔离区通行证', '印着钢印的隔离区通行证，能进入当年的封锁区。合成可获得零号病人档案。'),
    30045: ('零号病人档案', '零号病人的档案袋，编号被人刻意涂掉了。合成可获得研究员加密硬盘。'),
    30046: ('研究员加密硬盘', '研究员留下的加密硬盘，解开它就能接近真相。合成可获得实验日志残页。'),
    30047: ('实验日志残页', '实验日志的残页，字迹潦草：「它醒了。」合成可获得病毒真相。'),
    30048: ('病毒真相', '拼齐所有线索，病毒的真相终于浮出水面。已达到最高等级。'),
    # 远征装备链（§4.2）
    30068: ('帆布背包', '结实的帆布背包，能装下整日的补给。合成可获得远征行囊。'),
    30069: ('远征行囊', '干粮、水袋、绳索，远行该有的都有了。合成可获得满载行囊。'),
    30070: ('满载行囊', '塞得鼓鼓囊囊的行囊，再远的路也不怕。合成可获得探索者背包。'),
    30071: ('探索者背包', '探索者的标配背包，走到哪活到哪。已达到最高等级。'),
    # 武器链（§4.3）
    30072: ('弹弓', '皮筋加木杈，小孩也能上手的武器。合成可获得猎弓。'),
    30073: ('猎弓', '猎弓出手无声，夜里不会惊动尸群。合成可获得劲弩。'),
    30074: ('劲弩', '上弦一次，足以贯穿僵尸的头颅。合成可获得猎枪。'),
    30075: ('猎枪', '老式猎枪，威力可靠，就是动静大了点。合成可获得军用步枪。'),
    30076: ('军用步枪', '军用制式步枪，老枪看了都点头。已达到最高等级。'),
    # 布料护具链（§4.4，L8-L12 改皮复用原玩偶 id）
    40022: ('帆布背包', '布料缝成的背包，能背能扛。合成可获得防弹夹层。'),
    40023: ('防弹夹层', '多层布料压成的夹层，能挡住流弹。合成可获得自制防弹衣。'),
    40024: ('自制防弹衣', '自己动手缝的防弹衣，丑是丑，能保命。合成可获得加固防弹衣。'),
    40025: ('加固防弹衣', '加了铁片的防弹衣，沉，但踏实。合成可获得守卫重甲。'),
    40026: ('守卫重甲', '守卫的重型护甲，夜里站岗的底气。已达到最高等级。'),
    # 变异昆虫链尾
    40038: ('变异萤后', '变异萤后的磷粉能抑制病毒活性，是药品研究的关键材料。已达到最高等级。'),
    # 合成核心链（§4.6）
    60025: ('核心残片', '合成核心的残片，和外婆留下的半块隐隐共鸣。合成可获得核心基座。'),
    60026: ('核心基座', '承托核心的基座，纹路像某种电路。合成可获得合成核心原型。'),
    60027: ('合成核心原型', '勉强能运转的核心原型，能量不断外溢。合成可获得TG-I型核心。'),
    60028: ('TG-I型核心', '刻着TG-I编号的核心，是外婆的手笔。合成可获得合成核心·二型。'),
    60029: ('合成核心·二型', '改良过的合成核心，运转更稳定。合成可获得合成核心·三型。'),
    60030: ('合成核心·三型', '接近完成的合成核心，只差最后一块。合成可获得完整合成核心。'),
    60031: ('完整合成核心', '完整的合成核心，外婆毕生的心血——「如果你听到这个，说明它醒了」。已达到最高等级。'),
}

# 只改 mask 不改名（原文案引用了旧的下级名）
MASK_ONLY = {
    40021: '好像可以塞些小物件。合成可获得帆布背包。',
    60024: '似乎是某种装置的零件。合成可获得核心残片。',
}

# (起始 id, 结束 id, 新 sonname) —— 闭区间整段改链名
SON_RENAME = [
    (30037, 30048, '病毒线索'),
    (30067, 30071, '远征装备'),
    (30072, 30076, '武器'),
    (40019, 40026, '布料护具'),
    (60024, 60031, '合成核心'),
]

MOUSE_CAGE_ID = 50036  # 实验鼠笼（新增，鼠链 MAX）
CAT_BEAT = {
    'id': 131,
    'chapter': 4,
    'trigger': {'type': 'level', 'value': 5},
    'lines': [
        {'who': 'narrator', 'text': '入夜，堡垒外传来一阵细弱的猫叫。'},
        {'who': 'laoqiang', 'text': '野猫，饿得皮包骨。……养猫比养人省粮。'},
        {'who': 'hero', 'text': '那就留下吧。多一张嘴，也多一分人气。'},
        {'who': 'narrator', 'text': '猫窝已送到棋盘上——点满 12 次，小猫就在堡垒安家了。'},
    ],
    'spawnProps': [50022],
}


def main():
    props = json.loads(PROP_PATH.read_text(encoding='utf-8'))
    by_id = {p['id']: p for p in props}
    changed = 0

    for pid, (name, mask) in RENAMES.items():
        p = by_id[pid]
        if p['name'] != name or p['mask'] != mask:
            p['name'], p['mask'] = name, mask
            changed += 1
    for pid, mask in MASK_ONLY.items():
        if by_id[pid]['mask'] != mask:
            by_id[pid]['mask'] = mask
            changed += 1
    for lo, hi, son in SON_RENAME:
        for pid in range(lo, hi + 1):
            p = by_id.get(pid)
            if p and p['sonname'] != son:
                p['sonname'] = son
                changed += 1

    # 鼠猫切断：新增实验鼠笼（克隆变异鼠群，等级字段对齐原链尾猫窝 L6）
    src, cage_src = by_id[50021], by_id[50022]
    if MOUSE_CAGE_ID not in by_id:
        cage = dict(src)
        cage.update({
            'id': MOUSE_CAGE_ID,
            'name': '实验鼠笼',
            'blessId': 0,
            'luna': cage_src['luna'],
            'lunc': cage_src['lunc'],
            'bubble': cage_src['bubble'],
            'levelGold': cage_src['levelGold'],
            'mask': '抓来的变异鼠都关在这里，是研究病毒的最好样本。已达到最高等级。',
        })
        props.insert(props.index(src) + 2, cage)  # 插在 50021/50022 附近保持有序
        changed += 1
    if src['blessId'] != MOUSE_CAGE_ID:
        src['blessId'] = MOUSE_CAGE_ID
        src['mask'] = '成群结队，鼠患要压不住了。合成可获得实验鼠笼。'
        changed += 1

    # 校验
    ids = [p['id'] for p in props]
    assert len(ids) == len(set(ids)), 'id 重复'
    for p in props:
        if p['blessId']:
            assert p['blessId'] in {q['id'] for q in props}, f"{p['id']} blessId 悬空"
    PROP_PATH.write_text(json.dumps(props, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    # 流浪猫窝投放事件 beat
    story = json.loads(STORY_PATH.read_text(encoding='utf-8'))
    if not any(b['id'] == CAT_BEAT['id'] for b in story):
        story.append(CAT_BEAT)
        STORY_PATH.write_text(json.dumps(story, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        print('story.json +beat 131（流浪猫窝投放事件）')

    print(f'prop_prop.json 变更 {changed} 处，道具总数 {len(props)}')
    # 残留命名校验（设计文档 §五.7）
    bad = ['露营结束', '尼格霍德', '废旧汽车', '酷哥小兔', '跃迁', '霓虹飞蛾', '手工布偶', '玩偶']
    left = [p['name'] for p in props if any(b in p['name'] for b in bad)]
    print('残留命名:', left if left else '无')


if __name__ == '__main__':
    main()
