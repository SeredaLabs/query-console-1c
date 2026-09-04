/**
 * Dual-path fallback (ТЗ v2.1 §51 Rollbackability, §52 Feature flags CONDITIONAL) —
 * подготовка к возможному PR-10 (Production Metadata Switch), но САМ этот файл
 * НЕ является переключением: `panel.ts` его не импортирует, production consumer
 * по-прежнему только `parseConfiguration`+`loadMetadataCached` (ТЗ §55 P1.2:
 * "current YAML/legacy remain fallback during validation").
 *
 * Смысл: если/когда panel.ts станет вызывать direct-путь (`buildMetadataSnapshotFromXml`,
 * PR-08) как основной, ЛЮБОЙ сбой в нём (в т.ч. непредвиденный на конфигурации,
 * которую мы не видели при валидации PR-08/09) не должен становиться регрессией
 * относительно сегодняшнего поведения — вызывающий код прозрачно откатывается на
 * тот же самый существующий, годами проверенный YAML-путь. Единственная цена
 * отказа — одна лишняя (неуспешная) попытка перед откатом, не потеря данных и не
 * падение процесса.
 *
 * Это НЕ постоянный "sync two backends" механизм и не заменяет ownership/commit
 * safety (та уже есть в generationStore.ts для ОБОИХ путей) — просто выбор
 * какой из двух уже безопасных путей вернуть вызывающему.
 */
import { buildMetadataSnapshotFromXml } from './snapshotBuilder';
import { parseConfiguration } from './parseConfiguration';
import { loadMetadataFromYaml } from '../yamlLoader';
import type { MetadataModel } from '../types';

export interface SafeMetadataLoadResult {
  model: MetadataModel;
  /** 'direct-snapshot' — новый XML→JSON путь отработал успешно; 'yaml-fallback' —
   * он бросил исключение, и был использован существующий production YAML-путь. */
  source: 'direct-snapshot' | 'yaml-fallback';
  /** Сообщение исключения direct-пути — присутствует ТОЛЬКО при source === 'yaml-fallback',
   * для диагностики (почему пришлось откатиться). */
  fallbackReason?: string;
}

/**
 * `snapshotOutPath` и `yamlOutPath` — РАЗНЫЕ корневые каталоги (как и в
 * `snapshotBuilder.ts` — `generationStore.ts` фиксирует имя `cf`/`cf-managed`
 * под тем корнем, что ему передан).
 */
export function loadMetadataWithFallback(
  cfPath: string,
  snapshotOutPath: string,
  yamlOutPath: string,
): SafeMetadataLoadResult {
  try {
    const built = buildMetadataSnapshotFromXml(cfPath, snapshotOutPath);
    return { model: built.model, source: 'direct-snapshot' };
  } catch (e) {
    const fallbackReason = e instanceof Error ? e.message : String(e);
    const yaml = parseConfiguration(cfPath, yamlOutPath);
    const model = loadMetadataFromYaml(yaml.outCfDir);
    return { model, source: 'yaml-fallback', fallbackReason };
  }
}
