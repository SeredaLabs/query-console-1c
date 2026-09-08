/**
 * Extension Host integration: post-release audit P1 №6 — `loadMetadata`
 * (metadataLoader.ts) не должен позволять случайному rebuild с 0 таблиц
 * (например, временно опустевший каталог экспорта, но с уцелевшим
 * `Configuration.xml`) затирать last-known-good, накопленный предыдущей
 * УСПЕШНОЙ сборкой — иначе один такой сбой убивает единственную страховку
 * для ВСЕХ последующих открытий.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { loadMetadata } from '../../src/extension/metadataLoader';
import { readLastKnownGood } from '../../src/core/metadata/lastKnownGoodCache';
import { FIXTURE_CF } from './testUtil';

describe('Extension Host: rebuild с 0 таблиц не затирает last-known-good', () => {
  it('Configuration.xml есть, но Catalogs/Documents исчезли — честный пустой результат, last-known-good не тронут', async function () {
    this.timeout(20000);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lkg-empty-rebuild-'));
    const cfPath = path.join(root, 'cf-src');
    fs.cpSync(FIXTURE_CF, cfPath, { recursive: true });
    const outPath = path.join(root, 'out');
    const lkgDir = path.join(root, 'global-storage');
    fs.mkdirSync(lkgDir, { recursive: true });

    const fakeContext = { globalStorageUri: vscode.Uri.file(lkgDir) } as unknown as vscode.ExtensionContext;
    // loadMetadata только вызывает channel.appendLine — лёгкая заглушка вместо
    // реального vscode.OutputChannel, чтобы не зависеть от таймингов его
    // диспоуза near конца прогона тестов (см. metadataResolverCache.test.ts).
    const channel = { appendLine: () => {} } as unknown as vscode.OutputChannel;

    try {
      const first = await loadMetadata(cfPath, outPath, fakeContext, channel);
      assert.ok(first.tables.length > 0, 'первая (реальная) сборка должна дать непустую модель');

      const lkgAfterFirst = readLastKnownGood(lkgDir, cfPath);
      assert.ok(lkgAfterFirst && lkgAfterFirst.model.tables.length > 0, 'last-known-good должен наполниться после успешной сборки');

      // Опустошаем cfPath — Configuration.xml остаётся (структурно валидная
      // выгрузка), но ни Catalogs, ни Documents больше нет. Удаляем уже
      // закоммиченный снимок, чтобы следующий вызов реально пересобрал, а не
      // тепло переиспользовал предыдущий (непустой) результат.
      fs.rmSync(path.join(cfPath, 'Catalogs'), { recursive: true, force: true });
      fs.rmSync(path.join(cfPath, 'Documents'), { recursive: true, force: true });
      fs.rmSync(path.join(outPath, 'snapshot'), { recursive: true, force: true });

      const second = await loadMetadata(cfPath, outPath, fakeContext, channel);
      assert.strictEqual(second.tables.length, 0, 'второй вызов должен честно вернуть 0 таблиц — сам результат не подделывается (unknown != invalid)');

      const lkgAfterSecond = readLastKnownGood(lkgDir, cfPath);
      assert.ok(
        lkgAfterSecond && lkgAfterSecond.model.tables.length > 0,
        'last-known-good НЕ должен быть затёрт пустым результатом'
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
