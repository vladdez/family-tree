import type { TreeRelationship } from '../../domain/relationships';
import type { Geometry, PositionedPerson } from './layout';

export interface Point { x: number; y: number }
export interface FamilyLine { id: string; points: Point[]; edges: TreeRelationship[] }
export interface FamilyJunction extends Point { id: string; edges: TreeRelationship[] }
export interface FamilyConnection {
  id: string;
  parentIds: string[];
  childIds: string[];
  lines: FamilyLine[];
  junctions: FamilyJunction[];
}

export function familyPath(points: Point[]): string {
  return points.map((point, index) => index === 0 ? `M ${point.x} ${point.y}`
    : point.x === points[index - 1].x ? `V ${point.y}` : `H ${point.x}`).join(' ');
}

// Only actual parent edges define a family. A spouse link cannot supply a
// missing parent; children from different parent sets have separate connectors.
export function getFamilyConnections(nodes: PositionedPerson[], edges: TreeRelationship[], geometry: Geometry): FamilyConnection[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const byChild = new Map<string, TreeRelationship[]>();
  for (const edge of edges) if (edge.type === 'parent' && byId.has(edge.from) && byId.has(edge.to)) {
    byChild.set(edge.to, [...(byChild.get(edge.to) ?? []), edge]);
  }
  const families = new Map<string, { parentIds: string[]; childIds: string[]; edges: TreeRelationship[] }>();
  for (const [child, links] of byChild) {
    const parentIds = [...new Set(links.map((edge) => edge.from))].sort();
    const id = JSON.stringify(parentIds);
    const family = families.get(id) ?? { parentIds, childIds: [], edges: [] };
    family.childIds.push(child); family.edges.push(...links); families.set(id, family);
  }
  const { nodeWidth, nodeHeight, gap, generationGap } = geometry;
  const center = (node: PositionedPerson) => node.x + nodeWidth / 2;
  const rowGroups = (ids: string[]) => {
    const rows = new Map<number, PositionedPerson[]>();
    for (const id of ids) { const node = byId.get(id)!; rows.set(node.y, [...(rows.get(node.y) ?? []), node]); }
    return [...rows].sort((a, b) => a[0] - b[0]);
  };
  const occupiedSpines: { x: number; top: number; bottom: number }[] = [];
  const occupiedBars: { y: number; left: number; right: number }[] = [];
  const overlaps = (a: number, b: number, c: number, d: number) => a <= d && c <= b;
  function barY(low: number, high: number, ideal: number, left: number, right: number) {
    const nearby = occupiedBars.filter((bar) => overlaps(left, right, bar.left, bar.right) && bar.y >= low && bar.y <= high);
    const candidates = [ideal, low, high, ...Array.from({ length: families.size * 2 + 1 }, (_, index) => low + (high - low) * index / (families.size * 2))];
    const distance = (value: number) => Math.min(...nearby.map((bar) => Math.abs(value - bar.y)), Infinity);
    let y = ideal;
    if (distance(ideal) < gap / 8) y = candidates.sort((a, b) => distance(b) - distance(a) || Math.abs(a - ideal) - Math.abs(b - ideal))[0];
    occupiedBars.push({ y, left, right }); return y;
  }
  const result: FamilyConnection[] = [];
  for (const [id, family] of families) {
    const parentRows = rowGroups(family.parentIds), childRows = rowGroups(family.childIds);
    const bounds = [...parentRows.flatMap(([y]) => [y + nodeHeight + generationGap * 0.1, y + nodeHeight + generationGap * 0.25]),
      ...childRows.flatMap(([y]) => [Math.max(gap / 4, y - generationGap * 0.7), Math.max(gap / 4, y - generationGap * 0.5)])];
    const top = Math.min(...bounds), bottom = Math.max(...bounds);
    const idealX = family.parentIds.reduce((sum, parent) => sum + center(byId.get(parent)!), 0) / family.parentIds.length;
    const members = new Set([...family.parentIds, ...family.childIds]);
    const candidates = [...new Set([idealX, ...nodes.flatMap((node) => [0.25, 0.5, 0.75].flatMap((fraction) => [node.x - gap * fraction, node.x + nodeWidth + gap * fraction]))])];
    const safe = (x: number) => !nodes.some((node) => (x > node.x && x < node.x + nodeWidth && overlaps(top, bottom, node.y, node.y + nodeHeight))
      || (!members.has(node.id) && Math.abs(x - center(node)) < gap / 8
        && overlaps(top, bottom, node.y - generationGap * 0.7, node.y + nodeHeight + generationGap * 0.25)));
    const available = (x: number) => !occupiedSpines.some((spine) => Math.abs(x - spine.x) < gap / 8 && overlaps(top, bottom, spine.top, spine.bottom));
    const ordered = candidates.filter(safe).sort((a, b) => Math.abs(a - idealX) - Math.abs(b - idealX) || a - b);
    // Outside card columns always remains a route, even for uneven unknown-date rows.
    const spineX = ordered.find(available) ?? ordered[0];
    occupiedSpines.push({ x: spineX, top, bottom });
    const lines: FamilyLine[] = [], junctions: FamilyJunction[] = [], spinePoints: Point[] = [];
    const addLine = (name: string, points: Point[], links: TreeRelationship[]) => {
      const unique = points.filter((point, index) => !index || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
      if (unique.length > 1) lines.push({ id: `${id}:${name}`, points: unique, edges: links });
    };
    const addJunction = (name: string, point: Point, links: TreeRelationship[]) => {
      if (!junctions.some((junction) => junction.x === point.x && junction.y === point.y)) junctions.push({ id: `${id}:${name}`, ...point, edges: links });
    };
    for (const [row, parents] of parentRows) {
      const xs = [...new Set([...parents.map(center), spineX])].sort((a, b) => a - b);
      const base = row + nodeHeight;
      const y = barY(base + generationGap * 0.1, base + generationGap * 0.25, base + generationGap * 0.25, xs[0], xs.at(-1)!);
      const links = family.edges.filter((edge) => parents.some((parent) => parent.id === edge.from));
      for (const parent of parents) addLine(`parent:${parent.id}`, [{ x: center(parent), y: base }, { x: center(parent), y }], links.filter((edge) => edge.from === parent.id));
      addLine(`parents:${row}`, xs.map((x) => ({ x, y })), links);
      const point = { x: spineX, y }; spinePoints.push(point);
      if (family.parentIds.length > 1) addJunction(`merge:${row}`, point, links);
    }
    for (const [row, children] of childRows) {
      const xs = [...new Set([...children.map(center), spineX])].sort((a, b) => a - b);
      const high = Math.max(gap / 4, row - generationGap * 0.5);
      const low = Math.max(gap / 4, row - generationGap * 0.7);
      const y = barY(low, high, high, xs[0], xs.at(-1)!);
      const links = family.edges.filter((edge) => children.some((child) => child.id === edge.to));
      addLine(`children:${row}`, xs.map((x) => ({ x, y })), links);
      for (const child of children) {
        const point = { x: center(child), y };
        addLine(`child:${child.id}`, [point, { x: point.x, y: child.y }], links.filter((edge) => edge.to === child.id));
        if (family.childIds.length > 1) addJunction(`split:${child.id}`, point, links.filter((edge) => edge.to === child.id));
      }
      const point = { x: spineX, y }; spinePoints.push(point);
      if (family.childIds.length > 1) addJunction(`fork:${row}`, point, links);
    }
    addLine('spine', spinePoints.sort((a, b) => a.y - b.y), family.edges);
    result.push({ id, parentIds: family.parentIds, childIds: family.childIds, lines, junctions });
  }
  return result;
}
