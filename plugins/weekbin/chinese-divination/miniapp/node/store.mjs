// @ts-check

/**
 * 卦历持久化。所有状态写在 context.dataDir 下的单个 JSON 文件里，原子替换，避免写坏。
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const MAX_ENTRIES = 500;
const MAX_QUESTION = 120;
const MAX_NOTE = 2000;

export class ReadingStore {
  /** @param {string} dataDir */
  constructor(dataDir) {
    this.file = join(dataDir, 'readings.json');
    /** @type {Promise<object[]>} */
    this.queue = Promise.resolve([]);
  }

  async list() {
    return this.enqueue(async () => {
      const entries = await this.readAll();
      return entries.map(toSummary);
    });
  }

  /** @param {string} id */
  async get(id) {
    return this.enqueue(async () => {
      const entries = await this.readAll();
      return entries.find((entry) => entry.id === id) ?? null;
    });
  }

  /**
   * @param {import('./divination.mjs').Reading} reading
   * @param {string} note
   */
  async save(reading, note) {
    return this.enqueue(async () => {
      const entries = await this.readAll();
      const entry = {
        ...reading,
        note: clamp(note, MAX_NOTE),
      };
      entries.unshift(entry);
      const trimmed = entries.slice(0, MAX_ENTRIES);
      await this.writeAll(trimmed);
      return toSummary(entry);
    });
  }

  /**
   * @param {string} id
   * @param {string} note
   */
  async update(id, note) {
    return this.enqueue(async () => {
      const entries = await this.readAll();
      const index = entries.findIndex((entry) => entry.id === id);
      if (index === -1) return null;
      entries[index] = { ...entries[index], note: clamp(note, MAX_NOTE), updatedAt: new Date().toISOString() };
      await this.writeAll(entries);
      return toSummary(entries[index]);
    });
  }

  /** @param {string} id */
  async remove(id) {
    return this.enqueue(async () => {
      const entries = await this.readAll();
      const next = entries.filter((entry) => entry.id !== id);
      if (next.length === entries.length) return false;
      await this.writeAll(next);
      return true;
    });
  }

  /** 串行化写入，避免并发请求交错写文件。 */
  enqueue(task) {
    const next = this.queue.then(task, task);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async readAll() {
    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((entry) => entry && typeof entry.id === 'string');
      return [];
    } catch (error) {
      if (error && /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return [];
      throw error;
    }
  }

  async writeAll(entries) {
    await mkdir(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    await writeFile(temp, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
    await rename(temp, this.file);
  }
}

function toSummary(entry) {
  return {
    id: entry.id,
    method: entry.method,
    question: entry.question ?? '',
    note: entry.note ?? '',
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    hexagram: entry.hexagram,
    changed: entry.changed,
    verdict: entry.verdict
      ? { key: entry.verdict.key, label: entry.verdict.label, summary: entry.verdict.summary }
      : undefined,
    timing: entry.timing ?? '',
    topic: entry.topic ?? null,
    structure: entry.structure,
  };
}

/** @param {unknown} value @param {number} max */
export function clamp(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export { MAX_QUESTION, MAX_NOTE, MAX_ENTRIES };
