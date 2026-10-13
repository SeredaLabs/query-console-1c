/**
 * C32: the designer session marks which host load is in the state (`loadedId`) in
 * the same update as its `LOAD_BATCH` — so the baseline report is computed from the
 * state that load produced. A comment-loss candidate counts only once confirmed;
 * a failed or superseded load never does.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HostMsg } from '../../src/shared/messages';
import { useDesignerSession } from '../../src/webview/hooks/useDesignerSession';
import * as generator from '../../src/core/query/sdblGenerator';

const session = vi.hoisted(() => ({
  receive: undefined as ((msg: HostMsg) => void) | undefined,
  /** Every state update in call order: [initial value of that state, new value]. */
  updates: [] as Array<[unknown, unknown]>,
}));
vi.mock('react', () => ({
  useState: (value: unknown) => [value, (next: unknown) => session.updates.push([value, next])],
  useRef: (value: unknown) => ({ current: value }),
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void) => fn(),
}));
vi.mock('../../src/webview/bridge', () => ({
  onHostMessage: (fn: (msg: HostMsg) => void) => { session.receive = fn; return () => {}; },
  postToHost: vi.fn(),
}));

const generateBatch = generator.generateBatch;
beforeEach(() => {
  session.updates.length = 0;
  // C17 is closed: simulate a renderer that drops the comment after ИЗ (as in
  // designerSession.commentLoss.test.ts) to reach the consent path.
  vi.spyOn(generator, 'generateBatch').mockImplementation(doc => {
    let afterFrom = false;
    return generateBatch(doc).split('\n').filter(line => {
      if (line === 'ИЗ') afterFrom = true;
      return !(afterFrom && /^\s*\/\//.test(line));
    }).join('\n');
  });
});
afterEach(() => vi.restoreAllMocks());

const lossy = (value = 1) => `ВЫБРАТЬ Т.Код КАК А ПОМЕСТИТЬ ВТ // lost\nИЗ Справочник.Валюты КАК Т ГДЕ Т.Код = ${value}`;
/** Values set on the `loadedId` state — the only session state that starts `undefined`. */
const loadedIds = (): unknown[] => session.updates.filter(([initial]) => initial === undefined).map(([, next]) => next);

function start() {
  const events: string[] = [];
  const dispatch = vi.fn((action: { type: string }) => events.push(action.type));
  const controller = useDesignerSession(dispatch);
  return { controller, dispatch };
}

it('an opened load is marked with its id', () => {
  const { dispatch } = start();
  session.receive!({ type: 'loadModel', text: 'ВЫБРАТЬ 1 КАК А', loadId: 3 });
  expect(dispatch).toHaveBeenCalledOnce();
  expect(loadedIds()).toEqual([3]);
});

it('a load without an id leaves no id (no baseline)', () => {
  start();
  session.receive!({ type: 'loadModel', text: 'ВЫБРАТЬ 1 КАК А' });
  expect(loadedIds()).toEqual([undefined]);
});

it('a load that fails to open is never marked', () => {
  const { dispatch } = start();
  session.receive!({ type: 'loadModel', text: 'ВЫБРАТЬ ИЗ ИЗ', loadId: 4 });
  expect(dispatch).not.toHaveBeenCalled();
  expect(loadedIds()).toEqual([]);
});

it('comment loss: marked only when the candidate is confirmed', () => {
  const { controller, dispatch } = start();
  session.receive!({ type: 'loadModel', text: lossy(), loadId: 5 });
  expect(dispatch).not.toHaveBeenCalled();
  expect(loadedIds()).toEqual([]);
  controller.confirmCommentLoss();
  expect(dispatch).toHaveBeenCalledOnce();
  expect(loadedIds()).toEqual([5]);
});

it('comment loss: a newer warning carries its own id', () => {
  const { controller } = start();
  session.receive!({ type: 'loadModel', text: lossy(1), loadId: 1 });
  session.receive!({ type: 'loadModel', text: lossy(7), loadId: 2 });
  controller.confirmCommentLoss();
  expect(loadedIds()).toEqual([2]);
});
