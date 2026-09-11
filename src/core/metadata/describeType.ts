import type { MetaField } from './types';

/**
 * Людський підпис типу(-ів) поля для UI (completion `detail`, майбутній hover) —
 * винесено з `queryCompletionProvider.ts` у vscode-незалежний модуль, щоб можна
 * було unit-тестити напряму (vitest не резолвить `vscode`, тому чиста логіка
 * не повинна жити у файлі, що його імпортує).
 */
export function describeFieldTypes(field: MetaField): string {
  return field.types
    .map((t) => t.primitive ?? (t.ref ? `${t.ref.kind}.${t.ref.name}` : t.raw))
    .filter((s): s is string => !!s)
    .join(' | ');
}
