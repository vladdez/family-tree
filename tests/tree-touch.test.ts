import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachTreeTouchGestures } from '../src/components/genealogy/touch';
import type { View } from '../src/components/genealogy/viewport';

const contact = (identifier: number, clientX: number, clientY: number) => ({ identifier, clientX, clientY });
type Contact = ReturnType<typeof contact>;

function setup(deferred = false) {
  class Surface extends EventTarget {
    clientLeft = 1;
    clientTop = 1;
    getBoundingClientRect() { return { left: 19, top: 29 }; }
  }
  const surface = new Surface();
  let view: View = { x: 10, y: 20, scale: 0.5 }, moved = false, dragging = false;
  const updates: ((view: View) => View)[] = [];
  const cleanup = attachTreeTouchGestures(surface as unknown as HTMLElement, {
    updateView: (update) => { if (deferred) updates.push(update); else view = update(view); },
    start: () => { moved = false; },
    move: () => { moved = true; dragging = true; },
    end: () => { dragging = false; },
  });
  return {
    get view() { return view; }, get moved() { return moved; }, get dragging() { return dragging; },
    cleanup,
    flush() { for (const update of updates.splice(0)) view = update(view); },
    emit(type: string, touches: Contact[], changedTouches = touches) {
      const event = Object.assign(new Event(type, { cancelable: true, bubbles: true }), { touches, changedTouches });
      surface.dispatchEvent(event);
      return event;
    },
  };
}

test('touch drag follows the finger without any pointer capture events', () => {
  const tree = setup();
  tree.emit('touchstart', [contact(1, 120, 230)]);
  const move = tree.emit('touchmove', [contact(1, 140, 260)]);
  assert.deepEqual(tree.view, { x: 30, y: 50, scale: 0.5 });
  assert.equal(move.defaultPrevented, true);
  assert.equal(tree.dragging, true);
  assert.equal(tree.moved, true);
  assert.equal(tree.emit('touchend', [], [contact(1, 140, 260)]).defaultPrevented, true);
  assert.equal(tree.dragging, false);
});

test('small movements accumulate from the starting point; a plain tap stays a click', () => {
  const tree = setup();
  assert.equal(tree.emit('touchstart', [contact(1, 100, 100)]).defaultPrevented, false);
  tree.emit('touchmove', [contact(1, 103, 100)]);
  assert.equal(tree.moved, false);
  tree.emit('touchmove', [contact(1, 107, 100)]);
  assert.equal(tree.view.x, 17);
  tree.emit('touchend', [], [contact(1, 107, 100)]);
  tree.emit('touchstart', [contact(2, 100, 100)]);
  assert.equal(tree.moved, false);
  assert.equal(tree.emit('touchend', [], [contact(2, 100, 100)]).defaultPrevented, false);
});

test('pinch uses both fingers and keeps their graph coordinates under them', () => {
  const tree = setup();
  tree.emit('touchstart', [contact(1, 120, 230)]);
  const start = tree.emit('touchstart', [contact(1, 120, 230), contact(2, 220, 230)], [contact(2, 220, 230)]);
  assert.equal(start.defaultPrevented, true);
  // Both fingers move in one event, with their order reversed in the TouchList.
  tree.emit('touchmove', [contact(2, 290, 220), contact(1, 90, 220)]);
  assert.equal(tree.view.scale, 1);
  assert.equal((100 - 10) / 0.5, (70 - tree.view.x) / tree.view.scale);
  assert.equal((200 - 20) / 0.5, (190 - tree.view.y) / tree.view.scale);
  tree.emit('touchmove', [contact(1, 120, 230), contact(2, 220, 230)]);
  assert.deepEqual(tree.view, { x: 10, y: 20, scale: 0.5 });
});

test('queued React updates retain the coordinates from each touch snapshot', () => {
  const tree = setup(true);
  tree.emit('touchstart', [contact(1, 120, 230), contact(2, 220, 230)]);
  tree.emit('touchmove', [contact(1, 70, 230), contact(2, 270, 230)]);
  tree.emit('touchmove', [contact(1, 20, 230), contact(2, 320, 230)]);
  tree.flush();
  assert.equal(tree.view.scale, 1.5);
  assert.equal((150 - tree.view.x) / tree.view.scale, (150 - 10) / 0.5);
});

test('lifting either finger resumes one-finger dragging without a jump', () => {
  for (const remaining of [1, 2]) {
    const tree = setup();
    tree.emit('touchstart', [contact(1, 120, 230), contact(2, 220, 230)]);
    tree.emit('touchmove', [contact(1, 70, 230), contact(2, 270, 230)]);
    const x = remaining === 1 ? 70 : 270, before = { ...tree.view };
    tree.emit('touchend', [contact(remaining, x, 230)], [contact(3 - remaining, 0, 230)]);
    tree.emit('touchmove', [contact(remaining, x + 15, 240)]);
    assert.deepEqual(tree.view, { ...before, x: before.x + 15, y: before.y + 10 });
  }
});

test('cancellation clears the gesture and the next drag starts cleanly', () => {
  const tree = setup();
  tree.emit('touchstart', [contact(1, 120, 230)]);
  tree.emit('touchmove', [contact(1, 140, 230)]);
  tree.emit('touchcancel', [], [contact(1, 140, 230)]);
  assert.equal(tree.dragging, false);
  tree.emit('touchstart', [contact(2, 300, 300)]);
  tree.emit('touchmove', [contact(2, 310, 300)]);
  assert.deepEqual(tree.view, { x: 40, y: 20, scale: 0.5 });
});

test('touches that began outside the tree do not affect its gesture', () => {
  const tree = setup();
  tree.emit('touchstart', [contact(9, 0, 0), contact(1, 120, 230)], [contact(1, 120, 230)]);
  tree.emit('touchmove', [contact(9, 300, 300), contact(1, 140, 230)]);
  assert.deepEqual(tree.view, { x: 30, y: 20, scale: 0.5 });
});

test('a third finger pauses transformation; removing it rebases the pinch', () => {
  const tree = setup();
  tree.emit('touchstart', [contact(1, 120, 230), contact(2, 220, 230)]);
  tree.emit('touchstart', [contact(1, 120, 230), contact(2, 220, 230), contact(3, 320, 230)], [contact(3, 320, 230)]);
  tree.emit('touchmove', [contact(1, 70, 230), contact(2, 270, 230), contact(3, 320, 230)]);
  assert.equal(tree.view.scale, 0.5);
  tree.emit('touchend', [contact(1, 70, 230), contact(2, 270, 230)], [contact(3, 320, 230)]);
  tree.emit('touchmove', [contact(1, 20, 230), contact(2, 320, 230)]);
  assert.equal(tree.view.scale, 0.75);
});

test('cleanup removes all native touch handlers', () => {
  const tree = setup();
  tree.cleanup();
  tree.emit('touchstart', [contact(1, 120, 230)]);
  assert.equal(tree.emit('touchmove', [contact(1, 200, 230)]).defaultPrevented, false);
  assert.deepEqual(tree.view, { x: 10, y: 20, scale: 0.5 });
});
