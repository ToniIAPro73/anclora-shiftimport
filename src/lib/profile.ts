export interface UserProfile {
  displayName: string;
  employeeIdentifiers: string[];
  employerName?: string;
  timezone: string;
  locale: string;
}

const PROFILE_STORAGE_KEY = 'anclora_shiftimport_profile_v1';

export const DEFAULT_USER_PROFILE: UserProfile = {
  displayName: '',
  employeeIdentifiers: [],
  timezone: 'Europe/Madrid',
  locale: 'es',
};

const normalizeProfile = (raw: Partial<UserProfile> | null | undefined): UserProfile => ({
  displayName: typeof raw?.displayName === 'string' ? raw.displayName.trim() : DEFAULT_USER_PROFILE.displayName,
  employeeIdentifiers: Array.isArray(raw?.employeeIdentifiers)
    ? raw.employeeIdentifiers.map((value) => String(value).trim()).filter(Boolean)
    : [...DEFAULT_USER_PROFILE.employeeIdentifiers],
  employerName: typeof raw?.employerName === 'string' && raw.employerName.trim() ? raw.employerName.trim() : undefined,
  timezone: typeof raw?.timezone === 'string' && raw.timezone.trim() ? raw.timezone.trim() : DEFAULT_USER_PROFILE.timezone,
  locale: typeof raw?.locale === 'string' && raw.locale.trim() ? raw.locale.trim() : DEFAULT_USER_PROFILE.locale,
});

export const loadUserProfile = (): UserProfile => {
  const data = localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!data) {
    return { ...DEFAULT_USER_PROFILE };
  }

  try {
    return normalizeProfile(JSON.parse(data) as Partial<UserProfile>);
  } catch (e) {
    console.error('Failed to parse user profile from storage', e);
    return { ...DEFAULT_USER_PROFILE };
  }
};

export const saveUserProfile = (profile: UserProfile): void => {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(normalizeProfile(profile)));
};

/**
 * Formats the identity line shown in dashboard headers.
 * Returns an empty string when there is nothing to show.
 */
export const formatProfileIdentity = (profile: UserProfile): string => {
  const parts: string[] = [];
  if (profile.displayName) {
    parts.push(profile.displayName);
  }
  const primaryIdentifier = profile.employeeIdentifiers[0];
  if (primaryIdentifier) {
    parts.push(`ID ${primaryIdentifier}`);
  }
  return parts.join(' · ');
};
