// Guards: no empty-reading furigana marker {x|} in shipped data, and markName never makes one (C-3).
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { markName } from '../../src/i18n/text';

const files = ['data/ui/strings.json', 'data/events.json', 'data/rules.json', 'data/questions.json', ...readdirSync('data/cards').map((f) => 'data/cards/' + f)];

describe('empty furigana markers', () => {
  it('data has no {x|}', () => {
    for (const f of files) expect(readFileSync(f, 'utf8').match(/\{[^{}|"]*\|\}/g) ?? [], f).toEqual([]);
  });
  it('markName leaves plain text when reading is empty', () => {
    expect(markName({ ja: '発見後の手続き', reading: '' })).toBe('発見後の手続き');
    expect(markName({ ja: '転入届', reading: 'てんにゅうとどけ' })).toBe('{転入届|てんにゅうとどけ}');
  });
});
