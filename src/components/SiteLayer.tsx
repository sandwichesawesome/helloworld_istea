import { memo } from 'react';
import type { SiteFeature, SiteLayer } from '../data/site';
import { C } from './FloorPlan';

const LABEL_FONT = "'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif";

/** 흰 테두리(halo)를 두른 라벨 — 패턴 위에서도 잘 읽히도록 */
function Label({ x, y, lines, size = 44, color = C.title }: { x: number; y: number; lines: string[]; size?: number; color?: string }) {
  const lh = size * 1.22;
  const y0 = y - ((lines.length - 1) * lh) / 2;
  return (
    <text
      x={x}
      y={y0}
      fontSize={size}
      fontWeight={800}
      fill={color}
      textAnchor="middle"
      dominantBaseline="central"
      stroke="var(--site-halo)"
      strokeWidth={size * 0.22}
      strokeLinejoin="round"
      paintOrder="stroke"
      letterSpacing="-0.5"
    >
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : lh}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

function Road({ f }: { f: SiteFeature }) {
  const { x, y, w, h } = f.shape;
  const mid = y + h / 2;
  return (
    <g mask="url(#site-road-mask)">
      <rect x={x} y={y} width={w} height={h} fill="var(--site-road)" />
      {/* 갓길 표시 */}
      <path d={`M${x} ${y + 16}H${x + w}M${x} ${y + h - 16}H${x + w}`} stroke="var(--site-road-edge)" strokeWidth={3} opacity={0.85} />
      {/* 차도 경계 */}
      <path d={`M${x} ${y}H${x + w}M${x} ${y + h}H${x + w}`} stroke={C.line} strokeWidth={3} />
      {/* 중앙 점선 */}
      <path d={`M${x} ${mid}H${x + w}`} stroke="var(--site-road-center)" strokeWidth={5} strokeDasharray="44 34" strokeLinecap="round" />
    </g>
  );
}

function Building({ f }: { f: SiteFeature }) {
  const { x, y, w, h } = f.shape;
  const inset = 16;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="url(#site-roof)" stroke={C.wall} strokeWidth={4} />
      <rect x={x + inset} y={y + inset} width={w - inset * 2} height={h - inset * 2} fill="none" stroke={C.line} strokeWidth={1} opacity={0.45} />
      <Label x={x + w / 2} y={y + h / 2} lines={f.lines ?? [f.label ?? '']} size={66} />
    </g>
  );
}

function Field({ f }: { f: SiteFeature }) {
  const { x, y, w, h } = f.shape;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const pad = 26; // 트랙 폭
  const fx = x + h / 2; // 직선 구간 시작
  const fw = w - h;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="var(--site-field)" stroke={C.line} strokeWidth={2.5} />
      {/* 트랙 레인 */}
      <rect x={x + 10} y={y + 10} width={w - 20} height={h - 20} rx={h / 2 - 10} fill="none" stroke="var(--site-field-line)" strokeWidth={2.5} opacity={0.9} />
      <rect x={x + pad} y={y + pad} width={w - pad * 2} height={h - pad * 2} rx={h / 2 - pad} fill="var(--site-field-inner)" stroke="var(--site-field-line)" strokeWidth={3} />
      {/* 경기장 라인 */}
      <g stroke="var(--site-field-line)" strokeWidth={3} fill="none" opacity={0.95}>
        <rect x={fx} y={y + pad + 34} width={fw} height={h - pad * 2 - 68} />
        <path d={`M${cx} ${y + pad + 34}V${y + h - pad - 34}`} />
        <circle cx={cx} cy={cy} r={70} />
      </g>
      <Label x={cx} y={cy} lines={[f.label ?? '']} size={60} />
    </g>
  );
}

function Bench({ f }: { f: SiteFeature }) {
  const { x, y, w, h } = f.shape;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={C.room} stroke={C.line} strokeWidth={2} />
      <path
        d={`M${x + 12} ${y + h / 3}H${x + w - 12}M${x + 12} ${y + (h * 2) / 3}H${x + w - 12}`}
        stroke="var(--fp-stair-line)"
        strokeWidth={2}
        strokeLinecap="round"
      />

    </g>
  );
}

function SiteLayerImpl({ layer }: { layer: SiteLayer }) {
  const order: SiteFeature['kind'][] = ['road', 'field', 'building', 'bench'];
  const sorted = [...layer.features].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return (
    <g className="site-layer pointer-events-none" fontFamily={LABEL_FONT}>
      <defs>
        <linearGradient id="site-road-fade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.07" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.95" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="site-road-mask" maskContentUnits="objectBoundingBox">
          <rect width="1" height="1" fill="url(#site-road-fade)" />
        </mask>
        <pattern id="site-roof" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="16" height="16" fill="var(--site-roof)" />
          <path d="M0 0V16" stroke="var(--site-roof-line)" strokeWidth="2" />
        </pattern>
      </defs>
      {sorted.map((f) => {
        switch (f.kind) {
          case 'road':
            return <Road key={f.id} f={f} />;
          case 'field':
            return <Field key={f.id} f={f} />;
          case 'building':
            return <Building key={f.id} f={f} />;
          case 'bench':
            return <Bench key={f.id} f={f} />;
        }
      })}
    </g>
  );
}

export const SiteLayerView = memo(SiteLayerImpl);
