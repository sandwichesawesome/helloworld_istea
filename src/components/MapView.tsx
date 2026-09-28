import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Floor, NavLocation, Point, Route, Space } from '../types';
import { FloorPatterns, FloorPlan } from './FloorPlan';
import { Viewport, easeInOutCubic, type Insets } from '../lib/viewport';
import { bboxOfPoints, createSampler, pointsToPath, shapeToPath, unionBBox } from '../lib/geometry';
import { SITE } from '../data/site';
import { SiteLayerView } from './SiteLayer';
import { FLOOR_BY_ID, SPACE_BY_ID, VIEWBOX } from '../data/building';

export interface MapViewHandle {
  zoomBy(factor: number): void;
  /** scope 'site': 주변 배치가 있는 층(1층)은 주변까지, 'building': 건물만 */
  fitFloor(padding?: number, scope?: 'site' | 'building'): void;
  focusSpace(space: Space): void;
}

interface Props {
  floor: Floor;
  insets: Insets;
  start: NavLocation;
  selectedId?: string;
  route: Route | null;
  legIndex: number;
  legDone: boolean;
  playToken: number;
  followCam: boolean;
  pickMode: boolean;
  enterDir: 'up' | 'down' | 'none';
  /** 반짝이며 강조할 공간 (현재 위치 초기화 → 출입구 선택) */
  glowSpaces?: { id: string; label: string }[];
  glowEmphasisId?: string;
  hideStart?: boolean;
  onSpaceClick(space: Space | null): void;
  onPick(point: Point): void;
  onLegDone(): void;
}

const FLOOR_BOUNDS = { x: 70, y: 130, w: 1890, h: 1250 };
const ARROW_TIP = 22; // 이동 화살표 중심 → 끝 (화면 px)
const RED = '#e5233b';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 출발·도착에서 부드럽게 가감속하고 중간은 일정한 속도 */
function travelEase(t: number, a = 0.16) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const v = 1 / (1 - a); // 최고 속도
  if (t < a) return (v * t * t) / (2 * a);
  if (t > 1 - a) return 1 - (v * (1 - t) * (1 - t)) / (2 * a);
  return v * (t - a / 2);
}
const lerpAngle = (a: number, b: number, t: number) => {
  let d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
};

/** 대략적인 글자 폭(px) — 말풍선 크기용 */
const textWidth = (s: string, size: number) =>
  [...s].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? size * 1.0 : /[A-Z0-9]/.test(ch) ? size * 0.62 : size * 0.55), 0);

/** 오목한 네 꼭짓점 별 (반짝이) */
const sparklePath = (x: number, y: number, r: number) =>
  `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;
const SPARKLES: [number, number, number][] = [
  [-21, -10, 6.5],
  [20, -17, 5],
  [17, 11, 4.2],
  [-14, 15, 3.6],
];

const scaled = (p: Point): CSSProperties => ({ transform: `translate(${p.x}px, ${p.y}px) scale(var(--inv-k))` });

interface PinState {
  point: Point;
  label: string;
  kind: 'dest' | 'stairs';
}

const BUBBLE_FILL = { red: RED, blue: '#1d4ed8', dark: 'var(--bubble-dark)', sky: '#7dd3fc' };
/** 밝은 말풍선은 어두운 글씨 */
const BUBBLE_TEXT: Partial<Record<keyof typeof BUBBLE_FILL, string>> = { sky: '#0c4a6e' };

function Bubble({ label, y, tone, down }: { label: string; y: number; tone: keyof typeof BUBBLE_FILL; down?: boolean }) {
  const w = textWidth(label, 13) + 22;
  const fill = BUBBLE_FILL[tone];
  return (
    <g transform={`translate(0 ${y})`}>
      <rect x={-w / 2} y={-13} width={w} height={26} rx={13} fill={fill} filter="url(#nav-shadow)" />
      <path d={down ? 'M-6 -12.5L0 -19L6 -12.5Z' : 'M-6 12.5L0 19L6 12.5Z'} fill={fill} />
      <text y={0.5} fontSize={13} fontWeight={700} fill={BUBBLE_TEXT[tone] ?? '#fff'} textAnchor="middle" dominantBaseline="central">
        {label}
      </text>
    </g>
  );
}

export const MapView = forwardRef<MapViewHandle, Props>(function MapView(props, ref) {
  const { floor, insets, start, selectedId, route, legIndex, legDone, playToken, pickMode, enterDir, glowSpaces, glowEmphasisId, hideStart } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<SVGGElement>(null);
  const overlayRef = useRef<SVGGElement>(null);
  const arrowRef = useRef<SVGGElement>(null);
  const travelRef = useRef<SVGPathElement>(null);
  const vpRef = useRef<Viewport | null>(null);
  if (!vpRef.current) vpRef.current = new Viewport({ x: 0, y: 0, w: VIEWBOX.w, h: VIEWBOX.h });
  const vp = vpRef.current;
  const [pin, setPin] = useState<PinState | null>(null);
  /** 화면 크기에 맞춘 '자세히 보기' 줌 (호실 번호가 읽히는 정도) */
  const detailK = () => Math.min(1.5, Math.max(0.8, vp.fitScale(FLOOR_BOUNDS, 16) * 3.2));
  const latest = useRef(props);
  latest.current = props;

  // ---------- 카메라 → DOM ----------
  useLayoutEffect(() => {
    const apply = () => {
      const { x, y, k } = vp.cam;
      camRef.current?.setAttribute('transform', `translate(${x} ${y}) scale(${k})`);
      overlayRef.current?.style.setProperty('--inv-k', String(1 / k));
    };
    const off = vp.onChange(apply);
    const el = containerRef.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const first = vp.w <= 1;
      vp.setSize(r.width, r.height);
      if (first) vp.set(vp.fitCamera(FLOOR_BOUNDS, 16));
    });
    ro.observe(el);
    apply();
    return () => {
      off();
      ro.disconnect();
    };
  }, [vp]);

  useEffect(() => {
    vp.insets = insets;
  }, [vp, insets]);

  useImperativeHandle(
    ref,
    () => ({
      zoomBy(f) {
        vp.userAction();
        const u = { x: insets.left + (vp.w - insets.left - insets.right) / 2, y: insets.top + (vp.h - insets.top - insets.bottom) / 2 };
        const target = vp.cam.k * f;
        const c = vp.screenToWorld(u.x, u.y);
        void vp.flyTo({ k: target, x: u.x - c.x * target, y: u.y - c.y * target }, 260);
      },
      fitFloor(padding = 16, scope = 'site') {
        vp.userAction();
        const site = SITE[latest.current.floor.id];
        void vp.flyTo(vp.fitCamera(scope === 'site' && site ? site.bounds : FLOOR_BOUNDS, padding), 650);
      },
      focusSpace(space) {
        void vp.flyTo(vp.centerCamera(space.anchor, Math.min(2, Math.max(vp.cam.k, detailK()))), 650);
      },
    }),
    [vp, insets],
  );

  // ---------- 포인터: 드래그 이동 · 핀치 확대 · 클릭 ----------
  useEffect(() => {
    const el = containerRef.current!;
    const pts = new Map<number, { x: number; y: number }>();
    let moved = false;
    let downSpace: string | null = null;
    let downAt = { x: 0, y: 0 };
    let pinch: { d: number; k: number; world: Point } | null = null;
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pts.size === 1) {
        moved = false;
        downAt = p;
        downSpace = (e.target as Element).closest?.('[data-space-id]')?.getAttribute('data-space-id') ?? null;
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: vp.cam.k, world: vp.screenToWorld(mid.x, mid.y) };
        moved = true;
        vp.userAction();
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pts.size >= 2 && pinch) {
        const [a, b] = [...pts.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const k = pinch.k * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.d));
        vp.set({ k, x: mid.x - pinch.world.x * k, y: mid.y - pinch.world.y * k });
        return;
      }
      if (!moved && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 5) {
        moved = true;
        vp.userAction();
        el.setPointerCapture(e.pointerId);
        el.classList.add('is-dragging');
      }
      if (moved) vp.panBy(p.x - prev.x, p.y - prev.y);
    };
    const onUp = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) {
        el.classList.remove('is-dragging');
        if (!moved) {
          const p = local(e);
          const w = vp.screenToWorld(p.x, p.y);
          if (latest.current.pickMode) latest.current.onPick(w);
          else latest.current.onSpaceClick(downSpace ? SPACE_BY_ID[downSpace] ?? null : null);
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      vp.userAction();
      const p = local(e);
      const scale = e.deltaMode === 1 ? 16 : 1;
      vp.zoomAt(p.x, p.y, Math.exp(-e.deltaY * scale * (e.ctrlKey ? 0.01 : 0.0016)));
    };
    const onDbl = (e: MouseEvent) => {
      const p = local(e);
      vp.userAction();
      const target = vp.cam.k * 1.8;
      const c = vp.screenToWorld(p.x, p.y);
      void vp.flyTo({ k: target, x: p.x - c.x * target, y: p.y - c.y * target }, 300);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('dblclick', onDbl);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('dblclick', onDbl);
    };
  }, [vp]);

  // ---------- 경로 애니메이션 ----------
  const leg = route?.legs[legIndex];
  const activeLeg = leg && leg.floorId === floor.id ? leg : null;

  // 층마다 이동 가능 범위: 주변 배치가 있는 층은 주변까지 포함
  const site = SITE[floor.id];
  useEffect(() => {
    const base = { x: 0, y: 0, w: VIEWBOX.w, h: VIEWBOX.h };
    vp.setWorld(site ? unionBBox(base, site.bounds) : base);
    // 주변까지 멀리 보던 상태로 다른 층에 오면 건물에 다시 맞춤 (경로 안내 중이면 경로 카메라에 맡김)
    if (!site && !latest.current.route && vp.w > 1 && vp.cam.k < vp.fitScale(FLOOR_BOUNDS, 16) * 0.85) {
      void vp.flyTo(vp.fitCamera(FLOOR_BOUNDS, 16), 600);
    }
  }, [site, vp]);
  useEffect(() => {
    const arrow = arrowRef.current;
    const travel = travelRef.current;
    if (!arrow) return;
    arrow.style.display = 'none';
    if (!activeLeg || !route) {
      setPin(null);
      return;
    }
    const sampler = createSampler(activeLeg.points);
    const L = sampler.total;
    const end = activeLeg.points[activeLeg.points.length - 1];
    const pinState: PinState = activeLeg.transition
      ? {
          point: end,
          kind: 'stairs',
          label: `${activeLeg.transition.direction === 'up' ? '▲' : '▼'} ${FLOOR_BY_ID[activeLeg.transition.toFloorId].name}으로`,
        }
      : { point: end, kind: 'dest', label: route.to.title };
    if (travel) travel.style.strokeDashoffset = legDone ? '0' : String(L);
    if (legDone) {
      setPin(pinState);
      return;
    }
    setPin(null);

    let cancelled = false;
    let raf = 0;
    const startedAt = performance.now();
    const userMoved = () => vp.lastUserAction > startedAt;
    const place = (p: Point, ang: number, off = 0) => {
      const deg = (ang * 180) / Math.PI + 90;
      arrow.style.transform = `translate(${p.x}px, ${p.y}px) scale(var(--inv-k)) translate(0px, ${off}px) rotate(${deg}deg)`;
    };
    const reduce = reducedMotion();

    (async () => {
      const p0 = activeLeg.points[0];
      place(p0, sampler.heading(0));
      arrow.style.display = '';
      arrow.classList.remove('arrow-pop');
      void arrow.getBoundingClientRect();
      arrow.classList.add('arrow-pop');

      const follow = latest.current.followCam;
      if (follow) await vp.flyTo(vp.centerCamera(p0, Math.max(vp.cam.k, detailK())), 700);
      else {
        const b = bboxOfPoints(activeLeg.points);
        const pad = 110;
        const maxK = Math.min(1.3, Math.max(0.75, vp.fitScale(FLOOR_BOUNDS, 16) * 2.6));
        await vp.flyTo(vp.fitCamera({ x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }, 40, maxK), 750);
      }
      if (cancelled) return;
      await sleep(reduce ? 0 : 150);
      if (cancelled) return;

      if (L > 1) {
        const dur = Math.min(6.5, Math.max(1.2, L / 470)) * 1000 * (reduce ? 0.3 : 1);
        const t0 = performance.now();
        await new Promise<void>((resolve) => {
          const step = (now: number) => {
            if (cancelled) return resolve();
            const t = Math.min(1, (now - t0) / dur);
            const s = travelEase(t) * L;
            const p = sampler.at(s);
            place(p, sampler.heading(s));
            if (travel) travel.style.strokeDashoffset = String(L - s);
            if (!userMoved()) {
              if (latest.current.followCam) {
                const c = vp.centerCamera(p);
                vp.set({ k: c.k, x: vp.cam.x + (c.x - vp.cam.x) * 0.18, y: vp.cam.y + (c.y - vp.cam.y) * 0.18 });
              } else {
                const sp = vp.worldToScreen(p);
                const m = 70;
                const { top, right, bottom, left } = vp.insets;
                let dx = 0, dy = 0;
                if (sp.x < left + m) dx = left + m - sp.x;
                if (sp.x > vp.w - right - m) dx = vp.w - right - m - sp.x;
                if (sp.y < top + m) dy = top + m - sp.y;
                if (sp.y > vp.h - bottom - m) dy = vp.h - bottom - m - sp.y;
                if (dx || dy) vp.panBy(dx * 0.15, dy * 0.15);
              }
            }
            if (t < 1) raf = requestAnimationFrame(step);
            else resolve();
          };
          raf = requestAnimationFrame(step);
        });
      }
      if (cancelled) return;

      // 도착: 화살표가 아래를 향하도록 회전하며 끝이 목적지 중심에 닿게
      const h0 = sampler.heading(L);
      const turnDur = reduce ? 1 : 300;
      const t1 = performance.now();
      await new Promise<void>((resolve) => {
        const step = (now: number) => {
          if (cancelled) return resolve();
          const e = easeInOutCubic(Math.min(1, (now - t1) / turnDur));
          place(end, lerpAngle(h0, Math.PI / 2, e), -ARROW_TIP * e);
          if (e < 1) raf = requestAnimationFrame(step);
          else resolve();
        };
        raf = requestAnimationFrame(step);
      });
      if (cancelled) return;
      arrow.style.display = 'none';
      setPin(pinState);
      if (!userMoved()) {
        const k = Math.min(2, Math.max(vp.cam.k, detailK()));
        await vp.flyTo(vp.centerCamera(end, k), 800);
      }
      if (!cancelled) latest.current.onLegDone();
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      vp.stop();
    };
    // playToken: 다시 재생
  }, [activeLeg, legDone, playToken, route, vp]);

  // ---------- 오버레이 ----------
  const selected = selectedId ? SPACE_BY_ID[selectedId] : undefined;
  const dest = route?.to;
  const showStart = !hideStart && (route ? legIndex === 0 && route.from.floorId === floor.id : start.floorId === floor.id);
  const startPoint = route && legIndex === 0 ? route.from.point : start.point;
  const doneLegs = route ? route.legs.filter((l, i) => i < legIndex && l.floorId === floor.id) : [];

  return (
    <div
      ref={containerRef}
      className={`map-surface absolute inset-0 touch-none select-none overflow-hidden ${pickMode ? 'cursor-crosshair' : 'cursor-grab'}`}
      role="application"
      aria-label={`${floor.name} 평면도 — 드래그로 이동, 휠로 확대/축소`}
    >
      <svg className="block h-full w-full">
        <defs>
          <FloorPatterns />
          <filter id="nav-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.2" floodColor="#000" floodOpacity="0.28" />
          </filter>
        </defs>
        <g ref={camRef}>
          <g key={floor.id} className={enterDir === 'none' ? '' : `floor-enter-${enterDir}`}>
            {site && <SiteLayerView layer={site} />}
            <FloorPlan floor={floor} />
          </g>
          <g ref={overlayRef} className="pointer-events-none" style={{ '--inv-k': 1 } as CSSProperties}>
            {selected && selected.floorId === floor.id && selected.id !== dest?.id && (
              <path d={shapeToPath(selected.shape)} className="sel-outline" />
            )}
            {dest && dest.floorId === floor.id && <path d={shapeToPath(dest.shape)} className="dest-outline" />}

            {glowSpaces?.map((g, i) => {
              const s = SPACE_BY_ID[g.id];
              if (!s || s.floorId !== floor.id) return null;
              const d0 = i * 0.23;
              const emph = g.id === glowEmphasisId;
              // 바로 아래가 안뜰(빈 공간)이면 이름표를 아래로 — 위쪽 줄 출입구와 겹치지 않게
              const cy = floor.courtyard;
              const down = !!cy && s.anchor.x > cy.x && s.anchor.x < cy.x + cy.w && s.anchor.y < cy.y && s.anchor.y + 80 > cy.y;
              return (
                <g key={g.id} className="entrance-glow-group">
                  <path d={shapeToPath(s.shape)} className={`entrance-glow${emph ? ' emph' : ''}`} style={{ animationDelay: `${d0}s` }} />
                  <g style={scaled(s.anchor)}>
                    <circle r={12} className="pulse-ring pulse-sky" style={{ animationDelay: `${d0}s` }} />
                    <circle r={12} className="pulse-ring pulse-sky" style={{ animationDelay: `${d0 + 0.9}s` }} />
                    {SPARKLES.map(([x, y, r], j) => (
                      <path key={j} d={sparklePath(x, y, r)} className="sparkle" style={{ animationDelay: `${d0 + j * 0.37}s` }} />
                    ))}
                    <circle r={5.5} fill="#38bdf8" stroke="#fff" strokeWidth={2.5} filter="url(#nav-shadow)" />
                    <g className={emph ? 'float-soft emph' : 'float-soft'} style={{ animationDelay: `${d0}s` }}>
                      <g data-space-id={s.id} style={{ pointerEvents: 'auto', cursor: 'pointer' }}>
                        <Bubble label={g.label} y={down ? 34 : -34} down={down} tone={emph ? 'dark' : 'sky'} />
                      </g>
                    </g>
                  </g>
                </g>
              );
            })}

            {doneLegs.map((l, i) => (
              <path key={i} d={pointsToPath(l.points)} className="route-line route-done" />
            ))}
            {activeLeg && (
              <g key={`${route!.id}-${legIndex}-${playToken}`}>
                <path d={pointsToPath(activeLeg.points)} className="route-casing" />
                <path d={pointsToPath(activeLeg.points)} className="route-line route-ahead" />
                <path
                  ref={travelRef}
                  d={pointsToPath(activeLeg.points)}
                  className="route-line route-traveled"
                  strokeDasharray={`${createSampler(activeLeg.points).total + 1} ${createSampler(activeLeg.points).total + 1}`}
                  style={{ strokeDashoffset: legDone ? 0 : createSampler(activeLeg.points).total }}
                />
                {legIndex > 0 && (
                  <g style={scaled(activeLeg.points[0])}>
                    <circle r={9} fill="#fff" stroke={RED} strokeWidth={3} />
                    <path d="M-4 1L0 -4L4 1M0 -4V5" stroke={RED} strokeWidth={2} fill="none" strokeLinecap="round" />
                  </g>
                )}
              </g>
            )}

            {showStart && (
              <g style={scaled(startPoint)}>
                <circle r={10} className="pulse-ring pulse-blue" />
                <circle r={9} fill="#2563eb" stroke="#fff" strokeWidth={3.5} filter="url(#nav-shadow)" />
                <Bubble label={route ? '출발' : '현재 위치'} y={-30} tone="blue" />
              </g>
            )}

            {pin && (
              <g style={scaled(pin.point)}>
                <circle r={11} className="pulse-ring pulse-red" />
                <circle r={11} className="pulse-ring pulse-red delay" />
                <circle r={4.5} fill={RED} stroke="#fff" strokeWidth={2} />
                <g className="pin-bounce">
                  <path d="M0 -2L-15 -38L0 -30L15 -38Z" fill={RED} stroke="#fff" strokeWidth={3} strokeLinejoin="round" filter="url(#nav-shadow)" />
                  <Bubble label={pin.label} y={-62} tone={pin.kind === 'dest' ? 'red' : 'dark'} />
                </g>
              </g>
            )}

            <g ref={arrowRef} style={{ display: 'none' }}>
              <g className="arrow-inner">
                <path
                  d="M0 -22L15 14L0 6L-15 14Z"
                  fill={RED}
                  stroke="#fff"
                  strokeWidth={3}
                  strokeLinejoin="round"
                  filter="url(#nav-shadow)"
                />
              </g>
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
});
