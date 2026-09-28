// SVG 카메라: 화면좌표 = 월드좌표 * k + (x, y)
// 드래그 이동, 휠/핀치 확대, 부드러운 flyTo 애니메이션. React 렌더링 없이 DOM 속성을 직접 갱신한다.
import type { Point } from '../types';
import type { BBox } from './geometry';

export interface Camera {
  x: number;
  y: number;
  k: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class Viewport {
  cam: Camera = { x: 0, y: 0, k: 1 };
  w = 1;
  h = 1;
  insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  minK = 0.1;
  maxK = 6;
  world: BBox;
  /** 사용자가 직접 조작한 마지막 시각 (자동 카메라 양보 판단용) */
  lastUserAction = 0;
  private listeners = new Set<(c: Camera) => void>();
  private anim = 0;
  private animResolve: (() => void) | null = null;

  constructor(world: BBox) {
    this.world = world;
  }

  onChange(fn: (c: Camera) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.cam);
  }

  setSize(w: number, h: number) {
    const first = this.w <= 1;
    const center = this.screenToWorld(this.w / 2, this.h / 2);
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.minK = this.fitScale(this.world) * 0.6;
    if (first) this.set(this.fitCamera(this.world));
    else this.set({ ...this.cam, x: this.w / 2 - center.x * this.cam.k, y: this.h / 2 - center.y * this.cam.k });
  }

  /** 이동 가능한 월드 범위 변경 (예: 1층은 건물 주변까지 포함) */
  setWorld(b: BBox) {
    this.world = b;
    if (this.w > 1) {
      this.minK = this.fitScale(b) * 0.6;
      this.set(this.cam);
    }
  }

  screenToWorld(sx: number, sy: number): Point {
    return { x: (sx - this.cam.x) / this.cam.k, y: (sy - this.cam.y) / this.cam.k };
  }

  worldToScreen(p: Point): Point {
    return { x: p.x * this.cam.k + this.cam.x, y: p.y * this.cam.k + this.cam.y };
  }

  private clamp(c: Camera): Camera {
    const k = Math.min(this.maxK, Math.max(this.minK, c.k));
    const { world } = this;
    // 도면이 화면 밖으로 완전히 사라지지 않도록 최소 120px 은 겹치게
    const m = 120;
    const x = Math.min(this.w - m - world.x * k, Math.max(m - (world.x + world.w) * k, c.x));
    const y = Math.min(this.h - m - world.y * k, Math.max(m - (world.y + world.h) * k, c.y));
    return { x, y, k };
  }

  set(c: Camera) {
    this.cam = this.clamp(c);
    this.emit();
  }

  private usable() {
    const { top, right, bottom, left } = this.insets;
    const w = Math.max(80, this.w - left - right);
    const h = Math.max(80, this.h - top - bottom);
    return { w, h, cx: left + w / 2, cy: top + h / 2 };
  }

  fitScale(b: BBox, padding = 24) {
    const u = this.usable();
    return Math.min((u.w - padding * 2) / Math.max(1, b.w), (u.h - padding * 2) / Math.max(1, b.h));
  }

  fitCamera(b: BBox, padding = 24, maxK = this.maxK): Camera {
    const k = Math.min(maxK, Math.max(this.minK, this.fitScale(b, padding)));
    const u = this.usable();
    return { k, x: u.cx - (b.x + b.w / 2) * k, y: u.cy - (b.y + b.h / 2) * k };
  }

  centerCamera(p: Point, k = this.cam.k): Camera {
    const u = this.usable();
    return { k, x: u.cx - p.x * k, y: u.cy - p.y * k };
  }

  stop() {
    if (this.anim) cancelAnimationFrame(this.anim);
    this.anim = 0;
    this.animResolve?.();
    this.animResolve = null;
  }

  /** 줌은 로그 공간, 중심은 선형 보간으로 부드럽게 이동 */
  flyTo(target: Camera, duration = 650): Promise<void> {
    this.stop();
    const to = this.clamp(target);
    const from = { ...this.cam };
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || duration <= 0) {
      this.set(to);
      return Promise.resolve();
    }
    const fromC = { x: (this.w / 2 - from.x) / from.k, y: (this.h / 2 - from.y) / from.k };
    const toC = { x: (this.w / 2 - to.x) / to.k, y: (this.h / 2 - to.y) / to.k };
    const lk0 = Math.log(from.k), lk1 = Math.log(to.k);
    const t0 = performance.now();
    return new Promise((resolve) => {
      this.animResolve = resolve;
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const e = easeInOutCubic(t);
        const k = Math.exp(lk0 + (lk1 - lk0) * e);
        const cx = fromC.x + (toC.x - fromC.x) * e;
        const cy = fromC.y + (toC.y - fromC.y) * e;
        this.cam = { k, x: this.w / 2 - cx * k, y: this.h / 2 - cy * k };
        this.emit();
        if (t < 1) this.anim = requestAnimationFrame(step);
        else {
          this.anim = 0;
          this.set(to);
          const r = this.animResolve;
          this.animResolve = null;
          r?.();
        }
      };
      this.anim = requestAnimationFrame(step);
    });
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const k = Math.min(this.maxK, Math.max(this.minK, this.cam.k * factor));
    const f = k / this.cam.k;
    this.set({ k, x: sx - (sx - this.cam.x) * f, y: sy - (sy - this.cam.y) * f });
  }

  panBy(dx: number, dy: number) {
    this.set({ ...this.cam, x: this.cam.x + dx, y: this.cam.y + dy });
  }

  /** 사용자 입력 시작 → 진행 중인 자동 카메라 중단 */
  userAction() {
    this.lastUserAction = performance.now();
    this.stop();
  }
}
