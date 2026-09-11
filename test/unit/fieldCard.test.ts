import { describe, it, expect } from 'vitest';
import { buildFieldCard, renderFieldCardMarkdown } from '../../src/core/metadata/fieldCard';
import type { MetaField, MetaTable, TableKind } from '../../src/core/metadata/types';

function field(partial: Partial<MetaField> & Pick<MetaField, 'types'>): MetaField {
  return { name: 'X', kind: 'attribute', ...partial };
}

describe('buildFieldCard: примитивные типы', () => {
  it('Строка без length', () => {
    const card = buildFieldCard(field({ types: [{ primitive: 'Строка' }] }));
    expect(card.typeLabel).toBe('Строка');
    expect(card.target).toBeUndefined();
    expect(card.structure).toBeUndefined();
  });

  it('Строка с length', () => {
    const card = buildFieldCard(field({ types: [{ primitive: 'Строка', length: 150 }] }));
    expect(card.typeLabel).toBe('Строка(150)');
  });

  it('Число с precision и scale', () => {
    const card = buildFieldCard(field({ types: [{ primitive: 'Число', digits: 15, fractionDigits: 2 }] }));
    expect(card.typeLabel).toBe('Число(15,2)');
  });

  it('Дата', () => {
    expect(buildFieldCard(field({ types: [{ primitive: 'Дата' }] })).typeLabel).toBe('Дата');
  });

  it('Булево', () => {
    expect(buildFieldCard(field({ types: [{ primitive: 'Булево' }] })).typeLabel).toBe('Булево');
  });

  it('unknown/raw тип: чесний fallback, без Объект/Структура', () => {
    const card = buildFieldCard(field({ types: [{ raw: 'timestamp' }] }));
    expect(card.typeLabel).toBe('timestamp');
    expect(card.target).toBeUndefined();
    expect(card.structure).toBeUndefined();
  });
});

describe('buildFieldCard: ссылочные типы — по каждому реферабельному TableKind', () => {
  const REF_KINDS: TableKind[] = [
    'Справочник', 'Документ', 'Перечисление',
    'ПланВидовХарактеристик', 'ПланСчетов', 'ПланВидовРасчета',
    'ПланОбмена', 'БизнесПроцесс', 'Задача',
  ];

  it.each(REF_KINDS)('%s: Тип=Ссылка, Объект=<kind>.<name>', (kind) => {
    const card = buildFieldCard(field({ types: [{ ref: { kind, name: 'Тест' } }] }));
    expect(card.typeLabel).toBe('Ссылка');
    expect(card.target).toBe(`${kind}.Тест`);
  });

  it('reference с resolvable target: заповнюються Структура і Поля', () => {
    const target: MetaTable = {
      kind: 'Справочник',
      name: 'КлассификаторЕдиницИзмерений',
      fullName: 'Справочник.КлассификаторЕдиницИзмерений',
      fields: [
        { name: 'Ссылка', kind: 'standard', types: [] },
        { name: 'Код', kind: 'attribute', types: [{ primitive: 'Строка' }] },
        { name: 'Наименование', kind: 'attribute', types: [{ primitive: 'Строка' }] },
        { name: 'МеждународноеСокращение', kind: 'attribute', types: [{ primitive: 'Строка' }] },
      ],
      tabularSections: [],
    };
    const resolve = (fullName: string) => (fullName === target.fullName ? target : undefined);

    const card = buildFieldCard(
      field({ name: 'БазоваяЕдиницаИзмерения', types: [{ ref: { kind: 'Справочник', name: 'КлассификаторЕдиницИзмерений' } }] }),
      resolve
    );
    expect(card.structure).toEqual({ attributes: 3, tabularSections: 0 });
    expect(card.fieldsPreview).toEqual(['Код', 'Наименование', 'МеждународноеСокращение']);
  });

  it('reference с unresolved target: Тип/Объект є, Структура/Поля відсутні', () => {
    const card = buildFieldCard(
      field({ types: [{ ref: { kind: 'Справочник', name: 'НемаєТакогоВМетаданих' } }] }),
      () => undefined
    );
    expect(card.typeLabel).toBe('Ссылка');
    expect(card.target).toBe('Справочник.НемаєТакогоВМетаданих');
    expect(card.structure).toBeUndefined();
    expect(card.fieldsPreview).toBeUndefined();
  });

  it('resolvable target без атрибутів: Структура є (0 реквизитов), Поля відсутні', () => {
    const target: MetaTable = {
      kind: 'Перечисление', name: 'X', fullName: 'Перечисление.X',
      fields: [{ name: 'Ссылка', kind: 'standard', types: [] }],
    };
    const card = buildFieldCard(
      field({ types: [{ ref: { kind: 'Перечисление', name: 'X' } }] }),
      (fn) => (fn === target.fullName ? target : undefined)
    );
    expect(card.structure).toEqual({ attributes: 0, tabularSections: 0 });
    expect(card.fieldsPreview).toBeUndefined();
  });

  it('превʼю полів обрізається і додає "…" при перевищенні ліміту', () => {
    const manyFields: MetaField[] = Array.from({ length: 10 }, (_, i) => ({
      name: `Поле${i + 1}`,
      kind: 'attribute' as const,
      types: [{ primitive: 'Строка' as const }],
    }));
    const target: MetaTable = { kind: 'Справочник', name: 'X', fullName: 'Справочник.X', fields: manyFields };
    const card = buildFieldCard(
      field({ types: [{ ref: { kind: 'Справочник', name: 'X' } }] }),
      (fn) => (fn === target.fullName ? target : undefined)
    );
    expect(card.structure!.attributes).toBe(10);
    expect(card.fieldsPreview).toHaveLength(9); // 8 имён + "…"
    expect(card.fieldsPreview![8]).toBe('…');
  });
});

describe('buildFieldCard: составные типы', () => {
  it('составной: примитив + ссылка — Тип=Составной, Варианты перечисляет оба', () => {
    const card = buildFieldCard(
      field({ types: [{ primitive: 'Строка' }, { ref: { kind: 'Справочник', name: 'Партнеры' } }] })
    );
    expect(card.typeLabel).toBe('Составной');
    expect(card.variants).toEqual(['Строка', 'Справочник.Партнеры']);
    expect(card.target).toBeUndefined();
    expect(card.structure).toBeUndefined();
  });

  it('составной: несколько ссылок', () => {
    const card = buildFieldCard(
      field({
        types: [
          { ref: { kind: 'Справочник', name: 'Контрагенты' } },
          { ref: { kind: 'Справочник', name: 'Партнеры' } },
        ],
      })
    );
    expect(card.typeLabel).toBe('Составной');
    expect(card.variants).toEqual(['Справочник.Контрагенты', 'Справочник.Партнеры']);
  });
});

describe('buildFieldCard: Вид (kind → kindLabel)', () => {
  it('standard → Стандартный реквизит', () => {
    expect(buildFieldCard(field({ kind: 'standard', types: [{ primitive: 'Строка' }] })).kindLabel).toBe(
      'Стандартный реквизит'
    );
  });
  it('attribute → Реквизит', () => {
    expect(buildFieldCard(field({ kind: 'attribute', types: [{ primitive: 'Строка' }] })).kindLabel).toBe('Реквизит');
  });
  it('dimension → Измерение', () => {
    expect(buildFieldCard(field({ kind: 'dimension', types: [{ primitive: 'Строка' }] })).kindLabel).toBe('Измерение');
  });
  it('resource → Ресурс', () => {
    expect(buildFieldCard(field({ kind: 'resource', types: [{ primitive: 'Строка' }] })).kindLabel).toBe('Ресурс');
  });
});

describe('buildFieldCard: synonym', () => {
  it('присутній, коли є в MetaField', () => {
    const card = buildFieldCard(field({ types: [{ primitive: 'Строка' }], synonym: 'Артикул товара' }));
    expect(card.synonym).toBe('Артикул товара');
  });
  it('відсутній, коли немає в MetaField (не порожній рядок)', () => {
    const card = buildFieldCard(field({ types: [{ primitive: 'Строка' }] }));
    expect(card.synonym).toBeUndefined();
  });
});

describe('renderFieldCardMarkdown', () => {
  it('простий примітив: тільки Тип і Вид', () => {
    const md = renderFieldCardMarkdown(buildFieldCard(field({ types: [{ primitive: 'Строка', length: 150 }] })));
    expect(md).toContain('**Тип**: Строка(150)');
    expect(md).toContain('**Вид**: Реквизит');
    expect(md).not.toContain('**Объект**');
    expect(md).not.toContain('**Наименование**');
    expect(md).not.toContain('**Структура**');
  });

  it('reference с resolved target: усі рядки присутні', () => {
    const target: MetaTable = {
      kind: 'Справочник', name: 'Y', fullName: 'Справочник.Y',
      fields: [{ name: 'Код', kind: 'attribute', types: [{ primitive: 'Строка' }] }],
    };
    const card = buildFieldCard(
      field({ types: [{ ref: { kind: 'Справочник', name: 'Y' } }], synonym: 'Тестовое поле' }),
      (fn) => (fn === target.fullName ? target : undefined)
    );
    const md = renderFieldCardMarkdown(card);
    expect(md).toContain('**Наименование**: Тестовое поле');
    expect(md).toContain('**Тип**: Ссылка');
    expect(md).toContain('**Объект**: `Справочник.Y`');
    expect(md).toContain('**Структура**: 1 реквизитов · 0 табличных частей');
    expect(md).toContain('**Поля**: Код');
  });

  it('составной: рядок Варианты присутній', () => {
    const md = renderFieldCardMarkdown(
      buildFieldCard(field({ types: [{ primitive: 'Строка' }, { ref: { kind: 'Справочник', name: 'Партнеры' } }] }))
    );
    expect(md).toContain('**Варианты**:');
    expect(md).toContain('- Строка');
    expect(md).toContain('- Справочник.Партнеры');
  });
});
