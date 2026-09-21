import * as React from 'react';

/**
 * Phase 3D: справжні CSS `:hover`-правила замість React hover-state, де це
 * технічно можливо (за explicit вимогою) — Toolbar button hover, TableCard
 * remove-control reveal-on-hover, JOIN remove-control reveal-on-hover.
 * Рендериться ОДИН раз (App.tsx) як звичайний `<style>` — діє глобально на
 * документ незалежно від того, де в дереві він змонтований.
 */
const CSS = `
/* Responsive layout fix (Fields tab audit): без border-box, будь-який
   елемент із padding/border І відсотковою шириною (width:'100%') рендериться
   ШИРШИМ за свій контейнер на суму padding+border (content-box — дефолт
   браузера) — саме так \`FieldPropertiesPanel\`/inputs у ньому вилазили за
   межі кореня на вузьких viewport, коли ширина панелі стала '100%' замість
   фіксованого пікселя. Раніше це не проявлялося, бо всі ширини в New Builder
   були fixed-px (де content-box лише додає кілька px до самого елемента,
   не спричиняючи overflow контейнера) — глобально, а не патчем щоразу.
*/
#root, #root *, #root *::before, #root *::after {
  box-sizing: border-box;
}

/* Fields grid "Псевдонім" cell (and any other transparent-background input)
   had poor placeholder contrast — with no explicit ::placeholder rule the
   browser UA default (a fixed mid-gray) is used instead of a theme-aware
   token, which reads badly against a dark editor theme. */
#root input::placeholder,
#root textarea::placeholder {
  color: var(--vscode-input-placeholderForeground, var(--vscode-descriptionForeground));
  opacity: 1;
}

.qcc-btn:hover:not(:disabled) {
  background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
}
.qcc-card-remove {
  opacity: 0.35;
  transition: opacity 120ms;
}
.qcc-card:hover .qcc-card-remove {
  opacity: 1;
}
.qcc-join-remove {
  opacity: 0;
  transition: opacity 120ms;
}
.qcc-join-badge:hover .qcc-join-remove {
  opacity: 1;
}
.qcc-meta-row:hover {
  background: var(--vscode-list-hoverBackground);
}
.qcc-meta-add {
  /* Phase 3E.1-fix: 0.35→0.6 у стані спокою — на реальних темних темах
     майже зникало; з кольором TOKENS.text (не textMuted) і 0.6 воно тепер
     помітне одразу, а :hover все одно підсилює до 1. */
  opacity: 0.6;
  transition: opacity 120ms;
}
.qcc-meta-row:hover .qcc-meta-add {
  opacity: 1;
}

/* Phase 5.1 — TableCard field list: тонкий низькоконтрастний скролбар "у
   стилі VS Code" (не системний товстий/яскравий), трохи виразніший на
   hover/active — щоб не конкурував з контентом, поки не потрібен. */
.qcc-card-fields {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.qcc-card-fields:hover,
.qcc-card-fields:focus-within {
  scrollbar-color: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4)) transparent;
}
.qcc-card-fields::-webkit-scrollbar {
  width: 8px;
}
.qcc-card-fields::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 4px;
}
.qcc-card-fields:hover::-webkit-scrollbar-thumb,
.qcc-card-fields:focus-within::-webkit-scrollbar-thumb {
  background: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4));
}
.qcc-card-fields::-webkit-scrollbar-thumb:hover {
  background: var(--vscode-scrollbarSlider-hoverBackground, rgba(100, 100, 100, 0.7));
}
.qcc-card-fields::-webkit-scrollbar-track {
  background: transparent;
}

.qcc-field-row:hover {
  background: var(--vscode-list-hoverBackground) !important;
}

/* Phase 5.5 — inclusion control у TableCard тепер той самий "тихий codicon"
   pattern, що й .qcc-meta-add (Source Browser AddControl): приглушена у
   стані спокою, підсилюється на hover рядка — замість суцільного
   закрашеного checkbox-квадрата (виявився занадто важким/"жирним" на
   реальному canvas screenshot порівняно з тихою іконкою Source Browser). */
.qcc-field-toggle {
  opacity: 0.6;
  transition: opacity 120ms;
}
.qcc-field-row:hover .qcc-field-toggle {
  opacity: 1;
}

/* UNION polish (design review): члени об'єднання мають ІНШУ візуальну мову,
   ніж пакетні [n] (щоб не плутати два різні виміри навігації) — округлий
   chip замість дужок-тексту, і видалення ховається до hover chip'а, той
   самий reveal-on-hover pattern, що вже є в .qcc-card-remove/.qcc-join-remove. */
.qcc-union-chip {
  border-radius: 3px;
  transition: background 120ms;
}
.qcc-union-remove {
  opacity: 0;
  transition: opacity 120ms;
}
.qcc-union-chip:hover .qcc-union-remove {
  opacity: 1;
}

/* PackageNav redesign (2026-09-21): NavMemberChip's delete affordance --
   ALWAYS present in the DOM (never conditionally mounted) so hover/focus
   never changes the chip's width and never shifts sibling numbers. Same
   reveal-on-hover technique as .qcc-union-remove above, new class because
   the container here is the chip itself (.qcc-nav-chip), not a shared
   wrapper spanning multiple chips. */
.qcc-nav-chip-close {
  opacity: 0;
  transition: opacity 120ms;
}
.qcc-nav-chip:hover .qcc-nav-chip-close,
.qcc-nav-chip-close:focus {
  opacity: 1;
}
`;

export function HoverStyles(): React.ReactElement {
  return <style>{CSS}</style>;
}
