// Автопсевдоним произвольного поля выборки без явного `КАК` — вынесен из
// sdblGenerator.ts, чтобы то же правило читали и генератор (печать `КАК …`), и
// unionModel.ts (заголовки колонок объединения, псевдонимы колонок ВТ) без
// расширения зависимости unionModel → sdblGenerator (см. guard в unionModel.test.ts).
//
// Лексические факты (что есть параметр, имя, алфавит идентификатора) берутся из
// лексера (A1), а не из собственных классов символов: конструктор 1С даёт
// `&Ціна КАК Ціна`, `ПРЕДСТАВЛЕНИЕ(ВТ.Ціна) КАК ЦінаПредставление`.

import { tryTokenize, isNameToken, isIdentifierName, isWordToken } from './sdblLexer';
import type { Token } from './sdblLexer';

/**
 * Имя голого параметра выборки `&Имя` (без `&`), если всё выражение — один
 * param-токен, а имя — идентификатор (`&123` не голый параметр с именем).
 * Иначе (вызов, индексация, комментарий, нелексируемый текст) — `undefined`.
 */
export function bareParamName(expression: string): string | undefined {
  const tokens = tryTokenize(expression, { comments: true });
  if (!tokens || tokens.length !== 2 || tokens[0].type !== 'param') return undefined;
  const name = tokens[0].text.slice(1);
  return isIdentifierName(name) ? name : undefined;
}

/**
 * Автопсевдоним произвольного поля выборки без явного `КАК`. Конструктор 1С
 * для голого параметра `&Имя` ставит псевдоним = имени параметра (без `&`),
 * для остального — сквозной `Поле{n}`. Возвращает выбранный псевдоним; для
 * варианта `Поле{n}` инкрементирует переданный счётчик.
 */
export function exprAutoAlias(expression: string, next: () => string): string {
  const param = bareParamName(expression);
  if (param !== undefined) return param;
  const repr = representationAutoAlias(expression);
  return repr ?? next();
}

/**
 * Автопсевдоним вызова `ПРЕДСТАВЛЕНИЕ(<поле>)` / `ПРЕДСТАВЛЕНИЕССЫЛКИ(<поле>)` без
 * явного `КАК`: конструктор 1С даёт ему `<ПоследнийСегмент>Представление`
 * (`ПРЕДСТАВЛЕНИЕ(T.Номенклатура)` → `НоменклатураПредставление`,
 * `ПРЕДСТАВЛЕНИЕССЫЛКИ(Сотрудники.Ставка)` → `СтавкаПредставление`). Узко: ровно
 * один аргумент-поле (последовательность сегментов через точку, без иных символов).
 * Возвращает `undefined`, если выражение не подходит. Фаза 6.16.73.
 */
export function representationAutoAlias(expression: string): string | undefined {
  const tokens = tryTokenize(expression, { comments: true });
  if (!tokens || !isWordToken(tokens[0], 'ПРЕДСТАВЛЕНИЕ', 'ПРЕДСТАВЛЕНИЕССЫЛКИ')) return undefined;
  if (!isPunct(tokens[1], '(')) return undefined;
  let i = 2;
  let lastSeg: string;
  for (;;) {
    const seg = tokens[i];
    if (!isNameToken(seg)) return undefined;
    lastSeg = seg.text;
    i++;
    if (!isPunct(tokens[i], '.')) break;
    i++;
  }
  if (!isPunct(tokens[i], ')') || tokens[i + 1]?.type !== 'eof') return undefined;
  return `${lastSeg}Представление`;
}

function isPunct(t: Token | undefined, value: string): boolean {
  return t?.type === 'punct' && t.value === value;
}

/**
 * Автопсевдонимы для произвольных полей БЕЗ `КАК` одного списка выборки, не
 * совпадающие с уже занятыми (`reserved` — явные псевдонимы этого списка;
 * сравнение без учёта регистра, как в языке запросов): `Поле{n}` берёт
 * следующий свободный номер, имя параметра / `…Представление` при совпадении
 * получает наименьший числовой суффикс (как дедупликация простых полей в
 * генераторе). Без коллизий результат совпадает с `exprAutoAlias` + сквозным
 * счётчиком. Один экземпляр — на один список выборки, в порядке печати.
 */
export function createExprAutoAliaser(reserved: Iterable<string>): (expression: string) => string {
  const taken = new Set(Array.from(reserved, a => a.toUpperCase()));
  let n = 0;
  return expression => {
    let alias = exprAutoAlias(expression, () => {
      do n++; while (taken.has(`ПОЛЕ${n}`));
      return `Поле${n}`;
    });
    if (taken.has(alias.toUpperCase())) {
      let k = 1;
      while (taken.has(`${alias}${k}`.toUpperCase())) k++;
      alias = `${alias}${k}`;
    }
    taken.add(alias.toUpperCase());
    return alias;
  };
}
