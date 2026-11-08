import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Actions supplies the real Pages address. Locally, use SITE_URL / BASE_PATH.
const repository = process.env.GITHUB_REPOSITORY?.split('/');
const site = process.env.SITE_URL || (repository ? `https://${repository[0]}.github.io` : 'http://localhost:4321');
const repositoryBase = repository && repository[1] !== `${repository[0]}.github.io` ? `/${repository[1]}/` : '/';
const base = process.env.BASE_PATH ?? repositoryBase;
const english = process.env.PUBLIC_SITE_LANGUAGE === 'en';

export default defineConfig({
  site,
  base,
  ...(english ? { srcDir: './.tooling/en/src', outDir: './dist/en', publicDir: './.tooling/en/public' } : {}),
  output: 'static',
  trailingSlash: 'always',
  integrations: [react()],
});
