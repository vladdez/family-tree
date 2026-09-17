import { z } from 'zod';
import type { TreePerson, TreeRelationship } from './relationships';

const reservedIds = ['tree-descendants', 'tree-shared', 'tree-unassigned'];
const rootsSchema = z.array(z.object({
  id: z.string().min(1).refine((id) => !reservedIds.includes(id)),
  personId: z.string().min(1),
  label: z.string().trim().min(1),
}).strict()).refine((roots) => new Set(roots.map((root) => root.id)).size === roots.length
  && new Set(roots.map((root) => root.personId)).size === roots.length, 'Повтор корня или ID ветви');

export interface TreeBranch {
  id: string;
  label: string;
  kind: 'family' | 'descendants' | 'shared' | 'unassigned';
  personIds: string[];
}

// Branches are display areas derived from existing relationships. Traversal stops
// at the selected couple and their descendants, so marriage cannot mix both sides.
// A possible identity is not a relationship and never assigns someone to a side.
export function getTreeBranches(people: TreePerson[], edges: TreeRelationship[], input: unknown): TreeBranch[] {
  const roots = rootsSchema.parse(input);
  if (!roots.length) return [];
  const ids = new Set(people.map((person) => person.id));
  for (const root of roots) if (!ids.has(root.personId)) throw new Error(`Неизвестный корень ветви: ${root.personId}`);
  const rootIds = new Set(roots.map((root) => root.personId));
  const neighbours = new Map(people.map((person) => [person.id, new Set<string>()]));
  const children = new Map(people.map((person) => [person.id, new Set<string>()]));
  for (const edge of edges) {
    if (edge.type === 'parent') children.get(edge.from)?.add(edge.to);
    if (edge.type === 'possible_same_person') continue;
    neighbours.get(edge.from)?.add(edge.to);
    neighbours.get(edge.to)?.add(edge.from);
  }
  const descendants = new Set<string>();
  const queue = [...rootIds], visited = new Set(queue);
  for (let index = 0; index < queue.length; index++) for (const child of children.get(queue[index]) ?? []) {
    if (!rootIds.has(child)) descendants.add(child);
    if (!visited.has(child)) { visited.add(child); queue.push(child); }
  }
  const memberships = new Map(people.map((person) => [person.id, new Set<string>()]));
  for (const root of roots) {
    const family = [root.personId], seen = new Set(family);
    for (let index = 0; index < family.length; index++) for (const relative of neighbours.get(family[index]) ?? []) {
      if (seen.has(relative) || rootIds.has(relative) || descendants.has(relative)) continue;
      seen.add(relative); family.push(relative);
    }
    for (const id of seen) memberships.get(id)!.add(root.id);
  }
  const branches: TreeBranch[] = roots.map((root) => ({ id: root.id, label: root.label, kind: 'family', personIds: [] }));
  const shared: TreeBranch = { id: 'tree-shared', label: 'Связаны с обеими ветвями', kind: 'shared', personIds: [] };
  const unassigned: TreeBranch = { id: 'tree-unassigned', label: 'Ветвь не установлена', kind: 'unassigned', personIds: [] };
  const below: TreeBranch = { id: 'tree-descendants', label: 'Дети и потомки', kind: 'descendants', personIds: [] };
  for (const person of people) {
    const membership = memberships.get(person.id)!;
    if (descendants.has(person.id)) below.personIds.push(person.id);
    else if (membership.size > 1) shared.personIds.push(person.id);
    else if (membership.size === 1) branches.find((branch) => membership.has(branch.id))!.personIds.push(person.id);
    else unassigned.personIds.push(person.id);
  }
  return [...branches, shared, unassigned, below].filter((branch) => branch.personIds.length);
}
