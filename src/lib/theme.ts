// 라이트/다크 테마: <html data-theme> 로 CSS 변수 세트를 바꾼다.
// - 처음엔 시스템 설정(prefers-color-scheme), 사용자가 토글하면 그 선택을 기억(localStorage)
// - 지원 브라우저에서는 View Transition 으로 토글 버튼에서 원형으로 퍼지며 전환
import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'light' | 'dark';

const KEY = 'istea.theme';
const META_COLOR: Record<Theme, string> = { light: '#005bac', dark: '#0a1626' };

const current = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[t]);
}

function savedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

type VTDocument = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void> };
};

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(current);

  useEffect(() => {
    apply(current());
    // 직접 고른 적이 없으면 시스템 설정 변경을 따라감
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (savedTheme()) return;
      const t: Theme = mq.matches ? 'dark' : 'light';
      apply(t);
      setTheme(t);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  /** origin: 전환 애니메이션이 퍼져 나갈 화면 좌표 (보통 토글 버튼 중심) */
  const toggle = useCallback((origin?: { x: number; y: number }) => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* 저장 불가 환경 무시 */
    }
    const commit = () => {
      apply(next);
      setTheme(next);
    };
    const doc = document as VTDocument;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!doc.startViewTransition || reduce) {
      commit();
      return;
    }
    const x = origin?.x ?? window.innerWidth - 40;
    const y = origin?.y ?? 40;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const vt = doc.startViewTransition(() => flushSync(commit));
    vt.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 560, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      })
      .catch(() => {});
  }, []);

  return { theme, toggle };
}
