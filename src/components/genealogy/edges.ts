import type { TreeRelationship } from '../../domain/relationships';
import type { Geometry, PositionedPerson } from './layout';
export function edgePath(edge: TreeRelationship, from: PositionedPerson, to: PositionedPerson, geometry: Geometry): string {
  const x1 = from.x + geometry.nodeWidth / 2, x2 = to.x + geometry.nodeWidth / 2;
  if (edge.type === 'parent') {
    const y1 = from.y + geometry.nodeHeight, y2 = to.y, middle = (y1 + y2) / 2;
    return `M ${x1} ${y1} V ${middle} H ${x2} V ${y2}`;
  }
  // Lateral links travel through the space above cards, leaving names readable.
  const y1 = from.y, y2 = to.y;
  const channel = Math.min(y1, y2) - geometry.gap * (edge.type === 'possible_same_person' ? 0.75 : edge.type === 'half_sibling' ? 0.5 : 0.25);
  return `M ${x1} ${y1} V ${channel} H ${x2} V ${y2}`;
}
