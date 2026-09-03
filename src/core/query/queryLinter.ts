/**
 * Лінтер антипатернів запиту — advisory-попередження про ЯКІСТЬ/ЕФЕКТИВНІСТЬ,
 * на відміну від `semanticValidator.ts`, який перевіряє лише КОРЕКТНІСТЬ (блокуючі
 * помилки). Ці попередження ніколи не блокують відкриття/застосування запиту.
 *
 * Той самий принцип, що й у семантичного валідатора: жодних хибних спрацювань —
 * перевірки або читають структуровану модель напряму, або токенізують «сирий»
 * текст умови (`custom.expression`), без евристик, які могли б помилково
 * спрацювати на легітимному запиті.
 */
import type { BatchDocument } from './batchModel';
import type { QueryDocument } from './unionModel';
import type { QueryModel, Condition, JoinCondition } from './queryModel';
import { tokenize } from './sdblLexer';

export type LintWarningCode = 'full-join' | 'join-with-subquery' | 'top-without-order' | 'like-leading-wildcard';

export interface LintWarning {
  code: LintWarningCode;
  message: string;
  /**
   * Фрагмент оригінального тексту для навігації «клік → код» — переграє вже
   * наявний `handleNavigate` у `QueryTextDialog.tsx` (той самий механізм, яким
   * користуються панелі «Структура»/«Параметры»), а не власну логіку позиції.
   */
  searchText?: string;
}

/** Умова містить `ПОДОБНО` з рядковим літералом, що починається з НЕекранованого
 * `%` (1С: `~` — символ екранування спецсимволів шаблону `ПОДОБНО`) — такий шаблон
 * не може використати індекс. Літеральний (не `&Параметр`) шаблон завжди потрапляє
 * в модель як «сире» вираз (`custom.expression`, див. sdblParser.ts trySimpleCondition),
 * тому перевіряємо саме токенізований сирий текст. */
function checkLikeLeadingWildcard(expression: string, warnings: LintWarning[]): void {
  const tokens = tokenize(expression);
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (!(t.type === 'keyword' && t.value === 'ПОДОБНО')) continue;
    const next = tokens[i + 1];
    if (next.type !== 'string') continue;
    const content = next.value.slice(1, -1); // без внешних кавычек
    if (content.length === 0) continue;
    const escaped = content[0] === '~' && content[1] === '%';
    if (content[0] === '%' && !escaped) {
      warnings.push({
        code: 'like-leading-wildcard',
        message: `Шаблон ${next.value} в условии ПОДОБНО начинается с "%" — не может использовать индекс`,
        searchText: expression,
      });
    }
  }
}

function walkJoinConditions(conditions: JoinCondition[] | undefined, warnings: LintWarning[]): void {
  for (const c of conditions ?? []) {
    if (c.custom && c.expression) checkLikeLeadingWildcard(c.expression, warnings);
  }
}

function walkConditions(conditions: Condition[] | undefined, warnings: LintWarning[]): void {
  for (const c of conditions ?? []) {
    if (c.subquery) walkDocument(c.subquery, warnings);
    if (c.custom && c.expression) checkLikeLeadingWildcard(c.expression, warnings);
  }
}

function lintModel(model: QueryModel, warnings: LintWarning[]): void {
  for (const t of model.tables) {
    if (t.subquery) walkDocument(t.subquery, warnings);
  }

  for (const j of model.joins ?? []) {
    // Повне з'єднання з ОБОХ боків (ЛЕВОЕ/ПРАВОЕ — це нормально, лише ПОЛНОЕ,
    // коли ВСЕ виставлено з обох сторін одночасно, часто помилка проєктування,
    // не навмисний вибір — сканує весь результат обох таблиць).
    if (j.leftAll && j.rightAll) {
      const leftTable = model.tables.find(t => t.id === j.leftTableId);
      const rightTable = model.tables.find(t => t.id === j.rightTableId);
      warnings.push({
        code: 'full-join',
        message: 'Полное соединение (ВСЕ с обеих сторон) может быть неэффективным — сканирует весь объём обеих таблиц',
        searchText: leftTable?.alias || rightTable?.alias,
      });
    }
    // З'єднання, де одна зі сторін — вкладений запит: 1С не може використати
    // індекси джерела так, як для реальної таблиці.
    for (const tableId of [j.leftTableId, j.rightTableId]) {
      const table = model.tables.find(t => t.id === tableId);
      if (table?.subquery) {
        warnings.push({
          code: 'join-with-subquery',
          message: `Соединение с вложенным запросом (${table.alias || table.fullName}) может быть неэффективным`,
          searchText: table.alias,
        });
      }
    }
    walkJoinConditions(j.conditions, warnings);
  }

  // ПЕРВЫЕ N без УПОРЯДОЧИТЬ ПО / АВТОУПОРЯДОЧИВАНИЕ — результат недетермінований:
  // 1С не гарантує стабільний порядок рядків без явного сортування.
  if (
    typeof model.selection?.top === 'number' &&
    !(model.order && (model.order.fields.length > 0 || model.order.auto))
  ) {
    warnings.push({
      code: 'top-without-order',
      message: 'ПЕРВЫЕ N без УПОРЯДОЧИТЬ ПО — результат не детерминирован (может отличаться между вызовами)',
      searchText: 'ПЕРВЫЕ',
    });
  }

  walkConditions(model.conditions, warnings);
  walkConditions(model.having, warnings);
}

function walkDocument(qdoc: QueryDocument, warnings: LintWarning[]): void {
  for (const member of qdoc.members) lintModel(member.model, warnings);
}

/** Пролінтувати один документ (участник ОБЪЕДИНЕНИЯ або одиночний запит). */
export function lintDocument(doc: QueryDocument): LintWarning[] {
  const warnings: LintWarning[] = [];
  walkDocument(doc, warnings);
  return warnings;
}

/** Пролінтувати весь пакет (усі `;`-блоки). */
export function lintBatch(batch: BatchDocument): LintWarning[] {
  const warnings: LintWarning[] = [];
  for (const doc of batch.members) walkDocument(doc, warnings);
  return warnings;
}
