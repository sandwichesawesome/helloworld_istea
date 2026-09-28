import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { NavLocation, Point, Route, Space } from './types';
import {
  DEFAULT_START,
  ENTRANCE_CHOICES,
  ENTRANCE_FLOOR_ID,
  FLOORS,
  FLOOR_BY_ID,
  SPACE_BY_ID,
  locationAt,
  locationOfSpace,
  type EntranceChoice,
} from './data/building';
import { SITE } from './data/site';
import { planRoute } from './lib/routing';
import { warmUp } from './lib/navgrid';
import type { Insets } from './lib/viewport';
import { MapView, type MapViewHandle } from './components/MapView';
import { SearchBox, type SearchBoxHandle } from './components/SearchBox';
import { NextFloorButton, RoutePanel } from './components/RoutePanel';
import { EntrancePickBanner, FloorSwitcher, Legend, ResetLocationButton, SpaceCard, StartPicker, ThemeToggle, ZoomControls } from './components/Controls';
import { useTheme } from './lib/theme';
import { IconLocate, IconX } from './components/icons';

const RECENT_KEY = 'istea.recent';
function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((id) => typeof id === 'string' && SPACE_BY_ID[id]).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function useIsDesktop() {
  const q = '(min-width: 768px)';
  const [v, setV] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setV(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return v;
}

export default function App() {
  const [floorId, setFloorId] = useState(DEFAULT_START.floorId);
  const [enterDir, setEnterDir] = useState<'up' | 'down' | 'none'>('none');
  const [start, setStart] = useState<NavLocation>(DEFAULT_START);
  const [selectedId, setSelectedId] = useState<string>();
  const [route, setRoute] = useState<Route | null>(null);
  const [legIndex, setLegIndex] = useState(0);
  const [legDone, setLegDone] = useState(false);
  const [playToken, setPlayToken] = useState(0);
  const [followCam, setFollowCam] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [sheetCompact, setSheetCompact] = useState(true);
  const [entrancePick, setEntrancePick] = useState(false); // 현재 위치 초기화 → 출입구 선택 중
  const [emphasisId, setEmphasisId] = useState<string>();
  // 헤더 드롭다운(출발 위치 · 검색)이 열리면 아래 카드/경로 패널을 내려 숨김 → 겹침 방지
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const headerMenuOpen = startMenuOpen || searchOpen;
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [toast, setToast] = useState<string | null>(null);
  const [insets, setInsets] = useState<Insets>({ top: 16, right: 80, bottom: 16, left: 16 });

  const mapRef = useRef<MapViewHandle>(null);
  const searchRef = useRef<SearchBoxHandle>(null);
  const asideRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const { theme, toggle: toggleTheme } = useTheme();

  const floor = FLOOR_BY_ID[floorId];
  const selected = selectedId ? SPACE_BY_ID[selectedId] : undefined;
  const leg = route?.legs[legIndex];
  const atStairs = !!(route && legDone && leg?.transition);

  useEffect(() => warmUp(FLOORS), []);

  const toastTimer = useRef(0);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const routeRef = useRef(route);
  routeRef.current = route;
  const legIndexRef = useRef(legIndex);
  legIndexRef.current = legIndex;

  const changeFloor = useCallback((id: string) => {
    setFloorId((cur) => {
      if (cur !== id) setEnterDir(FLOOR_BY_ID[id].level > FLOOR_BY_ID[cur].level ? 'up' : 'down');
      return id;
    });
  }, []);

  const pushRecent = (id: string) =>
    setRecent((r) => {
      const next = [id, ...r.filter((x) => x !== id)].slice(0, 5);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* 저장 불가 환경 무시 */
      }
      return next;
    });

  const navigateTo = useCallback(
    (space: Space, from: NavLocation = start) => {
      setSelectedId(space.id);
      setPickMode(false);
      setEntrancePick(false);
      pushRecent(space.id);
      if (from.spaceId === space.id) {
        showToast(`이미 ${space.title}에 있어요`);
        changeFloor(space.floorId);
        mapRef.current?.focusSpace(space);
        return;
      }
      const r = planRoute(from, space);
      setRoute(r);
      setSheetCompact(true);
      setLegIndex(0);
      setLegDone(false);
      changeFloor(r.legs[0].floorId);
      setPlayToken((t) => t + 1);
      try {
        history.replaceState(null, '', `#to=${encodeURIComponent(space.id)}`);
      } catch {
        /* noop */
      }
    },
    [start, changeFloor, showToast],
  );

  const clearRoute = () => {
    setRoute(null);
    setLegIndex(0);
    setLegDone(false);
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch {
      /* noop */
    }
  };

  const onLegDone = useCallback(() => {
    setLegDone(true);
    const r = routeRef.current;
    // 최종 도착 → 현재 위치를 목적지로 갱신 (다음 검색의 출발점)
    if (r && legIndexRef.current === r.legs.length - 1) setStart(locationOfSpace(r.to));
  }, []);

  const nextFloor = useCallback(() => {
    if (!route || !route.legs[legIndex + 1]) return;
    const next = route.legs[legIndex + 1];
    setLegIndex(legIndex + 1);
    setLegDone(false);
    changeFloor(next.floorId);
  }, [route, legIndex, changeFloor]);

  const replay = () => {
    if (!route) return;
    setLegIndex(0);
    setLegDone(false);
    changeFloor(route.legs[0].floorId);
    setPlayToken((t) => t + 1);
  };

  // ---------- 현재 위치 초기화: 1층으로 이동 후 출입구를 반짝이게 해서 선택 ----------
  const cancelEntrancePick = useCallback(() => {
    setEntrancePick(false);
    setEmphasisId(undefined);
  }, []);

  const startEntrancePick = () => {
    if (entrancePick) return cancelEntrancePick();
    clearRoute();
    setSelectedId(undefined);
    setPickMode(false);
    setEntrancePick(true);
    changeFloor(ENTRANCE_FLOOR_ID);
  };

  const chooseEntrance = useCallback(
    (c: EntranceChoice) => {
      setStart(c.location);
      setEntrancePick(false);
      setEmphasisId(undefined);
      mapRef.current?.focusSpace(c.space);
      showToast(`현재 위치: ${c.location.label}`);
    },
    [showToast],
  );

  // 다른 층으로 넘어가면 선택 모드 종료
  useEffect(() => {
    if (entrancePick && floorId !== ENTRANCE_FLOOR_ID) cancelEntrancePick();
  }, [entrancePick, floorId, cancelEntrancePick]);

  // 선택 모드 진입(및 안내 배너로 가림 영역이 바뀐 뒤) → 1층 전체가 보이도록 맞춤
  useEffect(() => {
    // 가장자리 출입구의 이름표가 잘리지 않도록 여백을 넉넉히
    if (entrancePick) mapRef.current?.fitFloor(isDesktop ? 72 : 36, 'building');
  }, [entrancePick, insets.top, insets.bottom, isDesktop]);

  const glowSpaces = useMemo(
    () => (entrancePick ? ENTRANCE_CHOICES.map((c) => ({ id: c.space.id, label: c.label })) : undefined),
    [entrancePick],
  );

  /** 층 버튼: 주변 배치가 있는 층(1층)은 건물 바깥까지 한눈에 보이도록 줌아웃 */
  const onFloorButton = (id: string) => {
    changeFloor(id);
    if (SITE[id]) mapRef.current?.fitFloor(isDesktop ? 28 : 10, 'site');
  };

  const onSpaceClick = useCallback(
    (s: Space | null) => {
      if (entrancePick) {
        const c = s ? ENTRANCE_CHOICES.find((x) => x.space.id === s.id) : undefined;
        if (c) chooseEntrance(c);
        else showToast('반짝이는 출입구 중 하나를 선택해 주세요');
        return;
      }
      setSelectedId(s?.id);
    },
    [entrancePick, chooseEntrance, showToast],
  );

  const onPick = useCallback(
    (p: Point) => {
      const loc = locationAt(floorId, p.x, p.y);
      setStart(loc);
      setPickMode(false);
      showToast(`출발 위치: ${loc.label}`);
    },
    [floorId, showToast],
  );

  // 딥링크: #to=3F-5남-354
  useEffect(() => {
    const m = location.hash.match(/to=([^&]+)/);
    const s = m ? SPACE_BY_ID[decodeURIComponent(m[1])] : undefined;
    if (s) setTimeout(() => navigateTo(s), 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 단축키
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.('input, textarea');
      if (typing) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === '+' || e.key === '=') mapRef.current?.zoomBy(1.4);
      else if (e.key === '-') mapRef.current?.zoomBy(1 / 1.4);
      else if (e.key === '0') mapRef.current?.fitFloor();
      else if (e.key === 'Escape') {
        setPickMode(false);
        cancelEntrancePick();
      }
      else if (e.key === 'Enter' && atStairs) nextFloor();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [atStairs, nextFloor, cancelEntrancePick]);

  // 지도 가림 영역(패널) 측정 → 카메라 맞춤 영역
  useLayoutEffect(() => {
    const measure = () => {
      const H = window.innerHeight;
      const b = bannerRef.current?.getBoundingClientRect();
      if (isDesktop) {
        const a = asideRef.current?.getBoundingClientRect();
        setInsets({ top: b ? b.bottom + 12 : 16, right: 84, bottom: 16, left: a ? a.right + 12 : 16 });
      } else {
        const h = headerRef.current?.getBoundingClientRect();
        const s = sheetRef.current?.getBoundingClientRect();
        const top = Math.max(h?.bottom ?? 8, b?.bottom ?? 0) + 8;
        setInsets({ top, right: entrancePick ? 8 : 66, bottom: s && s.height > 0 ? H - s.top + 8 : 12, left: 8 });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [asideRef.current, headerRef.current, sheetRef.current, bannerRef.current]) if (el) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [isDesktop, route, selectedId, sheetCompact, entrancePick]);

  const routeFloors = useMemo(() => new Set(route?.legs.map((l) => l.floorId) ?? []), [route]);
  const offRouteFloor = route && leg && leg.floorId !== floorId;
  // 경로와 다른 공간을 지도에서 누르면 그 공간 카드를 우선 표시 (닫으면 경로 패널로 복귀)
  const showCard = !!selected && selected.id !== route?.to.id;
  const showSheet = !!route || !!selected;
  const showRightRail = isDesktop || !entrancePick;
  const bannerAvail = window.innerWidth - insets.left - 280; // 오른쪽 위 도구(초기화 · 테마) 자리 비움
  const desktopBannerStyle = {
    top: 16,
    width: Math.min(600, bannerAvail),
    left: insets.left + Math.max(0, (bannerAvail - Math.min(600, bannerAvail)) / 2),
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <MapView
        ref={mapRef}
        floor={floor}
        insets={insets}
        start={start}
        selectedId={selectedId}
        route={route}
        legIndex={legIndex}
        legDone={legDone}
        playToken={playToken}
        followCam={followCam}
        pickMode={pickMode}
        enterDir={enterDir}
        glowSpaces={glowSpaces}
        glowEmphasisId={emphasisId}
        hideStart={entrancePick}
        onSpaceClick={onSpaceClick}
        onPick={onPick}
        onLegDone={onLegDone}
      />

      {/* 좌측(모바일: 상단) 패널 */}
      <aside
        ref={asideRef}
        className="pointer-events-none absolute inset-x-2 top-2 z-20 flex flex-col gap-3 md:inset-x-auto md:bottom-4 md:left-4 md:top-4 md:w-[392px]"
      >
        <div ref={headerRef} className="panel pointer-events-auto relative z-10 rounded-3xl p-2.5 md:p-3">
          <div className="hidden items-center gap-2.5 px-1.5 pb-2.5 pt-0.5 md:flex">
            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#b8dcf6] shadow-sm ring-1 ring-ink/5">
              <img src="/icons/duck.png" alt="" className="h-[34px] w-auto translate-y-px select-none" draggable={false} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-[16px] font-extrabold leading-tight tracking-tight">5호관 길찾기</h1>
              <p className="hidden text-[11.5px] text-muted md:block">B1–4F 실내 평면도 · 호실 검색과 경로 안내</p>
            </div>
          </div>
          <div className="hidden md:block">
            <StartPicker
              start={start}
              onOpenChange={setStartMenuOpen}
              onChange={(l) => {
                cancelEntrancePick();
                setStart(l);
                changeFloor(l.floorId);
                showToast(`출발 위치: ${l.label}`);
              }}
              onPickOnMap={() => {
                cancelEntrancePick();
                setPickMode(true);
                setSelectedId(undefined);
              }}
            />
            <div className="mx-1 my-2 h-px bg-ink/5" />
          </div>
          <SearchBox ref={searchRef} near={start} recent={recent} onSelect={(s) => navigateTo(s)} onOpenChange={setSearchOpen} />
          <div className="mt-1.5 md:hidden">
            <StartPicker
              start={start}
              onOpenChange={setStartMenuOpen}
              onChange={(l) => {
                cancelEntrancePick();
                setStart(l);
                changeFloor(l.floorId);
              }}
              onPickOnMap={() => {
                cancelEntrancePick();
                setPickMode(true);
                setSelectedId(undefined);
              }}
            />
          </div>
        </div>

        {entrancePick && !isDesktop && (
          <EntrancePickBanner
            bannerRef={bannerRef}
            className="pointer-events-auto"
            choices={ENTRANCE_CHOICES}
            current={start}
            onChoose={chooseEntrance}
            onEmphasis={setEmphasisId}
            onCancel={cancelEntrancePick}
          />
        )}

        {showSheet && (
          <div
            ref={sheetRef}
            inert={headerMenuOpen || undefined}
            aria-hidden={headerMenuOpen || undefined}
            className={`panel sheet-slide flex min-h-0 flex-col overflow-hidden rounded-3xl max-md:fixed max-md:inset-x-2 max-md:bottom-2 max-md:max-h-[46dvh] md:max-h-full ${
              headerMenuOpen ? 'sheet-hidden pointer-events-none' : 'pointer-events-auto'
            }`}
          >
            {route && !showCard ? (
              <RoutePanel
                route={route}
                legIndex={legIndex}
                legDone={legDone}
                viewingFloorId={floorId}
                followCam={followCam}
                onToggleFollow={() => setFollowCam((v) => !v)}
                onNextFloor={nextFloor}
                onReplay={replay}
                onClose={clearRoute}
                onShowFloor={changeFloor}
                compact={sheetCompact}
                onToggleCompact={() => setSheetCompact((v) => !v)}
              />
            ) : selected ? (
              <SpaceCard
                space={selected}
                isStart={start.spaceId === selected.id}
                onNavigate={() => navigateTo(selected)}
                onSetStart={() => {
                  setStart(locationOfSpace(selected));
                  showToast(`출발 위치: ${FLOOR_BY_ID[selected.floorId].name} ${selected.title}`);
                }}
                onClose={() => setSelectedId(undefined)}
              />
            ) : null}
          </div>
        )}
      </aside>

      {/* 오른쪽 위: 현재 위치 초기화 (모바일은 출입구 선택 중 지도를 넓게 쓰도록 숨김) */}
      {showRightRail && (
        <div
          className="absolute right-3 z-20 flex items-center gap-2 max-md:flex-col-reverse max-md:items-end"
          style={{ top: isDesktop ? 16 : insets.top }}
        >
          <ResetLocationButton active={entrancePick} compact={!isDesktop} onClick={startEntrancePick} />
          <ThemeToggle theme={theme} compact={!isDesktop} onToggle={toggleTheme} />
        </div>
      )}
      {entrancePick && isDesktop && (
        <EntrancePickBanner
          bannerRef={bannerRef}
          className="absolute z-30"
          style={desktopBannerStyle}
          choices={ENTRANCE_CHOICES}
          current={start}
          onChoose={chooseEntrance}
          onEmphasis={setEmphasisId}
          onCancel={cancelEntrancePick}
        />
      )}

      {showRightRail && (
        <FloorSwitcher
          floors={FLOORS}
          current={floorId}
          onChange={onFloorButton}
          routeFloors={routeFloors}
          destFloorId={route?.to.floorId}
          style={isDesktop ? { top: '50%', transform: 'translateY(-50%)' } : { top: insets.top + 122 }}
        />
      )}
      <ZoomControls
        onZoomIn={() => mapRef.current?.zoomBy(1.4)}
        onZoomOut={() => mapRef.current?.zoomBy(1 / 1.4)}
        onFit={() => mapRef.current?.fitFloor()}
      />
      {!(atStairs && isDesktop) && !entrancePick && <Legend floor={floor} style={{ left: insets.left }} />}

      {/* 계단 도착 → 다음 층 버튼 (데스크톱 플로팅) */}
      {atStairs && route && isDesktop && floorId === leg!.floorId && (
        <div
          className="cta-in absolute bottom-6 z-20 w-[360px] -translate-x-1/2"
          style={{ left: insets.left + (window.innerWidth - insets.left - insets.right) / 2 }}
        >
          <NextFloorButton route={route} legIndex={legIndex} onNextFloor={nextFloor} big />
        </div>
      )}

      {/* 경로와 다른 층을 보고 있을 때 */}
      {offRouteFloor && (
        <div
          className="fade-in absolute z-20 -translate-x-1/2"
          style={{ top: insets.top + 4, left: insets.left + (window.innerWidth - insets.left - insets.right) / 2 }}
        >
          <button
            type="button"
            onClick={() => changeFloor(leg!.floorId)}
            className="panel flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] font-semibold"
          >
            <span className="size-2 rounded-full bg-nav" />
            안내 중인 경로는 {FLOOR_BY_ID[leg!.floorId].name}에 있어요 · <span className="text-nav">이동</span>
          </button>
        </div>
      )}

      {/* 출발 위치 지정 모드 */}
      {pickMode && (
        <div
          className="fade-in absolute z-30 -translate-x-1/2"
          style={{ top: insets.top + 4, left: insets.left + (window.innerWidth - insets.left - insets.right) / 2 }}
        >
          <div className="flex items-center gap-3 rounded-full bg-blue-600 py-2 pl-4 pr-2 text-[14px] font-semibold text-white shadow-lg">
            <IconLocate width={17} height={17} />
            지도에서 현재 위치를 탭하세요 ({floor.name})
            <button type="button" onClick={() => setPickMode(false)} className="grid size-7 place-items-center rounded-full bg-white/20 hover:bg-white/30" aria-label="취소">
              <IconX width={15} height={15} />
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fade-in pointer-events-none absolute z-40 -translate-x-1/2 rounded-full bg-ink/90 px-4 py-2 text-[13.5px] font-medium text-surface shadow-lg"
          style={{ bottom: isDesktop ? 24 : insets.bottom + 8, left: insets.left + (window.innerWidth - insets.left - insets.right) / 2 }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
