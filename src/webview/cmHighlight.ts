import { ViewPlugin, Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { highlightSegments, type HighlightTokenType } from './queryHighlight';

/**
 * Подсветка синтаксиса языка запросов для CodeMirror — тот же подход, что
 * применяют другие расширения для встроенного в webview редактора текста
 * (лёгкий CodeMirror 6 вместо тяжёлого Monaco): токенизатор не завязан на
 * Lezer-грамматику, а размечает диапазоны через ViewPlugin/Decoration.mark
 * поверх уже проверенного тем же токенизатора, что и раньше (queryHighlight.ts).
 */
function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const text = view.state.doc.toString();
  let pos = 0;
  for (const seg of highlightSegments(text)) {
    if (seg.type !== 'plain' && seg.text.length > 0) {
      builder.add(pos, pos + seg.text.length, Decoration.mark({ class: `cm-qc-${seg.type}` }));
    }
    pos += seg.text.length;
  }
  return builder.finish();
}

export const sdblHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged) this.decorations = buildDecorations(update.view);
    }
  },
  { decorations: v => v.decorations }
);

/**
 * Цвета токенов. `--vscode-symbolIcon-*Foreground` для этого не подошли —
 * несмотря на название, они рассчитаны на мелкие иконки в Outline/breadcrumbs,
 * и в реальных темах (не только в дефолтной) часто оказываются почти того же
 * цвета, что и обычный текст (проверено — subj. с реальным юзером: keyword
 * выходил жирным, но не цветным). `--vscode-charts-*` создан именно для
 * заведомо различимых между собой цветов (легенда графиков) — то, что
 * реально нужно тут. `EditorView.theme` (не `baseTheme`) — чтобы это точно
 * не проигрывало по приоритету другим стилям редактора. Та же таблица красит
 * фрагменты кода вне редактора (справка/примеры в «Произвольном выражении»),
 * чтобы подсветка там не расходилась с редактором.
 */
export const HIGHLIGHT_TOKEN_STYLE: Record<Exclude<HighlightTokenType, 'plain'>, { color: string; fontWeight?: string; fontStyle?: string }> = {
  keyword: { color: 'var(--vscode-charts-purple, #c586c0)', fontWeight: '600' },
  function: { color: 'var(--vscode-charts-yellow, #dcdcaa)' },
  string: { color: 'var(--vscode-charts-orange, #ce9178)' },
  date: { color: 'var(--vscode-charts-orange, #ce9178)' },
  number: { color: 'var(--vscode-charts-green, #b5cea8)' },
  param: { color: 'var(--vscode-charts-blue, #9cdcfe)' },
  comment: { color: 'var(--vscode-descriptionForeground, #6a9955)', fontStyle: 'italic' },
};

export const sdblHighlightTheme = EditorView.theme(
  Object.fromEntries(Object.entries(HIGHLIGHT_TOKEN_STYLE).map(([type, style]) => [`.cm-qc-${type}`, style])),
);
