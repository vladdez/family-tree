import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Actions supplies the real Pages address. Locally, use SITE_URL / BASE_PATH.
const repository = process.env.GITHUB_REPOSITORY?.split('/');
const site = process.env.SITE_URL || (repository ? `https://${repository[0]}.github.io` : 'http://localhost:4321');
const repositoryBase = repository && repository[1] !== `${repository[0]}.github.io` ? `/${repository[1]}/` : '/';
const base = process.env.BASE_PATH ?? repositoryBase;

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'always',
  integrations: [react()],
});
