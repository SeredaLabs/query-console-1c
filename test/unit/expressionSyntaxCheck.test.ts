import { describe, it, expect } from 'vitest';
import { isStructurallyValidExpression } from '../../src/core/query/expressionSyntaxCheck';

describe('isStructurallyValidExpression — валидные формы', () => {
  it('пустой текст — валиден (нечего проверять)', () => {
    expect(isStructurallyValidExpression('')).toBe(true);
    expect(isStructurallyValidExpression('   ')).toBe(true);
  });

  it('литералы и параметр', () => {
    expect(isStructurallyValidExpression('&Параметр')).toBe(true);
    expect(isStructurallyValidExpression('123')).toBe(true);
    expect(isStructurallyValidExpression('12.5')).toBe(true);
    expect(isStructurallyValidExpression('"строка"')).toBe(true);
    expect(isStructurallyValidExpression('ИСТИНА')).toBe(true);
    expect(isStructurallyValidExpression('ЛОЖЬ')).toBe(true);
    expect(isStructurallyValidExpression('NULL')).toBe(true);
    expect(isStructurallyValidExpression('НЕОПРЕДЕЛЕНО')).toBe(true);
  });

  it('ссылка на поле/mdo — цепочка через точку', () => {
    expect(isStructurallyValidExpression('Т.Код')).toBe(true);
    expect(isStructurallyValidExpression('Справочник.Валюты.Наименование')).toBe(true);
  });

  it('простое условие сравнения', () => {
    expect(isStructurallyValidExpression('Т.Код = &А')).toBe(true);
    expect(isStructurallyValidExpression('Т.Код <> &А')).toBe(true);
    expect(isStructurallyValidExpression('Т.Код >= 1')).toBe(true);
  });

  it('И/ИЛИ-цепочки, НЕ-префикс, скобки', () => {
    expect(isStructurallyValidExpression('Т.Код = &А И Т.Имя = &Б')).toBe(true);
    expect(isStructurallyValidExpression('(Т.Код = &А ИЛИ Т.Имя = &Б)')).toBe(true);
    expect(isStructurallyValidExpression('НЕ Т.Флаг')).toBe(true);
    expect(isStructurallyValidExpression('НЕ (Т.Код = &А)')).toBe(true);
  });

  it('арифметика без приоритета операторов — довольно просто цепочка', () => {
    expect(isStructurallyValidExpression('Т.Сумма + 1 * 2 - 3')).toBe(true);
    expect(isStructurallyValidExpression('-Т.Сумма')).toBe(true);
    expect(isStructurallyValidExpression('+Т.Сумма')).toBe(true);
  });

  it('ПОДОБНО [СПЕЦСИМВОЛ]', () => {
    expect(isStructurallyValidExpression('Т.Имя ПОДОБНО "%текст%"')).toBe(true);
    expect(isStructurallyValidExpression('Т.Имя ПОДОБНО "%~%%" СПЕЦСИМВОЛ "~"')).toBe(true);
    expect(isStructurallyValidExpression('Т.Имя НЕ ПОДОБНО "%текст%"')).toBe(true);
  });

  it('ЕСТЬ [НЕ] NULL', () => {
    expect(isStructurallyValidExpression('Т.Поле ЕСТЬ NULL')).toBe(true);
    expect(isStructurallyValidExpression('Т.Поле ЕСТЬ НЕ NULL')).toBe(true);
  });

  it('МЕЖДУ — включая цепочку дальше через И (регрессия жадности)', () => {
    expect(isStructurallyValidExpression('Т.Дата МЕЖДУ &А И &Б')).toBe(true);
    expect(isStructurallyValidExpression('Т.Дата МЕЖДУ &А И &Б И Т.Код = &В')).toBe(true);
  });

  it('[НЕ] В (список) / В (подзапрос)', () => {
    expect(isStructurallyValidExpression('Т.Код В (&А, &Б, 1, "х")')).toBe(true);
    expect(isStructurallyValidExpression('Т.Код НЕ В (&А, &Б)')).toBe(true);
    expect(isStructurallyValidExpression('Т.Код В ИЕРАРХИИ (&А)')).toBe(true);
    expect(isStructurallyValidExpression('Т.Код В (ВЫБРАТЬ Х.Код ИЗ Справочник.Тест КАК Х)')).toBe(true);
  });

  it('ССЫЛКА', () => {
    expect(isStructurallyValidExpression('Т.Регистратор ССЫЛКА Документ.РеализацияТоваров')).toBe(true);
  });

  it('вызов функции — произвольное имя, список аргументов через запятую', () => {
    expect(isStructurallyValidExpression('СУММА(Т.Сумма)')).toBe(true);
    expect(isStructurallyValidExpression('ПОДСТРОКА(Т.Имя, 1, 5)')).toBe(true);
    expect(isStructurallyValidExpression('ЕСТЬNULL(Т.Поле, 0)')).toBe(true);
    expect(isStructurallyValidExpression('РЕГИСТРАВТОНОМЕРЗАПИСИ()')).toBe(true);
    expect(isStructurallyValidExpression('АВТОНОМЕРЗАПИСИ()')).toBe(true);
  });

  it('КОЛИЧЕСТВО(РАЗЛИЧНЫЕ …) и КОЛИЧЕСТВО(*)', () => {
    expect(isStructurallyValidExpression('КОЛИЧЕСТВО(РАЗЛИЧНЫЕ Т.Код)')).toBe(true);
    expect(isStructurallyValidExpression('КОЛИЧЕСТВО(*)')).toBe(true);
  });

  it('ВЫБОР…КОНЕЦ во всех формах (с/без исходного выражения, с/без ИНАЧЕ)', () => {
    expect(isStructurallyValidExpression('ВЫБОР КОГДА Т.Код = &А ТОГДА 1 ИНАЧЕ 2 КОНЕЦ')).toBe(true);
    expect(isStructurallyValidExpression('ВЫБОР КОГДА Т.Код = &А ТОГДА 1 КОНЕЦ')).toBe(true);
    expect(isStructurallyValidExpression('ВЫБОР Т.Статус КОГДА &А ТОГДА 1 ИНАЧЕ 2 КОНЕЦ')).toBe(true);
    expect(isStructurallyValidExpression(
      'ВЫБОР КОГДА Т.А ТОГДА 1 КОГДА Т.Б ТОГДА 2 ИНАЧЕ 3 КОНЕЦ'
    )).toBe(true);
  });

  it('ВЫРАЗИТЬ(… КАК Тип) — простой тип с длиной/точностью и ссылка на тип метаданных', () => {
    expect(isStructurallyValidExpression('ВЫРАЗИТЬ(Т.Код КАК СТРОКА(10))')).toBe(true);
    expect(isStructurallyValidExpression('ВЫРАЗИТЬ(Т.Сумма КАК ЧИСЛО(10, 2))')).toBe(true);
    expect(isStructurallyValidExpression('ВЫРАЗИТЬ(Т.Дата КАК ДАТА)')).toBe(true);
    expect(isStructurallyValidExpression('ВЫРАЗИТЬ(Т.Объект КАК Справочник.Валюты)')).toBe(true);
  });

  it('поле выборки "все поля" — asteriskField (отдельная ветка, не значение)', () => {
    expect(isStructurallyValidExpression('*')).toBe(true);
    expect(isStructurallyValidExpression('Т.*')).toBe(true);
    expect(isStructurallyValidExpression('Справочник.Валюты.*')).toBe(true);
  });

  it('шаблонные маркеры подстановки (%1, #Марк#, [Марк]) — не пытаемся судить', () => {
    expect(isStructurallyValidExpression('%1')).toBe(true);
    expect(isStructurallyValidExpression('#Марк#')).toBe(true);
    expect(isStructurallyValidExpression('[Марк]')).toBe(true);
    expect(isStructurallyValidExpression('ВЫБОР КОГДА &А ТОГДА 1 КОНЕЦ%1')).toBe(true); // мусор+маркер вместе тоже не судим
  });
});

describe('isStructurallyValidExpression — сломанные формы (найдено на золотом корпусе + реальных production-конфигурациях)', () => {
  it('незакрытая/лишняя скобка', () => {
    expect(isStructurallyValidExpression('(Т.Код = &А')).toBe(false);
    expect(isStructurallyValidExpression('Т.Код = &А)')).toBe(false);
  });

  it('двойной оператор (не унарный +/-, для которого двойной знак — легитимная форма)', () => {
    expect(isStructurallyValidExpression('Т.Код = = &А')).toBe(false);
    expect(isStructurallyValidExpression('Т.Код > > &А')).toBe(false);
  });

  it('висячий оператор в начале/конце', () => {
    expect(isStructurallyValidExpression('Т.Код = &А ИЛИ')).toBe(false);
    expect(isStructurallyValidExpression('И Т.Код = &А')).toBe(false);
  });

  it('незакрытый ВЫБОР (нет КОНЕЦ)', () => {
    expect(isStructurallyValidExpression('ВЫБОР КОГДА Т.Код = &А ТОГДА 1')).toBe(false);
  });

  it('ВЫБОР совсем без веток КОГДА', () => {
    expect(isStructurallyValidExpression('ВЫБОР ИНАЧЕ 1 КОНЕЦ')).toBe(false);
  });

  it('ВЫРАЗИТЬ(…) без КАК', () => {
    expect(isStructurallyValidExpression('ВЫРАЗИТЬ(Т.Код СТРОКА(10))')).toBe(false);
  });

  it('незакрытый вызов функции', () => {
    expect(isStructurallyValidExpression('СУММА(Т.Сумма')).toBe(false);
    expect(isStructurallyValidExpression('ЕСТЬNULL(Т.Поле, 0')).toBe(false);
  });

  it('МЕЖДУ без второй границы / без И', () => {
    expect(isStructurallyValidExpression('Т.Дата МЕЖДУ &А')).toBe(false);
    expect(isStructurallyValidExpression('Т.Дата МЕЖДУ &А &Б')).toBe(false);
  });

  it('незакрытая строка внутри выражения', () => {
    expect(isStructurallyValidExpression('Т.Имя = "незакрытая')).toBe(false);
  });

  it('лишний токен после валидного выражения (остаток не потреблён)', () => {
    expect(isStructurallyValidExpression('Т.Код = &А Т.Имя')).toBe(false);
  });
});
