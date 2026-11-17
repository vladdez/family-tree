import type { Catalog, Person } from './schemas';
import type { TimelineEntry } from './timeline';
import { parseInlineLinks } from './inline-links';

export interface ProfileFootnote {
  number: number; title: string; href: string; pages: string; documentIds: string[];
  sourceNumber?: number;
}

function inlineProfileLinks(person: Person, timeline: TimelineEntry[]) {
  const biography = Array.isArray(person.biography) ? person.biography.map((section) => section.text) : [person.biography];
  return [...biography, person.notes, ...timeline.map((event) => event.notes)].flatMap(parseInlineLinks);
}

export function getProfileFootnotes(person: Person, timeline: TimelineEntry[], catalog: Catalog): ProfileFootnote[] {
  const footnotes: ProfileFootnote[] = person.sources.map((source, index) => ({ ...source, number: index + 1, sourceNumber: index + 1, documentIds: [] }));
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
  // Keep sourceRefs tied to the source data while numbering displayed citations
  // in reading order: biography, notes, then timeline. Uncited sources stay last.
  const ordered = new Set<ProfileFootnote>();
  const addInline = (text: string) => {
    for (const part of parseInlineLinks(text)) {
      const source = part.href && footnotes.find((source) => source.href === part.href);
      if (source) ordered.add(source);
    }
  };
  const addReferences = (refs: number[] = [], documentId?: string) => {
    for (const source of footnotes) {
      if ((source.sourceNumber !== undefined && refs.includes(source.sourceNumber))
        || (documentId && source.documentIds.includes(documentId))) ordered.add(source);
    }
  };
  if (Array.isArray(person.biography)) {
    for (const section of person.biography) { addInline(section.text); addReferences(section.sourceRefs); }
  } else addInline(person.biography);
  addInline(person.notes);
  for (const event of timeline) { addReferences(event.sourceRefs, event.documentId); addInline(event.notes); }
  for (const source of footnotes) ordered.add(source);
  return [...ordered].map((source, index) => ({ ...source, number: index + 1 }));
}
