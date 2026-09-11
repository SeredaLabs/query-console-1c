export type FieldKind = 'standard' | 'attribute' | 'dimension' | 'resource';

export type TableKind =
  | 'Справочник' | 'Документ' | 'ТабличнаяЧасть'
  | 'Константа' | 'Перечисление'
  | 'ПланОбмена' | 'ПланВидовХарактеристик' | 'ПланСчетов' | 'ПланВидовРасчета'
  | 'БизнесПроцесс' | 'Задача'
  | 'РегистрСведений' | 'РегистрНакопления' | 'РегистрБухгалтерии' | 'РегистрРасчета'
  | 'Последовательность' | 'ЖурналДокументов' | 'КритерийОтбора'
  // 7.8.17: временная таблица пакета (создана ПОМЕСТИТЬ/ДОБАВИТЬ) — отдельная группа дерева.
  | 'ВременнаяТаблица';

export interface MetaType {
  primitive?: 'Строка' | 'Число' | 'Булево' | 'Дата';
  ref?: { kind: TableKind; name: string };
  /** Для строкового типа: квалификатор длины (0 при неограниченной длине). */
  length?: number;
  /** Для строкового типа: 'Fixed' | 'Variable'. */
  allowedLength?: string;
  /** Для числового типа: общее количество разрядов (0 при неограниченной разрядности). */
  digits?: number;
  /** Для числового типа: количество разрядов дробной части. */
  fractionDigits?: number;
  /**
   * Тип, ще не розпізнаний парсером метаданих (наприклад, рідкісний
   * `cfg:<Вид>Ref`, якого немає у REF_PREFIX) — сирий XML-рядок типу, щоб
   * hover/completion могли показати хоч щось замість мовчазної порожнечі.
   * Ніколи не співіснує з `primitive`/`ref` для одного запису.
   */
  raw?: string;
}

export interface MetaField {
  name: string;
  kind: FieldKind;
  types: MetaType[];
  /** Людський синонім поля з метаданих, якщо він реально доступний (не read для стандартних полів). */
  synonym?: string;
}

export interface VirtualTableInfo {
  slice: 'СрезПервых' | 'СрезПоследних' | 'Обороты' | 'Остатки' | 'ОстаткиИОбороты'
       | 'ОборотыДтКт' | 'ДвиженияССубконто';
  baseFullName: string;
  correspondence?: boolean; // регистр бухгалтерии: состав/арность Обороты, наличие ОборотыДтКт
}

export interface MetaTable {
  kind: TableKind;
  name: string;
  fullName: string;
  fields: MetaField[];
  tabularSections?: MetaTable[];
  virtual?: VirtualTableInfo;
  hierarchical?: boolean; // справочник/ПВХ: иерархический (для суффикса ИЕРАРХИЯ)
  subcontoCount?: number; // регистр бухгалтерии: maxExtDimensionCount плана счетов (0 → нет ВидыСубконто)
  correspondence?: boolean; // регистр бухгалтерии: поддержка корреспонденции
}

export interface MetadataModel {
  version: 1;
  tables: MetaTable[];
}
