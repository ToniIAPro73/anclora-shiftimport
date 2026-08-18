import { useId } from 'react';

interface FlagIconProps {
  className?: string;
}

/**
 * Compact inline SVG flags for the language toggle. Emoji flags (🇪🇸/🇬🇧)
 * render as bare two-letter country-code text on platforms without color
 * emoji font support (notably Windows/Linux Chromium) — an inline SVG
 * renders identically everywhere, so it's used instead.
 */
export const SpainFlagIcon = ({ className }: FlagIconProps) => {
  const clipId = useId();
  return (
    <svg
      className={className}
      viewBox="0 0 60 40"
      width="18"
      height="12"
      aria-hidden="true"
      focusable="false"
    >
      <clipPath id={clipId}>
        <rect width="60" height="40" rx="4" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect width="60" height="40" fill="#AA151B" />
        <rect y="10" width="60" height="20" fill="#F1BF00" />
      </g>
    </svg>
  );
};

export const UkFlagIcon = ({ className }: FlagIconProps) => {
  const clipId = useId();
  return (
    <svg
      className={className}
      viewBox="0 0 60 40"
      width="18"
      height="12"
      aria-hidden="true"
      focusable="false"
    >
      <clipPath id={clipId}>
        <rect width="60" height="40" rx="4" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect width="60" height="40" fill="#012169" />
        <path stroke="#fff" strokeWidth="6" d="M0,0 L60,40 M60,0 L0,40" />
        <path stroke="#C8102E" strokeWidth="4" d="M0,0 L60,40 M60,0 L0,40" />
        <path stroke="#fff" strokeWidth="10" d="M30,0 V40 M0,20 H60" />
        <path stroke="#C8102E" strokeWidth="6" d="M30,0 V40 M0,20 H60" />
      </g>
    </svg>
  );
};
