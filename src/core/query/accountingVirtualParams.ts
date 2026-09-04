export type VtParamKey =
  | 'period' | 'startPeriod' | 'endPeriod' | 'periodicity' | 'fillMethod'
  | 'accountCondition' | 'corrAccountCondition' | 'accountDtCondition' | 'accountKtCondition'
  | 'condition' | 'order' | 'top'
  | 'subcontoTypes' | 'corrSubcontoTypes' | 'subcontoDtTypes' | 'subcontoKtTypes';

export interface VtParamField {
  key: VtParamKey;
  label: string;
  control: 'text' | 'periodicity' | 'fillMethod';
}

const t = (key: VtParamKey, label: string): VtParamField => ({ key, label, control: 'text' });
const periodicity: VtParamField = { key: 'periodicity', label: 'Периодичность', control: 'periodicity' };
const fillMethod: VtParamField = { key: 'fillMethod', label: 'Метод дополнения', control: 'fillMethod' };

export function accountingParamFields(slice: string, correspondence: boolean): VtParamField[] {
  switch (slice) {
    case 'Остатки':
      return [
        t('period', 'Период'), t('accountCondition', 'Условие счёта'),
        t('subcontoTypes', 'Виды субконто'), t('condition', 'Условие'),
      ];
    case 'Обороты':
      return [
        t('startPeriod', 'Начало периода'), t('endPeriod', 'Конец периода'), periodicity,
        t('accountCondition', 'Условие счёта'), t('subcontoTypes', 'Виды субконто'), t('condition', 'Условие'),
        ...(correspondence ? [t('corrAccountCondition', 'Условие кор. счёта'), t('corrSubcontoTypes', 'Виды субконто (кор. счёт)')] : []),
      ];
    case 'ОборотыДтКт':
      return [
        t('startPeriod', 'Начало периода'), t('endPeriod', 'Конец периода'), periodicity,
        t('accountDtCondition', 'Условие счёта Дт'), t('subcontoDtTypes', 'Виды субконто (Дт)'),
        t('accountKtCondition', 'Условие счёта Кт'), t('subcontoKtTypes', 'Виды субконто (Кт)'),
        t('condition', 'Условие'),
      ];
    case 'ОстаткиИОбороты':
      return [
        t('startPeriod', 'Начало периода'), t('endPeriod', 'Конец периода'), periodicity, fillMethod,
        t('accountCondition', 'Условие счёта'), t('subcontoTypes', 'Виды субконто'), t('condition', 'Условие'),
      ];
    case 'ДвиженияССубконто':
      return [
        t('startPeriod', 'Начало периода'), t('endPeriod', 'Конец периода'),
        t('condition', 'Условие'), t('order', 'Порядок'), t('top', 'Первые'),
      ];
    case 'Субконто':
      return [t('period', 'Период'), t('accountCondition', 'Условие счёта')];
    default:
      return [];
  }
}
