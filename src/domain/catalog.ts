import { validateCatalog } from './validation';
import { adaptFamilySource } from './family-source';
import source from '../data/family.json';

// Vite discovers JSON files automatically. UI never owns family records.
function records(glob: Record<string, { default: unknown }>) { return Object.values(glob).map((module) => module.default); }
export const catalog = validateCatalog({
  ...adaptFamilySource(source, records(import.meta.glob('../data/people/*.json', { eager: true }))),
  documents: records(import.meta.glob('../data/documents/*.json', { eager: true })),
  places: records(import.meta.glob('../data/places/*.json', { eager: true })),
});
