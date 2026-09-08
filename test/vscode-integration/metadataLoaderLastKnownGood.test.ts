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
    const snapshotFile = path.join(outPath, 'snapshot', 'cf', 'metadata-snapshot.json');

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

      // Post-release RE-audit: раньше 0-табличный результат ВСЁ РАВНО
      // коммитился как новый "текущий" снимок — следующий вызов тепло вернул
      // бы именно ЕГО навсегда (`direct-snapshot-cached`), даже не заглядывая
      // в last-known-good. Теперь ничего не должно было закоммититься вообще.
      assert.strictEqual(fs.existsSync(snapshotFile), false, 'пустой результат не должен был закоммититься как новый "текущий" снимок');

      // Восстанавливаем реальные данные — третий вызов должен СНОВА увидеть
      // таблицы, а не "залипнуть" на пустом результате навсегда.
      fs.cpSync(path.join(FIXTURE_CF, 'Catalogs'), path.join(cfPath, 'Catalogs'), { recursive: true });
      fs.cpSync(path.join(FIXTURE_CF, 'Documents'), path.join(cfPath, 'Documents'), { recursive: true });
      const third = await loadMetadata(cfPath, outPath, fakeContext, channel);
      assert.ok(third.tables.length > 0, 'после восстановления реальных данных третий вызов должен снова увидеть таблицы');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
