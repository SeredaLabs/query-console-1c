import * as path from 'path';
const ROOT = process.argv[2];
const { buildSemanticSnapshotFromText } = require(path.join(ROOT, 'src/core/semantic/buildSemanticSnapshot.ts'));
for (const q of ['ВЫБРАТЬ Т.Поле1 Т.Поле2 ИЗ Справочник.Валюты КАК Т', 'ВЫБРАТЬ\n\tТ.Поле1\n\tТ.Поле2\nИЗ\n\tСправочник.Валюты КАК Т', 'ВЫБРАТЬ ИЗ Справочник.Валюты КАК Т', 'ВЫБРАТЬ Т. ИЗ Справочник.Валюты КАК Т', 'ВЫБРАТЬ\n\tТ.\nИЗ\n\tСправочник.Валюты КАК Т'])
  { const s = buildSemanticSnapshotFromText(1, q); console.log(JSON.stringify(q), s.completeness, JSON.stringify(s.model.members[0]?.members[0]?.model.fields.map((f: any) => f.expression ?? f.field))); }
