/**
 * PR-06 (ТЗ v2.1 §23, §54 P0.6) — Parser Resource Safety Verification.
 *
 * P0 требует: сохранить существующий recursion guard, прогнать adversarial/stress
 * тесты по identified потенциально-неограниченным измерениям, и добавлять новую
 * защиту ТОЛЬКО если evidence её требует. Допустимый результат — "stress tests →
 * no additional unsafe dimension found → no production code change required"
 * (именно это и подтверждают тесты ниже: production-код НЕ менялся).
 *
 * Измерения, которые реально дают JS-рекурсию (стек вызовов) в этом парсере:
 *   1. Подзапрос-источник `ИЗ (ВЫБРАТЬ …)` — вложенность.
 *   2. Подзапрос-операнд условия `В (ВЫБРАТЬ …)` — вложенность.
 *   3. Правовложенная цепочка СОЕДИНЕНИЙ (`parseJoinChainFrom`/`parseBuilderJoins`,
 *      взаимная рекурсия, БЕЗ явного счётчика глубины).
 * Остальные потенциально широкие измерения (число полей выборки, число участников
 * ОБЪЕДИНЕНИЯ, число запросов пакета) обрабатываются `.map()`/циклами по токенам,
 * а не рекурсией — не могут переполнить стек вызовов независимо от размера.
 * Разбор произвольных ВЫРАЖЕНИЙ (в т.ч. вложенные скобки/ВЫБОР…КОНЕЦ) в этом
 * парсере — не classic recursive-descent: содержимое сохраняется как сырой срез
 * токенов (сбалансированный подсчёт скобок через локальный `depth`-счётчик, не
 * через рекурсию), поэтому глубина вложенности произвольного выражения тоже не
 * растит стек вызовов.
 */
import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { generateBatch } from '../../src/core/query/sdblGenerator';

/** `n` уровней вложенности подзапроса-источника `ИЗ (ВЫБРАТЬ … ИЗ (…)) КАК Т`. */
function nestedFromSubquery(n: number): string {
  let inner = 'ВЫБРАТЬ Т0.Ссылка КАК Ссылка ИЗ Справочник.Валюты КАК Т0';
  for (let i = 1; i <= n; i++) {
    inner = `ВЫБРАТЬ Т${i}.Ссылка КАК Ссылка ИЗ (${inner}) КАК Т${i}`;
  }
  return inner;
}

/** `n` уровней вложенности подзапроса-операнда условия `В (ВЫБРАТЬ … В (…))`. */
function nestedInSubquery(n: number): string {
  let inner =
    'ВЫБРАТЬ Т0.Ссылка КАК Ссылка ИЗ Справочник.Валюты КАК Т0 ' +
    'ГДЕ Т0.Ссылка В (ВЫБРАТЬ Т0.Ссылка ИЗ Справочник.Валюты КАК Т0)';
  for (let i = 1; i <= n; i++) {
    inner = `ВЫБРАТЬ Т.Ссылка КАК Ссылка ИЗ Справочник.Валюты КАК Т ГДЕ Т.Ссылка В (${inner})`;
  }
  return inner;
}

/** Правовложенная (как пишет конструктор 1С) цепочка из `n` СОЕДИНЕНИЙ. */
function rightNestedJoins(n: number): string {
  let src = 'Справочник.Валюты КАК T0';
  for (let i = 1; i <= n; i++) {
    src = `Справочник.Валюты КАК T${i} ВНУТРЕННЕЕ СОЕДИНЕНИЕ ${src} ПО T${i}.Ссылка = T0.Ссылка`;
  }
  return `ВЫБРАТЬ T0.Ссылка КАК Ссылка ИЗ ${src}`;
}

describe('Parser resource safety — подзапрос-источник ИЗ (…) (существующий guard)', () => {
  it('глубина ЗА пределом (40 > 32) — controlled parse error, не hang/crash', () => {
    const text = nestedFromSubquery(40);
    expect(() => parseBatch(text)).toThrow(/глубина вложенности подзапросов/);
  });

  it('глубина В пределах (30 < 32) — разбирается штатно', () => {
    const text = nestedFromSubquery(30);
    expect(() => parseBatch(text)).not.toThrow();
  });
});

describe('Parser resource safety — подзапрос-операнд условия В (…) (тот же guard)', () => {
  it('глубина ЗА пределом (40 > 32) — controlled parse error (не проглатывается как custom-фолбэк)', () => {
    const text = nestedInSubquery(40);
    expect(() => parseBatch(text)).toThrow(/глубина вложенности подзапросов/);
  });

  it('глубина В пределах (10) — разбирается штатно', () => {
    const text = nestedInSubquery(10);
    expect(() => parseBatch(text)).not.toThrow();
  });
});

describe('Parser resource safety — правовложенная цепочка СОЕДИНЕНИЙ (без явного guard)', () => {
  // parseJoinChainFrom/parseBuilderJoins — взаимная рекурсия БЕЗ счётчика глубины
  // (в отличие от подзапросов). Максимум по золотому корпусу — 47 СОЕДИНЕНИЙ на
  // один запрос (АдресныйКлассификаторСлужебный); здесь берём НА ПОРЯДОК больше
  // (1000, ~21×) — если бы это измерение реально грозило переполнением стека при
  // сколько-нибудь реалистичных объёмах, оно проявилось бы уже на этом масштабе.
  it('1000 правовложенных СОЕДИНЕНИЙ (~21× максимума golden-корпуса) — parse+generate без исключений', () => {
    const text = rightNestedJoins(1000);
    let doc: ReturnType<typeof parseBatch> | undefined;
    expect(() => { doc = parseBatch(text); }).not.toThrow();
    expect(() => generateBatch(doc!)).not.toThrow();
  });
});
