import type { Join } from '../../core/query/queryModel';

export type JoinKindLabel = 'LEFT' | 'INNER' | 'FULL';

/**
 * Мапінг leftAll/rightAll → LEFT/INNER/FULL — ідентичний за змістом
 * `joinKeyword()` у sdblGenerator.ts:958-961 (internal, не exported, тому
 * переписано локально як чиста функція, а не імпортовано). `JoinKind`
 * (queryModel.ts:487) має рівно ці 3 значення — конструктор 1С нормалізує
 * "праве" з'єднання перестановкою таблиць на етапі парсингу; у Phase 3B
 * єдиний шлях створення джойна (ADD_JOIN) завжди дає leftAll=rightAll=false,
 * тож `rightAll && !leftAll` практично недосяжний — але про всяк випадок
 * не показуємо неіснуючий 4-й лейбл, а падаємо в найближчий безпечний INNER.
 */
export function joinKindLabel(leftAll: boolean, rightAll: boolean): JoinKindLabel {
  if (leftAll && rightAll) return 'FULL';
  if (leftAll) return 'LEFT';
  return 'INNER';
}

export interface JoinKindVisual {
  icon: string;
  color: string;
}

/**
 * Icon + color identity per JOIN kind — для panels налаштування зв'язку
 * (creation popover + Inspector), НЕ для canvas badge/JoinOverlay (той
 * лишається frozen — accent-only selected/hovered, § Phase 5 visual freeze).
 * Кольори — окремі `TOKENS.chart*` токени (theme.ts), не accent/success, щоб
 * не конфліктувати з уже зафіксованими selection/inclusion семантиками.
 */
export function joinKindVisual(kind: JoinKindLabel, tokens: Record<string, string>): JoinKindVisual {
  switch (kind) {
    case 'INNER':
      return { icon: 'arrow-swap', color: tokens.chartBlue };
    case 'LEFT':
      return { icon: 'arrow-left', color: tokens.chartOrange };
    case 'FULL':
      return { icon: 'combine', color: tokens.chartPurple };
  }
}

/**
 * Компактний опис умови зв'язку для canvas-бейджа (gap analysis: "не видно
 * по лініям... який зараз зв'язок по полям, реалізовано лише при наведенні"
 * — Inspector). Тепер бейдж сам показує це, без потреби виділяти/наводити.
 * Читає лише `conditions[0]`/top-level mirror (той самий single-conjunct
 * обсяг, що вже редагується в Inspector/creation popover) — без імен
 * таблиць (лінія й так візуально з'єднує саме ці дві картки).
 */
export function joinConditionSummary(join: Join): string | null {
  const cond = join.conditions?.[0] ?? join;
  if (cond.custom && cond.expression) return cond.expression;
  if (cond.leftPath && cond.rightPath) return `${cond.leftPath} ${cond.operator ?? '='} ${cond.rightPath}`;
  return null;
}
