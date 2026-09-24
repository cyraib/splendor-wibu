import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dataDir = resolve(root, 'Raw Asset', 'Assets', '_created');
const outputDir = resolve(root, 'shared', 'data');

function parseCsv(file) {
  const [header, ...rows] = readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const keys = header.split(',');
  return rows.map((row) => Object.fromEntries(row.split(',').map((value, index) => [keys[index], value])));
}

function finalImage(group, prefix) {
  const match = readdirSync(resolve(dataDir, group)).find((name) => name.startsWith(prefix) && name.endsWith('.png'));
  if (!match) throw new Error(`Missing rendered image: ${group}/${prefix}*.png`);
  return `/card-assets/${group}/${encodeURIComponent(match)}`;
}

const normal = ['quartz', 'diamond', 'emerald', 'gold', 'netherite'];
const cards = parseCsv(resolve(dataDir, 'card_data.csv')).map((row) => {
  const tier = Number(row.tier);
  const sequence = row.id.split('-')[1];
  return {
    id: row.id,
    type: 'development',
    tier,
    name: basename(row.source_image).replace(/\.png(?:\.png)?$/i, '').replace(/^\d+_/, '').replaceAll('_', ' '),
    image: finalImage(`Tier${tier}`, `T${tier}_${sequence}_`),
    points: Number(row.points),
    bonus: row.bonus,
    cost: Object.fromEntries(normal.map((key) => [key, Number(row[`${key}_cost`])]))
  };
});

const nobles = parseCsv(resolve(dataDir, 'nobles_data.csv')).map((row) => {
  const sequence = row.id.split('-')[1];
  return {
    id: row.id,
    type: 'noble',
    name: basename(row.source_image).replace(/\.png$/i, '').replace(/^\d+_/, '').replaceAll('_', ' '),
    image: finalImage('Nobles', `N_${sequence}_`),
    points: Number(row.points),
    requirement: Object.fromEntries(normal.map((key) => [key, Number(row[`${key}_req`])]))
  };
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(cards.length === 90, `Expected 90 cards, found ${cards.length}`);
assert(nobles.length === 10, `Expected 10 nobles, found ${nobles.length}`);
assert(new Set(cards.map((card) => card.id)).size === cards.length, 'Duplicate development card ID');
assert(new Set(nobles.map((noble) => noble.id)).size === nobles.length, 'Duplicate noble ID');
for (const card of cards) {
  assert([1, 2, 3].includes(card.tier), `Invalid tier: ${card.id}`);
  assert(normal.includes(card.bonus), `Invalid bonus: ${card.id}`);
  assert(card.points >= 0 && Object.values(card.cost).every((value) => value >= 0), `Invalid values: ${card.id}`);
}
for (const noble of nobles) {
  assert(noble.points === 3 && Object.values(noble.requirement).every((value) => value >= 0), `Invalid noble: ${noble.id}`);
}

writeFileSync(resolve(outputDir, 'cards.json'), `${JSON.stringify(cards, null, 2)}\n`);
writeFileSync(resolve(outputDir, 'nobles.json'), `${JSON.stringify(nobles, null, 2)}\n`);
console.log(`Validated and generated ${cards.length} cards + ${nobles.length} nobles.`);
