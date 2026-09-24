import { describe, expect, it } from 'vitest';
import { cards, nobles } from '../shared/data';
import { buyCard, calculateCardPrice, createGame, endTurn, reserveCard, returnTokens, takeTokens } from '../server/game/engine';
import { buildPlayerView } from '../server/game/playerView';
import { getGameSetupForPlayerCount } from '../server/game/rules';

const people = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, sessionId: `session-${index}-${'x'.repeat(24)}`, name: `Player ${index + 1}`, connected: true }));
const gameFor = (count: 2 | 3 | 4) => createGame('ABC123', people(count), count, () => 0.42);

describe('player-count setup', () => {
  it.each([[2, 4, 3], [3, 5, 4], [4, 7, 5]] as const)('%i players has correct supply and nobles', (count, supply, nobleCount) => {
    const setup = getGameSetupForPlayerCount(count);
    expect(setup.tokenSupply.quartz).toBe(supply);
    expect(setup.tokenSupply.joker).toBe(5);
    expect(setup.nobleCount).toBe(nobleCount);
    const game = gameFor(count);
    expect(game.nobleIds).toHaveLength(nobleCount);
    expect(game.faceUp[1]).toHaveLength(4);
    expect(game.players).toHaveLength(count);
  });
});

describe('turns and tokens', () => {
  it('rotates through all players in fixed order', () => {
    const game = gameFor(3);
    const order = game.players.map((player) => player.id);
    takeTokens(game, order[0], ['quartz', 'diamond', 'emerald']);
    expect(game.players[game.currentPlayerIndex].id).toBe(order[1]);
    takeTokens(game, order[1], ['quartz', 'diamond', 'emerald']);
    takeTokens(game, order[2], ['quartz', 'diamond', 'emerald']);
    expect(game.players[game.currentPlayerIndex].id).toBe(order[0]);
    expect(game.round).toBe(2);
  });

  it('takes three different resources', () => {
    const game = gameFor(2); const player = game.players[0];
    takeTokens(game, player.id, ['quartz', 'diamond', 'emerald']);
    expect(player.tokens).toMatchObject({ quartz: 1, diamond: 1, emerald: 1 });
  });

  it('takes two same only when bank had at least four', () => {
    const game = gameFor(2); const player = game.players[0];
    takeTokens(game, player.id, ['quartz', 'quartz']);
    expect(player.tokens.quartz).toBe(2);
    const next = game.players[1];
    expect(() => takeTokens(game, next.id, ['quartz', 'quartz'])).toThrow(/ít nhất 4/);
  });

  it('rejects invalid token mixes', () => {
    const game = gameFor(2);
    expect(() => takeTokens(game, game.players[0].id, ['quartz', 'quartz', 'diamond'])).toThrow();
    expect(() => takeTokens(game, game.players[0].id, ['joker', 'diamond', 'emerald'])).toThrow(/Joker/);
  });

  it('pauses for token return above ten', () => {
    const game = gameFor(2); const player = game.players[0];
    player.tokens.quartz = 3; player.tokens.diamond = 3; player.tokens.emerald = 3;
    takeTokens(game, player.id, ['quartz', 'diamond', 'gold']);
    expect(game.phase).toBe('AWAITING_TOKEN_RETURN');
    expect(game.pendingReturnCount).toBe(2);
    returnTokens(game, player.id, { quartz: 1, diamond: 1 });
    expect(game.phase).toBe('PLAYING');
    expect(game.currentPlayerIndex).toBe(1);
  });
});

describe('purchase, discount and joker', () => {
  it('calculates permanent discounts', () => {
    const card = cards.find((item) => Object.values(item.cost).some((value) => value >= 2))!;
    const bonuses = { quartz: 1, diamond: 1, emerald: 1, gold: 1, netherite: 1 };
    const price = calculateCardPrice(card, bonuses);
    for (const color of Object.keys(price) as (keyof typeof price)[]) expect(price[color]).toBe(Math.max(card.cost[color] - 1, 0));
  });

  it('buys a market card and applies its bonus', () => {
    const game = gameFor(2); const player = game.players[0]; const card = cards.find((item) => item.points === 0)!;
    game.faceUp[card.tier] = [card.id];
    for (const color of Object.keys(card.cost) as (keyof typeof card.cost)[]) player.tokens[color] = card.cost[color];
    buyCard(game, player.id, card.id);
    expect(player.purchasedCardIds).toContain(card.id);
    expect(player.bonuses[card.bonus]).toBe(1);
  });

  it('uses joker only for missing payment', () => {
    const game = gameFor(2); const player = game.players[0];
    const card = cards.find((item) => Object.values(item.cost).reduce((a, b) => a + b, 0) >= 3)!;
    game.faceUp[card.tier] = [card.id];
    player.tokens.joker = Object.values(card.cost).reduce((a, b) => a + b, 0);
    buyCard(game, player.id, card.id);
    expect(player.tokens.joker).toBe(0);
  });
});

describe('reserve and privacy', () => {
  it('reserves face-up and top-deck cards and awards joker', () => {
    const game = gameFor(2); const first = game.players[0]; const open = game.faceUp[1][0];
    reserveCard(game, first.id, { cardId: open });
    expect(first.reservedCards[0]).toEqual({ cardId: open, hidden: false });
    const second = game.players[1]; const top = game.decks[2][0];
    reserveCard(game, second.id, { tier: 2 });
    expect(second.reservedCards[0]).toEqual({ cardId: top, hidden: true });
    expect(second.tokens.joker).toBe(1);
  });

  it('enforces reserve limit and hides IDs from opponents', () => {
    const game = gameFor(2); const owner = game.players[0];
    owner.reservedCards = [{ cardId: cards[0].id, hidden: true }, { cardId: cards[1].id, hidden: true }, { cardId: cards[2].id, hidden: false }];
    expect(() => reserveCard(game, owner.id, { tier: 1 })).toThrow(/tối đa 3/);
    const opponentView = buildPlayerView(game, game.players[1].id);
    expect(opponentView.players.find((p) => p.id === owner.id)?.reservedCount).toBe(3);
    expect(JSON.stringify(opponentView.players)).not.toContain(cards[0].id);
  });
});

describe('nobles and ending', () => {
  it('automatically awards a single eligible noble', () => {
    const game = gameFor(2); const player = game.players[0]; const noble = nobles[0];
    game.nobleIds = [noble.id];
    player.bonuses = { ...noble.requirement };
    takeTokens(game, player.id, ['quartz', 'diamond', 'emerald']);
    expect(player.nobleIds).toContain(noble.id);
    expect(player.prestige).toBe(3);
  });

  it('finishes after the last player of the round', () => {
    const game = gameFor(2); const first = game.players[0]; const scoring = cards.find((card) => card.points >= 1)!;
    first.prestige = 14; first.bonuses = { quartz: 20, diamond: 20, emerald: 20, gold: 20, netherite: 20 };
    game.nobleIds = [];
    game.faceUp[scoring.tier] = [scoring.id];
    buyCard(game, first.id, scoring.id);
    expect(game.endTriggered).toBe(true);
    expect(game.phase).not.toBe('FINISHED');
    takeTokens(game, game.players[1].id, ['quartz', 'diamond', 'emerald']);
    expect(game.phase).toBe('FINISHED');
    expect(game.winnerIds).toContain(first.id);
  });

  it('breaks ties by fewest purchased cards and supports shared victory', () => {
    const game = gameFor(2);
    game.players[0].prestige = 15; game.players[1].prestige = 15;
    game.players[0].purchasedCardIds = ['a', 'b']; game.players[1].purchasedCardIds = ['c'];
    game.endTriggered = true; game.currentPlayerIndex = 1;
    endTurn(game);
    expect(game.winnerIds).toEqual([game.players[1].id]);
    const shared = gameFor(2); shared.players.forEach((p) => { p.prestige = 15; p.purchasedCardIds = ['x']; }); shared.endTriggered = true; shared.currentPlayerIndex = 1; endTurn(shared);
    expect(shared.winnerIds).toHaveLength(2);
  });
});
