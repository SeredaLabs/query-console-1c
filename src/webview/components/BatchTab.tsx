import * as React from 'react';
import { IconButton } from './IconButton';
import { SECTION_HEADER, panelBox } from '../sharedStyles';
import { t } from '../i18n';

interface Props {
  names: string[];
  activeIndex: number;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove: (index: number, dir: 'up' | 'down') => void;
  onSetActive: (index: number) => void;
}

const TH: React.CSSProperties = {
  ...SECTION_HEADER,
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const TD: React.CSSProperties = {
  fontSize: 12,
  padding: '3px 6px',
  borderBottom: '1px solid var(--qc-border)',
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
        <div style={SECTION_HEADER}>{t('batch.title')}</div>
        <div style={{ display: 'flex', gap: 2, padding: '2px 4px', borderBottom: '1px solid var(--qc-border)' }}>
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
        </div>
        <div style={{ overflow: 'auto', flex: 1 }}>
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
                  style={{
                    cursor: 'pointer',
                    background: i === activeIndex
                      ? 'var(--vscode-list-activeSelectionBackground, #094771)'
                      : i === selectedRow
                        ? 'var(--vscode-list-inactiveSelectionBackground, #37373d)'
                        : 'transparent',
                  }}
                >
                  <td style={{
                    ...TD,
                    fontWeight: i === activeIndex ? 'bold' : 'normal',
                  }}>
                    {name}
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
