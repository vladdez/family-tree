import type { TreePerson, TreeRelationship } from '../../domain/relationships';
import type { Geometry, PositionedPerson, TreeGraph, TreePeriod } from './layout';

const epochSpan = 30;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

// These estimates are display coordinates only. They never become family dates.
function estimateYears(people: TreePerson[], edges: TreeRelationship[]) {
  const years = new Map(people.filter((person) => person.birthYears.length).map((person) => [person.id, mean(person.birthYears)]));
  const neighbours = new Map(people.map((person) => [person.id, { peers: [] as string[], parents: [] as string[], children: [] as string[] }]));
  for (const edge of edges) {
    if (edge.type === 'parent') {
      neighbours.get(edge.from)?.children.push(edge.to);
      neighbours.get(edge.to)?.parents.push(edge.from);
    } else if (edge.type === 'spouse' || edge.type === 'half_sibling') {
      neighbours.get(edge.from)?.peers.push(edge.to);
      neighbours.get(edge.to)?.peers.push(edge.from);
    }
  }
  for (let pass = 0; pass < people.length; pass++) {
    const next = new Map<string, number>();
    for (const person of people) {
      if (years.has(person.id)) continue;
      const links = neighbours.get(person.id)!;
      const available = (ids: string[]) => ids.flatMap((id) => years.has(id) ? [years.get(id)!] : []);
      const peers = available(links.peers), children = available(links.children), parents = available(links.parents);
      if (peers.length) next.set(person.id, mean(peers));
      else if (children.length) next.set(person.id, Math.min(...children) - epochSpan);
      else if (parents.length) next.set(person.id, Math.max(...parents) + epochSpan);
    }
    if (!next.size) break;
    for (const [id, year] of next) years.set(id, year);
  }
  return years;
}

export function layoutByEpoch(people: TreePerson[], edges: TreeRelationship[], geometry: Geometry): TreeGraph {
  const representatives = new Map(people.map((person) => [person.id, person.id]));
  const find = (id: string): string => {
    const parent = representatives.get(id)!;
    if (parent === id) return id;
    const root = find(parent); representatives.set(id, root); return root;
  };
  for (const edge of edges.filter((edge) => edge.type === 'spouse')) {
    const a = find(edge.from), b = find(edge.to);
    const dates = people.filter((person) => find(person.id) === a || find(person.id) === b).flatMap((person) => person.birthYears);
    // Widely separated birth dates stay in their own periods, including spouses.
    if (!dates.length || Math.max(...dates) - Math.min(...dates) <= epochSpan) representatives.set(a, b);
  }
  const groups = new Map<string, TreePerson[]>();
  for (const person of people) { const id = find(person.id); groups.set(id, [...(groups.get(id) ?? []), person]); }
  const parents = new Map([...groups.keys()].map((id) => [id, new Set<string>()]));
  for (const edge of edges.filter((edge) => edge.type === 'parent')) parents.get(find(edge.to))!.add(find(edge.from));

  function orderGraph(assignments: Map<string, string>, calendar: string[] = []) {
    const ids = [...new Set(assignments.values())];
    const children = new Map(ids.map((id) => [id, new Set<string>()]));
    const degree = new Map(ids.map((id) => [id, 0]));
    const connect = (from: string, to: string) => {
      if (!children.get(from)!.has(to)) { children.get(from)!.add(to); degree.set(to, degree.get(to)! + 1); }
    };
    for (const [child, ancestors] of parents) for (const parent of ancestors) connect(assignments.get(parent)!, assignments.get(child)!);
    for (let i = 1; i < calendar.length; i++) connect(calendar[i - 1], calendar[i]);
    const order = ids.filter((id) => !degree.get(id));
    for (let i = 0; i < order.length; i++) for (const child of children.get(order[i])!) {
      degree.set(child, degree.get(child)! - 1);
      if (!degree.get(child)) order.push(child);
    }
    return { order, children, complete: order.length === ids.length };
  }
  const separate = new Map([...groups.keys()].map((id) => [id, id]));
  const ancestry = orderGraph(separate);
  if (!ancestry.complete) {
    // Spouse grouping can introduce cycles in an otherwise valid parent graph.
    return layoutByEpoch(people, edges.filter((edge) => edge.type !== 'spouse'), geometry);
  }
  const ancestors = new Map([...groups.keys()].map((id) => [id, new Set<string>()]));
  for (const id of ancestry.order) for (const child of ancestry.children.get(id)!) {
    ancestors.get(child)!.add(id);
    for (const ancestor of ancestors.get(id)!) ancestors.get(child)!.add(ancestor);
  }
  const groupYears = new Map([...groups].flatMap(([id, records]) => {
    const dates = records.flatMap((person) => person.birthYears);
    return dates.length ? [[id, mean(dates)] as const] : [];
  }));
  const bands: { key: string; year: number; groups: string[] }[] = [];
  for (const [id, year] of [...groupYears].sort((a, b) => a[1] - b[1])) {
    let band = bands.at(-1);
    if (!band || year - band.year > epochSpan || band.groups.some((other) => ancestors.get(id)!.has(other) || ancestors.get(other)!.has(id))) {
      band = { key: `epoch:${bands.length}`, year, groups: [] }; bands.push(band);
    }
    band.groups.push(id);
  }
  const assignments = new Map([...groups.keys()].map((id) => [id, `group:${id}`]));
  for (const band of bands) for (const id of band.groups) assignments.set(id, band.key);
  const calendar = bands.map((band) => band.key);
  // Calendar order takes precedence for unusual or conflicting parent dates.
  // Actual relationship lines are still rendered from the untouched source edges.
  let graph = orderGraph(assignments, calendar);
  if (!graph.complete) return layoutByEpoch(people, edges.filter((edge) => edge.type !== 'parent'), geometry);
  const estimated = estimateYears(people, edges);
  const preferred = new Map<string, number>();
  for (const [id, records] of groups) {
    if (groupYears.has(id)) { preferred.set(id, bands.findIndex((band) => band.groups.includes(id))); continue; }
    const dates = records.flatMap((person) => estimated.has(person.id) ? [estimated.get(person.id)!] : []);
    if (!dates.length) { preferred.set(id, bands.length + 1); continue; }
    const year = mean(dates);
    const centre = (index: number) => mean(bands[index].groups.map((group) => groupYears.get(group)!));
    const nearest = bands.reduce((best, _, index) => Math.abs(year - centre(index)) < Math.abs(year - centre(best)) ? index : best, 0);
    preferred.set(id, nearest);
    const previous = assignments.get(id)!;
    assignments.set(id, bands[nearest].key);
    const candidate = orderGraph(assignments, calendar);
    if (candidate.complete) graph = candidate;
    else assignments.set(id, previous);
  }
  graph = orderGraph(assignments, calendar);
  const ranks = new Map<string, number>();
  for (const [id, assigned] of assignments) ranks.set(assigned, Math.max(ranks.get(assigned) ?? 0, preferred.get(id)!));
  for (const id of graph.order) for (const child of graph.children.get(id)!) ranks.set(child, Math.max(ranks.get(child)!, ranks.get(id)! + 1));
  for (const id of [...graph.order].reverse()) {
    const children = [...graph.children.get(id)!];
    if (!calendar.includes(id) && children.length) ranks.set(id, Math.max(ranks.get(id)!, Math.min(...children.map((child) => ranks.get(child)! - 1))));
  }
  const rows = new Map<number, string[]>();
  for (const id of groups.keys()) { const rank = ranks.get(assignments.get(id)!)!; rows.set(rank, [...(rows.get(rank) ?? []), id]); }
  const { nodeWidth, nodeHeight, gap, generationGap } = geometry;
  const count = (row: string[]) => row.reduce((sum, id) => sum + groups.get(id)!.length, 0);
  const maxColumns = Math.max(...[...rows.values()].map(count));
  const left = nodeWidth + gap * 2;
  const width = left + maxColumns * (nodeWidth + gap) + gap;
  const nodes: PositionedPerson[] = [], periods: TreePeriod[] = [];
  const columns = new Map<string, number>();
  for (const [rank, row] of [...rows].sort((a, b) => a[0] - b[0])) {
    const parentColumn = (id: string) => {
      const values = [...parents.get(id)!].flatMap((parent) => columns.has(parent) ? [columns.get(parent)!] : []);
      return values.length ? mean(values) : [...groups.keys()].indexOf(id);
    };
    row.sort((a, b) => parentColumn(a) - parentColumn(b));
    let column = Math.floor((maxColumns - count(row)) / 2);
    const y = gap + rank * (nodeHeight + generationGap);
    const dates = row.flatMap((id) => groups.get(id)!.flatMap((person) => person.birthYears));
    const minimum = Math.min(...dates), maximum = Math.max(...dates);
    periods.push({ y, dated: !!dates.length, label: dates.length ? (minimum === maximum ? String(minimum) : `${minimum}–${maximum}`) : 'Период не установлен' });
    for (const id of row) {
      const records = groups.get(id)!;
      columns.set(id, column + (records.length - 1) / 2);
      for (const person of records) nodes.push({ ...person, x: left + column++ * (nodeWidth + gap), y, positionFromRelatives: !person.birthYears.length && estimated.has(person.id) });
    }
  }
  return { nodes, periods, width, height: gap * 2 + Math.max(...ranks.values()) * (nodeHeight + generationGap) + nodeHeight };
}
