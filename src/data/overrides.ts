// 도면에서 자동 추출할 수 없는 수동 메타데이터.
// floorData.json 을 다시 생성해도 이 파일의 내용은 유지된다.
import type { SpaceKind, StairCore } from '../types';

/**
 * 층과 층을 잇는 계단(코어). `at` 의 좌표는 해당 층 계단 공간 내부의 한 점이며,
 * 그 점을 포함하는(또는 가장 가까운) 계단 공간이 이 코어로 연결된다.
 */
export const STAIR_CORES: StairCore[] = [
  {
    id: 'C',
    name: '중앙계단',
    at: { B1: [1600, 1130], '1F': [1435, 1140], '2F': [1430, 1140], '3F': [1430, 1140], '4F': [1392, 1140] },
  },
  {
    id: 'N1',
    name: '5북 서측 계단',
    at: { '1F': [637, 182], '2F': [631, 182], '3F': [699, 182], '4F': [714, 182] },
  },
  {
    id: 'N2',
    name: '5북 동측 계단',
    at: { '1F': [1190, 182], '2F': [1137, 182], '3F': [1237, 182], '4F': [1262, 182] },
  },
  {
    id: 'NE',
    name: '북동 비상계단',
    at: { B1: [1806, 269], '1F': [1738, 286], '2F': [1806, 282], '3F': [1806, 288], '4F': [1806, 286] },
  },
  {
    id: 'WN',
    name: '5서 북측 계단',
    at: { '1F': [243, 286], '2F': [219, 283], '3F': [219, 284], '4F': [219, 286] },
  },
  {
    id: 'WM',
    name: '5서 중앙 계단',
    at: { '1F': [205, 670], '2F': [219, 643], '3F': [219, 692], '4F': [219, 647] },
  },
  {
    id: 'WS',
    name: '5서 남측 계단',
    at: { B1: [267, 1220], '1F': [219, 1207], '2F': [219, 1222], '3F': [219, 1222], '4F': [219, 1216] },
  },
  {
    id: 'S1',
    name: '5남 서측 계단',
    at: { B1: [798, 1220], '1F': [643, 1227], '2F': [619, 1227], '3F': [622, 1227], '4F': [758, 1227] },
  },
  {
    id: 'EM',
    name: '5동 중앙 계단',
    at: { B1: [1806, 712], '1F': [1806, 738], '2F': [1806, 746], '3F': [1806, 771] },
  },
  {
    id: 'SE',
    name: '남동 비상계단',
    at: { B1: [1909, 1348], '1F': [1909, 1328], '2F': [1909, 1333], '3F': [1909, 1324], '4F': [1909, 1316] },
  },
];

/** 출입구 표시 이름 (도면 라벨 → 안내용 이름) */
export const ENTRANCE_NAMES: Record<string, { title: string; subtitle: string; tags: string[] }> = {
  남측현관: { title: '남측현관', subtitle: '5호관 정문 · 1층', tags: ['정문', '현관', '입구', '출입구'] },
  방풍실: { title: '동측 출입구', subtitle: '방풍실 · 1층', tags: ['방풍실', '입구', '출입구', '동문'] },
  북측통로: { title: '북측통로', subtitle: '건물 북쪽 외부로 나가는 통로', tags: ['출입구', '통로', '비상구'] },
  남측통로: { title: '남측통로', subtitle: '안뜰(주차 구역)으로 나가는 통로', tags: ['출입구', '통로', '안뜰', '주차장'] },
};

/**
 * 도면 추출 결과를 바로잡는 패치. `at` 좌표를 포함하는 공간(가장 안쪽)에 적용된다.
 * SVG 를 다시 추출해도 유지되도록 id 대신 좌표로 지정한다.
 */
export interface SpacePatch {
  floorId: string;
  at: [number, number];
  remove?: boolean; // 도면에서 공간 자체를 삭제
  kind?: SpaceKind; // 공간 종류 변경
  door?: boolean; // 계단 역할은 유지하면서 출입문으로도 사용
  plain?: boolean; // 계단 무늬 없이 그림 (계단이 아닌 출입문)
  label?: string; // 도면에 적을 짧은 라벨
  title?: string;
  subtitle?: string;
  tags?: string[];
  why: string;
}

export const SPACE_PATCHES: SpacePatch[] = [
  {
    floorId: 'B1',
    at: [1600, 910],
    remove: true,
    why: '지하 1층 중앙계단 위의 5남 125 는 지하층에 없는 공간 — 삭제',
  },
  {
    floorId: '1F',
    at: [1906, 182],
    kind: 'entrance',
    plain: true,
    label: '출입문',
    title: '북동 출입구',
    subtitle: '101A 옆 모서리 출입문 · 1층',
    tags: ['출입문', '비상구'],
    why: '101A와 116B 사이 모서리의 EXIT 는 계단이 아니라 출입문',
  },
  {
    floorId: '1F',
    at: [1909, 243],
    kind: 'blank',
    why: '북동 출입구와 116B 사이 칸은 승강기가 아니라 빈 공간',
  },
  {
    floorId: '1F',
    at: [494.75, 1330],
    kind: 'entrance',
    plain: true,
    label: '출입문',
    title: '남서 출입구',
    subtitle: '132 · 130 사이 출입문 · 1층',
    tags: ['출입문', '비상구'],
    why: '132와 130 사이의 EXIT 는 계단이 아니라 출입문',
  },
  {
    floorId: '1F',
    at: [1909, 1328],
    door: true,
    tags: ['남동출입구'],
    why: '101 · 100 아래 모서리의 EXIT 는 출입문이면서 계단(남동 비상계단)',
  },
];

/** 출발 위치 프리셋 */
export const START_PRESETS = [
  { id: 'main', label: '1층 남측현관', floorId: '1F', at: [1236.8, 1330] as [number, number] },
  { id: 'east', label: '1층 동측 출입구', floorId: '1F', at: [1909.5, 804] as [number, number] },
  { id: 'north', label: '1층 북측통로', floorId: '1F', at: [697.85, 182.5] as [number, number] },
  { id: 'court', label: '1층 남측통로', floorId: '1F', at: [814.3, 286.5] as [number, number] },
  { id: 'southwest', label: '1층 남서 출입구', floorId: '1F', at: [494.75, 1330] as [number, number] },
  { id: 'northeast', label: '1층 북동 출입구', floorId: '1F', at: [1906, 182] as [number, number] },
  { id: 'southeast', label: '1층 남동 출입구', floorId: '1F', at: [1909.5, 1328] as [number, number] },
];
export const DEFAULT_START_ID = 'main';

/** 검색창이 비어 있을 때 보여 줄 추천 검색어 */
export const SUGGESTED_QUERIES: { label: string; query: string; icon: string }[] = [
  { label: '화장실', query: '화장실', icon: 'restroom' },
  { label: '중앙계단', query: '중앙계단', icon: 'stairs' },
  { label: '출입구', query: '출입구', icon: 'door' },
  { label: '학생회실', query: '학생회실', icon: 'room' },
  { label: '디브리핑', query: '디브리핑', icon: 'room' },
  { label: '연극영화학과', query: '연극영화학과', icon: 'room' },
  { label: 'PC실습실', query: 'PC실습실', icon: 'room' },
  { label: 'GDSC', query: 'GDSC', icon: 'room' },
];

/** 추천 목적지 (빠른 이동) — 공간 ID */
export const FEATURED_SPACES = ['3F-5남-354', '2F-5남-240', 'B1-5동-021', '1F-5서-160'];

/** 검색 동의어: 검색어 → 태그 */
export const QUERY_SYNONYMS: Record<string, string> = {
  화장실: '화장실',
  wc: '화장실',
  toilet: '화장실',
  restroom: '화장실',
  남자화장실: '남자화장실',
  여자화장실: '여자화장실',
  계단: '계단',
  stairs: '계단',
  비상구: '비상구',
  exit: '비상구',
  출구: '출입구',
  입구: '출입구',
  출입구: '출입구',
  엘리베이터: '승강기',
  elevator: '승강기',
  승강기: '승강기',
  ev: '승강기',
};

/** 도면 1단위 ≈ 0.09m (복도 폭 약 28단위 ≈ 2.5m 기준 추정) */
export const METERS_PER_UNIT = 0.09;
/** 한 층 오르내리는 비용(월드 단위, 경로 비교용) */
export const FLOOR_CHANGE_COST = 260;
