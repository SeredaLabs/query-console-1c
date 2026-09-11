import type { MetaField, MetaTable } from './types';
import { describeOne } from './describeType';

/**
 * Розширена, VS Code-незалежна картка поля для UI (completion `documentation`,
 * майбутній hover, Visual Query Builder) — структуровані дані окремо від
 * рендеру, щоб формат можна було unit-тестити напряму й повторно
 * використовувати з різних vscode-провайдерів без дублювання логіки.
 */
export interface FieldCard {
  /** Людський синонім, тільки якщо реально доступний у метаданих. */
  synonym?: string;
  /** "Ссылка" | "Строка(150)" | "Число(15,2)" | "Дата" | "Булево" | "Составной" | raw-фолбек. */
  typeLabel?: string;
  /** Конкретний target reference — тільки для ОДНОГО (не складеного) ссилочного типу. */
  target?: string;
  /** Реквизит | Стандартный реквизит | Измерение | Ресурс. */
  kindLabel: string;
  /** Варіанти складеного типу (types.length > 1) — кожен варіант тим самим лейблом, що й typeLabel для простого типу. */
  variants?: string[];
  /** Тільки коли ОДИН ссилочний тип і target metadata однозначно резолвиться. */
  structure?: { attributes: number; tabularSections: number };
  /** Короткий, обрізаний превʼю реквизитів target-таблиці (той самий resolve, що й structure). */
  fieldsPreview?: string[];
}

const KIND_LABEL: Record<MetaField['kind'], string> = {
  standard: 'Стандартный реквизит',
  attribute: 'Реквизит',
  dimension: 'Измерение',
  resource: 'Ресурс',
};

const MAX_FIELDS_PREVIEW = 8;

/**
 * `resolveTarget` — опціональний lookup target-таблиці по повному імені
 * (`Справочник.X`), той самий формат, що й `MetadataResolver.tableByFullName`
 * (`src/core/query/metadataResolver.ts`) — щоб не створювати новий тип
 * резолвера, а перевикористати вже наявний у completion/hover.
 */
export function buildFieldCard(
  field: MetaField,
  resolveTarget?: (fullName: string) => MetaTable | undefined
): FieldCard {
  const card: FieldCard = { kindLabel: KIND_LABEL[field.kind] };
  if (field.synonym) card.synonym = field.synonym;

  const isComposite = field.types.length > 1;
  if (isComposite) {
    const variants = field.types.map(describeOne).filter((s): s is string => !!s);
    card.typeLabel = 'Составной';
    if (variants.length) card.variants = variants;
    return card;
  }

  const only = field.types[0];
  if (!only) return card;
  card.typeLabel = only.ref ? 'Ссылка' : describeOne(only);
  if (!only.ref) return card;

  card.target = `${only.ref.kind}.${only.ref.name}`;
  const target = resolveTarget?.(card.target);
  if (!target) return card;

  const attrs = target.fields.filter((f) => f.kind === 'attribute');
  card.structure = { attributes: attrs.length, tabularSections: target.tabularSections?.length ?? 0 };
  if (attrs.length) {
    const names = attrs.slice(0, MAX_FIELDS_PREVIEW).map((f) => f.name);
    card.fieldsPreview = attrs.length > MAX_FIELDS_PREVIEW ? [...names, '…'] : names;
  }
  return card;
}

/**
 * Markdown-рендер картки для `CompletionItem.documentation` — технічне ім'я
 * поля НЕ дублюється тут: VS Code вже показує `label` completion-елемента як
 * заголовок над `documentation`, повторювати його в тілі — зайве дублювання
 * (явне правило промпту: "не дублювати однакову інформацію без користі").
 */
export function renderFieldCardMarkdown(card: FieldCard): string {
  const lines: string[] = [];
  if (card.synonym) lines.push(`**Наименование**: ${card.synonym}`);
  if (card.typeLabel) lines.push(`**Тип**: ${card.typeLabel}`);
  if (card.target) lines.push(`**Объект**: \`${card.target}\``);
  lines.push(`**Вид**: ${card.kindLabel}`);
  if (card.variants?.length) {
    lines.push('', '**Варианты**:', ...card.variants.map((v) => `- ${v}`));
  }
  if (card.structure) {
    lines.push(
      '',
      `**Структура**: ${card.structure.attributes} реквизитов · ${card.structure.tabularSections} табличных частей`
    );
  }
  if (card.fieldsPreview?.length) {
    lines.push(`**Поля**: ${card.fieldsPreview.join(' · ')}`);
  }
  return lines.join('  \n');
}
