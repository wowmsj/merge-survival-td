# 一次性补丁：合成核心链 60026~60031 改为永久装置
# - 60028~60031 去掉 mdt=11/p1（原一次性加速器会自毁）
# - 60028/60029 levelGold 改 0（防误卖）
# - mask 文案写明各级光环效果
import io, re, sys

PATH = 'src/core/config/data/prop_prop.json'
with io.open(PATH, 'r', encoding='utf-8', newline='') as f:
    text = f.read()

MASKS = {
    60026: '承托核心的基座，纹路像某种电路。放在棋盘上：全场发射器产出 5% 概率升一级。合成可获得合成核心原型。',
    60027: '勉强运转的核心原型，嗡嗡作响。放在棋盘上：全场发射器产出 10% 概率升一级。合成可获得TG-I型核心。',
    60028: '刻着TG-I编号的核心，是外婆的手笔。放在棋盘上：全场发射器产出 15% 概率升一级。合成可获得合成核心·二型。',
    60029: '改良过的合成核心，运转更稳定。放在棋盘上：全场发射器产出 20% 概率升一级。合成可获得合成核心·三型。',
    60030: '接近完成的合成核心，只差最后一块。放在棋盘上：全场发射器产出 25% 概率升一级。合成可获得完整合成核心。',
    60031: '完整的合成核心，外婆毕生的心血——「如果你听到这个，说明它醒了」。放在棋盘上：全场发射器产出 30% 概率升一级。已达到最高等级。',
}

def patch_block(text, pid, repls):
    m = re.search(r'\{\s*"id": %d,' % pid, text)
    if not m:
        sys.exit(f'id {pid} not found')
    start = m.start()
    end = text.index('\n }', start)  # 对象结束行
    block = text[start:end]
    for old, new in repls:
        if old not in block:
            sys.exit(f'id {pid}: field not found: {old!r}')
        block = block.replace(old, new, 1)
    return text[:start] + block + text[end:]

for pid, mask in MASKS.items():
    repls = []
    if pid >= 60028:
        repls.append(('"mdt": 11,', '"mdt": 0,'))
    if pid in (60028, 60029):
        m = re.search(r'\{\s*"id": %d,.*?"levelGold": (\d+),' % pid, text, re.S)
        repls.append(('"levelGold": %s,' % m.group(1), '"levelGold": 0,'))
    block_m = re.search(r'\{\s*"id": %d,.*?"mask": "([^"]*)",' % pid, text, re.S)
    repls.append(('"mask": "%s",' % block_m.group(1), '"mask": "%s",' % mask))
    text = patch_block(text, pid, repls)

# p1 字段只在 mdt=11 时有意义，清零防误用
for pid, p1 in ((60028, 2), (60029, 4), (60030, 8), (60031, 16)):
    text = patch_block(text, pid, [('"p1": %d,' % p1, '"p1": 0,')])

with io.open(PATH, 'w', encoding='utf-8', newline='') as f:
    f.write(text)
print('patched')
