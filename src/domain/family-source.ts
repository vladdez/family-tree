import { FamilySourceSchema, PersonProfileSchema, PersonSchema, type Person } from './schemas';

export function adaptFamilySource(input: unknown, profileInputs: unknown[] = []) {
  const source = FamilySourceSchema.parse(input);
  const profiles = new Map<string, ReturnType<typeof PersonProfileSchema.parse>>();
  const ids = new Set<string>();
  for (const record of source.people) {
    if (ids.has(record.id)) throw new Error(`Повтор person ID в family.json: ${record.id}`);
    ids.add(record.id);
  }
  for (const input of profileInputs) {
    const profile = PersonProfileSchema.parse(input);
    if (!ids.has(profile.id)) throw new Error(`Профиль ${profile.id}: человек отсутствует в family.json`);
    if (profiles.has(profile.id)) throw new Error(`Повтор профиля ${profile.id}`);
    profiles.set(profile.id, profile);
  }
  const event = (years: number[] = [], sourceDate: string | null | undefined, profileDate: string | null | undefined, placeId: string | null = null, documentId?: string): Person['birth'] => {
    if (sourceDate && profileDate && sourceDate !== profileDate && !profileDate.startsWith(`${sourceDate}-`)) throw new Error('Дата профиля противоречит дате family.json');
    const exact = profileDate ?? sourceDate;
    if (exact && years.length && (years.length !== 1 || Number(exact.slice(0, 4)) !== years[0])) throw new Error('Дата профиля противоречит годам family.json: сначала уточните исходную запись');
    const dates = years.map((year) => String(year).padStart(4, '0'));
    return { date: exact ?? (dates.length === 1 ? dates[0] : null), alternatives: dates.length > 1 ? dates : [], placeId, ...(documentId ? { documentId } : {}), notes: dates.length > 1 ? 'В семейных данных указано несколько вариантов года. Требуется уточнение источника.' : '' };
  };
  const people = source.people.map((record) => {
    const profile = profiles.get(record.id);
    return PersonSchema.parse({
      id: record.id, slug: profile?.slug ?? record.id,
      firstName: record.firstName, lastName: record.lastName, patronymic: record.patronymic, maidenName: record.maidenName,
      ...(record.archivalName ? { archivalName: record.archivalName } : {}),
      alternateNames: record.alternateNames,
      sex: profile?.sex ?? 'unknown',
      birth: event(record.birthYears, record.birth, profile?.birthDate, profile?.birthPlaceId, profile?.birthDocumentId),
      death: event(record.deathYears, record.death, profile?.deathDate, profile?.deathPlaceId, profile?.deathDocumentId),
      parents: [], spouses: [], children: [],
      portrait: profile?.portrait ?? null, summary: profile?.summary ?? '', biography: profile?.biography ?? '', notes: profile?.notes ?? '',
      sources: profile?.sources ?? [],
      marriages: profile?.marriages ?? [], events: profile?.events ?? [],
    });
  });
  const byId = new Map(people.map((p) => [p.id, p]));
  for (const relation of source.relations) {
    if (relation.type === 'parent') {
      const parent = byId.get(relation.parent), child = byId.get(relation.child);
      if (!parent || !child) throw new Error(`Родительская связь с неизвестным ID: ${relation.parent} → ${relation.child}`);
      parent.children.push(child.id); child.parents.push(parent.id);
      child.parentDetails.push({ personId: parent.id, role: relation.role ?? 'parent', kind: relation.kind ?? 'unknown' });
    } else {
      const first = byId.get(relation.person1), second = byId.get(relation.person2);
      if (!first || !second) throw new Error(`Связь с неизвестным ID: ${relation.person1} ↔ ${relation.person2}`);
      if (relation.type === 'spouse') { first.spouses.push(second.id); second.spouses.push(first.id); }
      // Sibling links never invent a shared parent; possible identities stay distinct.
    }
  }
  return { people, relations: source.relations, unidentifiedRelatives: source.unidentifiedRelatives, issues: source.issues };
}
