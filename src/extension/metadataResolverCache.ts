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
let cached: { cfPath: string; resolverPromise: Promise<MetadataResolver> } | undefined;

export function getMetadataResolver(
  cfPath: string,
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel
): Promise<MetadataResolver> {
  if (cached && cached.cfPath === cfPath) return cached.resolverPromise;
  const outPath = resolveOutPath(context);
  const resolverPromise = loadMetadata(cfPath, outPath, context, channel).then((model) =>
    buildResolverFromTables(model.tables)
  );
  cached = { cfPath, resolverPromise };
  return resolverPromise;
}

/**
 * Явно засеивает кэш уже готовым резолвером — вызывается после успешного
 * «Обновить кэш» в уже открытой панели конструктора (см. panel.ts), чтобы
 * следующий hover/completion сразу видел свежие метаданные, без повторного
 * парсинга (модель уже построена панелью) и без ожидания следующего изменения
 * `cfPath`.
 */
export function setMetadataResolver(cfPath: string, resolver: MetadataResolver): void {
  cached = { cfPath, resolverPromise: Promise.resolve(resolver) };
}
