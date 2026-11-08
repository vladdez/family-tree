import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import { parse } from 'parse5';

const root = fileURLToPath(new URL('../', import.meta.url));
const state = path.join(root, '.tooling', 'publication');
const snapshotFile = path.join(state, 'snapshot.json');
const manifestFile = path.join(state, 'manifest.json');
const repository = 'vladdez/family-tree';
const site = 'https://vladdez.github.io/family-tree/';
const chunkSize = 8000;
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const output = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const blobSha = (bytes) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

function snapshot() {
  const paths = [...new Set([
    ...git('diff', 'HEAD', '--name-only', '-z').split('\0'),
    ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0'),
  ].filter(Boolean))].sort();
  return paths.map((name) => {
    const file = path.join(root, name);
    if (!existsSync(file)) return { path: name, mode: '100644', type: 'blob', sha: null };
    const info = lstatSync(file);
    if (!info.isFile()) throw new Error(`Необычный тип файла: ${name}`);
    const bytes = readFileSync(file);
    let content, encoding;
    try {
      if (bytes.includes(0)) throw new Error('binary');
      content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      encoding = 'utf-8';
    } catch {
      content = bytes.toString('base64');
      encoding = 'base64';
    }
    return { path: name, mode: info.mode & 0o111 ? '100755' : '100644', type: 'blob', sha: blobSha(bytes), encoding, content };
  });
}

function runChecks() {
  const bundledNpm = path.join(root, '.tooling', 'package', 'bin', 'npm-cli.js');
  const env = {
    ...process.env,
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${path.join(root, '.tooling', 'bin')}${path.delimiter}${process.env.PATH ?? ''}`,
    SITE_URL: 'https://vladdez.github.io', BASE_PATH: '/family-tree/', ASTRO_TELEMETRY_DISABLED: '1',
  };
  for (const args of [['test'], ['run', 'build']]) {
    try {
      execFileSync(existsSync(bundledNpm) ? process.execPath : 'npm', existsSync(bundledNpm) ? [bundledNpm, ...args] : args,
        { cwd: root, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    } catch (error) {
      throw new Error(`Проверка npm ${args.join(' ')} не прошла.\n${error.stdout ?? ''}\n${error.stderr ?? error.message}`);
    }
  }
}

function prepare() {
  git('diff', '--check');
  const before = JSON.stringify(snapshot());
  runChecks();
  const entries = snapshot();
  const serialized = JSON.stringify(entries);
  if (serialized !== before) throw new Error('Файлы изменились во время проверок. Повторите prepare.');
  mkdirSync(state, { recursive: true });
  writeFileSync(snapshotFile, serialized);
  const manifest = {
    repository, branch: 'main', site, localHead: git('rev-parse', 'HEAD').trim(),
    checkedAt: new Date().toISOString(), snapshotFile, chunkSize, chunks: Math.ceil(serialized.length / chunkSize),
    files: entries.map(({ content, ...entry }) => entry),
  };
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  output({ checks: 'passed', files: entries.length, manifestFile, chunks: manifest.chunks });
}

function assertFresh() {
  const prepared = JSON.parse(readFileSync(snapshotFile, 'utf8'));
  if (JSON.stringify(snapshot()) !== JSON.stringify(prepared)) throw new Error('Снимок устарел: файлы изменились после prepare.');
}

function elements(node) { return [node, ...(node.childNodes ?? []).flatMap(elements)]; }
function visibleText(node) {
  if (['script', 'style'].includes(node.tagName)) return '';
  return node.value ?? (node.childNodes ?? []).map(visibleText).join('');
}
function mainText(html) {
  const main = elements(parse(html)).find((node) => node.tagName === 'main');
  if (!main) throw new Error('В странице отсутствует main');
  return visibleText(main).replace(/\s+/g, ' ').trim();
}

async function verify(routes) {
  assertFresh();
  for (const route of [...new Set(['', 'tree/', ...routes])]) {
    if (route.startsWith('/') || route.includes('..') || /^[a-z]+:/i.test(route)) throw new Error(`Неверный путь: ${route}`);
    const local = path.join(root, 'dist', route, 'index.html');
    const response = await fetch(new URL(route, site), { signal: AbortSignal.timeout(20000), headers: { 'cache-control': 'no-cache' } });
    if (response.status !== 200) throw new Error(`${route || '/'}: HTTP ${response.status}`);
    if (mainText(await response.text()) !== mainText(readFileSync(local, 'utf8'))) throw new Error(`${route || '/'}: опубликованный текст отличается от проверенной сборки`);
  }
  output({ verified: true, routes: [...new Set(['', 'tree/', ...routes])], site });
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'prepare') prepare();
  else if (command === 'manifest') { assertFresh(); output(JSON.parse(readFileSync(manifestFile, 'utf8'))); }
  else if (command === 'part') {
    const index = Number(args[0]);
    const text = readFileSync(snapshotFile, 'utf8');
    if (args.length !== 1 || !Number.isSafeInteger(index) || index < 0 || index >= Math.ceil(text.length / chunkSize)) throw new Error('Укажите существующий номер части, начиная с 0');
    output(text.slice(index * chunkSize, (index + 1) * chunkSize));
  } else if (command === 'verify') await verify(args);
  else throw new Error('Команды: prepare | manifest | part <номер> | verify [people/<slug>/ ...]');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
