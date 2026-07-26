<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# GovGuide-AI

A bilingual (English / Amharic) guide to Ethiopian government services. Users ask
a question, the app matches it to a curated service record, and returns a
checklist of documents, fees, offices, and steps.

## Read before writing code

Two libraries in this project changed substantially in their latest major
version, and both ship version-matched documentation inside `node_modules`.
Prefer those files over recollection:

- Next.js 16 → `node_modules/next/dist/docs/`
- AI SDK v7 → `node_modules/ai/docs/`

## Commands

```bash
npm run dev                # start the dev server
npm run build              # validates knowledge YAML first, via prebuild
npm run typecheck          # tsc --noEmit
npm run lint               # eslint (note: `next lint` was removed in Next 16)
npm test                   # vitest
npm run knowledge:validate # validate knowledge/ against the Zod schema
npm run ingest             # fetch + chunk knowledge/sources.json into knowledge/.index/
npm run draft -- "topic"   # BM25 evidence bundles for a human to write a record from
npm run verify:citations   # every cited URL must be registered and official
npm run db:generate        # generate a Drizzle migration from db/schema.ts
npm run db:migrate         # apply migrations
```

## Layout

| Path | Holds |
|---|---|
| `app/[locale]/` | Pages, one segment per locale |
| `app/api/` | Route handlers |
| `actions/` | Server Actions |
| `services/` | Business logic and orchestration |
| `repositories/` | The only place that touches the database |
| `db/` | Drizzle schema and migrations |
| `lib/knowledge/` | YAML schema, loader, catalog index, source registry |
| `lib/retrieval/` | Build-time only: text extraction, chunking, BM25 |
| `lib/ai/` | OpenRouter provider, prompts, output schemas |
| `knowledge/services/` | The YAML knowledge base — source of truth |
| `knowledge/sources.json` | Registry of sources a record is allowed to cite |
| `lib/reviews/` | Validation for citizen-submitted reports |
| `messages/` | next-intl UI strings, `en.json` and `am.json` |

## The rule that matters most

This app tells people which documents to bring to a government office. A wrong
fee or a wrong office costs someone a wasted trip across a city, so accuracy
outranks coverage and fluency.

Government facts live in `knowledge/services/*.yaml` and nowhere else. The
language model routes and explains; it never supplies a fact. Every service
record carries a `verification` block, and anything with `verified: false` is
rendered behind a warning with its fees and offices suppressed.

Never write a government fee, office address, processing time, form name, or
legal requirement into this codebase unless it came from a cited official source
recorded in that YAML file. If you do not have a source, leave the field out.

This applies to you as much as to the model. When authoring a record, do not
write from recollection and do not treat a tax-consultancy blog, a wiki, or a
Telegram post as a source. Register the official document in
`knowledge/sources.json`, run `npm run ingest` and `npm run draft`, and write
only what the retrieved passages actually say. Where the sources are silent,
say so in `verification.note` — an acknowledged gap is a usable answer, an
invented one is not. Where they disagree, record the disagreement rather than
picking a side.

### A suggestion is not a match

The router returns `candidates` alongside its decision: the catalog entries
nearest the question, enum-constrained to real slugs exactly as `serviceSlug`
is. They surface as choices under a clarifying question, or as related links
under "not covered".

They are an offer to go and read a record, never an answer. Do not feed a
candidate to the explainer, do not render a checklist from one, and do not
relax the rule that `serviceSlug` requires plain coverage on the grounds that a
near miss can now be shown. An empty candidate list is a correct answer and
must stay reachable — a far-fetched suggestion wastes a trip just as a wrong
match does.

### Community reports are not facts

The `reviews` table holds what citizens say happened to them. It is useful, and it
is not knowledge this project stands behind.

Never pass a review into a prompt, into `listCitations`, or into anything the
model reads. Nothing under `services/` or `lib/ai/` may import
`repositories/review.repository.ts`, and that import being absent is the only
thing standing between a rumour someone typed and the model stating it as
procedure. Reviews are read by one server component and rendered as clearly
unverified prose, below the whole record, never merged into it.

If a report turns out to be true, the fix is to register the official source and
author a YAML record from it — not to promote the report.

See `.cursor/rules/ai-grounding.mdc` for how this is enforced in code.

## Conventions

- TypeScript strict, plus `noUncheckedIndexedAccess`. No `any`, no unsafe casts.
- Validate every external input with Zod: request bodies, environment variables,
  YAML files, and model output.
- Secrets are server-only. Never import `lib/env.ts` from a Client Component, and
  never prefix a secret with `NEXT_PUBLIC_`.
- Route handlers and actions stay thin; logic goes in `services/`.
- User-facing strings go in `messages/`, never inline in a component.
