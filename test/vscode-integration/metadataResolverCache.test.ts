/**
 * Extension Host integration: post-release audit P1 №3 — `setMetadataResolver`
 * дозволяє панелі конструктора (`panel.ts`'s `refreshCache`-обробник) явно
 * засіяти кеш hover/completion (`metadataResolverCache.ts`) уже готовою моделлю
 * ОДРАЗУ після успішного «Обновить кэш», без очікування наступної зміни
 * `cfPath` і без повторного парсингу метаданих.
 */
import * as assert from 'assert';
import * as os from 'os';
import * as vscode from 'vscode';
import { getMetadataResolver, setMetadataResolver } from '../../src/extension/metadataResolverCache';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import type { MetaTable } from '../../src/core/metadata/types';

describe('Extension Host: metadataResolverCache.setMetadataResolver', () => {
  it('засіяний резолвер повертається getMetadataResolver ОДРАЗУ, без повторного завантаження', async function () {
    this.timeout(10000);

    // Свідомо неіснуючий шлях: якби кеш НЕ спрацював, getMetadataResolver сам
    // спробував би завантажити метадані звідси і повернув би порожній
    // (0 таблиць) резолвер — нижчі перевірки б провалились.
    const cfPath = '/nonexistent/path/for/setMetadataResolver/test';
    const table: MetaTable = {
      kind: 'Справочник', name: 'Тест', fullName: 'Справочник.Тест',
      fields: [{ name: 'Код', kind: 'standard', types: [{ primitive: 'Строка' }] }],
    };
    const seeded = buildResolverFromTables([table]);
    setMetadataResolver(cfPath, seeded);

    // Кеш-хіт у getMetadataResolver ніколи не звертається ні до context, ні до
    // channel (повертає закешований проміс одразу) — фейкові заглушки без
    // реального vscode.OutputChannel/ExtensionContext достатньо саме для цього шляху.
    const fakeContext = { globalStorageUri: vscode.Uri.file(os.tmpdir()) } as unknown as vscode.ExtensionContext;
    const fakeChannel = { appendLine: () => {} } as unknown as vscode.OutputChannel;

    const resolver = await getMetadataResolver(cfPath, fakeContext, fakeChannel);
    assert.strictEqual(resolver, seeded, 'мало повернутись ТОЧНО те, що засіяли, — не перебудований резолвер');
    assert.ok(resolver.tableByFullName('Справочник.Тест'), 'засіяна таблиця має бути видима одразу');
  });
});
