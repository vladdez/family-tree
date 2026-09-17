import type { Catalog, Person } from './schemas';
import { formatDate, compareDates } from './dates';
export function getPerson(id: string, catalog: Catalog): Person {
  const person = catalog.people.find((p) => p.id === id);
  if (!person) throw new Error(`Человек не найден: ${id}`);
  return person;
}
export function fullName(person: Person) { return person.archivalName ?? [person.firstName, person.patronymic, person.lastName].filter(Boolean).join(' '); }
export function personSearchText(person: Person) {
  const structuredName = [person.firstName, person.patronymic, person.lastName].filter(Boolean).join(' ');
  const maidenName = person.maidenName ? [person.firstName, person.patronymic, person.maidenName].filter(Boolean).join(' ') : '';
  return [...new Set([fullName(person), structuredName, maidenName, ...person.alternateNames])].filter(Boolean).join(' ').toLocaleLowerCase('ru').replaceAll('ё', 'е');
}
export function showBirthOnly(person: Person) {
  const dates = person.birth.date ? [person.birth.date] : person.birth.alternatives;
  return !person.death.date && !person.death.alternatives.length && dates.length > 0
    && dates.every((date) => Number(date.slice(0, 4)) >= 1935);
}
export function lifespan(person: Person) {
  const year = (event: Person['birth']) => event.date?.slice(0, 4) ?? (event.alternatives.length ? event.alternatives.map((d) => d.slice(0, 4)).join(' / ') : '?');
  if (showBirthOnly(person)) return `род. ${year(person.birth)}`;
  return `${year(person.birth)} — ${year(person.death)}`;
}
export function eventDate(event: Person['birth']) { return event.alternatives.length ? `${event.alternatives.map(formatDate).join(' или ')} · дата не подтверждена` : formatDate(event.date); }
export function personDescription(person: Person) { return person.summary || `${fullName(person)}. ${lifespan(person)}. ${person.death.alternatives.length ? 'Год смерти требует уточнения.' : 'Семейная запись и известные даты жизни.'}`; }
export function chronologicalPeople(catalog: Catalog) {
  const key = (p: Person) => p.birth.date ?? [...p.birth.alternatives].sort()[0] ?? null;
  return [...catalog.people].sort((a, b) => compareDates(key(a), key(b)) || fullName(a).localeCompare(fullName(b), 'ru'));
}
