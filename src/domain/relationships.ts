import type { Catalog, RelationStatus, FamilyRelation } from './schemas';
import { getPerson, fullName, lifespan, chronologicalPeople } from './people';
import { personUrl } from './urls';

export function getParents(personId: string, catalog: Catalog) { return getPerson(personId, catalog).parents.map((id) => getPerson(id, catalog)); }
export function getChildren(personId: string, catalog: Catalog) { return getPerson(personId, catalog).children.map((id) => getPerson(id, catalog)); }
export function getSpouses(personId: string, catalog: Catalog) { return getPerson(personId, catalog).spouses.map((id) => getPerson(id, catalog)); }
export function getSiblings(personId: string, catalog: Catalog) {
  const parents = getParents(personId, catalog);
  const ids = new Set(parents.flatMap((p) => p.children).filter((id) => id !== personId));
  for (const relation of catalog.relations ?? []) if (relation.type === 'half_sibling') {
    if (relation.person1 === personId) ids.add(relation.person2);
    if (relation.person2 === personId) ids.add(relation.person1);
  }
  return [...ids].map((id) => getPerson(id, catalog));
}
export const relationStatusLabels: Record<RelationStatus, string> = {
  explicit: 'Указано в семейных данных', inferred_context: 'Предположение из контекста',
  inferred_branch_context: 'Предположение по контексту ветви', unresolved: 'Требует уточнения',
};
export function relationEndpoints(relation: FamilyRelation): [string, string] {
  return relation.type === 'parent' ? [relation.parent, relation.child] : [relation.person1, relation.person2];
}
function relationAnnotation(personId: string, relativeId: string, type: FamilyRelation['type'], catalog: Catalog): string {
  const relation = catalog.relations?.find((r) => r.type === type && relationEndpoints(r).includes(personId) && relationEndpoints(r).includes(relativeId));
  return relation && relation.status !== 'explicit' ? relationStatusLabels[relation.status] : '';
}
export function getRelativeGroups(personId: string, catalog: Catalog) {
  const group = (label: string, people: ReturnType<typeof getParents>, type: FamilyRelation['type']) => ({
    label, people, annotations: Object.fromEntries(people.map((p) => [p.id, relationAnnotation(personId, p.id, type, catalog)])),
  });
  const siblings = getSiblings(personId, catalog);
  const siblingGroup = group('Братья и сёстры', siblings, 'half_sibling');
  for (const sibling of siblings) {
    const half = catalog.relations?.find((r) => r.type === 'half_sibling' && relationEndpoints(r).includes(personId) && relationEndpoints(r).includes(sibling.id));
    if (half) siblingGroup.annotations[sibling.id] = `Неполнородное родство · ${relationStatusLabels[half.status]}`;
    else {
      const sharedParents = getPerson(personId, catalog).parents.filter((id) => sibling.parents.includes(id));
      const explicitPath = sharedParents.some((parent) => !relationAnnotation(personId, parent, 'parent', catalog) && !relationAnnotation(sibling.id, parent, 'parent', catalog));
      if (!explicitPath) siblingGroup.annotations[sibling.id] = 'Предполагаемое родство через общих родителей';
    }
  }
  const groups = [group('Родители', getParents(personId, catalog), 'parent'), group('Супруги', getSpouses(personId, catalog), 'spouse'), group('Дети', getChildren(personId, catalog), 'parent'), siblingGroup];
  const possibleIds = new Set((catalog.relations ?? []).filter((r) => r.type === 'possible_same_person' && relationEndpoints(r).includes(personId)).flatMap((r) => relationEndpoints(r).filter((id) => id !== personId)));
  if (possibleIds.size) groups.push(group('Возможное совпадение записи', [...possibleIds].map((id) => getPerson(id, catalog)), 'possible_same_person'));
  return groups;
}
export interface TreePerson { id: string; name: string; lifespan: string; href: string; uncertain: boolean }
export interface TreeRelationship { id: string; from: string; to: string; type: FamilyRelation['type']; status?: RelationStatus; kind?: 'biological' | 'adoptive' | 'unknown' }
export function getTreeRelationships(catalog: Catalog): TreeRelationship[] {
  const relationships: TreeRelationship[] = [];
  if (catalog.relations?.length) {
    for (const relation of catalog.relations) {
      const [from, to] = relationEndpoints(relation);
      relationships.push({ id: `${relation.type}:${from}:${to}`, from, to, type: relation.type, status: relation.status, ...(relation.type === 'parent' ? { kind: relation.kind ?? 'unknown' } : {}) });
    }
  } else for (const person of catalog.people) {
    for (const parent of person.parents) relationships.push({ id: `parent:${parent}:${person.id}`, from: parent, to: person.id, type: 'parent', kind: person.parentDetails.find((p) => p.personId === parent)?.kind ?? 'unknown' });
    for (const spouse of person.spouses) if (person.id < spouse) relationships.push({ id: `spouse:${person.id}:${spouse}`, from: person.id, to: spouse, type: 'spouse' });
  }
  return relationships;
}
export function getTreeData(catalog: Catalog): { people: TreePerson[]; relationships: TreeRelationship[] } {
  return { people: chronologicalPeople(catalog).map((p) => ({ id: p.id, name: fullName(p), lifespan: lifespan(p), href: personUrl(p.slug), uncertain: !!(p.birth.alternatives.length || p.death.alternatives.length) })), relationships: getTreeRelationships(catalog) };
}
