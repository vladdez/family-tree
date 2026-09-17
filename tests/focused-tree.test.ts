import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { adaptFamilySource } from '../src/domain/family-source';
import { validateCatalog } from '../src/domain/validation';
import { getFocusedTree } from '../src/domain/focused-tree';
import { getTreeBranches } from '../src/domain/tree-branches';
import { layoutTree } from '../src/components/genealogy/layout';
import { getFamilyConnections } from '../src/components/genealogy/families';
import type { Point } from '../src/components/genealogy/families';
import { edgePath, marriageMarkerPosition } from '../src/components/genealogy/edges';
import { fitNodes } from '../src/components/genealogy/viewport';
import branchRoots from '../src/data/tree-branches.json';
import treeSettings from '../src/data/tree-view.json';

const source = JSON.parse(await readFile(new URL('../src/data/family.json', import.meta.url), 'utf8'));
const catalog = validateCatalog({ ...adaptFamilySource(source), documents: [], places: [] });

test('main tree retains Vladimir, both parents, his sisters and both ancestral lines without deleting source records', () => {
  const snapshot = JSON.stringify(catalog), tree = getFocusedTree(catalog, treeSettings);
  const ids = new Set(tree.people.map((person) => person.id));
  assert.equal(tree.people.find((person) => person.id === tree.focusPersonId)!.name, 'Владимир Юрьевич Михеев');
  assert.deepEqual(tree.familyPersonIds.slice().sort(), ['elvira-mikheeva-grigoryeva', 'ksenia-mikheeva-1990', 'maria-mikheeva-2003', 'vladimir-mikheev-1995', 'yuri-vladimirovich-mikheev-1965']);
  for (const id of ['petr-mikheev-1889', 'dmitry-mikheev-1910', 'vladimir-mikheev-1941', 'maria-efimova-1941', 'konstantin-grigoryevich-grigoryev-1935', 'maria-petrovna-grigoryeva-1940']) assert.ok(ids.has(id), id);
  for (const id of ['vladimir-halfbrother-1947', 'efim-father-of-maria']) assert.equal(ids.has(id), false, id);
  const ancestors = tree.people.filter((person) => !tree.familyPersonIds.includes(person.id));
  for (const person of ancestors) {
    assert.ok(tree.relationships.some((edge) => edge.type === 'parent' && edge.from === person.id)
      || tree.relationships.some((edge) => edge.type === 'spouse' && edge.status === 'explicit' && [edge.from, edge.to].includes(person.id)), person.id);
  }
  assert.ok(tree.people.length < catalog.people.length);
  assert.equal(catalog.people.length, 52);
  assert.equal(catalog.relations?.length, 73);
  assert.equal(JSON.stringify(catalog), snapshot);
});

test('siblings stay inside ancestor cards while Maria Efimovna has her own card and confirmed marriage', () => {
  const tree = getFocusedTree(catalog, treeSettings);
  const brother = tree.relatives['konstantin-grigoryevich-grigoryev-1935'].find((group) => group.label === 'Братья и сёстры')!.people.find((person) => person.id === 'vladimir-halfbrother-1947')!;
  assert.equal(brother.annotation, 'Общие родители не уточнены');
  assert.deepEqual(catalog.people.find((person) => person.id === brother.id)!.parents, []);
  const reciprocal = getFocusedTree(catalog, { focusPersonId: brother.id }).relatives;
  assert.equal(Object.values(reciprocal).flatMap((groups) => groups.flatMap((group) => group.people)).some((person) => person.annotation.includes('Неполнородное')), false);
  assert.ok(brother.href.includes('/people/')); assert.ok(brother.lifespan.includes('1947'));
  assert.equal(tree.people.find((person) => person.id === 'maria-efimova-1941')!.name, 'Мария Ефимовна Михеева');
  assert.ok(tree.relationships.some((edge) => edge.type === 'spouse' && edge.status === 'explicit'
    && [edge.from, edge.to].includes('vladimir-mikheev-1941') && [edge.from, edge.to].includes('maria-efimova-1941')));
  assert.deepEqual(tree.relationships.filter((edge) => edge.type === 'parent' && edge.to === 'yuri-vladimirovich-mikheev-1965')
    .map((edge) => edge.from), ['vladimir-mikheev-1941']);
  assert.ok(tree.relatives['maria-efimova-1941'].find((group) => group.label === 'Родители')!.people.some((person) => person.id === 'efim-father-of-maria'));
  assert.deepEqual(tree.relationships.filter((edge) => edge.type === 'parent' && edge.to === 'elvira-mikheeva-grigoryeva')
    .map((edge) => [edge.from, edge.status]).sort(), [
      ['konstantin-grigoryevich-grigoryev-1935', 'explicit'], ['maria-petrovna-grigoryeva-1940', 'explicit'],
    ]);
  for (const groups of Object.values(tree.relatives)) for (const group of groups) for (const person of group.people) assert.equal(tree.people.some((visible) => visible.id === person.id), false);
});

test('confirmed spouses have separate nodes; cousins, siblings of ancestors and unconfirmed spouses stay in cards', () => {
  const people = ['me', 'sister', 'father', 'mother', 'grandfather', 'uncle', 'cousin', 'spouse', 'spouse-parent', 'unconfirmed-spouse', 'half', 'other-parent'].map((id) => ({ id, firstName: id, lastName: '', patronymic: '', maidenName: '', birthYears: [], death: null }));
  const input = { schemaVersion: 2, people, relations: [
    { type: 'parent', parent: 'father', child: 'me' }, { type: 'parent', parent: 'mother', child: 'me', status: 'inferred_context' },
    { type: 'parent', parent: 'father', child: 'sister' }, { type: 'parent', parent: 'mother', child: 'sister' },
    { type: 'parent', parent: 'grandfather', child: 'father' }, { type: 'parent', parent: 'grandfather', child: 'uncle' },
    { type: 'parent', parent: 'uncle', child: 'cousin' }, { type: 'spouse', person1: 'grandfather', person2: 'spouse' },
    { type: 'parent', parent: 'spouse-parent', child: 'spouse' },
    { type: 'spouse', person1: 'grandfather', person2: 'unconfirmed-spouse', status: 'inferred_context' },
    { type: 'half_sibling', person1: 'me', person2: 'half' }, { type: 'parent', parent: 'other-parent', child: 'half' },
  ], issues: [], unidentifiedRelatives: [] };
  const records = validateCatalog({ ...adaptFamilySource(input), documents: [], places: [] });
  const tree = getFocusedTree(records, { focusPersonId: 'me' });
  assert.deepEqual(tree.people.map((person) => person.id).sort(), ['father', 'grandfather', 'half', 'me', 'mother', 'sister', 'spouse']);
  assert.ok(tree.relatives.father.find((group) => group.label === 'Братья и сёстры')!.people.some((person) => person.id === 'uncle'));
  assert.ok(tree.relatives.grandfather.find((group) => group.label === 'Дети')!.people.some((person) => person.id === 'uncle'));
  assert.ok(tree.relationships.some((edge) => edge.type === 'spouse' && [edge.from, edge.to].includes('grandfather') && [edge.from, edge.to].includes('spouse')));
  assert.ok(tree.relatives.spouse.find((group) => group.label === 'Родители')!.people.some((person) => person.id === 'spouse-parent'));
  assert.equal(tree.relatives.grandfather.find((group) => group.label === 'Супруги')!.people.find((person) => person.id === 'unconfirmed-spouse')!.annotation, 'Предположение из контекста');
  assert.ok(tree.relatives.half.find((group) => group.label === 'Родители')!.people.some((person) => person.id === 'other-parent'));
  assert.ok(tree.relationships.some((edge) => edge.from === 'mother' && edge.to === 'me' && edge.status === 'inferred_context'));
  assert.throws(() => getFocusedTree(records, { focusPersonId: 'missing' }), /Неизвестный человек/);
  assert.throws(() => getFocusedTree(records, { focusPersonId: '' }));
});

test('focused real layout preserves era alignment, branch separation and the shared connection to all three children', () => {
  const tree = getFocusedTree(catalog, treeSettings), geometry = { nodeWidth: 220, nodeHeight: 180, gap: 40, generationGap: 100 };
  const branches = getTreeBranches(tree.people, tree.relationships, branchRoots);
  const graph = layoutTree(tree.people, tree.relationships, geometry, branches), nodes = new Map(graph.nodes.map((person) => [person.id, person]));
  assert.equal(new Set(graph.nodes.map((person) => `${person.x}:${person.y}`)).size, tree.people.length);
  for (const edge of tree.relationships) if (edge.type === 'parent') assert.ok(nodes.get(edge.from)!.y < nodes.get(edge.to)!.y);
  assert.equal(new Set(['konstantin-grigoryevich-grigoryev-1935', 'maria-petrovna-grigoryeva-1940', 'vladimir-mikheev-1941', 'maria-efimova-1941'].map((id) => nodes.get(id)!.y)).size, 1);
  const vladimir = nodes.get('vladimir-mikheev-1941')!, maria = nodes.get('maria-efimova-1941')!;
  assert.equal(Math.abs(vladimir.x - maria.x), geometry.nodeWidth + geometry.gap);
  assert.ok(branches.find((branch) => branch.id === 'paternal')!.personIds.includes(maria.id));
  const marriage = marriageMarkerPosition(vladimir, maria, geometry);
  assert.ok(marriage.x > Math.min(vladimir.x, maria.x) + geometry.nodeWidth);
  assert.ok(marriage.x < Math.max(vladimir.x, maria.x));
  assert.equal(marriage.y, maria.y + geometry.nodeHeight / 2);
  assert.equal(new Set(['ksenia-mikheeva-1990', 'vladimir-mikheev-1995', 'maria-mikheeva-2003'].map((id) => nodes.get(id)!.y)).size, 1);
  assert.ok(nodes.get('yuri-vladimirovich-mikheev-1965')!.x < nodes.get('elvira-mikheeva-grigoryeva')!.x);
  assert.ok(nodes.get('elvira-mikheeva-grigoryeva')!.x - nodes.get('yuri-vladimirovich-mikheev-1965')!.x >= geometry.nodeWidth + geometry.gap);
  assert.equal(nodes.get('vladimir-mikheev-1995')!.x, (nodes.get('yuri-vladimirovich-mikheev-1965')!.x + nodes.get('elvira-mikheeva-grigoryeva')!.x) / 2);
  const families = getFamilyConnections(graph.nodes, tree.relationships, geometry);
  const main = families.find((family) => family.parentIds.includes('yuri-vladimirovich-mikheev-1965'))!;
  assert.deepEqual(main.parentIds, ['elvira-mikheeva-grigoryeva', 'yuri-vladimirovich-mikheev-1965']);
  assert.deepEqual(main.childIds.slice().sort(), ['ksenia-mikheeva-1990', 'maria-mikheeva-2003', 'vladimir-mikheev-1995']);
  const mainBars = main.lines.filter((line) => line.points.some((point, index) => index > 0 && point.x !== line.points[index - 1].x));
  assert.equal(mainBars.length, 1);
  const sharedY = mainBars[0].points[0].y;
  for (const id of main.parentIds) {
    const node = nodes.get(id)!, line = main.lines.find((line) => line.id.endsWith(`:parent:${id}`))!;
    assert.deepEqual(line.points, [{ x: node.x + geometry.nodeWidth / 2, y: node.y + geometry.nodeHeight }, { x: node.x + geometry.nodeWidth / 2, y: sharedY }]);
  }
  for (const id of main.childIds) {
    const node = nodes.get(id)!, line = main.lines.find((line) => line.id.endsWith(`:child:${id}`))!;
    assert.deepEqual(line.points, [{ x: node.x + geometry.nodeWidth / 2, y: sharedY }, { x: node.x + geometry.nodeWidth / 2, y: node.y }]);
  }
  assert.equal(main.lines.some((line) => line.id.endsWith(':spine')), false);
  assert.deepEqual([...new Set(families.flatMap((family) => family.lines.flatMap((line) => line.edges.map((edge) => edge.id))))].sort(), tree.relationships.filter((edge) => edge.type === 'parent').map((edge) => edge.id).sort());
  for (const family of families) for (const line of family.lines) for (let index = 1; index < line.points.length; index++) {
    const a = line.points[index - 1], b = line.points[index];
    for (const node of graph.nodes) {
      const crosses = a.x === b.x
        ? a.x > node.x && a.x < node.x + geometry.nodeWidth && Math.max(a.y, b.y) > node.y && Math.min(a.y, b.y) < node.y + geometry.nodeHeight
        : a.y > node.y && a.y < node.y + geometry.nodeHeight && Math.max(a.x, b.x) > node.x && Math.min(a.x, b.x) < node.x + geometry.nodeWidth;
      assert.equal(crosses, false, `${line.id} crosses ${node.id}`);
    }
  }
  for (const viewport of [{ width: 320, height: 500 }, { width: 1200, height: 600 }]) {
    const family = graph.nodes.filter((person) => tree.familyPersonIds.includes(person.id)), view = fitNodes(viewport, family, geometry);
    for (const node of family) {
      assert.ok(view.x + node.x * view.scale >= 0); assert.ok(view.y + node.y * view.scale >= 0);
      assert.ok(view.x + (node.x + geometry.nodeWidth) * view.scale <= viewport.width);
      assert.ok(view.y + (node.y + geometry.nodeHeight) * view.scale <= viewport.height);
    }
  }
});

test('all focused families stay centred with straight descents, symmetric siblings and clear card gaps', () => {
  const tree = getFocusedTree(catalog, treeSettings), geometry = { nodeWidth: 220, nodeHeight: 180, gap: 40, generationGap: 100 };
  const branches = getTreeBranches(tree.people, tree.relationships, branchRoots);
  const graph = layoutTree(tree.people, tree.relationships, geometry, branches);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const families = getFamilyConnections(graph.nodes, tree.relationships, geometry);
  for (const family of families) {
    const axis = family.parentIds.reduce((sum, id) => sum + nodes.get(id)!.x + geometry.nodeWidth / 2, 0) / family.parentIds.length;
    if (family.childIds.length === 1) {
      assert.ok(family.lines.find((line) => line.id.endsWith(':spine'))!.points.every((point) => point.x === axis), family.id);
      assert.equal(nodes.get(family.childIds[0])!.x + geometry.nodeWidth / 2, axis, family.id);
      assert.equal(family.lines.some((line) => line.id.includes(':children:')), false, family.id);
    } else {
      assert.equal(family.lines.some((line) => line.id.endsWith(':spine')), false, family.id);
      const children = family.childIds.map((id) => nodes.get(id)!).sort((a, b) => a.x - b.x);
      assert.equal((children[0].x + children.at(-1)!.x) / 2 + geometry.nodeWidth / 2, axis);
      for (let index = 1; index < children.length; index++) assert.equal(children[index].x - children[index - 1].x, geometry.nodeWidth + geometry.gap);
    }
  }
  for (const y of new Set(graph.nodes.map((node) => node.y))) {
    const row = graph.nodes.filter((node) => node.y === y).sort((a, b) => a.x - b.x);
    for (let index = 1; index < row.length; index++) assert.ok(row[index].x - row[index - 1].x >= geometry.nodeWidth + geometry.gap, `${row[index - 1].id} and ${row[index].id}`);
  }
  const paternal = branches.find((branch) => branch.id === 'paternal')!.personIds.map((id) => nodes.get(id)!);
  const maternal = branches.find((branch) => branch.id === 'maternal')!.personIds.map((id) => nodes.get(id)!);
  assert.ok(Math.max(...paternal.map((node) => node.x + geometry.nodeWidth)) + geometry.gap <= Math.min(...maternal.map((node) => node.x)));
  const connections = families.map((family) => ({ id: family.id, segments: family.lines.flatMap((line) => line.points.slice(1).map((point, index) => [line.points[index], point])) }));
  for (const edge of tree.relationships.filter((edge) => edge.type !== 'parent')) {
    const tokens = edgePath(edge, nodes.get(edge.from)!, nodes.get(edge.to)!, geometry).match(/[MVH]|-?\d+(?:\.\d+)?/g)!;
    let x = 0, y = 0;
    const segments: Point[][] = [];
    while (tokens.length) {
      const command = tokens.shift(), a = { x, y };
      if (command === 'M') { x = Number(tokens.shift()); y = Number(tokens.shift()); continue; }
      if (command === 'V') y = Number(tokens.shift());
      if (command === 'H') x = Number(tokens.shift());
      segments.push([a, { x, y }]);
    }
    connections.push({ id: edge.id, segments });
  }
  for (let index = 0; index < connections.length; index++) for (const other of connections.slice(index + 1)) {
    for (const [a, b] of connections[index].segments) for (const [c, d] of other.segments) {
      const intersects = Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x))
        && Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
      assert.equal(intersects, false, `${connections[index].id} intersects ${other.id}`);
    }
  }
});

test('paternal cards from 1857–1858 to 1889–1906 follow their ancestry without crossed or bent descents', () => {
  const tree = getFocusedTree(catalog, treeSettings), geometry = { nodeWidth: 220, nodeHeight: 180, gap: 40, generationGap: 100 };
  const snapshot = JSON.stringify(tree);
  const graph = layoutTree(tree.people, tree.relationships, geometry, getTreeBranches(tree.people, tree.relationships, branchRoots));
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const families = getFamilyConnections(graph.nodes, tree.relationships, geometry);
  const petr = nodes.get('petr-mikheev-1889')!, paraskeva = nodes.get('paraskeva-pavlova-1889')!;
  const left = families.find((family) => family.childIds.includes(petr.id))!;
  const right = families.find((family) => family.childIds.includes(paraskeva.id))!;
  assert.ok(petr.x < paraskeva.x);
  assert.equal(petr.y, paraskeva.y);
  assert.equal(graph.periods!.find((period) => period.y === petr.y)!.label, '1889–1906');
  for (const id of [...left.parentIds, ...right.parentIds]) {
    const node = nodes.get(id)!;
    assert.equal(graph.periods!.find((period) => period.y === node.y)!.label, '1857–1858');
  }
  const xs = (family: typeof left) => family.lines.flatMap((line) => line.points.map((point) => point.x));
  assert.ok(Math.max(...xs(left)) < Math.min(...xs(right)), 'the two parent families must have disjoint routes');
  for (const [family, child] of [[left, petr], [right, paraskeva]] as const) {
    assert.ok(family.lines.find((line) => line.id.endsWith(':spine'))!.points.every((point) => point.x === child.x + geometry.nodeWidth / 2));
    assert.equal(family.lines.some((line) => line.id.includes(':children:')), false);
  }
  assert.ok(tree.relationships.some((edge) => edge.type === 'spouse'
    && [edge.from, edge.to].includes(petr.id) && [edge.from, edge.to].includes(paraskeva.id)));
  assert.equal(JSON.stringify(tree), snapshot);
});
