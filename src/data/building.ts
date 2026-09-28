// floorData.json(도면 추출) + overrides.ts(수동 메타) → 런타임 모델
import raw from './floorData.json';
import type { Floor, FloorDataFile, NavLocation, RawSpace, Space, StairCore } from '../types';
import { dist, pointInShape, shapeBBox } from '../lib/geometry';
import { DEFAULT_START_ID, ENTRANCE_NAMES, SPACE_PATCHES, STAIR_CORES, START_PRESETS, type SpacePatch } from './overrides';

const data = raw as unknown as FloorDataFile;

export const BUILDING = data.building;
export const VIEWBOX = data.viewBox;

/** 동(棟) 표시 이름 — '5남관' 이 아니라 '5남' 처럼 짧게 표기 */
const WING_NAME: Record<string, string> = { '5북': '5북', '5서': '5서', '5남': '5남', '5동': '5동' };
/** 도면에서 온 문구의 '5남관' → '5남' ('5호관' 은 그대로) */
const shortWing = (t: string) => t.replace(/(5[북서남동])관/g, '$1');

/** 좌표로 대략적인 동(棟) 추정 — 계단·승강기처럼 도면에 소속이 없는 공간용 */
function inferWing(x: number, y: number): string {
  if (x < 262) return '5서';
  if (y < 330) return '5북';
  if (x > 1765) return '5동';
  if (y > 1185) return '5남';
  return '5남';
}

/** 같은 호수가 두 번 나올 때 구분용: 복도 바깥쪽 줄인지 안뜰쪽 줄인지 */
function rowHint(s: RawSpace, cx: number, cy: number): string {
  switch (s.wing) {
    case '5북': return cy < 234 ? '북쪽 바깥 줄' : '안뜰쪽 줄';
    case '5남': return cy > 1278 ? '남쪽 바깥 줄' : '안뜰쪽 줄';
    case '5동': return cx > 1858 ? '동쪽 바깥 줄' : '안뜰쪽 줄';
    case '5서': return cx < 167 ? '서쪽 바깥 줄' : '안뜰쪽 줄';
    default: return '';
  }
}

function anchorOf(s: RawSpace) {
  const b = shapeBBox(s.shape);
  if (s.shape.type === 'poly' && s.label) return { x: s.label.x, y: s.label.y };
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** SPACE_PATCHES 적용 → 패치된 원본 공간 목록 + (인덱스 → 패치) */
function applyPatches(rf: FloorDataFile['floors'][number]) {
  const spaces = rf.spaces.map((s) => ({ ...s }));
  const byIndex = new Map<number, SpacePatch>();
  for (const p of SPACE_PATCHES) {
    if (p.floorId !== rf.id) continue;
    let idx = -1;
    spaces.forEach((s, i) => {
      if (pointInShape(p.at[0], p.at[1], s.shape)) idx = i; // 가장 안쪽(나중에 그려진) 공간
    });
    if (idx < 0) {
      console.warn(`[building] 패치 대상 없음: ${p.floorId} (${p.at.join(', ')})`);
      continue;
    }
    const s: RawSpace = { ...spaces[idx] };
    const b = shapeBBox(s.shape);
    if (p.kind) s.kind = p.kind;
    if (p.door) s.door = true;
    if (p.plain) s.plain = true;
    if (p.kind === 'blank') {
      delete s.label;
      delete s.exit;
      delete s.name;
    }
    if (p.label) {
      s.label = { text: p.label, x: b.x + b.w / 2, y: b.y + b.h * 0.23, size: 12 };
      if (s.exit) s.exit = { ...s.exit, y: b.y + b.h * 0.56 };
    }
    spaces[idx] = s;
    byIndex.set(idx, p);
  }
  // 삭제 패치: 인덱스가 바뀌므로 목록과 패치 맵을 새로 만든다
  const kept: RawSpace[] = [];
  const keptPatches = new Map<number, SpacePatch>();
  spaces.forEach((s, i) => {
    const p = byIndex.get(i);
    if (p?.remove) return;
    if (p) keptPatches.set(kept.length, p);
    kept.push(s);
  });
  return { spaces: kept, byIndex: keptPatches };
}

function buildFloor(rf: FloorDataFile['floors'][number]): Floor {
  const counts = new Map<string, number>();
  for (const s of rf.spaces) if (s.wing && s.number) counts.set(`${s.wing} ${s.number}`, (counts.get(`${s.wing} ${s.number}`) ?? 0) + 1);
  const patched = applyPatches(rf);
  const text = {
    wingLabels: rf.wingLabels.map((w) => ({ ...w, text: shortWing(w.text) })),
    note: shortWing(rf.note),
    excluded: rf.excluded && {
      ...rf.excluded,
      title: rf.excluded.title && { ...rf.excluded.title, text: shortWing(rf.excluded.title.text) },
      sub: rf.excluded.sub && { ...rf.excluded.sub, text: shortWing(rf.excluded.sub.text) },
    },
  };

  const spaces: Space[] = patched.spaces.map((s, index) => {
    const patch = patched.byIndex.get(index);
    const built = buildSpace(s, index);
    if (!patch) return built;
    return {
      ...built,
      title: patch.title ?? built.title,
      subtitle: patch.subtitle ?? built.subtitle,
      tags: [...new Set([...built.tags, ...(patch.tags ?? [])])],
    };
  });
  return { ...rf, ...text, shortName: rf.id, spaces };

  function buildSpace(raw: RawSpace, index: number): Space {
    const s: RawSpace = raw.name ? { ...raw, name: shortWing(raw.name) } : raw;
    const bbox = shapeBBox(s.shape);
    const anchor = anchorOf(s);
    const wing = s.wing ?? inferWing(anchor.x, anchor.y);
    const wingName = WING_NAME[wing] ?? wing;
    const base = { ...s, floorId: rf.id, index, wingName, anchor, bbox };
    const floorName = rf.name;

    switch (s.kind) {
      case 'room':
      case 'restroom': {
        const numeric = /^[0-9]/.test(s.number ?? '');
        const title = numeric ? `${wingName} ${s.number}` : `${wingName} ${s.name ?? s.number ?? ''}`.trim();
        const tags: string[] = [];
        let subtitle = numeric ? s.name : undefined;
        if (s.kind === 'restroom') {
          const sub = s.sub?.text ?? '';
          const gender = /남/.test(sub) ? '남' : /여/.test(sub) ? '여' : '';
          subtitle = gender ? `${gender}자 화장실` : '화장실';
          tags.push('화장실', 'WC');
          if (gender) tags.push(`${gender}자화장실`);
        }
        if ((counts.get(`${s.wing} ${s.number}`) ?? 0) > 1) {
          const hint = rowHint(s, anchor.x, anchor.y);
          subtitle = subtitle ? `${subtitle} · ${hint}` : hint;
        }
        return { ...base, title, subtitle, tags, searchable: true };
      }
      case 'entrance': {
        const meta = ENTRANCE_NAMES[s.ref ?? ''];
        return {
          ...base,
          title: meta?.title ?? s.name ?? '출입구',
          subtitle: meta?.subtitle ?? `${floorName} 출입구`,
          tags: ['출입구', ...(meta?.tags ?? []), ...(s.exit ? ['비상구'] : [])],
          searchable: true,
        };
      }
      case 'stairs': {
        const tags = ['계단', ...(s.exit ? ['비상구', '비상계단'] : []), ...(s.ref ? [s.ref] : []), ...(s.door ? ['출입구', '출입문'] : [])];
        const parts = [wingName];
        if (s.ref) parts.push(`도면 표기 ${s.ref}`);
        if (s.exit) parts.push('비상구');
        if (s.door) parts.push('출입문 겸용');
        return { ...base, title: s.central ? (s.name ?? '중앙계단') : '계단', subtitle: parts.join(' · '), tags, searchable: true };
      }
      case 'elevator':
        return { ...base, title: '승강기', subtitle: `${wingName} · 엘리베이터`, tags: ['승강기', '엘리베이터'], searchable: true };
      default:
        return { ...base, title: s.name ?? '미표기 공간', tags: [], searchable: false };
    }
  }
}

export const FLOORS: Floor[] = data.floors.map(buildFloor).sort((a, b) => a.level - b.level);
export const FLOOR_BY_ID: Record<string, Floor> = Object.fromEntries(FLOORS.map((f) => [f.id, f]));
export const floorIndex = (floorId: string) => FLOORS.findIndex((f) => f.id === floorId);

export const SPACE_BY_ID: Record<string, Space> = {};
for (const f of FLOORS) for (const s of f.spaces) SPACE_BY_ID[s.id] = s;

// ---------- 층간 계단 연결 ----------
export const CORES: StairCore[] = STAIR_CORES;
/** coreId → floorId → 계단 공간 */
export const CORE_SPACES: Record<string, Record<string, Space>> = {};

for (const core of CORES) {
  CORE_SPACES[core.id] = {};
  for (const [floorId, [x, y]] of Object.entries(core.at)) {
    const floor = FLOOR_BY_ID[floorId];
    if (!floor) continue;
    const stairs = floor.spaces.filter((s) => s.kind === 'stairs');
    let hit = stairs.find((s) => pointInShape(x, y, s.shape));
    if (!hit) {
      hit = stairs.reduce<Space | undefined>((best, s) => (!best || dist(s.anchor, { x, y }) < dist(best.anchor, { x, y }) ? s : best), undefined);
      if (hit && dist(hit.anchor, { x, y }) > 140) hit = undefined;
    }
    if (!hit) {
      console.warn(`[building] 계단 ${core.id} 를 ${floorId} 에서 찾지 못했습니다`);
      continue;
    }
    hit.coreId = core.id;
    hit.title = core.name;
    CORE_SPACES[core.id][floorId] = hit;
  }
}

export const coreName = (coreId: string) => CORES.find((c) => c.id === coreId)?.name ?? '계단';

// ---------- 출발 위치 ----------
export function presetLocation(id: string): NavLocation {
  const p = START_PRESETS.find((s) => s.id === id) ?? START_PRESETS[0];
  const floor = FLOOR_BY_ID[p.floorId];
  const space = floor.spaces.find((s) => pointInShape(p.at[0], p.at[1], s.shape));
  return { floorId: p.floorId, point: { x: p.at[0], y: p.at[1] }, label: p.label, spaceId: space?.id };
}

export const DEFAULT_START: NavLocation = presetLocation(DEFAULT_START_ID);

export function locationOfSpace(space: Space): NavLocation {
  const floor = FLOOR_BY_ID[space.floorId];
  return { floorId: space.floorId, point: { ...space.anchor }, label: `${floor.name} ${space.title}`, spaceId: space.id };
}

/** 지도 위 임의 지점 → 위치 (그 점을 포함하는 가장 안쪽 공간을 함께 기록) */
export function locationAt(floorId: string, x: number, y: number): NavLocation {
  const floor = FLOOR_BY_ID[floorId];
  let space: Space | undefined;
  for (const s of floor.spaces) if (pointInShape(x, y, s.shape)) space = s; // 뒤에 그려진(안쪽) 공간 우선
  const label = space?.searchable ? `${floor.name} ${space.title}` : `${floor.name} 지정 위치`;
  return { floorId, point: { x, y }, label, spaceId: space?.id };
}

export interface EntranceChoice {
  id: string;
  label: string; // '남측현관' (층 표기 없이)
  location: NavLocation;
  space: Space;
}

/** 현재 위치 초기화 때 고를 수 있는 출입구 (START_PRESETS 기준) */
export const ENTRANCE_CHOICES: EntranceChoice[] = START_PRESETS.flatMap((p) => {
  const location = presetLocation(p.id);
  const space = location.spaceId ? SPACE_BY_ID[location.spaceId] : undefined;
  const label = p.label.replace(/^1층\s*/, '');
  return space ? [{ id: p.id, label, location, space }] : [];
});
export const ENTRANCE_FLOOR_ID = START_PRESETS[0].floorId;

export const spaceAt = (floorId: string, x: number, y: number): Space | undefined => {
  let hit: Space | undefined;
  for (const s of FLOOR_BY_ID[floorId].spaces) if (pointInShape(x, y, s.shape)) hit = s;
  return hit;
};
