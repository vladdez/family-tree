import type { Catalog } from './schemas';
import { getPerson } from './people';
import { getChildren } from './relationships';
import { getDocumentsForPerson } from './documents';
import { compareDates } from './dates';

export interface TimelineEntry {
  id: string; date: string | null; alternatives: string[]; title: string;
  type: 'birth' | 'death' | 'marriage' | 'document' | 'other';
  documentId?: string; peopleIds: string[]; notes: string;
}
export function getTimeline(personId: string, catalog: Catalog): TimelineEntry[] {
  const person = getPerson(personId, catalog);
  const entries: TimelineEntry[] = [];
  const basic = (id: string, date: string | null, title: string, type: TimelineEntry['type']): TimelineEntry => ({ id, date, title, type, alternatives: [], peopleIds: [], notes: '' });
  entries.push({ ...basic(`${personId}:birth`, person.birth.date, 'Рождение', 'birth'), alternatives: person.birth.alternatives, documentId: person.birth.documentId, notes: person.birth.notes });
  if (person.death.date || person.death.alternatives.length) entries.push({ ...basic(`${personId}:death`, person.death.date, 'Смерть', 'death'), alternatives: person.death.alternatives, documentId: person.death.documentId, notes: person.death.notes });
  person.marriages.forEach((m, index) => entries.push({ ...basic(`${personId}:marriage:${index}`, m.date, 'Брак', 'marriage'), documentId: m.documentId, peopleIds: [m.spouseId], notes: m.notes }));
  for (const child of getChildren(personId, catalog)) {
    const kind = child.parentDetails.find((p) => p.personId === personId)?.kind;
    if (kind === 'biological' && child.birth.date) entries.push({ ...basic(`${personId}:child:${child.id}`, child.birth.date, 'Рождение ребёнка', 'other'), peopleIds: [child.id] });
  }
  for (const e of person.events) entries.push({ ...basic(`${personId}:event:${e.id}`, e.date, e.title, 'other'), documentId: e.documentId, notes: e.notes });
  const usedDocuments = new Set(entries.flatMap((e) => e.documentId ? [e.documentId] : []));
  for (const d of getDocumentsForPerson(personId, catalog)) if (!usedDocuments.has(d.id)) entries.push({ ...basic(`${personId}:document:${d.id}`, d.date, d.title, d.type === 'marriage' ? 'marriage' : 'document'), documentId: d.id });
  // Uncertain or undated events stay at the end: no guessed calendar position.
  return entries.sort((a, b) => compareDates(a.date, b.date));
}
