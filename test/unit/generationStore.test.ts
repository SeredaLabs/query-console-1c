import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  isOwnedGeneration, resolveManagedCfDir, stagingDirFor, cleanupStaleSiblings,
  commitGeneration, finalizeStaging, OWNER_ID, OWNER_FORMAT_VERSION,
} from '../../src/core/metadata/parser/generationStore';

let tmpDir: string;

afterEach(() => {
  vi.restoreAllMocks();
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

describe('commitGeneration — post-release audit P1 №5: второй rename падает', () => {
  it('откатывает discard обратно в target и пробрасывает исходную ошибку, не оставляя target отсутствующим', () => {
    const outPath = freshOutPath();
    commitGeneration(makeStagingWithContent(outPath), outPath); // первая, валидная генерация
    const cf = path.join(outPath, 'cf');
    fs.writeFileSync(path.join(cf, 'marker.yaml'), 'original-generation-content');

    // stagingDir, который никогда не создавался — второй renameSync внутри
    // commitGeneration гарантированно бросит ENOENT, симулируя реальный сбой
    // (staging исчез/ФС недоступна) БЕЗ моканья fs.
    const bogusStaging = path.join(outPath, 'cf.building-does-not-exist');
    expect(() => commitGeneration(bogusStaging, outPath)).toThrow();

    // target восстановлен — НЕ отсутствует, с ОРИГИНАЛЬНЫМ содержимым.
    expect(fs.existsSync(cf)).toBe(true);
    expect(isOwnedGeneration(cf)).toBe(true);
    expect(fs.readFileSync(path.join(cf, 'marker.yaml'), 'utf8')).toBe('original-generation-content');
    // Никакого осиротевшего .previous-* не осталось — откат переименовал его обратно.
    const previousSiblings = fs.readdirSync(outPath).filter(e => e.startsWith('cf.previous-'));
    expect(previousSiblings).toEqual([]);
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
  it('preserves unowned directories even when their names match staging/discard prefixes', () => {
    const outPath = freshOutPath();
    const cf = path.join(outPath, 'cf');
    fs.mkdirSync(cf, { recursive: true });
    finalizeStaging(cf);
    fs.mkdirSync(cf + '-managed', { recursive: true });
    const staging = makeStagingWithContent(outPath, false);
    const previous = cf + '.previous-5678';
    fs.mkdirSync(previous, { recursive: true });
    fs.writeFileSync(path.join(previous, 'user-content.txt'), 'user backup');
    fs.mkdirSync(path.join(outPath, 'unrelated-dir'), { recursive: true });

    cleanupStaleSiblings(outPath);

    const remaining = fs.readdirSync(outPath).sort();
    expect(remaining).toEqual(['cf', 'cf-managed', path.basename(staging), path.basename(previous), 'unrelated-dir'].sort());
    expect(fs.readFileSync(path.join(staging, 'configuration.yaml'), 'utf8')).toBe('version: 1\n');
    expect(fs.readFileSync(path.join(previous, 'user-content.txt'), 'utf8')).toBe('user backup');
  });

  it.each([
    '{not json',
    'null',
    JSON.stringify({ owner: 'someone.else', formatVersion: 1 }),
    JSON.stringify({ owner: OWNER_ID }),
  ])('preserves both sibling kinds with an invalid ownership marker: %s', marker => {
    const outPath = freshOutPath();
    commitGeneration(makeStagingWithContent(outPath), outPath);
    const siblings = [makeStagingWithContent(outPath), path.join(outPath, 'cf.previous-1234')];
    for (const dir of siblings) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, '.owner.json'), marker);
      fs.writeFileSync(path.join(dir, 'user-content.txt'), 'preserve');
    }

    cleanupStaleSiblings(outPath);

    for (const dir of siblings) expect(fs.readFileSync(path.join(dir, 'user-content.txt'), 'utf8')).toBe('preserve');
  });

  it('removes owned staging only when its process is confirmed gone', () => {
    const outPath = freshOutPath();
    const staging = makeStagingWithContent(outPath);
    const probe = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('process gone'), { code: 'ESRCH' });
    });

    cleanupStaleSiblings(outPath);

    expect(probe).toHaveBeenCalledWith(process.pid, 0);
    expect(fs.existsSync(staging)).toBe(false);
  });

  it('preserves finalized staging belonging to a live process', () => {
    const outPath = freshOutPath();
    const staging = makeStagingWithContent(outPath);
    const probe = vi.spyOn(process, 'kill').mockReturnValue(true);

    cleanupStaleSiblings(outPath);

    expect(probe).toHaveBeenCalledWith(process.pid, 0);
    expect(fs.readFileSync(path.join(staging, 'configuration.yaml'), 'utf8')).toBe('version: 1\n');
  });

  it.each(['EPERM', 'EACCES', undefined])('preserves staging when process status is uncertain (%s)', code => {
    const outPath = freshOutPath();
    const staging = makeStagingWithContent(outPath);
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('cannot check process'), { code });
    });

    cleanupStaleSiblings(outPath);

    expect(fs.existsSync(staging)).toBe(true);
  });

  it('preserves owned staging when its name does not identify a process', () => {
    const outPath = freshOutPath();
    const staging = path.join(outPath, 'cf.building-backup');
    fs.mkdirSync(staging);
    finalizeStaging(staging);

    cleanupStaleSiblings(outPath);

    expect(fs.existsSync(staging)).toBe(true);
  });

  it('removes owned previous generations when an owned current generation exists', () => {
    const outPath = freshOutPath();
    commitGeneration(makeStagingWithContent(outPath), outPath);
    const previous = path.join(outPath, 'cf.previous-1234');
    fs.renameSync(makeStagingWithContent(outPath), previous);

    cleanupStaleSiblings(outPath);

    expect(fs.existsSync(previous)).toBe(false);
    expect(isOwnedGeneration(path.join(outPath, 'cf'))).toBe(true);
  });

  it('preserves owned previous generations when the current directory is unowned', () => {
    const outPath = freshOutPath();
    fs.mkdirSync(path.join(outPath, 'cf'));
    const previous = path.join(outPath, 'cf.previous-1234');
    fs.renameSync(makeStagingWithContent(outPath), previous);

    cleanupStaleSiblings(outPath);

    expect(fs.readFileSync(path.join(previous, 'configuration.yaml'), 'utf8')).toBe('version: 1\n');
  });

  it('does not follow a sibling symlink to establish ownership', () => {
    const outPath = freshOutPath();
    commitGeneration(makeStagingWithContent(outPath), outPath);
    const link = path.join(outPath, 'cf.previous-1234');
    fs.symlinkSync(path.join(outPath, 'cf'), link, 'junction');

    cleanupStaleSiblings(outPath);

    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(isOwnedGeneration(path.join(outPath, 'cf'))).toBe(true);
  });

  it('preserves the recovery copy when the current generation is only a symlink', () => {
    const outPath = freshOutPath();
    const previous = path.join(outPath, 'cf.previous-1234');
    fs.renameSync(makeStagingWithContent(outPath), previous);
    fs.symlinkSync(previous, path.join(outPath, 'cf'), 'junction');

    cleanupStaleSiblings(outPath);

    expect(fs.readFileSync(path.join(previous, 'configuration.yaml'), 'utf8')).toBe('version: 1\n');
  });

  it('post-release RE-audit P1 №5 (двойной сбой): НЕ удаляет .previous-*, у которого target отсутствует', () => {
    const outPath = freshOutPath();
    // Симулируем состояние ПОСЛЕ двойного сбоя commitGeneration: и второй
    // rename, и его собственный rollback оба упали — "cf" отсутствует
    // вообще, а .previous-* — единственная уцелевшая копия.
    fs.mkdirSync(path.join(outPath, 'cf.previous-9999'), { recursive: true });
    fs.writeFileSync(path.join(outPath, 'cf.previous-9999', 'configuration.yaml'), 'last-surviving-copy');
    finalizeStaging(path.join(outPath, 'cf.previous-9999'));

    cleanupStaleSiblings(outPath);

    expect(fs.existsSync(path.join(outPath, 'cf.previous-9999'))).toBe(true);
    expect(fs.readFileSync(path.join(outPath, 'cf.previous-9999', 'configuration.yaml'), 'utf8')).toBe('last-surviving-copy');
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
