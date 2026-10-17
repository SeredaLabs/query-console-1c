import * as React from 'react';
import type { HostMsg } from '../../shared/messages';
import type { BatchDocument } from '../../core/query/batchModel';
import type { MetaTable } from '../../core/metadata/types';
import type { MetadataResolver } from '../../core/query/metadataResolver';
import { buildResolverFromTables } from '../../core/metadata/buildModelResolver';
import { tryOpenDesignerBatch } from '../openDesignerBatch';
import { onHostMessage, postToHost } from '../bridge';
import type { QueryAction } from '../state/queryStore';

export interface DesignerSession {
  /** 7.8.2: true until metadata — and the initial query, if the host announced
   * one — has arrived, so the designer never flashes an empty, editable state
   * that `LOAD_BATCH` would later overwrite. */
  loading: boolean;
  /** Metadata tree received (possibly empty — a real empty state, not "not yet"). */
  metadataLoaded: boolean;
  /** The query under the cursor failed to open (syntax or semantics); the
   * designer must block editing and offer only Close, never an empty canvas
   * whose Apply would overwrite the original text. */
  loadError: string | null;
  /** Initial query is validated but awaits explicit consent to comment loss. */
  commentLossPending: boolean;
  lostComments: string[];
  confirmCommentLoss: () => void;
  /** Resolver over the received metadata, or `undefined` (fail-open) when none. */
  buildResolver: () => MetadataResolver | undefined;
  /** C32: the host `loadId` of the query now in the state, set in the same update
   * as its `LOAD_BATCH` (after a confirmed comment loss too); `undefined` until then
   * or when the host sent no id. */
  loadedId: number | undefined;
  /** U1: the query as opened from the document, for the template-marker check at
   * Apply (`decideApply`); `undefined` for a new query. */
  sourceText: () => string | undefined;
}

/**
 * Host session shared by Classic (`webview/App.tsx`) and Canvas
 * (`webview-canvas/App.tsx`): sends `ready`, applies `metadataTree`, opens the
 * initial query (`loadModel`) with the same `tryOpenBatch` criterion as the
 * apply gate, and tracks loading/load-error. UI-specific messages (locale,
 * `refFields`, `refreshResult`, …) go to `onMessage`, called after this
 * session's own handling.
 */
export function useDesignerSession(
  dispatch: React.Dispatch<QueryAction>,
  onMessage?: (msg: HostMsg) => void,
): DesignerSession {
  const [loading, setLoading] = React.useState(true);
  const [metadataLoaded, setMetadataLoaded] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [lostComments, setLostComments] = React.useState<string[]>([]);
  const commentLossPending = lostComments.length > 0;
  const pendingCommentLossRef = React.useRef<BatchDocument | null>(null);
  const pendingLoadIdRef = React.useRef<number | undefined>(undefined);
  const sourceTextRef = React.useRef<string | undefined>(undefined);
  const sourceText = React.useCallback(() => sourceTextRef.current, []);
  const [loadedId, setLoadedId] = React.useState<number | undefined>(undefined);
  const expectModelRef = React.useRef(false);
  const metaTablesRef = React.useRef<MetaTable[]>([]);
  const onMessageRef = React.useRef(onMessage);
  onMessageRef.current = onMessage;

  const buildResolver = React.useCallback(
    () => (metaTablesRef.current.length ? buildResolverFromTables(metaTablesRef.current) : undefined),
    [],
  );

  const confirmCommentLoss = React.useCallback(() => {
    const doc = pendingCommentLossRef.current;
    if (!doc) return;
    pendingCommentLossRef.current = null;
    dispatch({ type: 'LOAD_BATCH', doc });
    setLoadedId(pendingLoadIdRef.current);
    setLostComments([]);
    setLoadError(null);
  }, [dispatch]);

  React.useEffect(() => {
    const unsub = onHostMessage(msg => {
      if (msg.type === 'init') {
        expectModelRef.current = msg.hasInitialQuery;
      } else if (msg.type === 'metadataTree') {
        metaTablesRef.current = msg.tables;
        dispatch({ type: 'SET_METADATA', tables: msg.tables });
        setMetadataLoaded(true);
        // Нет входного запроса — конструктор готов сразу после метаданных.
        if (!expectModelRef.current) setLoading(false);
      } else if (msg.type === 'loadModel') {
        // A new host load supersedes any candidate still awaiting confirmation.
        pendingCommentLossRef.current = null;
        setLostComments([]);
        pendingLoadIdRef.current = msg.loadId;
        // The host names the document's query; without it the first load is it.
        if (msg.sourceText !== undefined) sourceTextRef.current = msg.sourceText;
        else if (sourceTextRef.current === undefined) sourceTextRef.current = msg.text;
        const r = tryOpenDesignerBatch(msg.text, buildResolver());
        if (r.ok) { dispatch({ type: 'LOAD_BATCH', doc: r.doc }); setLoadedId(msg.loadId); setLoadError(null); }
        else if ('commentLossDoc' in r) {
          pendingCommentLossRef.current = r.commentLossDoc;
          setLostComments(r.lost);
          setLoadError(null);
        } else setLoadError(r.error);
        setLoading(false);
      }
      onMessageRef.current?.(msg);
    });
    postToHost({ type: 'ready' });
    return unsub;
  }, [dispatch, buildResolver]);

  return { loading, metadataLoaded, loadError, buildResolver, commentLossPending, lostComments, confirmCommentLoss, loadedId, sourceText };
}
