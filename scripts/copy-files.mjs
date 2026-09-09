#!/usr/bin/env node
/**
 * Cross-platform replacement for the Unix `cp` shell command used in a
 * couple of npm build scripts — `cp` doesn't exist on a stock Windows
 * shell (see GitHub issue #1). Mirrors just the two call shapes this
 * project actually needs, matching `cp`'s own semantics for each:
 *
 *   node scripts/copy-files.mjs <dest-dir>/ <src...>   copy each src INTO dest-dir
 *   node scripts/copy-files.mjs <dest-file> <src>      copy/rename a single file
 *
 * Destination is treated as a directory when it ends with a path separator
 * or more than one source is given (same rule `cp` itself uses).
 */
import fs from 'node:fs';
import path from 'node:path';

const [, , dest, ...sources] = process.argv;
if (!dest || sources.length === 0) {
  console.error('Usage: node scripts/copy-files.mjs <dest> <src...>');
  process.exit(1);
}

const destIsDir = dest.endsWith('/') || dest.endsWith(path.sep) || sources.length > 1;

if (destIsDir) {
  fs.mkdirSync(dest, { recursive: true });
  for (const src of sources) {
    fs.cpSync(src, path.join(dest, path.basename(src)));
  }
} else {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(sources[0], dest);
}
