import type { RoomMode, RoomView } from '../../../shared/types/game';

export function Lobby({ room, playerId, onMode, onStart, copied, onCopy }: { room: RoomView; playerId: string; onMode: (mode: RoomMode) => void; onStart: () => void; copied: boolean; onCopy: () => void }) {
  const isHost = room.hostPlayerId === playerId;
  const difference = room.mode - room.players.length;
  const startHint = difference > 0 ? `Waiting for ${difference} more player${difference > 1 ? 's' : ''}` : difference < 0 ? 'Too many players for selected mode' : 'Ready to begin';
  return (
    <main className="lobby-shell">
      <section className="lobby-card glass-panel">
        <p className="eyebrow">PRIVATE TABLE</p>
        <h1>ROOM <span>{room.id}</span></h1>
        <button className="secondary copy-button" onClick={onCopy}>{copied ? 'COPIED!' : 'COPY INVITE LINK'}</button>
        <div className="lobby-grid">
          <div>
            <h2>GAME MODE</h2>
            <div className="mode-picker">
              {([2, 3, 4] as RoomMode[]).map((mode) => <button key={mode} disabled={!isHost} className={room.mode === mode ? 'active' : ''} onClick={() => onMode(mode)}>{mode}<small>PLAYERS</small></button>)}
            </div>
          </div>
          <div>
            <h2>PLAYERS · {room.players.length}/{room.mode}</h2>
            <div className="player-list">
              {room.players.map((player) => <div key={player.id}><span className={player.connected ? 'status online' : 'status'} /> <strong>{player.name}</strong>{player.isHost && <em>HOST</em>}{!player.connected && <small>Disconnected</small>}</div>)}
              {Array.from({ length: Math.max(room.mode - room.players.length, 0) }).map((_, index) => <div className="empty-seat" key={index}>Waiting for player…</div>)}
            </div>
          </div>
        </div>
        <p className={difference === 0 ? 'ready-text' : 'waiting-text'}>{startHint}</p>
        {isHost ? <button className="primary big" disabled={difference !== 0 || room.players.some((p) => !p.connected)} onClick={onStart}>START GAME</button> : <p className="host-wait">Host will start the game.</p>}
      </section>
    </main>
  );
}
