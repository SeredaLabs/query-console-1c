import * as React from 'react';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, historyKeymap, history, undo as cmUndo, redo as cmRedo, isolateHistory } from '@codemirror/commands';
import { bracketMatching, foldGutter, codeFolding, foldKeymap } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, snippet, startCompletion as cmStartCompletion } from '@codemirror/autocomplete';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import { linter, lintGutter, setDiagnostics } from '@codemirror/lint';
import type { Diagnostic } from '@codemirror/lint';
import { sdblHighlight, sdblHighlightTheme } from '../cmHighlight';
import { CSP_NONCE } from '../cspNonce';

export interface CodeEditorHandle {
  /** Вставляет текст в позицию курсора (заменяя выделение, если оно есть) и переносит туда курсор. */
  insertAtCursor: (snippet: string) => void;
  focus: () => void;
  /** Требуют `richFeatures` — см. CodeMirror `history()`, уже подключён всегда. */
  undo: () => void;
  redo: () => void;
  /** Требует `richFeatures` (без него `search()` не подключён, вызов — no-op). */
  openSearch: () => void;
  /**
   * Обновляет маркеры диагностики (стадия 4 плана «Текст запроса v2») через
   * `setDiagnostics` — это обычная транзакция редактора, не пересоздание
   * `EditorView`/`EditorState`, поэтому НЕ трогает undo/redo-историю (риск п.0.11
   * design-дока: перестроение view на каждое обновление диагностики стёрло бы её).
   * Требует `richFeatures` (без него `linter()` не подключён, вызов — no-op).
   */
  setDiagnostics: (diagnostics: Diagnostic[]) => void;
  /** Переносит курсор на символьное смещение в тексте и прокручивает к нему —
   * клик по ошибке в статус-панели/диагностике (стадия 4 плана). */
  moveCursorTo: (offset: number) => void;
  /** Вставляє шаблон `snippet()` CodeMirror (`${Имя}` — поля, Tab/Shift+Tab між
   * ними) замість виділення; курсор/виділення стає на перше поле. */
  insertSnippet: (template: string) => void;
  /** Відкриває автодоповнення в позиції курсора (як Ctrl+Space) — no-op, якщо
   * `extensions` не містять `autocompletion()`. */
  startCompletion: () => void;
  /** Поточна позиція курсора (голова основного виділення). */
  getCursor: () => number;
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
  /**
   * Расширенный набор возможностей редактора (номера строк, активная строка,
   * парные скобки, автозакрытие скобок, folding, поиск/замена, гуттер диагностики) —
   * стадия 2 плана «Текст запроса v2». Опционально и по умолчанию выключено, чтобы
   * НЕ менять поведение остальных мест использования `CodeEditor` (произвольные
   * выражения, окно временной таблицы и т.п.) — там эти возможности не нужны и не
   * запрашивались.
   */
  richFeatures?: boolean;
  /** Read-only перегляд (напр. SDBL-превʼю New Builder) — підсвітка синтаксису
   * лишається, курсор/виділення/копіювання працюють, але доку не можна редагувати
   * і `onChange` ніколи не викликається. Опційно — інші місця використання не
   * зачеплені. */
  readOnly?: boolean;
  /** Додаткові розширення CodeMirror (напр. автодоповнення редактора довільних
   * виразів). Читаються один раз при створенні редактора — передавайте стабільний
   * масив. */
  extensions?: Extension[];
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
  { value, onChange, onDragOver, onDrop, spellCheck, testId, wrapperStyle, textStyle, richFeatures, readOnly, extensions: extraExtensions },
  forwardedRef
) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const wrapLines = textStyle.whiteSpace === 'pre-wrap';
  // Перенос рядків — через Compartment, а не пересоздання EditorView: перемикач
  // «Перенос рядків» у редакторі виразів не повинен губити undo-історію/виділення.
  const wrapCompartmentRef = React.useRef(new Compartment());

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
    undo() {
      const view = viewRef.current;
      if (view) cmUndo(view);
    },
    redo() {
      const view = viewRef.current;
      if (view) cmRedo(view);
    },
    openSearch() {
      const view = viewRef.current;
      if (view) openSearchPanel(view);
    },
    setDiagnostics(diagnostics: Diagnostic[]) {
      const view = viewRef.current;
      if (view) view.dispatch(setDiagnostics(view.state, diagnostics));
    },
    moveCursorTo(offset: number) {
      const view = viewRef.current;
      if (!view) return;
      const pos = Math.max(0, Math.min(offset, view.state.doc.length));
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      view.focus();
    },
    insertSnippet(template: string) {
      const view = viewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      snippet(template)(view, null, from, to);
      view.focus();
    },
    startCompletion() {
      const view = viewRef.current;
      if (!view) return;
      view.focus();
      cmStartCompletion(view);
    },
    getCursor() {
      return viewRef.current?.state.selection.main.head ?? 0;
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
      // Стадия 2 (richFeatures): без этих правил гуттер номеров строк/активная строка/
      // панель поиска рендерятся дефолтным светлым скином CodeMirror — режут глаз на
      // тёмном фоне VS Code. Селекторы применяются, только когда сами расширения
      // подключены (richFeatures), в остальных местах использования CodeEditor — no-op.
      '.cm-gutters': {
        background: 'var(--vscode-editorGutter-background, var(--vscode-editor-background, #1e1e1e))',
        color: 'var(--vscode-editorLineNumber-foreground, #858585)',
        border: 'none',
      },
      '.cm-activeLineGutter': {
        background: 'var(--vscode-editor-lineHighlightBackground, rgba(255,255,255,0.06))',
        color: 'var(--vscode-editorLineNumber-activeForeground, #c6c6c6)',
      },
      '.cm-activeLine': {
        background: 'var(--vscode-editor-lineHighlightBackground, rgba(255,255,255,0.06))',
      },
      '.cm-panels': {
        background: 'var(--vscode-editorWidget-background, #252526)',
        color: 'var(--vscode-editorWidget-foreground, #ccc)',
      },
      '.cm-panels-bottom': { borderTop: '1px solid var(--qc-border, #454545)' },
      '.cm-textfield': {
        background: 'var(--vscode-input-background, #3c3c3c)',
        color: 'var(--vscode-input-foreground, #ccc)',
        border: '1px solid var(--vscode-input-border, transparent)',
        borderRadius: '2px',
      },
      '.cm-button': {
        background: 'var(--vscode-button-secondaryBackground, #3a3d41)',
        color: 'var(--vscode-button-secondaryForeground, #ccc)',
        border: 'none',
        borderRadius: '2px',
        backgroundImage: 'none',
      },
      '.cm-button:hover': {
        background: 'var(--vscode-button-secondaryHoverBackground, #45494e)',
      },
      // Кнопка «×» закрытия панели поиска рендерится CodeMirror БЕЗ класса cm-button
      // (см. @codemirror/search) — только `background: inherit`, цвет текста не
      // задан вовсе, поэтому она наследует дефолтный тёмный цвет кнопки браузера на
      // тёмном фоне и почти не видна. Стилизуем отдельно, раз общий .cm-button её не
      // покрывает.
      '.cm-search [name="close"]': {
        color: 'var(--vscode-editorWidget-foreground, #ccc)',
        fontSize: '16px',
        opacity: 0.8,
      },
      '.cm-search [name="close"]:hover': {
        opacity: 1,
        color: 'var(--vscode-foreground, #fff)',
      },
      // Автодоповнення/сніпети/лінт-тултіпи (лише коли відповідні розширення
      // підключені через `extensions`/`richFeatures`) — у тонах VS Code suggest-віджета,
      // а не світлим дефолтним скіном CodeMirror.
      '.cm-tooltip': {
        background: 'var(--vscode-editorSuggestWidget-background, var(--vscode-editorWidget-background, #252526))',
        color: 'var(--vscode-editorSuggestWidget-foreground, var(--vscode-editorWidget-foreground, #ccc))',
        border: '1px solid var(--vscode-editorSuggestWidget-border, var(--qc-border, #454545))',
        borderRadius: '4px',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul': {
        fontFamily: 'var(--vscode-font-family, sans-serif)',
        maxHeight: '16em',
        minWidth: '280px',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
        display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 8px',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        background: 'var(--vscode-editorSuggestWidget-selectedBackground, var(--vscode-list-activeSelectionBackground, #04395e))',
        color: 'var(--vscode-editorSuggestWidget-selectedForeground, var(--vscode-list-activeSelectionForeground, #fff))',
      },
      '.cm-completionDetail': {
        marginLeft: 'auto', paddingLeft: '16px', fontStyle: 'normal',
        color: 'var(--vscode-descriptionForeground, #9d9d9d)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '50%',
      },
      '.cm-completionMatchedText': {
        textDecoration: 'none', fontWeight: 'bold',
        color: 'var(--vscode-editorSuggestWidget-highlightForeground, #2aaaff)',
      },
      '.cm-tooltip.cm-completionInfo': {
        padding: '8px 10px', maxWidth: '360px', boxSizing: 'border-box',
        fontFamily: 'var(--vscode-font-family, sans-serif)', fontSize: '12px',
        // Довгі імена метаданих (`РегистрНакопления.X.Остатки`) переносяться, а не
        // розтягують картку за межі вільного місця.
        overflowWrap: 'anywhere',
        boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
      },
      '.cm-tooltip.cm-completionInfo.qc-info-side.cm-completionInfo-right': { marginLeft: '4px' },
      '.cm-tooltip.cm-completionInfo.qc-info-side.cm-completionInfo-left': { marginRight: '4px' },
      '.cm-snippetField': {
        background: 'var(--vscode-editor-snippetTabstopHighlightBackground, rgba(124,124,124,0.3))',
      },
      '.cm-snippetFieldPosition': { borderLeft: '1px solid var(--vscode-editorCursor-foreground, #aeafad)' },
    });

    const extensions: Extension[] = [
      EditorView.cspNonce.of(CSP_NONCE),
      history(),
      // Без indentWithTab: этот редактор — не полноценная IDE для ручной раскладки
      // отступов, а поле для просмотра/точечной правки уже готового текста запроса
      // (отступы расставляет «Форматировать»). Со связкой Tab→вставить отступ клик в
      // редактор + машинальный Tab (или попытка переключить фокус клавиатурой) молча
      // вставляет символ табуляции — почти незаметно на строке, уже начинающейся с
      // табов, но реально меняет текст, из-за чего guard «не применены изменения»
      // (стадия 8) срабатывает на правках, которые пользователь не считал правкой.
      keymap.of([...defaultKeymap, ...historyKeymap]),
      sdblHighlight,
      sdblHighlightTheme,
      theme,
      EditorView.updateListener.of(update => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
      }),
      EditorView.contentAttributes.of({ spellcheck: spellCheck === false ? 'false' : 'true' }),
    ];
    extensions.push(wrapCompartmentRef.current.of(wrapLines ? EditorView.lineWrapping : []));
    if (readOnly) extensions.push(EditorState.readOnly.of(true), EditorView.contentAttributes.of({ 'aria-readonly': 'true' }));
    if (richFeatures) {
      extensions.push(
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        bracketMatching(),
        closeBrackets(),
        codeFolding(),
        foldGutter(),
        search(),
        // Без источника (`null` — только конфигурация): реальные диагностики приходят
        // через handle.setDiagnostics() (стадия 4). Пустой источник `() => []` здесь
        // нельзя — `linter()` вызывает его после каждой правки (~750мс простоя) и
        // затирает уже выставленные маркеры пустым списком.
        linter(null),
        lintGutter(),
        keymap.of([...closeBracketsKeymap, ...searchKeymap, ...foldKeymap])
      );
    }
    if (extraExtensions) extensions.push(...extraExtensions);

    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    return () => view.destroy();
    // Пересоздаём редактор при смене набора расширений — остальные пропсы
    // (onChange/цвета/spellCheck/extensions) читаются через рефы/статичные стили;
    // перенос строк переключается эффектом ниже без пересоздания.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [richFeatures, readOnly]);

  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: wrapCompartmentRef.current.reconfigure(wrapLines ? EditorView.lineWrapping : []) });
  }, [wrapLines]);

  // Синхронизация извне (сброс текста при повторном открытии диалога, кнопка
  // «Форматировать» — стадия 5 плана) — свои же изменения (через onChange выше) сюда
  // не возвращаются, так как `value` в родителе уже совпадёт с состоянием CodeMirror
  // к этому моменту. `isolateHistory: 'full'` — программная замена ВСЕГДА своя
  // undo-группа, а не сливается с только что напечатанным пользователем текстом
  // (CodeMirror группирует соседние транзакции по умолчанию, если они произошли
  // достаточно быстро одна за другой — без этой аннотации Ctrl/Cmd+Z после «Форматировать»,
  // выполненного сразу вслед за правкой, мог бы откатить ОБЕ правки одним шагом).
  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        annotations: isolateHistory.of('full'),
      });
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
