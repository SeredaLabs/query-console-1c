import { describe, it, expect } from 'vitest';
import { validateBatchText, tryParseBatch, tryOpenBatch } from '../../src/core/query/validateBatch';
import { parseBatch } from '../../src/core/query/sdblParser';
import { buildResolverFromTables } from '../../src/core/metadata/buildModelResolver';
import type { MetaTable } from '../../src/core/metadata/types';

describe('validateBatchText (7.8.10)', () => {
  // Критерий «ОК» должен совпадать с открытием конструктором из текста: запрос
  // корректен ⟺ parseBatch его разбирает. Пустой текст разбирается в пустой пакет
  // (как при открытии из текста — открывается пустой конструктор) → ok:true.
  it('пустой/пробельный текст разбирается (как открытие из текста) → ok:true', () => {
    expect(validateBatchText('').ok).toBe(true);
    expect(validateBatchText('   \n\t  ').ok).toBe(true);
  });

  it('валидный запрос → ok:true', () => {
    const text = 'ВЫБРАТЬ\n\tВалюты.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК Валюты';
    expect(validateBatchText(text).ok).toBe(true);
  });

  it('битый запрос (пустой список выборки) → ok:false, error содержит «ошибку»', () => {
    const r = validateBatchText('ВЫБРАТЬ ИЗ ИЗ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('ошибку');
  });

  // Два идентификатора подряд в элементе выборки (`аа а.asdfa` — пробел внутри) —
  // некорректный SDBL: запрос НЕ должен открываться, а давать ошибку с номером строки.
  it('два идентификатора подряд в поле выборки → ok:false', () => {
    const text = 'ВЫБРАТЬ\n\tаа а.asdfa КАК asdfa\nИЗ\n\tСправочник.Валюты КАК Валюты';
    const r = validateBatchText(text);
    expect(r.ok).toBe(false);
    // ошибка ссылается на 2-ю строку (поле)
    if (!r.ok) expect(r.error).toMatch(/\b2:/);
  });

  it('тот же дефект во 2-м запросе пакета → весь пакет ok:false', () => {
    const text =
      'ВЫБРАТЬ\n\tааа.Ссылка КАК Ссылка\nПОМЕСТИТЬ ааа\nИЗ\n\tСправочник.Валюты КАК Валюты' +
      '\n;\n\n' + '/'.repeat(80) + '\n' +
      'ВЫБРАТЬ\n\tааа.Ссылка КАК Ссылка,\n\tаа а.asdfa КАК asdfa\nИЗ\n\tааа КАК ааа';
    expect(validateBatchText(text).ok).toBe(false);
  });

  // `Поле Алиас` без КАК — неявный псевдоним (валиден в 1С), НО хвостовой
  // зарезервированный идентификатор-связка (`Ссылка`=ССЫЛКА) псевдонимом быть не может —
  // `Банки.Ссылка Ссылка` некорректен (проверено реальным 1С: «Ожидается имя таблицы»).
  it('хвостовой зарезервированный идентификатор (Ссылка) не псевдоним → ok:false', () => {
    const text = 'ВЫБРАТЬ\n\tБанки.Ссылка Ссылка\nИЗ\n\tСправочник.Банки КАК Банки';
    expect(validateBatchText(text).ok).toBe(false);
  });

  it('валидные формы того же поля по-прежнему ok:true', () => {
    const from = '\nИЗ\n\tСправочник.Банки КАК Банки';
    // явный КАК с псевдонимом-резервом — допустимо
    expect(validateBatchText('ВЫБРАТЬ\n\tБанки.Ссылка КАК Ссылка' + from).ok).toBe(true);
    // неявный псевдоним обычным именем — допустимо
    expect(validateBatchText('ВЫБРАТЬ\n\tБанки.Ссылка Алиас' + from).ok).toBe(true);
    // просто поле — допустимо (хвостовой сегмент Ссылка после точки)
    expect(validateBatchText('ВЫБРАТЬ\n\tБанки.Ссылка' + from).ok).toBe(true);
  });

  it('валидное составное выражение поля по-прежнему ok:true (не ложное срабатывание)', () => {
    const text =
      'ВЫБРАТЬ\n\tВЫБОР КОГДА Валюты.Код = "1" ТОГДА Валюты.Наименование ИНАЧЕ "" КОНЕЦ КАК Имя,\n' +
      '\tПРЕДСТАВЛЕНИЕ(Валюты.Ссылка) КАК Пр,\n\tСУММА(Валюты.Код) Итог\n' +
      'ИЗ\n\tСправочник.Валюты КАК Валюты\nСГРУППИРОВАТЬ ПО\n\tВалюты.Наименование';
    expect(validateBatchText(text).ok).toBe(true);
  });

  it('критерий тот же, что и у parseBatch (открытие из текста)', () => {
    // Для любого текста: validateBatchText.ok ⟺ parseBatch не бросает.
    const samples = [
      'ВЫБРАТЬ\n\tВалюты.Код КАК Код\nИЗ\n\tСправочник.Валюты КАК Валюты',
      'ВЫБРАТЬ ИЗ ИЗ',
      'ВЫБРАТЬ "abc',
      '',
    ];
    for (const text of samples) {
      let parseOk = true;
      try { parseBatch(text); } catch { parseOk = false; }
      expect(validateBatchText(text).ok).toBe(parseOk);
      expect(tryParseBatch(text).ok).toBe(parseOk);
    }
  });
});

describe('tryOpenBatch / validateBatchText с резолвером (8.4)', () => {
  const ВАЛЮТЫ: MetaTable = {
    kind: 'Справочник', name: 'Валюты', fullName: 'Справочник.Валюты', fields: [],
  };
  const resolver = buildResolverFromTables([ВАЛЮТЫ]);
  const good = 'ВЫБРАТЬ Т.Ссылка КАК С ИЗ Справочник.Валюты КАК Т';
  const bad = 'ВЫБРАТЬ Т.Ссылка КАК С ИЗ Справочник.Валюты1 КАК Т';

  it('хорошая таблица с резолвером → ok с doc', () => {
    const r = tryOpenBatch(good, resolver);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc.members.length).toBe(1);
  });

  it('несуществующая таблица с резолвером → not ok с семантическим сообщением', () => {
    const r = tryOpenBatch(bad, resolver);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('Таблица не найдена');
      expect(r.error).toContain('Справочник.Валюты1');
    }
  });

  it('без резолвера — прежнее поведение (семантика не проверяется)', () => {
    expect(tryOpenBatch(bad).ok).toBe(true);
    expect(tryOpenBatch(bad, undefined).ok).toBe(true);
  });

  it('синтаксическая ошибка ловится прежде семантики', () => {
    const r = tryOpenBatch('ВЫБРАТЬ ИЗ ИЗ', resolver);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toContain('Таблица не найдена');
  });

  it('validateBatchText с резолвером: несуществующая таблица → ok:false', () => {
    const r = validateBatchText(bad, resolver);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Таблица не найдена');
  });

  it('validateBatchText с резолвером: хорошая таблица → ok:true', () => {
    expect(validateBatchText(good, resolver).ok).toBe(true);
  });

  it('validateBatchText без резолвера — прежнее поведение', () => {
    expect(validateBatchText(bad).ok).toBe(true);
  });
});

describe('структурные ключевые слова внутри «сырых» выражений (полный аудит парсера)', () => {
  // Класс бага: несколько мест парсера собирают токены выражения до стоп-слова, и
  // список стоп-слов не включал ПОМЕСТИТЬ/ДОБАВИТЬ/ИЗ — если пользователь по ошибке
  // ставит эти структурные ключевые слова не там, где парсер их ожидает, они молча
  // проглатывались как часть «произвольного» выражения (вместе с реальным `ИЗ`,
  // из-за чего настоящий источник исчезал из модели) — и весь запрос считался
  // валидным (ok:true) вместо синтаксической ошибки. Найдено полным аудитом
  // sdblParser.ts, каждый случай подтверждён отдельным пробным запуском.

  it('ГДЕ перед ПОМЕСТИТЬ/ИЗ (WHERE_STOP)', () => {
    const text = 'ВЫБРАТЬ\n\tАптеки.Ссылка КАК Аптека\nГДЕ\nПОМЕСТИТЬ ВТ_Аптеки\nИЗ\n\tСправочник.Аптеки КАК Аптеки\nГДЕ\n\tНЕ Аптеки.ПометкаУдаления';
    expect(tryOpenBatch(text).ok).toBe(false);
  });

  it('условие ПО в JOIN проглатывает ПОМЕСТИТЬ/ДОБАВИТЬ/ИЗ (JOIN_COND_STOP)', () => {
    const withPomestit = 'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ВНУТРЕННЕЕ СОЕДИНЕНИЕ Справочник.Т2 КАК Т2 ПО Т1.Код = Т2.Код ПОМЕСТИТЬ ВТ_Х';
    const withDobavit = withPomestit.replace('ПОМЕСТИТЬ', 'ДОБАВИТЬ');
    // Самый опасный случай: реальная вторая таблица источника пропадала из модели.
    const withIz = 'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ВНУТРЕННЕЕ СОЕДИНЕНИЕ Справочник.Т2 КАК Т2 ПО Т1.Код = Т2.Код ИЗ Справочник.Т3 КАК Т3';
    expect(tryOpenBatch(withPomestit).ok).toBe(false);
    expect(tryOpenBatch(withDobavit).ok).toBe(false);
    expect(tryOpenBatch(withIz).ok).toBe(false);
  });

  it('СГРУППИРОВАТЬ ПО проглатывает ПОМЕСТИТЬ (SECTION_KEYWORDS)', () => {
    const text = 'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 СГРУППИРОВАТЬ ПО Т1.Код ПОМЕСТИТЬ ВТ_Х';
    expect(tryOpenBatch(text).ok).toBe(false);
  });

  it('УПОРЯДОЧИТЬ ПО (выражение-функция) проглатывает ПОМЕСТИТЬ (SECTION_KEYWORDS)', () => {
    const text = 'ВЫБРАТЬ Т1.Дата ИЗ Справочник.Т1 КАК Т1 УПОРЯДОЧИТЬ ПО ГОД(Т1.Дата) ПОМЕСТИТЬ ВТ_Х';
    expect(tryOpenBatch(text).ok).toBe(false);
  });

  it('ИНДЕКСИРОВАТЬ ПО (выражение-функция) проглатывает ДОБАВИТЬ (SECTION_KEYWORDS)', () => {
    const text = 'ВЫБРАТЬ Т1.Код ПОМЕСТИТЬ ВТ_Й ИЗ Справочник.Т1 КАК Т1 ИНДЕКСИРОВАТЬ ПО ЕСТЬNULL(Т1.Код, 0) ДОБАВИТЬ ВТ_Х';
    expect(tryOpenBatch(text).ok).toBe(false);
  });

  it('ИТОГИ <агрегат> проглатывает ИЗ — реальная вторая таблица пропадает', () => {
    const text = 'ВЫБРАТЬ Т1.Сумма ИЗ Справочник.Т1 КАК Т1 ИТОГИ СУММА(Сумма) ИЗ Справочник.Т3 КАК Т3 ПО Т1.Код';
    expect(tryOpenBatch(text).ok).toBe(false);
  });

  it('ДЛЯ ИЗМЕНЕНИЯ трактует ИЗ/КАК как имена таблиц блокировки', () => {
    const text = 'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ДЛЯ ИЗМЕНЕНИЯ Т1 ИЗ Справочник.Т3 КАК Т3';
    expect(tryOpenBatch(text).ok).toBe(false);
  });

  // Регресс на ложные срабатывания: те же секции в НОРМАЛЬНОЙ форме (без мусора)
  // должны продолжать открываться как раньше — это уже покрыто золотым корпусом
  // (corpusRegression.test.ts), но короткие точечные случаи здесь нагляднее.
  it('те же секции в корректной форме — по-прежнему ok:true', () => {
    const join = 'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ВНУТРЕННЕЕ СОЕДИНЕНИЕ Справочник.Т2 КАК Т2 ПО Т1.Код = Т2.Код';
    const group = 'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 СГРУППИРОВАТЬ ПО Т1.Код';
    const order = 'ВЫБРАТЬ Т1.Дата ИЗ Справочник.Т1 КАК Т1 УПОРЯДОЧИТЬ ПО ГОД(Т1.Дата)';
    const index = 'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ИНДЕКСИРОВАТЬ ПО ЕСТЬNULL(Т1.Код, 0)';
    const totals = 'ВЫБРАТЬ Т1.Сумма ИЗ Справочник.Т1 КАК Т1 ИТОГИ СУММА(Сумма) ПО Т1.Код';
    const lock = 'ВЫБРАТЬ Т1.Код ИЗ Справочник.Т1 КАК Т1 ДЛЯ ИЗМЕНЕНИЯ Т1';
    for (const text of [join, group, order, index, totals, lock]) {
      expect(tryOpenBatch(text).ok, text).toBe(true);
    }
  });
});
