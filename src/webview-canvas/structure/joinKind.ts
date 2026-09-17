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
