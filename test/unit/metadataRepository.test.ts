/**
 * PR-07 (ТЗ v2.1 §11, §55 P1.1) — минимальный MetadataRepository.
 */
import { describe, it, expect } from 'vitest';
import { createMetadataRepository } from '../../src/core/metadata/metadataRepository';
import type { MetaTable } from '../../src/core/metadata/types';

const ВАЛЮТЫ: MetaTable = {
  kind: 'Справочник', name: 'Валюты', fullName: 'Справочник.Валюты', fields: [],
};
const БАНКСЧЕТА: MetaTable = {
  kind: 'Справочник', name: 'БанковскиеСчета', fullName: 'Справочник.БанковскиеСчета', fields: [],
};
// Тот же `name`, что и у Валюты, но другой `kind` — findTable должен различать
// объекты РАЗНЫХ видов метаданных с одинаковым именем (это не гипотетический
// кейс: 1С не запрещает документу и справочнику называться одинаково).
const ВАЛЮТЫ_ДОК: MetaTable = {
  kind: 'Документ', name: 'Валюты', fullName: 'Документ.Валюты', fields: [],
};

describe('MetadataRepository (PR-07)', () => {
  it('getTables() возвращает переданный массив как есть', () => {
    const repo = createMetadataRepository([ВАЛЮТЫ, БАНКСЧЕТА]);
    expect(repo.getTables()).toEqual([ВАЛЮТЫ, БАНКСЧЕТА]);
  });

  it('getTables() на пустом массиве — пустой результат, не undefined/throw', () => {
    const repo = createMetadataRepository([]);
    expect(repo.getTables()).toEqual([]);
  });

  it('findTable находит объект по kind+name', () => {
    const repo = createMetadataRepository([ВАЛЮТЫ, БАНКСЧЕТА]);
    expect(repo.findTable('Справочник', 'Валюты')).toBe(ВАЛЮТЫ);
  });

  it('findTable различает объекты РАЗНЫХ видов с ОДИНАКОВЫМ именем', () => {
    const repo = createMetadataRepository([ВАЛЮТЫ, ВАЛЮТЫ_ДОК]);
    expect(repo.findTable('Справочник', 'Валюты')).toBe(ВАЛЮТЫ);
    expect(repo.findTable('Документ', 'Валюты')).toBe(ВАЛЮТЫ_ДОК);
  });

  it('findTable возвращает undefined, когда объект не найден', () => {
    const repo = createMetadataRepository([ВАЛЮТЫ]);
    expect(repo.findTable('Справочник', 'НетТакого')).toBeUndefined();
    expect(repo.findTable('Документ', 'Валюты')).toBeUndefined();
  });

  it('репозиторий, построенный над НОВЫМ массивом, не видит старых данных (нет скрытого состояния)', () => {
    const repoOld = createMetadataRepository([ВАЛЮТЫ]);
    const repoNew = createMetadataRepository([БАНКСЧЕТА]);
    expect(repoOld.findTable('Справочник', 'БанковскиеСчета')).toBeUndefined();
    expect(repoNew.findTable('Справочник', 'БанковскиеСчета')).toBe(БАНКСЧЕТА);
  });
});
