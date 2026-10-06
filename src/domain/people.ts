import type { Catalog, Person } from './schemas';
import { formatDate, compareDates } from './dates';
export function getPerson(id: string, catalog: Catalog): Person {
  const person = catalog.people.find((p) => p.id === id);
  if (!person) throw new Error(`Человек не найден: ${id}`);
  return person;
}
export function fullName(person: Person) { return person.archivalName ?? [person.firstName, person.patronymic, person.lastName].filter(Boolean).join(' '); }
type PatronymicSex = 'male' | 'female';
const patronymicForms: Record<string, Record<PatronymicSex | 'shortMale' | 'shortFemale', string>> = {
  'Владимир': { male: 'Владимирович', female: 'Владимировна', shortMale: 'Владимиров', shortFemale: 'Владимирова' },
  'Герасим': { male: 'Герасимович', female: 'Герасимовна', shortMale: 'Герасимов', shortFemale: 'Герасимова' },
  'Григорий': { male: 'Григорьевич', female: 'Григорьевна', shortMale: 'Григорьев', shortFemale: 'Григорьева' },
  'Дмитрий': { male: 'Дмитриевич', female: 'Дмитриевна', shortMale: 'Дмитриев', shortFemale: 'Дмитриева' },
  'Ефим': { male: 'Ефимович', female: 'Ефимовна', shortMale: 'Ефимов', shortFemale: 'Ефимова' },
  'Иван': { male: 'Иванович', female: 'Ивановна', shortMale: 'Иванов', shortFemale: 'Иванова' },
  'Кирилл': { male: 'Кириллович', female: 'Кирилловна', shortMale: 'Кириллов', shortFemale: 'Кириллова' },
  'Константин': { male: 'Константинович', female: 'Константиновна', shortMale: 'Константинов', shortFemale: 'Константинова' },
  'Максим': { male: 'Максимович', female: 'Максимовна', shortMale: 'Максимов', shortFemale: 'Максимова' },
  'Михей': { male: 'Михеевич', female: 'Михеевна', shortMale: 'Михеев', shortFemale: 'Михеева' },
  'Никифор': { male: 'Никифорович', female: 'Никифоровна', shortMale: 'Никифоров', shortFemale: 'Никифорова' },
  'Николай': { male: 'Николаевич', female: 'Николаевна', shortMale: 'Николаев', shortFemale: 'Николаева' },
  'Павел': { male: 'Павлович', female: 'Павловна', shortMale: 'Павлов', shortFemale: 'Павлова' },
  'Пётр': { male: 'Петрович', female: 'Петровна', shortMale: 'Петров', shortFemale: 'Петрова' },
  'Сергей': { male: 'Сергеевич', female: 'Сергеевна', shortMale: 'Сергеев', shortFemale: 'Сергеева' },
  'Степан': { male: 'Степанович', female: 'Степановна', shortMale: 'Степанов', shortFemale: 'Степанова' },
  'Юрий': { male: 'Юрьевич', female: 'Юрьевна', shortMale: 'Юрьев', shortFemale: 'Юрьева' },
  'Яков': { male: 'Яковлевич', female: 'Яковлевна', shortMale: 'Яковлев', shortFemale: 'Яковлева' },
};
const maleFirstNames = new Set(['Алексей', 'Антон', 'Василий', 'Геннадий', 'Георгий', 'Иван', 'Константин', 'Николай', 'Сергей', 'Федот']);
const femaleFirstNames = new Set(['Алевтина', 'Анастасия', 'Ануш', 'Евдокия', 'Елена', 'Катерина', 'Ксения', 'Мария', 'Марфа', 'Матрёна', 'Римма', 'Светлана', 'Тамара']);
function patronymicSex(person: Person): PatronymicSex | null {
  if (person.sex === 'male' || person.sex === 'female') return person.sex;
  if (maleFirstNames.has(person.firstName)) return 'male';
  if (femaleFirstNames.has(person.firstName)) return 'female';
  return null;
}
export function inferredPatronymic(person: Person, catalog: Catalog): string | null {
  if (person.patronymic || person.archivalName) return null;
  const explicitFathers = person.parentDetails.filter((parent) => parent.role === 'father').map((parent) => parent.personId);
  const maleParents = person.parents.filter((id) => catalog.people.find((candidate) => candidate.id === id)?.sex === 'male');
  const fatherIds = [...new Set(explicitFathers.length ? explicitFathers : maleParents)];
  if (fatherIds.length !== 1) return null;
  const father = catalog.people.find((candidate) => candidate.id === fatherIds[0]);
  const sex = patronymicSex(person);
  if (!father || !sex) return null;
  const forms = patronymicForms[father.firstName];
  if (!forms) return null;
  const possibleShortForm = forms[sex === 'male' ? 'shortMale' : 'shortFemale'];
  if (person.lastName && person.lastName.localeCompare(possibleShortForm, 'ru', { sensitivity: 'base' }) === 0) return null;
  return forms[sex];
}
export function displayName(person: Person, catalog: Catalog): string {
  const inferred = inferredPatronymic(person, catalog);
  return inferred ? [person.firstName, inferred, person.lastName].filter(Boolean).join(' ') : fullName(person);
}
export function personSearchText(person: Person, catalog?: Catalog) {
  const structuredName = [person.firstName, person.patronymic, person.lastName].filter(Boolean).join(' ');
  const maidenName = person.maidenName ? [person.firstName, person.patronymic, person.maidenName].filter(Boolean).join(' ') : '';
  return [...new Set([catalog ? displayName(person, catalog) : fullName(person), structuredName, maidenName, ...person.alternateNames])].filter(Boolean).join(' ').toLocaleLowerCase('ru').replaceAll('ё', 'е');
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
export function personDescription(person: Person, catalog?: Catalog) { return person.summary || `${catalog ? displayName(person, catalog) : fullName(person)}. ${lifespan(person)}. ${person.death.alternatives.length ? 'Год смерти требует уточнения.' : 'Семейная запись и известные даты жизни.'}`; }
export function chronologicalPeople(catalog: Catalog) {
  const key = (p: Person) => p.birth.date ?? [...p.birth.alternatives].sort()[0] ?? null;
  return [...catalog.people].sort((a, b) => compareDates(key(a), key(b)) || displayName(a, catalog).localeCompare(displayName(b, catalog), 'ru'));
}
