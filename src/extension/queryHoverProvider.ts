import * as vscode from 'vscode';
import { findQueryAt, type QueryHit } from './queryAtCursor';
import { findChainAt, describeChain, type ChainDescription } from './hoverFieldInfo';
import { getMetadataResolver } from './metadataResolverCache';
import { OPEN_FROM_RANGE_COMMAND } from './openFromRangeCommand';

/**
 * Hover по цепочке `Псевдоним.Поле[.Поле…]` в литерале запроса `.bsl` — семантическое
 * развитие поверх того же `resolveFieldPath`-ядра, что уже используют
 * `checkFieldPaths` (semanticValidator.ts) и три мигрированных прохода парсера.
 *
 * ИЗВЕСТНОЕ УПРОЩЕНИЕ (документировано, не скрыто): псевдоним ищется по ВСЕМ
 * таблицам пакета сразу, без построения полноценного дерева областей видимости —
 * см. doc-комментарий `hoverFieldInfo.ts`. На практике это верно почти всегда.
 *
 * Fail-open (unknown != invalid): любая неопределённость — неизвестный псевдоним,
 * нерезолвящаяся таблица, `targetUnresolved` (не хватает метаданных, чтобы
 * продолжить путь) — просто НЕ показывает hover, а не показывает ошибочную
 * подсказку. Единственное исключение — `fieldNotFound`: как и в checkFieldPaths,
 * это единственный случай, когда мы УВЕРЕНЫ, что поля не существует.
 *
 * Наведення БУДЬ-ДЕ в межах літерала запиту (не лише на резолвний ланцюжок поля)
 * завжди показує ХОЧ ЯКИЙСЬ hover: коли конкретне поле не резолвиться (курсор на
 * ключовому слові `ВЫБРАТЬ`, комі, `|`, чи fail-open випадок) — фолбек-підказка
 * `genericHint` дає клікабельне command-посилання прямо в тексті hover (звичайний
 * клік, без модифікаторів) на `OPEN_FROM_RANGE_COMMAND`. Це ЄДИНА точка входу —
 * навмисно без DocumentLink/Ctrl+Click: підкреслення DocumentLink неможливо
 * приховати (VS Code завжди малює його поверх діапазону), а hover дає рівноцінний
 * клік без жодної постійної візуальної позначки на тексті запиту.
 */
export class QueryHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly channel: vscode.OutputChannel,
    private readonly resolveCfPath: () => string
  ) {}

  async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
    const source = document.getText();
    const offset = document.offsetAt(position);

    const hit = findQueryAt(source, offset);
    if (!hit) return undefined;

    const chain = findChainAt(source, offset);
    if (chain) {
      try {
        const resolver = await getMetadataResolver(this.resolveCfPath(), this.context, this.channel);
        const description = describeChain(hit.text, resolver, chain.segments.map((s) => s.text));
        const message = buildHoverMessage(chain.hoveredIndex, chain.segments.map((s) => s.text), description);
        if (message) {
          const hovered = chain.segments[chain.hoveredIndex];
          const range = new vscode.Range(document.positionAt(hovered.start), document.positionAt(hovered.end));
          return new vscode.Hover(message, range);
        }
      } catch (e) {
        this.channel.appendLine(vscode.l10n.t('[1C Query] Hover: metadata unavailable: {error}', { error: String(e) }));
      }
    }

    return genericHint(document, hit);
  }
}

/**
 * Фолбек-hover: показується на будь-якій позиції всередині літерала запиту, де
 * `buildHoverMessage` не дав конкретної відповіді про поле (курсор на ключовому
 * слові, комі, `|`, невідомому псевдонімі, тощо) — одне клікабельне посилання,
 * без зайвого пояснювального тексту. `isTrusted` потрібен, інакше VS Code
 * відмовляється виконувати `command:`-лінки з markdown, згенерованого розширенням.
 */
function genericHint(document: vscode.TextDocument, hit: QueryHit): vscode.Hover {
  const args = encodeURIComponent(JSON.stringify({ uri: document.uri.toString(), offset: hit.start }));
  const commandUri = `command:${OPEN_FROM_RANGE_COMMAND}?${args}`;
  const md = new vscode.MarkdownString(`[$(edit) ${vscode.l10n.t('Open in Query Designer')}](${commandUri})`);
  md.supportThemeIcons = true;
  md.isTrusted = true;
  return new vscode.Hover(md);
}

function buildHoverMessage(
  hoveredIndex: number,
  segmentTexts: string[],
  description: ChainDescription
): vscode.MarkdownString | undefined {
  if (hoveredIndex === 0) {
    if (!description.tableFullName) return undefined;
    return new vscode.MarkdownString(vscode.l10n.t('Source: `{table}`', { table: description.tableFullName }));
  }

  if (!description.resolution) return undefined;
  const { resolution } = description;
  const segIdx = hoveredIndex - 1;

  if (segIdx < resolution.resolved.length) {
    const seg = resolution.resolved[segIdx];
    const lines = [`**${seg.field.name}**`];
    if (seg.kind === 'reference') {
      lines.push(
        seg.refTarget
          ? vscode.l10n.t('Reference to: `{table}`', { table: seg.refTarget.fullName })
          : vscode.l10n.t('Reference (target metadata unavailable)')
      );
    }
    return new vscode.MarkdownString(lines.join('\n\n'));
  }

  // Наведённый сегмент лежит в unresolvedTail — сообщаем "не найдено" ТОЛЬКО когда
  // это доказано (fieldNotFound); targetUnresolved — метаданных не хватает, чтобы
  // судить, а не ошибка (unknown != invalid) — молчим, как и в checkFieldPaths.
  if (resolution.stoppedReason !== 'fieldNotFound') return undefined;
  const owner = resolution.resolved.length > 0
    ? resolution.resolved[resolution.resolved.length - 1].refTarget?.fullName
    : description.tableFullName;
  if (!owner) return undefined;
  return new vscode.MarkdownString(
    vscode.l10n.t('Field "{field}" not found in "{table}"', { field: segmentTexts[hoveredIndex], table: owner })
  );
}
