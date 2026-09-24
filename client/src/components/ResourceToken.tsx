import type { TokenType } from '../../../shared/types/game';
import { resourceImages, resourceLabels } from '../config/resources';

export function ResourceToken({ type, amount, selected, onClick, compact = false }: { type: TokenType; amount?: number; selected?: boolean; onClick?: () => void; compact?: boolean }) {
  const image = resourceImages[type];
  return (
    <button type="button" className={`resource-token token-${type} ${selected ? 'selected' : ''} ${compact ? 'compact' : ''}`} onClick={onClick} disabled={!onClick} title={resourceLabels[type]}>
      {image ? <img src={image} alt="" /> : <span className="gem-shape" />}
      {!compact && <small>{resourceLabels[type]}</small>}
      {amount !== undefined && <b>{amount}</b>}
    </button>
  );
}
