# -*- coding: utf-8 -*-
"""
生成《物品合成链与玩法规则》文档 → 项目根 ITEM_CHAINS.md
数据来源（全部现取，不照抄 MERGE_REFERENCE.md）：
  - src/core/config/data/prop_prop.json   道具主表
  - src/core/config/data/building.json    建筑表（blueprint 字段 = 最终蓝图 propId）
玩法规则（写死在下文散文中，改代码后需人工同步）：
  - SpawnSystem.ts / PropConfig.ts / BaseSystem.ts / UnlockSystem.ts /
    MergeSystem.ts / SpecialItemSystem.ts / TaskSystem.ts / EconomySystem.ts
用法: python scripts/gen-item-chains-doc.py
"""
import io
import json
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROPS = json.load(open(os.path.join(ROOT, 'src/core/config/data/prop_prop.json'), encoding='utf-8'))
BUILDINGS = json.load(open(os.path.join(ROOT, 'src/core/config/data/building.json'), encoding='utf-8'))
BY_ID = {r['id']: r for r in PROPS}

# 与代码一致的常量（PropConfig.ts / BaseSystem.ts / SpawnSystem.ts）
TOOLBOX_MIN, TOOLBOX_MAX = 10001, 10011        # isToolboxSpawner
BATTERY_HEAD = 50001                            # BATTERY_CHAIN_HEAD
BUBBLE_TIME_S = 60                              # DESIGN_CONFIG.bubbleTime
BUBBLE_BOMB_ID = 203                            # DESIGN_CONFIG.bubbleBombPropId


def nm(pid):
    r = BY_ID.get(pid)
    return r['name'] if r else f'?{pid}'


def products(row):
    """atom/matic → [(id, weight)]，与 PropConfig.getClickProducts 一致"""
    if not row['atom']:
        return []
    ids = str(row['atom']).split(',')
    ws = str(row['matic'] or '').split(',')
    out = []
    for i, s in enumerate(ids):
        pid = int(s)
        if pid <= 0:
            continue
        try:
            w = int(ws[i])
        except (IndexError, ValueError):
            w = 1
        out.append((pid, w))
    return out


def fmt_products(row):
    """产出列表 → '扳手(44%)、钳子(30%)'；同 id 重复项合并权重"""
    ps = products(row)
    if not ps:
        return '—'
    merged = {}
    order = []
    for pid, wt in ps:
        if pid not in merged:
            order.append(pid)
        merged[pid] = merged.get(pid, 0) + wt
    total = sum(merged.values())
    parts = []
    for pid in order:
        wt = merged[pid]
        pct = round(wt * 100 / total) if total else 0
        parts.append(f'{nm(pid)}({pct}%)' if total != wt or len(order) > 1 else nm(pid))
    return '、'.join(parts)


def _fmt_num(x):
    r = round(x, 1)
    return str(int(r)) if r == int(r) else str(r)


def fmt_secs(s):
    if not s:
        return '—'
    if s < 60:
        return f'{s}秒'
    if s < 3600:
        return f'{_fmt_num(s / 60)}分钟'
    return f'{_fmt_num(s / 3600)}小时'


def fmt_full(row):
    """回满时间 ≈ times × milo"""
    if row['milo'] <= 0 or row['times'] <= 0:
        return '—'
    return fmt_secs(row['times'] * row['milo'])


# ---------------------------------------------------------------- 合成链
MERGE_TARGETS = {r['blessId'] for r in PROPS if r['blessId'] > 0}


def walk_chains():
    """从链首（无任何 blessId 指向、且自身 blessId>0 或是合成产物）沿 blessId 走链"""
    chains = []
    for r in PROPS:
        if r['id'] in MERGE_TARGETS:
            continue
        if r['blessId'] <= 0:
            continue  # 孤品，不进链表
        chain = []
        cur, seen = r, set()
        while cur and cur['id'] not in seen:
            seen.add(cur['id'])
            chain.append(cur)
            cur = BY_ID.get(cur['blessId'])
        chains.append(chain)
    chains.sort(key=lambda c: (c[0]['type'], c[0]['typeson'], c[0]['id']))
    return chains


def chain_tag(r):
    tags = []
    if r['anc'] and r['times'] > 0:
        tags.append('⚡发射')
    if r['fair'] > 0:
        tags.append('⏰自动')
    if r['wsb'] and (r['anc'] or r['fair']):
        tags.append('💀点完消失')
    if r['doge'] and (r['anc'] or r['fair']):
        tags.append(f"→变身[{nm(r['doge'])}]")
    if r['mdt'] == 1:
        tags.append('🔓解锁型')
    return (' ' + '/'.join(tags)) if tags else ''


TYPE_NAMES = {
    1: '维修', 2: '健身/饮食', 3: '超市/收纳', 4: '园艺', 5: '清洁',
    6: '功能道具', 7: '建筑蓝图', 11: '金币', 12: '钻石', 15: '体力',
    21: '手提包', 23: '手提包', 25: '存钱罐',
}

# ---------------------------------------------------------------- 文档
out = []
w = out.append

w('# 物品合成链与玩法规则\n')
w('> 本文档由 `scripts/gen-item-chains-doc.py` 依据 **本工程当前配置与代码** 自动生成，'
  '数值提取自 `src/core/config/data/prop_prop.json`（共 %d 条道具），规则摘自 `src/core/systems/*.ts`。\n'
  '> 根目录 `MERGE_REFERENCE.md` 是源项目（D:/merge）的过时参考，与本文档数值不一致时以本文档为准。\n' % len(PROPS))

# ================= 1 基础规则 =================
w('## 1. 基础规则\n')
w('- **棋盘**：7 列 × 9 行，共 63 格（`types.ts` IGrid）。物品落点：发射器产出优先落周围九宫空格，九宫满则落全盘首个空格；棋盘全满则点击失败。')
w('- **二合规则**：两个 **相同 id** 的物品拖到一起 → 合成下一级（产物由配置 `blessId` 指定）；`blessId=0` 即为满级（链尾），再拖只会提示「已满级」并交换位置。每次成功合成 **+1 玩家经验**。')
w('- **纸箱封印**：开局/发放的部分物品封在纸箱里，**不能作为任何拖拽目标**；在它 **十字相邻格** 完成一次合成即可戳破纸箱，物品露出但变为蜘蛛网状态。')
w('- **蜘蛛网封印**：被网物品 **不能移动、不能交换**，两个同 id 蜘蛛网也不能互相合成；解封方法 = 用一个 **无网的相同物品** 与它合成（合成即解封，产物正常）。')
w('- **气泡**：部分发放/合成奖励的物品带气泡（60 秒，`DESIGN_CONFIG.bubbleTime`）。气泡中不能合成、不能点击、不参与自动产出；可花钻石戳破（价格 = 配置 `bubble` 字段）；超时自爆变成「%s」（金币 L3，价值 8 金币）。' % nm(BUBBLE_BOMB_ID))
w('- **体力**：点击发射器每次消耗 **1 体力**；`noPower=1` 的发射器（宝箱、手提包、钻石瓶、蓝图发射器等）不耗体力；「无限能量」生效期间所有点击不耗体力。')
w('- **出售**：`she=1` 且 `levelGold>0` 的正常状态物品可出售，得 `levelGold` 金币；出售后可撤销（返还金币、物品放回原位/空格/卡片列表）。被封印（纸箱/蜘蛛网）、气泡中的物品不可出售。')
w('- **MAX 角标**（`PropConfig.isMaxBadgeItem`）：① 合成链尾（`blessId=0` 且有上游合成进来，含满级发射器如维修工作台/双开门冰箱/豪华器材铲车）；② 带等级（luna>1）但完全不可合成的孤品（如金币/钻石/体力的各级、钻石瓶）。')
w('- **第一天新手保护**（`SpawnSystem.clickSpawn`）：第 1 天点击 **工具箱链发射器（工具箱把手 10001 ~ 维修工作台 10011）不扣次数、不累积 CD**——开局要攒 300 金币盖发电机，让玩家放心刷维修材料起步。')
w('- **合成额外奖励**：新手引导完成后，每次合成按权重表额外抽奖（无奖励 / 同级物品气泡 / 指定物品），发至棋盘空格。\n')

# ================= 2 合成链总表 =================
chains = walk_chains()
w('## 2. 合成链总表\n')
w('沿 `blessId` 实际走链，共 **%d 条合成链**（长度≥2，孤品不计）。链尾（最后一个）即 MAX。' % len(chains))
w('标记：⚡发射=该级是点击发射器；⏰自动=该级是自动发生器；💀=点击次数耗尽后消失；🔓=解锁型发射器。\n')
w('| 大类 | 链名(sonname) | 等级序列（1级 → … → MAX） | 链尾 |')
w('|---|---|---|---|')
for c in chains:
    head = c[0]
    tname = TYPE_NAMES.get(head['type'], f"type{head['type']}")
    seq = ' → '.join(f"**{r['name']}**{chain_tag(r)}" if r['blessId'] == 0 else f"{r['name']}{chain_tag(r)}" for r in c)
    w(f"| {tname}({head['type']}/{head['typeson']}) | {head['sonname'] or head['name']} | {seq} | {c[-1]['name']} MAX |")
w('')
w('> 注：建筑蓝图链（type=7）的「发射器」本身不可合成获得，上表只列出其材料部分（碎片→图纸→设计图→蓝图），完整链路见 §4.6。')
w('> 注：娱乐设施链尾「游戏机盒子」（30062）配置 `anc=0`，当前代码下不可点击，只是链尾收藏品；其配置的原子产出（小掌机）暂无产出入口，游戏机链（3/8）目前只能靠任务/奖励投放获得。\n')

# ================= 3 发射器 / 发生器 =================
w('## 3. 发射器 / 发生器详表\n')
w('### 3.1 常规点击发射器（材料链内，CD 循环型）\n')
w('每次点击消耗 1 体力（蓝图/宝箱类除外）、扣 1 次数并累加 `milo` 秒 CD；次数用完后等 CD 走完回满 `times` 次。'
  '「回满≈」= 次数 × 单次CD（不停点击时把次数打空所需的时间，也是回满一轮的时间）。\n')

def spawner_table(rows):
    w('| 等级 | 名称 | 次数 | 单次CD | 回满≈ | 产出（权重） |')
    w('|---|---|---|---|---|---|')
    for r in rows:
        extra = ''
        if r['lock']:
            extra += '（初始即在CD）'
        if r['doge']:
            extra += f"（点完变身→{nm(r['doge'])}）"
        w(f"| {r['luna']} | {r['name']}{extra} | {r['times']} | {fmt_secs(r['milo'])} | {fmt_full(r)} | {fmt_products(r)} |")
    w('')

# 按链分组：type<7 且含 anc=1 且非 wsb/非 mdt=1 的链
from collections import defaultdict
groups = defaultdict(list)
for r in PROPS:
    groups[(r['type'], r['typeson'])].append(r)

printed = set()
for (t, s) in sorted(groups):
    rows = groups[(t, s)]
    sp = [r for r in rows if r['anc'] and r['times'] > 0 and not r['wsb'] and r['mdt'] != 1 and t < 7]
    if not sp:
        continue
    son = sp[0]['sonname'] or sp[0]['name']
    w(f"**{son}链**（type {t}/{s}）\n")
    spawner_table(sorted(sp, key=lambda r: r['luna']))
    for r in sp:
        printed.add(r['id'])

w('> 工具箱链说明：手套（单只手套/一只手套）的产出权重是我们调整过的——6~11 级工具箱中手套合计权重为 8%~16%'
  '（6级 12%、7级 8%、8级 10%、9级 12%、10级 16%、11级 16%），避免低级工具箱被手套淹没问题。\n')

w('### 3.2 自动发生器（fair > 0，无需点击）\n')
w('到点自动向九宫空格吐出 `kishu` 个产物，吐完进入 `faircd` 秒冷却；气泡中暂停。\n')
w('| 链 | 等级 | 名称 | 每轮产出 | 冷却 | 产出物 |')
w('|---|---|---|---|---|---|')
autos = sorted([r for r in PROPS if r['fair'] > 0], key=lambda r: (r['type'], r['typeson'], r['luna']))
for r in autos:
    w(f"| {r['sonname']}({r['type']}/{r['typeson']}) | {r['luna']} | {r['name']} | {r['kishu']}个 | {fmt_secs(r['faircd'])} | {nm(r['fair'])} |")
w('')

# ================= 4 特殊道具 =================
w('## 4. 特殊道具\n')

w('### 4.1 宝箱 / 补给箱类（点完即消失，wsb=1）\n')
w('这类发射器 **无 CD、不耗体力**（存钱罐/礼物盒/补给箱耗 1 体力），次数点完直接消失，是材料/货币的一次性来源。\n')
w('| 名称 | 等级 | 次数 | 耗体力 | 产出（权重） |')
w('|---|---|---|---|---|')
chests = sorted([r for r in PROPS if r['anc'] and r['wsb'] and r['type'] != 7],
                key=lambda r: (r['type'], r['id']))
for r in chests:
    lock = '（需先解锁，见 §4.3）' if r['mdt'] == 1 else ''
    w(f"| {r['name']}{lock} | {r['luna']} | {r['times']} | {'否' if r['noPower'] else '是'} | {fmt_products(r)} |")
w('')
w('另有 **钻石瓶**（id 901，20 次，不耗体力，产钻石 一点40%/少量30%/大量20%/超多10%）与 **储物篮/抽屉零件/抽屉雏形**'
  '（点 1 次后变身「纸屑堆」，CD 分别 6/3/1.5 小时，初始即在 CD）属于特殊消耗型发射器，见 §3.1 储物箱链。\n')

w('### 4.2 背包\n')
w('- **背包**（id 401）：棋盘上的固定收纳格，把物品拖到背包上即可入包（包内 CD 暂停，取出时补偿）；背包满或未解锁时入包失败。背包本身不可合成、不可出售。')
w('- **扩容背包**（60021，孤品不可合成）：功能道具，用于扩充背包容量。\n')

w('### 4.3 解锁型发射器（mdt=1，手提包）\n')
w('手提包首次点击开始 **p1=300 秒（5 分钟）解锁倒计时**（全场同时只能有一个在解锁），倒计时结束后变为可用发射器；'
  '不耗体力，次数点完消失。手提包是功能道具（无限能量/充能器/拆分器/加速器）、各级工具箱把手、电池、金币/体力等物品的重要来源。\n')
w('| 名称 | 等级 | 次数 | 产出（权重） |')
w('|---|---|---|---|')
for r in sorted([r for r in PROPS if r['mdt'] == 1], key=lambda r: r['id']):
    w(f"| {r['name']} | {r['luna']} | {r['times']} | {fmt_products(r)} |")
w('')

w('### 4.4 功能道具（mdt 2~11，type=6）\n')
w('拖拽类道具把自身 **拖到目标格** 生效（拖到同 id 可合成目标时优先走合成，保证 A+A 能升级）；'
  '点击类道具直接点击生效。功能道具自身也构成合成链（见 §2 type=6）。\n')
w('| 道具 | 链 | 使用方式 | 效果 |')
w('|---|---|---|---|')
w('| 无限能量（60001~60004，4级） | 小型30s→中型60s→大型120s→240s | 点击 | p1 秒内点击发射器不耗体力 |')
w('| 充能器（60005~60007，3级） | +5次→+10次→+20次 | 拖到发射器 | 目标（`chongneng=1` 的发射器）点击次数 +p1 |')
w('| 拆分器（60008~60010，3级） | 可拆≤4级→≤7级→≤50级 | 拖到物品 | 目标（`jiandao=1` 且 1<等级≤p1）降一级，并在空格复制一个降级品 |')
w('| 加速器（60011~60015，5级） | 1h→2h→4h→8h→16h | 点击 | 全场所有 CD/自动CD 减 p1 小时；CD 被清零的发射器按减掉的时长折算回点击次数（不超过上限） |')
w('| 升级卡（60016~60018） | 维修工具/系列/健身器材 | 拖到物品 | 匹配标记（putong1/2/3）的物品升一级 |')
w('| 超级升级卡（60019） | 孤品 | 拖到物品 | 除标记 `nochaoji` 外的物品升一级 |')
w('| 全能升级卡（60020） | 孤品 | 拖到物品 | 标记 `quanneng` 的物品升一级 |')
w('| 加速装置（60024~60031，8级链） | 神秘的零件→核心→底座→加速装置4→TG-I型(2h)→…→16h | 点击启动 | p1 小时内每 tick 给九宫邻居的 CD/自动CD 双倍流逝；时间到自动消失 |')
w('| 怀表（60022）/ 柑橘香清洁剂（60023） | 孤品 | — | 表内暂无 mdt 功能，属于收藏品/出售品（levelGold=25） |')
w('')
w('升级卡目标限制：目标不能已是链尾（`isMaxLevelByChain`）。拆分器复制需要棋盘有空格。\n')

w('### 4.5 工程机器人链\n')
bchain = None
for c in chains:
    if c[0]['id'] == BATTERY_HEAD:
        bchain = c
        break
seq = ' → '.join(r['name'] for r in bchain)
w(f'- 链路（扫地机器人链，type 5/1）：{seq} → …（L5 起为扫地机发射器，见 §3.1）。')
w('- 电池来源：蓝色/黑色手提包（§4.3）权重产出，继续合成可获得工程机器人发射器。\n')

w('### 4.6 建筑蓝图链（type=7，共 17 条）\n')
w('链路统一为：**蓝图发射器**（8 次，单次CD 10 秒，**不耗体力**，点完消失，100% 产碎片）'
  '→ **蓝图碎片**(L1) → **图纸**(L2) → **设计图**(L3) → **蓝图**(L4，链尾 MAX)。'
  '即合成一张最终蓝图需要 8 张碎片 = 一台发射器的全部产出。\n')
w('- **使用蓝图**：选中最终蓝图（Lv4）点击使用，永久解锁对应建筑（`UnlockSystem.useBlueprint`），之后同建筑再建造只花金币。')
w('- **重复蓝图不浪费**：建筑已解锁时再使用蓝图，收入 `blueprintStock` 作为该建筑的升级材料。')
w('- 蓝图类道具（type=7）**不会进入任务订单候选**，不会被订单抽走。\n')
w('| 链 | 发射器 | 材料链 | 最终蓝图 | 解锁建筑 |')
w('|---|---|---|---|---|')
bp2b = {b['blueprint']: b['name'] for b in BUILDINGS if b.get('blueprint')}
for r in sorted([r for r in PROPS if r['type'] == 7 and r['anc']], key=lambda r: r['typeson']):
    # 材料链
    mats = []
    cur = BY_ID.get(r['atom'] if isinstance(r['atom'], int) else int(str(r['atom']).split(',')[0]))
    seen = set()
    while cur and cur['id'] not in seen:
        seen.add(cur['id'])
        mats.append(cur)
        cur = BY_ID.get(cur['blessId'])
    final = mats[-1]
    bname = bp2b.get(final['id'], '—（当前无对应建筑，暂不可使用）')
    w(f"| {r['sonname']} | {r['name']} | {' → '.join(m['name'] for m in mats[:-1])} | {final['name']} | {bname} |")
w('')
n_bp = len([r for r in PROPS if r['type'] == 7 and r['anc']])
w(f'> 共 {n_bp} 条蓝图链，其中 15 条对应可解锁建筑；「农场蓝图」「住房蓝图」在当前建筑表（building.json）中没有对应建筑，'
  '合成出来暂时无法使用（可出售，levelGold=30）。\n')

# ================= 5 玩法联动 =================
w('## 5. 玩法联动\n')
w('### 5.1 任务订单如何消耗这些链（TaskSystem）\n')
w('- **并发**：最多 3 个任务同时挂起；开局 1 个新手任务 + 补足 3 个，每完成 1 个补 1 个（新手链优先，其余用随机订单/保底任务补满）。')
w('- **候选池**：随机订单按玩家等级抽订单类型——「库存消耗型」从 **棋盘上已拥有** 的正常物品里挑；「重新养成型」从 **棋盘发射器产出链可达但未拥有** 的物品里挑（可达 = 从发射器 atom/自动器 fair 产物出发沿 blessId 合成闭包，高度不超过「种子等级/该链已拥有最高等级」+ **前瞻 2 级**，保证短期真能合出来）。被封印/气泡中的物品不算可达。')
w('- **库存加权**：库存消耗型订单按棋盘上该物品的 **堆叠数量加权** 抽取——囤得越多越容易被订单消化，防止单一材料堆积。')
w('- **等级提升**：部分订单会把需求等级沿链上调（已拥有的物品不受可达高度限制，向上合总能达到）。')
w('- **防重复**：进行中任务已要求的物品不会再被新订单重复要求。')
w('- **蓝图豁免**：type=7 蓝图道具不进订单候选。')
w('- **奖励**：星星 × 10 金币 + 需求物品出售价值（levelGold × 数量）——约为把材料直接卖掉的两倍上下，交订单比卖材料划算。\n')
w('### 5.2 风力供电（BaseSystem）\n')
w('```\n风力发电站 providePower(1级6) × 等级缩放\n        ↓ 按摆放顺序累计\n耗电建筑(防御塔/资源建筑 needPower=2，陷阱/墙=0) 依次通电，超出容量即停机\n```')
w('- 风力发电站永久供电，不消耗电池或燃料；资源建筑的材料产出仍有离线累积上限 4 小时。')
w('- 第一天工具箱链免 CD 免次数（§1）就是为了让玩家快速刷维修材料、卖钱攒 300 金币盖第一座风力发电站，启动基地循环。\n')
w('### 5.3 合成与成长\n')
w('- 每次合成 +1 玩家经验；升级奖励宝箱/手提包，是发射器的主要来源之一。')
w('- 新手引导完成后每次合成有额外抽奖（同级气泡/指定物品），气泡 60 秒不戳就自爆成金币。\n')

w('---\n')
w('**数据提取自当前配置（prop_prop.json / building.json），生成日期 2026-08-04。**')
w('改动 `prop_prop.json`、`building.json` 或上述 systems 代码后，请重跑 `python scripts/gen-item-chains-doc.py` 同步更新本文档。')

doc = '\n'.join(out) + '\n'
target = os.path.join(ROOT, 'ITEM_CHAINS.md')
open(target, 'w', encoding='utf-8', newline='\n').write(doc)
print(f'written {target}, {len(doc)} bytes, {len(chains)} chains')

# ---------------- 抽查核对 ----------------
def check(desc, cond):
    print(('PASS' if cond else 'FAIL'), desc)

t6 = BY_ID[10006]
check('工具箱10006 权重 44/30/14/8/4', str(t6['matic']) == '44,30,14,8,4')
check('储物篮L1 CD 21600', BY_ID[30008]['milo'] == 21600)
check('蓝图链 17 条', n_bp == 17)
check('道具总数 451', len(PROPS) == 451)  # 450 + 实验鼠笼 50036（合成链重构 2026-08-06）
