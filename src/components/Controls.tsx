import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import type { Theme } from '../lib/theme';
import type { Floor, NavLocation, Space } from '../types';
import { FLOOR_BY_ID, presetLocation, type EntranceChoice } from '../data/building';
import { START_PRESETS } from '../data/overrides';
import { SITE } from '../data/site';
import { FloorBadge } from './SearchBox';
import { IconChevronDown, IconExpand, IconInfo, IconLocate, IconLocateReset, IconMinus, IconMoon, IconSun, IconPin, IconPlus, IconRoute, IconSparkle, IconX, KindIcon } from './icons';

// ---------- 층 선택 ----------
export function FloorSwitcher({
  floors,
  current,
  onChange,
  routeFloors,
  destFloorId,
  style,
}: {
  floors: Floor[];
  current: string;
  onChange(id: string): void;
  routeFloors: Set<string>;
  destFloorId?: string;
  style?: CSSProperties;
}) {
  return (
    <nav className="panel absolute right-3 z-10 flex flex-col gap-1 rounded-2xl p-1.5" style={style} aria-label="층 선택">
      {[...floors].reverse().map((f) => {
        const active = f.id === current;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            aria-current={active ? 'page' : undefined}
            className={`relative grid h-10 w-11 place-items-center rounded-xl md:h-11 md:w-12 text-[14px] font-extrabold tabular-nums transition ${
              active ? 'bg-forest text-white shadow-md' : 'text-ink hover:bg-forest/10'
            }`}
            title={f.name}
          >
            {f.id}
            {routeFloors.has(f.id) && (
              <span
                className={`absolute right-1 top-1 size-2 rounded-full ring-2 ${active ? 'ring-forest' : 'ring-surface'} ${
                  f.id === destFloorId ? 'bg-nav' : 'bg-nav/50'
                }`}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}

// ---------- 라이트 / 다크 모드 ----------
export function ThemeToggle({ theme, compact, onToggle }: { theme: Theme; compact: boolean; onToggle(origin: { x: number; y: number }): void }) {
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      title={dark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onToggle({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }}
      className={`panel relative grid shrink-0 place-items-center overflow-hidden text-ink transition hover:!bg-surface active:scale-95 ${
        compact ? 'h-11 w-[60px] rounded-2xl' : 'size-[46px] rounded-full'
      }`}
    >
      <IconSun
        width={20}
        height={20}
        strokeWidth={2.2}
        className={`absolute text-amber-500 transition duration-500 ease-out ${dark ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'}`}
      />
      <IconMoon
        width={19}
        height={19}
        strokeWidth={2.2}
        className={`absolute text-indigo-500 transition duration-500 ease-out dark:text-indigo-300 ${dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'}`}
      />
    </button>
  );
}

// ---------- 현재 위치 초기화 ----------
export function ResetLocationButton({
  active,
  compact,
  onClick,
}: {
  active: boolean;
  compact: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? '출입구 선택 취소' : '현재 위치 초기화 — 1층 출입구에서 다시 선택'}
      aria-label="현재 위치 초기화"
      className={`panel flex items-center font-bold transition active:scale-[0.97] ${
        compact ? 'w-[60px] flex-col gap-0.5 rounded-2xl px-1 py-2 text-[10.5px] leading-tight' : 'gap-2 rounded-full py-2.5 pl-3.5 pr-4 text-[13.5px]'
      } ${active ? 'reset-active !border-sky-300 !bg-sky-50 text-sky-800 dark:!border-sky-400/40 dark:!bg-sky-400/15 dark:text-sky-200' : 'text-ink hover:!bg-surface'}`}
    >
      <IconLocateReset width={compact ? 20 : 18} height={compact ? 20 : 18} className={active ? 'text-sky-500 dark:text-sky-300' : 'text-blue-600 dark:text-blue-400'} />
      {compact ? <span className="text-center">위치<br />초기화</span> : <span>현재 위치 초기화</span>}
    </button>
  );
}

export function EntrancePickBanner({
  choices,
  current,
  onChoose,
  onEmphasis,
  onCancel,
  style,
  className = '',
  bannerRef,
}: {
  choices: EntranceChoice[];
  current: NavLocation;
  onChoose(c: EntranceChoice): void;
  onEmphasis(id: string | undefined): void;
  onCancel(): void;
  style?: CSSProperties;
  className?: string;
  bannerRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={bannerRef} className={`panel fade-in rounded-3xl p-3.5 ${className}`} style={style} role="dialog" aria-label="출입구 선택">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-500 dark:bg-sky-400/15 dark:text-sky-300">
          <IconSparkle width={20} height={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold leading-tight">어느 출입구에 계신가요?</p>
          <p className="mt-0.5 text-[12.5px] text-muted">1층 지도에서 반짝이는 출입구나 아래 버튼을 누르면 현재 위치로 설정돼요.</p>
        </div>
        <button type="button" onClick={onCancel} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-ink/5" aria-label="취소">
          <IconX />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
        {choices.map((c) => {
          const isCurrent = current.spaceId === c.space.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChoose(c)}
              onPointerEnter={() => onEmphasis(c.space.id)}
              onPointerLeave={() => onEmphasis(undefined)}
              onFocus={() => onEmphasis(c.space.id)}
              onBlur={() => onEmphasis(undefined)}
              className="flex min-h-12 items-center gap-2 rounded-xl border border-sky-300/70 bg-sky-50/70 px-3 py-2 text-left text-[13.5px] font-semibold text-sky-900 transition hover:border-sky-400 hover:bg-sky-100 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-100 dark:hover:border-sky-400/60 dark:hover:bg-sky-400/20 focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              <KindIcon kind="door" width={16} height={16} className="shrink-0 text-sky-500" />
              <span className="min-w-0 flex-1 truncate leading-tight">{c.label}</span>
              {isCurrent && <span className="shrink-0 text-[11px] font-bold text-blue-700 dark:text-blue-300">현재</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- 확대/축소 ----------
export function ZoomControls({ onZoomIn, onZoomOut, onFit }: { onZoomIn(): void; onZoomOut(): void; onFit(): void }) {
  const btn = 'grid size-10 place-items-center rounded-xl text-ink transition hover:bg-forest/10';
  return (
    <div className="panel absolute bottom-4 right-3 z-10 hidden flex-col gap-0.5 rounded-2xl p-1 md:flex">
      <button type="button" className={btn} onClick={onZoomIn} aria-label="확대" title="확대 (+)">
        <IconPlus />
      </button>
      <button type="button" className={btn} onClick={onZoomOut} aria-label="축소" title="축소 (-)">
        <IconMinus />
      </button>
      <div className="mx-2 h-px bg-ink/10" />
      <button type="button" className={btn} onClick={onFit} aria-label="층 전체 보기" title="층 전체 보기 (0)">
        <IconExpand />
      </button>
    </div>
  );
}

// ---------- 출발 위치 ----------
export function StartPicker({
  start,
  onChange,
  onPickOnMap,
  onOpenChange,
}: {
  start: NavLocation;
  onChange(l: NavLocation): void;
  onPickOnMap(): void;
  onOpenChange?(open: boolean): void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const openChangeRef = useRef(onOpenChange);
  openChangeRef.current = onOpenChange;
  useEffect(() => openChangeRef.current?.(open), [open]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-ink/[0.04]"
      >
        <span className="grid size-6 shrink-0 place-items-center">
          <span className="size-3 rounded-full border-[3px] border-white bg-blue-600 shadow ring-1 ring-blue-600/30" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11.5px] font-bold text-muted">출발 · 현재 위치</span>
          <span className="block truncate text-[14px] font-semibold">{start.label}</span>
        </span>
        <IconChevronDown width={16} height={16} className={`shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="panel fade-in absolute inset-x-0 top-[calc(100%+6px)] z-40 rounded-2xl p-1.5">
          {START_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(presetLocation(p.id));
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[14px] hover:bg-forest/[0.07]"
            >
              <KindIcon kind="door" width={16} height={16} className="text-forest-dark" />
              <span className="flex-1">{p.label}</span>
              {start.label === p.label && <span className="text-[12px] font-bold text-forest-dark">선택됨</span>}
            </button>
          ))}
          <div className="my-1 h-px bg-ink/5" />
          <button
            type="button"
            onClick={() => {
              onPickOnMap();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-400/10"
          >
            <IconLocate width={16} height={16} />
            지도에서 직접 지정하기
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- 선택한 공간 카드 ----------
export function SpaceCard({
  space,
  isStart,
  onNavigate,
  onSetStart,
  onClose,
}: {
  space: Space;
  isStart: boolean;
  onNavigate(): void;
  onSetStart(): void;
  onClose(): void;
}) {
  const floor = FLOOR_BY_ID[space.floorId];
  return (
    <section className="p-4" aria-label="선택한 장소">
      <div className="flex items-start gap-3">
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-2xl ${
            space.kind === 'restroom' ? 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300' : space.kind === 'stairs' || space.kind === 'entrance' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300'
          }`}
        >
          <KindIcon kind={space.kind} width={22} height={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FloorBadge floorId={space.floorId} />
            <span className="truncate text-[12.5px] text-muted">
              {floor.name} · {space.wingName}
            </span>
          </div>
          <h2 className="mt-1 text-[19px] font-extrabold leading-tight">{space.title}</h2>
          {space.subtitle && <p className="mt-0.5 text-[13.5px] text-muted">{space.subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-ink/5" aria-label="닫기">
          <IconX />
        </button>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onNavigate}
          disabled={isStart}
          className="flex h-11 flex-[1.4] items-center justify-center gap-2 rounded-xl bg-nav text-[15px] font-bold text-white shadow-[0_6px_18px_-8px_rgb(229_35_59/0.8)] transition hover:bg-nav-dark disabled:bg-ink/15 disabled:shadow-none"
        >
          <IconRoute width={17} height={17} /> {isStart ? '현재 위치예요' : '여기로 길찾기'}
        </button>
        <button
          type="button"
          onClick={onSetStart}
          disabled={isStart}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink/10 bg-surface text-[14px] font-semibold transition hover:bg-ink/[0.03] disabled:opacity-50"
        >
          <IconPin width={16} height={16} /> 출발지로
        </button>
      </div>
    </section>
  );
}

// ---------- 범례 ----------
export function Legend({ floor, style }: { floor: Floor; style?: CSSProperties }) {
  const [open, setOpen] = useState(false);
  const sw = 'inline-block size-3.5 shrink-0 rounded-[3px] border border-ink/25';
  return (
    <div className="absolute bottom-4 z-10 hidden md:block" style={style}>
      {open ? (
        <div className="panel fade-in w-[300px] rounded-2xl p-3.5 text-[12.5px]">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-bold">범례 · {floor.name}</p>
            <button type="button" onClick={() => setOpen(false)} className="grid size-6 place-items-center rounded-full text-muted hover:bg-ink/5" aria-label="범례 닫기">
              <IconX width={14} height={14} />
            </button>
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-muted">
            <li className="flex items-center gap-2"><span className={sw} style={{ background: 'var(--fp-cor)' }} />복도 (피난 경로)</li>
            <li className="flex items-center gap-2"><span className={sw} style={{ background: 'repeating-linear-gradient(var(--fp-stair-bg) 0 5px,var(--fp-stair-line) 5px 6px)' }} />계단</li>
            <li className="flex items-center gap-2"><span className="rounded bg-[var(--fp-exit)] px-1 text-[9px] font-bold text-white">EXIT</span>비상구</li>
            <li className="flex items-center gap-2"><span className={`${sw} bg-surface`} style={{ background: 'linear-gradient(45deg,transparent 45%,var(--fp-line) 45% 55%,transparent 55%),linear-gradient(-45deg,var(--fp-room) 45%,var(--fp-line) 45% 55%,var(--fp-room) 55%)' }} />승강기</li>
            <li className="flex items-center gap-2"><span className={sw} style={{ background: 'repeating-linear-gradient(45deg,var(--fp-unknown-bg) 0 4px,var(--fp-unknown-line) 4px 6px)' }} />사진 없음</li>
            <li className="flex items-center gap-2"><span className="size-2 rounded-full bg-[var(--fp-exit)]" />용도 정보 있음</li>
          </ul>
          {SITE[floor.id] && (
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-muted">
              <li className="flex items-center gap-2"><span className={sw} style={{ background: 'repeating-linear-gradient(45deg,var(--site-roof) 0 4px,var(--site-roof-line) 4px 6px)', borderColor: 'var(--fp-wall)' }} />주변 건물</li>
              <li className="flex items-center gap-2"><span className={sw} style={{ background: 'linear-gradient(var(--site-road) 0 40%,var(--site-road-center) 40% 60%,var(--site-road) 60%)' }} />차도</li>
              <li className="flex items-center gap-2"><span className={sw} style={{ background: 'linear-gradient(var(--fp-room) 0 30%,var(--fp-stair-line) 30% 40%,var(--fp-room) 40% 60%,var(--fp-stair-line) 60% 70%,var(--fp-room) 70%)' }} />벤치</li>
              <li className="flex items-center gap-2"><span className={sw} style={{ background: 'var(--site-field-inner)' }} />운동장</li>
            </ul>
          )}
          {floor.note && <p className="mt-3 border-t border-ink/5 pt-2.5 leading-relaxed text-muted">{floor.note}</p>}
          {SITE[floor.id] && <p className="mt-1.5 leading-relaxed text-muted">{SITE[floor.id].note}</p>}
          <p className="mt-2 text-[11.5px] text-muted/80">피난계획도 사진 기반 재구성 · 치수는 근사치입니다.</p>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="panel flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold">
          <IconInfo width={16} height={16} className="text-forest-dark" /> {floor.name} 범례 · 도면 메모
        </button>
      )}
    </div>
  );
}
