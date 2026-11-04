import { RefObject, useCallback, useEffect, useState } from 'react';

/** Tracks whether a scroller has content above/below its visible area (re-measured on scroll, resize and when `deps` change). */
export function useVerticalScrollHints(ref: RefObject<HTMLElement>, deps: ReadonlyArray<unknown>) {
  const [state, setState] = useState({ up: false, down: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const up = el.scrollTop > 4;
    const down = el.scrollHeight - el.clientHeight - el.scrollTop > 4;
    setState((current) => (current.up === up && current.down === down ? current : { up, down }));
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    measure();
    el?.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, ...deps]);

  const scrollBy = useCallback((direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ top: direction * Math.max(120, el.clientHeight * 0.7), behavior: reduce ? 'auto' : 'smooth' });
  }, [ref]);

  return { ...state, scrollBy };
}
