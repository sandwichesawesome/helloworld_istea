// 건물 바깥(주변) 배치 — 사용자 스케치를 도면 좌표(2000×1523 기준, 북쪽이 위)로 옮긴 근사치.
// 스케치의 1층 평면도 이미지(960px 폭)가 도면 전체(2000단위)에 대응하도록 약 2.08배 환산했다.
// 층 ID별로 정의하며, 해당 층을 볼 때만 평면도 아래에 그려진다.
import type { RectShape } from '../types';

export type SiteFeatureKind = 'road' | 'building' | 'bench' | 'field';

export interface SiteFeature {
  id: string;
  kind: SiteFeatureKind;
  shape: RectShape;
  /** 지도에 적을 이름 (도로는 이름 없음) */
  label?: string;
  /** 여러 줄 이름 표시용 */
  lines?: string[];
}

export interface SiteLayer {
  features: SiteFeature[];
  /** 이 층에서 '전체 보기' 할 때 맞출 영역 (건물 + 주변) */
  bounds: { x: number; y: number; w: number; h: number };
  note: string;
}

const rect = (x: number, y: number, w: number, h: number): RectShape => ({ type: 'rect', x, y, w, h });

const BENCH = { w: 130, h: 62 };
/** 같은 x 에 세로로 줄 맞춘 벤치들 (ys: 각 벤치의 위쪽 y) */
const benchColumn = (x: number, ys: number[]): SiteFeature[] =>
  ys.map((y, i) => ({ id: `bench-${i + 1}`, kind: 'bench', shape: rect(x, y, BENCH.w, BENCH.h) }));

export const SITE: Record<string, SiteLayer> = {
  '1F': {
    features: [
      // 북쪽 차도 (이름 표기 없음) — 스케치상 5북 중간부터 동쪽으로 이어짐
      { id: 'road-north', kind: 'road', shape: rect(1180, -575, 2140, 285) },
      // 5호관(남쪽)과 운동장 · 정석학술정보관 사이 차도 — 북쪽 차도와 같은 폭
      { id: 'road-south', kind: 'road', shape: rect(-40, 1418, 2640, 285) },
      // 5동 바로 오른쪽 벤치 4개 — 한 줄(같은 x)로 정렬, 동측 출입구(방풍실) 앞은 비워 둠
      ...benchColumn(2070, [259, 449, 899, 1089]),
      { id: 'bldg-60th', kind: 'building', shape: rect(2590, 40, 640, 1440), label: '60주년 기념관', lines: ['60주년', '기념관'] },
      { id: 'field', kind: 'field', shape: rect(40, 1750, 1240, 440), label: '운동장' },
      { id: 'bldg-library', kind: 'building', shape: rect(1580, 1762, 905, 1042), label: '정석학술정보관' },
    ],
    bounds: { x: -40, y: -600, w: 3300, h: 3430 },
    note: '주변 건물 · 도로 · 벤치 위치는 스케치를 옮긴 근사 배치입니다.',
  },
};
