// 평면도를 격자로 래스터화하고 A*/다익스트라로 복도를 따라가는 경로를 찾는다.
//  - 복도(건물 외곽선 안 · 어떤 공간에도 속하지 않는 칸): 비용 1 (+ 벽 근처 가중치 → 복도 중앙 선호)
//  - 계단/출입구: 비용 3,  일반 호실: 비용 28 (다른 길이 없을 때만 통과)
//  - 안뜰 · 건물 밖 · 보이드: 통행 불가
//  - 출발/도착 공간은 비용 1 (문으로 들어가 중심까지 걸어가도록)
import type { Floor, Point } from '../types';
import { VIEWBOX } from '../data/building';

export const CELL = 5;
const CLEAR_R = 3;
const COST_ROOM = 28;
const COST_STAIRS = 3;

export interface NavGrid {
  floorId: string;
  cols: number;
  rows: number;
  base: Float32Array;
  spaceIdx: Int16Array;
  nSpaces: number;
}

const cache = new Map<string, NavGrid>();

export function getGrid(floor: Floor): NavGrid {
  let g = cache.get(floor.id);
  if (!g) {
    g = buildGrid(floor);
    cache.set(floor.id, g);
  }
  return g;
}

/** 스캔라인 폴리곤 채우기 (셀 중심 기준) */
function fillPolygon(pts: readonly (readonly [number, number])[], cols: number, rows: number, cb: (i: number) => void) {
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const r0 = Math.max(0, Math.floor(y0 / CELL));
  const r1 = Math.min(rows - 1, Math.ceil(y1 / CELL));
  const xs: number[] = [];
  for (let r = r0; r <= r1; r++) {
    const cy = (r + 0.5) * CELL;
    xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > cy !== yj > cy) xs.push(xi + ((cy - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(xs[k] / CELL - 0.5));
      const c1 = Math.min(cols - 1, Math.floor(xs[k + 1] / CELL - 0.5));
      for (let c = c0; c <= c1; c++) cb(r * cols + c);
    }
  }
}

function fillRect(x: number, y: number, w: number, h: number, cols: number, rows: number, cb: (i: number) => void) {
  const c0 = Math.max(0, Math.ceil(x / CELL - 0.5));
  const c1 = Math.min(cols - 1, Math.floor((x + w) / CELL - 0.5));
  const r0 = Math.max(0, Math.ceil(y / CELL - 0.5));
  const r1 = Math.min(rows - 1, Math.floor((y + h) / CELL - 0.5));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cb(r * cols + c);
}

function buildGrid(floor: Floor): NavGrid {
  const cols = Math.ceil(VIEWBOX.w / CELL);
  const rows = Math.ceil(VIEWBOX.h / CELL);
  const n = cols * rows;
  const kind = new Uint8Array(n); // 0 막힘, 1 복도, 2 공간
  const spaceIdx = new Int16Array(n).fill(-1);

  fillPolygon(floor.outline, cols, rows, (i) => (kind[i] = 1));
  if (floor.courtyard) {
    const c = floor.courtyard;
    fillRect(c.x, c.y, c.w, c.h, cols, rows, (i) => (kind[i] = 0));
  }
  if (floor.excluded) fillPolygon(floor.excluded.points, cols, rows, (i) => (kind[i] = 0));

  floor.spaces.forEach((s, idx) => {
    const k = s.kind === 'void' ? 0 : 2;
    const set = (i: number) => {
      kind[i] = k;
      spaceIdx[i] = idx;
    };
    if (s.shape.type === 'rect') fillRect(s.shape.x, s.shape.y, s.shape.w, s.shape.h, cols, rows, set);
    else fillPolygon(s.shape.points, cols, rows, set);
  });

  // 복도 칸의 벽까지 거리(칸 수) — 다중 시작점 BFS
  const clear = new Uint8Array(n);
  const queue = new Int32Array(n);
  let qh = 0, qt = 0;
  for (let i = 0; i < n; i++) {
    if (kind[i] !== 1) continue;
    const r = (i / cols) | 0, c = i - r * cols;
    let edge = false;
    for (let dr = -1; dr <= 1 && !edge; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols || kind[rr * cols + cc] !== 1) { edge = true; break; }
      }
    if (edge) { clear[i] = 1; queue[qt++] = i; }
  }
  while (qh < qt) {
    const i = queue[qh++];
    const r = (i / cols) | 0, c = i - r * cols;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const j = rr * cols + cc;
        if (kind[j] === 1 && clear[j] === 0) { clear[j] = Math.min(255, clear[i] + 1); queue[qt++] = j; }
      }
  }

  const base = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (kind[i] === 0) base[i] = Infinity;
    else if (kind[i] === 1) base[i] = 1 + Math.max(0, CLEAR_R - clear[i]) * 0.7;
    else {
      const sk = floor.spaces[spaceIdx[i]].kind;
      base[i] = sk === 'stairs' || sk === 'entrance' ? COST_STAIRS : COST_ROOM;
    }
  }
  return { floorId: floor.id, cols, rows, base, spaceIdx, nSpaces: floor.spaces.length };
}

// ---------- 이진 힙 ----------
class MinHeap {
  keys = new Float64Array(1024);
  vals = new Int32Array(1024);
  size = 0;
  push(k: number, v: number) {
    if (this.size === this.keys.length) {
      const nk = new Float64Array(this.size * 2); nk.set(this.keys); this.keys = nk;
      const nv = new Int32Array(this.size * 2); nv.set(this.vals); this.vals = nv;
    }
    let i = this.size++;
    const { keys, vals } = this;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= k) break;
      keys[i] = keys[p]; vals[i] = vals[p]; i = p;
    }
    keys[i] = k; vals[i] = v;
  }
  pop(): number {
    const { keys, vals } = this;
    const top = vals[0];
    const k = keys[--this.size], v = vals[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && keys[c + 1] < keys[c]) c++;
      if (keys[c] >= k) break;
      keys[i] = keys[c]; vals[i] = vals[c]; i = c;
    }
    keys[i] = k; vals[i] = v;
    return top;
  }
}

// ---------- 탐색 ----------
export interface Endpoint {
  point: Point;
  spaceIndex?: number; // 이 공간은 싸게(비용 1) 통과
}

type CostFn = (i: number) => number;

function makeCost(g: NavGrid, cheap: number[]): CostFn {
  const mask = new Uint8Array(g.nSpaces);
  for (const s of cheap) if (s >= 0) mask[s] = 1;
  return (i) => {
    const s = g.spaceIdx[i];
    return s >= 0 && mask[s] ? 1 : g.base[i];
  };
}

const cellOf = (g: NavGrid, p: Point) => {
  const c = Math.min(g.cols - 1, Math.max(0, Math.floor(p.x / CELL)));
  const r = Math.min(g.rows - 1, Math.max(0, Math.floor(p.y / CELL)));
  return r * g.cols + c;
};
const centerOf = (g: NavGrid, i: number): Point => {
  const r = (i / g.cols) | 0;
  return { x: (i - r * g.cols + 0.5) * CELL, y: (r + 0.5) * CELL };
};

/** 끝점이 속할 칸: 지정 공간 안의 칸, 막힌 칸이면 가장 가까운 통행 가능 칸 */
function resolveCell(g: NavGrid, ep: Endpoint, cost: CostFn): number {
  let i = cellOf(g, ep.point);
  if (ep.spaceIndex !== undefined && ep.spaceIndex >= 0 && g.spaceIdx[i] !== ep.spaceIndex) {
    let best = -1, bd = Infinity;
    for (let j = 0; j < g.spaceIdx.length; j++) {
      if (g.spaceIdx[j] !== ep.spaceIndex) continue;
      const c = centerOf(g, j);
      const d = (c.x - ep.point.x) ** 2 + (c.y - ep.point.y) ** 2;
      if (d < bd) { bd = d; best = j; }
    }
    if (best >= 0) i = best;
  }
  if (Number.isFinite(cost(i))) return i;
  // 가까운 통행 가능 칸 탐색 (링 확장)
  const r0 = (i / g.cols) | 0, c0 = i - r0 * g.cols;
  for (let rad = 1; rad < 80; rad++) {
    let best = -1, bd = Infinity;
    for (let dr = -rad; dr <= rad; dr++)
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) continue;
        const j = r * g.cols + c;
        if (Number.isFinite(cost(j)) && dr * dr + dc * dc < bd) { bd = dr * dr + dc * dc; best = j; }
      }
    if (best >= 0) return best;
  }
  return i;
}

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

function search(g: NavGrid, cost: CostFn, source: number, goals: number[], heuristicGoal?: number) {
  const n = g.cols * g.rows;
  const dist = new Float32Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const goalSet = new Set(goals);
  let remaining = goalSet.size;
  const heap = new MinHeap();
  let hr = 0, hc = 0;
  if (heuristicGoal !== undefined) { hr = (heuristicGoal / g.cols) | 0; hc = heuristicGoal - hr * g.cols; }
  const h = (i: number) => {
    if (heuristicGoal === undefined) return 0;
    const r = (i / g.cols) | 0, c = i - r * g.cols;
    return Math.hypot(r - hr, c - hc);
  };
  dist[source] = 0;
  heap.push(h(source), source);
  while (heap.size > 0) {
    const u = heap.pop();
    if (closed[u]) continue;
    closed[u] = 1;
    if (goalSet.has(u) && --remaining <= 0) break;
    const ur = (u / g.cols) | 0, uc = u - ur * g.cols;
    for (const [dc, dr, step] of DIRS) {
      const r = ur + dr, c = uc + dc;
      if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) continue;
      const v = r * g.cols + c;
      if (closed[v]) continue;
      const cv = cost(v);
      if (!Number.isFinite(cv)) continue;
      if (dr !== 0 && dc !== 0 && (!Number.isFinite(cost(ur * g.cols + c)) || !Number.isFinite(cost(r * g.cols + uc)))) continue;
      const nd = dist[u] + step * cv;
      if (nd < dist[v]) {
        dist[v] = nd;
        parent[v] = u;
        heap.push(nd + h(v), v);
      }
    }
  }
  return { dist, parent };
}

/** parent 를 따라 goal → source 칸 목록 */
function trace(parent: Int32Array, from: number): number[] {
  const out: number[] = [];
  for (let i = from, guard = 0; i !== -1 && guard < 200000; i = parent[i], guard++) out.push(i);
  return out;
}

/** 원래 경로가 지나간 칸보다 비싼 칸을 지나지 않는 한도에서 경로를 팽팽하게 당긴다 */
function smooth(g: NavGrid, cost: CostFn, cells: number[], start: Point, end: Point): Point[] {
  const n = cells.length;
  if (n <= 2) return [start, end];
  const pts = cells.map((c) => centerOf(g, c));
  pts[0] = start;
  pts[n - 1] = end;
  const costs = cells.map(cost);
  const los = (a: Point, b: Point, band: number) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(L / (CELL * 0.45)));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const cv = cost(cellOf(g, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }));
      if (!(cv <= band + 1e-6)) return false;
    }
    return true;
  };
  const out = [pts[0]];
  let i = 0;
  while (i < n - 1) {
    let best = i + 1;
    let band = Math.max(costs[i], costs[i + 1]);
    let fails = 0;
    for (let j = i + 2; j < n; j++) {
      band = Math.max(band, costs[j]);
      if (los(pts[i], pts[j], band)) { best = j; fails = 0; }
      else if (++fails > 8) break;
    }
    out.push(pts[best]);
    i = best;
  }
  return out;
}

export interface PathResult {
  points: Point[];
  ok: boolean;
}

/** 같은 층 안의 한 점 → 한 점 경로 */
export function findPath(floor: Floor, from: Endpoint, to: Endpoint): PathResult {
  const g = getGrid(floor);
  const cost = makeCost(g, [from.spaceIndex ?? -1, to.spaceIndex ?? -1]);
  const s = resolveCell(g, from, cost);
  const t = resolveCell(g, to, cost);
  if (s === t) return { points: [from.point, to.point], ok: true };
  const { dist, parent } = search(g, cost, s, [t], t);
  if (!Number.isFinite(dist[t])) return { points: [from.point, to.point], ok: false };
  const cells = trace(parent, t).reverse();
  return { points: smooth(g, cost, cells, from.point, to.point), ok: true };
}

/**
 * 한 점에서 여러 목표까지의 최단 거리(월드 단위)를 한 번에 구한다.
 * pathFromTarget(k): 목표 k → 원점 순서의 경로.
 */
export function flood(floor: Floor, source: Endpoint, targets: Endpoint[]) {
  const g = getGrid(floor);
  const cheap = [source.spaceIndex ?? -1, ...targets.map((t) => t.spaceIndex ?? -1)];
  const cost = makeCost(g, cheap);
  const s = resolveCell(g, source, cost);
  const tCells = targets.map((t) => resolveCell(g, t, cost));
  const { dist, parent } = search(g, cost, s, tCells);
  return {
    distances: tCells.map((c) => dist[c] * CELL),
    pathFromTarget(k: number): PathResult {
      const c = tCells[k];
      if (!Number.isFinite(dist[c])) return { points: [targets[k].point, source.point], ok: false };
      const cells = trace(parent, c);
      return { points: smooth(g, cost, cells, targets[k].point, source.point), ok: true };
    },
  };
}

/** 첫 경로 계산 전 격자를 미리 만들어 둔다 */
export function warmUp(floors: Floor[]) {
  const queue = [...floors];
  const next = () => {
    const f = queue.shift();
    if (!f) return;
    getGrid(f);
    setTimeout(next, 30);
  };
  setTimeout(next, 300);
}
