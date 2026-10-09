import type { IndexEntry } from '../domain/types';
const normalize = (s: string) => s.toLowerCase().normalize('NFC').trim().replace(/\s+/g, ' ');
function score(entry: IndexEntry, q: string) {
  const id = normalize(entry.id), path = normalize(entry.path), title = normalize(entry.title);
  const aliases = entry.aliases.map(normalize), tags = entry.tags.map(normalize);
  const description = normalize(entry.description ?? '');
  if (id === q) return 100;
  if (path === q) return 95;
  if (aliases.includes(q)) return 90;
  if (title === q) return 80;
  if (id.includes(q) || path.includes(q)) return 70;
  if (title.includes(q)) return 60;
  if (aliases.some(a => a.includes(q))) return 50;
  if (tags.includes(q)) return 40;
  if (description.includes(q)) return 20;
  const words = new Set([id, path, title, ...aliases, ...tags, description].join(' ').split(/[^\p{L}\p{N}_-]+/u));
  const tokens = q.split(' ').filter(Boolean);
  return tokens.every(t => words.has(t)) ? Math.min(tokens.length, 10) : 0;
}
export function search(entries: IndexEntry[], query: string, limit: number) {
  const q = normalize(query);
  if (!q) return [];
  return entries.map(entry => ({ entry, score: score(entry, q) })).filter(v => v.score > 0)
    .sort((a, b) => b.score - a.score || (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0))
    .slice(0, limit).map(v => v.entry);
}
