# Публикация сайта: готовый порядок для агента

Запускайте этот порядок только после отдельной явной команды обновить опубликованный сайт. Просьба исправить данные, оформление или сам алгоритм публикации не разрешает публикацию. После успешно выполненной команды разрешение заканчивается.

## Постоянные настройки

- Проект: `/Users/Vladimir/Desktop/Projects/Family tree`.
- Репозиторий: `vladdez/family-tree`, ветка `main`.
- Сайт: `https://vladdez.github.io/family-tree/`.
- Workflow: `.github/workflows/deploy.yml`, название `Deploy family archive to GitHub Pages`.
- Деплой запускается автоматически при изменении `main`; загружать `dist/` вручную не нужно.
- Node в текущем окружении: `/Users/Vladimir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`. В проекте есть ссылка `.tooling/bin/node`.
- Нужные GitHub-инструменты: `github_fetch`, `github_create_tree`, `github_create_commit`, `github_update_ref`; для новых бинарных файлов также `github_create_blob`. Их полные имена имеют префикс `mcp__codex_apps__`. Если инструменты не видны, найдите только эти имена в `ALL_TOOLS`.

Не ищите каждый раз способ хостинга, не устанавливайте `gh` и не подключайте Sites. Используйте уже настроенный GitHub-коннектор. При фактической недоступности коннектора сообщите об этом и выбирайте доступный способ отдельно.

## 0. Автоматически обновить английскую версию

Выполняйте этот шаг только после команды пользователя обновить сайт. Такая команда одновременно поручает агенту перевести накопленные изменения и опубликовать обе языковые версии; отдельного напоминания или согласования перевода не требуется. При обычных правках сохраняйте изменения в русских исходниках и используйте `npm run check:ru`, откладывая синхронизацию английской версии до публикации.

Перед подготовкой снимка:

1. Сопоставьте текущие русские тексты с переводами в `src/i18n/`. Обновите биографии, примечания и описания документов в `content.en.json`, интерфейс в `ui.en.json`, написание имён и мест в `names.en.json`, руководство в `developer.en.md`.
2. Сохраняйте смысл, оговорки источников и точность дат. Перевод не меняет IDs, родственные связи и адреса исходных медиа. Не редактируйте сгенерированные файлы в `.tooling/en/`.
3. Проверьте полноту переводов командой ниже. При ошибке прочитайте `.tooling/missing-english.json`, самостоятельно дополните переводы и повторите проверку. Для интерфейса отчёт указывает файл с непереведённым текстом. Не публикуйте устаревший английский вариант и не подставляйте русский текст вместо перевода.

```sh
.tooling/bin/node --import tsx --input-type=module -e 'import { generateEnglishSource } from "./scripts/english-source.ts"; await generateEnglishSource();'
```

Завершите переводы до `prepare`: эта команда фиксирует проверенный снимок и отклоняет изменения исходников во время проверок. Полные тесты и сборку обеих версий выполнит следующий шаг.

## 1. Подготовить проверенный снимок

Из корня проекта выполните:

```sh
.tooling/bin/node scripts/publication.mjs prepare
```

Команда сама проверяет `git diff --check`, запускает тесты и сборку с `SITE_URL=https://vladdez.github.io` и `BASE_PATH=/family-tree/`. Затем сохраняет в игнорируемой папке `.tooling/publication/`:

- `snapshot.json`: содержимое изменённых и новых файлов, удаления, Git SHA каждого файла и кодировку;
- `manifest.json`: список файлов без содержимого, число частей снимка и время успешных проверок.

Если исходники изменились во время проверок, команда завершается ошибкой. При ошибке проверки остановите публикацию и исправьте причину. Не запускайте дополнительно те же тесты и сборку после успешного `prepare`, если исходники не менялись.

## 2. Получить текущую версию GitHub и определить реальные изменения

Локальный `HEAD` и `origin/main` могут отставать: предыдущие публикации выполнялись через коннектор. Поэтому `git status` показывает также уже опубликованные изменения. Не делайте `reset`, не создавайте дублирующие локальные коммиты и не принимайте весь вывод `git status` за новую публикацию.

В `functions.exec` загрузите метаданные. Не печатайте целиком ответы API и содержимое файлов; выводите только краткие результаты.

```js
const cwd = '/Users/Vladimir/Desktop/Projects/Family tree';
const node = '/Users/Vladimir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node';
const repo = 'vladdez/family-tree';
const api = 'https://api.github.com/repos/' + repo;
const checked = (r) => { if (r.isError) throw new Error(JSON.stringify(r)); return r; };
const fetchJson = async (url) => JSON.parse(checked(await tools.mcp__codex_apps__github_fetch({ url })).structuredContent.content);
const manifestResult = await tools.exec_command({ cmd: node + ' scripts/publication.mjs manifest', workdir: cwd, max_output_tokens: 16000 });
if (manifestResult.exit_code !== 0) throw new Error(manifestResult.output);
const manifest = JSON.parse(manifestResult.output);
const ref = await fetchJson(api + '/git/ref/heads/main');
const parent = ref.object.sha;
const commit = await fetchJson(api + '/git/commits/' + parent);
const remoteTree = await fetchJson(api + '/git/trees/' + commit.tree.sha + '?recursive=1');
if (remoteTree.truncated) throw new Error('Неполное дерево репозитория');
const remote = Object.fromEntries(remoteTree.tree.filter(e => e.type === 'blob').map(e => [e.path, e]));
const changed = manifest.files.filter(e => e.sha === null
  ? remote[e.path] !== undefined
  : remote[e.path]?.sha !== e.sha || remote[e.path]?.mode !== e.mode);
store('publication', { cwd, node, repo, api, parent, baseTree: commit.tree.sha, manifest, changed });
text({ files: changed.length, paths: changed.map(e => e.path) });
```

Если изменений нет, не создавайте коммит: новых локальных правок для отправки нет. Если свежий GitHub содержит неожиданные чужие изменения в затронутых файлах, сначала согласуйте версии; не затирайте их локальным снимком.

## 3. Создать одно дерево с изменениями

Читайте снимок небольшими частями, чтобы вывод инструментов не обрезался. Возвращённая часть — JSON-строка; сначала разберите каждую часть, затем объедините и разберите весь снимок. Не вставляйте содержимое файлов в команды оболочки.

```js
const p = load('publication');
const results = await Promise.allSettled(Array.from({ length: p.manifest.chunks }, (_, index) =>
  tools.exec_command({ cmd: p.node + ' scripts/publication.mjs part ' + index, workdir: p.cwd, max_output_tokens: 10000 })
));
const snapshot = JSON.parse(results.map((r, index) => {
  if (r.status !== 'fulfilled' || r.value.exit_code !== 0) throw new Error('Не прочитана часть ' + index);
  return JSON.parse(r.value.output);
}).join(''));
const paths = new Set(p.changed.map(e => e.path));
const elements = [];
for (const entry of snapshot.filter(e => paths.has(e.path))) {
  const { path, mode, type, sha, encoding, content } = entry;
  if (sha === null) elements.push({ path, mode, type, sha: null });
  else if (encoding === 'base64') {
    const blob = await tools.mcp__codex_apps__github_create_blob({ repository_full_name: p.repo, content, encoding });
    if (blob.isError) throw new Error(JSON.stringify(blob));
    elements.push({ path, mode, type, sha: blob.structuredContent.sha });
  } else elements.push({ path, mode, type, content });
}
const fresh = await tools.exec_command({ cmd: p.node + ' scripts/publication.mjs manifest', workdir: p.cwd, max_output_tokens: 16000 });
if (fresh.exit_code !== 0) throw new Error(fresh.output);
const tree = await tools.mcp__codex_apps__github_create_tree({ repository_full_name: p.repo, base_tree_sha: p.baseTree, tree_elements: elements });
if (tree.isError) throw new Error(JSON.stringify(tree));
store('publication', { ...p, tree: tree.structuredContent.sha });
text({ preparedFiles: elements.length });
```

Пустой список изменений не передавайте на запись. Удаления уже отсутствующих на GitHub файлов исключаются на шаге 2. Для обычного текста не передавайте одновременно `sha` и `content`.

## 4. Создать коммит и обновить `main`

Последовательно вызовите:

1. `github_create_commit`: `repository_full_name` из состояния, `parent_sha: parent`, `tree_sha: tree`, короткое сообщение о текущих изменениях. Сохраните возвращённый `structuredContent.sha` как SHA публикации.
2. `github_update_ref`: `branch_name: "main"`, `sha` нового коммита, `expected_sha: parent`, `force: false`.

При несовпадении `expected_sha` перечитайте GitHub и пересчитайте изменения. Не используйте принудительное обновление. При отклонении записи пользователем остановитесь; автоматически повторять её нельзя.

Локальный `.git` не нужно менять для публикации через коннектор. После успешной записи никогда не используйте старый локальный `HEAD` как родителя следующей удалённой публикации.

## 5. Дождаться GitHub Pages

Через `github_fetch` прочитайте:

```text
https://api.github.com/repos/vladdez/family-tree/actions/runs?head_sha=<SHA публикации>&per_page=3
```

Выберите запуск нужного workflow именно для отправленного SHA. Далее проверяйте `/actions/runs/<id>` примерно раз в 20 секунд, пока `status` не станет `completed`. Успех — только `conclusion: "success"`. Пользователю сообщайте о ходе работы не реже раза в минуту.

Если запуск завершился ошибкой, прочитайте его jobs и логи провалившегося шага. Не объявляйте сайт обновлённым по одному лишь успешному обновлению ветки. При отмене более новым запуском проверьте новый SHA и соответствующий запуск.

## 6. Проверить опубликованные страницы

После успешного workflow выполните, указав затронутые страницы:

```sh
.tooling/bin/node scripts/publication.mjs verify en/ en/tree/ people/dmitry-mikheev-1910/ en/people/dmitry-mikheev-1910/ people/anastasia-mikhailova-1914/ en/people/anastasia-mikhailova-1914/
```

Команда всегда проверяет русские главную и `/tree/`, а также переданные страницы: HTTP 200 и совпадение текста основного содержимого с локальной проверенной сборкой. При каждой публикации добавляйте `en/` и `en/tree/`, а для каждой затронутой страницы — оба адреса: русский и соответствующий `en/…`, как в примере выше.

Для новых карточек добавьте их адреса на обоих языках. Для изменений оформления дополнительно проверьте загруженный CSS или JS обеих версий: текстовая проверка не подтверждает стили. При подозрении на задержку кэша повторите чтение через короткий интервал; не создавайте новый коммит с теми же файлами.

В конце дайте короткий ответ со ссылкой: «Сайт обновлён. Последние изменения опубликованы и проверены». Новые локальные правки после публикации ждут следующей отдельной команды пользователя.
