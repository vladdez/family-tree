import type { Catalog, FamilyIssue } from './schemas';
export const issueLabels: Record<FamilyIssue['type'], string> = {
  name_correction: 'Исправление имени в источнике', date_correction: 'Исправление даты в источнике',
  death_year_conflict: 'Противоречие в годе смерти', identity_conflict: 'Возможное совпадение записей', children_count_conflict: 'Противоречие в количестве детей',
};
export function getSourceIssues(personId: string, catalog: Catalog) {
  return (catalog.issues ?? []).filter((i) => i.person === personId || i.people?.includes(personId) || i.relatedPerson === personId).map((issue) => ({
    ...issue, title: issueLabels[issue.type],
    peopleIds: [...new Set([...(issue.person ? [issue.person] : []), ...(issue.people ?? []), ...(issue.relatedPerson ? [issue.relatedPerson] : [])])].filter((id) => id !== personId),
  }));
}
export function getPublicSourceIssues(personId: string, catalog: Catalog) {
  return getSourceIssues(personId, catalog).filter((issue) => issue.type !== 'name_correction' && issue.type !== 'date_correction');
}
export function getUnidentifiedRelatives(catalog: Catalog, personId?: string) {
  return (catalog.unidentifiedRelatives ?? []).filter((r) => !personId || r.people.includes(personId)).map((relative) => ({
    ...relative,
    title: `${relative.relation === 'possible_additional_child' ? 'Возможные дополнительные дети' : 'Дети с неизвестными именами'}: ${relative.sex === 'male' ? 'сыновья' : relative.sex === 'female' ? 'дочери' : 'пол неизвестен'} — ${relative.count}`,
    statusLabel: relative.status === 'explicit' ? 'Указано в семейных данных' : relative.status === 'conflicting_source' ? 'Противоречие источников' : 'Требует уточнения',
  }));
}
