import { useEffect, useState } from 'react';

export type Route = '/' | '/pricing' | '/login' | '/signup' | '/forgot-password' | '/reset-password' | '/app';

const KNOWN_ROUTES: Route[] = ['/', '/pricing', '/login', '/signup', '/forgot-password', '/reset-password', '/app'];

/**
 * Fase 1.2A public/private routing. Unknown paths (including legacy deep
 * links) fall back to '/app': the dashboard was the only surface before this
 * task existed, and preserving that default avoids breaking bookmarked URLs.
 */
export function resolveRoute(pathname: string): Route {
  const normalized = (pathname.replace(/\/+$/, '') || '/') as Route;
  return KNOWN_ROUTES.includes(normalized) ? normalized : '/app';
}

export function getCurrentRoute(): Route {
  if (typeof window === 'undefined') {
    return '/app';
  }
  return resolveRoute(window.location.pathname);
}

/** query, when given, is appended as-is (e.g. 'plan=team') — used to carry
 * UX intent (Fase 1.2G.5's pricing→signup plan hint), never security-
 * sensitive data; the receiving endpoint always re-validates it. */
export function navigate(route: Route, query?: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const target = query ? `${route}?${query}` : route;
  if (window.location.pathname + window.location.search === target) {
    return;
  }
  window.history.pushState({}, '', target);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(getCurrentRoute());

  useEffect(() => {
    const onPopState = () => setRoute(getCurrentRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return route;
}
