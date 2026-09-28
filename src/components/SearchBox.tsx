import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { NavLocation, Space } from '../types';
import { searchSpaces, floorLabel } from '../lib/search';
import { SPACE_BY_ID } from '../data/building';
import { FEATURED_SPACES, METERS_PER_UNIT, SUGGESTED_QUERIES } from '../data/overrides';
import { IconClock, IconSearch, IconX, KindIcon } from './icons';

export interface SearchBoxHandle {
  focus(): void;
  setQuery(q: string): void;
}

interface Props {
  near: NavLocation;
  recent: string[];
  onSelect(space: Space): void;
  /** 드롭다운 열림/닫힘 알림 (아래 패널 숨김용) */
  onOpenChange?(open: boolean): void;
}

function Highlight({ text, q }: { text: string; q: string }): ReactNode {
  const tokens = q.trim().split(/\s+/).filter((t) => t.length >= 1);
  const lower = text.toLowerCase();
  for (const t of tokens.sort((a, b) => b.length - a.length)) {
    const i = lower.indexOf(t.toLowerCase());
    if (i >= 0)
      return (
        <>
          {text.slice(0, i)}
          <mark className="rounded-sm bg-amber-200/70 dark:bg-amber-400/30 px-0.5 text-inherit">{text.slice(i, i + t.length)}</mark>
          {text.slice(i + t.length)}
        </>
      );
  }
  return text;
}

export function FloorBadge({ floorId, className = '' }: { floorId: string; className?: string }) {
  return (
    <span
      className={`inline-flex h-6 min-w-9 shrink-0 items-center justify-center rounded-md bg-forest/10 px-1.5 text-[11px] font-extrabold tracking-wide text-forest-dark tabular-nums ${className}`}
    >
      {floorId}
    </span>
  );
}

export const SearchBox = forwardRef<SearchBoxHandle, Props>(function SearchBox({ near, recent, onSelect, onOpenChange }, ref) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    setQuery: (q) => {
      setQuery(q);
      setOpen(true);
      inputRef.current?.focus();
    },
  }));

  const res = useMemo(() => searchSpaces(query, near), [query, near]);
  const trimmed = query.trim();
  const items: Space[] = trimmed
    ? res.results.map((r) => r.space)
    : [...recent, ...FEATURED_SPACES.filter((id) => !recent.includes(id))].map((id) => SPACE_BY_ID[id]).filter(Boolean);

  useEffect(() => setActive(0), [query]);

  const openChangeRef = useRef(onOpenChange);
  openChangeRef.current = onOpenChange;
  useEffect(() => openChangeRef.current?.(open), [open]);

  // 바깥 클릭 → 닫기
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const choose = (s: Space | undefined) => {
    if (!s) return;
    onSelect(s);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[active] ?? items[0]);
    } else if (e.key === 'Escape') {
      if (query) setQuery('');
      else {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
  };

  const distanceOf = (s: Space) => {
    const r = res.results.find((x) => x.space === s);
    if (!r || s.floorId !== near.floorId) return null;
    return `약 ${Math.max(5, Math.round((r.distance * METERS_PER_UNIT) / 5) * 5)}m`;
  };

  const renderItem = (s: Space, i: number, extra?: ReactNode) => (
    <li
      key={s.id}
      id={`${listId}-${i}`}
      role="option"
      aria-selected={i === active}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => choose(s)}
      onPointerMove={() => setActive(i)}
      className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${i === active ? 'bg-forest/[0.07]' : ''}`}
    >
      <FloorBadge floorId={s.floorId} />
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-full ${
          s.kind === 'restroom' ? 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300' : s.kind === 'stairs' || s.kind === 'entrance' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300' : 'bg-stone-100 text-stone-600 dark:bg-stone-400/15 dark:text-stone-300'
        }`}
      >
        <KindIcon kind={s.kind} width={16} height={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-ink">
          <Highlight text={s.title} q={trimmed} />
        </span>
        <span className="block truncate text-[12.5px] text-muted">
          {floorLabel(s.floorId)}
          {s.subtitle ? (
            <>
              {' · '}
              <Highlight text={s.subtitle} q={trimmed} />
            </>
          ) : null}
        </span>
      </span>
      {extra}
    </li>
  );

  return (
    <div ref={boxRef} className="relative">
      <div className="flex h-12 items-center gap-2 rounded-2xl bg-mist px-3.5 ring-forest/40 transition focus-within:bg-surface focus-within:ring-2">
        <IconSearch className="shrink-0 text-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="호실 번호, 이름, 용도 검색 (예: 354, 화장실)"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/80"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && items.length ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          enterKeyHint="search"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="grid size-7 place-items-center rounded-full text-muted hover:bg-ink/5"
            aria-label="검색어 지우기"
          >
            <IconX width={16} height={16} />
          </button>
        ) : (
          <kbd className="hidden rounded-md border border-ink/10 bg-surface px-1.5 text-[11px] text-muted md:block">/</kbd>
        )}
      </div>

      {open && (
        <div className="panel fade-in absolute inset-x-0 top-[calc(100%+8px)] z-30 max-h-[min(70vh,520px)] overflow-y-auto rounded-2xl p-2">
          {!trimmed && (
            <div className="px-2 pb-2 pt-1.5">
              <p className="mb-2 text-[12px] font-bold tracking-wide text-muted">추천 검색어</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_QUERIES.map((s) => (
                  <button
                    key={s.query}
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => setQuery(s.query)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-forest/15 bg-surface px-3 py-1.5 text-[13px] font-medium text-forest-dark transition hover:border-forest/40 hover:bg-forest/5"
                  >
                    <KindIcon kind={s.icon} width={14} height={14} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!trimmed && items.length > 0 && (
            <p className="mt-1 px-3 pb-1 pt-2 text-[12px] font-bold tracking-wide text-muted">
              {recent.length ? '최근 · 추천 장소' : '추천 장소'}
            </p>
          )}
          {trimmed && res.byDistance && (
            <p className="px-3 pb-1 pt-1.5 text-[12px] font-bold tracking-wide text-muted">현재 위치에서 가까운 순</p>
          )}
          <ul id={listId} role="listbox" aria-label="검색 결과">
            {items.map((s, i) =>
              renderItem(
                s,
                i,
                !trimmed && recent.includes(s.id) ? (
                  <IconClock width={15} height={15} className="text-muted/70" />
                ) : trimmed ? (
                  distanceOf(s) && <span className="shrink-0 text-[12px] font-medium text-muted">{distanceOf(s)}</span>
                ) : null,
              ),
            )}
          </ul>
          {trimmed && !items.length && (
            <div className="px-4 py-8 text-center">
              <p className="text-[15px] font-semibold">검색 결과가 없어요</p>
              <p className="mt-1 text-[13px] text-muted">호실 번호(예: 354), 동+호수(예: 5남 354), 층(예: 3층 화장실)으로 찾아보세요.</p>
            </div>
          )}
          {trimmed && res.total > res.results.length && (
            <p className="px-3 pb-1.5 pt-2 text-center text-[12px] text-muted">
              외 {res.total - res.results.length}곳 — 층이나 동을 함께 입력하면 좁혀져요 (예: “3층 5남 35”)
            </p>
          )}
        </div>
      )}
    </div>
  );
});
