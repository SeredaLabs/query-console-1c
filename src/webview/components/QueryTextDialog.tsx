import * as React from 'react';
import { CodeEditor, type CodeEditorHandle } from './CodeEditor';
import { IconButton } from './IconButton';
import { BTN, BTN_SECONDARY } from '../sharedStyles';
import { analyze, type QueryAnalysisResult, type QueryDiagnostic } from '../../core/query/queryAnalysisService';
import type { MetadataResolver } from '../../core/query/metadataResolver';
import type { Diagnostic } from '@codemirror/lint';

export interface QueryTextDialogProps {
  text: string;
  error: string | null;
  /** Тот же резолвер, что использует `Применить` (ConstructorView) — обязательное
   * условие design-дока (риск п.0.2/0.14): анализ в редакторе не должен расходиться
   * с тем, что реально проверит Apply. */
  resolver?: MetadataResolver;
  onChange: (text: string) => void;
  onApply: () => void;
  onClose: () => void;
}

const TOOLBAR_BTN: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  padding: '4px 8px',
  fontSize: 12,
  borderRadius: 3,
};

const TOOLBAR_BTN_DISABLED: React.CSSProperties = {
  ...TOOLBAR_BTN,
  color: 'var(--vscode-disabledForeground, #6b6b6b)',
  cursor: 'default',
};

const SEPARATOR: React.CSSProperties = { width: 1, alignSelf: 'stretch', background: 'var(--qc-border)', margin: '4px 4px' };

const DEBOUNCE_MS = 400;

/**
 * Разбор запроса быстрый даже на больших запросах (design-док, раздел 0.6: ~6-16мс на
 * крупнейшем известном запросе корпуса), но `analyze()` — код, который может измениться
 * позже (стадии 6-7 добавят в него больше маппинга модели) — оборачиваем в try/catch
 * (design-док раздел 17), чтобы падение анализа никогда не блокировало редактирование.
 */
function runAnalysisSafe(text: string, resolver?: MetadataResolver): QueryAnalysisResult {
  try {
    return analyze(text, resolver);
  } catch {
    return {
      diagnostics: [{ message: 'Не удалось полностью разобрать структуру запроса. Редактирование текста доступно.' }],
      fields: [], sources: [], joins: [], conditions: [], parameters: [],
    };
  }
}

/** Символьное смещение начала строки `line` (1-based) + `col` (1-based) в `text`. */
function lineColToOffset(text: string, line: number, col: number): number {
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) offset += lines[i].length + 1;
  return Math.min(text.length, offset + Math.max(0, col - 1));
}

function toCmDiagnostics(text: string, diagnostics: QueryDiagnostic[]): Diagnostic[] {
  return diagnostics.map(d => {
    const from = d.line != null && d.col != null ? lineColToOffset(text, d.line, d.col) : 0;
    return { from, to: Math.min(text.length, from + 1), severity: 'error', message: d.message };
  });
}

/**
 * Раскладка v2 окна «Текст запроса» (см.
 * docs/superpowers/specs/2026-09-02-query-text-dialog-v2-design.md):
 * тулбар / редактор + сворачиваемая панель «Структура» / статусная строка.
 *
 * Стадия 4: кнопка «Проверить» и фоновая проверка с дебаунсом ведут на ОДИН и тот же
 * `QueryAnalysisService.analyze()` (design-док риск п.0.5) — кнопка просто форсирует
 * немедленный вызов вместо ожидания дебаунса. `checked` хранит текст И результат ВМЕСТЕ —
 * `dirty` это просто `checked.text !== text`, без отдельного флага и race-condition
 * между «что показывает статус» и «для какого текста».
 *
 * Форматирование/Параметры/Структура — по-прежнему заглушки (стадии 5-7).
 * `onApply`/`onClose` — ТЕ ЖЕ обработчики, что использовала старая модалка.
 */
export function QueryTextDialog({ text, error, resolver, onChange, onApply, onClose }: QueryTextDialogProps): React.ReactElement {
  const [structureOpen, setStructureOpen] = React.useState(false);
  const editorRef = React.useRef<CodeEditorHandle>(null);
  const [checked, setChecked] = React.useState(() => ({ text, result: runAnalysisSafe(text, resolver) }));
  const dirty = checked.text !== text;
  const isMountRef = React.useRef(true);

  React.useEffect(() => {
    if (isMountRef.current) { isMountRef.current = false; return; }
    const timer = setTimeout(() => {
      setChecked({ text, result: runAnalysisSafe(text, resolver) });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // resolver стабилен на время жизни диалога (мемоизирован в ConstructorView по
    // составу таблиц) — реагировать на смену текста, а не на идентичность resolver.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  React.useEffect(() => {
    editorRef.current?.setDiagnostics(toCmDiagnostics(checked.text, checked.result.diagnostics));
  }, [checked]);

  function runCheckNow() {
    setChecked({ text, result: runAnalysisSafe(text, resolver) });
  }

  function handleJumpToError() {
    const d = checked.result.diagnostics[0];
    if (!d || d.line == null || d.col == null) return;
    editorRef.current?.moveCursorTo(lineColToOffset(checked.text, d.line, d.col));
  }

  const lineCount = text.split('\n').length;
  const firstDiagnostic = checked.result.diagnostics[0];

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--vscode-editor-background, #1e1e1e)',
          border: '1px solid var(--qc-border)',
          borderRadius: 4,
          minWidth: 400,
          width: '80vw',
          maxWidth: '80vw',
          height: '80vh',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 12px', borderBottom: '1px solid var(--qc-border)',
          }}
        >
          <span style={{ fontWeight: 'bold', fontSize: 13 }}>Текст запроса</span>
          <IconButton icon="close" title="Закрыть" onClick={onClose} />
        </div>

        <div
          style={{
            display: 'flex', alignItems: 'center',
            padding: '4px 8px', borderBottom: '1px solid var(--qc-border)', fontSize: 12,
          }}
        >
          <button
            style={{ ...TOOLBAR_BTN, cursor: 'pointer' }}
            title="Отменить (Ctrl/Cmd+Z)"
            onClick={() => editorRef.current?.undo()}
          >
            ↶
          </button>
          <button
            style={{ ...TOOLBAR_BTN, cursor: 'pointer' }}
            title="Повторить (Ctrl/Cmd+Shift+Z)"
            onClick={() => editorRef.current?.redo()}
          >
            ↷
          </button>
          <span style={SEPARATOR} />
          <button disabled style={TOOLBAR_BTN_DISABLED} title="Форматировать — появится на следующей стадии">Форматировать</button>
          <button style={{ ...TOOLBAR_BTN, cursor: 'pointer' }} title="Проверить сейчас" onClick={runCheckNow}>✓ Проверить</button>
          <button disabled style={TOOLBAR_BTN_DISABLED} title="Параметры — появятся на следующей стадии">Параметры</button>
          <button
            style={{ ...TOOLBAR_BTN, cursor: 'pointer', fontWeight: structureOpen ? 'bold' : 'normal' }}
            onClick={() => setStructureOpen(v => !v)}
          >
            Структура
          </button>
          {/* Ctrl/Cmd+F/H уже работают в самом редакторе (richFeatures → @codemirror/search) —
              кнопка просто открывает ту же панель по клику, без своей логики поиска. */}
          <button style={{ ...TOOLBAR_BTN, cursor: 'pointer' }} title="Поиск (Ctrl/Cmd+F)" onClick={() => editorRef.current?.openSearch()}>🔍</button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <CodeEditor
            ref={editorRef}
            testId="query-text-editor"
            value={text}
            onChange={onChange}
            spellCheck={false}
            richFeatures
            wrapperStyle={{
              flex: 1,
              minHeight: 0,
              // Отличается от фона самой модалки — иначе поле текста запроса визуально
              // сливается с рамкой вокруг него (тот же приём, что был у старой разметки).
              background: 'var(--qc-frame-bg, var(--vscode-editor-background, #1e1e1e))',
            }}
            textStyle={{
              fontFamily: 'var(--vscode-editor-font-family, monospace)',
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: 'pre',
              color: 'var(--vscode-editor-foreground, #ccc)',
              padding: 8,
            }}
          />
          {structureOpen && (
            <div
              style={{
                width: 220, flexShrink: 0, borderLeft: '1px solid var(--qc-border)',
                padding: 8, fontSize: 12, overflow: 'auto',
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Структура запроса</div>
              <div style={{ color: 'var(--vscode-descriptionForeground)' }}>
                Появится на следующей стадии.
              </div>
            </div>
          )}
        </div>

        <div
          data-testid="query-text-status"
          style={{
            padding: '4px 12px', borderTop: '1px solid var(--qc-border)',
            fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {dirty ? (
            <span style={{ color: 'var(--vscode-descriptionForeground)' }}>● Есть непроверенные изменения</span>
          ) : firstDiagnostic ? (
            <span
              role="button"
              onClick={handleJumpToError}
              style={{
                color: 'var(--vscode-errorForeground, #f44747)',
                cursor: firstDiagnostic.line != null ? 'pointer' : 'default',
                textDecoration: firstDiagnostic.line != null ? 'underline' : 'none',
              }}
            >
              {firstDiagnostic.message}
            </span>
          ) : (
            <span style={{ color: 'var(--vscode-descriptionForeground)' }}>
              ✓ Синтаксис корректен &nbsp;&nbsp; Строк: {lineCount} &nbsp;&nbsp; Параметров: {checked.result.parameters.length}
              &nbsp;&nbsp; Источников: {checked.result.sources.length} &nbsp;&nbsp; Соединений: {checked.result.joins.length}
            </span>
          )}
        </div>

        {error != null && (
          <div style={{ color: 'var(--vscode-errorForeground, #f44747)', fontSize: 12, whiteSpace: 'pre-wrap', padding: '4px 12px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 12, borderTop: '1px solid var(--qc-border)' }}>
          <button style={BTN_SECONDARY} onClick={onClose}>Отмена</button>
          <button style={BTN} onClick={onApply}>Применить</button>
        </div>
      </div>
    </div>
  );
}
