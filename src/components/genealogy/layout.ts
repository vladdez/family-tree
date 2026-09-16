import type { TreePerson, TreeRelationship } from '../../domain/relationships';

export interface Geometry { nodeWidth: number; nodeHeight: number; gap: number; generationGap: number }
export interface PositionedPerson extends TreePerson { x: number; y: number }
export function layoutTree(people: TreePerson[], edges: TreeRelationship[], geometry: Geometry): { nodes: PositionedPerson[]; width: number; height: number } {
  const { nodeWidth, nodeHeight, gap, generationGap } = geometry;
  if (!edges.length) {
    // A register of unconnected records: rows do not claim family generations.
    const columns = Math.min(3, people.length || 1);
    const nodes = people.map((p, i) => ({ ...p, x: gap + (i % columns) * (nodeWidth + gap), y: gap + Math.floor(i / columns) * (nodeHeight + gap) }));
    return { nodes, width: columns * (nodeWidth + gap) + gap, height: Math.ceil(people.length / columns) * (nodeHeight + gap) + gap };
  }
  // Spouses share a display row even when their known ancestries have different depths.
  // Grouping is only a layout decision; it never creates family relationships.
  const representative = new Map(people.map((p) => [p.id, p.id]));
  function find(id: string): string {
    const parent = representative.get(id) ?? id;
    if (parent === id) return id;
    const root = find(parent); representative.set(id, root); return root;
  }
  for (const edge of edges.filter((e) => e.type === 'spouse')) representative.set(find(edge.from), find(edge.to));
  const members = new Map<string, TreePerson[]>();
  for (const p of people) { const group = find(p.id); members.set(group, [...(members.get(group) ?? []), p]); }
  const groupParents = new Map([...members.keys()].map((id) => [id, new Set<string>()]));
  const groupChildren = new Map([...members.keys()].map((id) => [id, new Set<string>()]));
  for (const edge of edges.filter((e) => e.type === 'parent')) {
    groupParents.get(find(edge.to))?.add(find(edge.from)); groupChildren.get(find(edge.from))?.add(find(edge.to));
  }
  const degrees = new Map([...groupParents].map(([id, parents]) => [id, parents.size]));
  const order = [...degrees].filter(([, count]) => count === 0).map(([id]) => id);
  const groupRanks = new Map([...members.keys()].map((id) => [id, 0]));
  for (let i = 0; i < order.length; i++) {
    const parent = order[i];
    for (const child of groupChildren.get(parent) ?? []) {
      groupRanks.set(child, Math.max(groupRanks.get(child) ?? 0, (groupRanks.get(parent) ?? 0) + 1));
      degrees.set(child, (degrees.get(child) ?? 1) - 1);
      if (degrees.get(child) === 0) order.push(child);
    }
  }
  if (order.length !== members.size) {
    // A legitimate ancestry graph may become cyclic after spouse grouping.
    // Fall back to separate nodes rather than assuming a binary pedigree.
    const parentOnly = layoutTree(people, edges.filter((e) => e.type === 'parent'), geometry);
    return parentOnly;
  }
  for (const edge of edges.filter((e) => e.type === 'half_sibling')) {
    for (const [a, b] of [[find(edge.from), find(edge.to)], [find(edge.to), find(edge.from)]]) {
      if (!groupParents.get(a)?.size) groupRanks.set(a, Math.max(groupRanks.get(a) ?? 0, groupRanks.get(b) ?? 0));
    }
  }
  for (const group of order) for (const child of groupChildren.get(group) ?? []) groupRanks.set(child, Math.max(groupRanks.get(child) ?? 0, (groupRanks.get(group) ?? 0) + 1));
  // Move short ancestral branches next to their children without inventing generations.
  for (const group of [...order].reverse()) {
    const children = [...(groupChildren.get(group) ?? [])];
    if (children.length) groupRanks.set(group, Math.max(groupRanks.get(group) ?? 0, Math.min(...children.map((id) => (groupRanks.get(id) ?? 0) - 1))));
  }
  const ranks = new Map(people.map((p) => [p.id, groupRanks.get(find(p.id)) ?? 0]));
  const rows = new Map<number, TreePerson[]>();
  for (const [group, records] of members) { const rank = groupRanks.get(group) ?? 0; rows.set(rank, [...(rows.get(rank) ?? []), ...records]); }
  const maxColumns = Math.max(...[...rows.values()].map((row) => row.length), 1);
  const width = maxColumns * (nodeWidth + gap) + gap;
  const nodes: PositionedPerson[] = [];
  for (const [rank, row] of rows) {
    const offset = (width - row.length * (nodeWidth + gap) + gap) / 2;
    row.forEach((p, i) => nodes.push({ ...p, x: offset + i * (nodeWidth + gap), y: gap + rank * (nodeHeight + generationGap) }));
  }
  return { nodes, width, height: (Math.max(...ranks.values(), 0) + 1) * (nodeHeight + generationGap) + gap };
}
