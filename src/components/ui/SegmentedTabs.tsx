import { useRef, type KeyboardEvent } from 'react';
import './SegmentedTabs.css';

export interface SegmentedTab<T extends string> {
  id: T;
  label: string;
  /** Compact label used on narrow screens so three tabs always fit. */
  shortLabel?: string;
}

interface SegmentedTabsProps<T extends string> {
  tabs: ReadonlyArray<SegmentedTab<T>>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  /** Prefix for tab ids (`<prefix>-<id>`); the panel must be aria-labelledby the active one. */
  idPrefix: string;
  panelId: string;
  testIdPrefix?: string;
}

/**
 * Equal-width segmented tabs: every segment is a bordered, clearly clickable
 * control; the active one is raised with a slim brand underline rather than a
 * solid brand block. WAI-ARIA tabs with roving tabindex and arrow/Home/End.
 */
export function SegmentedTabs<T extends string>({
  tabs, value, onChange, ariaLabel, idPrefix, panelId, testIdPrefix,
}: SegmentedTabsProps<T>) {
  const refs = useRef(new Map<T, HTMLButtonElement | null>());

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onChange(tabs[next].id);
    refs.current.get(tabs[next].id)?.focus();
  };

  return (
    <div className="seg-tabs" role="tablist" aria-label={ariaLabel} style={{ ['--seg-count' as string]: tabs.length }}>
      {tabs.map((tab, index) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(element) => { refs.current.set(tab.id, element); }}
            type="button"
            role="tab"
            id={`${idPrefix}-${tab.id}`}
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            className={active ? 'seg-tabs__tab is-active' : 'seg-tabs__tab'}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            data-testid={testIdPrefix ? `${testIdPrefix}-${tab.id}` : undefined}
            aria-label={tab.shortLabel ? tab.label : undefined}
          >
            {tab.shortLabel ? (
              <>
                <span className="seg-tabs__long" aria-hidden="true">{tab.label}</span>
                <span className="seg-tabs__short" aria-hidden="true">{tab.shortLabel}</span>
              </>
            ) : tab.label}
          </button>
        );
      })}
    </div>
  );
}
