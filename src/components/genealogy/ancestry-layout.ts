import type { TreeRelationship } from '../../domain/relationships';
import type { TreeBranch } from '../../domain/tree-branches';
import type { Geometry, PositionedPerson, TreeGraph } from './layout';

// Compact the main ancestral tree around each family’s centre. Collateral or
// shared ancestry continues to use the general branch layout.
export function centerAncestry(graph: TreeGraph, edges: TreeRelationship[], geometry: Geometry, branches: TreeBranch[]): TreeGraph {
  const families = branches.filter((branch) => branch.kind === 'family');
  const descendants = branches.find((branch) => branch.kind === 'descendants');
  if (families.length !== 2 || !descendants?.personIds.length
    || branches.some((branch) => branch !== descendants && !families.includes(branch))) return graph;
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const parents = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) if (edge.type === 'parent' && byId.has(edge.from) && byId.has(edge.to)) parents.get(edge.to)!.push(edge.from);
  const roots = [...new Set(descendants.personIds.flatMap((id) => parents.get(id) ?? []))];
  if (roots.length !== 2 || descendants.personIds.some((id) => parents.get(id)!.length !== 2)) return graph;
  const orderedRoots = families.map((branch) => roots.filter((id) => branch.personIds.includes(id)));
  if (orderedRoots.some((ids) => ids.length !== 1)) return graph;
  const seen = new Set<string>();
  function collect(id: string, members: Set<string>): boolean {
    if (seen.has(id) || !members.has(id)) return false;
    seen.add(id);
    return parents.get(id)!.every((parent) => collect(parent, members));
  }
  for (let index = 0; index < families.length; index++) {
    if (!collect(orderedRoots[index][0], new Set(families[index].personIds))) return graph;
  }
  const companions = new Map<string, string>();
  for (const branch of families) for (const id of branch.personIds.filter((member) => !seen.has(member))) {
    // A visible spouse occupies a neighbouring card without becoming a parent.
    const partners = edges.filter((edge) => edge.type === 'spouse' && (!edge.status || edge.status === 'explicit')
      && (edge.from === id || edge.to === id)).map((edge) => edge.from === id ? edge.to : edge.from)
      .filter((partner) => seen.has(partner) && branch.personIds.includes(partner));
    if (parents.get(id)!.length || partners.length !== 1 || companions.has(partners[0])
      || byId.get(id)!.y !== byId.get(partners[0])!.y) return graph;
    companions.set(partners[0], id);
  }
  const { nodeWidth, gap } = geometry, stride = nodeWidth + gap;
  function contours(nodes: PositionedPerson[]) {
    const rows = new Map<number, { left: number; right: number }>();
    for (const node of nodes) {
      const row = rows.get(node.y);
      rows.set(node.y, { left: Math.min(row?.left ?? Infinity, node.x), right: Math.max(row?.right ?? -Infinity, node.x) });
    }
    return rows;
  }
  function subtree(id: string): PositionedPerson[] {
    const ancestors = parents.get(id)!.slice().sort((a, b) => byId.get(a)!.x - byId.get(b)!.x);
    let nodes: PositionedPerson[] = [];
    const centres: number[] = [];
    for (const parent of ancestors) {
      const next = subtree(parent), placed = contours(nodes);
      let shift = centres.length ? centres.at(-1)! + stride : 0;
      for (const [y, row] of contours(next)) {
        const previous = placed.get(y);
        if (previous) shift = Math.max(shift, previous.right - row.left + stride);
      }
      nodes.push(...next.map((node) => ({ ...node, x: node.x + shift })));
      centres.push(shift);
    }
    const centre = centres.length ? centres.reduce((sum, x) => sum + x, 0) / centres.length : 0;
    nodes = nodes.map((node) => ({ ...node, x: node.x - centre }));
    const companion = companions.get(id);
    const pair = companion ? [{ ...byId.get(companion)!, x: byId.get(companion)!.x < byId.get(id)!.x ? -stride : stride }] : [];
    return [{ ...byId.get(id)!, x: 0 }, ...pair, ...nodes];
  }
  const left = subtree(orderedRoots[0][0]), right = subtree(orderedRoots[1][0]);
  // Leave a full card gap between the two coloured branches at every level.
  const distance = Math.max(stride, Math.max(...left.map((node) => node.x)) - Math.min(...right.map((node) => node.x)) + stride);
  const nodes = [...left, ...right.map((node) => ({ ...node, x: node.x + distance }))];
  for (const row of [...new Set(descendants.personIds.map((id) => byId.get(id)!.y))]) {
    const children = graph.nodes.filter((node) => descendants.personIds.includes(node.id) && node.y === row);
    children.forEach((node, index) => nodes.push({ ...node, x: distance / 2 + (index - (children.length - 1) / 2) * stride }));
  }
  const margin = graph.periods?.length ? nodeWidth + gap * 2 : gap;
  const shift = margin - Math.min(...nodes.map((node) => node.x));
  const positioned = nodes.map((node) => ({ ...node, x: node.x + shift })).sort((a, b) => a.y - b.y || a.x - b.x);
  const lanes = graph.lanes?.map((lane) => {
    const ids = branches.find((branch) => branch.id === lane.id)!.personIds;
    const members = positioned.filter((node) => ids.includes(node.id));
    const x = Math.min(...members.map((node) => node.x));
    return { ...lane, x, width: Math.max(...members.map((node) => node.x + nodeWidth)) - x };
  });
  return { ...graph, nodes: positioned, lanes, width: Math.max(...positioned.map((node) => node.x + nodeWidth)) + gap };
}
