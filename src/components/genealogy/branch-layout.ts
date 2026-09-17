import type { TreeRelationship } from '../../domain/relationships';
import type { TreeBranch } from '../../domain/tree-branches';
import type { Geometry, PositionedPerson, TreeGraph, TreeLane } from './layout';

// Keep chronology's rows intact. Fixed column slots keep long relationship lines
// in the gaps between cards, including when a relationship skips several periods.
export function layoutBranches(graph: TreeGraph, edges: TreeRelationship[], geometry: Geometry, branches: TreeBranch[]): TreeGraph {
  if (!graph.nodes.length) return graph;
  const { nodeWidth, nodeHeight, gap, generationGap } = geometry;
  const branchByPerson = new Map(branches.flatMap((branch) => branch.personIds.map((id) => [id, branch.id] as const)));
  const rows = new Map<number, PositionedPerson[]>();
  for (const node of graph.nodes) rows.set(node.y, [...(rows.get(node.y) ?? []), node]);
  const below = branches.find((branch) => branch.kind === 'descendants');
  const familyBranches = branches.filter((branch) => branch.kind === 'family');
  const centralParents = new Set(edges.filter((edge) => edge.type === 'parent' && below?.personIds.includes(edge.to)).map((edge) => edge.from));
  const spans = below && ![...rows.values()].some((row) => row.some((node) => branchByPerson.get(node.id) === below.id)
    && row.some((node) => branchByPerson.get(node.id) !== below.id));
  const lanes = branches.filter((branch) => !spans || branch.id !== below!.id);
  const capacities = new Map(lanes.map((branch) => [branch.id, Math.max(2, ...[...rows.values()].map((row) => row.filter((node) => branchByPerson.get(node.id) === branch.id).length))]));
  const offsets = new Map<string, number>();
  let totalColumns = 0;
  for (const branch of lanes) { offsets.set(branch.id, totalColumns); totalColumns += capacities.get(branch.id)! + 1; }
  const belowCapacity = Math.max(0, ...[...rows.values()].map((row) => row.filter((node) => branchByPerson.get(node.id) === below?.id).length));
  totalColumns = Math.max(totalColumns - 1, spans ? belowCapacity : 0);
  const left = graph.periods?.length ? nodeWidth + gap * 2 : gap;
  const stride = nodeWidth + gap;
  const top = generationGap;
  const nodes: PositionedPerson[] = [];
  const columns = new Map<string, number>();
  const parents = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) if (edge.type === 'parent') parents.get(edge.to)?.push(edge.from);
  for (const [y, row] of [...rows].sort((a, b) => a[0] - b[0])) {
    for (const branch of branches) {
      const records = row.filter((node) => branchByPerson.get(node.id) === branch.id);
      if (!records.length) continue;
      const representatives = new Map(records.map((node) => [node.id, node.id]));
      const find = (id: string): string => {
        const parent = representatives.get(id)!;
        if (parent === id) return id;
        const root = find(parent); representatives.set(id, root); return root;
      };
      for (const edge of edges) if (edge.type === 'spouse' && representatives.has(edge.from) && representatives.has(edge.to)) representatives.set(find(edge.from), find(edge.to));
      const groups = new Map<string, PositionedPerson[]>();
      for (const node of records) { const id = find(node.id); groups.set(id, [...(groups.get(id) ?? []), node]); }
      const parentColumn = (group: PositionedPerson[]) => {
        const values = group.flatMap((node) => parents.get(node.id)!.flatMap((id) => columns.has(id) ? [columns.get(id)!] : []));
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : (group[0].x - left) / stride;
      };
      const ordered = [...groups.values()].sort((a, b) => parentColumn(a) - parentColumn(b));
      const capacity = spans && branch.id === below!.id ? totalColumns : capacities.get(branch.id)!;
      let column = (offsets.get(branch.id) ?? 0) + Math.floor((capacity - records.length) / 2);
      // Place the focal parents at the facing edges of their two family areas.
      if (familyBranches.length === 2 && branch.kind === 'family' && records.length === 1 && centralParents.has(records[0].id)) {
        column = offsets.get(branch.id)! + (branch.id === familyBranches[0].id ? capacity - 1 : 0);
      }
      if (spans && branch.id === below!.id) {
        column = Math.max(0, Math.min(capacity - records.length, Math.round(parentColumn(records) - (records.length - 1) / 2)));
      }
      for (const group of ordered) for (const node of group) {
        columns.set(node.id, column);
        nodes.push({ ...node, x: left + column++ * stride, y: y + top });
      }
    }
  }
  const laneLabels: TreeLane[] = lanes.map((branch) => {
    const members = nodes.filter((node) => branchByPerson.get(node.id) === branch.id);
    return { id: branch.id, label: branch.label, x: left + offsets.get(branch.id)! * stride, y: gap,
      width: capacities.get(branch.id)! * stride - gap, bottom: Math.max(...members.map((node) => node.y + nodeHeight)) };
  });
  if (spans) laneLabels.push({ id: below!.id, label: below!.label, x: left,
    y: Math.min(...nodes.filter((node) => branchByPerson.get(node.id) === below!.id).map((node) => node.y)) - generationGap / 2,
    width: totalColumns * stride - gap, bottom: graph.height + top - gap });
  return { ...graph, nodes, width: left + totalColumns * stride + gap, height: graph.height + top,
    periods: graph.periods?.map((period) => ({ ...period, y: period.y + top })), lanes: laneLabels };
}
