import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseConfiguration } from '../../src/core/metadata/parser/parseConfiguration';
import { isOwnedGeneration } from '../../src/core/metadata/parser/generationStore';
import * as yamlWriter from '../../src/core/metadata/parser/yamlWriter';

const FIXTURE_CF = path.resolve(__dirname, '../fixtures/cf');

let tmpDir: string;

afterEach(() => {
  vi.restoreAllMocks();
  if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Копия фикстуры `test/fixtures/cf` (1 справочник + 1 документ) в свежий temp-каталог
 * — реальные XML, не выдуманные, чтобы тест шёл через настоящие обработчики. */
function freshCfCopy(): { cfPath: string; outPath: string } {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parseconf-'));
  const cfPath = path.join(tmpDir, 'cf-src');
  fs.cpSync(FIXTURE_CF, cfPath, { recursive: true });
  const outPath = path.join(tmpDir, 'out');
  return { cfPath, outPath };
}

describe('parseConfiguration — happy path (PR-02 baseline поведения не меняет)', () => {
  it('строит генерацию, помечает владением, коммитит в <outPath>/cf', () => {
    const { cfPath, outPath } = freshCfCopy();
    const s = parseConfiguration(cfPath, outPath);

    expect(s.outCfDir).toBe(path.join(outPath, 'cf'));
    expect(s.redirected).toBe(false);
    expect(s.issues).toEqual([]);
    expect(s.skipped).toBe(0);
    expect(s.counts['Справочник']).toBe(1);
    expect(s.counts['Документ']).toBe(1);
    expect(fs.existsSync(path.join(s.outCfDir, 'configuration.yaml'))).toBe(true);
    expect(isOwnedGeneration(s.outCfDir)).toBe(true);
  });

  it('повторная сборка заменяет предыдущую генерацию (staging нигде не остаётся)', () => {
    const { cfPath, outPath } = freshCfCopy();
    parseConfiguration(cfPath, outPath);
    const s2 = parseConfiguration(cfPath, outPath);

    expect(s2.redirected).toBe(false);
    expect(fs.readdirSync(outPath)).toEqual(['cf']); // ни .building-*, ни .previous-*
  });
});

describe('parseConfiguration — source unavailable (ТЗ §9)', () => {
  it('бросает понятную ошибку и не создаёт ничего в outPath', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parseconf-'));
    const outPath = path.join(tmpDir, 'out');
    const missing = path.join(tmpDir, 'does-not-exist');

    expect(() => parseConfiguration(missing, outPath)).toThrow(/не найден/i);
    expect(fs.existsSync(outPath)).toBe(false);
  });
});

describe('parseConfiguration — recoverable per-object failures не валят генерацию', () => {
  it('битый XML одного объекта: попадает в issues, остальные объекты собираются, generation коммитится', () => {
    const { cfPath, outPath } = freshCfCopy();
    fs.writeFileSync(path.join(cfPath, 'Catalogs', 'Broken.xml'), '<not valid xml <<<');

    const s = parseConfiguration(cfPath, outPath);

    expect(s.issues.some(i => i.stage === 'parse' && i.file === 'Catalogs/Broken.xml' && !i.fatal)).toBe(true);
    expect(s.skipped).toBeGreaterThanOrEqual(1);
    // Хорошие объекты (Тест.xml, ТестДок.xml) всё равно собраны.
    expect(s.counts['Справочник']).toBe(1);
    expect(s.counts['Документ']).toBe(1);
    expect(isOwnedGeneration(s.outCfDir)).toBe(true);
  });

  it('ошибка записи одного объекта (writeYaml бросает): попадает в issues, не прерывает всю сборку', () => {
    const { cfPath, outPath } = freshCfCopy();

    const real = yamlWriter.writeYaml;
    const spy = vi.spyOn(yamlWriter, 'writeYaml').mockImplementation((filePath, data) => {
      if (filePath.includes(`${path.sep}Catalogs${path.sep}`)) throw new Error('ENOSPC (симуляция)');
      return real(filePath, data);
    });

    const s = parseConfiguration(cfPath, outPath);
    spy.mockRestore();

    expect(s.issues.some(i => i.stage === 'write' && !i.fatal && i.message.includes('ENOSPC'))).toBe(true);
    expect(s.counts['Справочник']).toBeUndefined(); // единственный справочник — тот, что не записался
    expect(s.counts['Документ']).toBe(1); // документ не пострадал
    expect(isOwnedGeneration(s.outCfDir)).toBe(true); // generation всё равно валидно закоммичена
  });
});

describe('parseConfiguration — last-known-good preservation (ТЗ §9, ключевой инвариант PR-02)', () => {
  it('если запись индекса генерации падает, ПРЕДЫДУЩАЯ успешная генерация остаётся нетронутой', () => {
    const { cfPath, outPath } = freshCfCopy();

    // Генерация N — успешна.
    const first = parseConfiguration(cfPath, outPath);
    const firstConfigContent = fs.readFileSync(path.join(first.outCfDir, 'configuration.yaml'), 'utf8');

    // Генерация N+1 — ломаем ИМЕННО запись индекса (configuration.yaml), т.е.
    // generation-integrity failure, а не recoverable per-object issue.
    const real = yamlWriter.writeYaml;
    const spy = vi.spyOn(yamlWriter, 'writeYaml').mockImplementation((filePath, data) => {
      if (path.basename(filePath) === 'configuration.yaml') throw new Error('EACCES (симуляция фатальной ошибки индекса)');
      return real(filePath, data);
    });

    expect(() => parseConfiguration(cfPath, outPath)).toThrow(/индекс/i);
    spy.mockRestore();

    // N осталась ЦЕЛОЙ: тот же каталог, то же содержимое, всё ещё "наша".
    expect(fs.existsSync(first.outCfDir)).toBe(true);
    expect(fs.readFileSync(path.join(first.outCfDir, 'configuration.yaml'), 'utf8')).toBe(firstConfigContent);
    expect(isOwnedGeneration(first.outCfDir)).toBe(true);
    // Никакого недостроенного staging-хвоста рядом не осталось (fатальная ошибка
    // ДО commit — parseConfiguration обязан подчистить staging сам).
    expect(fs.readdirSync(outPath)).toEqual(['cf']);
  });
});

describe('parseConfiguration — unowned existing "cf" (ТЗ §7)', () => {
  it('не удаляет существующий неопознанный cf, коммитит рядом в cf-managed', () => {
    const { cfPath, outPath } = freshCfCopy();
    const legacyCf = path.join(outPath, 'cf');
    fs.mkdirSync(legacyCf, { recursive: true });
    fs.writeFileSync(path.join(legacyCf, 'configuration.yaml'), 'legacy-pre-marker-output');

    const s = parseConfiguration(cfPath, outPath);

    expect(s.redirected).toBe(true);
    expect(s.outCfDir).toBe(legacyCf + '-managed');
    expect(fs.readFileSync(path.join(legacyCf, 'configuration.yaml'), 'utf8')).toBe('legacy-pre-marker-output');
    expect(isOwnedGeneration(legacyCf)).toBe(false);
    expect(isOwnedGeneration(s.outCfDir)).toBe(true);
  });
});
