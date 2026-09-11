import { describe, it, expect } from 'vitest';
import { parseXml } from '../../src/core/metadata/parser/dom';
import { parseAttribute, parseChildObjects } from '../../src/core/metadata/parser/attribute';

function attrEl(propsInner: string): any {
  const doc = parseXml(
    `<Attribute uuid="x" xmlns:v8="urn:v8"><Properties>${propsInner}</Properties></Attribute>`
  );
  return doc!.documentElement;
}

describe('parseAttribute: синонім поля', () => {
  it('читає синонім, коли він присутній', () => {
    const el = attrEl(
      '<Name>БазоваяЕдиницаИзмерения</Name>' +
        '<Synonym><v8:item><v8:lang>ru</v8:lang><v8:content>Базовая единица измерения</v8:content></v8:item></Synonym>' +
        '<Type><v8:Type>cfg:CatalogRef.КлассификаторЕдиницИзмерения</v8:Type></Type>'
    );
    const f = parseAttribute(el);
    expect(f).toEqual({
      name: 'БазоваяЕдиницаИзмерения',
      category: 'attribute',
      types: [{ kind: 'ref', ref: 'Справочник.КлассификаторЕдиницИзмерения' }],
      synonym: 'Базовая единица измерения',
    });
  });

  it('без <Synonym> — поле без synonym (не порожній рядок, не undefined-ключ)', () => {
    const el = attrEl('<Name>Артикул</Name><Type><v8:Type>xs:string</v8:Type></Type>');
    const f = parseAttribute(el);
    expect(f).toEqual({ name: 'Артикул', category: 'attribute', types: [{ kind: 'Строка' }] });
    expect(f).not.toHaveProperty('synonym');
  });

  it('багатомовний Synonym: береться ru, а не перший-ліпший <item>', () => {
    const el = attrEl(
      '<Name>Price</Name>' +
        '<Synonym>' +
        '<v8:item><v8:lang>en</v8:lang><v8:content>Price</v8:content></v8:item>' +
        '<v8:item><v8:lang>ru</v8:lang><v8:content>Цена</v8:content></v8:item>' +
        '</Synonym>' +
        '<Type><v8:Type>xs:decimal</v8:Type></Type>'
    );
    const f = parseAttribute(el);
    expect(f!.synonym).toBe('Цена');
  });

  it('Synonym без ru: fallback на перший <item>', () => {
    const el = attrEl(
      '<Name>Price</Name>' +
        '<Synonym><v8:item><v8:lang>en</v8:lang><v8:content>Price</v8:content></v8:item></Synonym>' +
        '<Type><v8:Type>xs:decimal</v8:Type></Type>'
    );
    const f = parseAttribute(el);
    expect(f!.synonym).toBe('Price');
  });
});

describe('parseChildObjects: синонім проходить крізь dimension/resource', () => {
  it('Dimension зберігає synonym з базового parseAttribute', () => {
    const doc = parseXml(
      '<Object xmlns:v8="urn:v8"><ChildObjects>' +
        '<Dimension uuid="d1"><Properties>' +
        '<Name>Валюта</Name>' +
        '<Synonym><v8:item><v8:lang>ru</v8:lang><v8:content>Валюта курса</v8:content></v8:item></Synonym>' +
        '<Type><v8:Type>cfg:CatalogRef.Валюты</v8:Type></Type>' +
        '</Properties></Dimension>' +
        '</ChildObjects></Object>'
    );
    const { dimensions } = parseChildObjects(doc!.documentElement);
    expect(dimensions).toHaveLength(1);
    expect(dimensions[0].synonym).toBe('Валюта курса');
    expect(dimensions[0].category).toBe('dimension');
  });
});
