/**
 * Metadata build safety (ТЗ v2.1 §6-9, PR-02).
 *
 * Инкапсулирует три отдельных инварианта, которых раньше не было ни у одного
 * writer'а в этом дереве (`parseConfiguration.ts` делал безусловный
 * `rmSync(outCfDir)` ДО того, как новая генерация была готова хоть частично):
 *
 * 1. Ownership guard (§7): каталог НЕ считается нашим только потому, что называется
 *    `cf` или содержит `configuration.yaml` — нужен явный, проверяемый маркер.
 *    Неопознанный (unowned) каталог никогда не удаляется и не "усыновляется".
 * 2. Managed generation (§6): новая генерация строится ЦЕЛИКОМ в отдельном staging-
 *    каталоге, пока текущая (N) остаётся нетронутой и обслуживаемой; переключение
 *    N → N+1 — одна логическая операция (rename), а не поэтапная перезапись.
 * 3. Last-known-good (§9): если build/commit не завершился успехом, N остаётся
 *    current, N+1 никогда не становится видимой наполовину.
 */
import * as fs from 'fs';
import * as path from 'path';

/** Расширяется только когда предыдущий формат перестаёт гарантировать совместимость
 * (ТЗ §10) — не при каждом структурном изменении YAML. */
export const OWNER_FORMAT_VERSION = 1;
export const OWNER_ID = 'SeredaLabs.query-console-1c';
const OWNER_FILE = '.owner.json';

/** Суффикс каталога, в который коммитится генерация, если исходный `cf`-каталог
 * существует, но не распознан как наш (§7: старый unowned output остаётся
 * untouched, managed-генерация создаётся отдельно, а не поверх него). */
const MANAGED_SUFFIX = '-managed';

interface OwnerMarker {
  owner: string;
  formatVersion: number;
}

/** Разбор/запись/парсинг одного объекта метаданных — recoverable, не валит всю
 * генерацию. Индекс/маркер владения/commit — generation-integrity failures
 * (§8: "Fatality определяется типом failure, а не количеством errors"). */
export interface MetadataBuildIssue {
  file?: string;
  stage: 'read' | 'parse' | 'write' | 'index' | 'commit';
  message: string;
  fatal: boolean;
}

/** true, если каталог содержит валидный, узнаваемый маркер владения этого
 * расширения. Отсутствие/повреждение файла, чужой `owner`, отсутствие
 * `formatVersion` — всё трактуется как "не наш" (fail-closed по umолчанию для
 * destructive-операций, а не fail-open). */
export function isOwnedGeneration(dir: string): boolean {
  const markerPath = path.join(dir, OWNER_FILE);
  if (!fs.existsSync(markerPath)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as Partial<OwnerMarker>;
    return data.owner === OWNER_ID && typeof data.formatVersion === 'number';
  } catch {
    return false;
  }
}

function writeOwnerMarker(dir: string): void {
  const marker: OwnerMarker = { owner: OWNER_ID, formatVersion: OWNER_FORMAT_VERSION };
  fs.writeFileSync(path.join(dir, OWNER_FILE), JSON.stringify(marker, null, 2));
}

/** Каталог, из которого управляемая (нами построенная и провалидированная)
 * генерация должна ЧИТАТЬСЯ — используется и при commit (куда целиться), и при
 * загрузке метаданных consumer'ами (`panel.ts`), чтобы обе стороны сходились
 * на одном и том же каталоге без дублирования этой логики. */
export function resolveManagedCfDir(outPath: string): string {
  const base = path.join(outPath, 'cf');
  const managed = base + MANAGED_SUFFIX;
  if (isOwnedGeneration(managed)) return managed;
  return base;
}

/** Каталог для staging-сборки новой генерации — гарантированно НЕ совпадает ни с
 * одним из возможных текущих managed-каталогов, поэтому пока сборка идёт (в т.ч.
 * если она упадёт на середине), текущая генерация остаётся полностью нетронутой. */
export function stagingDirFor(outPath: string): string {
  const base = path.join(outPath, 'cf');
  return `${base}.building-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Подчищает staging/discard-каталоги, оставшиеся от прежних прерванных сборок.
 * Это безопасно удалить рекурсивно: имя однозначно порождено НАМИ (см.
 * `stagingDirFor`/discard-именование в `commitGeneration`), не пользовательский
 * unowned каталог — §7 запрещает удалять чужое, а не наши временные артефакты. */
export function cleanupStaleSiblings(outPath: string): void {
  const base = path.join(outPath, 'cf');
  const parent = path.dirname(base);
  if (!fs.existsSync(parent)) return;
  const baseName = path.basename(base);
  for (const entry of fs.readdirSync(parent)) {
    if (entry === baseName || entry === baseName + MANAGED_SUFFIX) continue;
    if (entry.startsWith(`${baseName}.building-`) || entry.startsWith(`${baseName}.previous-`)) {
      fs.rmSync(path.join(parent, entry), { recursive: true, force: true });
    }
  }
}

export interface CommitResult {
  /** Итоговый каталог управляемой генерации (см. `resolveManagedCfDir`). */
  targetDir: string;
  /** true, если существующий `cf` не был распознан как наш и потому не тронут —
   * генерация закоммичена в каталог `cf-managed` рядом с ним. */
  redirected: boolean;
}

/**
 * Единственная логическая точка переключения N → N+1 (§6). `stagingDir` уже
 * содержит полностью готовую (включая индекс и маркер владения) генерацию.
 *
 * - target не существует → просто переименовать staging → target (первая сборка,
 *   защищать нечего).
 * - target существует и наш (маркер валиден) → атомарно (для той же файловой
 *   системы) заменить: переименовать текущий в discard-имя, staging → target,
 *   удалить discard. Между двумя rename есть узкое окно, но ни один из вариантов
 *   не теряет данные: до первого rename target = N, после = N+1; в любой момент
 *   существует минимум одна валидная (по маркеру) генерация.
 * - target существует, но НЕ наш → НЕ трогаем его вообще (§7: "unowned directory
 *   never recursive-delete, never silently adopt"); коммитим рядом, в
 *   `target + '-managed'`, по тем же двум правилам выше (та у него ЖЕ может уже
 *   существовать и быть нашей из прошлой сборки).
 */
export function commitGeneration(stagingDir: string, outPath: string): CommitResult {
  const base = path.join(outPath, 'cf');
  const managed = base + MANAGED_SUFFIX;

  const target = fs.existsSync(base) && !isOwnedGeneration(base) ? managed : base;
  const redirected = target === managed;

  if (!fs.existsSync(target)) {
    fs.renameSync(stagingDir, target);
    return { targetDir: target, redirected };
  }
  if (!isOwnedGeneration(target)) {
    // target === managed и managed тоже не наш? Не должно происходить (managed
    // создаётся только этой функцией и всегда маркируется) — но fail-closed:
    // не перезаписываем то, в чём не уверены.
    throw new Error(`Каталог "${target}" существует, но не распознан как управляемый — commit отменён.`);
  }
  const discard = `${target}.previous-${Date.now()}`;
  fs.renameSync(target, discard);
  fs.renameSync(stagingDir, target);
  fs.rmSync(discard, { recursive: true, force: true });
  return { targetDir: target, redirected };
}

/** Дописывает маркер владения в готовый staging-каталог — последний шаг перед
 * commit'ом. Отдельная функция, чтобы вызывающий код мог явно увидеть точку,
 * после которой каталог становится "нашим" и годным для commit. */
export function finalizeStaging(stagingDir: string): void {
  writeOwnerMarker(stagingDir);
}
