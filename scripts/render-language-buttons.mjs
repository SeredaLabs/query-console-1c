// Generates the language-switch buttons of the README and the user guide
// (assets/images/lang). Each language has a full button (flag + name, 148×32)
// and a compact flag icon (18×32) for narrow screens, in two states: the
// current page's language (blue) and the others (neutral).
//
// The SVGs are used by docs/{en,uk,ru}. README*.md uses PNG copies, because the
// Marketplace build (vsce) refuses SVG images in README.md. Run after changing
// this file:  node scripts/render-language-buttons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const OUT = path.resolve(import.meta.dirname, '..', 'assets', 'images', 'lang');
const ACTIVE = '#397FD8';
const NEUTRAL = '#3B4658';
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/** Flags drawn in a 24×16 box at the origin. */
const FLAGS = {
  en: `<rect width="24" height="16" fill="#012169"/>
    <path d="M0 0L24 16M24 0L0 16" stroke="#FFF" stroke-width="3.2"/>
    <path d="M0 0L24 16M24 0L0 16" stroke="#C8102E" stroke-width="1.2"/>
    <path d="M12 0V16M0 8H24" stroke="#FFF" stroke-width="5"/>
    <path d="M12 0V16M0 8H24" stroke="#C8102E" stroke-width="3"/>`,
  uk: `<rect width="24" height="8" fill="#0057B7"/><rect y="8" width="24" height="8" fill="#FFD700"/>`,
  ru: `<rect width="24" height="5.34" fill="#FFF"/><rect y="5.33" width="24" height="5.34" fill="#0039A6"/><rect y="10.66" width="24" height="5.34" fill="#D52B1E"/>`,
};
const NAMES = { en: 'English', uk: 'Українська', ru: 'Русский' };

/** A flag scaled to `w`×`h` at (x, y), with rounded corners and a hairline edge. */
function flag(lang, x, y, w, h) {
  const id = `f-${lang}`;
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/></clipPath>
  <g clip-path="url(#${id})"><g transform="translate(${x} ${y}) scale(${w / 24} ${h / 16})">${FLAGS[lang]}</g></g>
  <rect x="${x + 0.25}" y="${y + 0.25}" width="${w - 0.5}" height="${h - 0.5}" rx="2" fill="none" stroke="#000" stroke-opacity=".25" stroke-width=".5"/>`;
}

function button(lang, active) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="148" height="32" viewBox="0 0 148 32" role="img" aria-label="${NAMES[lang]}">
  <rect width="148" height="32" rx="6" fill="${active ? ACTIVE : NEUTRAL}"/>
  ${flag(lang, 12, 8, 24, 16)}
  <text x="92" y="20.5" text-anchor="middle" fill="#FFF" font-family="${FONT}" font-size="13" font-weight="600">${NAMES[lang]}</text>
</svg>
`;
}

function icon(lang, active) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="32" viewBox="0 0 18 32" role="img" aria-label="${NAMES[lang]}">
  <rect width="18" height="32" rx="4" fill="${active ? ACTIVE : NEUTRAL}"/>
  ${flag(lang, 2, 11, 14, 10)}
</svg>
`;
}

fs.mkdirSync(OUT, { recursive: true });
const files = [];
for (const lang of Object.keys(NAMES)) {
  for (const active of [false, true]) {
    const suffix = active ? '-active' : '';
    files.push([`${lang}-button${suffix}`, button(lang, active), 148]);
    files.push([`${lang}-icon${suffix}`, icon(lang, active), 18]);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
for (const [name, svg, width] of files) {
  fs.writeFileSync(path.join(OUT, `${name}.svg`), svg);
  await page.setViewportSize({ width, height: 32 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg}`);
  await page.locator('svg').screenshot({ path: path.join(OUT, `${name}.png`), omitBackground: true });
}
await browser.close();
console.log(`${files.length} buttons → ${path.relative(process.cwd(), OUT)}`);
