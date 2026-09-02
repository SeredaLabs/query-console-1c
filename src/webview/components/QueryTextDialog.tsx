import * as React from 'react';
import { CodeEditor } from './CodeEditor';
import { IconButton } from './IconButton';
import { BTN, BTN_SECONDARY } from '../sharedStyles';

export interface QueryTextDialogProps {
  text: string;
  error: string | null;
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

/**
 * Раскладка v2 окна «Текст запроса» (стадия 1 плана редизайна, см.
 * docs/superpowers/specs/2026-09-02-query-text-dialog-v2-design.md, раздел 2):
 * тулбар / редактор + сворачиваемая панель «Структура» / статусная строка.
 *
 * На этой стадии кнопки тулбара (кроме «Структура», которая лишь переключает
 * видимость пустой пока панели) и статусная строка — заглушки без логики.
 * `onApply`/`onClose` — ТЕ ЖЕ обработчики, что использовала старая модалка
 * (`ConstructorView.handleApplyQueryEdit` и закрытие без сохранения) — при
 * выключенном флаге `queryConsole.queryTextEditorV2` рендерится старая разметка,
 * так что поведение (что происходит по Apply/Close) не меняется, меняется
 * только то, как оно выглядит.
 */
export function QueryTextDialog({ text, error, onChange, onApply, onClose }: QueryTextDialogProps): React.ReactElement {
  const [structureOpen, setStructureOpen] = React.useState(false);

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
          <button disabled style={TOOLBAR_BTN_DISABLED} title="Отменить — появится на следующей стадии">↶</button>
          <button disabled style={TOOLBAR_BTN_DISABLED} title="Повторить — появится на следующей стадии">↷</button>
          <span style={SEPARATOR} />
          <button disabled style={TOOLBAR_BTN_DISABLED} title="Форматировать — появится на следующей стадии">Форматировать</button>
          <button disabled style={TOOLBAR_BTN_DISABLED} title="Проверить — появится на следующей стадии">✓ Проверить</button>
          <button disabled style={TOOLBAR_BTN_DISABLED} title="Параметры — появятся на следующей стадии">Параметры</button>
          <button
            style={{ ...TOOLBAR_BTN, cursor: 'pointer', fontWeight: structureOpen ? 'bold' : 'normal' }}
            onClick={() => setStructureOpen(v => !v)}
          >
            Структура
          </button>
          <button disabled style={TOOLBAR_BTN_DISABLED} title="Поиск — появится на следующей стадии">🔍</button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <CodeEditor
            testId="query-text-editor"
            value={text}
            onChange={onChange}
            spellCheck={false}
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
          style={{
            padding: '4px 12px', borderTop: '1px solid var(--qc-border)',
            fontSize: 12, color: 'var(--vscode-descriptionForeground)',
          }}
        >
          Проверка появится на следующей стадии
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
