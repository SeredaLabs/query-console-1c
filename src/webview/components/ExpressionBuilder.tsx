import * as React from 'react';
import { FUNCTION_CATALOG, type FunctionGroup, type FunctionLeaf } from '../../core/query/functionCatalog';
import { ResizeHandle } from './ResizeHandle';
import { Chevron } from './Chevron';
import { CodeEditor, type CodeEditorHandle } from './CodeEditor';
import { BTN, BTN_SECONDARY } from '../sharedStyles';

interface Props {
  title?: string;
  availableFields: string[];
  initialText?: string;
  onOk: (text: string) => void;
  onCancel: () => void;
}

function isLeaf(n: FunctionGroup | FunctionLeaf): n is FunctionLeaf {
  return 'template' in n;
}

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
};

const PANEL: React.CSSProperties = {
  background: 'var(--vscode-editor-background, #1e1e1e)',
  border: '1px solid var(--qc-border)',
  borderRadius: 6, padding: 12, width: '70vw', height: '70vh',
  display: 'flex', flexDirection: 'column', gap: 8,
};

function FunctionTree({ node, depth, onPick }: { node: FunctionGroup | FunctionLeaf; depth: number; onPick: (template: string) => void }): React.ReactElement {
  const [open, setOpen] = React.useState(depth === 0);
  if (isLeaf(node)) {
    return (
      <div
        draggable
        className="qc-row"
        onDragStart={e => { e.dataTransfer.setData('text/plain', node.template); e.dataTransfer.effectAllowed = 'copy'; }}
        onDoubleClick={() => onPick(node.template)}
        style={{ paddingLeft: 8 + depth * 14 + 14, paddingTop: 1, fontSize: 12, cursor: 'default', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <span className="codicon codicon-symbol-method" style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
        {node.label}
      </div>
    );
  }
  return (
    <div>
      <div
        onClick={() => setOpen(o => !o)}
        className="qc-row"
        style={{ paddingLeft: 8 + depth * 14, fontSize: 12, cursor: 'default', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <Chevron expanded={open} />
        <span className={`codicon codicon-folder${open ? '-opened' : ''}`} style={{ fontSize: 13, opacity: 0.75, flexShrink: 0 }} />
        <span>{node.label}</span>
      </div>
      {open && node.children.map((c, i) => (
        <FunctionTree key={`${c.label}:${i}`} node={c} depth={depth + 1} onPick={onPick} />
      ))}
    </div>
  );
}

export function ExpressionBuilder({ title = 'Произвольное выражение', availableFields, initialText = '', onOk, onCancel }: Props): React.ReactElement {
  const [text, setText] = React.useState(initialText);
  const editorRef = React.useRef<CodeEditorHandle>(null);
  // 8.3.7: перетаскиваемые границы — ширина списка «Поле» и высота поля ввода.
  const [fieldsWidth, setFieldsWidth] = React.useState(280);
  const [editorHeight, setEditorHeight] = React.useState(140);

  function insertAtCursor(snippet: string) {
    const editor = editorRef.current;
    if (!editor) { setText(prev => prev + snippet); return; }
    editor.insertAtCursor(snippet);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const snippet = e.dataTransfer.getData('text/plain');
    if (snippet) insertAtCursor(snippet);
  }

  return (
    <div style={OVERLAY} onClick={onCancel}>
      <div style={PANEL} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 'bold', fontSize: 13 }}>{title}</div>
        <div style={{ display: 'flex', flex: 1, gap: 0, minHeight: 0 }}>
          <div style={{ width: fieldsWidth, flexShrink: 0, overflow: 'auto', border: '1px solid var(--qc-border)' }}>
            <div style={{ fontSize: 11, padding: '2px 6px', opacity: 0.7 }}>Поле</div>
            {availableFields.map(f => (
              <div
                key={f}
                draggable
                onDragStart={e => { e.dataTransfer.setData('text/plain', f); e.dataTransfer.effectAllowed = 'copy'; }}
                onDoubleClick={() => insertAtCursor(f)}
                style={{ padding: '1px 8px', fontSize: 12, cursor: 'default', userSelect: 'none' }}
              >
                {f}
              </div>
            ))}
          </div>
          <ResizeHandle onResize={d => setFieldsWidth(w => Math.max(120, w + d))} />
          <div style={{ flex: 1, minWidth: 0, overflow: 'auto', border: '1px solid var(--qc-border)' }}>
            <FunctionTree node={FUNCTION_CATALOG} depth={0} onPick={insertAtCursor} />
          </div>
        </div>
        <ResizeHandle axis="y" onResize={d => setEditorHeight(h => Math.max(60, h - d))} />
        <CodeEditor
          ref={editorRef}
          testId="expr-editor"
          value={text}
          onChange={setText}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onDrop={handleDrop}
          wrapperStyle={{
            height: editorHeight,
            background: 'var(--vscode-input-background, #3c3c3c)',
            border: '1px solid var(--qc-border)',
          }}
          textStyle={{
            fontFamily: 'var(--vscode-editor-font-family, monospace)',
            fontSize: 13,
            whiteSpace: 'pre-wrap',
            color: 'var(--vscode-input-foreground, #ccc)',
          }}
        />
        <div style={{ display: 'flex', gap: 4, alignSelf: 'flex-end' }}>
          <button data-testid="expr-ok" style={BTN} onClick={() => onOk(text)}>ОК</button>
          <button data-testid="expr-cancel" style={BTN_SECONDARY} onClick={onCancel}>Отмена</button>
        </div>
      </div>
    </div>
  );
}
