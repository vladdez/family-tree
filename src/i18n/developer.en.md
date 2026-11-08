---
layout: ../components/layout/DeveloperLayout.astro
title: Developer guide — Mikheev Family History
description: Running the site, editing family records, adding documents and photographs, maintaining translations and publishing.
---

This is the technical guide for the static family archive. Keep family facts in the data files and preserve source texts separately. Rebuilding the site applies data changes to the tree and personal pages.

| Location | Purpose |
| --- | --- |
| `src/data/family.json` | Names, principal dates, family relationships and source issues |
| `src/data/people/` | Biographies, portraits, places, events and source references |
| `src/data/documents/` | Document descriptions, transcriptions, archive references and linked people |
| `src/data/places/` | Place names and administrative divisions |
| `public/media/sources/` | Preserved memoirs and extracts from external sources |
| `public/media/documents/` | Scans, PDFs and lighter document previews |
| `public/media/people/` | Portrait photographs |
| `src/i18n/` | English content, interface translations and name spellings |

Source texts preserve what the source says. Record corrections in family data and profiles, with substantive discrepancies in `notes`. Documents do not automatically change names, dates or relationships. `src/data/sources/` contains source metadata; the current loader takes footnote references from profile `sources` arrays.

## 1. Run locally

Use a Node.js version satisfying `package.json`, with npm installed. From the project directory:

```sh
npm install
npm run dev
```

Open the address printed by Astro, normally `http://127.0.0.1:4321/`. Stop the server with Ctrl+C. The development server uses the Russian source templates. For routine Russian edits, use `npm run check:ru`; it validates the data, checks types and runs the tests that do not require synchronised English translations. To generate and inspect both language versions when preparing an authorised site update:

```sh
npm test
npm run build
npm run preview
```

The complete static site is in `dist/`. The English version is under `en/`. Use the base path printed by the preview server when building for a GitHub project site.

## 2. Add or edit a person

Each entry in the `people` array in `src/data/family.json` represents one person:

```json
{
  "id": "new-person",
  "firstName": "First name",
  "lastName": "Surname",
  "patronymic": "Patronymic",
  "maidenName": "",
  "birthYears": [],
  "deathYears": []
}
```

This is a template. Replace it with documented information in the Russian source data. IDs use lowercase Latin letters, numbers and hyphens. Preserve an ID once published because relationships and page addresses depend on it.

The family file uses `schemaVersion: 2`. Unknown name parts are empty strings. `archivalName` preserves an original spelling when the surname and historical patronymic cannot be distinguished. `alternateNames` stores other names without creating another person. A shared name alone is not evidence that two records represent the same person.

Use one representation for each life date: `birth` or `birthYears`, and `death` or `deathYears`. A date accepts `YYYY`, `YYYY-MM`, `YYYY-MM-DD` or `null`; an array can retain several possible years. Do not invent a month or day. Principal dates belong in `family.json`. Profile `birthDate` and `deathDate` fields are only for a more precise refinement of the family record. Omit optional unknown fields instead of adding redundant nulls.

Create an optional profile in `src/data/people/tree/` for a person shown as a separate node in the main tree, or `src/data/people/non-tree/` for other people, including those shown only in expandable relative lists. File names may change; the profile’s `id` must continue to match the family record.

```json
{
  "id": "new-person",
  "summary": "A concise description.",
  "biography": "Known information about this person’s life."
}
```

Profiles can also contain `slug`, `sex`, `birthPlaceId`, `deathPlaceId`, `birthDocumentId`, `deathDocumentId`, `portrait`, `notes`, `marriages`, `events` and `sources`. They supplement the family record; do not duplicate parents, children or spouses in profiles.

A biography can be a string or an array of sections with `title`, `text` and optional `sourceRefs`. Text may be split into an array of short strings, which are joined with spaces. Preserve paragraph breaks as `\n\n` inside a string. Keep biographies factual and readable; put uncertain information and source discrepancies in `notes`.

Places have separate files in `src/data/places/`. Keep the settlement name in `name`, administrative divisions in `district`, `region` and `country`, older names in `previousNames`, and linked people in `born` and `buried`.

## 3. Record relationships

Add each relationship once to `family.json`; the adapter builds reciprocal lists automatically. References must use existing IDs.

```json
{
  "type": "parent",
  "parent": "parent-id",
  "child": "child-id",
  "status": "explicit",
  "role": "father"
}
```

Spouse records use `type: "spouse"` with `person1` and `person2`. Parent roles are `mother`, `father` or `parent`; kinds are `biological`, `adoptive` or `unknown`. Do not infer an additional parent from a marriage.

Relationship statuses are `explicit`, `inferred_context`, `inferred_branch_context` and `unresolved`. Suggested connections retain their annotations and dashed tree lines. Use `sibling` when shared parents are not established, and `half_sibling` when half-sibling status is known. `possible_same_person` preserves a possible match without merging records.

After a confirmed merge, preserve old page addresses in `src/data/person-redirects.json`: `from` is the old slug and `personId` identifies the retained record. Validation rejects missing targets, duplicate redirects and conflicts with active pages.

`unidentifiedRelatives` records unnamed relatives without invented person nodes. `issues` records source corrections and unresolved conflicts. Public profiles show unresolved issues in their notes. Editorial rules are maintained in `AGENTS.md`.

## 4. Add a document and sources

Store scans in `public/media/documents/` and create one JSON record in `src/data/documents/`. Include `id`, `title`, `type`, `date`, `peopleIds`, `files`, archive references, transcription and notes. A shared document has multiple `peopleIds` and remains one record.

Supported types are `metric`, `marriage`, `birth`, `death`, `census`, `military`, `photograph` and `other`. Each file has `path` and `label`; optional `preview` points to a lighter image, while `path` retains the full original. Several images and PDFs can belong to one document. `originalUrl` links to an HTTPS source.

Local media paths start with `/media/`, without `public` or the repository name. File names use Latin letters, numbers, hyphens or underscores. The URL helper adds the hosting base path. Both languages share the original media files.

On personal pages, sources appear as superscript footnotes linked to the numbered list at the bottom. The profile `sources` array stores titles, links and page references. A biography section or event can use `sourceRefs: [1]`, where numbering starts at 1 in that person’s source array. Missing or repeated reference numbers fail validation. Document events and supported inline links receive footnotes automatically, reusing a source rather than repeating it.

## 5. Add photographs

Store a portrait in `public/media/people/` and set the person’s profile `portrait` to `/media/people/filename.jpg`. Adding a file alone does not attach it to a profile. A shared family photograph can be a document of type `photograph` linked to several people.

## 6. Add marriages and life events

Record a marriage in both spouses’ profile `marriages` arrays. Each entry names the other person in `spouseId`; `date` and optional `documentId` must match. Preserve the documented precision, including a year alone; use `null` if unknown. The spouse relationship must already exist in `family.json`. No duplicate `events` entry is needed.

Other events use an `id`, `title`, `date` and optional `notes`, `documentId`, `sourceRefs` or `beforeEventId`. Baptism is a separate event. Explain the original calendar style and any conversion in notes.

The timeline sorts dated life events chronologically, using the earliest alternative where necessary. An entirely undated birth stays first. Undated events normally appear after dated events and before death; death is last. `beforeEventId` anchors an undated event before another event from the same profile. Missing anchors and cycles fail validation.

Named children’s births are included automatically in parents’ timelines, except for explicitly adoptive relationships. Unknown dates remain unknown. Suggested relationships retain an annotation. Timeline markers are circles, without numbering.

Documents with `showInTimeline: false`, and undated or definitely posthumous documents where death is known, remain in the document archive and profile document section. `birthDocumentId` and `deathDocumentId` attach evidence to those life events without creating duplicate timeline entries.

## 7. Design and architecture

Semantic design tokens are in `src/styles/tokens.css`; the active theme is in `src/styles/themes/classic.css`. `global.css` styles ordinary pages, and `components/genealogy/tree.css` styles the interactive tree. Card geometry is read from tokens to keep connections aligned.

Tree branch roots and labels are configured in `src/data/tree-branches.json`, and the focus person in `src/data/tree-view.json`. Tree membership follows relationships, not surnames. The main line shows the focus person, siblings, direct ancestors and confirmed spouses; collateral relatives are available inside cards. Shared and unknown branches retain separate areas. Birth periods determine vertical levels without adding approximate dates to the data.

The tree supports panning, pinch zoom, keyboard controls, full-screen mode and relative dialogs. Spouses have a ring marker, and children sharing parents use a common connection. Suggested and adoptive relationships retain distinct line styles.

The home page features up to three developed biographies of at least 80 words. Selection uses biography text, excluding notes and metadata; sparse profiles never fill unused places.

The project separates JSON data, domain logic, components and themes. Astro renders static pages; React is used for the interactive tree. There is no server database or authentication.

## 8. Languages and publication

Russian pages use the main site paths. English equivalents use `/en/`, with the same person IDs and document IDs. The header switch opens the corresponding page. Canonical and alternate-language URLs identify both versions.

The agent updates English translations automatically only after a separate explicit request to update the live site. Routine edits remain in the Russian sources until then. On a publication request, the agent translates all accumulated changes, checks both languages and publishes them together using `docs/publishing.md`; no separate translation reminder or approval is needed.

`npm run build` prepares English inputs from the shared source templates and translation catalogues, then builds both versions. Generated English sources are in `.tooling/en/` and must not be edited or committed. Missing content translations stop the build. Update `content.en.json` for biographies and documentary text, `ui.en.json` for interface wording, `names.en.json` for name and place spellings, and this Markdown file for the English guide. Source scans and original source text files remain shared archival media.

Publish only after a separate explicit request to update the live site. Follow the established agent procedure in `docs/publishing.md`. GitHub Actions builds and publishes the site when the authorised changes reach `main`; do not upload `dist/` manually.

## Validation

`npm run validate-data` checks schemas, IDs, references, reciprocal relationships, parent cycles, dates, marriages and media. `npm test` checks domain behaviour and tree layout. `npm run verify-build` checks the emitted pages, metadata, internal links, family information, both language versions and language-switch targets. A failed check must be resolved before publication.
