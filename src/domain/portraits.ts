import type { Person } from './schemas';

// The gallery order and captions are supplied by the archive editor.
// Legacy profiles keep their single portrait until a gallery is added.
export function personPortraits(person: Pick<Person, 'portrait' | 'portraits'>) {
  if (person.portraits?.length) return person.portraits;
  return person.portrait ? [{ path: person.portrait, label: '' }] : [];
}
