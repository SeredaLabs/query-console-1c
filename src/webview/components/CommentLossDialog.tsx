import * as React from 'react';
import { createPortal } from 'react-dom';
import { BTN, BTN_SECONDARY, DIALOG_PANEL, DIALOG_TITLE } from '../sharedStyles';
import { t } from '../i18n';

/** Comment loss is an explicit policy choice, not a syntax/Apply override. */
export function CommentLossDialog({ onConfirm, onCancel }: {
  onConfirm: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const overlay = React.useRef<HTMLDivElement>(null);
  const cancel = React.useRef<HTMLButtonElement>(null);
  const confirm = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    // The portal is outside the editor/text-dialog root. Keep that root inert
    // until the decision, including keyboard shortcuts and background Save.
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
    <div ref={overlay} data-testid="comment-loss-confirm"
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
      <div role="alertdialog" aria-modal="true" aria-labelledby="comment-loss-title" aria-describedby="comment-loss-body"
        style={{ ...DIALOG_PANEL, width: 480, maxWidth: 'calc(100vw - 40px)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div id="comment-loss-title" style={DIALOG_TITLE}>{t('dialog.commentLoss.title')}</div>
        <div id="comment-loss-body" style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{t('diagnostic.commentLoss')}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button ref={cancel} type="button" data-testid="comment-loss-cancel" style={BTN_SECONDARY} onClick={onCancel}>{t('actions.cancel')}</button>
          <button ref={confirm} type="button" data-testid="comment-loss-continue" style={BTN} onClick={onConfirm}>{t('dialog.commentLoss.continue')}</button>
        </div>
      </div>
    </div>, document.body,
  );
}
