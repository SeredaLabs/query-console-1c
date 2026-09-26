import * as React from 'react';
import { IconButton } from './IconButton';
import { RowRemoveButton } from './RowRemoveButton';
import { BTN, BTN_SECONDARY, MODAL_INPUT, DIALOG_PANEL, DIALOG_TITLE } from '../sharedStyles';
import { t } from '../i18n';

export interface TempTableField {
  name: string;
}

interface Props {
  onOk: (name: string, fields: TempTableField[]) => void;
  onCancel: () => void;
  /** 7.8.14: режим правки — предзаполнить имя и поля существующей ВТ. */
  initial?: { name: string; fields: TempTableField[] };
}

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
};
const PANEL: React.CSSProperties = {
  ...DIALOG_PANEL,
  padding: '10px 16px 16px', width: 460,
  display: 'flex', flexDirection: 'column', gap: 10,
};
/** Окно «Временная таблица» (7.8.9): имя ВТ + список полей (без «Типа значения»). */
export function TempTableDialog({ onOk, onCancel, initial }: Props): React.ReactElement {
  const [name, setName] = React.useState(initial?.name ?? 'ВТ');
  const [fields, setFields] = React.useState<TempTableField[]>(
    initial && initial.fields.length > 0 ? initial.fields : [{ name: '' }]
  );

  function setField(i: number, patch: Partial<TempTableField>) {
    setFields(prev => prev.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  }
  function addRow() {
    setFields(prev => [...prev, { name: '' }]);
  }
  function removeRow(i: number) {
    setFields(prev => (prev.length > 1 ? prev.filter((_, k) => k !== i) : prev));
  }

  const validFields = fields.filter(f => f.name.trim());
  const canOk = name.trim() !== '' && validFields.length > 0;

  return (
    <div style={OVERLAY} onClick={onCancel}>
      <div
        style={PANEL}
        role="dialog"
        aria-modal="true"
        aria-label={t('dialog.tempTable.title')}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); onCancel(); } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={DIALOG_TITLE}>{t('dialog.tempTable.title')}</span>
          <IconButton icon="close" title={t('actions.close')} onClick={onCancel} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ width: 90, fontSize: 12 }}>{t('dialog.tempTable.name')}</label>
          <input data-testid="tt-name" style={MODAL_INPUT} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{t('common.fields')}</span>
          <IconButton testId="tt-add-row" icon="add" tone="add" title={t('dialog.tempTable.addField')} onClick={addRow} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '40vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 8, fontSize: 11, fontWeight: 600, color: 'var(--vscode-descriptionForeground, #aaa)' }}>
            <span style={{ flex: 1 }}>{t('common.name')}</span>
            <span style={{ width: 20 }} />
          </div>
          {fields.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                data-testid={`tt-field-name-${i}`}
                style={MODAL_INPUT}
                value={f.name}
                onChange={e => setField(i, { name: e.target.value })}
              />
              <RowRemoveButton title={t('dialog.tempTable.removeField')} onClick={() => removeRow(i)} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, alignSelf: 'flex-end', marginTop: 6 }}>
          <button
            data-testid="tt-ok"
            style={{ ...BTN, opacity: canOk ? 1 : 0.5 }}
            disabled={!canOk}
            onClick={() => onOk(name.trim(), validFields)}
          >
            {t('actions.ok')}
          </button>
          <button
            data-testid="tt-cancel"
            style={BTN_SECONDARY}
            onClick={onCancel}
          >
            {t('actions.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
