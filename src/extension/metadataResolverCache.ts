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
 * ИЗВЕСТНОЕ УПРОЩЕНИЕ (документировано): кэш обновляется только когда меняется
 * САМ путь `cfPath` (настройка queryConsole.metadataPath / автоопределение) —
 * не отслеживает изменения файлов метаданных на диске между запросами hover,
 * и не подхватывает «Обновить кэш» из уже открытой панели конструктора. Полный
 * пересчёт `newestMtime` по всей выгрузке метаданных на КАЖДЫЙ hover был бы
 * заметной задержкой на реальных конфигурациях с тысячами файлов — а hover это
 * лишь advisory-подсказка (unknown != invalid), не более того;
 * пользователь всегда может перезапустить редактор для полного обновления.
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
