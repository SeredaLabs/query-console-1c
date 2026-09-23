import * as React from 'react';
import { useReducer, useMemo, useState } from 'react';
import { ConstructorView } from './components/ConstructorView';
import { postToHost } from './bridge';
import { useDesignerSession } from './hooks/useDesignerSession';
import { initialState, reducer } from './state/queryStore';
import { computeBatchTextSafe } from './computeBatchText';
import { findStaticApplyBlocker, decideApply } from './applyGate';
import { BTN } from './sharedStyles';
import { localizeDiagnostic, setLocale, t } from './i18n';

export type RefreshState = 'idle' | 'loading' | { ok: boolean; message: string };

export function App(): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [refreshState, setRefreshState] = useState<RefreshState>('idle');
  // 8.1: «Сохранять комментарии» — включено по умолчанию. Управляет и сбором
  // комментариев при открытии, и их печатью в итоговом тексте при сохранении.
  const [preserveComments, setPreserveComments] = useState(true);
  // 7.8.10: текст ошибки валидации при нажатии ОК (null = нет ошибки).
  const [okError, setOkError] = useState<string | null>(null);
  // Стадия 1 плана «Текст запроса v2» — прокидывается хостом из настройки
  // `queryConsole.queryTextEditorV2` (по умолчанию выключено).
  const [queryTextEditorV2, setQueryTextEditorV2] = useState(false);
  // Лише примусовий ре-рендер при зміні локалі (повідомлення рахуються в рендері).
  const [, setLocaleRevision] = useState(0);
  // Сессия с хостом (ready → metadataTree → loadModel, загрузка/ошибка открытия) —
  // общая с Canvas (`hooks/useDesignerSession.ts`); здесь только Classic-сообщения.
  const { loading, loadError, buildResolver } = useDesignerSession(dispatch, msg => {
    if (msg.type === 'init') {
      // `locale` was added to a versionless host/WebView contract. A restored
      // panel or older harness may still send the previous shape; keep the
      // already selected locale instead of invalidating the dictionary.
      if (msg.locale) {
        setLocale(msg.locale);
        setLocaleRevision(revision => revision + 1);
      }
      setQueryTextEditorV2(msg.queryTextEditorV2);
    } else if (msg.type === 'refFields') {
      dispatch({ type: 'SET_REF_FIELDS', ref: msg.ref, fields: msg.fields });
    } else if (msg.type === 'refreshResult') {
      setRefreshState({ ok: msg.ok, message: msg.message });
    }
  });

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

  // PR-05/PR-14 (ТЗ §27/28/54 P0.5): capability/preservation gate ПЕРЕД записью в
  // редактор — небезпечна віртуальна таблиця або синтаксично зламаний custom-вираз
  // (див. `applyGate.ts`, спільний із Canvas). Не помилка генерації, а відома
  // межа capability моделі — тому окремо від generationError, хоча відображається
  // тим самим каналом okError/okDisabled.
  const applyBlocker = useMemo(() => findStaticApplyBlocker(state), [state]);
  const unsafeVtError = applyBlocker?.kind === 'unsafeVirtualTable'
    ? t('constructor.unsafeVirtual', { name: applyBlocker.name })
    : null;
  const malformedCustomError = applyBlocker?.kind === 'malformedCustom' ? t('constructor.malformedCustom') : null;

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
          const decision = decideApply(batchText, generationError, applyBlocker, buildResolver());
          if (!decision.ok) {
            if (decision.kind === 'invalid') setOkError(decision.error);
            return;
          }
          setOkError(null);
          handleInsert(batchText);
        }}
        onCancel={handleCancel}
        okDisabled={!batchText.trim() || generationError !== null || unsafeVtError !== null || malformedCustomError !== null}
        okError={generationError ? t('constructor.generationError', { error: localizeDiagnostic(generationError) }) : (unsafeVtError ?? malformedCustomError ?? (okError && localizeDiagnostic(okError)))}
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
