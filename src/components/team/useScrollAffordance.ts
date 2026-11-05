import { useCallback, useEffect, useRef } from 'react';

/**
 * Horizontal-scroll affordance for a tab strip: marks the element with `data-scroll-start` / `data-scroll-end` ("true" while there is
 * more content on that side, so CSS can fade that edge) and keeps the active tab inside the visible area.
 * No gesture is required to discover or reach a tab: the strip stays keyboard-focusable and the active tab is always scrolled into view.
 * The returned callback ref also works for strips that mount later (e.g. the sub-tabs of the Assignments tab).
 */
function mark(el: HTMLElement) {
  const max = el.scrollWidth - el.clientWidth;
  el.setAttribute('data-scroll-start', String(el.scrollLeft > 1));
  el.setAttribute('data-scroll-end', String(max > 1 && el.scrollLeft < max - 1));
}

export function useScrollAffordance<T extends HTMLElement>(activeKey: string) {
  const ref = useRef<T | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

  const setRef = useCallback((element: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    ref.current = element;
    if (!element) return;
    const update = () => mark(element);
    element.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    observer?.observe(element);
    window.addEventListener('resize', update);
    update();
    cleanup.current = () => {
      element.removeEventListener('scroll', update);
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => () => { cleanup.current?.(); }, []);

  useEffect(() => {
    const el = ref.current;
    const active = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el || !active || typeof active.scrollIntoView !== 'function') return;
    active.scrollIntoView({ block: 'nearest', inline: 'center' });
    mark(el);
  }, [activeKey]);

  return setRef;
}
