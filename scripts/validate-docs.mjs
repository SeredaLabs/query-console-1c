import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
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

for (const file of markdownFiles) {
  const absolute = path.join(root, file);
  const text = fs.readFileSync(absolute, 'utf8');
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim().replace(/^<|>$/g, '');
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    target = decodeURIComponent(target.split('#')[0].split('?')[0]);
    if (!target) continue;
    const resolved = path.resolve(path.dirname(absolute), target);
    if (!fs.existsSync(resolved)) errors.push(`${file}: broken link ${match[1]}`);
  }
}

if (errors.length) {
  console.error(`Documentation validation failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Documentation validation passed: ${localeFiles.en.length} pages × ${locales.length} locales; ${markdownFiles.length} Markdown files checked.`);
