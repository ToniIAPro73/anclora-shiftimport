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

export function navigate(route: Route): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (window.location.pathname === route) {
    return;
  }
  window.history.pushState({}, '', route);
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
