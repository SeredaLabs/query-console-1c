import * as React from 'react';
import { useReducer, useEffect, useMemo, useState } from 'react';
import { ConstructorView } from './components/ConstructorView';
import { postToHost, onHostMessage } from './bridge';
import { initialState, reducer, assembleBatch } from './state/queryStore';
import { computeBatchTextSafe } from './computeBatchText';
import { tryOpenBatch, validateBatchText } from '../core/query/validateBatch';
import { findUnsafeVirtualTables } from '../core/query/semanticValidator';
import { buildResolverFromTables } from '../core/metadata/buildModelResolver';
import type { MetaTable } from '../core/metadata/types';
import { BTN } from './sharedStyles';
import { localizeDiagnostic, setLocale, t } from './i18n';

export type RefreshState = 'idle' | 'loading' | { ok: boolean; message: string };

export function App(): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [refreshState, setRefreshState] = useState<RefreshState>('idle');
  // 8.1: «Сохранять комментарии» — включено по умолчанию. Управляет и сбором
  // комментариев при открытии, и их печатью в итоговом тексте при сохранении.
  const [preserveComments, setPreserveComments] = useState(true);
  // 7.8.2: пока не пришли метаданные (и модель запроса, если открываем существующий
  // текст) — показываем индикатор загрузки, чтобы не мигать пустым конструктором.
  const [loading, setLoading] = useState(true);
  // 7.8.10: текст ошибки валидации при нажатии ОК (null = нет ошибки).
  const [okError, setOkError] = useState<string | null>(null);
  // Текст синтаксической ошибки при открытии из текста (null = нет): некорректный
  // запрос НЕ открывается пустым конструктором, а показывает ошибку с номером строки.
  const [loadError, setLoadError] = useState<string | null>(null);
  const expectModelRef = React.useRef(false);
  // Стадия 1 плана «Текст запроса v2» — прокидывается хостом из настройки
  // `queryConsole.queryTextEditorV2` (по умолчанию выключено).
  const [queryTextEditorV2, setQueryTextEditorV2] = useState(false);
  const [localeRevision, setLocaleRevision] = useState(0);
  // 8.4: таблицы метаданных для локальной семантической проверки открытия/ОК.
  // Резолвер строится из них только при непустом списке (иначе — fail-open: undefined).
  const metaTablesRef = React.useRef<MetaTable[]>([]);
  const buildResolver = () =>
    metaTablesRef.current.length ? buildResolverFromTables(metaTablesRef.current) : undefined;

  useEffect(() => {
    const unsub = onHostMessage(msg => {
      if (msg.type === 'init') {
        // `locale` was added to a versionless host/WebView contract. A restored
        // panel or older harness may still send the previous shape; keep the
        // already selected locale instead of invalidating the dictionary.
        if (msg.locale) {
          setLocale(msg.locale);
          setLocaleRevision(revision => revision + 1);
        }
        expectModelRef.current = msg.hasInitialQuery;
        setQueryTextEditorV2(msg.queryTextEditorV2);
      } else if (msg.type === 'metadataTree') {
        metaTablesRef.current = msg.tables;
        dispatch({ type: 'SET_METADATA', tables: msg.tables });
        // Нет входного запроса — конструктор готов сразу после метаданных.
        if (!expectModelRef.current) setLoading(false);
      } else if (msg.type === 'refFields') {
        dispatch({ type: 'SET_REF_FIELDS', ref: msg.ref, fields: msg.fields });
      } else if (msg.type === 'refreshResult') {
        setRefreshState({ ok: msg.ok, message: msg.message });
      } else if (msg.type === 'loadModel') {
        // Открытие из текста и проверка при «ОК» (7.8.10) используют ЕДИНЫЙ разбор.
        // 8.4: `tryOpenBatch` добавляет к синтаксису локальную семантическую проверку
        // (существование таблиц по кэшу). Текст корректен — загружаем модель; иначе
        // показываем ошибку (синтаксическую или семантическую) вместо пустого
        // конструктора. В любом случае снимаем оверлей загрузки (7.8.2).
        const r = tryOpenBatch(msg.text, buildResolver(), { preserveComments: true });
        if (r.ok) { dispatch({ type: 'LOAD_BATCH', doc: r.doc }); setLoadError(null); }
        else setLoadError(r.error);
        setLoading(false);
      }
    });
    postToHost({ type: 'ready' });
    return unsub;
  }, []);

  function handleInsert(text: string) {
    postToHost({ type: 'insertText', text });
  }

  function handleCancel() {
    postToHost({ type: 'cancel' });
  }

  function handleRefreshCache() {
    setRefreshState('loading');
    postToHost({ type: 'refreshCache' });
  }

  // Готовый текст пакета запросов — для вставки и блокировки кнопки ОК.
  // 8.1: при снятой галочке «Сохранять комментарии» комментарии убираются из модели
  // перед генерацией (генератор печатает их только при наличии).
  // 8.3.6: мемоизация — не пересобирать большой запрос на ре-рендерах от локального
  // состояния (баннеры ошибок/загрузки, тулбар кэша), только при изменении модели.
  // PR-05 (ТЗ §28/§30): `computeBatchTextSafe` ловит исключение сборки/генерации
  // вместо того, чтобы дать ему улететь из тела useMemo — раньше это падение
  // сносило весь webview (нет Error Boundary), теперь — controlled `generationError`.
  const { text: batchText, error: generationError } = useMemo(
    () => computeBatchTextSafe(state, preserveComments),
    [state, preserveComments]
  );

  // PR-05 (ТЗ §27/28/54 P0.5): capability/preservation gate ПЕРЕД записью в
  // редактор. Виртуальная таблица с непокрытыми позициями 3+ (см.
  // KNOWN_ISSUES.md, findUnsafeVirtualTables) не может быть безопасно применена
  // конструктором — правка молча роняла бы эти аргументы. В отличие от
  // generationError, это НЕ ошибка генерации (generateBatch отрабатывает штатно),
  // а известная граница capability модели — поэтому отдельная переменная, хотя
  // отображается тем же каналом okError/okDisabled.
  const unsafeVtError = useMemo(() => {
    const names = findUnsafeVirtualTables(assembleBatch(state));
    return names.length > 0
      ? t('constructor.unsafeVirtual', { name: names[0] })
      : null;
  }, [state, localeRevision]);

  return (
    <>
      <ConstructorView
        state={state}
        dispatch={dispatch}
        queryTextEditorV2={queryTextEditorV2}
        onExpandRef={ref => postToHost({ type: 'expandRef', ref })}
        refreshState={refreshState}
        onRefreshCache={handleRefreshCache}
        preserveComments={preserveComments}
        onSetPreserveComments={setPreserveComments}
        onOk={() => {
          // generationError/unsafeVtError уже делают okDisabled=true (см. ниже) —
          // эта проверка на случай прямого вызова/будущей развязки условий, чтобы
          // «ОК» никогда не мог отправить insertText при известной ошибке генерации
          // ИЛИ известной потере данных виртуальной таблицы (ТЗ §27/§28).
          if (generationError || unsafeVtError) return;
          const v = validateBatchText(batchText, buildResolver());
          if (!v.ok) { setOkError(v.error); return; }
          setOkError(null);
          handleInsert(batchText);
        }}
        onCancel={handleCancel}
        okDisabled={!batchText.trim() || generationError !== null || unsafeVtError !== null}
        okError={generationError ? t('constructor.generationError', { error: localizeDiagnostic(generationError) }) : (unsafeVtError ?? (okError && localizeDiagnostic(okError)))}
      />

      {/* Синтаксическая ошибка открытия из текста — поверх конструктора, с номером строки. */}
      {loadError != null && (
        <div
          data-testid="load-error"
          style={{
            position: 'fixed', inset: 0,
            background: 'var(--vscode-editor-background, #1e1e1e)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 12, padding: 24, textAlign: 'center', zIndex: 400,
          }}
        >
          <div style={{ color: 'var(--vscode-errorForeground, #f44747)', fontSize: 14, fontWeight: 600 }}>
            {t('constructor.openFailed')}
          </div>
          <div style={{ color: 'var(--vscode-errorForeground, #f44747)', fontSize: 13, whiteSpace: 'pre-wrap', maxWidth: 640 }}>
            {localizeDiagnostic(loadError)}
          </div>
          <button style={BTN} onClick={handleCancel}>{t('actions.close')}</button>
        </div>
      )}

      {/* 7.8.2: loading overlay — covers the constructor until it is fully populated */}
      {loading && (
        <div
          data-testid="loading-overlay"
          style={{
            position: 'fixed', inset: 0,
            background: 'var(--vscode-editor-background, #1e1e1e)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 300,
            color: 'var(--vscode-descriptionForeground, #888)', fontSize: 14,
          }}
        >
          {t('constructor.loading')}
        </div>
      )}
    </>
  );
}
