import * as path from 'path';
const ROOT = process.argv[2];
const { parseBatch } = require(path.join(ROOT, 'src/core/query/sdblParser.ts'));
const { generateBatch } = require(path.join(ROOT, 'src/core/query/sdblGenerator.ts'));
const { findUnsafeVirtualTables } = require(path.join(ROOT, 'src/core/query/semanticValidator.ts'));
for (const q of [
  'ВЫБРАТЬ Т.Товар ИЗ РегистрНакопления.Продажи.Обороты(&Н, &К, Месяц, Товар = &Т, &Лишний) КАК Т',
  'ВЫБРАТЬ Т.Товар ИЗ РегистрНакопления.Остатки.ОстаткиИОбороты(&Н, &К, Месяц, Движения, Товар = &Т, &Лишний) КАК Т',
  'ВЫБРАТЬ Т.Товар ИЗ РегистрНакопления.Остатки.Остатки(&П, Товар = &Т, &Лишний) КАК Т',
  'ВЫБРАТЬ Т.Период ИЗ Последовательность.Посл.Границы(&П, ВидГраницы, Условие) КАК Т',
]) {
  const d = parseBatch(q);
  const g = generateBatch(d);
  console.log(JSON.stringify({ in: q, gen: g.replace(/\s+/g, ' '), lostLishniy: q.includes('Лишний') && !g.includes('Лишний'), unsafe: findUnsafeVirtualTables(d) }));
}
