import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HostMsg } from '../../src/shared/messages';
import { useDesignerSession } from '../../src/webview/hooks/useDesignerSession';
import { postToHost } from '../../src/webview/bridge';
import * as generator from '../../src/core/query/sdblGenerator';

const session = vi.hoisted(() => ({ receive: undefined as ((msg: HostMsg) => void) | undefined }));
vi.mock('react', () => ({
  useState: (value: unknown) => [value, vi.fn()],
  useRef: (value: unknown) => ({ current: value }),
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void) => fn(),
}));
vi.mock('../../src/webview/bridge', () => ({
  onHostMessage: (fn: (msg: HostMsg) => void) => { session.receive = fn; return () => {}; },
  postToHost: vi.fn(),
}));
afterEach(() => vi.restoreAllMocks());
const generateBatch = generator.generateBatch;
/** C17 is closed for every known slot: simulate a renderer regression that drops
 * the comments printed after ИЗ, so the consent path is still exercised. */
beforeEach(() => {
  vi.spyOn(generator, 'generateBatch').mockImplementation(doc => {
    let afterFrom = false;
    return generateBatch(doc).split('\n').filter(line => {
      if (line === 'ИЗ') afterFrom = true;
      return !(afterFrom && /^\s*\/\//.test(line));
    }).join('\n');
  });
});
const lossy = (value = 1) => `ВЫБРАТЬ Т.Код КАК А ПОМЕСТИТЬ ВТ // lost\nИЗ Справочник.Валюты КАК Т ГДЕ Т.Код = ${value}`;

it('awaits consent, loads the candidate once, and never writes editor text', () => {
  const dispatch = vi.fn();
  const controller = useDesignerSession(dispatch);
  session.receive!({ type: 'loadModel', text: lossy() });
  expect(dispatch).not.toHaveBeenCalled();
  controller.confirmCommentLoss();
  expect(dispatch).toHaveBeenCalledOnce();
  expect(dispatch.mock.calls[0][0].type).toBe('LOAD_BATCH');
  // The loaded candidate is the parsed model; only the simulated renderer drops the comment.
  expect(generateBatch(dispatch.mock.calls[0][0].doc)).toContain('// lost');
  controller.confirmCommentLoss();
  expect(dispatch).toHaveBeenCalledOnce();
  expect(postToHost).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'insertText' }));
});

it.each(['ВЫБРАТЬ 3 КАК Новое', 'ВЫБРАТЬ ИЗ ИЗ'])('a superseding load discards the previous candidate: %s', text => {
  const dispatch = vi.fn();
  const controller = useDesignerSession(dispatch);
  session.receive!({ type: 'loadModel', text: lossy() });
  session.receive!({ type: 'loadModel', text });
  const before = dispatch.mock.calls.length;
  controller.confirmCommentLoss();
  expect(dispatch.mock.calls).toHaveLength(before);
  if (before) expect(generateBatch(dispatch.mock.calls[0][0].doc)).toContain('Новое');
});

it('confirmation after a newer warning loads only that newer candidate', () => {
  const dispatch = vi.fn();
  const controller = useDesignerSession(dispatch);
  session.receive!({ type: 'loadModel', text: lossy(1) });
  session.receive!({ type: 'loadModel', text: lossy(7) });
  controller.confirmCommentLoss();
  expect(dispatch).toHaveBeenCalledOnce();
  expect(generateBatch(dispatch.mock.calls[0][0].doc)).toContain('= 7');
});
