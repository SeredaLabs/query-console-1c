import type { MetaField, MetaType } from './types';

/**
 * Людський підпис ОДНОГО типу з квалификаторами (довжина рядка, розрядність
 * числа) — так само, як 1С Конфігуратор показує `Строка(150)`/`Число(10,2)`.
 */
function describeOne(t: MetaType): string | undefined {
  if (t.primitive === 'Строка') {
    return t.length ? `Строка(${t.length})` : 'Строка';
  }
  if (t.primitive === 'Число') {
    if (t.digits) return `Число(${t.digits}${t.fractionDigits ? `,${t.fractionDigits}` : ''})`;
    return 'Число';
  }
  if (t.primitive) return t.primitive;
  if (t.ref) return `${t.ref.kind}.${t.ref.name}`;
  return t.raw;
}

/**
 * Людський підпис типу(-ів) поля для UI (completion `detail`, майбутній hover) —
 * винесено з `queryCompletionProvider.ts` у vscode-незалежний модуль, щоб можна
 * було unit-тестити напряму (vitest не резолвить `vscode`, тому чиста логіка
 * не повинна жити у файлі, що його імпортує).
 */
export function describeFieldTypes(field: MetaField): string {
  return field.types
    .map(describeOne)
    .filter((s): s is string => !!s)
    .join(' | ');
}
