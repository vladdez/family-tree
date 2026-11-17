import type { Person, Place } from './schemas';
import { dateBounds } from './dates';
import countryHistory from '../data/place-country-history.json';
import administrationHistory from '../data/place-administration-history.json';

type DatedEvent = Pick<Person['birth'], 'date' | 'alternatives'>;
interface NamePeriod { name: string; from: string; to?: string }

function nameForEvent(periods: NamePeriod[], event: DatedEvent): string {
  const dates = event.date ? [event.date] : event.alternatives;
  if (!dates.length) return '';
  // Every possible date must belong to the same period. Do not label an
  // undated event with today's country or guess within a transition year.
  const countries = dates.map((date) => {
    const bounds = dateBounds(date);
    return periods.find((period) => bounds.min >= dateBounds(period.from).min
      && bounds.max <= (period.to ? dateBounds(period.to).max : '99991231'))?.name;
  });
  return countries[0] && countries.every((country) => country === countries[0]) ? countries[0] : '';
}

export function countryForEvent(place: Place, event: DatedEvent): string {
  const history = countryHistory.find((history) => history.placeIds.includes(place.id));
  return history ? nameForEvent(history.periods, event) : place.country;
}

export function settlementNameForEvent(place: Place, event: DatedEvent): string {
  const periods = (place.previousNamePeriods ?? []).map((period) => ({
    name: period.name,
    from: String(period.fromYear ?? 1).padStart(4, '0'),
    ...(period.toYear ? { to: String(period.toYear).padStart(4, '0') } : {}),
  }));
  return nameForEvent(periods, event) || place.name;
}

export function placeNameForEvent(place: Place | undefined, event: DatedEvent): string {
  if (!place) return 'Место пока неизвестно';
  const historical = (field: 'district' | 'region') => nameForEvent(administrationHistory
    .filter((history) => history.field === field && history.placeIds.includes(place.id))
    .flatMap((history) => history.periods), event);
  return [settlementNameForEvent(place, event), historical('district'), historical('region'), countryForEvent(place, event)].filter(Boolean).join(', ');
}

export function previousPlaceNamesForPerson(place: Place | undefined, person: Pick<Person, 'birth' | 'death'>): string[] {
  if (!place) return [];
  const years = (event: Person['birth']) => (event.date ? [event.date] : event.alternatives).map((date) => Number(date.slice(0, 4)));
  const births = years(person.birth), deaths = years(person.death);
  if (!births.length && !deaths.length) return [];
  // Do not assume that an undated death means the person survived into a later
  // period. Alternative dates must all support the overlap, not just one.
  const latestStart = Math.max(...(births.length ? births : deaths));
  const earliestEnd = Math.min(...(deaths.length ? deaths : births));
  return place.previousNames.filter((name) => place.previousNamePeriods?.some((period) => period.name === name
    && latestStart <= (period.toYear ?? Infinity)
    && earliestEnd >= (period.fromYear ?? -Infinity)));
}
