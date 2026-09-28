export interface Point {
  x: number;
  y: number;
}

export interface RectShape {
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PolyShape {
  type: 'poly';
  points: [number, number][];
}

export type Shape = RectShape | PolyShape;

export interface TextLabel {
  text: string;
  x: number;
  y: number;
  size: number;
}

export type SpaceKind =
  | 'room'
  | 'restroom'
  | 'stairs'
  | 'entrance'
  | 'elevator'
  | 'blank'
  | 'unknown'
  | 'void';

/** floorData.json 에 저장되는 원본(도면에서 추출한) 공간 레코드 */
export interface RawSpace {
  id: string;
  kind: SpaceKind;
  wing?: string; // '5북' | '5서' | '5남' | '5동'
  number?: string; // '354', '205E' …
  ref?: string; // 계단/출입구에 붙은 도면 표기 (예: '134', '북측통로')
  name?: string; // 용도 (예: '디브리핑-1')
  note?: string;
  shape: Shape;
  label?: TextLabel;
  sub?: TextLabel;
  dot?: Point;
  exit?: RectShape; // EXIT 배지 위치
  heavy?: boolean; // 굵은 벽선(안뜰 돌출부)
  door?: boolean; // 계단이면서 출입문 (계단 역할 유지 + 출입구로 선택 가능)
  plain?: boolean; // 계단 무늬 없이 그리는 출입문
  central?: { band: RectShape | null; inner: RectShape | null };
}

export interface RawFloor {
  id: string;
  level: number;
  name: string;
  title: string;
  outline: [number, number][];
  excluded: {
    points: [number, number][];
    box?: RectShape;
    title?: TextLabel;
    sub?: TextLabel;
  } | null;
  courtyard: RectShape | null;
  courtyardLabel: TextLabel | null;
  wingLabels: { text: string; x: number; y: number }[];
  compass: { x: number; y: number; r: number } | null;
  note: string;
  spaces: RawSpace[];
}

export interface FloorDataFile {
  building: { id: string; name: string; source: string };
  viewBox: { w: number; h: number };
  floors: RawFloor[];
}

/** 런타임에서 사용하는 공간 (원본 + 파생 정보) */
export interface Space extends RawSpace {
  floorId: string;
  index: number; // floor.spaces 내 인덱스
  wingName?: string; // '5남' (표시용 동 이름)
  title: string; // 화면 표시 이름: '5남 354', '중앙계단'
  subtitle?: string; // 용도 등 보조 설명
  anchor: Point; // 화살표가 가리킬 중심 좌표
  bbox: { x: number; y: number; w: number; h: number };
  tags: string[];
  searchable: boolean;
  coreId?: string; // 층간 연결 계단 ID
}

export interface Floor extends Omit<RawFloor, 'spaces'> {
  shortName: string; // 'B1', '1F'
  spaces: Space[];
}

export interface StairCore {
  id: string;
  name: string;
  /** 층 ID → 그 층에서 이 계단에 속하는 계단 공간 안의 한 점 */
  at: Record<string, [number, number]>;
}

/** 출발 위치 */
export interface NavLocation {
  floorId: string;
  point: Point;
  label: string;
  spaceId?: string;
}

export interface LegTransition {
  coreId: string;
  coreName: string;
  toFloorId: string;
  direction: 'up' | 'down';
  floors: number;
}

export interface RouteLeg {
  floorId: string;
  points: Point[]; // 곡선 보정된 경로 (월드 좌표)
  length: number; // 월드 단위
  startLabel: string;
  endLabel: string;
  transition?: LegTransition; // 계단에서 끝나는 구간
  approximate?: boolean; // 경로 탐색 실패 → 직선 안내
}

export interface Route {
  id: number;
  from: NavLocation;
  to: Space;
  legs: RouteLeg[];
  totalLength: number;
}
