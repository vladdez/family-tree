import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutTree } from '../src/components/genealogy/layout';
import { fitView, scaleView, pinchView } from '../src/components/genealogy/viewport';
import type { TreePerson, TreeRelationship } from '../src/domain/relationships';
import { getTreeBranches } from '../src/domain/tree-branches';
const geometry = { nodeWidth: 220, nodeHeight: 100, gap: 40, generationGap: 100 };
const people = ['a', 'b', 'c', 'd', 'e', 'f'].map((id): TreePerson => ({ id, name: id, lifespan: '? — ?', href: `/people/${id}/`, uncertain: false, birthYears: [] }));
const person = (id: string, birthYears: number[] = []): TreePerson => ({ id, name: id, lifespan: '? — ?', href: `/people/${id}/`, uncertain: birthYears.length > 1, birthYears });
const parent = (from: string, to: string): TreeRelationship => ({ id: `${from}:${to}`, from, to, type: 'parent' });

const branchRoots = [{ id: 'father', personId: 'a', label: 'Отцовская ветвь' }, { id: 'mother', personId: 'b', label: 'Материнская ветвь' }];
test('branches include collateral relatives without mixing spouses or guessing from a possible identity', () => {
  const records = [person('a', [1965]), person('b', [1969]), person('c', [1941]), person('d', [1935]), person('uncle', [1945]), person('half', [1947]), person('child', [1995]), person('unknown', [1941])];
  const edges: TreeRelationship[] = [parent('c', 'a'), { ...parent('d', 'b'), status: 'inferred_branch_context', kind: 'adoptive' }, parent('c', 'uncle'), parent('a', 'child'), parent('b', 'child'),
    { id: 'spouses', from: 'a', to: 'b', type: 'spouse' }, { id: 'half', from: 'd', to: 'half', type: 'half_sibling' }, { id: 'possible', from: 'c', to: 'unknown', type: 'possible_same_person' }];
  const snapshot = JSON.stringify({ records, edges });
  const branches = getTreeBranches(records, edges, branchRoots);
  assert.deepEqual(branches.find((branch) => branch.id === 'father')!.personIds, ['a', 'c', 'uncle']);
  assert.deepEqual(branches.find((branch) => branch.id === 'mother')!.personIds, ['b', 'd', 'half']);
  assert.deepEqual(branches.find((branch) => branch.kind === 'descendants')!.personIds, ['child']);
  assert.deepEqual(branches.find((branch) => branch.kind === 'unassigned')!.personIds, ['unknown']);
  assert.equal(JSON.stringify({ records, edges }), snapshot);
  const plain = layoutTree(records, edges, geometry), graph = layoutTree(records, edges, geometry, branches);
  for (const node of graph.nodes) assert.equal(node.y - plain.nodes.find((other) => other.id === node.id)!.y, geometry.generationGap);
  assert.equal(new Set(graph.nodes.map((node) => `${node.x}:${node.y}`)).size, records.length);
});
test('shared ancestry receives its own area without merging people or the two roots', () => {
  const records = [person('a', [1965]), person('b', [1969]), person('ancestor', [1940])];
  const branches = getTreeBranches(records, [parent('ancestor', 'a'), parent('ancestor', 'b')], branchRoots);
  assert.deepEqual(branches.find((branch) => branch.kind === 'shared')!.personIds, ['ancestor']);
  assert.deepEqual(branches.find((branch) => branch.id === 'father')!.personIds, ['a']);
  assert.deepEqual(branches.find((branch) => branch.id === 'mother')!.personIds, ['b']);
});
test('branch settings reject missing roots, repeated roots and repeated labels IDs', () => {
  assert.throws(() => getTreeBranches(people, [], [{ id: 'first', personId: 'missing', label: 'Ветвь' }]), /Неизвестный корень/);
  assert.throws(() => getTreeBranches(people, [], [branchRoots[0], { ...branchRoots[1], personId: 'a' }]), /Повтор/);
  assert.throws(() => getTreeBranches(people, [], [branchRoots[0], { ...branchRoots[1], id: 'father' }]), /Повтор/);
});
test('a descendant sharing an epoch with relatives keeps a separate area and no cards overlap', () => {
  const records = [person('a', [1900]), person('b', [1905]), person('child', [1940]), person('cousin', [1941]), person('grandparent', [1870]), person('uncle', [1910])];
  const edges = [parent('a', 'child'), parent('b', 'child'), parent('grandparent', 'a'), parent('grandparent', 'uncle'), parent('uncle', 'cousin')];
  const branches = getTreeBranches(records, edges, branchRoots);
  const graph = layoutTree(records, edges, geometry, branches);
  assert.equal(graph.nodes.find((node) => node.id === 'child')!.y, graph.nodes.find((node) => node.id === 'cousin')!.y);
  const descendantLane = graph.lanes!.find((lane) => lane.id === 'tree-descendants')!;
  const familyLane = graph.lanes!.find((lane) => lane.id === 'father')!;
  assert.ok(descendantLane.x > familyLane.x + familyLane.width);
  assert.equal(new Set(graph.nodes.map((node) => `${node.x}:${node.y}`)).size, records.length);
  for (const node of graph.nodes) { assert.ok(node.x + geometry.nodeWidth <= graph.width); assert.ok(node.y + geometry.nodeHeight <= graph.height); }
});

test('contemporaries in branches with different ancestry depths share an epoch row', () => {
  const records = [person('a', [1900]), person('b', [1910]), person('c', [1935]), person('d', [1941]), person('e', [1969]), person('f', [1990]), person('root')];
  const edges = [parent('a', 'c'), parent('b', 'd'), parent('c', 'e'), parent('e', 'f'), parent('root', 'b')];
  const graph = layoutTree(records, edges, geometry), nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  assert.equal(nodes.get('c')!.y, nodes.get('d')!.y);
  assert.equal(nodes.get('a')!.y, nodes.get('b')!.y);
  for (const edge of edges) assert.ok(nodes.get(edge.from)!.y < nodes.get(edge.to)!.y);
});
test('birth dates align disconnected people and preserve all uncertain alternatives', () => {
  const records = [person('a', [1800, 1801]), person('b', [1935]), person('c', [1941]), person('d', [1990]), person('unknown')];
  const snapshot = JSON.stringify(records);
  const graph = layoutTree(records, [], geometry), nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  assert.ok(nodes.get('a')!.y < nodes.get('b')!.y);
  assert.equal(nodes.get('b')!.y, nodes.get('c')!.y);
  assert.ok(nodes.get('d')!.y < nodes.get('unknown')!.y);
  assert.deepEqual(nodes.get('a')!.birthYears, [1800, 1801]);
  assert.equal(nodes.get('unknown')!.positionFromRelatives, false);
  assert.equal(JSON.stringify(records), snapshot);
});
test('unknown ancestral chains move whole epoch rows without separating contemporaries', () => {
  const records = [person('oldest'), person('middle'), person('a', [1900]), person('b', [1900])];
  const graph = layoutTree(records, [parent('oldest', 'middle'), parent('middle', 'a')], geometry);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  assert.ok(nodes.get('oldest')!.y < nodes.get('middle')!.y);
  assert.ok(nodes.get('middle')!.y < nodes.get('a')!.y);
  assert.equal(nodes.get('a')!.y, nodes.get('b')!.y);
  assert.equal(nodes.get('oldest')!.positionFromRelatives, true);
  assert.deepEqual(nodes.get('oldest')!.birthYears, []);
});
test('spouses born in distant eras keep separate rows and their source relationship', () => {
  const records = [person('a', [1850]), person('b', [1915])];
  const edges: TreeRelationship[] = [{ id: 'spouse', from: 'a', to: 'b', type: 'spouse' }];
  const snapshot = JSON.stringify(edges);
  const graph = layoutTree(records, edges, geometry);
  assert.ok(graph.nodes.find((node) => node.id === 'a')!.y < graph.nodes.find((node) => node.id === 'b')!.y);
  assert.equal(JSON.stringify(edges), snapshot);
});
test('chronological layout handles ancestry cycles caused only by spouse display groups', () => {
  const records = [person('a', [1900]), person('b', [1880]), person('c', [1908])];
  const edges: TreeRelationship[] = [parent('b', 'a'), parent('a', 'c'), { id: 'spouse', from: 'b', to: 'c', type: 'spouse' }];
  const graph = layoutTree(records, edges, geometry), nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  assert.equal(nodes.size, 3);
  assert.ok(nodes.get('b')!.y < nodes.get('a')!.y);
  assert.ok(nodes.get('a')!.y < nodes.get('c')!.y);
});
test('unconnected people are a bounded register with no overlap or invented edges', () => {
  const graph = layoutTree(people, [], geometry);
  assert.equal(new Set(graph.nodes.map((n) => `${n.x}:${n.y}`)).size, people.length);
  for (const n of graph.nodes) { assert.ok(n.x + geometry.nodeWidth <= graph.width); assert.ok(n.y + geometry.nodeHeight <= graph.height); }
  assert.equal(new Set(graph.nodes.map((n) => n.y)).size, 2);
});
test('graph layout supports several parents, spouses and ancestry depth', () => {
  const edges: TreeRelationship[] = [
    { id: 'ab', from: 'a', to: 'b', type: 'spouse' },
    { id: 'ac', from: 'a', to: 'c', type: 'spouse' },
    { id: 'ad', from: 'a', to: 'd', type: 'parent' },
    { id: 'bd', from: 'b', to: 'd', type: 'parent' },
    { id: 'cd', from: 'c', to: 'd', type: 'parent', kind: 'adoptive' },
    { id: 'de', from: 'd', to: 'e', type: 'parent' },
  ];
  const graph = layoutTree(people, edges, geometry), nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const edge of edges.filter((e) => e.type === 'parent')) assert.ok(nodes.get(edge.to)!.y > nodes.get(edge.from)!.y);
  assert.equal(nodes.get('a')!.y, nodes.get('b')!.y);
  assert.equal(new Set(graph.nodes.map((n) => `${n.x}:${n.y}`)).size, people.length);
});
test('zoom keeps the pointed graph coordinate fixed and enforces bounds', () => {
  const old = { x: 20, y: -10, scale: 0.5 }, anchor = { x: 140, y: 60 };
  const view = scaleView(old, 2, anchor);
  assert.equal((anchor.x - old.x) / old.scale, (anchor.x - view.x) / view.scale);
  assert.equal((anchor.y - old.y) / old.scale, (anchor.y - view.y) / view.scale);
  assert.equal(scaleView(old, 100, anchor).scale, 2.5);
  assert.equal(scaleView(old, 0.001, anchor).scale, 0.15);
});
test('two-finger pinch combines anchored zoom with movement', () => {
  const old = { x: 0, y: 0, scale: 1 }, prior = { x: 100, y: 100 }, next = { x: 130, y: 80 };
  const view = pinchView(old, 2, prior, next);
  assert.equal((prior.x - old.x) / old.scale, (next.x - view.x) / view.scale);
  assert.equal((prior.y - old.y) / old.scale, (next.y - view.y) / view.scale);
});
test('show-all fits both a mobile viewport and a large graph without cropping', () => {
  for (const graph of [{ width: 820, height: 320 }, { width: 26000, height: 4000 }]) {
    const viewport = { width: 320, height: 500 }, view = fitView(viewport, graph);
    assert.ok(view.x >= 0); assert.ok(view.y >= 0);
    assert.ok(view.x + graph.width * view.scale <= viewport.width);
    assert.ok(view.y + graph.height * view.scale <= viewport.height);
  }
});
