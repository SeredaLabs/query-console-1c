/**
 * Table identity color — маленький СТАБІЛЬНИЙ accent (badge/border), НЕ
 * заливка всієї картки (explicit рішення користувача: screenshot showed a
 * full-color header, але при 8-12 таблицях це створює зайвий visual noise —
 * design decision має пріоритет над screenshot саме для цієї деталі).
 *
 * VS Code `--vscode-charts-*` — вже theme-aware/muted у будь-якій темі
 * (§30 visual spec), тому кольори не хардкоджені.
 */
const PALETTE = [
  'var(--vscode-charts-blue)',
  'var(--vscode-charts-green)',
  'var(--vscode-charts-purple)',
  'var(--vscode-charts-orange)',
  'var(--vscode-charts-red)',
  'var(--vscode-charts-yellow)',
  'var(--vscode-charts-foreground)',
] as const;

/** Стабільний колір за ПОРЯДКОМ ПЕРШОЇ ПОЯВИ таблиці в selectedTables (index у списку id). */
export function identityColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}
