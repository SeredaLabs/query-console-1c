import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseValidateResponse, normalizeQueryText, queryArgumentName, validateQuery } from '../../src/cli/mcpClient';

describe('normalizeQueryText', () => {
  it('снимает BOM, CRLF→LF и хвостовой перевод строки', () => {
    expect(normalizeQueryText('﻿А\r\nБ\n')).toBe('А\nБ');
  });
});

describe('parseValidateResponse', () => {
  it('достаёт valid/message/query_text из вложенного JSON content', () => {
    const raw = {
      jsonrpc: '2.0', id: 2,
      result: { content: [{ type: 'text', text: JSON.stringify({ valid: true, message: 'ок', query_text: 'ВЫБРАТЬ\n	Т.П' }) }], isError: false },
    };
    const r = parseValidateResponse(raw);
    expect(r.valid).toBe(true);
    expect(r.message).toBe('ок');
    expect(r.query_text).toBe('ВЫБРАТЬ\n\tТ.П');
  });

  it('бросает на isError', () => {
    expect(() => parseValidateResponse({ result: { content: [{ type: 'text', text: 'boom' }], isError: true } }))
      .toThrow();
  });
});

const callResult = (inner: unknown) => ({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify(inner) }], isError: false } });

describe('parseValidateResponse: server on a 1C base', () => {
  it('takes the error text from `error`', () => {
    const r = parseValidateResponse(callResult({ valid: false, error: '{(1, 19)}: Invalid join' }));
    expect(r).toEqual({ valid: false, message: '{(1, 19)}: Invalid join', query_text: '' });
  });

  it('keeps query_text and ignores extra fields', () => {
    const r = parseValidateResponse(callResult({ valid: true, parameters: [], columns: [['А']], query_text: 'ВЫБРАТЬ\r\n\t1 КАК А' }));
    expect(r.query_text).toBe('ВЫБРАТЬ\n\t1 КАК А');
  });

  it('refuses a valid answer without query_text instead of returning an empty canonical text', () => {
    expect(() => parseValidateResponse(callResult({ valid: true, columns: [['А']] }))).toThrow(/query_text/);
  });
});

describe('queryArgumentName', () => {
  const list = (props: Record<string, unknown>) => ({ result: { tools: [{ name: 'execute_query', inputSchema: { properties: { query: {} } } }, { name: 'validate_query', inputSchema: { properties: props } }] } });
  it('`query` when the validate_query schema declares it', () => expect(queryArgumentName(list({ query: {} }))).toBe('query'));
  it('`queryText` for the original 1c-md schema', () => expect(queryArgumentName(list({ queryText: {} }))).toBe('queryText'));
  it('`queryText` when the list is unusable', () => expect(queryArgumentName({ error: { code: -1 } })).toBe('queryText'));
});

describe('validateQuery over HTTP', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(validateProps: Record<string, unknown>) {
    const calls: Array<{ headers: Record<string, string>; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { headers: Record<string, string>; body: string }) => {
      const body = JSON.parse(init.body);
      calls.push({ headers: init.headers, body });
      const payload = body.method === 'tools/list'
        ? { result: { tools: [{ name: 'validate_query', inputSchema: { properties: validateProps } }] } }
        : callResult({ valid: true, query_text: 'ВЫБРАТЬ\n\t1 КАК А' });
      return { ok: true, status: 200, json: async () => payload };
    }));
    return calls;
  }

  it('sends the declared argument name and the Authorization header', async () => {
    const calls = stubFetch({ query: {} });
    const r = await validateQuery('ВЫБРАТЬ 1 КАК А', 'https://example.test/a', { authorization: 'Basic dGVzdA==' });
    expect(r.query_text).toBe('ВЫБРАТЬ\n\t1 КАК А');
    const call = calls.find((c) => c.body.method === 'tools/call')!;
    expect(call.body.params.arguments).toEqual({ query: 'ВЫБРАТЬ 1 КАК А' });
    expect(calls.every((c) => c.headers.Authorization === 'Basic dGVzdA==')).toBe(true);
  });

  it('keeps `queryText` and sends no Authorization header for the original server', async () => {
    const calls = stubFetch({ queryText: {} });
    await validateQuery('ВЫБРАТЬ 1 КАК А', 'https://example.test/b');
    const call = calls.find((c) => c.body.method === 'tools/call')!;
    expect(call.body.params.arguments).toEqual({ queryText: 'ВЫБРАТЬ 1 КАК А' });
    expect(calls.every((c) => !('Authorization' in c.headers))).toBe(true);
  });

  it('names MCP_AUTHORIZATION on HTTP 401 without echoing the header', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })));
    const err = await validateQuery('ВЫБРАТЬ 1', 'https://example.test/c', { authorization: 'Basic c2VjcmV0' }).catch((e: Error) => e);
    expect(String(err)).toMatch(/401.*MCP_AUTHORIZATION/);
    expect(String(err)).not.toContain('c2VjcmV0');
  });
});
