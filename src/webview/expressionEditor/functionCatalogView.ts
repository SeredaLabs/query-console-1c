import { FUNCTION_CATALOG, type FunctionGroup, type FunctionLeaf } from '../../core/query/functionCatalog';
import type { MessageKey } from '../i18n';
import { tIfExists } from '../i18n';

/**
 * Категорії панелі «Функції та оператори» редактора виразів — лише ПРЕДСТАВЛЕННЯ
 * єдиного `FUNCTION_CATALOG` (core; його ж використовують форматер і підсвітка),
 * а не другий каталог: кожен лист каталогу потрапляє рівно в одну категорію за
 * своєю групою (з кількома точковими винятками), «Часто використовувані» і
 * «Шаблони» — посилання на листи за ярликом.
 */
export type FunctionCategoryId =
  | 'frequent' | 'conditional' | 'aggregate' | 'string' | 'date' | 'numeric' | 'logical' | 'operators' | 'other';

export interface FunctionCategory {
  id: FunctionCategoryId;
  labelKey: MessageKey;
  leaves: FunctionLeaf[];
}

const CATEGORY_ORDER: FunctionCategoryId[] = [
  'frequent', 'conditional', 'aggregate', 'string', 'date', 'numeric', 'logical', 'operators', 'other',
];

const CATEGORY_LABEL: Record<FunctionCategoryId, MessageKey> = {
  frequent: 'exprEditor.category.frequent',
  conditional: 'exprEditor.category.conditional',
  aggregate: 'exprEditor.category.aggregate',
  string: 'exprEditor.category.string',
  date: 'exprEditor.category.date',
  numeric: 'exprEditor.category.numeric',
  logical: 'exprEditor.category.logical',
  operators: 'exprEditor.category.operators',
  other: 'exprEditor.category.other',
};

/** Група каталогу → категорія. */
export const GROUP_CATEGORY: Record<string, FunctionCategoryId> = {
  'Функции работы со строками': 'string',
  'Функции работы с датами': 'date',
  'Функции работы с числами': 'numeric',
  'Агрегатные функции': 'aggregate',
  'Прочие функции': 'other',
  'Арифметические операторы': 'operators',
  'Логические операторы': 'logical',
  'Прочие операторы': 'other',
  'Прочее': 'other',
};

/** Точкові винятки з групування каталогу. */
const LEAF_CATEGORY: Record<string, FunctionCategoryId> = {
  'ВЫБОР': 'conditional',
  'ЕСТЬNULL': 'conditional',
  'ДАТАВРЕМЯ': 'date',
};

export const FREQUENT_LABELS = ['ВЫБОР', 'ЕСТЬNULL', 'СУММА', 'КОЛИЧЕСТВО', 'ПРЕДСТАВЛЕНИЕ', 'НАЧАЛОПЕРИОДА', 'ПОДСТРОКА', 'ВЫРАЗИТЬ'];

/** Меню «Шаблони» — багатоаргументні конструкції, які зручно вставляти сніпетом. */
export const TEMPLATE_LABELS = ['ВЫБОР', 'ЕСТЬNULL', 'ВЫРАЗИТЬ', 'НАЧАЛОПЕРИОДА', 'ДОБАВИТЬКДАТЕ', 'РАЗНОСТЬДАТ', 'ПОДСТРОКА', 'КОЛИЧЕСТВО(РАЗЛИЧНЫЕ)'];

interface LeafWithGroup {
  leaf: FunctionLeaf;
  group: string;
}

function walk(group: FunctionGroup, acc: LeafWithGroup[]): void {
  for (const child of group.children) {
    if ('template' in child) acc.push({ leaf: child, group: group.label });
    else walk(child, acc);
  }
}

export function allCatalogLeaves(): LeafWithGroup[] {
  const acc: LeafWithGroup[] = [];
  walk(FUNCTION_CATALOG, acc);
  return acc;
}

export function categoryOf(entry: LeafWithGroup): FunctionCategoryId {
  return LEAF_CATEGORY[entry.leaf.label] ?? GROUP_CATEGORY[entry.group] ?? 'other';
}

export function leafByLabel(label: string): FunctionLeaf | undefined {
  return allCatalogLeaves().find(e => e.leaf.label === label)?.leaf;
}

export function buildFunctionCategories(): FunctionCategory[] {
  const entries = allCatalogLeaves();
  const byId = new Map<FunctionCategoryId, FunctionLeaf[]>(CATEGORY_ORDER.map(id => [id, []]));
  for (const e of entries) byId.get(categoryOf(e))!.push(e.leaf);
  byId.set('frequent', FREQUENT_LABELS.map(leafByLabel).filter((l): l is FunctionLeaf => !!l));
  return CATEGORY_ORDER.map(id => ({ id, labelKey: CATEGORY_LABEL[id], leaves: byId.get(id)! }));
}

/**
 * `<Имя>`-місця шаблону каталогу → поля сніпета CodeMirror `${Имя}` (Tab/Shift+Tab).
 * Поля нумеруються (`${1:Имя}`): однойменні поля без номера `snippet()` зв'язує між
 * собою — у `ВЫБОР` правка першого `<Значение>` змінювала б і друге. Фігурні дужки в
 * самому тексті екрануються — для `snippet()` вони службові.
 */
export function templateToSnippet(template: string): string {
  let n = 0;
  return template
    .replace(/[{}]/g, m => `\\${m}`)
    .replace(/<([^<>\s][^<>]*)>/g, (_, name: string) => `\${${++n}:${name}}`);
}

/** Людський синтаксис для довідки/деталей підказки (шаблон як є). */
export function functionSignature(leaf: FunctionLeaf): string {
  return leaf.template;
}

/** Короткий опис листа поточною мовою UI, якщо він є. */
export function functionDescription(leaf: FunctionLeaf): string | undefined {
  return tIfExists(`exprFn.${leaf.label}`);
}

/** Слово, яке вводять для пошуку/доповнення (`КОЛИЧЕСТВО(РАЗЛИЧНЫЕ)` → `КОЛИЧЕСТВО`). */
export function completionWord(leaf: FunctionLeaf): string | undefined {
  const head = leaf.label.split(/[\s(]/)[0];
  return /^[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*$/.test(head) ? head : undefined;
}
