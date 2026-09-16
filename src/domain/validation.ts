import { PersonSchema, DocumentSchema, PlaceSchema, FamilyRelationSchema, UnidentifiedRelativeSchema, FamilyIssueSchema, type Catalog } from './schemas';
import { dateBounds } from './dates';

export function validateCatalog(raw: { people: unknown[]; documents: unknown[]; places: unknown[]; relations?: unknown[]; unidentifiedRelatives?: unknown[]; issues?: unknown[] }): Catalog {
  const catalog: Catalog = {
    people: raw.people.map((p) => PersonSchema.parse(p)),
    documents: raw.documents.map((d) => DocumentSchema.parse(d)),
    places: raw.places.map((p) => PlaceSchema.parse(p)),
    relations: (raw.relations ?? []).map((r) => FamilyRelationSchema.parse(r)),
    unidentifiedRelatives: (raw.unidentifiedRelatives ?? []).map((r) => UnidentifiedRelativeSchema.parse(r)),
    issues: (raw.issues ?? []).map((i) => FamilyIssueSchema.parse(i)),
  };
  const errors: string[] = [];
  function unique(values: string[], label: string) {
    const seen = new Set<string>();
    for (const value of values) { if (seen.has(value)) errors.push(`Повтор ${label}: ${value}`); seen.add(value); }
  }
  unique(catalog.people.map((p) => p.id), 'person ID');
  unique(catalog.people.map((p) => p.slug), 'slug');
  unique(catalog.documents.map((d) => d.id), 'document ID');
  unique(catalog.places.map((p) => p.id), 'place ID');
  const people = new Map(catalog.people.map((p) => [p.id, p]));
  const places = new Set(catalog.places.map((p) => p.id));
  const documents = new Map(catalog.documents.map((d) => [d.id, d]));
  const relationKeys: string[] = [];
  const checkPersonRefs = (references: string[], label: string) => {
    for (const id of references) if (!people.has(id)) errors.push(`${label}: неизвестный person ID ${id}`);
  };
  for (const relation of catalog.relations ?? []) {
    const refs = relation.type === 'parent' ? [relation.parent, relation.child] : [relation.person1, relation.person2];
    checkPersonRefs(refs, relation.type);
    if (refs[0] === refs[1]) errors.push(`${relation.type}: связь с самим собой ${refs[0]}`);
    relationKeys.push(`${relation.type}:${(relation.type === 'parent' ? refs : [...refs].sort()).join(':')}`);
    if (relation.type === 'parent' && (!people.get(relation.child)?.parents.includes(relation.parent) || !people.get(relation.parent)?.children.includes(relation.child))) errors.push('Родительская связь не согласована с каталогом');
    if (relation.type === 'spouse' && (!people.get(relation.person1)?.spouses.includes(relation.person2) || !people.get(relation.person2)?.spouses.includes(relation.person1))) errors.push('Супружеская связь не согласована с каталогом');
  }
  unique(relationKeys, 'связи family.json');
  for (const relative of catalog.unidentifiedRelatives ?? []) checkPersonRefs(relative.people, 'Безымянные родственники');
  for (const issue of catalog.issues ?? []) checkPersonRefs([...(issue.person ? [issue.person] : []), ...(issue.people ?? []), ...(issue.relatedPerson ? [issue.relatedPerson] : [])], 'Замечание к источнику');
  for (const person of catalog.people) {
    for (const [relation, inverse] of [['parents', 'children'], ['children', 'parents'], ['spouses', 'spouses']] as const) {
      for (const targetId of person[relation]) {
        const target = people.get(targetId);
        if (!target) errors.push(`${person.id}: неизвестный ${relation} ID ${targetId}`);
        else if (targetId === person.id) errors.push(`${person.id}: связь с самим собой`);
        else if (!target[inverse].includes(person.id)) errors.push(`${person.id} → ${targetId}: отсутствует обратная связь ${inverse}`);
        if (person.spouses.includes(targetId) && relation !== 'spouses') errors.push(`${person.id}: ${targetId} одновременно супруг и родитель/ребёнок`);
      }
    }
    for (const event of [person.birth, person.death]) if (event.placeId && !places.has(event.placeId)) errors.push(`${person.id}: неизвестное место ${event.placeId}`);
    unique(person.parentDetails.map((p) => p.personId), `${person.id} parentDetails`);
    for (const detail of person.parentDetails) if (!person.parents.includes(detail.personId)) errors.push(`${person.id}: parentDetails должен ссылаться на parents`);
    const b = person.birth.date && dateBounds(person.birth.date);
    const d = person.death.date && dateBounds(person.death.date);
    if (b && d && b.min > d.max) errors.push(`${person.id}: смерть раньше рождения`);
    for (const marriage of person.marriages) {
      if (!person.spouses.includes(marriage.spouseId)) errors.push(`${person.id}: брак с человеком вне spouses`);
      const other = people.get(marriage.spouseId);
      if (other && !other.marriages.some((m) => m.spouseId === person.id && m.date === marriage.date && m.documentId === marriage.documentId)) errors.push(`${person.id}: брак должен быть отражён у обоих супругов`);
    }
    unique(person.events.map((e) => e.id), `${person.id} event ID`);
    for (const event of [...person.events, ...person.marriages]) if (event.documentId && !documents.get(event.documentId)?.peopleIds.includes(person.id)) errors.push(`${person.id}: документ события ${event.documentId} отсутствует или не связан с человеком`);
  }
  for (const document of catalog.documents) for (const personId of document.peopleIds) if (!people.has(personId)) errors.push(`${document.id}: неизвестный person ID ${personId}`);
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) { errors.push(`Цикл в родительских связях: ${id}`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const parent of people.get(id)?.parents ?? []) visit(parent);
    visiting.delete(id); visited.add(id);
  }
  for (const p of catalog.people) visit(p.id);
  if (errors.length) throw new Error(`Ошибки семейных данных:\n${errors.join('\n')}`);
  return catalog;
}
