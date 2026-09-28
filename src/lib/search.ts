// 방 번호 · 동 · 층 · 용도 · 초성 검색
import type { NavLocation, Space } from '../types';
import { FLOORS, FLOOR_BY_ID } from '../data/building';
import { QUERY_SYNONYMS } from '../data/overrides';
import { roughDistance } from './routing';

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

export function chosung(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code < 11172) out += CHO[Math.floor(code / 588)];
    else if (/[ㄱ-ㅎ]/.test(ch)) out += ch;
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s()·\-_.,/]/g, '');

interface Doc {
  space: Space;
  number: string;
  wingKeys: string[]; // '5남', '5남관', '남관' — 표기는 '5남' 이지만 '5남관' 으로도 검색 가능
  titleN: string;
  nameN: string;
  nameCho: string;
  tagsN: string[];
}

const DOCS: Doc[] = FLOORS.flatMap((f) =>
  f.spaces
    .filter((s) => s.searchable)
    .map((s) => {
      const w = s.wing ?? s.wingName?.replace('관', '') ?? '';
      return {
        space: s,
        number: norm(s.number ?? s.ref ?? ''),
        wingKeys: [w, `${w}관`, `${w.slice(1)}관`].map(norm),
        titleN: norm(s.title),
        nameN: norm([s.name, s.subtitle].filter(Boolean).join(' ')),
        nameCho: chosung([s.title, s.name].filter(Boolean).join('')),
        tagsN: s.tags.map(norm),
      };
    }),
);

export interface ParsedQuery {
  floorId?: string;
  wing?: string; // '5남'
  tokens: string[];
}

export function parseQuery(q: string): ParsedQuery {
  let rest = ` ${q.trim()} `;
  let floorId: string | undefined;
  let wing: string | undefined;
  rest = rest.replace(/5\s*호\s*관/g, ' ');
  const fm = rest.match(/(지하\s*1?\s*층?|\bb\s*1\b|(?<![0-9a-z])([1-4])\s*(층|f\b))/i);
  if (fm) {
    floorId = fm[2] ? `${fm[2]}F` : 'B1';
    rest = rest.replace(fm[0], ' ');
  }
  const wm = rest.match(/5\s*(북|서|남|동)\s*관?|(북|서|남|동)\s*관(?![가-힣])/);
  if (wm) {
    wing = `5${wm[1] ?? wm[2]}`;
    rest = rest.replace(wm[0], ' ');
  }
  // "5남354" 처럼 붙여 쓴 경우는 위에서 분리됨. 숫자+문자 경계("354호")의 '호' 제거
  const tokens = rest
    .split(/\s+/)
    .map((t) => t.replace(/^(\d+[a-z]?)호$/i, '$1'))
    .map(norm)
    .filter(Boolean);
  return { floorId, wing, tokens };
}

function tokenScore(d: Doc, t: string): number {
  let s = 0;
  const syn = QUERY_SYNONYMS[t];
  if (syn && d.tagsN.includes(norm(syn))) s = Math.max(s, 92);
  if (d.number) {
    if (d.number === t) s = Math.max(s, 100);
    else if (/^\d/.test(t) && d.number.startsWith(t)) s = Math.max(s, 72 - (d.number.length - t.length) * 4);
  }
  if (d.titleN === t) s = Math.max(s, 96);
  else if (d.titleN.startsWith(t)) s = Math.max(s, 78);
  else if (t.length >= 2 && d.titleN.includes(t)) s = Math.max(s, 58);
  if (d.nameN) {
    if (d.nameN === t) s = Math.max(s, 95);
    else if (d.nameN.startsWith(t)) s = Math.max(s, 82);
    else if (d.nameN.includes(t)) s = Math.max(s, 64);
  }
  for (const tag of d.tagsN) {
    if (tag === t) s = Math.max(s, 90);
    else if (t.length >= 2 && tag.startsWith(t)) s = Math.max(s, 66);
  }
  if (/^[ㄱ-ㅎ]{2,}$/.test(t) && d.nameCho.includes(t)) s = Math.max(s, 52);
  return s;
}

export interface SearchResult {
  space: Space;
  score: number;
  distance: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  /** 카테고리 검색(화장실·계단 등)이면 가까운 순으로 정렬됨 */
  byDistance: boolean;
}

const CATEGORY_TAGS = new Set(['화장실', '남자화장실', '여자화장실', '계단', '비상구', '비상계단', '출입구', '승강기', '엘리베이터', 'wc']);

export function searchSpaces(q: string, near: NavLocation, limit = 12): SearchResponse {
  const pq = parseQuery(q);
  if (!pq.tokens.length && !pq.floorId && !pq.wing) return { results: [], total: 0, byDistance: false };
  const isCategory = pq.tokens.length > 0 && pq.tokens.every((t) => CATEGORY_TAGS.has(t) || CATEGORY_TAGS.has(norm(QUERY_SYNONYMS[t] ?? '')));
  const out: SearchResult[] = [];
  for (const d of DOCS) {
    if (pq.floorId && d.space.floorId !== pq.floorId) continue;
    if (pq.wing && d.space.wing !== pq.wing && !d.wingKeys.includes(norm(pq.wing))) continue;
    let score = pq.tokens.length ? 0 : 20;
    let ok = true;
    for (const t of pq.tokens) {
      const ts = tokenScore(d, t);
      if (!ts) { ok = false; break; }
      score += ts;
    }
    if (!ok) continue;
    if (d.space.floorId === near.floorId) score += 3;
    if (d.space.kind === 'room' || d.space.kind === 'restroom') score += 1;
    out.push({ space: d.space, score, distance: roughDistance(near, d.space) });
  }
  if (isCategory) out.sort((a, b) => a.distance - b.distance || b.score - a.score);
  else
    out.sort(
      (a, b) =>
        b.score - a.score ||
        a.distance - b.distance ||
        a.space.title.localeCompare(b.space.title, 'ko', { numeric: true }),
    );
  return { results: out.slice(0, limit), total: out.length, byDistance: isCategory };
}

export const floorLabel = (floorId: string) => FLOOR_BY_ID[floorId]?.name ?? floorId;
