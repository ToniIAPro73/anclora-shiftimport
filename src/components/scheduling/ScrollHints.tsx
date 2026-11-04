import { ChevronDown, ChevronUp } from 'lucide-react';
import { useI18n } from '../../lib/use-i18n';
import './ScrollHints.css';

interface ScrollHintButtonsProps {
  canUp: boolean;
  canDown: boolean;
  onScroll: (direction: 1 | -1) => void;
}

/** Floating ↑/↓ buttons for a vertically scrolling region: they exist only while there is something to reach in that direction. */
export function ScrollHintButtons({ canUp, canDown, onScroll }: ScrollHintButtonsProps) {
  const { t } = useI18n();
  return (
    <>
      {canUp && (
        <button type="button" className="scroll-hint scroll-hint--up" onClick={() => onScroll(-1)} aria-label={t('planner.scrollUp')} data-testid="planner-scroll-up">
          <ChevronUp size={20} aria-hidden="true" />
        </button>
      )}
      {canDown && (
        <button type="button" className="scroll-hint scroll-hint--down" onClick={() => onScroll(1)} aria-label={t('planner.scrollDown')} data-testid="planner-scroll-down">
          <ChevronDown size={20} aria-hidden="true" />
        </button>
      )}
    </>
  );
}
