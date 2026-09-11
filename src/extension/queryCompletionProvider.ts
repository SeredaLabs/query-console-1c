import * as vscode from 'vscode';
import { findQueryAt, rawOffsetToQueryTextOffset } from './queryAtCursor';
import { findChainForCompletion, resolveCompletionTarget } from './hoverFieldInfo';
import { getMetadataResolver } from './metadataResolverCache';
import { describeFieldTypes } from '../core/metadata/describeType';

/**
 * Автодоповнення полів після крапки (`Псевдонім.|`, `Псевдонім.Поле.|`) у літералі
 * запиту `.bsl` — той самий `resolveFieldPath`-фундамент, що вже використовують
 * hover (`queryHoverProvider.ts`) і `checkFieldPaths` (semanticValidator.ts).
 *
 * Phase 3e (semantic-core roadmap): голова ланцюжка резолвиться позиційно-
 * усвідомленим `resolveAliasAt` (той самий шлях, що й hover з Phase 3d) —
 * `rawOffsetToQueryTextOffset` перекладає офсет курсора з сирого документа в
 * координати `hit.text`, спільні з `resolveHeadTable` (`hoverFieldInfo.ts`).
 *
 * ІЗВЕСТНОЕ УПРОЩЕНИЕ (документовано, як і для hover): доповнюються лише поля
 * ПІСЛЯ крапки за вже відомим псевдонімом джерела — самі псевдоніми таблиць
 * (`ИЗ Справ|`) і ключові слова SDBL тут НЕ доповнюються, це окрема задача.
 *
 * Fail-open: якщо префікс не резолвиться (невідомий псевдонім, шлях проходить
 * через скалярне поле, метаданих немає) — просто не пропонує варіантів, а не
 * вгадує їх.
 */
export class QueryCompletionProvider implements vscode.CompletionItemProvider {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly channel: vscode.OutputChannel,
    private readonly resolveCfPath: () => string
  ) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[] | undefined> {
    const source = document.getText();
    const offset = document.offsetAt(position);

    const hit = findQueryAt(source, offset);
    if (!hit) return undefined;

    const chain = findChainForCompletion(source, offset);
    if (!chain) return undefined;

    let resolver;
    try {
      resolver = await getMetadataResolver(this.resolveCfPath(), this.context, this.channel);
    } catch (e) {
      this.channel.appendLine(vscode.l10n.t('[1C Query] Completion: metadata unavailable: {error}', { error: String(e) }));
      return undefined;
    }

    const headPosition = rawOffsetToQueryTextOffset(source, hit, chain[0].start);
    const target = resolveCompletionTarget(hit.text, resolver, chain.map((s) => s.text), headPosition);
    if (!target) return undefined;

    return target.meta.fields.map((field) => {
      const isReference = field.types.some((t) => t.ref);
      const item = new vscode.CompletionItem(
        field.name,
        isReference ? vscode.CompletionItemKind.Reference : vscode.CompletionItemKind.Field
      );
      const typeText = describeFieldTypes(field);
      if (typeText) item.detail = typeText;
      return item;
    });
  }
}
