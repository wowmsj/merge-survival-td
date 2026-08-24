# itch.io 页面上传清单 —— Merge Fortress

> 文件都在 `release/` 下：
> - `merge-fortress-itch.zip` —— 游戏包（7.6 MB，index.html 在根目录，已改英文标题/Loading）
> - `itch-cover-630x500.png` —— 封面图（630×500，itch 推荐尺寸）
>
> 打包流程固化在仓库里，以后每次发版：build → 拷贝 dist → 补丁 index.html → 打 zip。
> 本文件的文案直接复制粘贴到 itch 后台对应字段即可。

## 一、基本信息（Create new project 表单）

| 字段 | 填什么 |
|---|---|
| Title | Merge Fortress |
| Project URL | merge-fortress（若被占用用 merge-fortress-7） |
| Tagline（一句话简介） | Merge scraps into gear, power your fortress, and hold the line against the zombie horde. |
| Classification | Games |
| Kind of project | **HTML** |
| Pricing | $0 or donate（测试期）/ No payments 也可 |
| 语言 | English |

## 二、上传与嵌入设置（Uploads 区域）

1. 上传 `merge-fortress-itch.zip`
2. 勾选 **This file will be played in the browser**
3. Embed options:
   - **Viewport dimensions: 540 × 960**（竖屏游戏，必须竖版比例）
   - 勾 **Fullscreen button**
   - 勾 **Mobile friendly** / Enable on mobile
   - Orientation: **Portrait**
4. Frame 背景色：`#1a1a2e`

## 三、页面文案（Description，Markdown 直接贴）

```markdown
**Merge Fortress** is a merge-2 puzzle × base-defense survival game set ten years after the outbreak.

By day, you scavenge: drag two matching items together to merge them into better gear — toolboxes, water purifiers, medicine, weapons, blueprints. Fill black-market orders to earn coins, unlock blueprints, and rebuild Fortress 7.

By night, the horde comes. Spend your hard-earned coins on arrow towers, tesla coils, walls and traps — and hold the single eastern gap until dawn. Power is everything: no generator, no towers.

### Features

- **63 merge chains** — every scrap tells a story, from dirty water to distilled canteens, from a slingshot to a military rifle
- **Tower defense nights** — ground, flying and burrowing zombies demand different answers
- **A living fortress** — survivors join your cause: a veteran sniper, a genius engineer, a black-market trader… each with their own story chapter
- **A mystery to merge together** — piece by piece, assemble the Merge Core and uncover the truth about the virus
- **Runs in your browser** — progress saves automatically, play a few minutes at a time

*English & Chinese supported (auto-detected from your browser, switchable in Settings).*
```

## 四、Tags（最多 10 个）

`merge` `tower-defense` `survival` `zombie` `puzzle` `base-building` `post-apocalyptic` `casual` `mobile-friendly` `pixel-art`

## 五、发布策略

- 先 **Draft → Restricted**（知道链接的人才能玩），发给测试用户收反馈
- 没问题再转 **Public**；itch 新游戏会进 "Newest" 列表，自带一波自然流量
- 封面之外的截图（Screenshots 区域，建议 3~5 张）：进游戏截白天棋盘、夜晚防守、剧情对话各一张，竖屏 540×960 即可——这个需要实机跑，我没法替你截
