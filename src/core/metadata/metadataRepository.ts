import type { MetaTable, TableKind } from './types';

/**
 * Read-only consumer boundary над уже загруженными метаданными (ТЗ v2.1 §11,
 * §55 P1.1). Первый repository намеренно минимален — не добавляем методы
 * "на будущее" (§11).
 *
 * Repository НЕ отвечает за build lifecycle, commit, cleanup, source scanning
 * или snapshot write (§5) — это остаётся в generationStore.ts/modelCache.ts.
 * `MetadataResolver` (metadataResolver.ts) уже покрывает semantic-resolution
 * (существование таблицы, канонизация имени, поиск виртуальной таблицы) —
 * не дублируем эту абстракцию здесь.
 */
export interface MetadataRepository {
  getTables(): readonly MetaTable[];
  findTable(kind: TableKind, name: string): MetaTable | undefined;
}

/**
 * Минимальная in-memory реализация поверх уже загруженного `MetaTable[]`
 * (текущий `MetadataModel.tables`). Строится по требованию из ТЕКУЩЕГО массива
 * у вызывающего — при перезагрузке метаданных (`refreshCache`) вызывающий
 * просто создаёт новый repository над новым массивом; сам repository не хранит
 * и не обновляет состояние.
 */
export function createMetadataRepository(tables: readonly MetaTable[]): MetadataRepository {
  return {
    getTables: () => tables,
    findTable: (kind, name) => tables.find(t => t.kind === kind && t.name === name),
  };
}
