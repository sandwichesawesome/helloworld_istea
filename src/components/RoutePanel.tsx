import { Fragment, type ReactNode } from 'react';
import type { Route } from '../types';
import { FLOOR_BY_ID } from '../data/building';
import { METERS_PER_UNIT } from '../data/overrides';
import { FloorBadge } from './SearchBox';
import { IconArrowDown, IconArrowUp, IconFlag, IconReplay, IconStairs, IconVideo, IconX } from './icons';

export const meters = (units: number) => Math.max(1, Math.round(units * METERS_PER_UNIT));

export function formatDuration(route: Route) {
  const floorsMoved = route.legs.reduce((s, l) => s + (l.transition?.floors ?? 0), 0);
  const sec = meters(route.totalLength) / 1.2 + floorsMoved * 18;
  if (sec < 60) return `${Math.max(10, Math.round(sec / 10) * 10)}초`;
  const m = Math.floor(sec / 60);
  const s = Math.round((sec % 60) / 10) * 10;
  return s ? `${m}분 ${s}초` : `${m}분`;
}

interface Props {
  route: Route;
  legIndex: number;
  legDone: boolean;
  viewingFloorId: string;
  followCam: boolean;
  onToggleFollow(): void;
  onNextFloor(): void;
  onReplay(): void;
  onClose(): void;
  onShowFloor(floorId: string): void;
  /** 모바일: 요약만 보이는 접힌 상태 */
  compact?: boolean;
  onToggleCompact?(): void;
}

export function NextFloorButton({ route, legIndex, onNextFloor, big }: { route: Route; legIndex: number; onNextFloor(): void; big?: boolean }) {
  const t = route.legs[legIndex].transition!;
  const Arrow = t.direction === 'up' ? IconArrowUp : IconArrowDown;
  const floorName = FLOOR_BY_ID[t.toFloorId].name;
  return (
    <button
      type="button"
      onClick={onNextFloor}
      className={`group flex w-full items-center gap-3 rounded-2xl bg-nav text-left text-white shadow-[0_8px_24px_-8px_rgb(229_35_59/0.7)] transition hover:bg-nav-dark active:scale-[0.99] ${big ? 'px-5 py-4' : 'px-4 py-3'}`}
    >
      <span className={`grid shrink-0 place-items-center rounded-xl bg-white/20 ${big ? 'size-11' : 'size-9'}`}>
        <Arrow width={big ? 22 : 18} height={big ? 22 : 18} strokeWidth={2.6} className="transition group-hover:-translate-y-0.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-extrabold ${big ? 'text-[17px]' : 'text-[15px]'}`}>{floorName} 평면도 보기</span>
        <span className="block truncate text-[12.5px] text-white/85">
          {t.coreName}으로 {t.floors > 1 ? `${t.floors}개 층 ` : ''}
          {t.direction === 'up' ? '올라가세요' : '내려가세요'}
        </span>
      </span>
      <span className="text-xl font-bold opacity-80">→</span>
    </button>
  );
}

export function RoutePanel({ route, legIndex, legDone, viewingFloorId, followCam, onToggleFollow, onNextFloor, onReplay, onClose, onShowFloor, compact, onToggleCompact }: Props) {
  const leg = route.legs[legIndex];
  const last = legIndex === route.legs.length - 1;
  const arrived = legDone && last;
  const atStairs = legDone && !!leg.transition;
  const floorsMoved = route.legs.reduce((s, l) => s + (l.transition?.floors ?? 0), 0);
  const approx = route.legs.some((l) => l.approximate);
  const hideOnMobile = compact ? 'max-md:hidden' : '';

  return (
    <section className="flex min-h-0 flex-col" aria-label="길안내">
      {onToggleCompact && (
        <button type="button" onClick={onToggleCompact} className="flex w-full justify-center pb-0.5 pt-2 md:hidden" aria-label={compact ? '경로 상세 펼치기' : '경로 상세 접기'}>
          <span className="h-1.5 w-10 rounded-full bg-ink/15" />
        </button>
      )}
      <div className="flex items-start gap-3 px-4 pb-3 pt-2 md:pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold tracking-wide text-nav">길안내</p>
          <h2 className="mt-0.5 truncate text-[19px] font-extrabold leading-tight">{route.to.title}</h2>
          <p className="mt-0.5 truncate text-[13px] text-muted">
            {FLOOR_BY_ID[route.to.floorId].name}
            {route.to.subtitle ? ` · ${route.to.subtitle}` : ''}
            <span className="md:hidden"> · {meters(route.totalLength)}m · 도보 {formatDuration(route)}</span>
          </p>
        </div>
        <button type="button" onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-ink/5" aria-label="길안내 종료">
          <IconX />
        </button>
      </div>

      <div className={`mx-4 flex items-center gap-4 rounded-2xl bg-mist px-4 py-3 ${hideOnMobile}`}>
        <div>
          <p className="text-[22px] font-extrabold leading-none tabular-nums">
            {meters(route.totalLength)}
            <span className="ml-0.5 text-[14px] font-bold">m</span>
          </p>
          <p className="mt-1 text-[12px] text-muted">이동 거리 (근사)</p>
        </div>
        <div className="h-8 w-px bg-ink/10" />
        <div>
          <p className="text-[16px] font-bold leading-none">도보 {formatDuration(route)}</p>
          <p className="mt-1.5 text-[12px] text-muted">{floorsMoved ? `계단으로 ${floorsMoved}개 층 이동` : '같은 층 이동'}</p>
        </div>
      </div>

      <ol className={`mt-3 min-h-0 flex-1 overflow-y-auto px-4 pb-2 ${hideOnMobile}`}>
        <Step state={legIndex > 0 || legDone ? 'done' : 'current'} dot="start">
          <span className="font-semibold">{route.from.label}</span>에서 출발
        </Step>
        {route.legs.map((l, i) => {
          const state = i < legIndex || (i === legIndex && legDone) ? 'done' : i === legIndex ? 'current' : 'todo';
          return (
            <Fragment key={i}>
              <Step state={state} dot="walk" floorId={l.floorId} onFloor={l.floorId !== viewingFloorId ? () => onShowFloor(l.floorId) : undefined}>
                {l.transition && meters(l.length) < 3 ? (
                  <>
                    이미 <span className="font-semibold">{l.transition.coreName}</span>에 있어요
                  </>
                ) : l.transition ? (
                  <>
                    복도를 따라 <span className="font-semibold">{l.transition.coreName}</span>까지 약 {meters(l.length)}m
                  </>
                ) : (
                  <>
                    <span className="font-semibold">{route.to.title}</span>까지 약 {meters(l.length)}m
                  </>
                )}
                {l.approximate && <span className="ml-1 text-[12px] text-amber-700 dark:text-amber-300">(경로 데이터 부족 · 직선 안내)</span>}
              </Step>
              {l.transition && (
                <Step state={i < legIndex ? 'done' : i === legIndex && legDone ? 'current' : 'todo'} dot="stairs">
                  {l.transition.coreName}으로 <span className="font-semibold">{FLOOR_BY_ID[l.transition.toFloorId].name}</span>까지{' '}
                  {l.transition.direction === 'up' ? '올라가기' : '내려가기'}
                </Step>
              )}
            </Fragment>
          );
        })}
        <Step state={arrived ? 'current' : 'todo'} dot="end" isLast>
          <span className="font-semibold">{route.to.title}</span> 도착
        </Step>
      </ol>

      {approx && (
        <p className="mx-4 mb-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
          일부 구간은 도면 정보가 부족해 대략적인 방향만 안내합니다.
        </p>
      )}

      <div className="space-y-2 border-t border-ink/5 px-4 pb-4 pt-3 max-md:pb-3">
        {atStairs ? (
          <NextFloorButton route={route} legIndex={legIndex} onNextFloor={onNextFloor} />
        ) : arrived ? (
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300">
            <IconFlag />
            <p className="text-[14px] font-semibold">도착했습니다! 현재 위치가 {route.to.title}(으)로 바뀌었어요.</p>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl bg-mist px-4 py-3">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-nav opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-nav" />
            </span>
            <p className="text-[14px] font-medium">
              {FLOOR_BY_ID[leg.floorId].name}에서 {leg.transition ? `${leg.transition.coreName}(으)로` : '목적지로'} 안내 중…
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReplay}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink/10 bg-surface text-[13.5px] font-semibold hover:bg-ink/[0.03]"
          >
            <IconReplay width={16} height={16} /> 처음부터 다시
          </button>
          <button
            type="button"
            onClick={onToggleFollow}
            aria-pressed={followCam}
            className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border text-[13.5px] font-semibold transition ${
              followCam ? 'border-forest bg-forest text-white' : 'border-ink/10 bg-surface hover:bg-ink/[0.03]'
            }`}
            title="화살표를 따라 카메라가 이동합니다"
          >
            <IconVideo width={16} height={16} /> 화살표 따라가기
          </button>
        </div>
      </div>
    </section>
  );
}

function Step({
  state,
  dot,
  children,
  floorId,
  onFloor,
  isLast,
}: {
  state: 'done' | 'current' | 'todo';
  dot: 'start' | 'walk' | 'stairs' | 'end';
  children: ReactNode;
  floorId?: string;
  onFloor?: () => void;
  isLast?: boolean;
}) {
  const color = state === 'current' ? 'text-ink' : state === 'done' ? 'text-muted' : 'text-muted/80';
  const dotEl =
    dot === 'stairs' ? (
      <span className={`grid size-6 place-items-center rounded-full ${state === 'todo' ? 'bg-ink/5 text-muted' : 'bg-forest text-white'}`}>
        <IconStairs width={13} height={13} strokeWidth={2.5} />
      </span>
    ) : dot === 'start' ? (
      <span className="grid size-6 place-items-center">
        <span className="size-3 rounded-full border-[3px] border-white bg-blue-600 shadow ring-1 ring-blue-600/30" />
      </span>
    ) : dot === 'end' ? (
      <span className={`grid size-6 place-items-center rounded-full ${state === 'current' ? 'bg-nav text-white' : 'bg-nav/10 text-nav'}`}>
        <IconFlag width={12} height={12} strokeWidth={2.6} />
      </span>
    ) : (
      <span className="grid size-6 place-items-center">
        <span className={`size-2 rounded-full ${state === 'todo' ? 'bg-ink/15' : state === 'current' ? 'bg-nav' : 'bg-nav/40'}`} />
      </span>
    );
  return (
    <li className={`relative flex gap-3 pb-3 ${color}`}>
      {!isLast && <span className="absolute bottom-0 left-[11px] top-7 w-0.5 rounded bg-ink/[0.08]" />}
      <span className="relative shrink-0">{dotEl}</span>
      <div className={`min-w-0 flex-1 pt-0.5 text-[14px] leading-snug ${state === 'current' ? 'font-medium' : ''}`}>
        {floorId && (
          <button
            type="button"
            disabled={!onFloor}
            onClick={onFloor}
            className="mb-1 mr-1.5 inline-flex align-middle disabled:cursor-default"
            title={onFloor ? '이 층 보기' : undefined}
          >
            <FloorBadge floorId={floorId} className={onFloor ? 'hover:bg-forest/20' : ''} />
          </button>
        )}
        {children}
      </div>
    </li>
  );
}
