import * as vscode from 'vscode';
import { resolveOutPath, loadMetadata } from './metadataLoader';
import { buildResolverFromTables } from '../core/metadata/buildModelResolver';
import type { MetadataResolver } from '../core/query/metadataResolver';

/**
 * Единственный кэш `MetadataResolver` в extension host (для панели конструктора
 * резолвер строится заново на webview-стороне из уже переданных `MetaTable[]` — см.
 * App.tsx/ConstructorView.tsx — а не здесь). Hover-провайдеру (queryHoverProvider.ts)
 * резолвер нужен ДО открытия любой панели, поэтому строится независимо.
 *
 * ИЗВЕСТНОЕ УПРОЩЕНИЕ (документировано): кэш НЕ отслеживает изменения файлов
 * метаданных на диске между запросами hover сам по себе (полный пересчёт
 * `newestMtime` по всей выгрузке на КАЖДЫЙ hover был бы заметной задержкой на
 * реальных конфигурациях с тысячами файлов — а hover это лишь advisory-подсказка,
 * unknown != invalid, не более того). Но «Обновить кэш» из уже открытой панели
 * конструктора (post-release audit P1 №3) ТЕПЕРЬ подхватывается явно —
 * `createPanel` вызывает `setMetadataResolver` сразу после успешного rebuild
 * (см. panel.ts), передавая уже готовую модель без повторного парсинга.
 */
interface CacheEntry {
  cfPath: string;
  resolverPromise: Promise<MetadataResolver>;
  /** Set once the load has finished (C41 1b: `peekMetadataResolver`). */
  resolved?: MetadataResolver;
}

let cached: CacheEntry | undefined;

/**
 * C41 1b: the cached resolver changed (a load finished, the panel seeded or refreshed
 * it, the metadata path changed). Editor diagnostics re-check open documents on it;
 * they never start a load themselves.
 */
const changed = new vscode.EventEmitter<void>();
export const onDidChangeMetadataResolver: vscode.Event<void> = changed.event;

function store(entry: CacheEntry | undefined): void {
  cached = entry;
  changed.fire();
}

export function getMetadataResolver(
  cfPath: string,
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel
): Promise<MetadataResolver> {
  if (cached && cached.cfPath === cfPath) return cached.resolverPromise;
  const outPath = resolveOutPath(context);
  const entry: CacheEntry = {
    cfPath,
    resolverPromise: loadMetadata(cfPath, outPath, context, channel).then((model) => {
      const resolver = buildResolverFromTables(model.tables);
      // A load replaced meanwhile (another path, a seeded resolver) must not overwrite
      // the newer entry or announce itself.
      if (cached === entry) {
        entry.resolved = resolver;
        changed.fire();
      }
      return resolver;
    }),
  };
  cached = entry;
  return entry.resolverPromise;
}

/**
 * Явно засеивает кэш уже готовым резолвером — вызывается после успешного
 * «Обновить кэш» в уже открытой панели конструктора (см. panel.ts), чтобы
 * следующий hover/completion сразу видел свежие метаданные, без повторного
 * парсинга (модель уже построена панелью) и без ожидания следующего изменения
 * `cfPath`.
 */
export function setMetadataResolver(cfPath: string, resolver: MetadataResolver): void {
  store({ cfPath, resolverPromise: Promise.resolve(resolver), resolved: resolver });
}

/**
 * C41 1b: the designer panel's own first load seeds the cache when it holds nothing for
 * `cfPath`, so diagnostics see the same snapshot as the panel; an entry for the same
 * path (loaded by hover/completion or a refresh) is kept. `build` runs only then.
 */
export function offerMetadataResolver(cfPath: string, build: () => MetadataResolver): void {
  if (cached?.cfPath === cfPath) return;
  const resolver = build();
  store({ cfPath, resolverPromise: Promise.resolve(resolver), resolved: resolver });
}

/** C41 1b: the resolver whose load has finished, without starting one. */
export function peekMetadataResolver(): MetadataResolver | undefined {
  return cached?.resolved;
}

/** C41 1b: drops the cached resolver when the metadata path is no longer `cfPath`. */
export function retainMetadataResolverFor(cfPath: string): void {
  if (cached && cached.cfPath !== cfPath) store(undefined);
}
