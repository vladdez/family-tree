import type { Catalog, Person } from './schemas';
import type { TimelineEntry } from './timeline';
import { parseInlineLinks } from './inline-links';

export interface ProfileFootnote {
  number: number; title: string; href: string; pages: string; documentIds: string[];
}

function inlineProfileLinks(person: Person, timeline: TimelineEntry[]) {
  const biography = Array.isArray(person.biography) ? person.biography.map((section) => section.text) : [person.biography];
  return [...biography, person.notes, ...timeline.map((event) => event.notes)].flatMap(parseInlineLinks);
}

export function getProfileFootnotes(person: Person, timeline: TimelineEntry[], catalog: Catalog): ProfileFootnote[] {
  const footnotes: ProfileFootnote[] = person.sources.map((source, index) => ({ ...source, number: index + 1, documentIds: [] }));
  for (const event of timeline) {
    if (!event.documentId) continue;
    const document = catalog.documents.find((document) => document.id === event.documentId);
    if (!document || footnotes.some((source) => source.documentIds.includes(document.id))) continue;
    const href = `/documents/${document.id}/`;
    const existing = footnotes.find((source) => source.href === href || (document.originalUrl && source.href === document.originalUrl));
    if (existing) existing.documentIds.push(document.id);
    else footnotes.push({ number: footnotes.length + 1, title: document.title, href, pages: '', documentIds: [document.id] });
  }
  for (const part of inlineProfileLinks(person, timeline)) {
    if (part.href && !footnotes.some((source) => source.href === part.href)) {
      footnotes.push({ number: footnotes.length + 1, title: part.text, href: part.href, pages: '', documentIds: [] });
    }
  }
  return footnotes;
}

export function getGeneralProfileFootnotes(person: Person, timeline: TimelineEntry[], footnotes: ProfileFootnote[]): ProfileFootnote[] {
  const explicit = new Set([
    ...(Array.isArray(person.biography) ? person.biography.flatMap((section) => section.sourceRefs ?? []) : []),
    ...timeline.flatMap((event) => event.sourceRefs ?? []),
  ]);
  const inlineHrefs = new Set(inlineProfileLinks(person, timeline).map((part) => part.href).filter(Boolean));
  const documentIds = new Set(timeline.map((event) => event.documentId).filter(Boolean));
  return footnotes.filter((source) => source.number <= person.sources.length && !explicit.has(source.number)
    && !inlineHrefs.has(source.href) && !source.documentIds.some((id) => documentIds.has(id)));
}
