import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const sw = readFileSync(new URL('sw.js', root), 'utf8');
const assets = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

function listFiles(dir) {
  return readdirSync(new URL(`${dir}/`, root), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
  );
}

test('все файлы из списка офлайн-кеша существуют', () => {
  for (const asset of assets.filter((a) => a !== './')) {
    assert.ok(existsSync(new URL(asset, root)), `нет файла ${asset}`);
  }
});

test('все файлы приложения попадают в офлайн-кеш', () => {
  const files = ['css', 'js', 'data', 'icons'].flatMap(listFiles);
  const missing = files.filter((file) => !assets.includes(file));
  assert.deepEqual(missing, [], `добавь в ASSETS в sw.js: ${missing.join(', ')}`);
});
