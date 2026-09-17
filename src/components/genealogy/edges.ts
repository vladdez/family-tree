import type { TreeRelationship } from '../../domain/relationships';
import type { Geometry, PositionedPerson } from './layout';

export function marriageMarkerPosition(from: PositionedPerson, to: PositionedPerson, geometry: Geometry): { x: number; y: number } {
  if (from.y === to.y) return { x: (from.x + to.x + geometry.nodeWidth) / 2, y: from.y - geometry.gap / 4 };
  // For spouses in different periods, use the vertical segment in a column gap.
  return { x: to.x - geometry.gap / 2, y: (from.y + to.y) / 2 - geometry.gap / 2 };
}

export function edgePath(edge: TreeRelationship, from: PositionedPerson, to: PositionedPerson, geometry: Geometry): string {
  const x1 = from.x + geometry.nodeWidth / 2, x2 = to.x + geometry.nodeWidth / 2;
  if (edge.type === 'parent') {
    const y1 = from.y + geometry.nodeHeight, y2 = to.y, middle = (y1 + y2) / 2;
    if (to.y - from.y <= geometry.nodeHeight + geometry.generationGap && to.y > from.y) return `M ${x1} ${y1} V ${middle} H ${x2} V ${y2}`;
    // Skipped periods use a column gap so the line cannot cut through cards.
    const channel = to.x - geometry.gap / 2;
    if (to.y > from.y) return `M ${x1} ${y1} V ${y1 + geometry.generationGap / 2} H ${channel} V ${y2 - geometry.generationGap / 2} H ${x2} V ${y2}`;
    return `M ${x1} ${from.y} V ${from.y - geometry.gap / 2} H ${channel} V ${y2 - geometry.gap / 2} H ${x2} V ${y2}`;
  }
  // Lateral links travel through the space above cards, leaving names readable.
  const y1 = from.y, y2 = to.y;
  const channel = Math.min(y1, y2) - geometry.gap * (edge.type === 'possible_same_person' ? 0.75 : edge.type === 'half_sibling' || edge.type === 'sibling' ? 0.5 : 0.25);
  if (y1 !== y2) {
    const side = to.x - geometry.gap / 2;
    return `M ${x1} ${y1} V ${y1 - geometry.gap / 2} H ${side} V ${y2 - geometry.gap / 2} H ${x2} V ${y2}`;
  }
  return `M ${x1} ${y1} V ${channel} H ${x2} V ${y2}`;
}
