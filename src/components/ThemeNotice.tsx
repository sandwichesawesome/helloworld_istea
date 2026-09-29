// 접속 안내: 현재 테마(라이트/다크) 안내 + 모드 변경 + 다시 보지 않기
// - '다시 보지 않기' 를 누르기 전까지 접속할 때마다 표시
// - 모드 변경을 눌러도 안내창은 그대로 (바뀐 모드를 보며 다시 바꿀 수 있음)
// - ✕ / 바깥 클릭 / Esc: 이번 접속에서만 닫기
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Theme } from '../lib/theme';
import { IconMoon, IconSun, IconX } from './icons';

const KEY = 'istea.themeNotice';

function hiddenForever(): boolean {
  try {
    return localStorage.getItem(KEY) === 'hidden';
  } catch {
    return false;
  }
}

interface Props {
  theme: Theme;
  /** 접속 시점에 테마가 시스템 설정을 따르고 있었는지 (안내 문구 선택용) */
  fromSystem: boolean;
  /** 모드 변경 (안내창은 닫지 않음) */
  onSwitch(origin: { x: number; y: number }): void;
}

export function ThemeNotice({ theme, fromSystem, onSwitch }: Props) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  /** 문구 기준: 시스템 설정 / 예전에 고른 테마 / 이번에 안내창에서 바꿈 */
  const [source, setSource] = useState<'system' | 'saved' | 'changed'>(() => (fromSystem ? 'system' : 'saved'));
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const prevFocus = useRef<Element | null>(null);

  // 첫 화면이 그려진 뒤 살짝 늦게 띄움
  useEffect(() => {
    if (hiddenForever()) return;
    const t = window.setTimeout(() => setOpen(true), 450);
    return () => window.clearTimeout(t);
    // 접속 시 한 번만 판단
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement;
    primaryRef.current?.focus();
    return () => (prevFocus.current as HTMLElement | null)?.focus?.();
  }, [open]);

  const close = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 180);
  };

  const hideForever = () => {
    try {
      localStorage.setItem(KEY, 'hidden');
    } catch {
      /* 저장 불가 환경: 이번 접속에서만 닫힘 */
    }
    close();
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab' || !cardRef.current) return;
    // 포커스를 안내창 안에서만 순환
    const items = [...cardRef.current.querySelectorAll<HTMLElement>('button')];
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  const dark = theme === 'dark';
  const current = dark ? '다크' : '라이트';
  const other = dark ? '라이트' : '다크';
  const CurrentIcon = dark ? IconMoon : IconSun;
  const OtherIcon = dark ? IconSun : IconMoon;

  return (
    <div className={`fixed inset-0 z-50 grid place-items-center p-5 ${closing ? 'notice-closing' : ''}`} onKeyDown={onKeyDown}>
      <div className="notice-backdrop absolute inset-0 bg-[#07111f]/35 backdrop-blur-[2px] dark:bg-black/55" onClick={close} aria-hidden />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-notice-title"
        className="panel notice-card relative w-full max-w-[360px] rounded-3xl px-6 pb-5 pt-7 text-center"
      >
        <button
          type="button"
          onClick={close}
          className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-muted hover:bg-ink/5"
          aria-label="닫기"
        >
          <IconX width={17} height={17} />
        </button>

        <span
          className={`mx-auto grid size-14 place-items-center rounded-2xl ${
            dark ? 'bg-indigo-400/15 text-indigo-300' : 'bg-amber-100 text-amber-500'
          }`}
        >
          <CurrentIcon width={28} height={28} strokeWidth={2} />
        </span>

        <p id="theme-notice-title" className="mt-4 text-[16px] font-bold leading-relaxed text-ink" aria-live="polite">
          {source === 'changed' ? (
            <>
              <span className="text-forest-dark">{current} 모드</span>로
              <br />
              변경되었습니다.
            </>
          ) : (
            <>
              {source === 'system' ? '시스템 설정에 따라' : '이전에 선택한'}
              <br />
              <span className="text-forest-dark">{current} 모드</span>로 설정되었습니다.
            </>
          )}
        </p>

        <button
          ref={primaryRef}
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onSwitch({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
            setSource('changed');
          }}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-forest text-[15px] font-bold text-white shadow-[0_8px_20px_-10px_rgb(0_91_172/0.8)] outline-none transition hover:brightness-110 focus-visible:ring-4 focus-visible:ring-forest/35 active:scale-[0.98]"
        >
          <OtherIcon width={18} height={18} strokeWidth={2.2} />
          {other} 모드로 변경하기
        </button>

        <button
          type="button"
          onClick={hideForever}
          className="mt-2 h-10 w-full rounded-xl text-[14px] font-medium text-muted transition hover:bg-ink/5 hover:text-ink"
        >
          다시 보지 않기
        </button>
      </div>
    </div>
  );
}
