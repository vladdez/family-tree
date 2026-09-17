import type { HiddenRelativeGroup } from '../../domain/focused-tree';

export default function HiddenRelatives({ groups }: { groups: HiddenRelativeGroup[] }) {
  return <div className="tree-relative-groups">{groups.map((group) => <section key={group.label}>
    <h3>{group.label}</h3>
    <ul>{group.people.map((person) => <li key={person.id}>
      <a href={person.href}>{person.name}</a><span className="tree-relative-life">{person.lifespan}</span>
      {person.annotation && <small className="tree-relative-annotation">{person.annotation}</small>}
    </li>)}</ul>
  </section>)}</div>;
}
