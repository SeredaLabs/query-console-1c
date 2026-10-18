import * as React from 'react';
import { createPortal } from 'react-dom';
import { BTN, BTN_SECONDARY, DIALOG_PANEL, DIALOG_TITLE } from '../sharedStyles';
import { t, type MessageKey } from '../i18n';
import { wildcardExpansionPlan, type QueryAction, type QueryState } from '../state/queryStore';
import type { WildcardExpansion } from '../../core/query/expandStarFields';

/**
 * C24 step 1b: the explicit "expand `*`" command, shared by Classic and Canvas. The
 * plan (`wildcardExpansionPlan`) enables the button and names a refusal; confirming
 * dispatches `EXPAND_WILDCARDS`, which checks the plan again on the current state.
 */
export function useExpandWildcards(state: QueryState, dispatch: React.Dispatch<QueryAction>): {
  plan: WildcardExpansion;
  title: string;
  request: () => void;
  dialog: React.ReactElement | null;
} {
  const plan = React.useMemo(() => wildcardExpansionPlan(state), [state]);
  const [pending, setPending] = React.useState(false);
  const title = plan.ok
    ? t('fields.expandWildcards')
    : t(`fields.expandWildcards.refused.${plan.reason}` as MessageKey, { source: plan.source ?? '' });
  const dialog = pending
    ? <ExpandWildcardsDialog
        onCancel={() => setPending(false)}
        onConfirm={() => { setPending(false); dispatch({ type: 'EXPAND_WILDCARDS' }); }}
      />
    : null;
  return { plan, title, request: () => { if (plan.ok) setPending(true); }, dialog };
}

/**
 * The confirmation names the limit of the result: the columns come from the
 * configuration dump, which is not proven complete (extensions, a stale dump).
 * Confirming is the user's choice, not a proof of completeness.
 */
function ExpandWildcardsDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }): React.ReactElement {
  const overlay = React.useRef<HTMLDivElement>(null);
  const cancel = React.useRef<HTMLButtonElement>(null);
  const confirm = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const backgrounds = Array.from(document.body.children)
      .filter((el): el is HTMLElement => el instanceof HTMLElement && el !== overlay.current)
      .map(el => ({ el, inert: el.inert }));
    for (const { el } of backgrounds) el.inert = true;
    cancel.current?.focus();
    return () => {
      for (const { el, inert } of backgrounds) el.inert = inert;
      previousFocus?.focus();
    };
  }, []);

  return createPortal(
    <div ref={overlay} data-testid="expand-wildcards-confirm"
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
        if (event.key === 'Tab') {
          event.preventDefault();
          if (document.activeElement === cancel.current) confirm.current?.focus();
          else cancel.current?.focus();
        }
      }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="expand-wildcards-title" aria-describedby="expand-wildcards-body"
        style={{ ...DIALOG_PANEL, width: 480, maxWidth: 'calc(100vw - 40px)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div id="expand-wildcards-title" style={DIALOG_TITLE}>{t('dialog.expandWildcards.title')}</div>
        <div id="expand-wildcards-body" style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{t('dialog.expandWildcards.body')}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button ref={cancel} type="button" data-testid="expand-wildcards-cancel" style={BTN_SECONDARY} onClick={onCancel}>{t('actions.cancel')}</button>
          <button ref={confirm} type="button" data-testid="expand-wildcards-continue" style={BTN} onClick={onConfirm}>{t('dialog.expandWildcards.continue')}</button>
        </div>
      </div>
    </div>, document.body,
  );
}
