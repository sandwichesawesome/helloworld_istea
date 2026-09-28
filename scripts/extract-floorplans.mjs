// 피난계획도 기반 SVG 평면도(floorplans/*.svg)를 읽어 src/data/floorData.json 으로 변환한다.
//   node scripts/extract-floorplans.mjs
// SVG 구조(g.rm = 호실, url(#stairs) = 계단, X 표시 rect = 승강기 …)는 5호관 도면 규칙을 따른다.
// 수동 보정(계단 층간 연결, 출입구 이름, 추천 검색어)은 src/data/overrides.ts 에 둔다.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'floorplans');
const outFile = join(root, 'src', 'data', 'floorData.json');

const FLOOR_META = {
  B1: { level: -1, name: '지하 1층' },
  '1F': { level: 1, name: '1층' },
  '2F': { level: 2, name: '2층' },
  '3F': { level: 3, name: '3층' },
  '4F': { level: 4, name: '4층' },
};

// ---------- 아주 작은 XML 파서 (도면 SVG 전용) ----------
const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

function parseXml(src) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[0].startsWith('<!--')) continue;
    if (m[5] !== undefined) {
      if (m[5].trim()) stack.at(-1).children.push({ tag: '#text', text: decode(m[5]) });
      continue;
    }
    const [, close, tag, attrStr, selfClose] = m;
    if (close) {
      stack.pop();
      continue;
    }
    const attrs = {};
    for (const a of attrStr.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = decode(a[2]);
    const node = { tag, attrs, children: [] };
    stack.at(-1).children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}

// ---------- 헬퍼 ----------
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const textOf = (n) => n.children.filter((c) => c.tag === '#text').map((c) => c.text).join('').trim();
const kids = (n, tag) => n.children.filter((c) => c.tag === tag);
const kid = (n, tag) => n.children.find((c) => c.tag === tag);
const rectOf = (n) => ({ type: 'rect', x: r2(n.attrs.x ?? 0), y: r2(n.attrs.y ?? 0), w: r2(n.attrs.width), h: r2(n.attrs.height) });
const polyOf = (n) => ({
  type: 'poly',
  points: n.attrs.points.trim().split(/\s+/).map((p) => p.split(',').map(r2)),
});
const labelOf = (t) => ({ text: textOf(t), x: r2(t.attrs.x), y: r2(t.attrs.y), size: r2(t.attrs['font-size'] ?? 17) });
const isX = (n) => n?.tag === 'path' && /^M[\d.\s]+L[\d.\s]+M[\d.\s]+L[\d.\s]+$/.test(n.attrs.d ?? '');
const isExitBadge = (n) =>
  n?.tag === 'g' && kid(n, 'rect')?.attrs.fill === 'var(--exit)' && kids(n, 'text').some((t) => textOf(t) === 'EXIT');
const badgeOf = (g) => rectOf(kid(g, 'rect'));

function parseTitle(title) {
  // "5남관 354 — 디브리핑-1" → { wing: '5남', number: '354', name: '디브리핑-1' }
  const [head, ...rest] = title.split(' — ');
  const m = head.match(/^(5[북서남동])관\s+(.+)$/);
  return { wing: m?.[1], number: m?.[2]?.trim(), name: rest.join(' — ').trim() || undefined };
}

function floorIdFromTitle(t) {
  if (/지하\s*1층/.test(t)) return 'B1';
  const m = t.match(/(\d)층/);
  return m ? `${m[1]}F` : null;
}

// ---------- 변환 ----------
function extractFloor(svgSrc, fileName) {
  const svg = parseXml(svgSrc).children.find((c) => c.tag === 'svg');
  const nodes = svg.children;
  const floor = {
    id: null,
    level: 0,
    name: '',
    title: '',
    outline: null,
    excluded: null,
    courtyard: null,
    courtyardLabel: null,
    wingLabels: [],
    compass: null,
    note: '',
    spaces: [],
  };
  const usedIds = new Set();
  const counters = {};
  const addSpace = (s) => {
    let base;
    if (s.wing && s.number) base = `${floor.id}-${s.wing}-${s.number}`;
    else {
      counters[s.kind] = (counters[s.kind] ?? 0) + 1;
      base = `${floor.id}-${s.kind}-${counters[s.kind]}`;
    }
    let id = base;
    for (let i = 2; usedIds.has(id); i++) id = `${base}~${i}`;
    usedIds.add(id);
    floor.spaces.push({ id, ...s });
  };

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const a = n.attrs;
    if (n.tag === 'text') {
      const size = Number(a['font-size']);
      const y = Number(a.y);
      const t = textOf(n);
      if (size === 44) {
        floor.title = t;
        floor.id = floorIdFromTitle(t) ?? fileName;
        Object.assign(floor, FLOOR_META[floor.id] ?? {});
      } else if (size === 38) floor.wingLabels.push({ text: t, x: r2(a.x), y: r2(a.y) });
      else if (size === 34) floor.courtyardLabel = labelOf(n);
      else if (y > 1460 && size < 17) floor.note = t;
      else if (size === 24 && floor.excluded) floor.excluded.title = labelOf(n);
      else if (size === 15 && floor.excluded && y < 1400) floor.excluded.sub = labelOf(n);
      continue;
    }
    if (n.tag === 'polygon') {
      if (a.fill === 'var(--cor)') floor.outline = polyOf(n).points;
      else if (a.fill === 'url(#unknown)') floor.excluded = { points: polyOf(n).points };
      continue;
    }
    if (n.tag === 'rect') {
      const r = rectOf(n);
      if (r.y >= 1400 || a.fill === 'var(--bg)') continue; // 범례 · 배경
      if (a.fill === 'var(--paper)') {
        if (floor.excluded && a.rx === '8') floor.excluded.box = r;
        continue;
      }
      if (a.fill === 'var(--court)') floor.courtyard = r;
      else if (a.fill === 'url(#stairs)') {
        const exit = isExitBadge(nodes[i + 1]) ? badgeOf(nodes[++i]) : undefined;
        addSpace({ kind: 'stairs', shape: r, exit });
      } else if (a.fill === 'var(--room)') {
        if (isX(nodes[i + 1])) {
          i++;
          addSpace({ kind: 'elevator', shape: r, name: '승강기' });
        } else addSpace({ kind: 'blank', shape: r });
      } else if (a.fill === 'url(#unknown)') {
        const texts = [];
        while (nodes[i + 1] && (nodes[i + 1].tag === 'text' || (nodes[i + 1].tag === 'rect' && nodes[i + 1].attrs.opacity))) {
          i++;
          if (nodes[i].tag === 'text') texts.push(textOf(nodes[i]));
        }
        addSpace({ kind: 'unknown', shape: r, name: texts[0] ?? '사진 없음', note: texts[1] });
      } else if (a.fill === 'url(#void)') {
        if (nodes[i + 1]?.tag === 'text') i++;
        addSpace({ kind: 'void', shape: r, name: 'OPEN' });
      } else if (a.fill === 'url(#grid)') {
        // 중앙계단 블록: 격자 프레임 → 라벨 띠 → 라벨 → 계단참(stairs) → EXIT
        const central = { band: null, inner: null };
        let label;
        let exit;
        while (nodes[i + 1]) {
          const nx = nodes[i + 1];
          if (nx.tag === 'rect' && nx.attrs.fill === 'var(--room)') central.band = rectOf(nx);
          else if (nx.tag === 'text') label = labelOf(nx);
          else if (nx.tag === 'rect' && nx.attrs.fill === 'url(#stairs)') central.inner = rectOf(nx);
          else if (isExitBadge(nx)) exit = badgeOf(nx);
          else break;
          i++;
        }
        addSpace({ kind: 'stairs', shape: r, label, exit, central, name: label?.text });
      }
      continue;
    }
    if (n.tag === 'g') {
      const cls = a.class ?? '';
      const titleNode = kid(n, 'title');
      const title = titleNode ? textOf(titleNode) : '';
      const shapeNode = kid(n, 'rect') ?? kid(n, 'polygon');
      if (cls.split(' ').includes('rm')) {
        let wing, number, name;
        const t = parseTitle(title);
        if (a['data-k']) [wing, number] = a['data-k'].split(' ');
        else ({ wing, number } = t);
        name = t.name;
        const texts = kids(n, 'text');
        const label = texts[0] ? labelOf(texts[0]) : undefined;
        const sub = texts[1] ? labelOf(texts[1]) : undefined;
        const dotNode = kid(n, 'circle');
        const shape = shapeNode.tag === 'rect' ? rectOf(shapeNode) : polyOf(shapeNode);
        const isRestroom = /WC/.test(sub?.text ?? '');
        if (!/^[0-9]/.test(number ?? '')) {
          // "옥상" 같은 비번호 공간
          name = name ?? number;
        }
        addSpace({
          kind: isRestroom ? 'restroom' : 'room',
          wing,
          number,
          name,
          shape,
          label,
          sub,
          dot: dotNode ? { x: r2(dotNode.attrs.cx), y: r2(dotNode.attrs.cy) } : undefined,
          heavy: shapeNode.attrs.stroke === 'var(--wall)' || undefined,
        });
      } else if (shapeNode?.attrs.fill === 'url(#stairs)') {
        const t = parseTitle(title);
        const texts = kids(n, 'text');
        const label = texts[0] ? labelOf(texts[0]) : undefined;
        const exitG = n.children.find(isExitBadge);
        const isEntrance = /현관|방풍실|통로/.test(label?.text ?? '');
        addSpace({
          kind: isEntrance ? 'entrance' : 'stairs',
          wing: t.wing,
          ref: t.number,
          name: t.name ?? (isEntrance ? t.number : undefined),
          shape: rectOf(shapeNode),
          label,
          exit: exitG ? badgeOf(exitG) : undefined,
        });
      } else if (shapeNode?.attrs.fill === 'url(#unknown)') {
        const t = parseTitle(title);
        const texts = kids(n, 'text');
        addSpace({ kind: 'unknown', wing: t.wing, shape: rectOf(shapeNode), name: texts[0] ? textOf(texts[0]) : t.number });
      } else if (kid(n, 'circle') && kids(n, 'text').some((t) => textOf(t) === 'N')) {
        const c = kid(n, 'circle');
        floor.compass = { x: r2(c.attrs.cx), y: r2(c.attrs.cy), r: r2(c.attrs.r) };
      }
    }
  }
  return floor;
}

const files = readdirSync(srcDir).filter((f) => f.endsWith('.svg'));
const floors = files
  .map((f) => extractFloor(readFileSync(join(srcDir, f), 'utf8'), f.replace(/\.svg$/, '')))
  .sort((a, b) => a.level - b.level);

const data = {
  building: { id: '5', name: '5호관', source: '피난계획도 사진 기반 재구성(근사치)' },
  viewBox: { w: 2000, h: 1523 },
  floors,
};
writeFileSync(outFile, JSON.stringify(data, null, 1) + '\n');
for (const f of floors) {
  const byKind = {};
  for (const s of f.spaces) byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
  console.log(`${f.id.padEnd(3)} ${f.name.padEnd(6)} spaces=${f.spaces.length}`, JSON.stringify(byKind));
}
console.log(`→ ${outFile}`);
