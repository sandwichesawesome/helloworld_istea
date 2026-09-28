// 출발 위치 → 목적지 공간까지의 (여러 층) 경로 계획
import type { NavLocation, Point, Route, RouteLeg, Space } from '../types';
import { CORE_SPACES, CORES, FLOOR_BY_ID, FLOORS, SPACE_BY_ID, floorIndex } from '../data/building';
import { FLOOR_CHANGE_COST } from '../data/overrides';
import { findPath, flood, type Endpoint, type PathResult } from './navgrid';
import { polylineLength, roundCorners } from './geometry';

const epOfSpace = (s: Space): Endpoint => ({ point: s.anchor, spaceIndex: s.index });

function epOfLocation(loc: NavLocation): Endpoint {
  const s = loc.spaceId ? SPACE_BY_ID[loc.spaceId] : undefined;
  return { point: loc.point, spaceIndex: s && s.floorId === loc.floorId ? s.index : undefined };
}

function makeLeg(floorId: string, path: PathResult, startLabel: string, endLabel: string): RouteLeg {
  const pts: Point[] = path.points.length >= 2 ? roundCorners(path.points) : [path.points[0], path.points[0]];
  return { floorId, points: pts, length: polylineLength(pts), startLabel, endLabel, approximate: !path.ok };
}

/** 코어가 두 층 사이의 모든 층에 존재하는가 */
function spans(coreId: string, a: number, b: number) {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  for (let i = lo; i <= hi; i++) if (!CORE_SPACES[coreId][FLOORS[i].id]) return false;
  return true;
}

function transition(coreId: string, fromIdx: number, toIdx: number) {
  return {
    coreId,
    coreName: CORES.find((c) => c.id === coreId)?.name ?? '계단',
    toFloorId: FLOORS[toIdx].id,
    direction: toIdx > fromIdx ? ('up' as const) : ('down' as const),
    floors: Math.abs(toIdx - fromIdx),
  };
}

let routeSeq = 0;

export function planRoute(from: NavLocation, to: Space): Route {
  const id = ++routeSeq;
  const fromEp = epOfLocation(from);
  const toEp = epOfSpace(to);
  const toFloor = FLOOR_BY_ID[to.floorId];
  const destLabel = to.title;

  if (from.floorId === to.floorId) {
    const same = from.spaceId === to.id;
    const path = same ? { points: [to.anchor, to.anchor], ok: true } : findPath(toFloor, fromEp, toEp);
    const leg = makeLeg(to.floorId, path, from.label, destLabel);
    return { id, from, to, legs: [leg], totalLength: leg.length };
  }

  const A = floorIndex(from.floorId);
  const B = floorIndex(to.floorId);
  const coresA = CORES.filter((c) => CORE_SPACES[c.id][FLOORS[A].id]);
  const coresB = CORES.filter((c) => CORE_SPACES[c.id][FLOORS[B].id]);
  const floA = flood(FLOORS[A], fromEp, coresA.map((c) => epOfSpace(CORE_SPACES[c.id][FLOORS[A].id])));
  const floB = flood(FLOORS[B], toEp, coresB.map((c) => epOfSpace(CORE_SPACES[c.id][FLOORS[B].id])));
  const dA = (coreId: string) => floA.distances[coresA.findIndex((c) => c.id === coreId)] ?? Infinity;
  const dB = (coreId: string) => floB.distances[coresB.findIndex((c) => c.id === coreId)] ?? Infinity;
  const pathA = (coreId: string) => floA.pathFromTarget(coresA.findIndex((c) => c.id === coreId));
  const pathB = (coreId: string) => floB.pathFromTarget(coresB.findIndex((c) => c.id === coreId));
  const vertical = (a: number, b: number) => Math.abs(a - b) * FLOOR_CHANGE_COST;

  // 1) 한 계단으로 바로 가는 경우
  let best: { cost: number; legs: () => RouteLeg[] } | null = null;
  for (const c of coresA) {
    if (!spans(c.id, A, B)) continue;
    const cost = dA(c.id) + dB(c.id) + vertical(A, B);
    if (cost < (best?.cost ?? Infinity)) {
      best = {
        cost,
        legs: () => {
          const a = pathA(c.id);
          const leg1 = makeLeg(FLOORS[A].id, { ok: a.ok, points: [...a.points].reverse() }, from.label, c.name);
          leg1.transition = transition(c.id, A, B);
          const leg2 = makeLeg(FLOORS[B].id, pathB(c.id), `${FLOORS[B].name} ${c.name}`, destLabel);
          return [leg1, leg2];
        },
      };
    }
  }

  // 2) 중간 층에서 계단을 갈아타는 경우 (직통 계단이 없을 때만)
  if (!best) {
    const step = B > A ? 1 : -1;
    for (let F = A + step; F !== B; F += step) {
      const c1s = coresA.filter((c) => spans(c.id, A, F));
      const c2s = coresB.filter((c) => spans(c.id, F, B));
      if (!c1s.length || !c2s.length) continue;
      const floorF = FLOORS[F];
      for (const c1 of c1s) {
        const s1 = CORE_SPACES[c1.id][floorF.id];
        const fl = flood(floorF, epOfSpace(s1), c2s.map((c) => epOfSpace(CORE_SPACES[c.id][floorF.id])));
        c2s.forEach((c2, k) => {
          if (c2.id === c1.id) return;
          const cost = dA(c1.id) + fl.distances[k] + dB(c2.id) + vertical(A, B);
          if (cost < (best?.cost ?? Infinity)) {
            best = {
              cost,
              legs: () => {
                const a = pathA(c1.id);
                const leg1 = makeLeg(FLOORS[A].id, { ok: a.ok, points: [...a.points].reverse() }, from.label, c1.name);
                leg1.transition = transition(c1.id, A, F);
                const m = fl.pathFromTarget(k);
                const leg2 = makeLeg(floorF.id, { ok: m.ok, points: [...m.points].reverse() }, `${floorF.name} ${c1.name}`, c2.name);
                leg2.transition = transition(c2.id, F, B);
                const leg3 = makeLeg(FLOORS[B].id, pathB(c2.id), `${FLOORS[B].name} ${c2.name}`, destLabel);
                return [leg1, leg2, leg3];
              },
            };
          }
        });
      }
    }
  }

  if (!best) {
    // 연결 계단 데이터가 없는 경우: 목적지 층에서 직선 안내
    const leg = makeLeg(to.floorId, { ok: false, points: [to.anchor, to.anchor] }, from.label, destLabel);
    return { id, from, to, legs: [leg], totalLength: 0 };
  }
  const legs = (best as { legs: () => RouteLeg[] }).legs();
  return { id, from, to, legs, totalLength: legs.reduce((s, l) => s + l.length, 0) };
}

/** 목록 정렬용 대략 거리 (직선 + 층 차이) */
export function roughDistance(from: NavLocation, s: Space): number {
  const df = Math.abs(floorIndex(from.floorId) - floorIndex(s.floorId));
  return Math.hypot(from.point.x - s.anchor.x, from.point.y - s.anchor.y) + df * 700;
}
