import * as THREE from 'three';
import type * as Phaser from 'phaser';
import { IGameState, IItemData } from '../core/types';
import { getItem } from '../core/model/Grid';
import { itemInCd } from '../core/model/Item';
import { getProp, isAutoSpawner, isClickSpawner } from '../core/config/PropConfig';
import { getItemIconKey, colorFromId } from '../phaser/config/ItemIconMap';
import { getPropName } from '../core/i18n';

/** 2D 回退图标的共享平面几何（模块级单例，永不 dispose）；与 GLB 放大 1.5 倍保持视觉一致 */
const billboardGeo = new THREE.PlaneGeometry(1.15, 1.15);

/** 宿主渲染器（Base3DRenderer）提供给棋子视图的能力（避免与 BoardItemView 循环依赖具体类） */
export interface IBoardItemHost {
  readonly scene: Phaser.Scene;
  readonly state: IGameState;
  readonly overlayLayer: HTMLElement;
  /** 已按包围盒统一尺寸的模型模板缓存（Promise 缓存，失败记 null 并回退 2D） */
  loadModel(id: number): Promise<THREE.Object3D | null>;
  /** 相机朝向（2D 回退 billboard 面向相机用） */
  readonly billboardQuat: THREE.Quaternion;
  /** 贴格顶 quad 共享几何（蜘蛛网贴片用，实例级由宿主统一 dispose） */
  readonly quadGeo: THREE.BufferGeometry;
  /** 蜘蛛网贴片材质（暗底 + 网，懒加载共享） */
  spiderMaterial(): THREE.Material;
  /** 格子世界坐标（1 格 = 1 单位） */
  cellWorld(row: number, col: number): { x: number; z: number };
  /** Phaser 纹理 → dataURL（状态覆盖层背景），缺失返回 null */
  textureDataUrl(key: string): string | null;
}

/** 纹理缺失时的纯色兜底 */
const TEX_FALLBACK_COLOR: Record<string, string> = {
  'carton': 'rgba(139,90,43,1)',
  'bubble-mask': 'rgba(255,255,255,0.45)',
  'lock': 'rgba(255,212,59,0.9)',
  'task-gou': 'rgba(81,207,102,0.9)',
  'fx-glow': 'rgba(255,212,59,0.25)'
};

interface IFxStep {
  dur: number;
  to: number;
}

/**
 * 单格棋子视图（3D 模型/2D 回退 + HTML 状态覆盖层）
 * 状态覆盖（纸箱/气泡/CD/等级/锁/任务勾/光晕）不在 GLB 里，
 * 由 overlay div 呈现，位置由宿主渲染器每帧/重排时用 camera.project 换算；
 * 蜘蛛网为贴格顶 3D quad（随相机透视贴合棋盘）。
 */
export class BoardItemView {
  readonly row: number;
  readonly col: number;
  /** 格子根节点：拖拽时整体移动/抬升 */
  readonly root = new THREE.Group();
  /** 内容节点：呼吸/合成/生成等缩放动画写它的 scale（模型模板自身已含 1.14） */
  readonly content = new THREE.Group();
  readonly overlay: HTMLDivElement;

  private readonly host: IBoardItemHost;
  private sealEl: HTMLDivElement;
  private bubbleEl: HTMLDivElement;
  private glowEl: HTMLDivElement;
  private levelEl: HTMLDivElement;
  private lockEl: HTMLDivElement;
  private gouEl: HTMLDivElement;
  private cdCanvas: HTMLCanvasElement;

  private item: IItemData | null = null;
  private itemId = 0;
  private loadToken = 0;
  /** 本实例独占的资源（billboard 贴图/材质），清除内容时释放；GLB 共享资源不在这里 */
  private ownDisposables: { dispose(): void }[] = [];

  private breathing = false;
  private glowOn = false;
  private fxScale = 1;
  private fxChain: IFxStep[] = [];
  private fxT0 = 0;
  private fxFrom = 1;
  private hintT0 = -1;
  private spawnFadeT0 = -1;
  /** 上次画的 CD 量化进度；-1 = 未画/已隐藏 */
  private cdQ = -1;
  private cdWasActive = false;
  /** 当前内容是否为 2D billboard 回退（GLB 缺失/加载失败），调试钩子用 */
  private billboardActive = false;
  /** 当前 2D 回退图标网格（相机旋转后重新面向相机用） */
  private billboardMesh: THREE.Mesh | null = null;
  /** 蜘蛛网贴片（贴格顶 3D quad，随格拖拽；共享几何/材质，不单独 dispose） */
  private spiderMesh: THREE.Mesh | null = null;

  /** 当前是否处于 2D 图标回退（调试用） */
  isBillboard(): boolean {
    return this.billboardActive;
  }

  /** 相机方位角变化后，2D 回退图标重新面向相机 */
  syncBillboard(quat: THREE.Quaternion): void {
    if (this.billboardMesh) this.billboardMesh.quaternion.copy(quat);
  }

  constructor(host: IBoardItemHost, row: number, col: number) {
    this.host = host;
    this.row = row;
    this.col = col;

    const { x, z } = host.cellWorld(row, col);
    this.root.position.set(x, 0.162, z);
    this.content.userData.cellPos = { row, col };
    this.root.add(this.content);
    this.root.visible = false;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;pointer-events:none;display:none;';
    const mk = (css: string): HTMLDivElement => {
      const el = document.createElement('div');
      el.style.cssText = `position:absolute;pointer-events:none;background-size:100% 100%;background-repeat:no-repeat;${css}`;
      overlay.appendChild(el);
      return el;
    };
    this.glowEl = mk('left:-14%;top:-14%;width:128%;height:128%;mix-blend-mode:screen;display:none;');
    this.sealEl = mk('left:2%;top:2%;width:96%;height:96%;display:none;border-radius:12%;');
    this.bubbleEl = mk('left:2%;top:2%;width:96%;height:96%;display:none;');
    this.cdCanvas = document.createElement('canvas');
    this.cdCanvas.width = this.cdCanvas.height = 96;
    this.cdCanvas.style.cssText = 'position:absolute;left:2%;top:2%;width:96%;height:96%;pointer-events:none;display:none;';
    overlay.appendChild(this.cdCanvas);
    this.levelEl = mk('right:3%;bottom:0;text-align:right;font-weight:bold;color:#ffe066;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;display:none;');
    this.lockEl = mk('right:6%;top:6%;width:24%;height:24%;display:none;');
    this.gouEl = mk('left:6%;top:6%;width:20%;height:20%;display:none;');
    this.overlay = overlay;
    host.overlayLayer.appendChild(overlay);
  }

  /** 刷新显示（taskNeeded: 是否被任务需要）。对齐 ItemSprite.updateItem 的状态呈现 */
  setItem(item: IItemData | null, taskNeeded: boolean): void {
    this.item = item;
    this.hintT0 = -1;
    if (!item) {
      this.itemId = 0;
      this.loadToken++;
      this.clearContent();
      this.root.visible = false;
      this.overlay.style.display = 'none';
      this.breathing = false;
      this.glowOn = false;
      this.cdQ = -1;
      this.cdWasActive = false;
      return;
    }
    this.root.visible = true;
    this.overlay.style.display = '';

    const prop = getProp(item.id);
    const status = item.st ?? 0;

    // 纸箱保持神秘：隐藏 3D 内容，只显示纸箱覆盖层（对齐 ItemSprite 不画图标/名称）
    this.content.visible = status !== 2;

    this.setBg(this.sealEl, status === 2 ? 'carton' : null);
    // 蜘蛛网：贴格顶 3D quad（随格拖拽），不再是屏幕对齐 div
    if (status === 1) {
      if (!this.spiderMesh) {
        this.spiderMesh = new THREE.Mesh(this.host.quadGeo, this.host.spiderMaterial());
        this.spiderMesh.position.y = 0.009;
        this.root.add(this.spiderMesh);
      }
      this.spiderMesh.visible = true;
    } else if (this.spiderMesh) {
      this.spiderMesh.visible = false;
    }
    this.setBg(this.bubbleEl, item.cdBubble ? 'bubble-mask' : null);
    this.setBg(this.lockEl, prop && prop.mdt === 1 && !item.unlock && !itemInCd(item) ? 'lock' : null);
    this.setBg(this.gouEl, taskNeeded && status !== 2 ? 'task-gou' : null);

    // 3D 棋盘不显示 Lv/MAX 等级角标（玩家要求隐藏）
    this.levelEl.style.display = 'none';

    this.maybeStartBreath();
    // 换棋子时必须同步隐藏 CD 遮罩：cdQ 重置为 -1 后 updateCd 的隐藏分支不会再触发，
    // 否则上一任棋子的 CD 圆弧会残留在格子上（「传染」给新棋子）
    this.cdQ = -1;
    this.cdWasActive = false;
    this.cdCanvas.style.display = 'none';

    if (item.id !== this.itemId) {
      this.itemId = item.id;
      this.loadContent(item);
    }
  }

  /** 每帧驱动：特效缩放链 / 呼吸 / 光晕 / CD 遮罩（毫秒时间戳） */
  update(nowMs: number): void {
    if (!this.item) return;

    // 特效缩放链（合成弹跳 / 生成淡入放大）
    if (this.fxChain.length > 0) {
      const step = this.fxChain[0];
      const t = Math.min(1, (nowMs - this.fxT0) / step.dur);
      this.fxScale = this.fxFrom + (step.to - this.fxFrom) * t;
      if (t >= 1) {
        this.fxChain.shift();
        this.fxT0 = nowMs;
        this.fxFrom = this.fxScale;
      }
    }
    // 空闲可合成提示：棋子原地跳起两次（每跳 700ms，正弦半周起落），带轻微缩放
    let hintScale = 1;
    let hintY = 0;
    if (this.hintT0 >= 0) {
      const t = nowMs - this.hintT0;
      if (t > 1400) this.hintT0 = -1;
      else {
        const phase = ((t % 700) / 700) * Math.PI;
        hintY = 0.38 * Math.sin(phase);
        hintScale = 1 + 0.06 * Math.sin(phase);
      }
    }
    this.content.position.y = hintY;
    const breath = this.breathing ? 1 + 0.05 * Math.sin(nowMs * Math.PI / 600) : 1;
    this.content.scale.setScalar(this.fxScale * hintScale * breath);

    if (this.glowOn) {
      this.glowEl.style.opacity = (0.25 + 0.55 * (0.5 + 0.5 * Math.sin(nowMs * Math.PI / 750))).toFixed(2);
    }
    if (this.spawnFadeT0 >= 0) {
      const t = Math.min(1, (nowMs - this.spawnFadeT0) / 200);
      this.overlay.style.opacity = t.toFixed(2);
      if (t >= 1) {
        this.spawnFadeT0 = -1;
        this.overlay.style.opacity = '';
      }
    }

    this.updateCd(nowMs);
  }

  /** 合成成功弹跳（对齐 ItemSprite.playMergeTween 的关键帧） */
  playMerge(): void {
    this.fxChain = [
      { dur: 80, to: 0.85 },
      { dur: 120, to: 1.08 },
      { dur: 80, to: 0.97 },
      { dur: 80, to: 1 }
    ];
    this.fxT0 = Date.now();
    this.fxFrom = this.fxScale;
  }

  /** 新生成：小幅放大 + 覆盖层淡入（GLB 材质共享不做透明度动画，用缩放代替） */
  playSpawn(): void {
    this.fxChain = [{ dur: 200, to: 1 }];
    this.fxT0 = Date.now();
    this.fxFrom = 0.3;
    this.fxScale = 0.3;
    this.spawnFadeT0 = Date.now();
  }

  /** 空闲提示脉冲（可合成对） */
  playIdlePulse(): void {
    this.hintT0 = Date.now();
  }

  stopIdlePulse(): void {
    this.hintT0 = -1;
  }

  /** 覆盖层几何（宿主渲染器投影换算后调用） */
  layout(cssX: number, cssY: number, cssSize: number): void {
    const s = this.overlay.style;
    s.left = `${(cssX - cssSize / 2).toFixed(1)}px`;
    s.top = `${(cssY - cssSize / 2).toFixed(1)}px`;
    s.width = `${cssSize.toFixed(1)}px`;
    s.height = `${cssSize.toFixed(1)}px`;
    this.levelEl.style.fontSize = `${Math.max(10, cssSize * 0.15).toFixed(1)}px`;
  }

  /** 场景退出：移除 DOM、释放本实例独占贴图（不动 GLB 共享资源） */
  destroy(): void {
    this.loadToken++;
    this.clearContent();
    this.overlay.remove();
  }

  private setBg(el: HTMLDivElement, texKey: string | null): void {
    if (!texKey) {
      el.style.display = 'none';
      el.style.backgroundImage = '';
      return;
    }
    el.style.display = '';
    const url = this.host.textureDataUrl(texKey);
    if (url) {
      el.style.backgroundImage = `url("${url}")`;
    } else {
      el.style.backgroundImage = '';
      el.style.backgroundColor = TEX_FALLBACK_COLOR[texKey] ?? 'rgba(255,255,255,0.3)';
    }
  }

  /** 可产出（点击/自动）时启动缩放呼吸；可点击产出时额外加金色光晕（对齐 ItemSprite.maybeStartBreath） */
  private maybeStartBreath(): void {
    const item = this.item;
    const status = item?.st ?? 0;
    const canClick = !!item && isClickSpawner(item.id) && (item.times ?? 0) > 0 && !itemInCd(item) && !item.cdBubble && !status;
    const canAuto = !!item && isAutoSpawner(item.id) && (item.timesAuto ?? 0) > 0 && !item.cdAuto && !item.cdBubble && !status;
    this.glowOn = canClick;
    this.setBg(this.glowEl, canClick ? 'fx-glow' : null);
    this.breathing = canClick || canAuto;
  }

  /** CD 进度遮罩（毫秒到期时间戳，对齐 ItemSprite.updateCd）；量化到 1/72 变化才重绘 */
  private updateCd(nowMs: number): void {
    const item = this.item;
    const active = !!item && !!item.cd && !!item.cdSum && item.cdSum > 0 && item.cd - nowMs > 0;
    if (!active) {
      if (this.cdQ !== -1) {
        this.cdQ = -1;
        this.cdCanvas.style.display = 'none';
      }
      if (this.cdWasActive) {
        this.cdWasActive = false;
        this.maybeStartBreath();
      }
      return;
    }
    this.cdWasActive = true;
    const ratio = Math.min(1, (item!.cd! - nowMs) / item!.cdSum!);
    const q = Math.ceil(ratio * 72);
    if (q === this.cdQ) return;
    this.cdQ = q;
    this.cdCanvas.style.display = '';

    const g = this.cdCanvas.getContext('2d')!;
    const S = 96;
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    this.roundRect(g, 3, 3, S - 6, S - 6, 10);
    g.fill();
    const a0 = -Math.PI / 2;
    const a1 = a0 + Math.PI * 2 * ratio;
    g.fillStyle = 'rgba(255,146,43,0.4)';
    g.beginPath();
    g.moveTo(S / 2, S / 2);
    g.arc(S / 2, S / 2, S / 2 - 10, a0, a1, false);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,146,43,0.9)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 10, a0, a1, false);
    g.stroke();
  }

  private roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /** 加载并替换内容模型；await 后重新校验格子仍是原物品，防止旧模型盖新状态 */
  private loadContent(item: IItemData): void {
    this.clearContent();
    const token = ++this.loadToken;
    const itemRef = item;
    const id = item.id;
    void this.host.loadModel(id).then(tpl => {
      if (token !== this.loadToken) return;
      if (this.itemId !== id) return;
      if (getItem(this.host.state.grid, this.row, this.col) !== itemRef) return;
      if (tpl) {
        // 模板已按包围盒统一尺寸、底部归一化 Y=0，直接 clone 放置
        this.content.add(tpl.clone(true));
        this.billboardActive = false;
      } else {
        this.content.add(this.makeBillboard(id));
        this.billboardActive = true;
      }
    }).catch(() => { /* loadModel 内部已 catch→null，这里兜底防未处理拒绝 */ });
  }

  /** 无 GLB（货币/宝箱/补给等）→ 2D 图标 billboard 回退，永不空格子 */
  private makeBillboard(id: number): THREE.Mesh {
    const c = document.createElement('canvas');
    c.width = c.height = 256; // 高分屏清晰度（原 128 放大后发虚）
    const g = c.getContext('2d')!;
    const iconKey = getItemIconKey(id, this.host.scene.textures);
    const tex = iconKey && this.host.scene.textures.exists(iconKey) ? this.host.scene.textures.get(iconKey) : null;
    if (tex) {
      const img = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      g.drawImage(img, 16, 16, 224, 224);
    } else {
      // 无图标映射：色块 + 名称（对齐 ItemSprite 兜底）
      const color = `#${colorFromId(id).toString(16).padStart(6, '0')}`;
      g.fillStyle = color;
      this.roundRect(g, 12, 12, 232, 232, 28);
      g.fill();
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#000000';
      g.lineWidth = 6;
      g.font = 'bold 52px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const name = getPropName(id).substring(0, 4);
      g.strokeText(name, 128, 128);
      g.fillText(name, 128, 128);
    }
    const ctex = new THREE.CanvasTexture(c);
    ctex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: ctex, transparent: true });
    this.ownDisposables.push(ctex, mat);
    const mesh = new THREE.Mesh(billboardGeo, mat);
    mesh.quaternion.copy(this.host.billboardQuat);
    mesh.position.y = 0.58;
    this.billboardMesh = mesh;
    return mesh;
  }

  /** 移除内容子节点：只释放本实例独占资源，不 dispose 共享 geometry/material */
  private clearContent(): void {
    while (this.content.children.length > 0) {
      this.content.remove(this.content.children[0]);
    }
    for (const d of this.ownDisposables) d.dispose();
    this.ownDisposables = [];
    this.billboardActive = false;
    this.billboardMesh = null;
  }
}
