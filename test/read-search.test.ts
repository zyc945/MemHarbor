import { it, expect } from 'vitest';
import { search } from '../src/memory/search';
import { parseContext, makeContext } from '../src/memory/parser';
import { MemoryService } from '../src/memory/service';
import { FILES, MODES, type IndexEntry } from '../src/domain/types';
import { Objects, Versions, ID, OTHER_ID } from './fakes';
const entry: IndexEntry = { id: ID, path: 'topics/upload', title: '跨境上传加速', status: 'active',
  aliases: ['上传兜底', 'TOS upload'], tags: ['aliyun'], description: '网络方案', updated_at: '' };
it('parses YAML and rejects malformed, mismatched, invalid IDs/status', () => {
  const content = makeContext(entry, 'body').replace('updated_at: ""\n', '');
  expect(parseContext('topics/upload', content).title).toBe(entry.title);
  for (const [id, text] of [['../bad', content], ['other', content],
    ['topics/upload', '---\nid: [\n---\n'], ['topics/upload', content.replace('active', 'bad')]]) {
    expect(() => parseContext(id, text)).toThrow();
  }
});
it('search ranks ID, aliases, Chinese, tags, tokens and ties deterministically', () => {
  const other = { ...entry, id: OTHER_ID, path: 'other', aliases: ['upload'], title: 'different' };
  expect(search([other, entry], 'topics/upload', 10).map(t => t.id)).toEqual([ID]);
  expect(search([other, entry], ID, 10).map(t => t.id)).toEqual([ID]);
  for (const q of ['上传兜底', '上传加', 'aliyun', 'TOS   upload', 'upload tos'])
    expect(search([entry], q, 10)).toHaveLength(1);
  expect(search([entry], 'unrelated', 10)).toEqual([]);
  expect(search([other, entry], 'aliyun', 10).map(t => t.id)).toEqual([ID, OTHER_ID]);
});
it('reads every mode using only object storage; missing files/topics fail', async () => {
  const objects = new Objects(), versions = new Versions(), service = new MemoryService(objects, versions);
  for (const f of FILES) versions.state.files[entry.path + '/' + f] = {
    content: f === 'CONTEXT.md' ? makeContext(entry, '').replace('updated_at: ""\n', '') : f, revision: f,
  };
  await service.reconcileAll();
  versions.reads = 0;
  expect((await service.listMemories()).topics).toHaveLength(1);
  expect((await service.searchMemories({ query: '上传' })).topics).toHaveLength(1);
  for (const [mode, files] of Object.entries(MODES)) {
    const result = await service.loadContext({ topic: ID, mode });
    expect(Object.keys(result.files)).toEqual([...files]);
  }
  await expect(service.loadContext({ topic: OTHER_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await objects.delete('_blobs/TODO.md');
  await expect(service.readMemoryFile({ topic: ID, file: 'TODO.md' })).rejects.toMatchObject({ code: 'PUBLISH_ERROR' });
  expect(versions.reads).toBe(0);
});

it('matches NFC and NFD queries and indexed fields identically', () => {
  for (const field of ['path', 'title', 'aliases', 'tags', 'description'] as const) {
    const value = field === 'path' ? '工作/café' : 'café';
    for (const form of ['NFC', 'NFD'] as const) {
      const candidate = { ...entry, [field]: field === 'aliases' || field === 'tags' ? [value.normalize(form)] : value.normalize(form) };
      const nfc = search([candidate], value.normalize('NFC'), 10);
      expect(nfc).toHaveLength(1);
      expect(search([candidate], value.normalize('NFD'), 10)).toEqual(nfc);
    }
  }
});
