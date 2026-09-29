import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildYamlResolver } from '../../src/core/metadata/buildYamlResolver';
import { tryOpenBatch } from '../../src/core/query/validateBatch';
import { buildSemanticSnapshotFromText } from '../../src/core/semantic/buildSemanticSnapshot';
import { computeQueryParseProblems } from '../../src/extension/queryDiagnostics';
import { localizeDiagnostic, setLocale } from '../../src/webview/i18n';
import { initialState, reducer } from '../../src/webview/state/queryStore';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { decideApply, findStaticApplyBlocker } from '../../src/webview/applyGate';
import { useDesignerSession } from '../../src/webview/hooks/useDesignerSession';
import type { HostMsg } from '../../src/shared/messages';

// Exercise the real session's host-message branch without adding a UI dependency.
const session = vi.hoisted(() => ({ receive: undefined as ((msg: HostMsg) => void) | undefined, setState: vi.fn() }));
vi.mock('react', () => ({
  useState: (value: unknown) => [value, session.setState],
  useRef: (value: unknown) => ({ current: value }),
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void) => fn(),
}));
vi.mock('../../src/webview/bridge', () => ({
  onHostMessage: (fn: (msg: HostMsg) => void) => { session.receive = fn; return () => {}; },
  postToHost: vi.fn(),
}));

afterEach(() => { setLocale('en'); vi.clearAllMocks(); });
const resolver = buildYamlResolver('test/fixtures/corpus/metadata/cf');
const prefix = 'ВЫБРАТЬ 1 КАК Число\n';
const unfinished = [
  '{ХАРАКТЕРИСТИКИ\nТИП(Справочник.Валюты)',
  '{ХАРАКТЕРИСТИКИ\n{ТИП(Справочник.Валюты)}',
];

for (const metadata of [false, true]) {
  describe(`C12 open with metadata=${metadata}`, () => {
    for (const block of unfinished) {
      it(`rejects EOF before the outer closing brace: ${block}`, () => {
        const result = tryOpenBatch(prefix + block, metadata ? resolver : undefined, { preserveComments: true });
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('unterminated characteristics reached the model');
        expect(result.error).toMatch(/^Ошибка разбора 3:\d+ — ожидался символ «}» \(получено «<конец>»\)$/);
      });
    }
    it.each([
      '{ХАРАКТЕРИСТИКИ\n  ТИП(Справочник.Валюты)\n}',
      '{ХАРАКТЕРИСТИКИ\n  {ТИП(Справочник.Валюты)}\n}',
      '{ХАРАКТЕРИСТИКИ\n  "}"\n  // } is a comment, not the closing brace\n  ТИП(Справочник.Валюты)\n}',
    ])('preserves a closed raw block and allows Apply: %s', block => {
      const activeResolver = metadata ? resolver : undefined;
      const result = tryOpenBatch(prefix + block, activeResolver, { preserveComments: true });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.doc.members[0].members[0].model.characteristics).toBe(block);
      const state = reducer(initialState(), { type: 'LOAD_BATCH', doc: result.doc });
      const output = computeBatchTextSafe(state, true);
      expect(output.text).toContain('ХАРАКТЕРИСТИКИ');
      expect(decideApply(output.text, output.error, findStaticApplyBlocker(state), activeResolver)).toEqual({ ok: true });
    });
  });
}

it.each(unfinished)('the shared session refuses LOAD_BATCH for %s', block => {
  const dispatch = vi.fn();
  useDesignerSession(dispatch);
  session.receive!({ type: 'loadModel', text: prefix + block });
  expect(dispatch).not.toHaveBeenCalled();
  expect(session.setState).toHaveBeenCalledWith(expect.stringContaining('ожидался символ «}»'));
});

it.each([
  ['en', 'expected symbol “}”'],
  ['uk', 'очікувався символ «}»'],
  ['ru', 'ожидался символ «}»'],
] as const)('uses the existing expected-symbol localization in %s', (locale, expected) => {
  const result = tryOpenBatch(prefix + unfinished[0]);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected parse failure');
  setLocale(locale);
  expect(localizeDiagnostic(result.error)).toContain(expected);
  expect(localizeDiagnostic(result.error)).toMatch(/3:\d+/);
});

it.each(unfinished)('IDE diagnostics and semantic snapshots remain controlled for %s', block => {
  const text = prefix + block;
  const source = 'Запрос.Текст = "' + text.replace(/\n/g, '\n|') + '";';
  const problems = computeQueryParseProblems(source);
  expect(problems).toHaveLength(1);
  expect(problems[0].kind).toBe('parse');
  expect(problems[0].message).toContain('ожидался символ «}»');
  const snapshot = buildSemanticSnapshotFromText(1, text);
  expect(snapshot.completeness).not.toBe('complete');
  expect(['recovered', 'unavailable']).toContain(snapshot.completeness);
});
