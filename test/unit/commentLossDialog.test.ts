import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { CommentLossDialog } from '../../src/webview/components/CommentLossDialog';
import { setLocale } from '../../src/webview/i18n';

vi.mock('react-dom', () => ({ createPortal: (children: React.ReactNode) => children }));
afterEach(() => { vi.unstubAllGlobals(); setLocale('en'); });
function render(lost: string[]): string {
  vi.stubGlobal('document', { body: {} });
  return renderToStaticMarkup(React.createElement(CommentLossDialog, {
    lost, onCancel: () => {}, onConfirm: () => {},
  }));
}

it('renders five verbatim escaped comments, including repeated occurrences', () => {
  const html = render(['//  first  ', '// repeat', '// <b>literal</b>', '// repeat', '// fifth', '// sixth', '// seventh']);
  expect(html.match(/<pre\b/g)).toHaveLength(5);
  expect(html).toContain('>//  first  </pre>');
  expect(html.match(/>\/\/ repeat<\/pre>/g)).toHaveLength(2);
  expect(html).toContain('// &lt;b&gt;literal&lt;/b&gt;');
  expect(html).not.toContain('<b>');
  expect(html).not.toContain('// sixth');
  expect(html).not.toContain('// seventh');
  expect(html).toContain('font-family:monospace');
});

it.each([1, 5])('has no overflow message for %i lost comments', count => {
  expect(render(Array.from({ length: count }, (_, i) => `// ${i}`))).not.toContain('comment-loss-more');
});

it.each([
  ['en', '2 more'], ['ru', 'Ещё 2'], ['uk', 'Ще 2'],
] as const)('localizes the overflow count in %s', (locale, expected) => {
  setLocale(locale);
  expect(render(Array.from({ length: 7 }, (_, i) => `// ${i}`))).toContain(`>${expected}</div>`);
});
