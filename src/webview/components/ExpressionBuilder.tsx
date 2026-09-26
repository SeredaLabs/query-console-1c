import * as React from 'react';
import { autocompletion } from '@codemirror/autocomplete';
import { indentUnit } from '@codemirror/language';
import type { Diagnostic } from '@codemirror/lint';
import type { MetadataResolver } from '../../core/query/metadataResolver';
import { formatExpression } from '../../core/query/exprFormatter';
import { ResizeHandle } from './ResizeHandle';
import { CodeEditor, type CodeEditorHandle } from './CodeEditor';
import { IconButton } from './IconButton';
import { ToolbarButton, TOOLBAR_SEPARATOR } from './ToolbarButton';
import { BTN, BTN_SECONDARY, panelBox, SECTION_HEADER } from '../sharedStyles';
import { localizeDiagnostic, t } from '../i18n';
import {
  analyzeExpression, dedentContinuationLines,
  type ExpressionAnalysis, type ExpressionContext, type ExpressionIssue, type ExpressionSource,
} from '../expressionEditor/expressionContext';
import { expressionCompletionSource, positionCompletionInfo } from '../expressionEditor/expressionCompletion';
import { leafByLabel, templateToSnippet, TEMPLATE_LABELS } from '../expressionEditor/functionCatalogView';
import { FieldsPanel } from '../expressionEditor/FieldsPanel';
import { FunctionsPanel } from '../expressionEditor/FunctionsPanel';
import { TREE_CSS } from '../expressionEditor/TreeList';

export type { ExpressionSource } from '../expressionEditor/expressionContext';

interface Props {
  title?: string;
  /** Джерела полів — вибрані таблиці конструктора під псевдонімами. */
  sources: ExpressionSource[];
  /** `false` — поля вставляються без псевдоніма (умова параметрів віртуальної таблиці). */
  qualified?: boolean;
  /** Той самий резолвер метаданих, що й у «Текст запроса»/Apply (`ConstructorView`). */
  resolver?: MetadataResolver;
  initialText?: string;
  onOk: (text: string) => void;
  onCancel: () => void;
}

type Layout = 'wide' | 'medium' | 'narrow';

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
};

const PANE_TITLE: React.CSSProperties = { fontSize: 13, fontWeight: 600, padding: '8px 10px 6px' };

const ANALYSIS_DEBOUNCE_MS = 300;

function layoutFor(width: number): Layout {
  if (width >= 1000) return 'wide';
  if (width >= 640) return 'medium';
  return 'narrow';
}

function toCmDiagnostics(issues: ExpressionIssue[], docLength: number): Diagnostic[] {
  return issues.flatMap(issue => {
    if (issue.from == null || issue.to == null) return [];
    const message = issue.kind === 'fieldNotFound'
      ? t('diagnostic.fieldNotFound', { field: issue.field ?? '', table: issue.table ?? '' })
      : localizeDiagnostic(issue.message ?? '');
    return [{ from: Math.min(issue.from, docLength), to: Math.min(issue.to, docLength), severity: issue.severity, message }];
  });
}

/**
 * «Довільний вираз» — модальний редактор виразу поля/умови/зв'язку Classic-конструктора.
 *
 * Постійно видимі лише «Поля», «Функції та оператори», редактор із командним рядком,
 * компактний статус і Скасувати/OK; довідка поля/функції з'являється контекстно
 * (картка активної підказки, довідка вибраної функції в її ж панелі).
 *
 * Канонічне представлення виразу — РЯДОК, як і раніше: `onOk(text)` віддає його в ті
 * самі reducer-actions (`SET_FIELD_EXPRESSION`/`SET_CONDITION_EXPRESSION`/…), а
 * генерація SDBL іде звичним шляхом. Власний стан модалки — лише UI (розміри,
 * розгортання, пошук, перенос рядків); семантика — з core (`resolveFieldPath`,
 * `isStructurallyValidExpression`, `formatExpression`) через `expressionEditor/*`.
 *
 * OK, як і до редизайну, не блокується діагностикою: блокуючі правила для
 * custom-виразів уже застосовує Apply конструктора (applyGate, PR-14).
 */
export function ExpressionBuilder({
  title = t('dialog.expression.title'), sources, qualified = true, resolver, initialText = '', onOk, onCancel,
}: Props): React.ReactElement {
  const [text, setText] = React.useState(initialText);
  const editorRef = React.useRef<CodeEditorHandle>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const fieldsPaneRef = React.useRef<HTMLDivElement>(null);
  const functionsPaneRef = React.useRef<HTMLDivElement>(null);
  const editorSectionRef = React.useRef<HTMLDivElement>(null);
  const fieldsSearchRef = React.useRef<HTMLInputElement>(null);
  const functionsSearchRef = React.useRef<HTMLInputElement>(null);

  // 8.3.7: перетягувані межі — ширина «Поля» і висота верхньої області.
  // Ширина «Поля» — частка ширини модалки (підлаштовується під розмір вікна й
  // розгортання), а не фіксовані пікселі; розділювач змінює саму частку.
  const [fieldsRatio, setFieldsRatio] = React.useState(0.42);
  const [panelWidth, setPanelWidth] = React.useState(1000);
  const [topHeight, setTopHeight] = React.useState(300);
  const [wrap, setWrap] = React.useState(true);
  const [editorMaximized, setEditorMaximized] = React.useState(false);
  const [dialogMaximized, setDialogMaximized] = React.useState(false);
  const [templatesOpen, setTemplatesOpen] = React.useState(false);
  const [layout, setLayout] = React.useState<Layout>('wide');
  const [narrowTab, setNarrowTab] = React.useState<'fields' | 'functions'>('fields');
  // Esc — нова клавіатурна дорога закриття; зі зміненим текстом спершу питаємо, щоб
  // «зайвий» Esc (підказка вже закрита) не викидав набране мовчки.
  const [confirmingEsc, setConfirmingEsc] = React.useState(false);

  const ctx = React.useMemo<ExpressionContext>(() => ({ sources, qualified, resolver }), [sources, qualified, resolver]);
  const ctxRef = React.useRef(ctx);
  ctxRef.current = ctx;

  // Розширення створюються один раз на редактор — джерела читаються через ref.
  const editorExtensions = React.useMemo(() => [
    autocompletion({ override: [expressionCompletionSource(() => ctxRef.current)], icons: true, positionInfo: positionCompletionInfo }),
    // Таб — як у тексті, що його генерує конструктор (`formatExpression`); впливає на
    // відступи сніпетів (`ВЫБОР` із каталогу).
    indentUnit.of('\t'),
  ], []);

  const [analysis, setAnalysis] = React.useState<ExpressionAnalysis>(() => analyzeExpression(initialText, ctx));
  React.useEffect(() => {
    // Дебаунс: під час набору (`Остатки.Кол|`) недописане ім'я не повинно миттєво
    // підсвічуватися як «поле не знайдено».
    const timer = setTimeout(() => setAnalysis(analyzeExpression(text, ctxRef.current, editorRef.current?.getCursor())), ANALYSIS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, ctx]);
  React.useEffect(() => {
    editorRef.current?.setDiagnostics(toCmDiagnostics(analysis.issues, text.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis]);

  React.useLayoutEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    const apply = () => { setLayout(layoutFor(node.clientWidth)); setPanelWidth(node.clientWidth); };
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(apply);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => { editorRef.current?.focus(); }, []);

  function insertAtCursor(snippetText: string) {
    const editor = editorRef.current;
    if (!editor) { setText(prev => prev + snippetText); return; }
    editor.insertAtCursor(snippetText);
  }

  function insertTemplate(template: string) {
    const editor = editorRef.current;
    if (!editor) { setText(prev => prev + template); return; }
    if (/<[^<>\s][^<>]*>/.test(template)) editor.insertSnippet(templateToSnippet(template));
    else editor.insertAtCursor(template);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = e.dataTransfer.getData('text/plain');
    if (dropped) insertAtCursor(dropped);
  }

  function handleFormat() {
    // `formatExpression` на незавершеному виразі ДОПИСУЄ токени (`ВЫБОР КОГДА` →
    // `… ТОГДА … КОНЕЦ`) — форматуємо лише структурно валідний текст.
    if (!analysis.syntaxValid || analysis.empty) return;
    try {
      const formatted = dedentContinuationLines(formatExpression(text.trim(), 'select'));
      if (formatted !== text) setText(formatted);
    } catch {
      // Форматер не повинен ламати редагування — лишаємо текст як є.
    }
    editorRef.current?.focus();
  }

  function focusSearchFor(target: EventTarget | null) {
    const node = target as Node | null;
    if (node && functionsPaneRef.current?.contains(node)) functionsSearchRef.current?.focus();
    else if (fieldsSearchRef.current) fieldsSearchRef.current.focus();
    else functionsSearchRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.defaultPrevented) return; // Esc/Ctrl+F уже обробив CodeMirror (підказка, сніпет, пошук) чи поле пошуку.
    if (e.key === 'Escape') {
      e.preventDefault();
      if (templatesOpen) setTemplatesOpen(false);
      else if (confirmingEsc) { setConfirmingEsc(false); editorRef.current?.focus(); }
      else if (text !== initialText) setConfirmingEsc(true);
      else onCancel();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') {
      if (editorSectionRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      focusSearchFor(e.target);
    }
  }

  const lineCount = text.split('\n').length;
  const errorCount = analysis.issues.filter(i => i.severity === 'error').length;
  const problemCount = analysis.issues.length;
  const templates = React.useMemo(() => TEMPLATE_LABELS.map(leafByLabel).filter(l => !!l), []);
  const formatDisabled = !analysis.syntaxValid || analysis.empty;

  const topInnerWidth = Math.max(0, panelWidth - 24);
  const fieldsWidth = Math.round(Math.max(220, Math.min(topInnerWidth * fieldsRatio, topInnerWidth - 300)));
  const fieldsPane = (
    <div ref={fieldsPaneRef} data-testid="expr-fields-pane" style={{ ...panelBox, flex: layout === 'narrow' ? 1 : undefined, width: layout === 'narrow' ? undefined : fieldsWidth, flexShrink: 0, minWidth: 0 }}>
      {layout !== 'narrow' && <div style={PANE_TITLE}>{t('common.fields')}</div>}
      <FieldsPanel ctx={ctx} onInsert={insertAtCursor} searchRef={fieldsSearchRef} />
    </div>
  );
  const functionsPane = (
    <div ref={functionsPaneRef} data-testid="expr-functions-pane" style={{ ...panelBox, flex: 1, minWidth: 0 }}>
      {layout !== 'narrow' && <div style={PANE_TITLE}>{t('exprEditor.functions')}</div>}
      <FunctionsPanel onInsertTemplate={insertTemplate} searchRef={functionsSearchRef} />
    </div>
  );

  return (
    <div style={OVERLAY} onClick={onCancel}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="expr-dialog"
        data-layout={layout}
        data-editor-maximized={editorMaximized ? 'true' : 'false'}
        onClick={e => { e.stopPropagation(); if (templatesOpen) setTemplatesOpen(false); }}
        onKeyDown={handleKeyDown}
        style={{
          background: 'var(--vscode-editorWidget-background, var(--vscode-editor-background, #1e1e1e))',
          border: '1px solid var(--qc-border)',
          borderRadius: 6,
          width: dialogMaximized ? '98vw' : '84vw',
          height: dialogMaximized ? '96vh' : '86vh',
          minWidth: 320, minHeight: 360,
          display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px 12px',
          boxSizing: 'border-box',
        }}
      >
        <style>{TREE_CSS}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontWeight: 'bold', fontSize: 14, flex: 1 }}>{title}</span>
          <IconButton
            icon={dialogMaximized ? 'screen-normal' : 'screen-full'}
            title={dialogMaximized ? t('exprEditor.restoreDialog') : t('exprEditor.maximizeDialog')}
            testId="expr-dialog-maximize"
            onClick={() => setDialogMaximized(v => !v)}
          />
          <IconButton icon="close" title={t('actions.close')} testId="expr-close" onClick={onCancel} />
        </div>

        {!editorMaximized && (
          <div data-testid="expr-top-area" style={{ display: 'flex', flexDirection: 'column', height: topHeight, flexShrink: 0, minHeight: 0 }}>
            {layout === 'narrow' ? (
              <>
                <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                  {(['fields', 'functions'] as const).map(tab => (
                    <ToolbarButton
                      key={tab}
                      icon={tab === 'fields' ? 'symbol-field' : 'symbol-method'}
                      label={tab === 'fields' ? t('common.fields') : t('exprEditor.functions')}
                      title={tab === 'fields' ? t('common.fields') : t('exprEditor.functions')}
                      active={narrowTab === tab}
                      testId={`expr-tab-${tab}`}
                      onClick={() => setNarrowTab(tab)}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>{narrowTab === 'fields' ? fieldsPane : functionsPane}</div>
              </>
            ) : (
              <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                {fieldsPane}
                <ResizeHandle onResize={d => setFieldsRatio(r => Math.max(0.2, Math.min(0.75, r + d / Math.max(1, topInnerWidth))))} />
                {functionsPane}
              </div>
            )}
          </div>
        )}
        {!editorMaximized && (
          <ResizeHandle axis="y" onResize={d => setTopHeight(h => Math.max(140, Math.min(h + d, window.innerHeight * 0.6)))} />
        )}

        <div ref={editorSectionRef} data-testid="expr-editor-section" style={{ ...panelBox, flex: 1, minHeight: 140, overflow: 'visible' }}>
          <div style={{ ...SECTION_HEADER, textTransform: 'none', letterSpacing: 0, fontSize: 12, display: 'flex', alignItems: 'center', gap: 2, padding: '3px 6px', flexWrap: 'wrap', borderTopLeftRadius: 6, borderTopRightRadius: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--vscode-foreground, #ccc)', padding: '0 8px 0 4px' }}>{t('common.expression')}</span>
            <ToolbarButton icon="redo" mirrorIcon title={t('dialog.queryText.undo')} testId="expr-undo" onClick={() => editorRef.current?.undo()} />
            <ToolbarButton icon="redo" title={t('dialog.queryText.redo')} testId="expr-redo" onClick={() => editorRef.current?.redo()} />
            <span style={TOOLBAR_SEPARATOR} />
            <ToolbarButton
              icon="list-flat"
              label={layout === 'narrow' ? undefined : t('actions.format')}
              title={formatDisabled && !analysis.empty ? t('exprEditor.formatUnavailable') : t('actions.format')}
              disabled={formatDisabled}
              testId="expr-format"
              onClick={handleFormat}
            />
            <ToolbarButton
              icon="word-wrap"
              label={layout === 'wide' ? t('exprEditor.wordWrap') : undefined}
              title={t('exprEditor.wordWrap')}
              active={wrap}
              testId="expr-wrap"
              onClick={() => setWrap(v => !v)}
            />
            <ToolbarButton icon="sparkle" title={t('exprEditor.suggest')} testId="expr-suggest" onClick={() => editorRef.current?.startCompletion()} />
            <div style={{ position: 'relative' }}>
              <ToolbarButton
                icon="symbol-snippet"
                label={layout === 'narrow' ? undefined : `${t('exprEditor.templates')} ▾`}
                title={t('exprEditor.templates')}
                active={templatesOpen}
                testId="expr-templates"
                onClick={() => setTemplatesOpen(v => !v)}
              />
              {templatesOpen && (
                <div
                  role="menu"
                  data-testid="expr-templates-menu"
                  onClick={e => e.stopPropagation()}
                  style={{
                    position: 'absolute', top: '100%', left: 0, zIndex: 10, marginTop: 2, minWidth: 220,
                    background: 'var(--vscode-menu-background, #252526)', color: 'var(--vscode-menu-foreground, #ccc)',
                    border: '1px solid var(--vscode-menu-border, var(--qc-border))', borderRadius: 4, padding: 4,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                  }}
                >
                  {templates.map(leaf => (
                    <button
                      key={leaf!.label}
                      role="menuitem"
                      className="qc-expr-row"
                      onClick={() => { setTemplatesOpen(false); insertTemplate(leaf!.template); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'inherit', padding: '4px 8px', fontSize: 12, cursor: 'pointer', borderRadius: 3 }}
                    >
                      {leaf!.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: 1 }} />
            <ToolbarButton
              icon={editorMaximized ? 'screen-normal' : 'screen-full'}
              title={editorMaximized ? t('exprEditor.restoreEditor') : t('exprEditor.maximizeEditor')}
              active={editorMaximized}
              testId="expr-maximize-editor"
              onClick={() => { setEditorMaximized(v => !v); editorRef.current?.focus(); }}
            />
          </div>
          <CodeEditor
            ref={editorRef}
            testId="expr-editor"
            value={text}
            onChange={v => { setText(v); setConfirmingEsc(false); }}
            spellCheck={false}
            richFeatures
            extensions={editorExtensions}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDrop={handleDrop}
            wrapperStyle={{
              flex: 1,
              minHeight: 0,
              // Той самий прийом/токен, що й у QueryTextDialog — фон поля відрізняється
              // від фону модалки, інакше поле зливається з рамкою.
              background: 'var(--qc-frame-bg, var(--vscode-editor-background, #1e1e1e))',
              borderBottomLeftRadius: 6, borderBottomRightRadius: 6,
            }}
            textStyle={{
              fontFamily: 'var(--vscode-editor-font-family, monospace)',
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: wrap ? 'pre-wrap' : 'pre',
              color: 'var(--vscode-editor-foreground, #ccc)',
              padding: 6,
            }}
          />
        </div>

        {confirmingEsc && (
          <div
            data-testid="expr-unsaved-confirm"
            role="alertdialog"
            style={{
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '6px 10px', borderRadius: 4,
              background: 'var(--vscode-inputValidation-warningBackground, rgba(204,167,0,0.15))',
              border: '1px solid var(--vscode-inputValidation-warningBorder, #cca700)',
            }}
          >
            <span className="codicon codicon-warning" style={{ color: 'var(--vscode-editorWarning-foreground, #cca700)' }} />
            <span style={{ flex: 1 }}>{t('exprEditor.unsavedBody')}</span>
            <button style={BTN_SECONDARY} onClick={onCancel}>{t('actions.closeWithoutSaving')}</button>
            <button style={BTN} autoFocus onClick={() => { setConfirmingEsc(false); editorRef.current?.focus(); }}>{t('actions.continueEditing')}</button>
          </div>
        )}

        <div data-testid="expr-status" style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, flexWrap: 'wrap' }}>
          {analysis.empty ? (
            <span data-testid="expr-status-state" style={{ color: 'var(--vscode-descriptionForeground, #888)' }}>{t('exprEditor.empty')}</span>
          ) : problemCount === 0 ? (
            <span data-testid="expr-status-state" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--vscode-testing-iconPassed, #73c991)' }}>
              <span className="codicon codicon-pass-filled" />{t('exprEditor.valid')}
            </span>
          ) : (
            <span
              data-testid="expr-status-state"
              title={analysis.issues.map(i => i.kind === 'fieldNotFound' ? t('diagnostic.fieldNotFound', { field: i.field ?? '', table: i.table ?? '' }) : i.kind === 'syntax' ? t('exprEditor.syntaxError') : localizeDiagnostic(i.message ?? '')).join('\n')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, color: errorCount > 0 ? 'var(--vscode-errorForeground, #f44747)' : 'var(--vscode-editorWarning-foreground, #cca700)' }}
            >
              <span className={`codicon codicon-${errorCount > 0 ? 'error' : 'warning'}`} />
              {errorCount > 0 && problemCount === 1 ? t('exprEditor.syntaxError') : t('exprEditor.problems', { count: problemCount })}
            </span>
          )}
          {!analysis.empty && (
            <span data-testid="expr-result-type" style={{ color: 'var(--vscode-descriptionForeground, #888)' }}>
              {t('exprEditor.resultType')}{' '}
              <span style={{ color: 'var(--vscode-foreground, #ccc)' }}>{analysis.resultType ?? t('exprEditor.typeUnknown')}</span>
            </span>
          )}
          <div style={{ flex: 1 }} />
          <span data-testid="expr-counts" style={{ color: 'var(--vscode-descriptionForeground, #888)', display: 'flex', gap: 12 }}>
            <span>{t('exprEditor.lines', { count: lineCount })}</span>
            <span>{t('exprEditor.chars', { count: text.length })}</span>
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button data-testid="expr-cancel" style={BTN_SECONDARY} onClick={onCancel}>{t('actions.cancel')}</button>
            <button data-testid="expr-ok" style={BTN} onClick={() => onOk(text)}>{t('actions.ok')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
