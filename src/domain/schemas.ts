import { z } from 'zod';

const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ID: латинские строчные буквы, цифры и дефисы');
export function isPartialDate(value: string): boolean {
  if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999) return false;
  if (month === undefined) return true;
  if (month < 1 || month > 12) return false;
  if (day === undefined) return true;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
export const PartialDateSchema = z.string().refine(isPartialDate, 'Дата должна быть реальной: YYYY, YYYY-MM или YYYY-MM-DD');
const lifeEvent = z.object({
  date: PartialDateSchema.nullable(),
  placeId: id.nullable(),
  alternatives: z.array(PartialDateSchema).default([]),
  notes: z.string().default(''),
}).strict().refine((e) => !e.alternatives.length || (e.date === null && e.alternatives.length >= 2 && new Set(e.alternatives).size === e.alternatives.length), 'Противоречивые даты: date = null, alternatives — минимум два разных варианта');
const mediaPath = z.string().regex(/^\/media\/[a-zA-Z0-9_./-]+$/, 'Локальный путь должен начинаться с /media/').refine((p) => !p.includes('..') && !p.includes('//'), 'Недопустимый путь');
const uniqueIds = z.array(id).refine((v) => new Set(v).size === v.length, 'Повторяющиеся ссылки');
const personNameFields = {
  firstName: z.string().trim().min(1),
  lastName: z.string().trim(),
  patronymic: z.string().trim(),
  maidenName: z.string().trim(),
  archivalName: z.string().trim().min(1).optional(),
};

export const PersonSchema = z.object({
  id, slug: id,
  ...personNameFields,
  alternateNames: z.array(z.string().trim().min(1)).default([]).refine((v) => new Set(v).size === v.length, 'Повтор альтернативного имени'),
  sex: z.enum(['male', 'female', 'unknown']),
  birth: lifeEvent, death: lifeEvent,
  parents: uniqueIds, spouses: uniqueIds, children: uniqueIds,
  parentDetails: z.array(z.object({ personId: id, role: z.enum(['father', 'mother', 'parent']), kind: z.enum(['biological', 'adoptive', 'unknown']) }).strict()).default([]),
  marriages: z.array(z.object({ spouseId: id, date: PartialDateSchema.nullable(), documentId: id.optional(), notes: z.string().default('') }).strict()).default([]),
  events: z.array(z.object({ id, title: z.string().min(1), date: PartialDateSchema.nullable(), documentId: id.optional(), notes: z.string().default('') }).strict()).default([]),
  portrait: mediaPath.nullable(),
  summary: z.string(), biography: z.string(), notes: z.string().default(''),
}).strict();

export const documentTypes = {
  metric: 'Метрические записи', marriage: 'Брак', birth: 'Рождение', death: 'Смерть',
  census: 'Переписи / ревизии', military: 'Военные документы', photograph: 'Фотографии', other: 'Прочее',
} as const;
export const DocumentSchema = z.object({
  id, title: z.string().min(1), type: z.enum(['metric', 'marriage', 'birth', 'death', 'census', 'military', 'photograph', 'other']),
  date: PartialDateSchema.nullable(), peopleIds: uniqueIds.min(1),
  files: z.array(z.object({ path: mediaPath, preview: mediaPath.optional(), label: z.string().min(1) }).strict()),
  originalUrl: z.url().refine((v) => v.startsWith('https://'), 'Ссылка на оригинал должна использовать HTTPS').optional(),
  archive: z.object({ name: z.string(), fond: z.string(), opis: z.string(), delo: z.string(), page: z.string() }).strict(),
  transcription: z.string(), notes: z.string(),
}).strict();
export const PlaceSchema = z.object({ id, name: z.string().min(1), notes: z.string().default('') }).strict();
export type Person = z.infer<typeof PersonSchema>;
export type FamilyDocument = z.infer<typeof DocumentSchema>;
export type Place = z.infer<typeof PlaceSchema>;

export const RelationStatusSchema = z.enum(['explicit', 'inferred_context', 'inferred_branch_context', 'unresolved']);
const relationMetadata = { status: RelationStatusSchema.default('explicit'), notes: z.string().optional() };
export const FamilyRelationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('parent'), parent: id, child: id, role: z.enum(['father', 'mother', 'parent']).optional(), kind: z.enum(['biological', 'adoptive', 'unknown']).optional(), ...relationMetadata }).strict(),
  z.object({ type: z.literal('spouse'), person1: id, person2: id, ...relationMetadata }).strict(),
  z.object({ type: z.literal('sibling'), person1: id, person2: id, ...relationMetadata }).strict(),
  z.object({ type: z.literal('half_sibling'), person1: id, person2: id, ...relationMetadata }).strict(),
  z.object({ type: z.literal('possible_same_person'), person1: id, person2: id, ...relationMetadata }).strict(),
]);
export const UnidentifiedRelativeSchema = z.object({
  people: uniqueIds.min(1), relation: z.enum(['child', 'possible_additional_child']),
  sex: z.enum(['male', 'female', 'unknown']), count: z.number().int().positive(),
  status: z.enum(['explicit', 'uncertain', 'conflicting_source']), reason: z.string().optional(),
}).strict();
export const FamilyIssueSchema = z.object({
  person: id.optional(), people: uniqueIds.optional(), relatedPerson: id.optional(),
  type: z.enum(['name_correction', 'date_correction', 'death_year_conflict', 'identity_conflict', 'children_count_conflict']),
  values: z.array(z.union([z.string(), z.number()])).optional(), preferred: z.union([z.string(), z.number()]).optional(),
  reason: z.string().min(1),
}).strict().refine((i) => i.person || i.people?.length, 'У замечания должны быть связанные люди');
const years = z.array(z.number().int().min(1).max(9999)).refine((v) => new Set(v).size === v.length, 'Повтор года');
export const SourcePersonSchema = z.object({
  id, ...personNameFields, alternateNames: PersonSchema.shape.alternateNames,
  birthYears: years.optional(), deathYears: years.optional(),
  birth: PartialDateSchema.nullable().optional(), death: PartialDateSchema.nullable().optional(),
}).strict().refine((p) => (p.birth !== undefined) !== (p.birthYears !== undefined), 'Укажите либо birth, либо birthYears').refine((p) => (p.death !== undefined) !== (p.deathYears !== undefined), 'Укажите либо death, либо deathYears');
export const FamilySourceSchema = z.object({
  schemaVersion: z.literal(2),
  people: z.array(SourcePersonSchema),
  relations: z.array(FamilyRelationSchema),
  unidentifiedRelatives: z.array(UnidentifiedRelativeSchema),
  issues: z.array(FamilyIssueSchema),
}).strict();
// Optional profile files enrich an existing source node without duplicating kinship.
export const PersonProfileSchema = z.object({
  id, slug: id.optional(), sex: PersonSchema.shape.sex.optional(),
  birthDate: PartialDateSchema.nullable().optional(), deathDate: PartialDateSchema.nullable().optional(),
  birthPlaceId: id.nullable().optional(), deathPlaceId: id.nullable().optional(),
  portrait: mediaPath.nullable().optional(), summary: z.string().optional(), biography: z.string().optional(), notes: z.string().optional(),
  marriages: PersonSchema.shape.marriages.optional(), events: PersonSchema.shape.events.optional(),
}).strict();
export type FamilySource = z.infer<typeof FamilySourceSchema>;
export type FamilyRelation = z.infer<typeof FamilyRelationSchema>;
export type RelationStatus = z.infer<typeof RelationStatusSchema>;
export type UnidentifiedRelative = z.infer<typeof UnidentifiedRelativeSchema>;
export type FamilyIssue = z.infer<typeof FamilyIssueSchema>;
export interface Catalog {
  people: Person[]; documents: FamilyDocument[]; places: Place[];
  relations?: FamilyRelation[]; unidentifiedRelatives?: UnidentifiedRelative[]; issues?: FamilyIssue[];
}
