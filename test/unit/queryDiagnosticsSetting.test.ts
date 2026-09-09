/**
 * Фиксирует наличие настройки `queryConsole.queryDiagnosticsEnabled` (включена
 * по умолчанию) — единственный способ пользователя выключить диагностику, если
 * она шумит на его коде (см. известный false-positive для конкатенации строк,
 * `queryDiagnosticsController.ts`).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')
) as { contributes: { configuration: { properties: Record<string, { type: string; default: unknown }> } } };

describe('package.json queryConsole.queryDiagnosticsEnabled setting', () => {
  it('is declared as a boolean, defaulting to true', () => {
    const prop = packageJson.contributes.configuration.properties['queryConsole.queryDiagnosticsEnabled'];
    expect(prop).toBeDefined();
    expect(prop.type).toBe('boolean');
    expect(prop.default).toBe(true);
  });
});
