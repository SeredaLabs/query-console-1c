import * as React from 'react';
import type { TableKind, VirtualTableInfo } from '../../core/metadata/types';
import { defaultTableAlias } from '../../core/query/queryModel';
import { deriveUnionColumns } from '../../core/query/unionModel';
import type { SupportedLocale } from '../../shared/locale';
import { ExpressionBuilder } from '../../webview/components/ExpressionBuilder';
import { removedSourceFieldPaths } from '../../webview/sourceQueryDraft';
import { TempTableDialog } from '../../webview/components/TempTableDialog';
import { supportsVirtualParamsForm, VirtualTableParamsDialog } from '../../webview/components/VirtualTableParamsDialog';
import { allTables, isPackageTempTableName, tempTableDialogInitial, type QueryAction, type QueryState } from '../../webview/state/queryStore';
import { SourceQueryEditor } from '../components/SourceQueryEditor';
import { t } from '../i18n';

export type SourceEditor = { kind: 'query' | 'temp' | 'virtual'; tableId?: string };

export function SourceDialogs({ locale, editor, state, dispatch, onClose }: {
  locale: SupportedLocale;
  editor: SourceEditor;
  state: QueryState;
  dispatch: React.Dispatch<QueryAction>;
  onClose: () => void;
}): React.ReactElement | null {
  const [expression, setExpression] = React.useState<{ initial: string; apply: (text: string) => void }>();
  const table = state.selectedTables.find(t => t.id === editor.tableId);
  const meta = allTables(state).find(m => m.fullName === table?.fullName);
  if (editor.tableId && !table) return null;
  if (editor.kind === 'query') return (
    <SourceQueryEditor locale={locale} initialDoc={table?.subquery}
      label={table ? defaultTableAlias(table) : t(locale, 'sourceAddQuery')} onCancel={onClose}
      onBack={doc => {
        const columns = deriveUnionColumns(doc.members).map(c => c.alias);
        if (table && removedSourceFieldPaths(state, table.id, columns).length > 0) return t(locale, 'sourceReferencedColumns');
        dispatch(table
          ? { type: 'UPDATE_SUBQUERY_TABLE', tableId: table.id, subquery: doc, columns }
          : { type: 'ADD_SUBQUERY_TABLE', name: 'ВложенныйЗапрос', subquery: doc, columns });
        onClose();
      }} />
  );
  if (editor.kind === 'temp') {
    if (table && isPackageTempTableName(state, table.fullName)) return null;
    return <TempTableDialog initial={table ? tempTableDialogInitial(state, table.id) : undefined}
      onCancel={onClose} onOk={(name, fields) => {
        if (table && removedSourceFieldPaths(state, table.id, fields.map(f => f.name.trim())).length > 0) return t(locale, 'sourceReferencedColumns');
        dispatch(table ? { type: 'UPDATE_TEMP_TABLE', tableId: table.id, name, fields } : { type: 'ADD_TEMP_TABLE', name, fields });
        onClose();
      }} />;
  }
  if (!table?.virtual || !supportsVirtualParamsForm(meta?.kind ?? table.fullName.split('.')[0], meta?.virtual?.slice ?? table.fullName.split('.').slice(-1)[0])) return null;
  return <>
    <VirtualTableParamsDialog
      slice={meta?.virtual?.slice ?? table.fullName.split('.').at(-1) as VirtualTableInfo['slice']}
      kind={meta?.kind ?? table.fullName.split('.')[0] as TableKind}
      correspondence={meta?.virtual?.correspondence ?? table.virtual.correspondence}
      initial={table.virtual} onCancel={onClose}
      onOpenConditionBuilder={(initial, apply) => setExpression({ initial, apply })}
      onOk={params => { dispatch({ type: 'SET_VIRTUAL_PARAMS', tableId: table.id, params }); onClose(); }} />
    {expression && <ExpressionBuilder sources={meta ? [{ alias: defaultTableAlias(table), meta }] : []}
      qualified={false} initialText={expression.initial} onCancel={() => setExpression(undefined)}
      onOk={text => { expression.apply(text); setExpression(undefined); }} />}
  </>;
}
