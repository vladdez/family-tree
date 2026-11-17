import type { Catalog } from './schemas';
import { compareDates } from './dates';
export function getDocumentsForPerson(personId: string, catalog: Catalog) {
  return catalog.documents.filter((d) => d.peopleIds.includes(personId)).sort((a, b) => compareDates(a.date, b.date));
}
export function getProfileDocuments(personId: string, catalog: Catalog) {
  const visible = getDocumentsForPerson(personId, catalog).filter((document) => document.showInDocumentTrail);
  return {
    photographs: visible.filter((document) => document.type === 'photograph'),
    documents: visible.filter((document) => document.type !== 'photograph'),
  };
}
export function getDocument(documentId: string, catalog: Catalog) {
  const document = catalog.documents.find((d) => d.id === documentId);
  if (!document) throw new Error(`Документ не найден: ${documentId}`);
  return document;
}
export function isImage(path: string) { return /\.(png|jpe?g|webp|avif|gif)$/i.test(path); }
