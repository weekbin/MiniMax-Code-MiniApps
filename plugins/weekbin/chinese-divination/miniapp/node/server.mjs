// @ts-check

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { almanac, zodiacProfile, SOLAR_TERMS, ELEMENTS } from './almanac.mjs';
import {
  buildReading,
  castByCoins,
  castByNumbers,
  castByTime,
  castDaily,
  tossCoins,
} from './divination.mjs';
import { HEXAGRAM_LIST, TRIGRAMS, hexagramSymbol, invertedHexagram, mutualHexagram, oppositeHexagram } from './hexagrams.mjs';
import { MAX_NOTE, MAX_QUESTION, ReadingStore, clamp } from './store.mjs';
import { handleMcpRequest } from './mcp/divination-http.mjs';

/** @typedef {import('./miniapp-api.js').MiniAppContext} MiniAppContext */
/** @typedef {import('./miniapp-api.js').MiniAppLifecycle} MiniAppLifecycle */

const SURFACE_PATH = '/divination';
const API_ROOT = '/api/divination';
/** MCP 端点路径，须与 miniapp.json 的 mcpEndpoints 一致。 */
const MCP_PATH = '/mcp/divination';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_NUMBER = 1_000_000_000;

/**
 * 页面与 Node 服务之间的唯一数据通道。所有写操作都经由这里落到 dataDir。
 * @param {MiniAppContext} context
 * @returns {Promise<MiniAppLifecycle>}
 */
export async function start(context) {
  const clientEntry = await readFile(join(context.pluginRoot, 'miniapp/client/index.html'));
  const store = new ReadingStore(context.dataDir);

  const server = createServer((request, response) => {
    handle(request, response, clientEntry, store).catch((error) => {
      context.logger.error(`divination.request.failed ${error instanceof Error ? error.message : 'unknown'}`);
      sendJson(response, 500, { error: 'internal_error' });
    });
  });

  await listen(server, context.listen.host, context.listen.port);
  context.logger.info('divination.runtime.listening');

  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    context.signal.removeEventListener('abort', onAbort);
    await close(server);
  };
  const onAbort = () => {
    void dispose();
  };
  context.signal.addEventListener('abort', onAbort, { once: true });
  if (context.signal.aborted) await dispose();

  return { dispose };
}

/**
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 * @param {Buffer} clientEntry
 * @param {ReadingStore} store
 */
async function handle(request, response, clientEntry, store) {
  const url = new URL(request.url ?? '/', 'http://miniapp.local');
  const path = url.pathname;
  const method = request.method ?? 'GET';

  // MCP 端点：只在本机回环上提供 POST，Agent 通过它主动起卦。
  if (path === MCP_PATH) {
    if (method === 'POST') {
      const body = await readJsonBody(request);
      if (body === null) {
        sendJson(response, 400, { error: 'invalid_body' });
        return;
      }
      await handleMcpRequest({ response, body });
      return;
    }
    response.writeHead(405, { allow: 'POST', 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  if (method === 'GET' && path === SURFACE_PATH) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(clientEntry);
    return;
  }

  if (method === 'GET' && path === `${API_ROOT}/bootstrap`) {
    const now = new Date();
    sendJson(response, 200, {
      almanac: almanac(now),
      trigrams: Object.values(TRIGRAMS),
      elements: ELEMENTS,
      solarTerms: SOLAR_TERMS,
      zodiac: Array.from({ length: 12 }, (_unused, index) => zodiacProfile(index)),
      today: castDaily(now),
    });
    return;
  }

  if (method === 'GET' && path === `${API_ROOT}/library`) {
    sendJson(response, 200, {
      hexagrams: HEXAGRAM_LIST.map((hexagram) => ({
        order: hexagram.order,
        key: hexagram.key,
        name: hexagram.name,
        symbol: hexagramSymbol(hexagram.key),
        upper: hexagram.upperTrigram.name,
        lower: hexagram.lowerTrigram.name,
        element: hexagram.upperTrigram.element === hexagram.lowerTrigram.element
          ? hexagram.upperTrigram.element
          : `${hexagram.upperTrigram.element}${hexagram.lowerTrigram.element}`,
        judgment: hexagram.judgment,
        tuan: hexagram.tuan,
        image: hexagram.image,
        mutual: mutualHexagram(hexagram).name,
        opposite: oppositeHexagram(hexagram).name,
        inverted: invertedHexagram(hexagram).name,
      })),
    });
    return;
  }

  if (method === 'GET' && path === `${API_ROOT}/history`) {
    sendJson(response, 200, { entries: await store.list() });
    return;
  }

  const historyDetail = /^\/api\/divination\/history\/([A-Za-z0-9-]{1,80})$/u.exec(path);
  if (historyDetail) {
    const id = historyDetail[1];
    if (method === 'GET') {
      const entry = await store.get(id);
      if (!entry) {
        sendJson(response, 404, { error: 'not_found' });
        return;
      }
      sendJson(response, 200, { entry });
      return;
    }
    if (method === 'DELETE') {
      const removed = await store.remove(id);
      sendJson(response, removed ? 200 : 404, removed ? { removed: true } : { error: 'not_found' });
      return;
    }
  }

  if (method === 'POST' && path === `${API_ROOT}/toss`) {
    const toss = tossCoins();
    sendJson(response, 200, {
      sum: toss.sum,
      coins: toss.coins,
      kind: toss.sum === 9 ? '老阳' : toss.sum === 8 ? '少阴' : toss.sum === 7 ? '少阳' : '老阴',
    });
    return;
  }

  if (method === 'POST' && path === `${API_ROOT}/cast`) {
    const body = await readJsonBody(request);
    if (body === null) {
      sendJson(response, 400, { error: 'invalid_body' });
      return;
    }
    let cast;
    try {
      cast = castFrom(body);
    } catch (error) {
      sendJson(response, 400, { error: 'invalid_cast', message: error instanceof Error ? error.message : 'invalid cast' });
      return;
    }
    const question = clamp(body.question, MAX_QUESTION);
    const now = new Date();
    sendJson(response, 200, { reading: buildReading(cast, { question, now }) });
    return;
  }

  if (method === 'POST' && path === `${API_ROOT}/history`) {
    const body = await readJsonBody(request);
    if (body === null || !body.reading || typeof body.reading !== 'object') {
      sendJson(response, 400, { error: 'invalid_body' });
      return;
    }
    const reading = body.reading;
    if (typeof reading.hexagram !== 'object' || typeof reading.id !== 'string') {
      sendJson(response, 400, { error: 'invalid_reading' });
      return;
    }
    const saved = await store.save(
      /** @type {any} */ (reading),
      clamp(body.note, MAX_NOTE),
    );
    sendJson(response, 201, { entry: saved });
    return;
  }

  sendJson(response, 404, { error: 'not_found' });
}

/**
 * 页面传来的起卦请求。每一项都做范围与类型校验，页面内容不可信。
 * @param {Record<string, unknown>} body
 */
function castFrom(body) {
  const method = typeof body.method === 'string' ? body.method : '';
  if (method === 'time') return castByTime(new Date());
  if (method === 'daily') return castDaily(new Date());
  if (method === 'numbers') {
    const upper = toBoundedInteger(body.upper, MAX_NUMBER);
    const lower = toBoundedInteger(body.lower, MAX_NUMBER);
    return castByNumbers(upper, lower);
  }
  if (method === 'coins') {
    const sums = Array.isArray(body.sums) ? body.sums.map((item) => Number(item)) : [];
    return castByCoins(sums);
  }
  throw new Error(`unknown method "${method}"`);
}

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {number}
 */
function toBoundedInteger(value, max) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) throw new Error('数字起卦需要两个整数');
  if (parsed < 1 || parsed > max) throw new Error(`数字需在 1 到 ${max} 之间`);
  return parsed;
}

/**
 * @param {import('node:http').IncomingMessage} request
 * @returns {Promise<Record<string, unknown>|null>}
 */
async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** @param {import('node:http').ServerResponse} response @param {number} status @param {unknown} payload */
function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve();
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
