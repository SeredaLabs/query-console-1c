import * as React from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, historyKeymap, history, indentWithTab } from '@codemirror/commands';
import { sdblHighlight, sdblHighlightTheme } from '../cmHighlight';
import { CSP_NONCE } from '../cspNonce';

export interface CodeEditorHandle {
  /** Вставляет текст в позицию курсора (заменяя выделение, если оно есть) и переносит туда курсор. */
  insertAtCursor: (snippet: string) => void;
  focus: () => void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
  spellCheck?: boolean;
  testId?: string;
  /** Стили контейнера — размер, рамка, фон («коробка» поля ввода). */
  wrapperStyle: React.CSSProperties;
  /** Стили текста — шрифт/перенос/отступы/цвет обычного текста. */
  textStyle: React.CSSProperties;
}

/**
 * Редактор текста запроса/выражения на CodeMirror 6 — так же, как встроенные
 * редакторы в других расширениях с похожими нуждами (лёгкий тулкит вместо
 * Monaco: https://codemirror.net/, ~на порядок меньше в бандле). Даёт
 * настоящий курсор/выделение/undo-redo вместо textarea-оверлея, а подсветку
 * SDBL — через ViewPlugin в ../cmHighlight.ts поверх уже проверенного
 * токенизатора (queryHighlight.ts), без Lezer-грамматики.
 */
export const CodeEditor = React.forwardRef<CodeEditorHandle, Props>(function CodeEditor(
  { value, onChange, onDragOver, onDrop, spellCheck, testId, wrapperStyle, textStyle },
  forwardedRef
) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const wrapLines = textStyle.whiteSpace === 'pre-wrap';

  React.useImperativeHandle(forwardedRef, () => ({
    insertAtCursor(snippet: string) {
      const view = viewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: snippet },
        selection: { anchor: from + snippet.length },
      });
      view.focus();
    },
    focus() {
      viewRef.current?.focus();
    },
  }), []);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const theme = EditorView.theme({
      '&': {
        // Не height:100% — обёртка сидит в flex-колонке без явного height
        // (только flex/min/max-height), и в такой цепочке проценты по
        // высоте резолвятся ненадёжно (проверено — именно из-за этого
        // .cm-editor разрастался по контенту вместо прокрутки). position:
        // absolute тут не годится — сам CodeMirror жёстко фиксирует
        // `.cm-editor { position: relative !important }` в своих базовых
        // стилях. Вместо этого растягиваем через flex — обёртка ниже стала
        // flex-колонкой, а .cm-editor в ней единственный flex-child;
        // flex:1 распределяет фактически доступное место контейнера,
        // а не проценты от (возможно неопределённой) высоты родителя.
        flex: '1 1 auto',
        minHeight: '0',
        color: (textStyle.color as string) ?? 'inherit',
        fontSize: typeof textStyle.fontSize === 'number' ? `${textStyle.fontSize}px` : (textStyle.fontSize as string),
      },
      '.cm-content': {
        fontFamily: (textStyle.fontFamily as string) ?? 'inherit',
        lineHeight: String(textStyle.lineHeight ?? 'normal'),
        padding: typeof textStyle.padding === 'number' ? `${textStyle.padding}px` : (textStyle.padding as string) ?? '4px',
        caretColor: (textStyle.color as string) ?? 'inherit',
      },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit' },
      '&.cm-focused': { outline: 'none' },
      // Нативный скроллбар ОС (особенно на macOS с «прячущимися» полосами)
      // не даёт понять, что текст длиннее видимой области — рисуем свой,
      // всегда видимый, в тонах VS Code (те же переменные, что использует
      // сам редактор VS Code для своего скроллбара).
      '.cm-scroller::-webkit-scrollbar': { width: '14px', height: '14px' },
      '.cm-scroller::-webkit-scrollbar-track': { background: 'transparent' },
      '.cm-scroller::-webkit-scrollbar-thumb': {
        background: 'var(--vscode-scrollbarSlider-background, rgba(121,121,121,0.4))',
        border: '4px solid transparent',
        backgroundClip: 'padding-box',
        borderRadius: '7px',
      },
      '.cm-scroller::-webkit-scrollbar-thumb:hover': {
        background: 'var(--vscode-scrollbarSlider-hoverBackground, rgba(100,100,100,0.7))',
        backgroundClip: 'padding-box',
      },
      '.cm-scroller::-webkit-scrollbar-thumb:active': {
        background: 'var(--vscode-scrollbarSlider-activeBackground, rgba(191,191,191,0.4))',
        backgroundClip: 'padding-box',
      },
    });

    const extensions = [
      EditorView.cspNonce.of(CSP_NONCE),
      history(),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      sdblHighlight,
      sdblHighlightTheme,
      theme,
      EditorView.updateListener.of(update => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
      }),
      EditorView.contentAttributes.of({ spellcheck: spellCheck === false ? 'false' : 'true' }),
    ];
    if (wrapLines) extensions.push(EditorView.lineWrapping);

    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    return () => view.destroy();
    // Пересоздаём редактор только при смене режима переноса строк — остальные
    // пропсы (onChange/цвета/spellCheck) читаются через рефы/статичные стили.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrapLines]);

  // Синхронизация извне (например, сброс текста при повторном открытии диалога) —
  // свои же изменения (через onChange выше) сюда не возвращаются, так как
  // `value` в родителе уже совпадёт с состоянием CodeMirror к этому моменту.
  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', ...wrapperStyle }}
    />
  );
});
