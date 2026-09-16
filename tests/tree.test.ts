import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutTree } from '../src/components/genealogy/layout';
import { fitView, scaleView, pinchView } from '../src/components/genealogy/viewport';
import type { TreePerson, TreeRelationship } from '../src/domain/relationships';
const geometry = { nodeWidth: 220, nodeHeight: 100, gap: 40, generationGap: 100 };
const people = ['a', 'b', 'c', 'd', 'e', 'f'].map((id): TreePerson => ({ id, name: id, lifespan: '? — ?', href: `/people/${id}/`, uncertain: false }));
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
