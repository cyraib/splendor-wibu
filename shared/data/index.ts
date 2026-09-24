import cardsJson from './cards.json';
import noblesJson from './nobles.json';
import type { DevelopmentCard, Noble } from '../types/game';

export const cards = cardsJson as DevelopmentCard[];
export const nobles = noblesJson as Noble[];
export const cardsById = new Map(cards.map((card) => [card.id, card]));
export const noblesById = new Map(nobles.map((noble) => [noble.id, noble]));
