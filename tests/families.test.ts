import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TreeRelationship } from '../src/domain/relationships';
import type { PositionedPerson } from '../src/components/genealogy/layout';
import { getFamilyConnections, type FamilyConnection, type Point } from '../src/components/genealogy/families';

const geometry = { nodeWidth: 220, nodeHeight: 140, gap: 40, generationGap: 100 };
const person = (id: string, x: number, y: number): PositionedPerson => ({ id, x, y, name: id, href: `/people/${id}/`, lifespan: '? — ?', birthYears: [], uncertain: false });
const parent = (from: string, to: string): TreeRelationship => ({ id: `${from}:${to}`, from, to, type: 'parent', status: 'explicit' });
const key = (point: Point) => `${point.x}:${point.y}`;

function reachable(family: FamilyConnection, start: Point, end: Point) {
  const neighbours = new Map<string, Set<string>>();
  for (const line of family.lines) for (let index = 1; index < line.points.length; index++) {
    const a = key(line.points[index - 1]), b = key(line.points[index]);
    neighbours.set(a, new Set([...(neighbours.get(a) ?? []), b]));
    neighbours.set(b, new Set([...(neighbours.get(b) ?? []), a]));
  }
  const queue = [key(start)], seen = new Set(queue);
  for (let index = 0; index < queue.length; index++) for (const next of neighbours.get(queue[index]) ?? []) {
    if (!seen.has(next)) { seen.add(next); queue.push(next); }
  }
  return seen.has(key(end));
}

test('both parents merge into one trunk which forks to all three siblings', () => {
  const nodes = [person('a', 40, 40), person('b', 300, 40), person('c', 40, 280), person('d', 300, 280), person('e', 560, 280)];
  const edges = ['c', 'd', 'e'].flatMap((child) => [parent('a', child), parent('b', child)]);
  const families = getFamilyConnections(nodes, edges, geometry);
  assert.equal(families.length, 1);
  const family = families[0];
  assert.deepEqual(family.parentIds, ['a', 'b']); assert.deepEqual(family.childIds, ['c', 'd', 'e']);
  assert.equal(family.lines.filter((line) => line.id.endsWith(':spine')).length, 1);
  assert.equal(family.lines.filter((line) => line.id.includes(':child:')).length, 3);
  for (const motherOrFather of nodes.slice(0, 2)) for (const child of nodes.slice(2)) {
    assert.ok(reachable(family, { x: motherOrFather.x + 110, y: motherOrFather.y + 140 }, { x: child.x + 110, y: child.y }));
  }
  assert.deepEqual([...new Set(family.lines.flatMap((line) => line.edges.map((edge) => edge.id)))].sort(), edges.map((edge) => edge.id).sort());
});

test('different parent sets keep distinct families without a false junction at another parent', () => {
  const nodes = [person('a', 40, 40), person('b', 300, 40), person('c', 560, 40), person('d', 40, 280), person('e', 300, 280)];
  const edges = [parent('a', 'd'), parent('b', 'd'), parent('a', 'e'), parent('c', 'e')];
  const families = getFamilyConnections(nodes, edges, geometry);
  assert.equal(families.length, 2);
  assert.deepEqual(families.map((family) => [family.parentIds, family.childIds]), [[['a', 'b'], ['d']], [['a', 'c'], ['e']]]);
  for (const family of families) for (const junction of family.junctions) for (const other of families.filter((other) => other !== family)) {
    for (const line of other.lines) for (let index = 1; index < line.points.length; index++) {
      const a = line.points[index - 1], b = line.points[index];
      const onLine = a.x === b.x ? junction.x === a.x && junction.y >= Math.min(a.y, b.y) && junction.y <= Math.max(a.y, b.y)
        : junction.y === a.y && junction.x >= Math.min(a.x, b.x) && junction.x <= Math.max(a.x, b.x);
      assert.equal(onLine, false, `${junction.id} touches ${line.id}`);
    }
  }
});

test('marriage alone does not add a second parent and adoptive or uncertain edges retain metadata', () => {
  const nodes = [person('a', 40, 40), person('b', 300, 40), person('c', 560, 40), person('d', 40, 280), person('e', 300, 280)];
  const edges: TreeRelationship[] = [parent('a', 'd'), { id: 'spouse', from: 'a', to: 'b', type: 'spouse' },
    parent('a', 'e'), { ...parent('b', 'e'), status: 'inferred_context' }, { ...parent('c', 'e'), kind: 'adoptive' }];
  const snapshot = JSON.stringify({ nodes, edges });
  const families = getFamilyConnections(nodes, edges, geometry);
  assert.deepEqual(families.find((family) => family.childIds.includes('d'))!.parentIds, ['a']);
  const multiple = families.find((family) => family.childIds.includes('e'))!;
  assert.deepEqual(multiple.parentIds, ['a', 'b', 'c']);
  assert.ok(multiple.lines.some((line) => line.edges.some((edge) => edge.kind === 'adoptive')));
  assert.ok(multiple.lines.some((line) => line.edges.some((edge) => edge.status === 'inferred_context')));
  assert.equal(JSON.stringify({ nodes, edges }), snapshot);
});

test('parents and siblings in different periods connect without lines cutting through cards', () => {
  const nodes = [person('a', 40, 40), person('b', 300, 280), person('c', 40, 520), person('d', 300, 760), person('unrelated', 560, 520)];
  const edges = [parent('a', 'c'), parent('b', 'c'), parent('a', 'd'), parent('b', 'd')];
  const families = getFamilyConnections(nodes, edges, geometry);
  assert.equal(families.length, 1);
  for (const family of families) for (const line of family.lines) for (let index = 1; index < line.points.length; index++) {
    const a = line.points[index - 1], b = line.points[index];
    assert.ok(a.x === b.x || a.y === b.y);
    for (const node of nodes) {
      const crosses = a.x === b.x ? a.x > node.x && a.x < node.x + 220 && Math.max(a.y, b.y) > node.y && Math.min(a.y, b.y) < node.y + 140
        : a.y > node.y && a.y < node.y + 140 && Math.max(a.x, b.x) > node.x && Math.min(a.x, b.x) < node.x + 220;
      assert.equal(crosses, false, `${line.id} crosses ${node.id}`);
    }
  }
  for (const p of nodes.slice(0, 2)) for (const c of nodes.slice(2, 4)) assert.ok(reachable(families[0], { x: p.x + 110, y: p.y + 140 }, { x: c.x + 110, y: c.y }));
});
