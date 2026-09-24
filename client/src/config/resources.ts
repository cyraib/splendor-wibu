import type { TokenType } from '../../../shared/types/game';
import { SERVER_URL } from '../lib/socket';

export const resourceLabels: Record<TokenType, string> = {
  quartz: 'Quartz',
  diamond: 'Diamond',
  emerald: 'Emerald',
  gold: 'Gold',
  netherite: 'Netherite',
  joker: 'Joker'
};

export const resourceImages: Record<TokenType, string> = {
  quartz: `${SERVER_URL}/resource-assets/quartz.webp`,
  diamond: `${SERVER_URL}/resource-assets/diamond.webp`,
  emerald: `${SERVER_URL}/resource-assets/emerald.webp`,
  gold: `${SERVER_URL}/resource-assets/gold.webp`,
  netherite: `${SERVER_URL}/resource-assets/netherite.webp`,
  joker: `${SERVER_URL}/resource-assets/prismatic-shard.png`
};
