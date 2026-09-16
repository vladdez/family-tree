export interface View { x: number; y: number; scale: number }
export interface Point { x: number; y: number }
export const clampScale = (scale: number) => Math.min(2.5, Math.max(0.15, scale));
export function fitView(viewport: { width: number; height: number }, graph: { width: number; height: number }): View {
  const scale = Math.min(1, viewport.width / graph.width, viewport.height / graph.height);
  return { scale, x: (viewport.width - graph.width * scale) / 2, y: (viewport.height - graph.height * scale) / 2 };
}
export function scaleView(old: View, factor: number, anchor: Point): View {
  const scale = clampScale(old.scale * factor), ratio = scale / old.scale;
  return { scale, x: anchor.x - (anchor.x - old.x) * ratio, y: anchor.y - (anchor.y - old.y) * ratio };
}
export function pinchView(old: View, factor: number, oldCenter: Point, newCenter: Point): View {
  const scaled = scaleView(old, factor, oldCenter);
  return { ...scaled, x: scaled.x + newCenter.x - oldCenter.x, y: scaled.y + newCenter.y - oldCenter.y };
}
