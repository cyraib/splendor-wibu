import { cardsById } from '../../../shared/data';
import { NORMAL_RESOURCES } from '../../../shared/types/game';
import { SERVER_URL } from '../lib/socket';
import { resourceLabels } from '../config/resources';

export function GameCard({ cardId, onClick, affordable = false, reserved = false }: { cardId: string; onClick?: () => void; affordable?: boolean; reserved?: boolean }) {
  const card = cardsById.get(cardId);
  if (!card) return null;
  const cost = NORMAL_RESOURCES.filter((color) => card.cost[color] > 0).map((color) => `${resourceLabels[color]} ${card.cost[color]}`).join(' · ');
  return (
    <button type="button" className={`game-card ${affordable ? 'affordable' : ''} ${reserved ? 'reserved' : ''}`} onClick={onClick} disabled={!onClick} title={`${card.name}\n${card.points} điểm · ${resourceLabels[card.bonus]}\n${cost}`}>
      <img src={`${SERVER_URL}${card.image}`} alt={card.name} loading="lazy" />
      {reserved && <span className="reserved-tag">RESERVED</span>}
    </button>
  );
}
