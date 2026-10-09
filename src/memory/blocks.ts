import { MemoryError } from '../domain/errors';
export type Block = { heading_path: string[]; block_id: string; start_line: number; end_line: number; content: string };
export const bytes = (text: string) => new TextEncoder().encode(text).length;
export const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));
export function clip(text: string, limit: number) {
  const data = new TextEncoder().encode(text);
  if (data.length <= limit) return { excerpt: text, truncated: false };
  let end = limit;
  while (end > 0 && (data[end] & 0xc0) === 0x80) end--;
  return { excerpt: new TextDecoder().decode(data.slice(0, end)), truncated: true };
}
function expandTabs(line: string) {
  let added = 0;
  return line.replace(/\t/g, (_tab, offset: number) => {
    const width = 4 - (offset + added) % 4; added += width - 1;
    return ' '.repeat(width);
  });
}
// Preserve source text and line numbers; fenced headings never change the hierarchy.
export async function blocks(content: string, context = false, maxBlocks = 20000): Promise<Block[]> {
  const lines = content.split('\n'), result: Block[] = [], headings: string[] = [];
  const occurrences = new Map<string, number>();
  const listIndents: number[] = [];
  let from = 0, start = -1, fence = '', fenceLength = 0, list = false, fenceInList = false, fenceBase = 0;
  if (context && lines[0].trimEnd() === '---') {
    const end = lines.findIndex((line, i) => i > 0 && line.trimEnd() === '---');
    if (end >= 0) from = end + 1;
  }
  const flush = (end: number) => {
    if (start < 0) return;
    if (result.length >= maxBlocks) throw new MemoryError('CONTENT_TOO_LARGE', 'Too many context blocks.');
    result.push({ heading_path: [...headings].filter(Boolean), block_id: 'b' + result.length,
      start_line: start + 1, end_line: end + 1, content: lines.slice(start, end + 1).join('\n') });
    start = -1; list = false; listIndents.length = 0;
  };
  for (let i = from; i < lines.length; i++) {
    if (i % 512 === 0) await pause();
    const line = expandTabs(lines[i]), indent = /^ */.exec(line)![0].length;
    if (fence) {
      if (fenceInList && line.trim() && indent < fenceBase) {
        // A dedent ends the list container, including an unclosed fence inside it.
        fence = ''; flush(i - 1);
      } else {
        const closing = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line.slice(fenceBase));
        if (closing && closing[1][0] === fence && closing[1].length >= fenceLength) {
          fence = ''; if (!fenceInList) flush(i);
        }
        continue;
      }
    }
    if (!line.trim()) {
      let next = i + 1;
      while (next < lines.length && !lines[next].trim()) next++;
      const following = expandTabs(lines[next] ?? '');
      if (!list || (!/^ *(?:[-+*]|\d{1,9}[.)])(?: +|$)/.test(following)
        && /^ */.exec(following)![0].length < (listIndents[0] ?? 1))) flush(i - 1);
      i = next - 1;
      continue;
    }
    while (listIndents.length && indent < listIndents.at(-1)!) listIndents.pop();
    let base = listIndents.at(-1) ?? 0;
    let item;
    while ((item = /^( {0,3})([-+*]|\d{1,9}[.)])( +|$)/.exec(line.slice(base)))) {
      if (!list) flush(i - 1);
      if (start < 0) start = i;
      const padding = item[3].length > 4 ? 1 : Math.max(1, item[3].length);
      list = true; base += item[1].length + item[2].length + padding; listIndents.push(base);
    }
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line.slice(base));
    if (marker && (marker[1][0] !== '`' || !marker[2].includes('`'))) {
      fenceInList = listIndents.length > 0;
      if (!fenceInList) { flush(i - 1); start = i; }
      fence = marker[1][0]; fenceLength = marker[1].length; fenceBase = base; continue;
    }
    const heading = !listIndents.length && /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush(i - 1);
      const level = heading[1].length, key = [...headings.slice(0, level - 1), heading[2]].join('/');
      const occurrence = (occurrences.get(key) ?? 0) + 1; occurrences.set(key, occurrence);
      headings.length = level;
      headings[level - 1] = heading[2] + (occurrence > 1 ? ' [' + occurrence + ']' : '');
      start = i; flush(i); continue;
    }
    if (start < 0) start = i;
  }
  flush(lines.length - 1);
  return result;
}
