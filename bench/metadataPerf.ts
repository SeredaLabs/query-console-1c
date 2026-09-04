/**
 * Performance baseline (ТЗ v2.1 §44/§45, PR-03) — измеряет реальные величины,
 * НЕ принимает архитектурных решений. Живёт вне production runtime (§45:
 * "Измерительный инструментарий по возможности хранится вне production
 * runtime: bench/, scripts/, test harness") — ничего отсюда не импортируется
 * из src/extension или src/webview.
 *
 * Каждая измеренная категория документирует: метрику, воркload, и (если нет
 * представительных данных) явную границу — вместо того, чтобы измерять
 * нерепрезентативную мелкую фикстуру и выдавать это за факт (ТЗ §19: "не
 * изобретаем требования", в т.ч. не изобретаем ложную репрезентативность).
 *
 * Запуск: npx tsx bench/metadataPerf.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { loadMetadataCached, rebuildModelCache, modelCachePath } from '../src/core/metadata/modelCache';
import { parseBatch } from '../src/core/query/sdblParser';
import { generateBatch } from '../src/core/query/sdblGenerator';
import { buildYamlResolver } from '../src/core/metadata/buildYamlResolver';

const CORPUS_DIR = path.resolve(__dirname, '../test/fixtures/corpus');
const REAL_CF_YAML = path.join(CORPUS_DIR, 'metadata', 'cf'); // 558 объектов, БСП — реальная представительная конфигурация
const GOLDEN = path.join(CORPUS_DIR, 'golden.jsonl');
const SMALL_CF_XML = path.resolve(__dirname, '../test/fixtures/cf'); // 2 объекта — НЕ репрезентативно, только для честности замера

interface Golden { file: string; input: string; query_text: string; }

function ms(fn: () => void): number {
  const t = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - t) / 1e6;
}

function heapDeltaMb(fn: () => void): number {
  if (global.gc) global.gc();
  const before = process.memoryUsage().heapUsed;
  fn();
  const after = process.memoryUsage().heapUsed;
  return (after - before) / (1024 * 1024);
}

function section(title: string): void {
  console.log(`\n## ${title}`);
}

function main(): void {
  console.log('# Performance baseline — ' + new Date().toISOString().slice(0, 10));
  console.log(`Node: ${process.version}; --expose-gc: ${global.gc ? 'да (heap-числа надёжнее)' : 'нет (heap — оценка, без gc() перед замером)'}`);

  // Защита от «протёкшего» кэша с прошлого прогона — иначе «cold-from-YAML» тихо
  // подхватывает старый JSON model-cache и даёт ложно-быстрое число (реально
  // произошло при первой версии этого скрипта — она чистила неверный путь).
  const cachePath = modelCachePath(REAL_CF_YAML);
  if (fs.existsSync(cachePath)) fs.rmSync(cachePath);

  section('1. Metadata cold build (XML → YAML, parseConfiguration)');
  console.log(
    'НЕТ представительных данных: в репозитории нет реальной XML-выгрузки конфигурации ' +
    '(CONFIG_DIR=src/cf по умолчанию не существует на чистом checkout — см. docs/corpus-testing.md). ' +
    `Единственная XML-фикстура — ${SMALL_CF_XML} (2 объекта), измерение на ней было бы ложной репрезентативностью. ` +
    'Требует внешнего/ручного замера на реальной выгрузке — не измерено здесь.'
  );

  section('2. Metadata warm/cold-from-YAML load (loadMetadataCached, 558 объектов БСП)');
  // Первый вызов на каталоге без model-cache.json — реальный cold-from-YAML разбор.
  // Второй вызов — реальный warm (JSON model-cache уже на диске).
  let tables = 0;
  const coldFromYamlMs = ms(() => { tables = loadMetadataCached(REAL_CF_YAML).tables.length; });
  const warmMs = ms(() => { loadMetadataCached(REAL_CF_YAML); });
  console.log(`cold-from-YAML (нет model-cache.json): ${coldFromYamlMs.toFixed(1)} мс, ${tables} таблиц`);
  console.log(`warm (JSON model-cache есть):          ${warmMs.toFixed(1)} мс`);
  // rebuildModelCache — путь refreshCache (панель уже открыта, пользователь обновил кэш).
  const rebuildMs = ms(() => { rebuildModelCache(REAL_CF_YAML); });
  console.log(`rebuildModelCache (refreshCache path): ${rebuildMs.toFixed(1)} мс`);
  // Подчистка JSON model-cache.json, который loadMetadataCached создал рядом с
  // фикстурой — bench не должен оставлять сгенерированные файлы в test/fixtures.
  if (fs.existsSync(cachePath)) fs.rmSync(cachePath);

  section('3. Heap (тот же воркload, что и раздел 2)');
  const heapMb = heapDeltaMb(() => { loadMetadataCached(REAL_CF_YAML); });
  console.log(`heapUsed delta для полной загрузки 558-объектной модели: ${heapMb.toFixed(2)} МиБ`);
  if (fs.existsSync(cachePath)) fs.rmSync(cachePath);

  section('4. Extension Host blocking (ТЗ §43)');
  console.log(
    'Отдельно не измеряется — код прочитан напрямую (не замер): `loadMetadata` в panel.ts ' +
    'помечена `async`, но НЕ содержит ни одного `await` в своём теле; весь путь — синхронные ' +
    'fs-вызовы + синхронный разбор. Значит числа раздела 2 ЯВЛЯЮТСЯ длительностью блокировки ' +
    'Extension Host (весь вызов выполняется в одном тике до возврата в event loop).'
  );

  section('5. WebView payload (полное MetaTable[] в postMessage, panel.ts:144)');
  const model = loadMetadataCached(REAL_CF_YAML);
  if (fs.existsSync(cachePath)) fs.rmSync(cachePath);
  const payload = JSON.stringify(model.tables);
  console.log(`Размер payload (558 объектов БСП): ${(payload.length / 1024).toFixed(0)} КиБ (${payload.length} байт)`);
  const bundlePath = path.resolve(__dirname, '../out/webview/main.js');
  if (fs.existsSync(bundlePath)) {
    console.log(`out/webview/main.js (сборочный артефакт, не коммитится): ${(fs.statSync(bundlePath).size / 1024 / 1024).toFixed(2)} МиБ`);
  } else {
    console.log('out/webview/main.js отсутствует — нужен npm run build:webview перед этим разделом.');
  }

  section('6. Representative parse/generate (весь золотой корпус, 1976 запросов)');
  const golden: Golden[] = fs.readFileSync(GOLDEN, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  const resolver = buildYamlResolver(REAL_CF_YAML);
  const perEntryMs: Array<{ file: string; ms: number; lines: number }> = [];
  const totalMs = ms(() => {
    for (const g of golden) {
      const t = process.hrtime.bigint();
      generateBatch(parseBatch(g.input, resolver));
      perEntryMs.push({ file: g.file, ms: Number(process.hrtime.bigint() - t) / 1e6, lines: g.input.split('\n').length });
    }
  });
  perEntryMs.sort((a, b) => b.ms - a.ms);
  const largestByLines = [...golden].sort((a, b) => b.input.split('\n').length - a.input.split('\n').length)[0];
  console.log(`Весь корпус (1976 запросов): ${totalMs.toFixed(0)} мс суммарно, ${(totalMs / golden.length).toFixed(3)} мс/запрос в среднем`);
  console.log(`Самый медленный запрос: ${perEntryMs[0].file} — ${perEntryMs[0].ms.toFixed(2)} мс (${perEntryMs[0].lines} строк)`);
  const largestEntryMs = perEntryMs.find(e => e.file === largestByLines.file);
  console.log(
    `Самый длинный запрос по строкам: ${largestByLines.file} — ${largestByLines.input.split('\n').length} строк, ` +
    `${largestByLines.input.length} симв., ${largestEntryMs?.ms.toFixed(2)} мс ` +
    `(длина в строках НЕ коррелирует напрямую со временем — самый длинный не самый медленный)`
  );

  console.log('\n(Итоговые числа этого прогона — в docs/PERFORMANCE_BASELINE.md; см. дату вверху отчёта.)');
}

main();
