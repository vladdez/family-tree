import type { Catalog, Person } from './schemas';
import { formatDate, compareDates } from './dates';
export function getPerson(id: string, catalog: Catalog): Person {
  const person = catalog.people.find((p) => p.id === id);
  if (!person) throw new Error(`Человек не найден: ${id}`);
  return person;
}
export function fullName(person: Person) { return person.name.display ?? [person.name.given, person.name.patronymic, person.name.surname].filter(Boolean).join(' '); }
export function personSearchText(person: Person) { return [fullName(person), ...person.alternateNames].join(' ').toLocaleLowerCase('ru').replaceAll('ё', 'е'); }
export function lifespan(person: Person) {
  const year = (event: Person['birth']) => event.date?.slice(0, 4) ?? (event.alternatives.length ? event.alternatives.map((d) => d.slice(0, 4)).join(' / ') : '?');
  return `${year(person.birth)} — ${year(person.death)}`;
}
export function eventDate(event: Person['birth']) { return event.alternatives.length ? `${event.alternatives.map(formatDate).join(' или ')} · дата не подтверждена` : formatDate(event.date); }
export function personDescription(person: Person) { return person.summary || `${fullName(person)}. ${lifespan(person)}. ${person.death.alternatives.length ? 'Год смерти требует уточнения.' : 'Семейная запись и известные даты жизни.'}`; }
export function chronologicalPeople(catalog: Catalog) {
  const key = (p: Person) => p.birth.date ?? [...p.birth.alternatives].sort()[0] ?? null;
  return [...catalog.people].sort((a, b) => compareDates(key(a), key(b)) || fullName(a).localeCompare(fullName(b), 'ru'));
}
