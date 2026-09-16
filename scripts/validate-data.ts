import { validateCatalog } from '../src/domain/validation';
import { readRawCatalog, validateMedia } from './data-files';
try {
  const catalog = validateCatalog(await readRawCatalog());
  await validateMedia(catalog);
  console.log(`Данные проверены: ${catalog.people.length} людей, ${catalog.documents.length} документов, ${catalog.places.length} мест.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error); process.exitCode = 1;
}
