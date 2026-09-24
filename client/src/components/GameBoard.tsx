import { useEffect, useMemo, useState } from 'react';
import { cardsById, noblesById } from '../../../shared/data';
import { NORMAL_RESOURCES, TOKEN_TYPES, type PlayerGameView, type ResourceColor, type Tier, type TokenType } from '../../../shared/types/game';
import { GameCard } from './GameCard';
import { NobleCard } from './NobleCard';
import { ResourceToken } from './ResourceToken';
import { resourceLabels } from '../config/resources';

type Handlers = {
  take: (colors: TokenType[]) => void;
  buy: (cardId: string) => void;
  reserve: (input: { cardId?: string; tier?: Tier }) => void;
  returnTokens: (tokens: Partial<Record<TokenType, number>>) => void;
  chooseNoble: (nobleId: string) => void;
  playAgain: () => void;
};

function canAfford(cardId: string, game: PlayerGameView): boolean {
  const card = cardsById.get(cardId);
  if (!card) return false;
  let missing = 0;
  for (const color of NORMAL_RESOURCES) missing += Math.max(card.cost[color] - game.me.bonuses[color] - game.me.tokens[color], 0);
  return missing <= game.me.tokens.joker;
}

function ResourceStrip({ values, bonus = false, showEmpty = false }: { values: Record<string, number>; bonus?: boolean; showEmpty?: boolean }) {
  return <div className="resource-strip">{(bonus ? NORMAL_RESOURCES : TOKEN_TYPES).map((color) => (showEmpty || values[color] > 0) && <ResourceToken compact key={color} type={color} amount={values[color]} />)}</div>;
}

export function GameBoard({ game, isHost, handlers }: { game: PlayerGameView; isHost: boolean; handlers: Handlers }) {
  const [selected, setSelected] = useState<TokenType[]>([]);
  const [selectedCard, setSelectedCard] = useState<string>();
  const myTurn = game.currentPlayerId === game.me.id && game.phase === 'PLAYING';
  useEffect(() => { setSelected([]); setSelectedCard(undefined); }, [game.currentPlayerId, game.round]);

  const selectToken = (type: TokenType) => {
    if (!myTurn || type === 'joker' || game.bank[type] < selected.filter((item) => item === type).length + 1 || selected.length >= 3) return;
    setSelected((current) => [...current, type]);
  };

  const selectedCardData = selectedCard ? cardsById.get(selectedCard) : undefined;
  const isReservedSelection = Boolean(selectedCard && game.me.reservedCards.some((card) => card.cardId === selectedCard));
  const sortedPlayers = [...game.players].sort((a, b) => a.seat - b.seat);

  return (
    <main className="game-shell">
      <header className="game-header glass-panel">
        <div><p className="eyebrow">ROOM {game.roomId} · ROUND {game.round}</p><h1>CUSTOM SPLENDOR</h1></div>
        <div className={`turn-pill ${myTurn ? 'mine' : ''}`}>{myTurn ? 'YOUR TURN' : `${game.players.find((p) => p.id === game.currentPlayerId)?.name}'s turn`}</div>
      </header>

      <section className="opponents">
        {sortedPlayers.filter((player) => player.id !== game.me.id).map((player) => (
          <article key={player.id} className={`opponent glass-panel ${game.currentPlayerId === player.id ? 'current' : ''}`}>
            <div><span className={player.connected ? 'status online' : 'status'} /><strong>{player.name}</strong><b>{player.prestige} VP</b></div>
            <ResourceStrip values={player.tokens} />
            <ResourceStrip values={player.bonuses} bonus />
            <small>{player.purchasedCardIds.length} cards · {player.reservedCount} reserved</small>
          </article>
        ))}
      </section>

      <div className="board-layout">
        <section className="market glass-panel">
          {([3, 2, 1] as Tier[]).map((tier) => (
            <div className={`tier-row tier-${tier}`} key={tier}>
              <div className="tier-label"><span>TIER</span><b>{tier}</b></div>
              <button className="deck" disabled={!myTurn || game.decksRemaining[tier] === 0 || game.me.reservedCount >= 3} onClick={() => handlers.reserve({ tier })}>
                <span>✦</span><b>{game.decksRemaining[tier]}</b><small>RESERVE TOP</small>
              </button>
              <div className="card-row">{game.faceUp[tier].map((id) => <GameCard key={id} cardId={id} affordable={myTurn && canAfford(id, game)} onClick={() => setSelectedCard(id)} />)}</div>
            </div>
          ))}
        </section>

        <aside className="bank glass-panel">
          <div className="table-rail">
            <div className="bank-column">
              <h2>RESOURCE BANK</h2>
              <div className="token-bank">{TOKEN_TYPES.map((type) => <ResourceToken key={type} type={type} amount={game.bank[type]} selected={selected.includes(type)} onClick={myTurn && type !== 'joker' ? () => selectToken(type) : undefined} />)}</div>
            </div>
            <div className="noble-column">
              <h2>NOBLES</h2>
              <div>{game.nobleIds.map((id) => <NobleCard key={id} nobleId={id} />)}</div>
            </div>
          </div>
          <div className="selection-box"><small>SELECTED</small><div>{selected.length ? selected.map((type, index) => <ResourceToken compact key={`${type}-${index}`} type={type} />) : <span>Choose 3 different or 2 same</span>}</div></div>
          <div className="action-pair"><button className="ghost" disabled={!selected.length} onClick={() => setSelected([])}>CLEAR</button><button className="primary" disabled={!myTurn || ![2, 3].includes(selected.length)} onClick={() => { handlers.take(selected); setSelected([]); }}>TAKE</button></div>
          {game.endTriggered && <p className="final-round">FINAL ROUND</p>}
        </aside>
      </div>

      <section className={`my-board glass-panel ${myTurn ? 'current' : ''}`}>
        <div className="my-identity"><p className="eyebrow">MY BOARD</p><h2>{game.me.name}</h2></div>
        <div className="my-collection"><label>TOKENS</label><ResourceStrip values={game.me.tokens} showEmpty /></div>
        <div className="my-collection"><label>PERMANENT BONUSES</label><ResourceStrip values={game.me.bonuses} bonus showEmpty /></div>
        <div className="reserved-area"><label>RESERVED · {game.me.reservedCount}/3</label><div>{game.me.reservedCards.map((card) => <GameCard key={card.cardId} cardId={card.cardId} reserved onClick={() => setSelectedCard(card.cardId)} />)}{Array.from({ length: Math.max(0, 3 - game.me.reservedCards.length) }, (_, index) => <span className="reserved-slot" key={`empty-${index}`} aria-hidden="true">✦</span>)}</div></div>
        <div className="my-score"><strong>{game.me.prestige}<small> PRESTIGE</small></strong><span>{TOKEN_TYPES.reduce((sum, type) => sum + game.me.tokens[type], 0)}/10 TOKENS</span></div>
      </section>

      {selectedCardData && (
        <div className="modal-backdrop" onMouseDown={() => setSelectedCard(undefined)}>
          <div className="card-dialog glass-panel" onMouseDown={(event) => event.stopPropagation()}>
            <GameCard cardId={selectedCardData.id} />
            <div className="card-dialog-content"><p className="eyebrow">TIER {selectedCardData.tier}</p><h2>{selectedCardData.name}</h2><p>{selectedCardData.points} Prestige · Bonus {resourceLabels[selectedCardData.bonus]}</p>
              <h3>BASE COST</h3><ResourceStrip values={selectedCardData.cost} bonus />
              <h3>AFTER DISCOUNT</h3><div className="payment-list">{NORMAL_RESOURCES.map((color) => <span key={color}>{resourceLabels[color]} <b>{Math.max(selectedCardData.cost[color] - game.me.bonuses[color], 0)}</b></span>)}</div>
              <div className="dialog-actions"><button className="primary" disabled={!myTurn || !canAfford(selectedCardData.id, game)} onClick={() => { handlers.buy(selectedCardData.id); setSelectedCard(undefined); }}>BUY</button>{!isReservedSelection && <button className="secondary" disabled={!myTurn || game.me.reservedCount >= 3} onClick={() => { handlers.reserve({ cardId: selectedCardData.id }); setSelectedCard(undefined); }}>RESERVE</button>}<button className="ghost" onClick={() => setSelectedCard(undefined)}>CLOSE</button></div>
            </div>
          </div>
        </div>
      )}

      {game.phase === 'AWAITING_TOKEN_RETURN' && game.pendingReturnCount && <ReturnTokens game={game} count={game.pendingReturnCount} onSubmit={handlers.returnTokens} />}
      {game.phase === 'AWAITING_NOBLE_SELECTION' && game.eligibleNobleIds && <div className="modal-backdrop"><div className="choice-dialog glass-panel"><p className="eyebrow">ROYAL VISIT</p><h2>CHOOSE A NOBLE</h2><div className="noble-choices">{game.eligibleNobleIds.map((id) => <NobleCard key={id} nobleId={id} onClick={() => handlers.chooseNoble(id)} />)}</div></div></div>}
      {game.phase === 'FINISHED' && <GameOver game={game} isHost={isHost} onPlayAgain={handlers.playAgain} />}
    </main>
  );
}

function ReturnTokens({ game, count, onSubmit }: { game: PlayerGameView; count: number; onSubmit: (tokens: Partial<Record<TokenType, number>>) => void }) {
  const [returned, setReturned] = useState<Partial<Record<TokenType, number>>>({});
  const total = useMemo(() => TOKEN_TYPES.reduce((sum, type) => sum + (returned[type] ?? 0), 0), [returned]);
  const add = (type: TokenType) => setReturned((current) => ({ ...current, [type]: Math.min((current[type] ?? 0) + 1, game.me.tokens[type]) }));
  const remove = (type: TokenType) => setReturned((current) => ({ ...current, [type]: Math.max((current[type] ?? 0) - 1, 0) }));
  return <div className="modal-backdrop"><div className="choice-dialog glass-panel"><p className="eyebrow">TOKEN LIMIT</p><h2>RETURN {count} TOKEN{count > 1 ? 'S' : ''}</h2><p>You have {10 + count} tokens. Choose exactly {count} to return.</p><div className="return-grid">{TOKEN_TYPES.map((type) => <div key={type}><ResourceToken type={type} amount={game.me.tokens[type]} /><button onClick={() => remove(type)}>−</button><b>{returned[type] ?? 0}</b><button onClick={() => add(type)}>+</button></div>)}</div><button className="primary big" disabled={total !== count} onClick={() => onSubmit(returned)}>RETURN {total}/{count}</button></div></div>;
}

function GameOver({ game, isHost, onPlayAgain }: { game: PlayerGameView; isHost: boolean; onPlayAgain: () => void }) {
  const leaderboard = [...game.players].sort((a, b) => b.prestige - a.prestige || a.purchasedCardIds.length - b.purchasedCardIds.length);
  return <div className="modal-backdrop"><div className="game-over glass-panel"><div className="trophy">♛</div><p className="eyebrow">GAME OVER</p><h2>{game.winnerIds.length > 1 ? 'SHARED VICTORY' : 'WINNER'}</h2><h1>{game.winnerIds.map((id) => game.players.find((p) => p.id === id)?.name).join(' & ')}</h1><div className="leaderboard">{leaderboard.map((player, index) => <div key={player.id}><b>#{index + 1}</b><strong>{player.name}</strong><span>{player.prestige} VP</span><small>{player.purchasedCardIds.length} cards</small></div>)}</div>{isHost ? <button className="primary big" onClick={onPlayAgain}>PLAY AGAIN</button> : <p>Waiting for host…</p>}</div></div>;
}
