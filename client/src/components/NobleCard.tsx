import { noblesById } from '../../../shared/data';
import { SERVER_URL } from '../lib/socket';

export function NobleCard({ nobleId, onClick }: { nobleId: string; onClick?: () => void }) {
  const noble = noblesById.get(nobleId);
  if (!noble) return null;
  return <button className="noble-card" onClick={onClick} disabled={!onClick}><img src={`${SERVER_URL}${noble.image}`} alt={noble.name} /></button>;
}
