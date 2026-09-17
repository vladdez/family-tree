import { z } from 'zod';
import { PersonSchema, type Catalog } from './schemas';

const redirectsSchema = z.array(z.object({ from: PersonSchema.shape.slug, personId: PersonSchema.shape.id }).strict());

/** Keep published links to merged records pointing to an existing person. */
export function getPersonRedirects(catalog: Catalog, input: unknown) {
  const redirects = redirectsSchema.parse(input), seen = new Set<string>();
  const slugs = new Set(catalog.people.map((person) => person.slug));
  return redirects.map(({ from, personId }) => {
    if (seen.has(from) || slugs.has(from)) throw new Error(`Повтор или конфликт адреса перенаправления: ${from}`);
    seen.add(from);
    const person = catalog.people.find((person) => person.id === personId);
    if (!person) throw new Error(`Неизвестный человек для перенаправления ${from}: ${personId}`);
    return { from, person };
  });
}
