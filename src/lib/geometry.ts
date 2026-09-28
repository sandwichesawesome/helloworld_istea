import type { Point, Shape } from '../types';

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function pointInPolygon(x: number, y: number, pts: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInShape(x: number, y: number, s: Shape): boolean {
  if (s.type === 'rect') return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
  return pointInPolygon(x, y, s.points);
}

export function shapeBBox(s: Shape): BBox {
  if (s.type === 'rect') return { x: s.x, y: s.y, w: s.w, h: s.h };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of s.points) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function bboxOfPoints(pts: readonly Point[]): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function unionBBox(a: BBox, b: BBox): BBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function polylineLength(pts: readonly Point[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

/** 모서리를 반경 r 의 2차 베지어로 둥글린 폴리라인 */
export function roundCorners(pts: readonly Point[], radius = 26, steps = 8): Point[] {
  if (pts.length < 3) return pts.slice();
  const out: Point[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p = pts[i], p1 = pts[i + 1];
    const l0 = dist(p0, p), l1 = dist(p, p1);
    if (l0 < 1e-6 || l1 < 1e-6) continue;
    const r = Math.min(radius, l0 / 2, l1 / 2);
    const a = { x: p.x + ((p0.x - p.x) / l0) * r, y: p.y + ((p0.y - p.y) / l0) * r };
    const b = { x: p.x + ((p1.x - p.x) / l1) * r, y: p.y + ((p1.y - p.y) / l1) * r };
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      out.push({ x: u * u * a.x + 2 * u * t * p.x + t * t * b.x, y: u * u * a.y + 2 * u * t * p.y + t * t * b.y });
    }
  }
  out.push(pts[pts.length - 1]);
  // 중복점 제거
  return out.filter((q, i) => i === 0 || dist(q, out[i - 1]) > 0.01);
}

/** 호 길이 기반 샘플러: s 위치의 좌표와 진행 방향(라디안) */
export function createSampler(pts: readonly Point[]) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1];
  const at = (s: number): Point => {
    if (pts.length === 1) return { ...pts[0] };
    const d = Math.max(0, Math.min(total, s));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    const seg = cum[hi] - cum[lo] || 1;
    const t = (d - cum[lo]) / seg;
    return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * t, y: pts[lo].y + (pts[hi].y - pts[lo].y) * t };
  };
  const heading = (s: number, look = 14): number => {
    const a = at(s - look);
    const b = at(s + look);
    if (dist(a, b) < 1e-6) {
      const n = pts.length;
      return n > 1 ? Math.atan2(pts[n - 1].y - pts[n - 2].y, pts[n - 1].x - pts[n - 2].x) : -Math.PI / 2;
    }
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  return { total, at, heading };
}

export function pointsToPath(pts: readonly Point[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');
}

export function shapeToPath(s: Shape): string {
  if (s.type === 'rect') return `M${s.x} ${s.y}h${s.w}v${s.h}h${-s.w}Z`;
  return s.points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('') + 'Z';
}
