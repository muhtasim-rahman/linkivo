// Test helper: loads worker.js (an ES module file without a package.json "type") through a temporary .mjs copy and returns the
// pure functions it exposes under default.__test, plus the default handler.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export async function loadWorker() {
  const src = path.join(here, '../../worker/worker.js');
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lk-worker-')), 'worker.mjs');
  fs.copyFileSync(src, tmp);
  const mod = await import(pathToFileURL(tmp).href);
  return { handler: mod.default, T: mod.default.__test };
}
