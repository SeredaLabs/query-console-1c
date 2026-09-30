import * as React from 'react';
import { compoundSections, dispatchCompoundSection } from '../../webview/compoundSections';
import { IndexTab } from '../../webview/components/IndexTab';
import { type QueryAction, type QueryState } from '../../webview/state/queryStore';

export function IndexEditor({ state, dispatch: rootDispatch }: { state: QueryState; dispatch: React.Dispatch<QueryAction> }): React.ReactElement {
  const { first, last } = compoundSections(state);
  const dispatch = (action: QueryAction) => dispatchCompoundSection(state, rootDispatch, action);
  return (
    <IndexTab
      selectedFields={first.fields}
      indexing={last.indexing ?? { indexes: [] }}
      onAddIndex={() => dispatch({ type: 'ADD_INDEX' })}
      onCopyIndex={index => dispatch({ type: 'COPY_INDEX', index })}
      onRemoveIndex={index => dispatch({ type: 'REMOVE_INDEX', index })}
      onMoveIndex={(index, dir) => dispatch({ type: 'MOVE_INDEX', index, dir })}
      onSetUnique={(index, unique) => dispatch({ type: 'SET_INDEX_UNIQUE', index, unique })}
      onAddField={(index, tableId, path) => dispatch({ type: 'ADD_INDEX_FIELD', index, tableId, path })}
      onAddAllFields={(index, fields) => dispatch({ type: 'ADD_ALL_INDEX_FIELDS', index, fields })}
      onRemoveField={(index, tableId, path) => dispatch({ type: 'REMOVE_INDEX_FIELD', index, tableId, path })}
      onClearFields={index => dispatch({ type: 'CLEAR_INDEX_FIELDS', index })}
      onMoveField={(index, tableId, path, dir) => dispatch({ type: 'MOVE_INDEX_FIELD', index, tableId, path, dir })}
    />
  );
}
