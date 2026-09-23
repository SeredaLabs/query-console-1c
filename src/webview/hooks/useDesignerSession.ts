import * as React from 'react';
import type { HostMsg } from '../../shared/messages';
import type { MetaTable } from '../../core/metadata/types';
import type { MetadataResolver } from '../../core/query/metadataResolver';
import { buildResolverFromTables } from '../../core/metadata/buildModelResolver';
import { tryOpenBatch } from '../../core/query/validateBatch';
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
  /** Resolver over the received metadata, or `undefined` (fail-open) when none. */
  buildResolver: () => MetadataResolver | undefined;
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
  const expectModelRef = React.useRef(false);
  const metaTablesRef = React.useRef<MetaTable[]>([]);
  const onMessageRef = React.useRef(onMessage);
  onMessageRef.current = onMessage;

  const buildResolver = React.useCallback(
    () => (metaTablesRef.current.length ? buildResolverFromTables(metaTablesRef.current) : undefined),
    [],
  );

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
        // Открытие из текста и проверка при применении используют ЕДИНЫЙ критерий
        // (`tryOpenBatch`: синтаксис + локальная семантика по кэшу метаданных).
        // Текст корректен — загружаем модель; иначе ошибка вместо пустого
        // конструктора. В любом случае снимаем оверлей загрузки.
        const r = tryOpenBatch(msg.text, buildResolver(), { preserveComments: true });
        if (r.ok) { dispatch({ type: 'LOAD_BATCH', doc: r.doc }); setLoadError(null); }
        else setLoadError(r.error);
        setLoading(false);
      }
      onMessageRef.current?.(msg);
    });
    postToHost({ type: 'ready' });
    return unsub;
  }, [dispatch, buildResolver]);

  return { loading, metadataLoaded, loadError, buildResolver };
}
