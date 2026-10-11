import { childByLocalName, nodeText } from './dom';
import { parseChildObjects } from './attribute';
import type { ParsedObject, ParsedField, ParsedType } from './model';

export function parseExchangePlan(objectEl: any): ParsedObject | null {
  const props = childByLocalName(objectEl, 'Properties');
  if (!props) return null;
  const name = nodeText(childByLocalName(props, 'Name'));
  if (!name) return null;
  const uuid = objectEl.getAttribute('uuid') || '';
  const fullName = `ПланОбмена.${name}`;

  const codeLength = Number(nodeText(childByLocalName(props, 'CodeLength')) || '0');
  const descriptionLength = Number(nodeText(childByLocalName(props, 'DescriptionLength')) || '0');

  const fields: ParsedField[] = [];
  const std = (n: string, types: ParsedType[]) =>
    fields.push({ name: n, category: 'standard', types });

  // Порядок стандартных полей по эталону конструктора запросов 1С.
  // План обмена не имеет предопределённых данных — поля Предопределенный/
  // ИмяПредопределенныхДанных отсутствуют.
  std('Ссылка', [{ kind: 'ref', ref: fullName }]);
  std('ВерсияДанных', [{ kind: 'timestamp' }]);
  std('ПометкаУдаления', [{ kind: 'Булево' }]);
  std('ЭтотУзел', [{ kind: 'Булево' }]);
  if (codeLength > 0) {
    std('Код', [{ kind: 'Строка', length: codeLength }]);
  }
  if (descriptionLength > 0) {
    std('Наименование', [{ kind: 'Строка', length: descriptionLength }]);
  }
  std('НомерОтправленного', [{ kind: 'Число', digits: 9, fractionDigits: 0 }]);
  std('НомерПринятого', [{ kind: 'Число', digits: 9, fractionDigits: 0 }]);
  // C29: the XML lists the `ExchangeDate` standard attribute, but it is not a query
  // field (platform: `Field not found`, SL_kza 2026-10-11), so it is not a column here.

  const { attributes, tabularSections } = parseChildObjects(objectEl);
  fields.push(...attributes);

  return {
    version: 1,
    kind: 'ПланОбмена',
    name,
    fullName,
    uuid,
    fields,
    ...(tabularSections.length ? { tabularSections } : {}),
  };
}
