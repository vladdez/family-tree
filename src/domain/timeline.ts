import type { Catalog } from './schemas';
import { getPerson } from './people';
import { getChildren } from './relationships';
import { getDocumentsForPerson } from './documents';
import { compareDates, dateBounds } from './dates';

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
  const deathDates = person.death.date ? [person.death.date] : person.death.alternatives;
  const latestDeath = deathDates.map((date) => dateBounds(date).max).sort().at(-1);
  for (const d of getDocumentsForPerson(personId, catalog)) {
    if (!d.showInTimeline || usedDocuments.has(d.id)) continue;
    // Undated and definitely posthumous records remain in the document section.
    // Evidence linked to a life event keeps that event's date above.
    if (latestDeath && (!d.date || dateBounds(d.date).min > latestDeath)) continue;
    entries.push({ ...basic(`${personId}:document:${d.id}`, d.date, d.title, d.type === 'marriage' ? 'marriage' : 'document'), documentId: d.id });
  }
  const before = new Map<string, TimelineEntry[]>();
  const anchored = new Set<string>();
  for (const event of person.events) if (event.beforeEventId) {
    const targetId = `${personId}:event:${event.beforeEventId}`;
    const entry = entries.find((entry) => entry.id === `${personId}:event:${event.id}`)!;
    before.set(targetId, [...(before.get(targetId) ?? []), entry]);
    anchored.add(entry.id);
  }
  const unplaced = entries.filter((entry) => !anchored.has(entry.id) && !entry.date && (entry.type === 'other' || entry.type === 'marriage'));
  const unplacedIds = new Set(unplaced.map((entry) => entry.id));
  const ordered = entries.filter((entry) => !anchored.has(entry.id) && !unplacedIds.has(entry.id) && entry.type !== 'birth' && entry.type !== 'death')
    .sort((a, b) => compareDates(a.date, b.date));
  ordered.push(...unplaced);
  ordered.unshift(entries.find((entry) => entry.type === 'birth')!);
  const death = entries.find((entry) => entry.type === 'death');
  if (death) ordered.push(death);
  const result: TimelineEntry[] = [];
  const append = (entry: TimelineEntry) => {
    for (const preceding of before.get(entry.id) ?? []) append(preceding);
    result.push(entry);
  };
  for (const entry of ordered) append(entry);
  return result;
}
