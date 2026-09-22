/**
 * Last-known-good metadata cache — заменяет узкий legacy-фолбэк `cfParser.ts`
 * (см. git history: понимал только `Catalogs`/`Documents`, только
 * `CatalogRef`/`DocumentRef`).
 *
 * Хранится в `context.globalStorageUri` — каталоге самого расширения,
 * гарантированно доступном на запись НЕЗАВИСИМО от состояния workspace-
 * каталога `outPath` (где живут прямой JSON-снимок и YAML-генерация, см.
 * `loadMetadataSafe.ts`/`panel.ts`). Это даёт РЕАЛЬНО другой failure domain:
 * если `outPath` недоступен на запись (сетевой диск в read-only, ограничения
 * прав на сам workspace), а глобальное хранилище расширения — как обычно
 * доступно, здесь можно найти последнюю УСПЕШНО построенную ПОЛНУЮ модель
 * метаданных (не урезанную до Catalogs/Documents).
 *
 * Пишется best-effort ПОСЛЕ каждой успешной сборки (direct-snapshot, тёплый
 * direct-snapshot-cached, yaml-fallback, обычный committed-YAML путь) — см.
 * `panel.ts`. Читается ТОЛЬКО когда все обычные пути уже отказали — и тогда
 * тоже best-effort: повреждённый/устаревшего формата файл трактуется как
 * отсутствие last-known-good, а не как ошибка.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { MetadataModel } from './types';

export const LAST_KNOWN_GOOD_VERSION = 1;

export interface LastKnownGood {
  cacheVersion: number;
  /** `Date.now()` момента УСПЕШНОЙ сборки этой модели (не момент записи файла
   * на диск — совпадают при обычной записи, но помогает диагностике). */
  builtAtMs: number;
  model: MetadataModel;
}

function lastKnownGoodPath(storageDir: string, cfPath: string): string {
  const hash = crypto.createHash('sha1').update(cfPath).digest('hex');
  return path.join(storageDir, `last-known-good-${hash}.json`);
}

/**
 * Лучше-с-эффортом запись — сбой (диск переполнен, нет прав даже здесь) НЕ
 * должен ломать уже успешно завершённую загрузку метаданных, поэтому
 * исключения проглатываются.
 *
 * Пустая модель (0 таблиц) НЕ считается "good" и не пишется — иначе она
 * молча перезаписала бы существующий последний хороший снимок деградированным
 * результатом. Такое возможно и сегодня: если `cfPath` временно недоступен
 * (например, отключён сетевой диск), прямой путь может "успешно" вернуть
 * пустую модель, вообще не бросая исключения (`scanConfigurationObjects`
 * просто пропускает отсутствующие подкаталоги) — это отдельный, не связанный
 * с last-known-good пробел (см. docs/development/known-issues.md), но здесь он не должен
 * стирать уже накопленный last-known-good.
 *
 * Architecture audit P2 (2026-09-22): раньше писалось напрямую в целевой файл
 * (`fs.writeFileSync(target, …)`) — прерванная запись (диск переполнился/
 * процесс убит на середине) могла оставить `target` усечённым/повреждённым и
 * тем самым УНИЧТОЖИТЬ предыдущий рабочий last-known-good — единственную
 * страховку на случай, когда ВСЕ остальные пути загрузки уже отказали
 * (см. файловый комментарий модуля). Пишем во временный файл и атомарно
 * `renameSync` поверх цели — тот же приём, что уже использует
 * `generationStore.ts` для staged-коммитов: `target` либо остаётся старым
 * целым файлом, либо становится новым целым файлом, никогда не усечённым
 * промежуточным состоянием.
 */
export function writeLastKnownGood(storageDir: string, cfPath: string, model: MetadataModel): void {
  if (model.tables.length === 0) return;
  const target = lastKnownGoodPath(storageDir, cfPath);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const file: LastKnownGood = { cacheVersion: LAST_KNOWN_GOOD_VERSION, builtAtMs: Date.now(), model };
    fs.writeFileSync(tmp, JSON.stringify(file));
    fs.renameSync(tmp, target);
  } catch {
    // best-effort: an interrupted write must never leave behind an orphaned
    // tmp file OR a truncated target — target is untouched by construction
    // above (renameSync either fully succeeds or never runs); clean up
    // whatever tmp state we managed to create.
    try { fs.rmSync(tmp, { force: true }); } catch { /* best-effort cleanup */ }
  }
}

/**
 * `null`, если файла нет, он повреждён, или его формат устарел — вызывающий
 * код (`panel.ts`) в этом случае возвращает честную пустую модель, а не
 * падает и не имитирует старое поведение `parseCf`.
 */
export function readLastKnownGood(storageDir: string, cfPath: string): LastKnownGood | null {
  try {
    const raw = fs.readFileSync(lastKnownGoodPath(storageDir, cfPath), 'utf8');
    const parsed = JSON.parse(raw) as Partial<LastKnownGood>;
    if (parsed.cacheVersion !== LAST_KNOWN_GOOD_VERSION || !parsed.model) return null;
    return parsed as LastKnownGood;
  } catch {
    return null;
  }
}
