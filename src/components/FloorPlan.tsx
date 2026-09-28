import { memo } from 'react';
import type { Floor, RectShape, Space } from '../types';
import { shapeToPath } from '../lib/geometry';

/** 평면도 색 — index.css 의 --fp-* 변수 (라이트/다크 테마에 따라 바뀜) */
export const C = {
  ink: 'var(--fp-ink)',
  muted: 'var(--fp-muted)',
  line: 'var(--fp-line)',
  wall: 'var(--fp-wall)',
  room: 'var(--fp-room)',
  paper: 'var(--fp-paper)',
  cor: 'var(--fp-cor)',
  court: 'var(--fp-court)',
  title: 'var(--fp-title)',
  exit: 'var(--fp-exit)',
};

/** 도면 전용 SVG 패턴 (MapView 의 <defs> 안에 한 번만 넣는다) */
export function FloorPatterns() {
  return (
    <>
      <pattern id="fp-stairs" width="10" height="7" patternUnits="userSpaceOnUse">
        <rect width="10" height="7" fill="var(--fp-stair-bg)" />
        <path d="M0 6.5H10" stroke="var(--fp-stair-line)" strokeWidth="1" />
      </pattern>
      <pattern id="fp-grid" width="23" height="24" patternUnits="userSpaceOnUse">
        <rect width="23" height="24" fill="var(--fp-grid-bg)" />
        <path d="M23 0V24M0 24H23" stroke="var(--fp-grid-line)" strokeWidth="1" />
      </pattern>
      <pattern id="fp-unknown" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="14" height="14" fill="var(--fp-unknown-bg)" />
        <path d="M0 0V14" stroke="var(--fp-unknown-line)" strokeWidth="3" />
      </pattern>
      <pattern id="fp-void" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <rect width="9" height="9" fill="var(--fp-void-bg)" />
        <path d="M0 0V9" stroke="var(--fp-void-line)" strokeWidth="1.5" />
      </pattern>
    </>
  );
}

function ExitBadge({ r }: { r: RectShape }) {
  return (
    <g className="pointer-events-none">
      <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={3} fill={C.exit} />
      <text
        x={r.x + r.w / 2}
        y={r.y + r.h / 2 + 0.5}
        fontSize={11}
        fontWeight={700}
        fill="#fff"
        textAnchor="middle"
        dominantBaseline="central"
        letterSpacing=".5"
      >
        EXIT
      </text>
    </g>
  );
}

function SpaceLabel({ s }: { s: Space }) {
  return (
    <>
      {s.label && (
        <text
          x={s.label.x}
          y={s.label.y}
          fontSize={s.label.size}
          fill={C.ink}
          textAnchor="middle"
          dominantBaseline="central"
          fontWeight={s.central ? 700 : undefined}
        >
          {s.label.text}
        </text>
      )}
      {s.sub && (
        <text x={s.sub.x} y={s.sub.y} fontSize={s.sub.size} fill={C.muted} textAnchor="middle" dominantBaseline="central">
          {s.sub.text}
        </text>
      )}
    </>
  );
}

function SpaceShape({ s }: { s: Space }) {
  const d = shapeToPath(s.shape);
  const b = s.bbox;
  switch (s.kind) {
    case 'stairs':
    case 'entrance':
      if (s.central) {
        const { band, inner } = s.central;
        return (
          <>
            <path d={d} className="fp-fill" fill="url(#fp-grid)" stroke={C.wall} strokeWidth={3} />
            {band && <rect x={band.x} y={band.y} width={band.w} height={band.h} fill={C.room} />}
            {inner && <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} fill="url(#fp-stairs)" stroke={C.line} />}
            <SpaceLabel s={s} />
            {s.exit && <ExitBadge r={s.exit} />}
          </>
        );
      }
      return (
        <>
          <path d={d} className="fp-fill" fill={s.plain ? C.room : 'url(#fp-stairs)'} stroke={C.line} strokeWidth={1} />
          {s.label && (
            <text x={s.label.x} y={s.label.y} fontSize={s.label.size} fill={C.ink} textAnchor="middle" dominantBaseline="central">
              {s.label.text}
            </text>
          )}
          {s.exit && <ExitBadge r={s.exit} />}
        </>
      );
    case 'elevator':
      return (
        <>
          <path d={d} className="fp-fill" fill={C.room} stroke={C.line} strokeWidth={1} />
          <path
            d={`M${b.x} ${b.y}L${b.x + b.w} ${b.y + b.h}M${b.x + b.w} ${b.y}L${b.x} ${b.y + b.h}`}
            stroke={C.line}
            strokeWidth={1}
          />
        </>
      );
    case 'unknown': {
      const bw = Math.min(b.w - 12, 122);
      return (
        <>
          <path d={d} fill="url(#fp-unknown)" stroke={C.line} strokeWidth={1} />
          <rect x={b.x + (b.w - bw) / 2} y={b.y + b.h / 2 - 20} width={bw} height={40} rx={4} fill={C.room} opacity={0.92} />
          <text x={b.x + b.w / 2} y={b.y + b.h / 2 - (s.note ? 7 : 0)} fontSize={12} fontWeight={700} fill={C.ink} textAnchor="middle" dominantBaseline="central">
            {s.name}
          </text>
          {s.note && (
            <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 9} fontSize={10} fill={C.muted} textAnchor="middle" dominantBaseline="central">
              {s.note}
            </text>
          )}
        </>
      );
    }
    case 'void':
      return (
        <>
          <path d={d} fill="url(#fp-void)" stroke={C.line} strokeWidth={1} />
          <text x={b.x + b.w / 2} y={b.y + b.h / 2} fontSize={13} fill={C.muted} textAnchor="middle" dominantBaseline="central">
            OPEN
          </text>
        </>
      );
    default:
      return (
        <>
          <path
            d={d}
            className="fp-fill"
            fill={C.room}
            stroke={s.heavy ? C.wall : C.line}
            strokeWidth={s.heavy ? 2 : 1}
          />
          <SpaceLabel s={s} />
          {s.dot && <circle cx={s.dot.x} cy={s.dot.y} r={2.4} fill={C.exit} />}
        </>
      );
  }
}

function FloorPlanImpl({ floor }: { floor: Floor }) {
  const outline = floor.outline.map((p) => p.join(',')).join(' ');
  return (
    <g className="fp-floor" fontFamily="'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif">
      {floor.excluded && (
        <g className="pointer-events-none">
          <polygon
            points={floor.excluded.points.map((p) => p.join(',')).join(' ')}
            fill="url(#fp-unknown)"
            opacity={0.55}
            stroke="var(--fp-excluded-line)"
            strokeWidth={2}
            strokeDasharray="10 7"
          />
          {floor.excluded.box && (
            <rect
              x={floor.excluded.box.x}
              y={floor.excluded.box.y}
              width={floor.excluded.box.w}
              height={floor.excluded.box.h}
              rx={8}
              fill={C.paper}
              stroke="var(--fp-box-line)"
            />
          )}
          {floor.excluded.title && (
            <text x={floor.excluded.title.x} y={floor.excluded.title.y} fontSize={24} fontWeight={700} fill={C.ink} textAnchor="middle">
              {floor.excluded.title.text}
            </text>
          )}
          {floor.excluded.sub && (
            <text x={floor.excluded.sub.x} y={floor.excluded.sub.y} fontSize={15} fill={C.muted} textAnchor="middle">
              {floor.excluded.sub.text}
            </text>
          )}
        </g>
      )}
      <polygon points={outline} fill={C.cor} />
      {floor.courtyard && (
        <rect
          x={floor.courtyard.x}
          y={floor.courtyard.y}
          width={floor.courtyard.w}
          height={floor.courtyard.h}
          fill={C.court}
          stroke={C.wall}
          strokeWidth={2}
        />
      )}
      {floor.courtyardLabel && (
        <text
          x={floor.courtyardLabel.x}
          y={floor.courtyardLabel.y}
          fontSize={34}
          fill="var(--fp-court-text)"
          textAnchor="middle"
          dominantBaseline="central"
          className="pointer-events-none"
        >
          {floor.courtyardLabel.text}
        </text>
      )}
      {floor.spaces.map((s) => (
        <g
          key={s.id}
          data-space-id={s.searchable ? s.id : undefined}
          className={`fp-space fp-${s.kind}${s.searchable ? ' interactive' : ''}`}
        >
          <title>{s.subtitle ? `${s.title} — ${s.subtitle}` : s.title}</title>
          <SpaceShape s={s} />
        </g>
      ))}
      <polygon points={outline} fill="none" stroke={C.wall} strokeWidth={5} strokeLinejoin="miter" className="pointer-events-none" />
      <g className="pointer-events-none">
        {floor.wingLabels.map((w) => (
          <text key={w.text} x={w.x} y={w.y} fontSize={38} fontWeight={800} fill={C.title} textAnchor="middle" dominantBaseline="central" opacity={0.9}>
            {w.text}
          </text>
        ))}
        {floor.compass && (
          <g>
            <circle cx={floor.compass.x} cy={floor.compass.y} r={floor.compass.r} fill={C.paper} stroke={C.wall} strokeWidth={2} />
            <path
              d={`M${floor.compass.x} ${floor.compass.y - 20}L${floor.compass.x + 9} ${floor.compass.y + 9}L${floor.compass.x} ${floor.compass.y + 3}L${floor.compass.x - 9} ${floor.compass.y + 9}Z`}
              fill="#c4491c"
            />
            <text x={floor.compass.x} y={floor.compass.y - 42} fontSize={17} fontWeight={800} textAnchor="middle" fill={C.ink}>
              N
            </text>
          </g>
        )}
      </g>
    </g>
  );
}

export const FloorPlan = memo(FloorPlanImpl);
