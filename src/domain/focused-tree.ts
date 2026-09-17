import { z } from 'zod';
import type { Catalog } from './schemas';
import { getParents, getRelativeGroups, getSiblings, getTreeData, type TreePerson } from './relationships';

const settingsSchema = z.object({ focusPersonId: z.string().min(1) }).strict();
export interface HiddenRelativeGroup { label: string; people: (TreePerson & { annotation: string })[] }

/** Show ancestry, confirmed spouses and the focal person's own siblings. */
export function getFocusedTree(catalog: Catalog, settings: unknown) {
  const { focusPersonId } = settingsSchema.parse(settings);
  const tree = getTreeData(catalog), byId = new Map(tree.people.map((person) => [person.id, person]));
  if (!byId.has(focusPersonId)) throw new Error(`Неизвестный человек в настройках древа: ${focusPersonId}`);
  const visible = new Set([focusPersonId, ...getSiblings(focusPersonId, catalog).map((person) => person.id)]);
  const ancestors = new Set<string>(), pending = [focusPersonId];
  while (pending.length) {
    const id = pending.pop()!;
    if (ancestors.has(id)) continue;
    ancestors.add(id); visible.add(id);
    pending.push(...getParents(id, catalog).map((parent) => parent.id));
  }
  for (const edge of tree.relationships) if (edge.type === 'spouse' && (!edge.status || edge.status === 'explicit')) {
    if (ancestors.has(edge.from)) visible.add(edge.to);
    if (ancestors.has(edge.to)) visible.add(edge.from);
  }
  const people = tree.people.filter((person) => visible.has(person.id));
  const relatives: Record<string, HiddenRelativeGroup[]> = Object.fromEntries(people.map((person) => [person.id,
    getRelativeGroups(person.id, catalog).map((group) => ({ label: group.label, people: group.people
      .filter((relative) => !visible.has(relative.id))
      .map((relative) => ({ ...byId.get(relative.id)!, annotation: group.annotations[relative.id] ?? '' })) }))
      .filter((group) => group.people.length),
  ]));
  return {
    focusPersonId,
    familyPersonIds: [focusPersonId, ...getParents(focusPersonId, catalog).map((person) => person.id), ...getSiblings(focusPersonId, catalog).map((person) => person.id)],
    people,
    relationships: tree.relationships.filter((edge) => visible.has(edge.from) && visible.has(edge.to)),
    relatives,
  };
}
