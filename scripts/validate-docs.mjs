import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import GithubSlugger from 'github-slugger';

const root = process.cwd();
const locales = ['en', 'uk', 'ru'];
const errors = [];

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

function sameKeys(label, canonical, candidate) {
  const expected = Object.keys(canonical).sort();
  const actual = Object.keys(candidate).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    const missing = expected.filter(key => !actual.includes(key));
    const extra = actual.filter(key => !expected.includes(key));
    errors.push(`${label}: key mismatch; missing=[${missing.join(', ')}], extra=[${extra.join(', ')}]`);
  }
}

function placeholders(value) {
  return [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
}

function checkJsonFamily(label, files) {
  const canonical = readJson(files[0]);
  for (const file of files.slice(1)) {
    const candidate = readJson(file);
    sameKeys(`${label} ${file}`, canonical, candidate);
    for (const key of Object.keys(canonical)) {
      if (!(key in candidate)) continue;
      if (JSON.stringify(placeholders(canonical[key])) !== JSON.stringify(placeholders(candidate[key]))) {
        errors.push(`${file}: placeholders differ for ${key}`);
      }
    }
  }
  return canonical;
}

const webview = checkJsonFamily('WebView', locales.map(locale => `src/webview/i18n/${locale}.json`));
void webview;
const manifest = checkJsonFamily('manifest', ['package.nls.json', 'package.nls.uk.json', 'package.nls.ru.json']);
checkJsonFamily('runtime', ['l10n/bundle.l10n.json', 'l10n/bundle.l10n.uk.json', 'l10n/bundle.l10n.ru.json']);

const packageJson = readJson('package.json');
const serializedManifest = JSON.stringify(packageJson);
for (const match of serializedManifest.matchAll(/%([^%]+)%/g)) {
  if (!(match[1] in manifest)) errors.push(`package.json: unresolved localization key ${match[1]}`);
}

const manifestByLocale = {
  en: readJson('package.nls.json'),
  uk: readJson('package.nls.uk.json'),
  ru: readJson('package.nls.ru.json'),
};

for (const locale of locales) {
  const settingsFile = `docs/${locale}/settings.md`;
  const settingsText = fs.readFileSync(path.join(root, settingsFile), 'utf8');
  const manifestSettings = Object.keys(packageJson.contributes?.configuration?.properties ?? {});
  const documentedSettings = [...settingsText.matchAll(/`(queryConsole\.[A-Za-z0-9]+)`/g)]
    .map(match => match[1]);

  for (const setting of manifestSettings) {
    if (!documentedSettings.includes(setting)) {
      errors.push(`${settingsFile}: missing manifest setting ${setting}`);
    }
  }
  for (const setting of new Set(documentedSettings)) {
    if (!manifestSettings.includes(setting)) {
      errors.push(`${settingsFile}: unknown setting ${setting}`);
    }
  }

  const gettingStartedFile = `docs/${locale}/getting-started.md`;
  const gettingStartedText = fs.readFileSync(path.join(root, gettingStartedFile), 'utf8');
  for (const command of packageJson.contributes?.commands ?? []) {
    const titleKey = command.title.match(/^%([^%]+)%$/)?.[1];
    const categoryKey = command.category?.match(/^%([^%]+)%$/)?.[1];
    const title = titleKey ? manifestByLocale[locale][titleKey] : command.title;
    const category = categoryKey ? manifestByLocale[locale][categoryKey] : command.category;
    const visibleTitle = category ? `${category}: ${title}` : title;
    if (!gettingStartedText.includes(`**${visibleTitle}**`)) {
      errors.push(`${gettingStartedFile}: missing manifest command title ${visibleTitle}`);
    }
  }
}

const localeFiles = Object.fromEntries(locales.map(locale => [
  locale,
  fs.readdirSync(path.join(root, 'docs', locale)).filter(file => file.endsWith('.md')).sort(),
]));
for (const locale of locales.slice(1)) {
  if (JSON.stringify(localeFiles.en) !== JSON.stringify(localeFiles[locale])) {
    errors.push(`docs/${locale}: filenames do not match docs/en`);
  }
}

function frontMatter(text) {
  // An HTML comment, not a --- YAML block: GitHub renders a leading --- block
  // as a visible table on the page, which is meaningless clutter for readers
  // of a translated user guide. An HTML comment is silently stripped by every
  // Markdown renderer but still readable by this script.
  const match = text.match(/^<!--\n([\s\S]*?)\n-->\n/);
  if (!match) return null;
  return Object.fromEntries(match[1].split('\n').map(line => {
    const separator = line.indexOf(':');
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  }));
}

function headingLevels(text) {
  return text.split('\n').filter(line => /^#{1,6} /.test(line)).map(line => line.indexOf(' '));
}

for (const file of localeFiles.en) {
  const texts = Object.fromEntries(locales.map(locale => [
    locale,
    fs.readFileSync(path.join(root, 'docs', locale, file), 'utf8'),
  ]));
  const metadata = Object.fromEntries(locales.map(locale => [locale, frontMatter(texts[locale])]));
  for (const locale of locales) {
    if (!metadata[locale]?.source_version || !metadata[locale]?.translation_status) {
      errors.push(`docs/${locale}/${file}: missing translation front matter`);
    }
  }
  for (const locale of locales.slice(1)) {
    if (metadata[locale]?.source_version !== metadata.en?.source_version) {
      errors.push(`docs/${locale}/${file}: stale source_version`);
    }
    if (JSON.stringify(headingLevels(texts[locale])) !== JSON.stringify(headingLevels(texts.en))) {
      errors.push(`docs/${locale}/${file}: heading levels do not match English`);
    }
  }
}

function listMarkdown(relativeDirectory) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap(entry => {
    const relative = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return listMarkdown(relative);
    return entry.name.endsWith('.md') ? [relative] : [];
  });
}

const markdownFiles = [...new Set([
  ...fs.readdirSync(root).filter(file => file.endsWith('.md')),
  ...listMarkdown('docs'),
  ...listMarkdown('tooling'),
])].sort();

// ---------------------------------------------------------------------------
// Case-sensitive existence check. `fs.existsSync` resolves case-insensitively
// on the macOS/Windows filesystems most contributors develop on, but CI runs
// on Ubuntu (case-sensitive) — a path whose case doesn't exactly match the
// real file works locally and breaks in CI. Walk each path segment against
// the real directory listing instead of trusting the OS's own resolution.
// ---------------------------------------------------------------------------
const readdirCache = new Map();
function readdirCached(directory) {
  let entries = readdirCache.get(directory);
  if (!entries) {
    entries = fs.existsSync(directory) ? fs.readdirSync(directory) : [];
    readdirCache.set(directory, entries);
  }
  return entries;
}

function existsCaseSensitive(absolutePath) {
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith('..')) return fs.existsSync(absolutePath); // outside repo — best effort
  const segments = relative.split(path.sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    if (!readdirCached(current).includes(segment)) return false;
    current = path.join(current, segment);
  }
  return true;
}

// ---------------------------------------------------------------------------
// GitHub-compatible heading anchors. A real slugger (not a hand-rolled
// approximation) matters here: GitHub's own rules for stripping punctuation,
// preserving non-ASCII letters, and suffixing repeated headings on the same
// page (`#settings`, `#settings-1`, `#settings-2`, …) are exactly what a
// simplified slugifier gets subtly wrong, which would make the validator
// itself produce false positives on legitimate anchors.
// ---------------------------------------------------------------------------
const headingSlugsCache = new Map();
function headingSlugsFor(absolutePath) {
  let slugs = headingSlugsCache.get(absolutePath);
  if (slugs) return slugs;
  slugs = new Set();
  if (existsCaseSensitive(absolutePath) && fs.statSync(absolutePath).isFile()) {
    const text = fs.readFileSync(absolutePath, 'utf8');
    const slugger = new GithubSlugger();
    for (const line of text.split('\n')) {
      const match = line.match(/^#{1,6} +(.+?)\s*#*\s*$/);
      if (match) slugs.add(slugger.slug(match[1]));
    }
  }
  headingSlugsCache.set(absolutePath, slugs);
  return slugs;
}

// ---------------------------------------------------------------------------
// Shared link/asset-target resolution, used by both Markdown and HTML checks.
// `sourceFile` is repo-relative (for error messages); `targetFile` is the
// containing file's absolute path (for relative resolution and same-file
// anchors); `rawTarget` is exactly what appeared in `(...)`/`href=".."`/`src=".."`.
// ---------------------------------------------------------------------------
function checkLinkTarget(sourceFile, absoluteContainingFile, rawTarget, kind) {
  let target = rawTarget.trim().replace(/^<|>$/g, '');
  if (!target || /^(?:https?:|mailto:)/.test(target)) return;

  const [pathPart, anchorPart] = target.split('#');
  const anchor = anchorPart !== undefined ? decodeURIComponent(anchorPart) : undefined;
  const decodedPath = decodeURIComponent(pathPart.split('?')[0]);

  const resolvedFile = decodedPath ? path.resolve(path.dirname(absoluteContainingFile), decodedPath) : absoluteContainingFile;
  if (decodedPath && !existsCaseSensitive(resolvedFile)) {
    errors.push(`${sourceFile}: broken ${kind} ${rawTarget}`);
    return;
  }
  if (anchor === undefined) return;
  if (!resolvedFile.endsWith('.md')) return; // anchors only meaningful for our own Markdown targets
  if (!headingSlugsFor(resolvedFile).has(anchor)) {
    errors.push(`${sourceFile}: broken anchor ${rawTarget} (no heading slugs to "${anchor}" in ${path.relative(root, resolvedFile)})`);
  }
}

const docLinkGraph = new Map(); // repo-relative markdown file -> Set of repo-relative markdown files it links to

for (const file of markdownFiles) {
  const absolute = path.join(root, file);
  const text = fs.readFileSync(absolute, 'utf8');
  const outbound = new Set();

  // Markdown inline links/images: [text](target) / ![alt](target)
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    checkLinkTarget(file, absolute, match[1], 'link');
  }

  // Reference-style links: [text][id] / [id][] defined via `[id]: target`.
  const definitions = new Map();
  for (const match of text.matchAll(/^\s*\[([^\]]+)\]:\s*(\S+)/gm)) {
    definitions.set(match[1].toLowerCase(), match[2]);
  }
  for (const match of text.matchAll(/!?\[([^\]]*)\]\[([^\]]*)\]/g)) {
    const id = (match[2] || match[1]).toLowerCase();
    const target = definitions.get(id);
    if (target) checkLinkTarget(file, absolute, target, 'reference-style link');
  }

  // HTML anchors/images: <a href="...">, <img src="...">.
  for (const match of text.matchAll(/<a\s[^>]*\bhref=["']([^"']+)["']/gi)) {
    checkLinkTarget(file, absolute, match[1], 'HTML href');
  }
  for (const match of text.matchAll(/<img\s[^>]*\bsrc=["']([^"']+)["']/gi)) {
    checkLinkTarget(file, absolute, match[1], 'HTML src');
  }

  // Build the doc-to-doc graph for orphan-page detection (docs/**/*.md only;
  // resolve every link target above that points at another repo Markdown file).
  if (file.startsWith(`docs${path.sep}`) || file === 'README.md') {
    for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const raw = match[1].trim().replace(/^<|>$/g, '');
      if (/^(?:https?:|mailto:)/.test(raw)) continue;
      const decodedPath = decodeURIComponent(raw.split('#')[0].split('?')[0]);
      if (!decodedPath) continue;
      const resolved = path.resolve(path.dirname(absolute), decodedPath);
      if (resolved.endsWith('.md') && existsCaseSensitive(resolved)) {
        outbound.add(path.relative(root, resolved));
      }
    }
  }
  docLinkGraph.set(file, outbound);
}

// ---------------------------------------------------------------------------
// Orphan-page detection: every current `docs/**/*.md` page must be reachable
// via a TRANSITIVE traversal from at least one entry point (not merely linked
// directly from one) — entry point → linked page → linked page → … A page
// absent from that full reachable set is orphaned.
// ---------------------------------------------------------------------------
const entryPoints = [
  'README.md',
  path.join('docs', 'README.md'),
  ...locales.map(locale => path.join('docs', locale, 'index.md')),
  path.join('docs', 'development', 'index.md'),
  path.join('docs', 'development', 'decisions', 'README.md'),
].filter(entry => docLinkGraph.has(entry));

const reachable = new Set();
const queue = [...entryPoints];
while (queue.length) {
  const current = queue.pop();
  if (reachable.has(current)) continue;
  reachable.add(current);
  for (const next of docLinkGraph.get(current) ?? []) queue.push(next);
}

const docPages = markdownFiles.filter(file => file.startsWith(`docs${path.sep}`));
for (const page of docPages) {
  if (!reachable.has(page)) errors.push(`${page}: orphaned — not reachable from any documentation entry point`);
}

// ---------------------------------------------------------------------------
// Stale historical-path references. Deliberately conditional: `docs/history`
// and `docs/tasks` are allowed to be mentioned WHILE they still exist (e.g.
// `.vscodeignore`'s exclusion globs) — this only fires once those directories
// are actually gone, so it becomes a real regression guard exactly at the
// point cleanup removes them, without needing a separate flag day. Scanned
// repository-wide (not just docs/**) because the two known real dependencies
// on historical docs were TypeScript code comments, not Markdown.
// ---------------------------------------------------------------------------
const historyPaths = ['docs/history', 'docs/tasks'];
const stillExist = historyPaths.filter(p => fs.existsSync(path.join(root, p)));
if (stillExist.length < historyPaths.length) {
  const removed = historyPaths.filter(p => !stillExist.includes(p));
  const scanDirs = ['src', 'test', 'tooling', 'scripts', '.github', '.vscode'];
  const skipDirNames = new Set(['node_modules', '.git', 'out', 'dist', 'coverage', 'playwright-report', 'test-results', '.vscode-test']);
  const binaryExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.map', '.vsix', '.svg']);

  function walkTextFiles(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      if (skipDirNames.has(entry.name)) return [];
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return walkTextFiles(absolute);
      if (binaryExtensions.has(path.extname(entry.name))) return [];
      return [absolute];
    });
  }

  // CHANGELOG.md is an immutable historical record — a past release entry
  // legitimately describing a since-removed path (e.g. "consolidated docs
  // under docs/history/...") is not a stale reference, it's what actually
  // happened at that release. Rewriting past entries to avoid this check
  // would falsify release history, so it's exempted rather than scanned.
  const rootConfigFiles = fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isFile() && !binaryExtensions.has(path.extname(entry.name)) && entry.name !== 'CHANGELOG.md')
    .map(entry => path.join(root, entry.name));

  // This validator's own source necessarily names these paths (to define and
  // explain the check itself) — that's not a stale reference, exclude it.
  const selfPath = path.join(root, 'scripts', 'validate-docs.mjs');
  const filesToScan = [...scanDirs.flatMap(dir => walkTextFiles(path.join(root, dir))), ...rootConfigFiles]
    .filter(file => file !== selfPath);
  for (const absolute of filesToScan) {
    const text = fs.readFileSync(absolute, 'utf8');
    for (const removedPath of removed) {
      if (text.includes(removedPath)) {
        errors.push(`${path.relative(root, absolute)}: stale reference to removed ${removedPath}`);
      }
    }
  }
}

if (errors.length) {
  console.error(`Documentation validation failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Documentation validation passed: ${localeFiles.en.length} pages × ${locales.length} locales; ${markdownFiles.length} Markdown files checked; ${docPages.length} doc pages reachable; anchors/case/HTML/reference-links/stale-history checked.`);
