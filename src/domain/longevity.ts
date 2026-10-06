import type { Catalog, Person } from './schemas';
import { getPerson } from './people';

export interface AgeEstimate {
  min: number;
  max: number;
  midpoint: number;
  exact: boolean;
  label: string;
}

export interface LongevityBranchDefinition {
  id: string;
  personId: string;
  label: string;
}

export interface LongevityRecord extends AgeEstimate {
  person: Person;
  branchIds: string[];
}

export interface LongevityGroup {
  id: string;
  label: string;
  records: LongevityRecord[];
  average: number | null;
  median: number | null;
}

export interface LongevityReport {
  ancestors: Person[];
  records: LongevityRecord[];
  incomplete: Person[];
  branches: LongevityGroup[];
  sexes: LongevityGroup[];
  average: number | null;
  median: number | null;
  longest: LongevityRecord | null;
  shortest: LongevityRecord | null;
}

export interface FiveNumberSummary {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

export function fiveNumberSummary(input: number[]): FiveNumberSummary | null {
  if (!input.length) return null;
  const values = [...input].sort((a, b) => a - b);
  const quantile = (position: number) => {
    const index = (values.length - 1) * position;
    const lower = Math.floor(index);
    const fraction = index - lower;
    return values[lower] + ((values[lower + 1] ?? values[lower]) - values[lower]) * fraction;
  };
  return { min: values[0], q1: quantile(0.25), median: quantile(0.5), q3: quantile(0.75), max: values.at(-1) ?? values[0] };
}

function dates(event: Person['birth']): string[] {
  return event.date ? [event.date] : event.alternatives;
}

function completedYears(birth: string, death: string): number {
  const [birthYear, birthMonth, birthDay] = birth.split('-').map(Number);
  const [deathYear, deathMonth, deathDay] = death.split('-').map(Number);
  const birthdayPassed = deathMonth > birthMonth || (deathMonth === birthMonth && deathDay >= birthDay);
  return deathYear - birthYear - (birthdayPassed ? 0 : 1);
}

/**
 * Calculates an age from the documented date variants. When either date has
 * only a year or month, the result follows the conventional genealogical
 * year-to-year estimate and is marked as approximate.
 */
export function estimateAge(birthDates: string[], deathDates: string[]): AgeEstimate | null {
  if (!birthDates.length || !deathDates.length) return null;
  const values: number[] = [];
  let exact = birthDates.length === 1 && deathDates.length === 1;

  for (const birth of birthDates) for (const death of deathDates) {
    const fullDates = /^\d{4}-\d{2}-\d{2}$/.test(birth) && /^\d{4}-\d{2}-\d{2}$/.test(death);
    const age = fullDates ? completedYears(birth, death) : Number(death.slice(0, 4)) - Number(birth.slice(0, 4));
    if (Number.isFinite(age) && age >= 0) values.push(age);
    if (!fullDates) exact = false;
  }

  if (!values.length) return null;
  const unique = [...new Set(values)].sort((a, b) => a - b);
  const min = unique[0];
  const max = unique.at(-1) ?? min;
  return {
    min,
    max,
    midpoint: (min + max) / 2,
    exact: exact && min === max,
    label: min === max ? `${exact ? '' : '≈ '}${min}` : `${min}–${max}`,
  };
}

export function estimatePersonAge(person: Person): AgeEstimate | null {
  return estimateAge(dates(person.birth), dates(person.death));
}

function ancestorIds(rootId: string, catalog: Catalog): Set<string> {
  const result = new Set<string>();
  const pending = [rootId];
  while (pending.length) {
    const id = pending.pop();
    if (!id || result.has(id)) continue;
    const person = getPerson(id, catalog);
    result.add(id);
    pending.push(...person.parents);
  }
  return result;
}

function mean(records: LongevityRecord[]): number | null {
  return records.length ? records.reduce((sum, record) => sum + record.midpoint, 0) / records.length : null;
}

function median(records: LongevityRecord[]): number | null {
  if (!records.length) return null;
  const values = records.map((record) => record.midpoint).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function group(id: string, label: string, records: LongevityRecord[]): LongevityGroup {
  return { id, label, records, average: mean(records), median: median(records) };
}

function resolvedSex(person: Person, catalog: Catalog): Person['sex'] {
  if (person.sex !== 'unknown') return person.sex;
  const roles = new Set((catalog.relations ?? []).flatMap((relation) =>
    relation.type === 'parent' && relation.parent === person.id && relation.role ? [relation.role] : [],
  ));
  if (roles.size !== 1) return 'unknown';
  const role = [...roles][0];
  return role === 'father' ? 'male' : role === 'mother' ? 'female' : 'unknown';
}

export function buildLongevityReport(catalog: Catalog, branches: LongevityBranchDefinition[]): LongevityReport {
  const branchAncestors = new Map(branches.map((branch) => [branch.id, ancestorIds(branch.personId, catalog)]));
  const allIds = new Set([...branchAncestors.values()].flatMap((ids) => [...ids]));
  const ancestors = [...allIds].map((id) => getPerson(id, catalog));
  const records = ancestors.flatMap((person): LongevityRecord[] => {
    const estimate = estimatePersonAge(person);
    return estimate ? [{
      person,
      ...estimate,
      branchIds: branches.filter((branch) => branchAncestors.get(branch.id)?.has(person.id)).map((branch) => branch.id),
    }] : [];
  });
  const knownIds = new Set(records.map((record) => record.person.id));
  const byAge = [...records].sort((a, b) => b.midpoint - a.midpoint || b.max - a.max);
  const sexGroups = [
    group('male', 'Мужчины', records.filter((record) => resolvedSex(record.person, catalog) === 'male')),
    group('female', 'Женщины', records.filter((record) => resolvedSex(record.person, catalog) === 'female')),
  ];
  const unknownSex = group('unknown', 'Пол не указан', records.filter((record) => resolvedSex(record.person, catalog) === 'unknown'));
  if (unknownSex.records.length) sexGroups.push(unknownSex);

  return {
    ancestors,
    records,
    incomplete: ancestors.filter((person) => !knownIds.has(person.id)),
    branches: branches.map((branch) => group(branch.id, branch.label, records.filter((record) => record.branchIds.includes(branch.id)))),
    sexes: sexGroups,
    average: mean(records),
    median: median(records),
    longest: byAge[0] ?? null,
    shortest: byAge.at(-1) ?? null,
  };
}
