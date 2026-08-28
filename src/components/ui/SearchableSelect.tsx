import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  /** Shown on the trigger and as the option row. */
  label: string;
  /** Lowercased match text (name + external id, etc). Falls back to `label`. */
  searchText?: string;
}

interface SearchableSelectProps {
  label: string;
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
  ariaLabel?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}

/**
 * Theme-aware searchable combobox — a generalization of ImportModal's
 * ModalSelect (same `.modal-select-*` CSS classes, already dark/light
 * correct) with a search input and full keyboard navigation added. Never a
 * native `<select>`/`<option>`, so it never inherits the OS's unstyleable
 * popup (the reason a native select shows a white dropdown in dark mode).
 */
export const SearchableSelect = ({
  label,
  value,
  options,
  onChange,
  searchPlaceholder = '',
  emptyMessage = '',
  ariaLabel,
  style,
  disabled,
}: SearchableSelectProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<React.CSSProperties>({});

  // The menu renders in a body portal anchored to the trigger: every modal
  // that hosts this component clips or scrolls (`.modal-content` has
  // overflow-y auto, workspace shells and import panels use overflow:hidden),
  // which used to cut the dropdown and grow an outer scrollbar. Anchored to
  // the trigger rect and capped at 320px or the viewport space actually
  // available, short lists show fully and long lists scroll inside the menu.
  // Flips upward when there is no usable room below.
  const MENU_MAX_HEIGHT = 320;
  const VIEWPORT_GAP = 12;
  const MIN_USEFUL_SPACE = 140;

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_GAP;
    const spaceAbove = rect.top - VIEWPORT_GAP;
    const openUp = spaceBelow < MIN_USEFUL_SPACE && spaceAbove > spaceBelow;
    const available = Math.max(120, Math.min(MENU_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow));
    setMenuPosition(openUp
      ? { position: 'fixed', left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 6, maxHeight: available }
      : { position: 'fixed', left: rect.left, width: rect.width, top: rect.bottom + 6, maxHeight: available });
  }, []);

  const selectedOption = options.find((option) => option.value === value);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return options;
    }
    return options.filter((option) => (option.searchText ?? option.label).toLowerCase().includes(normalized));
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery('');
    setHighlightIndex(Math.max(0, options.findIndex((option) => option.value === value)));
    searchRef.current?.focus();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    updateMenuPosition();
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    // Capture scroll from any ancestor (modal cards scroll internally) so the
    // anchored menu never detaches from its trigger.
    window.addEventListener('scroll', updateMenuPosition, true);
    window.addEventListener('resize', updateMenuPosition);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', updateMenuPosition, true);
      window.removeEventListener('resize', updateMenuPosition);
    };
  }, [open, updateMenuPosition]);

  const commitSelection = (option: SearchableSelectOption) => {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightIndex((current) => Math.min(current + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[highlightIndex];
      if (option) {
        commitSelection(option);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-muted)', position: 'relative', minWidth: 0, flex: 1, ...style }}>
      <span>{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className="modal-select-trigger"
        onClick={() => !disabled && setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ?? label}
        aria-disabled={disabled}
        disabled={disabled}
        style={{ minWidth: 0, fontWeight: 700, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedOption?.label ?? ''}</span>
        <ChevronDown size={16} style={{ flexShrink: 0 }} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="modal-select-menu"
          style={{ ...menuPosition, zIndex: 1100, padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 4px' }}>
            <Search size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
            <input
              ref={searchRef}
              className="modal-input"
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls="searchable-select-listbox"
              aria-activedescendant={filtered[highlightIndex] ? `searchable-select-option-${filtered[highlightIndex].value}` : undefined}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={searchPlaceholder}
              style={{ padding: '6px 8px', fontSize: '0.85rem' }}
            />
          </div>
          <ul
            id="searchable-select-listbox"
            role="listbox"
            style={{ listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto', flex: 1, minHeight: 0 }}
          >
            {filtered.length === 0 ? (
              <li style={{ padding: '10px 12px', color: 'var(--text-subtle)', fontSize: '0.82rem' }}>{emptyMessage}</li>
            ) : (
              filtered.map((option, index) => {
                const isSelected = option.value === value;
                const isHighlighted = index === highlightIndex;
                return (
                  <li key={option.value} role="presentation">
                    <button
                      id={`searchable-select-option-${option.value}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={[
                        'modal-select-option',
                        isSelected ? 'is-selected' : '',
                        isHighlighted ? 'is-highlighted' : '',
                      ].filter(Boolean).join(' ')}
                      onMouseEnter={() => setHighlightIndex(index)}
                      onClick={() => commitSelection(option)}
                    >
                      {option.label}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
};
