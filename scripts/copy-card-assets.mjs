import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve(import.meta.dirname, '..', 'Raw Asset', 'Assets', '_created');
const destination = resolve(import.meta.dirname, '..', 'dist', 'card-assets');
if (!existsSync(source)) throw new Error(`Card asset source not found: ${source}`);
mkdirSync(destination, { recursive: true });
for (const group of ['Tier1', 'Tier2', 'Tier3', 'Nobles']) {
  cpSync(resolve(source, group), resolve(destination, group), { recursive: true, force: true });
}

const resourceSource = resolve(import.meta.dirname, '..', 'Raw Asset', 'Assets đá');
const resourceDestination = resolve(import.meta.dirname, '..', 'dist', 'resource-assets');
mkdirSync(resourceDestination, { recursive: true });
const resources = {
  'Nether_Quartz_JE2_BE2.webp': 'quartz.webp',
  'Diamond_JE2_BE2.webp': 'diamond.webp',
  'Emerald_JE3_BE3.webp': 'emerald.webp',
  'Gold_Ingot_JE4_BE2.webp': 'gold.webp',
  'Netherite_Ingot_JE1_BE2.webp': 'netherite.webp',
  'Prismatic_Shard.png': 'prismatic-shard.png'
};
for (const [input, output] of Object.entries(resources)) {
  copyFileSync(resolve(resourceSource, input), resolve(resourceDestination, output));
}

console.log('Copied 100 rendered cards and 6 resource icons into the Vercel static output.');
