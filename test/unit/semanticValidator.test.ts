import { describe, it, expect } from 'vitest';
import { parseBatch } from '../../src/core/query/sdblParser';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import { validateBatchSemantics, findUnsafeVirtualTables, findMalformedCustomExpressions } from '../../src/core/query/semanticValidator';
import type { MetaTable } from '../../src/core/metadata/types';

// Инлайн-метаданные (мини-схема). Реальные объекты + виртуальные таблицы
// регистров (с `.virtual`) — чтобы `buildResolverFromTables` развёл их по картам.
const ВАЛЮТЫ: MetaTable = {
  kind: 'Справочник', name: 'Валюты', fullName: 'Справочник.Валюты',
  fields: [{ name: 'ОсновнаяВалюта', kind: 'attribute', types: [] }],
  tabularSections: [
    {
      kind: 'ТабличнаяЧасть', name: 'Курсы', fullName: 'Справочник.Валюты.Курсы',
      fields: [{ name: 'Курс', kind: 'attribute', types: [] }],
    },
  ],
};
const БАНКСЧЕТА: MetaTable = {
  kind: 'Справочник', name: 'БанковскиеСчета', fullName: 'Справочник.БанковскиеСчета',
  fields: [],
};
// Балансовый РН: есть Остатки и ОстаткиИОбороты.
const ОСТАТКИТОВ: MetaTable = {
  kind: 'РегистрНакопления', name: 'ОстаткиТоваров', fullName: 'РегистрНакопления.ОстаткиТоваров.Остатки',
  fields: [], virtual: { slice: 'Остатки', baseFullName: 'РегистрНакопления.ОстаткиТоваров' },
};
const ОСТАТКИТОВ_ИО: MetaTable = {
  kind: 'РегистрНакопления', name: 'ОстаткиТоваров', fullName: 'РегистрНакопления.ОстаткиТоваров.ОстаткиИОбороты',
  fields: [], virtual: { slice: 'ОстаткиИОбороты', baseFullName: 'РегистрНакопления.ОстаткиТоваров' },
};
// Оборотный РН: только Обороты (Остатки неприменим).
const ПРОДАЖИ_ОБ: MetaTable = {
  kind: 'РегистрНакопления', name: 'Продажи', fullName: 'РегистрНакопления.Продажи.Обороты',
  fields: [], virtual: { slice: 'Обороты', baseFullName: 'РегистрНакопления.Продажи' },
};
// РС со срезом последних.
const КУРСЫ_СРЕЗ: MetaTable = {
  kind: 'РегистрСведений', name: 'КурсыВалют', fullName: 'РегистрСведений.КурсыВалют.СрезПоследних',
  fields: [], virtual: { slice: 'СрезПоследних', baseFullName: 'РегистрСведений.КурсыВалют' },
};

// Базовые (2-сегментные) объекты, чьи 3-сегментные подтаблицы НЕ материализуются
// загрузчиком (виртуальные таблицы РР, системные ТочкаМаршрута БП/Задачи).
const РР_НАЧИСЛЕНИЯ: MetaTable = {
  kind: 'РегистрРасчета', name: 'Начисления', fullName: 'РегистрРасчета.Начисления', fields: [],
};
const БП_СОГЛАСОВАНИЕ: MetaTable = {
  kind: 'БизнесПроцесс', name: 'Согласование', fullName: 'БизнесПроцесс.Согласование', fields: [],
};
const ЗАДАЧА_ИСП: MetaTable = {
  kind: 'Задача', name: 'ЗадачаИсполнителя', fullName: 'Задача.ЗадачаИсполнителя', fields: [],
};

// Базовые 2-сегментные регистры (загрузчик материализует базу наряду со срезами) —
// нужны для проверки подтаблиц SUBTABLE_CHECKED_TYPES (резолв базы → судим о срезе).
const РН_ОСТАТКИТОВ_БАЗА: MetaTable = {
  kind: 'РегистрНакопления', name: 'ОстаткиТоваров', fullName: 'РегистрНакопления.ОстаткиТоваров', fields: [],
};
const РН_ПРОДАЖИ_БАЗА: MetaTable = {
  kind: 'РегистрНакопления', name: 'Продажи', fullName: 'РегистрНакопления.Продажи', fields: [],
};
const РС_КУРСЫ_БАЗА: MetaTable = {
  kind: 'РегистрСведений', name: 'КурсыВалют', fullName: 'РегистрСведений.КурсыВалют', fields: [],
};

const resolver = buildResolverFromTables([
  ВАЛЮТЫ, БАНКСЧЕТА, ОСТАТКИТОВ, ОСТАТКИТОВ_ИО, ПРОДАЖИ_ОБ, КУРСЫ_СРЕЗ,
  РН_ОСТАТКИТОВ_БАЗА, РН_ПРОДАЖИ_БАЗА, РС_КУРСЫ_БАЗА,
  РР_НАЧИСЛЕНИЯ, БП_СОГЛАСОВАНИЕ, ЗАДАЧА_ИСП,
]);

const errs = (text: string, r = resolver) =>
  validateBatchSemantics(parseBatch(text), r, text);

describe('validateBatchSemantics (8.4)', () => {
  it('эталон: несуществующая таблица → ошибка с позицией', () => {
    const text =
      'ВЫБРАТЬ Валюты.Ссылка КАК Ссылка, Валюты.Наименование КАК Наименование\n' +
      'ИЗ Справочник.Валюты1 КАК Валюты\n' +
      '  ЛЕВОЕ СОЕДИНЕНИЕ Справочник.БанковскиеСчета КАК БанковскиеСчета\n' +
      '  ПО Валюты.ОсновнаяВалюта = БанковскиеСчета.Ссылка';
    const e = errs(text);
    expect(e).toHaveLength(1);
    expect(e[0].fullName).toBe('Справочник.Валюты1');
    expect(e[0].line).toBe(2);
    expect(e[0].col).toBe(4);
    expect(e[0].message).toBe('{(2, 4)}: Таблица не найдена "Справочник.Валюты1"');
  });

  it('исправленный эталон: реальная + соединённая таблицы резолвятся → пусто', () => {
    const text =
      'ВЫБРАТЬ Валюты.Ссылка КАК Ссылка\n' +
      'ИЗ Справочник.Валюты КАК Валюты\n' +
      '  ЛЕВОЕ СОЕДИНЕНИЕ Справочник.БанковскиеСчета КАК БанковскиеСчета\n' +
      '  ПО Валюты.ОсновнаяВалюта = БанковскиеСчета.Ссылка';
    expect(errs(text)).toEqual([]);
  });

  it('неверный префикс типа (Документ.X для справочника) → ошибка', () => {
    const e = errs('ВЫБРАТЬ Т.Ссылка КАК С ИЗ Документ.Валюты КАК Т');
    expect(e).toHaveLength(1);
    expect(e[0].fullName).toBe('Документ.Валюты');
  });

  it('неприменимый срез регистра (.Остатки у оборотного) → ошибка', () => {
    const e = errs('ВЫБРАТЬ Т.П КАК П ИЗ РегистрНакопления.Продажи.Остатки КАК Т');
    expect(e).toHaveLength(1);
    expect(e[0].fullName).toBe('РегистрНакопления.Продажи.Остатки');
  });

  it('применимый срез того же регистра (.Обороты) → пусто', () => {
    expect(errs('ВЫБРАТЬ Т.П КАК П ИЗ РегистрНакопления.Продажи.Обороты КАК Т')).toEqual([]);
  });

  it('валидный срез РС (СрезПоследних) → пусто', () => {
    expect(errs('ВЫБРАТЬ Т.П КАК П ИЗ РегистрСведений.КурсыВалют.СрезПоследних КАК Т')).toEqual([]);
  });

  it('табличная часть как источник (3-сегментное имя) → пусто', () => {
    expect(errs('ВЫБРАТЬ Т.Курс КАК К ИЗ Справочник.Валюты.Курсы КАК Т')).toEqual([]);
  });

  it('голое имя без точки (ВТ/подзапрос) — пропуск', () => {
    expect(errs('ВЫБРАТЬ Т.П КАК П ИЗ ВТ КАК Т')).toEqual([]);
  });

  it('подзапрос-источник с несуществующей таблицей → ошибка из вложенного', () => {
    const e = errs('ВЫБРАТЬ Т.П КАК П ИЗ (ВЫБРАТЬ Х.Ссылка КАК П ИЗ Справочник.Нет КАК Х) КАК Т');
    expect(e).toHaveLength(1);
    expect(e[0].fullName).toBe('Справочник.Нет');
  });

  it('подзапрос условия В (ВЫБРАТЬ …) с несуществующей таблицей → ошибка', () => {
    const e = errs(
      'ВЫБРАТЬ Х.Ссылка КАК С ИЗ Справочник.Валюты КАК Х\n' +
      'ГДЕ Х.Ссылка В (ВЫБРАТЬ Y.Ссылка ИЗ Справочник.Нет КАК Y)'
    );
    expect(e).toHaveLength(1);
    expect(e[0].fullName).toBe('Справочник.Нет');
  });

  it('резолв регистронезависим', () => {
    expect(errs('ВЫБРАТЬ Т.Ссылка КАК С ИЗ справочник.валюты КАК Т')).toEqual([]);
  });

  it('повтор явного псевдонима поля → ошибка', () => {
    const e = errs('ВЫБРАТЬ X.ОсновнаяВалюта КАК Поле1, X.ОсновнаяВалюта КАК Поле1 ИЗ Справочник.Валюты КАК X');
    expect(e).toHaveLength(1);
    expect(e[0].message).toBe('Повторяющийся псевдоним "Поле1"');
  });

  it('повтор явного псевдонима регистронезависимо → ошибка', () => {
    const e = errs('ВЫБРАТЬ X.ОсновнаяВалюта КАК поле, X.ОсновнаяВалюта КАК ПОЛЕ ИЗ Справочник.Валюты КАК X');
    expect(e).toHaveLength(1);
    expect(e[0].message).toContain('Повторяющийся псевдоним');
  });

  it('синтезированные (неявные) псевдонимы не считаются дублями', () => {
    expect(errs('ВЫБРАТЬ X.Наименование, Y.Наименование ИЗ Справочник.Валюты КАК X, Справочник.БанковскиеСчета КАК Y')).toEqual([]);
  });

  // 8.4 (ревью): 3-сегментные подтаблицы типов, чьи срезы НЕ материализуются
  // загрузчиком, не должны давать ложное «Таблица не найдена» при резолвимой базе.
  it('виртуальная таблица РР (ДанныеГрафика) при резолвимой базе → пусто (fail-open)', () => {
    expect(errs('ВЫБРАТЬ Т.П КАК П ИЗ РегистрРасчета.Начисления.ДанныеГрафика КАК Т')).toEqual([]);
  });

  it('системная ТочкаМаршрута бизнес-процесса при резолвимой базе → пусто', () => {
    expect(errs('ВЫБРАТЬ Т.П КАК П ИЗ БизнесПроцесс.Согласование.ТочкаМаршрута КАК Т')).toEqual([]);
  });

  it('системная ТочкаМаршрута задачи при резолвимой базе → пусто', () => {
    expect(errs('ВЫБРАТЬ Т.П КАК П ИЗ Задача.ЗадачаИсполнителя.ТочкаМаршрута КАК Т')).toEqual([]);
  });

  it('несуществующая ТЧ справочника (база резолвится) → ошибка', () => {
    const e = errs('ВЫБРАТЬ Т.П КАК П ИЗ Справочник.Валюты.НетТакойТЧ КАК Т');
    expect(e).toHaveLength(1);
    expect(e[0].fullName).toBe('Справочник.Валюты.НетТакойТЧ');
  });

  it('2-сегментная база РР отсутствует в кэше → ошибка (покрытие 2-seg сохранено)', () => {
    const e = errs('ВЫБРАТЬ Т.Ссылка КАК С ИЗ РегистрРасчета.Выдуманный КАК Т');
    expect(e).toHaveLength(1);
    expect(e[0].fullName).toBe('РегистрРасчета.Выдуманный');
  });

  it('fail-open: резолвер undefined → пусто', () => {
    const text = 'ВЫБРАТЬ Т.Ссылка КАК С ИЗ Справочник.Валюты1 КАК Т';
    expect(validateBatchSemantics(parseBatch(text), undefined, text)).toEqual([]);
  });

  it('fail-open: пустой резолвер (без таблиц) — call-site передаёт undefined', () => {
    // App строит резолвер только при непустых таблицах; пустой список → undefined.
    const text = 'ВЫБРАТЬ Т.Ссылка КАК С ИЗ Справочник.Валюты1 КАК Т';
    const r = [].length ? buildResolverFromTables([]) : undefined;
    expect(validateBatchSemantics(parseBatch(text), r, text)).toEqual([]);
  });

  // «Дорожная карта валідатора», фаза 1 — структурные проверки, не требующие
  // метаданих: узгодженість колонок ОБЪЕДИНЕНИЯ. Обов'язково перевіряються
  // НЕЗАЛЕЖНО від наявності резолвера (раніше єдиний ранній `return []` при
  // відсутньому резолвері помилково гасив і checkDuplicateAliases теж — виправлено
  // разом з цією фазою).
  describe('checkUnionColumnCount (структурна перевірка, метадані не потрібні)', () => {
    it('різна кількість колонок у гілках ОБЪЕДИНЕНИЯ → помилка', () => {
      const text =
        'ВЫБРАТЬ X.Ссылка КАК Ссылка, X.Наименование КАК Наименование ИЗ Справочник.Валюты КАК X\n' +
        'ОБЪЕДИНИТЬ ВСЕ\n' +
        'ВЫБРАТЬ Y.Ссылка КАК Ссылка ИЗ Справочник.БанковскиеСчета КАК Y';
      const e = errs(text);
      expect(e).toHaveLength(1);
      expect(e[0].message).toContain('Количество столбцов');
      expect(e[0].message).toContain('(2, 1)');
    });

    it('однакова кількість колонок у гілках → пусто', () => {
      const text =
        'ВЫБРАТЬ X.Ссылка КАК Ссылка, X.Наименование КАК Наименование ИЗ Справочник.Валюты КАК X\n' +
        'ОБЪЕДИНИТЬ ВСЕ\n' +
        'ВЫБРАТЬ Y.Ссылка КАК Ссылка, Y.Ссылка КАК Наименование ИЗ Справочник.БанковскиеСчета КАК Y';
      expect(errs(text)).toEqual([]);
    });

    it('одиночний запит без ОБЪЕДИНЕНИЯ — перевірка не застосовна', () => {
      expect(errs('ВЫБРАТЬ X.Ссылка КАК С ИЗ Справочник.Валюты КАК X')).toEqual([]);
    });

    it('розбіжність в підзапиті-джерелі теж ловиться (рекурсія)', () => {
      const text =
        'ВЫБРАТЬ Т.П КАК П ИЗ (\n' +
        '\tВЫБРАТЬ X.Ссылка КАК Ссылка, X.Наименование КАК Наименование ИЗ Справочник.Валюты КАК X\n' +
        '\tОБЪЕДИНИТЬ ВСЕ\n' +
        '\tВЫБРАТЬ Y.Ссылка КАК Ссылка ИЗ Справочник.БанковскиеСчета КАК Y\n' +
        ') КАК Т';
      const e = errs(text);
      expect(e).toHaveLength(1);
      expect(e[0].message).toContain('Количество столбцов');
    });

    it('працює НЕЗАЛЕЖНО від резолвера (fail-open стосується лише перевірки таблиць)', () => {
      const text =
        'ВЫБРАТЬ X.Ссылка КАК Ссылка, X.Наименование КАК Наименование ИЗ Справочник.Валюты КАК X\n' +
        'ОБЪЕДИНИТЬ ВСЕ\n' +
        'ВЫБРАТЬ Y.Ссылка КАК Ссылка ИЗ Справочник.БанковскиеСчета КАК Y';
      const e = errs(text, undefined);
      expect(e).toHaveLength(1);
      expect(e[0].message).toContain('Количество столбцов');
    });
  });

  it('checkDuplicateAliases тепер теж працює без резолвера (виправлення поряд із фазою 1)', () => {
    const text = 'ВЫБРАТЬ X.ОсновнаяВалюта КАК Поле1, X.ОсновнаяВалюта КАК Поле1 ИЗ Справочник.Валюты КАК X';
    const e = errs(text, undefined);
    expect(e).toHaveLength(1);
    expect(e[0].message).toBe('Повторяющийся псевдоним "Поле1"');
  });
});

describe('findUnsafeVirtualTables (PR-05, ТЗ §54 P0.5)', () => {
  it('безопасная ВТ (≤2 аргумента) — пустой результат', () => {
    const text = 'ВЫБРАТЬ Т.Период ИЗ РегистрСведений.КурсыВалют.СрезПоследних(&Дата, ИСТИНА) КАК Т';
    expect(findUnsafeVirtualTables(parseBatch(text))).toEqual([]);
  });

  it('ВТ с потерянным 3-м аргументом — таблица попадает в результат', () => {
    const text = 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.ДанныеГрафика(&А, &Б, &В) КАК Т';
    expect(findUnsafeVirtualTables(parseBatch(text))).toEqual(['РегистрРасчета.Начисления.ДанныеГрафика']);
  });

  it('находит небезопасную ВТ внутри подзапроса-источника (рекурсия)', () => {
    const text =
      'ВЫБРАТЬ Т.П КАК П ИЗ (\n' +
      '\tВЫБРАТЬ В.Период ИЗ РегистрРасчета.Начисления.ДанныеГрафика(&А, &Б, &В) КАК В\n' +
      ') КАК Т';
    expect(findUnsafeVirtualTables(parseBatch(text))).toEqual(['РегистрРасчета.Начисления.ДанныеГрафика']);
  });

  it('находит небезопасную ВТ внутри подзапроса условия В(...) (рекурсия по conditions)', () => {
    const text =
      'ВЫБРАТЬ X.Ссылка КАК Ссылка ИЗ Справочник.Валюты КАК X\n' +
      'ГДЕ X.Ссылка В (\n' +
      '\tВЫБРАТЬ В.Период ИЗ РегистрРасчета.Начисления.ДанныеГрафика(&А, &Б, &В) КАК В\n' +
      ')';
    expect(findUnsafeVirtualTables(parseBatch(text))).toEqual(['РегистрРасчета.Начисления.ДанныеГрафика']);
  });

  it('НЕ пересекается с validateBatchSemantics — открытие текста с такой ВТ не блокируется', () => {
    const text = 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.ДанныеГрафика(&А, &Б, &В) КАК Т';
    expect(errs(text, undefined)).toEqual([]);
  });
});

describe('findMalformedCustomExpressions (PR-14, docs/development/known-issues.md)', () => {
  it('РЕАЛЬНАЯ уязвимость: незакрытая скобка в ГДЕ молча поглощает УПОРЯДОЧИТЬ ПО как часть условия', () => {
    // Без закрывающей скобки после "&Б" — реальный typo пользователя.
    const text =
      'ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ГДЕ (Т.Код = &А ИЛИ Т.Наименование = &Б\n' +
      'УПОРЯДОЧИТЬ ПО Т.Код';
    const doc = parseBatch(text);
    // Подтверждаем сам механизм уязвимости: order пропал, "поглощён" в condition.expression.
    expect(doc.members[0].members[0].model.order).toBeUndefined();
    const expr = doc.members[0].members[0].model.conditions?.[0]?.expression ?? '';
    expect(expr).toContain('УПОРЯДОЧИТЬ ПО');

    const hits = findMalformedCustomExpressions(doc);
    expect(hits).toEqual([{ kind: 'condition', text: expr }]);
  });

  it('незакрытая скобка БЕЗ хвоста — тоже находится (сам custom-текст не сбалансирован)', () => {
    const text = 'ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ГДЕ (Т.Код = &А ИЛИ Т.Наименование = &Б';
    const hits = findMalformedCustomExpressions(parseBatch(text));
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('condition');
  });

  it('лишняя закрывающая скобка (глубина уходит в минус) — тоже находится', () => {
    const text = 'ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ГДЕ Т.Код = &А ИЛИ (Т.Наименование = &Б))';
    const hits = findMalformedCustomExpressions(parseBatch(text));
    expect(hits).toHaveLength(1);
  });

  it('ЛЕГИТИМНЫЙ сбалансированный ИЛИ-блок — НЕ находится (не ложное срабатывание)', () => {
    const text =
      'ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т ГДЕ (Т.Код = &А ИЛИ Т.Наименование = &Б)\n' +
      'УПОРЯДОЧИТЬ ПО Т.Код';
    const doc = parseBatch(text);
    expect(doc.members[0].members[0].model.order).toBeDefined();
    expect(findMalformedCustomExpressions(doc)).toEqual([]);
  });

  it('находит небезопасный custom внутри подзапроса-источника (рекурсия)', () => {
    // Собран напрямую (не через parseBatch): незакрытая скобка внутри условия
    // ВЛОЖЕННОГО подзапроса-источника на практике поглотила бы и закрывающую
    // скобку самого подзапроса-источника — parseBatch в этом случае бросает
    // "незакрытый подзапрос в источнике" раньше, чем модель вообще построилась
    // (отдельная, более громкая деградация — не то, что здесь проверяется).
    // Рекурсия walkDocument/walkModel сама по себе — тот же код, что и у уже
    // протестированного findUnsafeVirtualTables, поэтому здесь достаточно
    // проверить её механику на явно собранной модели.
    const innerDoc: import('../../src/core/query/unionModel').QueryDocument = {
      members: [{
        name: 'Запрос 1',
        distinct: false,
        model: {
          tables: [{ id: 'v0', fullName: 'Справочник.Валюты', alias: 'В' }],
          fields: [{ tableId: 'v0', path: 'Код', alias: 'Код' }],
          conditions: [{ custom: true, expression: '(В.Код = &А ИЛИ В.Наименование = &Б' }],
        },
      }],
    };
    const batch: import('../../src/core/query/batchModel').BatchDocument = {
      members: [{
        members: [{
          name: 'Запрос 1',
          distinct: false,
          model: {
            tables: [{ id: 't0', fullName: '', alias: 'Т', subquery: innerDoc }],
            fields: [{ tableId: 't0', path: 'П', alias: 'П' }],
          },
        }],
      }],
    };
    const hits = findMalformedCustomExpressions(batch);
    expect(hits).toEqual([{ kind: 'condition', text: '(В.Код = &А ИЛИ В.Наименование = &Б' }]);
  });

  it('находит небезопасный custom в произвольном условии соединения (joinCondition)', () => {
    const text =
      'ВЫБРАТЬ Т.Код КАК Код ИЗ Справочник.Валюты КАК Т\n' +
      'ЛЕВОЕ СОЕДИНЕНИЕ Справочник.БанковскиеСчета КАК Y\n' +
      'ПО (Т.Код = &А ИЛИ Y.Код = &Б';
    const hits = findMalformedCustomExpressions(parseBatch(text));
    expect(hits.some(h => h.kind === 'joinCondition' || h.kind === 'join')).toBe(true);
  });

  it('не пересекается с findUnsafeVirtualTables — независимая проверка своего класса проблем', () => {
    // ВТ с потерянным 3-м аргументом сама по себе сбалансирована по скобкам.
    const text = 'ВЫБРАТЬ Т.Период ИЗ РегистрРасчета.Начисления.ДанныеГрафика(&А, &Б, &В) КАК Т';
    expect(findMalformedCustomExpressions(parseBatch(text))).toEqual([]);
  });

  // Собраны напрямую (не через parseBatch): проверяют то, что действительно
  // отличает шаг 2 (структурный акцептор грамматики выражений,
  // expressionSyntaxCheck.ts) от шага 1 (только баланс скобок) — эти случаи
  // ВСЕ сбалансированы по скобкам, но синтаксически сломаны, и старый чекер
  // их бы пропустил.
  function batchWithCondition(expression: string): ReturnType<typeof parseBatch> {
    return {
      members: [{
        members: [{
          name: 'Запрос 1',
          distinct: false,
          model: {
            tables: [{ id: 't0', fullName: 'Справочник.Валюты', alias: 'Т' }],
            fields: [{ tableId: 't0', path: 'Код', alias: 'Код' }],
            conditions: [{ custom: true, expression }],
          },
        }],
      }],
    };
  }

  it('двойной оператор (сбалансировано по скобкам, но не грамматика) — находится', () => {
    expect(findMalformedCustomExpressions(batchWithCondition('Т.Код = = &А'))).toHaveLength(1);
  });

  it('висячий оператор в конце (сбалансировано, но не грамматика) — находится', () => {
    expect(findMalformedCustomExpressions(batchWithCondition('Т.Код = &А ИЛИ'))).toHaveLength(1);
  });

  it('ВЫБОР без КОНЕЦ — находится', () => {
    expect(findMalformedCustomExpressions(batchWithCondition('ВЫБОР КОГДА Т.Код = &А ТОГДА 1 ИНАЧЕ 2'))).toHaveLength(1);
  });

  it('ВЫРАЗИТЬ(...) без КАК — находится', () => {
    expect(findMalformedCustomExpressions(batchWithCondition('ВЫРАЗИТЬ(Т.Код СТРОКА(10)) = &А'))).toHaveLength(1);
  });

  it('ЛЕГИТИМНЫЙ ВЫБОР…КОГДА…ТОГДА…ИНАЧЕ…КОНЕЦ — НЕ находится', () => {
    expect(findMalformedCustomExpressions(batchWithCondition(
      'ВЫБОР КОГДА Т.Код = &А ТОГДА 1 ИНАЧЕ 2 КОНЕЦ = &Б'
    ))).toEqual([]);
  });

  it('ЛЕГИТИМНЫЙ ВЫРАЗИТЬ(… КАК СТРОКА(N)) — НЕ находится', () => {
    expect(findMalformedCustomExpressions(batchWithCondition('ВЫРАЗИТЬ(Т.Код КАК СТРОКА(10)) = &А'))).toEqual([]);
  });

  it('ЛЕГИТИМНЫЙ МЕЖДУ — НЕ находится (регрессия: жадный acceptValue не должен съедать разделительное И)', () => {
    expect(findMalformedCustomExpressions(batchWithCondition('Т.Дата МЕЖДУ &А И &Б'))).toEqual([]);
    expect(findMalformedCustomExpressions(batchWithCondition('Т.Дата МЕЖДУ &А И &Б И Т.Код = &В'))).toEqual([]);
  });

  it('шаблонные маркеры подстановки (%1, #Марк#) — НЕ находится (не пытаемся судить)', () => {
    expect(findMalformedCustomExpressions(batchWithCondition('Т.Код = %1'))).toEqual([]);
    expect(findMalformedCustomExpressions(batchWithCondition('#Марк#'))).toEqual([]);
  });
});
