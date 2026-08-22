import { SessionInfo } from './session';

export type PostLoginDestination = 'org-selector' | 'my-shifts' | 'team';

/**
 * Fase 1.2A.2 post-login router. The dashboard at /app is a single physical
 * route that already adapts its content by role (EMPLOYEE sees only their
 * own shifts; ADMIN sees the team switcher + Members action) — this
 * resolver names which of those destinations a session lands on, so login
 * flow and page metadata can be driven from one contractual source instead
 * of duplicating the role check ad hoc.
 */
export function resolvePostLoginDestination(session: SessionInfo, needsOrgChoice: boolean): PostLoginDestination {
  if (needsOrgChoice || !session.organizationId) {
    return 'org-selector';
  }
  return session.role === 'EMPLOYEE' ? 'my-shifts' : 'team';
}

export const POST_LOGIN_TITLES: Record<PostLoginDestination, string> = {
  'org-selector': 'Selecciona organización · Anclora ShiftImport',
  'my-shifts': 'Mis turnos · Anclora ShiftImport',
  team: 'Equipo · Anclora ShiftImport',
};
