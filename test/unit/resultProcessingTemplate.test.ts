import { describe, it, expect } from 'vitest';
import { extractQueryParamNames, buildResultProcessingCode } from '../../src/core/query/resultProcessingTemplate';

describe('extractQueryParamNames', () => {
  it('находит уникальные параметры в порядке первого появления', () => {
    const text = 'ВЫБРАТЬ 1 ГДЕ Дата >= &НачалоПериода И Дата <= &КрайнийСрок И Х = &НачалоПериода';
    expect(extractQueryParamNames(text)).toEqual(['НачалоПериода', 'КрайнийСрок']);
  });

  it('возвращает пустой массив, если параметров нет', () => {
    expect(extractQueryParamNames('ВЫБРАТЬ Валюты.Код ИЗ Справочник.Валюты КАК Валюты')).toEqual([]);
  });

  it('не путает параметр с обычным идентификатором без &', () => {
    expect(extractQueryParamNames('ВЫБРАТЬ Амперсанд ИЗ Т')).toEqual([]);
  });
});

describe('buildResultProcessingCode', () => {
  it('оборачивает запрос без параметров в Запрос/Выполнить/Выборка/Цикл', () => {
    const code = buildResultProcessingCode('ВЫБРАТЬ\n\tВалюты.Код\nИЗ\n\tСправочник.Валюты КАК Валюты');
    expect(code).toBe(
      'Запрос = Новый Запрос;\n' +
      'Запрос.Текст =\n\t"ВЫБРАТЬ\n\t|\tВалюты.Код\n\t|ИЗ\n\t|\tСправочник.Валюты КАК Валюты";\n' +
      '\n' +
      'Результат = Запрос.Выполнить();\n' +
      'Выборка = Результат.Выбрать();\n' +
      '\n' +
      'Пока Выборка.Следующий() Цикл\n' +
      '\t\n' +
      'КонецЦикла;'
    );
  });

  it('выравнивает все строки-продолжения текста запроса (|…) под отступ открывающей кавычки', () => {
    const code = buildResultProcessingCode('ВЫБРАТЬ\n\tА\nИЗ\n\tБ');
    for (const line of code.split('\n')) {
      if (line.trimStart().startsWith('|')) expect(line.startsWith('\t|')).toBe(true);
    }
  });

  it('добавляет УстановитьПараметр с пустой строкой-заглушкой для каждого параметра, отделяя блок пустыми строками', () => {
    const code = buildResultProcessingCode('ВЫБРАТЬ 1 ГДЕ Дата >= &НачалоПериода И Дата <= &КрайнийСрок');
    expect(code).toContain('Запрос.УстановитьПараметр("НачалоПериода", "");');
    expect(code).toContain('Запрос.УстановитьПараметр("КрайнийСрок", "");');
    // Параметры идут между Текст и Выполнить, каждый блок отделён пустой строкой.
    const textIdx = code.indexOf('Запрос.Текст');
    const param1Idx = code.indexOf('УстановитьПараметр("НачалоПериода"');
    const execIdx = code.indexOf('Запрос.Выполнить()');
    expect(textIdx).toBeLessThan(param1Idx);
    expect(param1Idx).toBeLessThan(execIdx);
    expect(code.split('\n\n')).toHaveLength(4); // текст / параметры / выполнение+выборка / цикл
  });

  it('не дублирует УстановитьПараметр для повторно встречающегося параметра', () => {
    const code = buildResultProcessingCode('ВЫБРАТЬ 1 ГДЕ А = &П И Б = &П');
    const matches = code.match(/УстановитьПараметр/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('с indent выравнивает по нему все строки, кроме первой — курсор уже там стоит', () => {
    const code = buildResultProcessingCode('ВЫБРАТЬ\n\tВалюты.Код\nИЗ\n\tСправочник.Валюты КАК Валюты', '\t\t');
    const lines = code.split('\n');
    expect(lines[0]).toBe('Запрос = Новый Запрос;'); // первая строка — без добавленного отступа
    for (const line of lines.slice(1)) {
      if (line === '') continue; // разделительная пустая строка отступ не получает
      expect(line.startsWith('\t\t')).toBe(true);
    }
    expect(code).toContain('\n\n'); // разделитель между объявлением запроса и его выполнением сохранился
    // Отступ вставлен один раз, а не задваивается с уже имеющимся \t перед текстом запроса.
    expect(code).toContain('\t\t\t"ВЫБРАТЬ');
  });
});

describe('C7: parameter names come from lexer tokens', () => {
  it('ignores `&name` inside strings and comments', () => {
    const text = 'ВЫБРАТЬ "&Ложный" КАК С, &Реальный КАК Р // &Комментарий\nИЗ Т КАК Т';
    expect(extractQueryParamNames(text)).toEqual(['Реальный']);
    expect(buildResultProcessingCode(text)).not.toContain('УстановитьПараметр("Ложный"');
    expect(buildResultProcessingCode(text)).toContain('Запрос.УстановитьПараметр("Реальный", "");');
    expect(buildResultProcessingCode(text)).not.toContain('УстановитьПараметр("Комментарий"');
  });

  it('merges case variants, keeping the first spelling', () => {
    expect(extractQueryParamNames('ВЫБРАТЬ &Дата, &ДАТА, &дата, &Код')).toEqual(['Дата', 'Код']);
  });

  it('keeps names with letters outside the Russian alphabet whole', () => {
    expect(extractQueryParamNames('ВЫБРАТЬ &Ціна, &Größe, &Дата2')).toEqual(['Ціна', 'Größe', 'Дата2']);
  });

  it('still lists parameters in text that is lexically incomplete', () => {
    expect(extractQueryParamNames('ВЫБРАТЬ &А, & ГДЕ Х = "не закрыта &Б')).toEqual(['А']);
  });
});
