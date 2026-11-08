import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { generateEnglishSource } from './english-source';
import { projectRoot } from './data-files';

const repository = process.env.GITHUB_REPOSITORY?.split('/');
const siteBase = process.env.BASE_PATH ?? (repository && repository[1] !== `${repository[0]}.github.io` ? `/${repository[1]}/` : '/');
const base = `${siteBase.replace(/\/$/, '')}/`;
const astroPackage = JSON.parse(await readFile(path.join(projectRoot, 'node_modules/astro/package.json'), 'utf8'));
const astroCli = path.join(projectRoot, 'node_modules/astro', typeof astroPackage.bin === 'string' ? astroPackage.bin : astroPackage.bin.astro);
function build(language: 'ru' | 'en') {
  const result = spawnSync(process.execPath, [astroCli, 'build'], {
    cwd: projectRoot, stdio: 'inherit', env: { ...process.env, PUBLIC_SITE_LANGUAGE: language, PUBLIC_MEDIA_BASE: base, BASE_PATH: language === 'en' ? `${base}en/` : base },
  });
  if (result.status !== 0) throw new Error(`${language}: Astro build failed (${result.status})`);
}
await generateEnglishSource();
build('ru');
build('en');
