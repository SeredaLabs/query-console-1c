import * as React from 'react';
import { compoundSections, dispatchCompoundSection } from '../../webview/compoundSections';
import { TotalsTab } from '../../webview/components/TotalsTab';
import { allTables, type QueryAction, type QueryState } from '../../webview/state/queryStore';

export function TotalsEditor({ state, dispatch: rootDispatch }: { state: QueryState; dispatch: React.Dispatch<QueryAction> }): React.ReactElement {
  const { first, last } = compoundSections(state);
  const dispatch = (action: QueryAction) => dispatchCompoundSection(state, rootDispatch, action);
  return (
    <TotalsTab
      selectedTables={first.tables}
      selectedFields={first.fields}
      metaTables={allTables(state)}
      totals={last.totals ?? { groupFields: [], totalFields: [], grand: false }}
      onAddGroupField={(tableId, path) => dispatch({ type: 'ADD_TOTAL_GROUP_FIELD', tableId, path })}
      onRemoveGroupField={(tableId, path) => dispatch({ type: 'REMOVE_TOTAL_GROUP_FIELD', tableId, path })}
      onSetGroupKind={(tableId, path, kind) => dispatch({ type: 'SET_TOTAL_GROUP_KIND', tableId, path, kind })}
      onSetGroupAlias={(tableId, path, alias) => dispatch({ type: 'SET_TOTAL_GROUP_ALIAS', tableId, path, alias })}
      onAddTotalField={(tableId, path) => dispatch({ type: 'ADD_TOTAL_FIELD', tableId, path })}
      onRemoveTotalField={index => dispatch({ type: 'REMOVE_TOTAL_FIELD', index })}
      onSetTotalFieldFunc={(index, func) => dispatch({ type: 'SET_TOTAL_FIELD_FUNC', index, func })}
      onSetGrand={grand => dispatch({ type: 'SET_TOTAL_GRAND', grand })}
    />
  );
}
