import * as React from 'react';
import { IconButton } from './IconButton';
import { PanelHeader } from './PanelHeader';
import { COLUMN_HEADER, GRID_ROW_BORDER, ROW_PADDING_Y, panelBox } from '../sharedStyles';
import { t } from '../i18n';

interface Props {
  names: string[];
  activeIndex: number;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove: (index: number, dir: 'up' | 'down') => void;
  onSetActive: (index: number) => void;
}

const TH: React.CSSProperties = COLUMN_HEADER;

const TD: React.CSSProperties = {
  fontSize: 12,
  padding: `${ROW_PADDING_Y}px 6px`,
  borderBottom: GRID_ROW_BORDER,
};

export function BatchTab({
  names, activeIndex, onAdd, onRemove, onMove, onSetActive,
}: Props): React.ReactElement {
  const [selectedRow, setSelectedRow] = React.useState(activeIndex);

  React.useEffect(() => {
    if (selectedRow >= names.length) setSelectedRow(names.length - 1);
  }, [names.length, selectedRow]);

  // Выделение следует за перемещаемой строкой, чтобы стрелки продолжали двигать её.
  function move(dir: 'up' | 'down') {
    const target = dir === 'up' ? selectedRow - 1 : selectedRow + 1;
    if (target < 0 || target >= names.length) return;
    onMove(selectedRow, dir);
    setSelectedRow(target);
  }

  return (
    <div style={{ display: 'flex', flex: 1, gap: 4, padding: 4, overflow: 'hidden' }}>
      <div style={{ ...panelBox, flex: 1, minWidth: 0 }}>
        <PanelHeader title={t('batch.title')}>
          <IconButton icon="add" tone="add" title={t('actions.add')} onClick={onAdd} />
          <IconButton
            icon="close"
            tone="remove"
            title={t('actions.delete')}
            disabled={names.length <= 1}
            onClick={() => onRemove(selectedRow)}
          />
          <IconButton icon="arrow-up" title={t('actions.moveUp')} onClick={() => move('up')} />
          <IconButton icon="arrow-down" title={t('actions.moveDown')} onClick={() => move('down')} />
        </PanelHeader>
        <div className="qc-list" tabIndex={-1} style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={TH}>{t('common.query')}</th>
              </tr>
            </thead>
            <tbody>
              {names.map((name, i) => (
                <tr
                  key={i}
                  onClick={() => setSelectedRow(i)}
                  onDoubleClick={() => onSetActive(i)}
                  // Выделенная строка — общий стиль выделения списков; активный
                  // (редактируемый) запрос пакета — полужирным и точкой-маркером,
                  // а не вторым цветом заливки, который спорил с выделением.
                  className={i === selectedRow ? 'qc-row qc-row--selected' : 'qc-row'}
                  aria-selected={i === selectedRow}
                  aria-current={i === activeIndex || undefined}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{
                    ...TD,
                    fontWeight: i === activeIndex ? 600 : 'normal',
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span className={`codicon codicon-${i === activeIndex ? 'circle-filled' : 'blank'}`} style={{ fontSize: 10, color: 'var(--vscode-focusBorder, #007fd4)' }} />
                      {name}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
