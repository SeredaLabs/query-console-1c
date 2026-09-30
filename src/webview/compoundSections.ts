import { assembleMembers, type QueryAction, type QueryState } from './state/queryStore';

/** The parser/generator store UNION tail sections on the last member while
 * resolving their column references against the first member. */
export function compoundSections(state: QueryState) {
  const members = assembleMembers(state);
  return { first: members[0].model, last: members[members.length - 1].model };
}

/** UI action composition over the existing reducer; no second query state.
 * Return to the original member after editing the shared tail slot. */
export function dispatchCompoundSection(state: QueryState, dispatch: (action: QueryAction) => void, action: QueryAction): void {
  const target = state.queryList.length - 1;
  if (target !== state.activeQuery) dispatch({ type: 'SET_ACTIVE_QUERY', index: target });
  dispatch(action);
  if (target !== state.activeQuery) {
    dispatch({ type: 'SET_ACTIVE_QUERY', index: state.activeQuery });
    // Switching members clears Classic's field/source focus; the tail edit did
    // not change those selections in the original member.
    if (state.focusedSelectedTableId !== null) dispatch({ type: 'FOCUS_SELECTED_TABLE', id: state.focusedSelectedTableId });
    if (state.focusedSelectedFieldIdx !== null) dispatch({ type: 'FOCUS_SELECTED_FIELD', idx: state.focusedSelectedFieldIdx });
  }
}
