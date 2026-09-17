import type { TreeRelationship } from '../../domain/relationships';
import { relationStatusLabels } from '../../domain/relationships';
import type { PositionedPerson } from './layout';
import { familyPath, type FamilyConnection } from './families';

interface Props { families: FamilyConnection[]; people: Map<string, PositionedPerson> }
const inferred = (edges: TreeRelationship[]) => edges.some((edge) => edge.status && edge.status !== 'explicit');

export default function FamilyConnections({ families, people }: Props) {
  return <g className="tree-family-connections">
    {families.map((family) => <g key={family.id} className="tree-family">
      {family.lines.map((line) => <path key={line.id} d={familyPath(line.points)}
        className={`tree-edge parent${line.edges.some((edge) => edge.kind === 'adoptive') ? ' adoptive' : ''}${inferred(line.edges) ? ' inferred' : ''}`}>
        <title>{line.edges.map((edge) => `${people.get(edge.from)?.name} → ${people.get(edge.to)?.name}: ${edge.status ? relationStatusLabels[edge.status] : 'Родитель — ребёнок'}${edge.kind === 'adoptive' ? ' · Приёмное родство' : ''}`).join('\n')}</title>
      </path>)}
      {family.junctions.map((junction) => <circle key={junction.id} cx={junction.x} cy={junction.y}
        className={`tree-family-junction${inferred(junction.edges) ? ' inferred' : ''}`} />)}
    </g>)}
  </g>;
}
