import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  isOwnedGeneration, resolveManagedCfDir, stagingDirFor, cleanupStaleSiblings,
  commitGeneration, finalizeStaging, OWNER_ID, OWNER_FORMAT_VERSION,
} from '../../src/core/metadata/parser/generationStore';

let tmpDir: string;

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

function freshOutPath(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genstore-'));
  return tmpDir;
}

function makeStagingWithContent(outPath: string, marker = true): string {
  const staging = stagingDirFor(outPath);
  fs.mkdirSync(staging, { recursive: true });
  fs.writeFileSync(path.join(staging, 'configuration.yaml'), 'version: 1\n');
  if (marker) finalizeStaging(staging);
  return staging;
}

describe('isOwnedGeneration', () => {
  it('false — каталог не существует', () => {
    const outPath = freshOutPath();
    expect(isOwnedGeneration(path.join(outPath, 'cf'))).toBe(false);
  });

  it('false — каталог существует, но маркера нет (легаси/чужой вывод)', () => {
    const outPath = freshOutPath();
    const cf = path.join(outPath, 'cf');
    fs.mkdirSync(cf, { recursive: true });
    fs.writeFileSync(path.join(cf, 'configuration.yaml'), 'version: 1\n');
    expect(isOwnedGeneration(cf)).toBe(false);
  });

  it('false — маркер повреждён (невалидный JSON)', () => {
    const outPath = freshOutPath();
    const cf = path.join(outPath, 'cf');
    fs.mkdirSync(cf, { recursive: true });
    fs.writeFileSync(path.join(cf, '.owner.json'), '{not json');
    expect(isOwnedGeneration(cf)).toBe(false);
  });

  it('false — маркер валиден как JSON, но owner чужой', () => {
    const outPath = freshOutPath();
    const cf = path.join(outPath, 'cf');
    fs.mkdirSync(cf, { recursive: true });
    fs.writeFileSync(path.join(cf, '.owner.json'), JSON.stringify({ owner: 'someone.else', formatVersion: 1 }));
    expect(isOwnedGeneration(cf)).toBe(false);
  });

  it('true — валидный маркер нашего расширения', () => {
    const outPath = freshOutPath();
    const cf = path.join(outPath, 'cf');
    fs.mkdirSync(cf, { recursive: true });
    fs.writeFileSync(path.join(cf, '.owner.json'), JSON.stringify({ owner: OWNER_ID, formatVersion: OWNER_FORMAT_VERSION }));
    expect(isOwnedGeneration(cf)).toBe(true);
  });
});

describe('commitGeneration — первая сборка (target не существует)', () => {
  it('переименовывает staging в cf, redirected:false', () => {
    const outPath = freshOutPath();
    const staging = makeStagingWithContent(outPath);
    const result = commitGeneration(staging, outPath);
    expect(result).toEqual({ targetDir: path.join(outPath, 'cf'), redirected: false });
    expect(fs.existsSync(path.join(outPath, 'cf', 'configuration.yaml'))).toBe(true);
    expect(isOwnedGeneration(path.join(outPath, 'cf'))).toBe(true);
    expect(fs.existsSync(staging)).toBe(false);
  });
});

describe('commitGeneration — target существует и наш (повторная сборка)', () => {
  it('заменяет старую генерацию новой, старое содержимое исчезает', () => {
    const outPath = freshOutPath();
    // Первая генерация.
    const staging1 = makeStagingWithContent(outPath);
    commitGeneration(staging1, outPath);
    const cf = path.join(outPath, 'cf');
    fs.writeFileSync(path.join(cf, 'Catalogs-marker.yaml'), 'old-generation-file');

    // Вторая генерация — не содержит Catalogs-marker.yaml.
    const staging2 = makeStagingWithContent(outPath);
    const result = commitGeneration(staging2, outPath);

    expect(result).toEqual({ targetDir: cf, redirected: false });
    expect(fs.existsSync(path.join(cf, 'Catalogs-marker.yaml'))).toBe(false); // старое содержимое ушло
    expect(fs.existsSync(path.join(cf, 'configuration.yaml'))).toBe(true);   // новое на месте
    expect(isOwnedGeneration(cf)).toBe(true);
    // Никаких discard-хвостов не осталось.
    const siblings = fs.readdirSync(outPath);
    expect(siblings).toEqual(['cf']);
  });
});

describe('commitGeneration — target существует, но НЕ наш (legacy/чужой каталог)', () => {
  it('не трогает существующий unowned cf, коммитит в cf-managed', () => {
    const outPath = freshOutPath();
    const cf = path.join(outPath, 'cf');
    fs.mkdirSync(cf, { recursive: true });
    fs.writeFileSync(path.join(cf, 'configuration.yaml'), 'legacy-unmarked-output');

    const staging = makeStagingWithContent(outPath);
    const result = commitGeneration(staging, outPath);

    expect(result.redirected).toBe(true);
    expect(result.targetDir).toBe(cf + '-managed');
    // Легаси-каталог остался БУКВАЛЬНО нетронутым.
    expect(fs.readFileSync(path.join(cf, 'configuration.yaml'), 'utf8')).toBe('legacy-unmarked-output');
    expect(isOwnedGeneration(cf)).toBe(false);
    // Новая генерация — рядом, помечена как наша.
    expect(isOwnedGeneration(cf + '-managed')).toBe(true);
  });

  it('повторная сборка после редиректа коммитит в уже существующий managed, легаси всё ещё не тронут', () => {
    const outPath = freshOutPath();
    const cf = path.join(outPath, 'cf');
    fs.mkdirSync(cf, { recursive: true });
    fs.writeFileSync(path.join(cf, 'configuration.yaml'), 'legacy-unmarked-output');

    commitGeneration(makeStagingWithContent(outPath), outPath); // первый редирект
    const result = commitGeneration(makeStagingWithContent(outPath), outPath); // повторная сборка

    expect(result.redirected).toBe(true);
    expect(result.targetDir).toBe(cf + '-managed');
    expect(fs.readFileSync(path.join(cf, 'configuration.yaml'), 'utf8')).toBe('legacy-unmarked-output');
    // Никаких discard-хвостов возле managed не осталось.
    expect(fs.readdirSync(outPath).sort()).toEqual(['cf', 'cf-managed']);
  });
});

describe('resolveManagedCfDir', () => {
  it('возвращает base "cf", если managed не существует и владения нет', () => {
    const outPath = freshOutPath();
    expect(resolveManagedCfDir(outPath)).toBe(path.join(outPath, 'cf'));
  });

  it('возвращает base "cf", если он существует и наш (managed ещё не создавался)', () => {
    const outPath = freshOutPath();
    commitGeneration(makeStagingWithContent(outPath), outPath);
    expect(resolveManagedCfDir(outPath)).toBe(path.join(outPath, 'cf'));
  });

  it('возвращает "cf-managed", если base unowned, но managed существует и наш', () => {
    const outPath = freshOutPath();
    const cf = path.join(outPath, 'cf');
    fs.mkdirSync(cf, { recursive: true });
    fs.writeFileSync(path.join(cf, 'configuration.yaml'), 'legacy');
    commitGeneration(makeStagingWithContent(outPath), outPath);
    expect(resolveManagedCfDir(outPath)).toBe(cf + '-managed');
  });
});

describe('cleanupStaleSiblings', () => {
  it('удаляет только .building-*/.previous-* siblings, не трогает cf/cf-managed/чужие каталоги', () => {
    const outPath = freshOutPath();
    const cf = path.join(outPath, 'cf');
    fs.mkdirSync(cf, { recursive: true });
    fs.mkdirSync(cf + '-managed', { recursive: true });
    fs.mkdirSync(cf + '.building-1234', { recursive: true });
    fs.mkdirSync(cf + '.previous-5678', { recursive: true });
    fs.mkdirSync(path.join(outPath, 'unrelated-dir'), { recursive: true });

    cleanupStaleSiblings(outPath);

    const remaining = fs.readdirSync(outPath).sort();
    expect(remaining).toEqual(['cf', 'cf-managed', 'unrelated-dir']);
  });
});

describe('stagingDirFor', () => {
  it('возвращает разные пути при повторных вызовах (без коллизий параллельных сборок)', () => {
    const outPath = freshOutPath();
    const a = stagingDirFor(outPath);
    const b = stagingDirFor(outPath);
    expect(a).not.toBe(b);
    expect(a.startsWith(path.join(outPath, 'cf.building-'))).toBe(true);
  });
});
