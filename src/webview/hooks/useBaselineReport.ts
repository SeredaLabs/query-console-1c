import * as React from 'react';
import { postToHost } from '../bridge';
import type { BatchTextResult } from '../computeBatchText';

/**
 * C32 Safe Apply: once per host load, report to the host the text Apply would write
 * right after that query was opened — `batch` is the same value OK / Save sends,
 * computed from the state `LOAD_BATCH` produced (`loadedId` is set in that update).
 * The host keeps the first report for the source query and closes an Apply with
 * an equal text without writing. A generation error reports nothing: no baseline,
 * so Apply keeps its current path.
 */
export function useBaselineReport(loadedId: number | undefined, batch: BatchTextResult): void {
  const reportedRef = React.useRef<number | undefined>(undefined);
  React.useEffect(() => {
    if (loadedId === undefined || reportedRef.current === loadedId) return;
    reportedRef.current = loadedId;
    if (batch.error === null) postToHost({ type: 'baseline', loadId: loadedId, text: batch.text });
  }, [loadedId, batch]);
}
