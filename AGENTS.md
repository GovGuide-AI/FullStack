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
| `lib/knowledge/` | YAML schema, loader, catalog index |
| `lib/ai/` | OpenRouter provider, prompts, output schemas |
| `knowledge/services/` | The YAML knowledge base — source of truth |
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

See `.cursor/rules/ai-grounding.mdc` for how this is enforced in code.

## Conventions

- TypeScript strict, plus `noUncheckedIndexedAccess`. No `any`, no unsafe casts.
- Validate every external input with Zod: request bodies, environment variables,
  YAML files, and model output.
- Secrets are server-only. Never import `lib/env.ts` from a Client Component, and
  never prefix a secret with `NEXT_PUBLIC_`.
- Route handlers and actions stay thin; logic goes in `services/`.
- User-facing strings go in `messages/`, never inline in a component.
