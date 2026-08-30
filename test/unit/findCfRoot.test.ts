import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { findConfigurationXmlDir } from '../../src/core/metadata/findCfRoot';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-cf-root-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('findConfigurationXmlDir', () => {
  it('returns null when nothing is found', () => {
    fs.mkdirSync(path.join(tmpDir, 'src'));
    expect(findConfigurationXmlDir(tmpDir)).toBeNull();
  });

  it('finds Configuration.xml directly under the search root', () => {
    fs.writeFileSync(path.join(tmpDir, 'Configuration.xml'), '<x/>');
    expect(findConfigurationXmlDir(tmpDir)).toBe(tmpDir);
  });

  it('finds Configuration.xml nested at an arbitrary location, not just src/cf', () => {
    const cfDir = path.join(tmpDir, 'exported', 'my-config', 'cf');
    fs.mkdirSync(cfDir, { recursive: true });
    fs.writeFileSync(path.join(cfDir, 'Configuration.xml'), '<x/>');
    expect(findConfigurationXmlDir(tmpDir)).toBe(cfDir);
  });

  it('does not descend into ignored directories such as node_modules', () => {
    const cfDir = path.join(tmpDir, 'node_modules', 'cf');
    fs.mkdirSync(cfDir, { recursive: true });
    fs.writeFileSync(path.join(cfDir, 'Configuration.xml'), '<x/>');
    expect(findConfigurationXmlDir(tmpDir)).toBeNull();
  });

  it('respects maxDepth and stops searching beyond it', () => {
    const deepDir = path.join(tmpDir, 'a', 'b', 'c', 'd');
    fs.mkdirSync(deepDir, { recursive: true });
    fs.writeFileSync(path.join(deepDir, 'Configuration.xml'), '<x/>');
    expect(findConfigurationXmlDir(tmpDir, 2)).toBeNull();
    expect(findConfigurationXmlDir(tmpDir, 4)).toBe(deepDir);
  });

  it('returns null when the search root itself does not exist', () => {
    expect(findConfigurationXmlDir(path.join(tmpDir, 'missing'))).toBeNull();
  });

  it('prefers a shallower match over a deeper one', () => {
    const shallow = path.join(tmpDir, 'shallow');
    const deep = path.join(tmpDir, 'a', 'deep');
    fs.mkdirSync(shallow, { recursive: true });
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(shallow, 'Configuration.xml'), '<x/>');
    fs.writeFileSync(path.join(deep, 'Configuration.xml'), '<x/>');
    expect(findConfigurationXmlDir(tmpDir)).toBe(shallow);
  });
});
