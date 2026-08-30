import * as React from 'react';
import { highlightSegments, type HighlightTokenType } from '../queryHighlight';

const TOKEN_STYLE: Partial<Record<HighlightTokenType, React.CSSProperties>> = {
  keyword: { color: 'var(--vscode-symbolIcon-keywordForeground, #c586c0)', fontWeight: 600 },
  function: { color: 'var(--vscode-symbolIcon-functionForeground, #dcdcaa)' },
  string: { color: 'var(--vscode-symbolIcon-stringForeground, #ce9178)' },
  date: { color: 'var(--vscode-symbolIcon-stringForeground, #ce9178)' },
  number: { color: 'var(--vscode-symbolIcon-numberForeground, #b5cea8)' },
  param: { color: 'var(--vscode-symbolIcon-variableForeground, #9cdcfe)' },
  comment: { color: 'var(--vscode-descriptionForeground, #6a9955)', fontStyle: 'italic' },
};

interface Props {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLTextAreaElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLTextAreaElement>) => void;
  spellCheck?: boolean;
  testId?: string;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
  /** Стили контейнера — размер, рамка, фон («коробка» поля ввода). */
  wrapperStyle: React.CSSProperties;
  /** Стили текста — шрифт/перенос/отступы/цвет обычного текста; должны совпадать
   * между слоем подсветки и textarea, иначе они разъедутся при наборе. */
  textStyle: React.CSSProperties;
}

/**
 * Textarea с подсветкой синтаксиса языка запросов — классический приём
 * «прозрачная textarea поверх подсвеченного <pre>» без тяжёлого редактора
 * (CodeMirror/Monaco) в бандле. Слои должны быть пиксель-в-пиксель — поэтому
 * шрифт/отступы/перенос заданы один раз в `textStyle` и разделяются между ними.
 */
export function HighlightedTextarea({
  value, onChange, onKeyDown, onDragOver, onDrop, spellCheck, testId, textareaRef,
  wrapperStyle, textStyle,
}: Props): React.ReactElement {
  const preRef = React.useRef<HTMLPreElement>(null);
  const segments = React.useMemo(() => highlightSegments(value), [value]);

  function handleScroll(e: React.UIEvent<HTMLTextAreaElement>) {
    if (preRef.current) {
      preRef.current.scrollTop = e.currentTarget.scrollTop;
      preRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }

  const sharedTextStyle: React.CSSProperties = {
    margin: 0,
    border: 'none',
    wordBreak: 'break-word',
    ...textStyle,
  };

  return (
    <div style={{ position: 'relative', ...wrapperStyle }}>
      <pre
        ref={preRef}
        aria-hidden="true"
        style={{
          ...sharedTextStyle,
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {segments.map((seg, i) => (
          seg.type === 'plain'
            ? seg.text
            : <span key={i} style={TOKEN_STYLE[seg.type]}>{seg.text}</span>
        ))}
        {/* Пустая строка в конце — иначе высота <pre> не учитывает финальный перевод строки. */}
        {'\n'}
      </pre>
      <textarea
        ref={textareaRef}
        data-testid={testId}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onScroll={handleScroll}
        spellCheck={spellCheck}
        style={{
          ...sharedTextStyle,
          position: 'absolute',
          inset: 0,
          resize: 'none',
          background: 'transparent',
          color: 'transparent',
          caretColor: (textStyle.color as string) ?? 'var(--vscode-input-foreground, #ccc)',
          overflow: 'auto',
        }}
      />
    </div>
  );
}
