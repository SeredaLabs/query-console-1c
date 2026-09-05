import * as React from 'react';
import type { VirtualParams } from '../../core/query/queryModel';
import type { VirtualTableInfo, TableKind } from '../../core/metadata/types';
import { PERIODICITY_VALUES, FILL_METHOD_VALUES } from '../../core/query/accumVirtualFields';
import { accountingParamFields, type VtParamKey } from '../../core/query/accountingVirtualParams';
import { IconButton } from './IconButton';
import { BTN, BTN_SECONDARY, MODAL_INPUT } from '../sharedStyles';
import { t } from '../i18n';

interface Props {
  slice: VirtualTableInfo['slice'];
  kind?: TableKind;
  correspondence?: boolean;
  initial: VirtualParams;
  onOpenConditionBuilder: (current: string, apply: (text: string) => void) => void;
  onOk: (params: VirtualParams) => void;
  onCancel: () => void;
}

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150,
};
const PANEL: React.CSSProperties = {
  background: 'var(--vscode-editor-background, #1e1e1e)',
  border: '1px solid var(--qc-border)',
  borderRadius: 6, padding: 16, minWidth: 460,
  display: 'flex', flexDirection: 'column', gap: 10,
};
function Row({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <label style={{ width: 140, fontSize: 12 }}>{label}</label>
      {children}
    </div>
  );
}

const ACC_SLICES = new Set(['Остатки', 'Обороты', 'ОборотыДтКт', 'ОстаткиИОбороты', 'ДвиженияССубконто']);

function paramLabel(key: VtParamKey, fallback: string): string {
  const labels: Partial<Record<VtParamKey, Parameters<typeof t>[0]>> = {
    period: 'dialog.virtual.period', startPeriod: 'dialog.virtual.periodStart',
    endPeriod: 'dialog.virtual.periodEnd', periodicity: 'dialog.virtual.periodicity',
    fillMethod: 'dialog.virtual.fillMethod', condition: 'dialog.virtual.condition',
    accountCondition: 'dialog.virtual.accountCondition', corrAccountCondition: 'dialog.virtual.corrAccountCondition',
    accountDtCondition: 'dialog.virtual.accountDtCondition', accountKtCondition: 'dialog.virtual.accountKtCondition',
    subcontoTypes: 'dialog.virtual.subcontoTypes', corrSubcontoTypes: 'dialog.virtual.corrSubcontoTypes',
    subcontoDtTypes: 'dialog.virtual.subcontoDtTypes', subcontoKtTypes: 'dialog.virtual.subcontoKtTypes',
    order: 'tabs.order', top: 'additional.first',
  };
  const keyName = labels[key];
  return keyName ? t(keyName) : fallback;
}

function AccountingForm({ slice, correspondence, initial, onOpenConditionBuilder, onOk, onCancel }: Props): React.ReactElement {
  const fieldsDesc = accountingParamFields(slice, correspondence === true);
  const [values, setValues] = React.useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of fieldsDesc) v[f.key] = (initial as any)[f.key] ?? '';
    return v;
  });
  const set = (k: VtParamKey, val: string) => setValues(prev => ({ ...prev, [k]: val }));

  function handleOk() {
    const params: VirtualParams = {};
    for (const f of fieldsDesc) {
      const val = values[f.key];
      if (val) (params as any)[f.key] = val;
    }
    onOk(params);
  }

  return (
    <div style={OVERLAY} onClick={onCancel}>
      <div style={PANEL} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 'bold', fontSize: 13 }}>{t('dialog.virtual.title')}</div>
        {fieldsDesc.map(f => (
          <Row key={f.key} label={paramLabel(f.key, f.label)}>
            {f.control === 'periodicity' ? (
              <select data-testid={`vt-${f.key}`} style={MODAL_INPUT} value={values[f.key]} onChange={e => set(f.key, e.target.value)}>
                <option value="">{t('common.noneSelected')}</option>
                {PERIODICITY_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            ) : f.control === 'fillMethod' ? (
              <select data-testid={`vt-${f.key}`} style={MODAL_INPUT} value={values[f.key]} onChange={e => set(f.key, e.target.value)}>
                <option value="">{t('common.noneSelected')}</option>
                {FILL_METHOD_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            ) : f.key === 'condition' ? (
              <>
                <input data-testid={`vt-${f.key}`} style={MODAL_INPUT} value={values[f.key]} onChange={e => set(f.key, e.target.value)} />
                <IconButton icon="ellipsis" title={t('dialog.expression.title')}
                  onClick={() => onOpenConditionBuilder(values[f.key], text => set('condition', text))} />
              </>
            ) : (
              <input data-testid={`vt-${f.key}`} style={MODAL_INPUT} value={values[f.key]} onChange={e => set(f.key, e.target.value)} />
            )}
          </Row>
        ))}
        <div style={{ display: 'flex', gap: 4, alignSelf: 'flex-end', marginTop: 6 }}>
          <button data-testid="vt-ok" style={BTN} onClick={handleOk}>{t('actions.ok')}</button>
          <button data-testid="vt-cancel" style={BTN_SECONDARY} onClick={onCancel}>{t('actions.cancel')}</button>
        </div>
      </div>
    </div>
  );
}

export function VirtualTableParamsDialog(props: Props): React.ReactElement {
  if (props.kind === 'РегистрБухгалтерии' && ACC_SLICES.has(props.slice)) {
    return <AccountingForm {...props} />;
  }
  return <LegacyForm {...props} />;
}

function LegacyForm({ slice, initial, onOpenConditionBuilder, onOk, onCancel }: Props): React.ReactElement {
  const [period, setPeriod] = React.useState(initial.period ?? '');
  const [startPeriod, setStartPeriod] = React.useState(initial.startPeriod ?? '');
  const [endPeriod, setEndPeriod] = React.useState(initial.endPeriod ?? '');
  const [periodicity, setPeriodicity] = React.useState(initial.periodicity ?? '');
  const [fillMethod, setFillMethod] = React.useState(initial.fillMethod ?? '');
  const [condition, setCondition] = React.useState(initial.condition ?? '');

  const isOIO = slice === 'ОстаткиИОбороты';
  const isRange = slice === 'Обороты' || isOIO;

  function handleOk() {
    const params: VirtualParams = {};
    if (!isRange && period) params.period = period;
    if (isRange) {
      if (startPeriod) params.startPeriod = startPeriod;
      if (endPeriod) params.endPeriod = endPeriod;
      if (periodicity) params.periodicity = periodicity;
    }
    if (isOIO && fillMethod) params.fillMethod = fillMethod;
    if (condition) params.condition = condition;
    onOk(params);
  }

  return (
    <div style={OVERLAY} onClick={onCancel}>
      <div style={PANEL} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 'bold', fontSize: 13 }}>{t('dialog.virtual.title')}</div>
        {!isRange && (
          <Row label={t('dialog.virtual.period')}>
            <input data-testid="vt-period" style={MODAL_INPUT} value={period} onChange={e => setPeriod(e.target.value)} />
          </Row>
        )}
        {isRange && (
          <>
            <Row label={t('dialog.virtual.periodStart')}>
              <input data-testid="vt-start" style={MODAL_INPUT} value={startPeriod} onChange={e => setStartPeriod(e.target.value)} />
            </Row>
            <Row label={t('dialog.virtual.periodEnd')}>
              <input data-testid="vt-end" style={MODAL_INPUT} value={endPeriod} onChange={e => setEndPeriod(e.target.value)} />
            </Row>
            <Row label={t('dialog.virtual.periodicity')}>
              <select data-testid="vt-periodicity" style={MODAL_INPUT} value={periodicity} onChange={e => setPeriodicity(e.target.value)}>
                <option value="">{t('common.noneSelected')}</option>
                {PERIODICITY_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </Row>
          </>
        )}
        {isOIO && (
          <Row label={t('dialog.virtual.fillMethod')}>
            <select data-testid="vt-fillmethod" style={MODAL_INPUT} value={fillMethod} onChange={e => setFillMethod(e.target.value)}>
              <option value="">{t('common.noneSelected')}</option>
              {FILL_METHOD_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Row>
        )}
        <Row label={t('dialog.virtual.condition')}>
          <input data-testid="vt-condition" style={MODAL_INPUT} value={condition} onChange={e => setCondition(e.target.value)} />
          <IconButton icon="ellipsis" title={t('dialog.expression.title')}
            onClick={() => onOpenConditionBuilder(condition, setCondition)} />
        </Row>
        <div style={{ display: 'flex', gap: 4, alignSelf: 'flex-end', marginTop: 6 }}>
          <button data-testid="vt-ok" style={BTN} onClick={handleOk}>{t('actions.ok')}</button>
          <button data-testid="vt-cancel" style={BTN_SECONDARY} onClick={onCancel}>{t('actions.cancel')}</button>
        </div>
      </div>
    </div>
  );
}
