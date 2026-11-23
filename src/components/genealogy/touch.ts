import { pinchView, type Point, type View } from './viewport';

interface Contact extends Point { id: number }
interface Callbacks {
  updateView: (update: (view: View) => View) => void;
  start: () => void;
  move: () => void;
  end: () => void;
  minimumScale?: () => number;
}

// Use complete touch snapshots on touchscreens. Unlike pointer capture, touch
// events stay with their original card even when the finger leaves its bounds.
export function attachTreeTouchGestures(element: HTMLElement, callbacks: Callbacks) {
  const active = new Set<number>();
  let previous: Contact[] = [];
  let moved = false;
  const read = (event: TouchEvent): Contact[] => {
    const box = element.getBoundingClientRect();
    return Array.from(event.touches).filter((touch) => active.has(touch.identifier)).map((touch) => ({
      id: touch.identifier,
      x: touch.clientX - box.left - element.clientLeft,
      y: touch.clientY - box.top - element.clientTop,
    })).sort((a, b) => a.id - b.id);
  };
  const prevent = (event: TouchEvent) => { if (event.cancelable) event.preventDefault(); };
  const markMoved = () => { if (!moved) { moved = true; callbacks.move(); } };
  const start = (event: TouchEvent) => {
    if (!active.size) { moved = false; callbacks.start(); }
    for (const touch of Array.from(event.changedTouches)) active.add(touch.identifier);
    previous = read(event);
    // A second finger makes this a gesture even if neither finger moves yet.
    if (previous.length > 1) { prevent(event); markMoved(); }
  };
  const move = (event: TouchEvent) => {
    if (!active.size) return;
    // Native, non-passive listeners let Safari cancel page scrolling/zooming.
    prevent(event);
    const next = read(event);
    if (next.length !== previous.length || next.some((point, index) => point.id !== previous[index].id)) {
      previous = next; return;
    }
    if (next.length === 1) {
      const dx = next[0].x - previous[0].x, dy = next[0].y - previous[0].y;
      // Keep the starting point until the drag threshold is crossed.
      if (!moved && Math.hypot(dx, dy) < 6) return;
      markMoved();
      callbacks.updateView((view) => ({ ...view, x: view.x + dx, y: view.y + dy }));
    } else if (next.length === 2) {
      const distance = (points: Contact[]) => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const center = (points: Contact[]): Point => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
      const before = distance(previous);
      if (before >= 1) {
        const factor = distance(next) / before, from = center(previous), to = center(next);
        markMoved();
        const minimum = callbacks.minimumScale?.();
        callbacks.updateView((view) => pinchView(view, factor, from, to, minimum));
      }
    }
    previous = next;
  };
  const end = (event: TouchEvent) => {
    if (moved) prevent(event);
    for (const touch of Array.from(event.changedTouches)) active.delete(touch.identifier);
    previous = read(event);
    if (!active.size) callbacks.end();
  };
  element.addEventListener('touchstart', start, { passive: false });
  element.addEventListener('touchmove', move, { passive: false });
  element.addEventListener('touchend', end, { passive: false });
  element.addEventListener('touchcancel', end, { passive: false });
  return () => {
    element.removeEventListener('touchstart', start);
    element.removeEventListener('touchmove', move);
    element.removeEventListener('touchend', end);
    element.removeEventListener('touchcancel', end);
  };
}
