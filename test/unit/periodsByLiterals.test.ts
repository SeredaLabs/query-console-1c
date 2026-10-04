/**
 * `ИТОГИ … ПО <поле> ПЕРИОДАМИ(…)` upper-cases the period unit only in code
 * (C25 R10): a string literal or a comment in the arguments stays
 * byte-for-byte, with and without kept comments. Code spelling of the unit is
 * still canonicalized (`месяц` → `МЕСЯЦ`).
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

const Q = (args: string): string =>
  `ВЫБРАТЬ К.Период КАК Период, К.Курс КАК Курс ИЗ РегистрСведений.КурсыВалют КАК К\nИТОГИ\n\tСУММА(Курс)\nПО\n\tПериод ПЕРИОДАМИ(${args})`;
/** The rendered `ПО` part of the totals section. */
const by = (args: string, preserveComments = false): string => {
  const out = generateBatch(parseBatch(Q(args), undefined, preserveComments ? { preserveComments } : undefined));
  return out.slice(out.indexOf('ПО\n'));
};
/** Same lines and lengths, content that upper-casing cannot change. */
const neutral = (literal: string): string => `"${literal.slice(1, -1).replace(/[^\n]/gu, 'A')}"`;

describe('code period unit (unchanged output)', () => {
  it.each([
    ['месяц, &Н, &К', 'ПО\n\tПериод ПЕРИОДАМИ(МЕСЯЦ, &Н, &К)'],
    ['ДеНь', 'ПО\n\tПериод ПЕРИОДАМИ(ДЕНЬ)'],
    ['МЕСЯЦ, "день", &К', 'ПО\n\tПериод ПЕРИОДАМИ(МЕСЯЦ, "день", &К)'],
  ])('%j', (args, output) => {
    expect(by(args)).toBe(output);
  });

  it('kept comments', () => {
    expect(by('месяц // комм\n, &Н, &К', true)).toBe('ПО\n\tПериод ПЕРИОДАМИ(МЕСЯЦ, // комм\n&Н, &К)');
  });
});

describe('literal arguments stay byte-for-byte', () => {
  const payloads = ['"день"', '"a\nb, )"', '"a ""q"" b"', '"x // y"', '"Ab\n\tcD"', '"месяц"'];
  const shapes = ['$, &Н, &К', '$', 'МЕСЯЦ, $, &К', 'месяц, &Н, $'];
  for (const shape of shapes) {
    for (const preserveComments of [false, true]) {
      it.each(payloads)(`${JSON.stringify(shape)}${preserveComments ? ' +comments' : ''} with %j`, literal => {
        const out = by(shape.replace('$', literal), preserveComments);
        expect(out).toContain(literal);
        expect(out.split(literal).join(neutral(literal))).toBe(by(shape.replace('$', neutral(literal)), preserveComments));
      });
    }
  }

  it('a literal with a kept comment after it', () => {
    expect(by('"день" // комм\n, &Н, &К', true)).toBe('ПО\n\tПериод ПЕРИОДАМИ("день", // комм\n&Н, &К)');
  });
});
