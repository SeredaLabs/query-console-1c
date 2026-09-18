import type { MetaField, MetaType } from '../metadata/types';

/**
 * Чи можуть два поля бути звязані по рівності (JOIN ... ON a = b) — питання,
 * яке зараз ЖОДЕН з конструкторів (Classic чи New) не перевіряє: реально
 * можна вибрати `Строка = ДокументСсылка`, і помилку побачити тільки при
 * виконанні запиту в 1С. Правило: типи сумісні, якщо перетин `types[]` двох
 * полів непорожній — примітив збігається з тим самим примітивом
 * (`Строка`/`Число`/`Дата`/`Булево`, без урахування довжини/розрядності —
 * SDBL сам їх узгоджує), а посилальний тип збігається з тим самим
 * `{kind, name}` (конкретний довідник/документ, а не "будь-яке посилання").
 * Складене поле (кілька типів, напр. `ДокументСсылка.А | ДокументСсылка.Б`)
 * сумісне з іншим, якщо хоч ОДНА пара типів перетинається.
 */
export function typesOverlap(a: MetaType, b: MetaType): boolean {
  // `raw` (парсер не розпізнав конкретний тип) — трактуємо як "невідомий", не блокуємо ним нічого.
  if ((!a.primitive && !a.ref) || (!b.primitive && !b.ref)) return true;
  if (a.primitive && b.primitive) return a.primitive === b.primitive;
  if (a.ref && b.ref) return a.ref.kind === b.ref.kind && a.ref.name === b.ref.name;
  return false;
}

export function fieldsTypeCompatible(a: MetaField, b: MetaField): boolean {
  if (a.types.length === 0 || b.types.length === 0) return true; // тип взагалі не заданий — не блокуємо
  return a.types.some(ta => b.types.some(tb => typesOverlap(ta, tb)));
}
