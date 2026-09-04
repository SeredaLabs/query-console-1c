/**
 * P0 LOCKED TEST (ТЗ v2.1 §30, PR-05): "generator throws → caller catches →
 * NO editor modification → controlled error shown/logged → panel remains usable".
 *
 * `computeBatchTextSafe` — общая точка, через которую и `App.tsx` (основной ОК/
 * вставка), и `ConstructorView.tsx` (превью «Запрос», вложенный конструктор
 * подзапроса) вызывают генерацию (см. PR-05). Раньше исключение из
 * `generateBatch`/`assembleBatch` внутри render-phase `useMemo` не ловилось нигде
 * и не имело Error Boundary — падение сносило весь webview. Тест здесь доказывает
 * именно перехват исключения, а не поведение React — React-специфичный уровень
 * (что «ОК» не отправляет `insertText` при ошибке) покрыт существующим
 * `test/e2e/webview.spec.ts` паттерном для okError.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeBatchTextSafe } from '../../src/webview/computeBatchText';
import { initialState } from '../../src/webview/state/queryStore';
import * as sdblGenerator from '../../src/core/query/sdblGenerator';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('computeBatchTextSafe — controlled failure вместо throw', () => {
  it('успешная генерация: error=null, text — как у прямого generateBatch', () => {
    const result = computeBatchTextSafe(initialState(), true);
    expect(result.error).toBeNull();
    expect(typeof result.text).toBe('string');
  });

  it('generateBatch бросает исключение — не долетает до вызывающего кода, возвращается controlled-результат', () => {
    const spy = vi.spyOn(sdblGenerator, 'generateBatch').mockImplementation(() => {
      throw new Error('симулированный сбой генератора');
    });

    // Главная проверка P0 LOCKED TEST: вызов НЕ бросает.
    expect(() => computeBatchTextSafe(initialState(), true)).not.toThrow();

    const result = computeBatchTextSafe(initialState(), true);
    expect(result.text).toBe('');
    expect(result.error).toBe('симулированный сбой генератора');

    spy.mockRestore();
  });

  it('исключение без Error (строка/объект) тоже превращается в controlled-результат', () => {
    vi.spyOn(sdblGenerator, 'generateBatch').mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw 'строковый throw без Error';
    });

    const result = computeBatchTextSafe(initialState(), true);
    expect(result.text).toBe('');
    expect(result.error).toBe('строковый throw без Error');
  });

  it('preserveComments=false путь (stripBatchComments) тоже защищён', () => {
    vi.spyOn(sdblGenerator, 'generateBatch').mockImplementation(() => {
      throw new Error('сбой на пути без комментариев');
    });
    expect(() => computeBatchTextSafe(initialState(), false)).not.toThrow();
    expect(computeBatchTextSafe(initialState(), false).error).toBe('сбой на пути без комментариев');
  });
});
