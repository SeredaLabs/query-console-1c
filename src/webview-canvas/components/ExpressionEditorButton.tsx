import * as React from 'react';
import { createPortal } from 'react-dom';
import type { MetaTable } from '../../core/metadata/types';
import { buildResolverFromTables } from '../../core/metadata/buildModelResolver';
import type { SelectedTable } from '../../core/query/queryModel';
import type { SupportedLocale } from '../../shared/locale';
import { ExpressionBuilder } from '../../webview/components/ExpressionBuilder';
import { expressionSources } from '../../webview/expressionSources';
import { t } from '../i18n';
import { TOKENS } from '../theme';

export function ExpressionEditorButton({ locale, selectedTables, tables, value, onApply }: {
  locale: SupportedLocale;
  selectedTables: SelectedTable[];
  tables: MetaTable[];
  value: string;
  onApply: (text: string) => void;
}): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const resolver = React.useMemo(() => tables.length ? buildResolverFromTables(tables) : undefined, [tables]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <>
    <button ref={trigger} type="button" onClick={() => setOpen(true)}
      style={{ border: `1px solid ${TOKENS.border}`, background: 'transparent', color: TOKENS.textSecondary,
        cursor: 'pointer', fontSize: 11, padding: '3px 8px', borderRadius: 4 }}>
      {t(locale, 'expressionEditorOpen')}
    </button>
    {open && createPortal(<ExpressionBuilder sources={expressionSources(selectedTables, tables)}
      resolver={resolver} initialText={value} onCancel={close}
      onOk={text => { onApply(text); close(); }} />, document.body)}
  </>;
}
