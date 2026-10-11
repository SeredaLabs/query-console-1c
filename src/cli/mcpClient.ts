/**
 * Тонкий MCP-over-HTTP клиент для инструмента validate_query.
 * Только разработка/тесты — в бандл расширения не входит.
 *
 * Два контракта сервера: исходный `1c-md` (аргумент `queryText`, ошибка в
 * `message`) и сервер на базе 1С (аргумент `query`, ошибка в `error`, BasicAuth).
 * Имя аргумента берётся из схемы инструмента (`tools/list`), заголовок
 * авторизации — из конфигурации (`MCP_AUTHORIZATION`), в логи он не попадает.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface ValidateQueryResult {
  valid: boolean;
  message: string;
  query_text: string;
}

/** Снять BOM, CRLF→LF, хвостовой перевод строки — симметрично sdblGolden.ref(). */
export function normalizeQueryText(s: string): string {
  return s.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\n+$/, '');
}

/** Прочитать URL сервера 1c-md из .mcp.json. */
export function readMcpUrl(root = process.cwd()): string {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
  const url = cfg?.mcpServers?.['1c-md']?.url;
  if (typeof url !== 'string') throw new Error('Не найден mcpServers.1c-md.url в .mcp.json');
  return url;
}

/** Разобрать JSON-RPC ответ tools/call в ValidateQueryResult. */
export function parseValidateResponse(raw: any): ValidateQueryResult {
  const result = raw?.result;
  if (!result || result.isError) {
    const text = result?.content?.[0]?.text ?? JSON.stringify(raw);
    throw new Error(`MCP вернул ошибку: ${text}`);
  }
  const text = result?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Пустой content в ответе MCP');
  const inner = JSON.parse(text);
  const valid = Boolean(inner.valid);
  // Валидный ответ без канонического текста не годится в эталон: пустой
  // query_text был бы записан в golden как текст конструктора.
  if (valid && typeof inner.query_text !== 'string') throw new Error('MCP не вернул query_text для валидного запроса');
  return {
    valid,
    message: String(inner.message ?? inner.error ?? ''),
    query_text: normalizeQueryText(String(inner.query_text ?? '')),
  };
}

export interface McpOptions {
  /** Значение заголовка Authorization (например, `Basic …`); без него — без заголовка. */
  authorization?: string;
}

let nextId = 1;

async function rpc(url: string, method: string, params: unknown, opts: McpOptions): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (opts.authorization) headers.Authorization = opts.authorization;
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} от MCP${resp.status === 401 ? ' (проверьте MCP_AUTHORIZATION)' : ''}`);
  return resp.json();
}

const queryArgByUrl = new Map<string, Promise<string>>();

/**
 * Имя аргумента текста запроса по схеме validate_query: `query`, если сервер его
 * объявляет, иначе исходное `queryText` (в том числе когда `tools/list` недоступен).
 */
export function queryArgumentName(toolsListResponse: any): string {
  const tools: any[] = toolsListResponse?.result?.tools ?? [];
  const props = tools.find((t) => t?.name === 'validate_query')?.inputSchema?.properties;
  return props && typeof props === 'object' && 'query' in props ? 'query' : 'queryText';
}

function queryArgument(url: string, opts: McpOptions): Promise<string> {
  let arg = queryArgByUrl.get(url);
  if (!arg) {
    arg = rpc(url, 'tools/list', {}, opts).then(queryArgumentName, () => 'queryText');
    queryArgByUrl.set(url, arg);
  }
  return arg;
}

/** Вызвать validate_query через MCP HTTP. */
export async function validateQuery(text: string, url = readMcpUrl(), opts: McpOptions = {}): Promise<ValidateQueryResult> {
  const arg = await queryArgument(url, opts);
  const raw = await rpc(url, 'tools/call', { name: 'validate_query', arguments: { [arg]: text } }, opts);
  return parseValidateResponse(raw);
}
