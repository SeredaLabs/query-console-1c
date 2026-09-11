import { describe, it, expect } from 'vitest';
import { describeFieldTypes } from '../../src/core/metadata/describeType';
import type { MetaField } from '../../src/core/metadata/types';

function field(types: MetaField['types']): MetaField {
  return { name: 'X', kind: 'attribute', types };
}

describe('describeFieldTypes', () => {
  it('примитивный тип', () => {
    expect(describeFieldTypes(field([{ primitive: 'Строка' }]))).toBe('Строка');
  });

  it('ссылочный тип', () => {
    expect(describeFieldTypes(field([{ ref: { kind: 'Справочник', name: 'СтраныМира' } }]))).toBe(
      'Справочник.СтраныМира'
    );
  });

  it('составной тип (несколько вариантов через " | ")', () => {
    expect(
      describeFieldTypes(
        field([{ primitive: 'Строка' }, { ref: { kind: 'Справочник', name: 'Валюты' } }])
      )
    ).toBe('Строка | Справочник.Валюты');
  });

  it('неизвестный тип с raw-фолбэком (не выпадает молча)', () => {
    expect(describeFieldTypes(field([{ raw: 'cfg:AnyIBRef' }]))).toBe('cfg:AnyIBRef');
  });

  it('пустой MetaType (без raw) даёт пустую строку — вызывающий код не ставит detail', () => {
    expect(describeFieldTypes(field([{}]))).toBe('');
  });

  it('составной тип, где один вариант распознан, а другой — нет: распознанный не теряется', () => {
    expect(describeFieldTypes(field([{ primitive: 'Число' }, {}]))).toBe('Число');
  });

  it('строка с квалификатором длины: Строка(150)', () => {
    expect(describeFieldTypes(field([{ primitive: 'Строка', length: 150 }]))).toBe('Строка(150)');
  });

  it('строка неограниченной длины (length: 0): без скобок', () => {
    expect(describeFieldTypes(field([{ primitive: 'Строка', length: 0 }]))).toBe('Строка');
  });

  it('число с разрядностью и дробной частью: Число(10,2)', () => {
    expect(describeFieldTypes(field([{ primitive: 'Число', digits: 10, fractionDigits: 2 }]))).toBe(
      'Число(10,2)'
    );
  });

  it('целое число без дробной части: Число(10)', () => {
    expect(describeFieldTypes(field([{ primitive: 'Число', digits: 10 }]))).toBe('Число(10)');
  });

  it('число неограниченной разрядности (digits: 0): без скобок', () => {
    expect(describeFieldTypes(field([{ primitive: 'Число', digits: 0 }]))).toBe('Число');
  });
});
