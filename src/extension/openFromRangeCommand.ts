/**
 * Ідентифікатор команди «відкрити конструктор запиту на переданому офсеті»
 * (`{uri, offset}`) — реєструється в extension.ts (`openConstructorFromRange`),
 * викликається з клікабельного command-посилання всередині hover
 * (`queryHoverProvider.ts`'s `genericHint`).
 *
 * Раніше сюди ж вело й Ctrl/Cmd+Click через `QueryDocumentLinkProvider` — прибрано:
 * підкреслення DocumentLink неможливо приховати (VS Code завжди малює його поверх
 * діапазону лінка), а hover уже дає рівноцінний клікабельний шлях без модифікатора
 * і без жодної постійної візуальної позначки на тексті запиту.
 */
export const OPEN_FROM_RANGE_COMMAND = 'queryConsole1c.openFromRange';
