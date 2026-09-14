import * as vscode from 'vscode';
import { findQueryAt, rawOffsetToQueryTextOffset, type QueryHit } from './queryAtCursor';
import {
  findChainAt, describeChain, describeVirtualTableArg, describeVirtualTableConditionFieldChain,
  type ChainDescription, type VirtualTableConditionFieldChain,
} from './hoverFieldInfo';
import type { VirtualTableOutputFieldInfo } from '../core/metadata/virtualTableOutputField';
import type { FieldPathResolution } from '../core/query/fieldPathResolver';
import { getMetadataResolver } from './metadataResolverCache';
import { OPEN_FROM_RANGE_COMMAND } from './openFromRangeCommand';

/**
 * Hover по цепочке `Псевдоним.Поле[.Поле…]` в литерале запроса `.bsl` — семантическое
 * развитие поверх того же `resolveFieldPath`-ядра, что уже используют
 * `checkFieldPaths` (semanticValidator.ts) и три мигрированных прохода парсера.
 *
 * Phase 3d (semantic-core roadmap): псевдонім голови ланцюжка резолвиться
 * позиційно-усвідомленим `resolveAliasAt` (реальна видимість JOIN/підзапиту,
 * live-verified проти справжнього 1С) — див. doc-коментар `hoverFieldInfo.ts`.
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
        const headPosition = rawOffsetToQueryTextOffset(source, hit, chain.segments[0].start);
        const segmentTexts = chain.segments.map((s) => s.text);

        // Phase 2x-2, increment 2: a bare identifier inside a virtual-table
        // `Условие`/`УсловиеСчета`/etc. argument names a field of the
        // REGISTER ITSELF, not a source alias — try this FIRST, since
        // `describeChain`'s alias-based resolution would just fail (chain[0]
        // is never a real alias here) and fall through to nothing anyway.
        const vtField = describeVirtualTableConditionFieldChain(hit.text, resolver, segmentTexts, headPosition);
        if (vtField) {
          const message = buildVirtualTableFieldHoverMessage(chain.hoveredIndex, segmentTexts, vtField);
          if (message) {
            const hovered = chain.segments[chain.hoveredIndex];
            const range = new vscode.Range(document.positionAt(hovered.start), document.positionAt(hovered.end));
            return new vscode.Hover(message, range);
          }
        }

        const description = describeChain(hit.text, resolver, segmentTexts, headPosition);
        const message = buildHoverMessage(chain.hoveredIndex, segmentTexts, description);
        if (message) {
          const hovered = chain.segments[chain.hoveredIndex];
          const range = new vscode.Range(document.positionAt(hovered.start), document.positionAt(hovered.end));
          return new vscode.Hover(message, range);
        }
      } catch (e) {
        this.channel.appendLine(vscode.l10n.t('[1C Query] Hover: metadata unavailable: {error}', { error: String(e) }));
      }
    }

    // Phase 2x-2 (semantic-core roadmap, memory: project-semantic-core-roadmap):
    // virtual-table positional-argument hover — a SEPARATE check from the
    // chain-based one above, since an argument can be `&Параметр` (lexed as a
    // distinct token type, never an identifier chain `findChainAt` would find)
    // or a whole condition expression, not just a bare alias/field reference.
    try {
      const resolver = await getMetadataResolver(this.resolveCfPath(), this.context, this.channel);
      const queryPosition = rawOffsetToQueryTextOffset(source, hit, offset);
      if (queryPosition !== undefined) {
        const arg = describeVirtualTableArg(hit.text, resolver, queryPosition);
        if (arg) {
          const md = new vscode.MarkdownString(
            vscode.l10n.t('**{param}** — parameter of `{table}`', { param: arg.param.name, table: arg.tableFullName })
          );
          return new vscode.Hover(md);
        }
      }
    } catch (e) {
      this.channel.appendLine(vscode.l10n.t('[1C Query] Hover: metadata unavailable: {error}', { error: String(e) }));
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
  const segIdx = hoveredIndex - 1;
  // The output-field enrichment (base resource + suffix) only ever applies to
  // the FIRST segment after the head alias — that's the only one that's
  // literally a field of the virtual table itself; any further dereference
  // (`Т.Товар.Наименование`) walks into a DIFFERENT table's own real fields.
  const virtualTableField = segIdx === 0 ? description.virtualTableField : undefined;
  return describeFieldPathSegment(description.resolution, segIdx, segmentTexts[hoveredIndex], description.tableFullName, virtualTableField);
}

/**
 * Phase 2x-2, increment 2: a virtual-table `Условие`/etc. argument has NO
 * alias segment at all — the whole chain (including index 0) names fields of
 * the register directly, so unlike `buildHoverMessage` there is no special
 * "index 0 is the source" case; every index maps straight into
 * `resolution.resolved`/`unresolvedTail`.
 */
function buildVirtualTableFieldHoverMessage(
  hoveredIndex: number,
  segmentTexts: string[],
  vtField: VirtualTableConditionFieldChain
): vscode.MarkdownString | undefined {
  return describeFieldPathSegment(vtField.resolution, hoveredIndex, segmentTexts[hoveredIndex], vtField.registerFullName);
}

/**
 * Shared rendering for a single chain segment already resolved (or proven
 * not-found) via `resolveFieldPath` — extracted so `buildHoverMessage`
 * (alias-headed chains) and `buildVirtualTableFieldHoverMessage` (headless
 * register-field chains) don't duplicate the resolved/reference/not-found
 * rendering, differing only in how the segment INDEX maps into
 * `resolution.resolved` and what "owner" fallback name to report for a
 * not-found FIRST segment.
 */
function describeFieldPathSegment(
  resolution: FieldPathResolution,
  segIdx: number,
  segmentText: string,
  headFullName: string | undefined,
  virtualTableField?: VirtualTableOutputFieldInfo
): vscode.MarkdownString | undefined {
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
    if (virtualTableField) {
      lines.push(vscode.l10n.t('Base resource: `{base}`', { base: virtualTableField.baseFieldName }));
    }
    return new vscode.MarkdownString(lines.join('\n\n'));
  }

  // Наведённый сегмент лежит в unresolvedTail — сообщаем "не найдено" ТОЛЬКО когда
  // это доказано (fieldNotFound); targetUnresolved — метаданных не хватает, чтобы
  // судить, а не ошибка (unknown != invalid) — молчим, как и в checkFieldPaths.
  if (resolution.stoppedReason !== 'fieldNotFound') return undefined;
  const owner = resolution.resolved.length > 0
    ? resolution.resolved[resolution.resolved.length - 1].refTarget?.fullName
    : headFullName;
  if (!owner) return undefined;
  return new vscode.MarkdownString(
    vscode.l10n.t('Field "{field}" not found in "{table}"', { field: segmentText, table: owner })
  );
}
