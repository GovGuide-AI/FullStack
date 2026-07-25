# Knowledge base

Every government fact this application shows a user comes from a file in
`services/`. Nothing is stored in the language model, and nothing authoritative
is stored in PostgreSQL. If you want to change what the app tells someone, you
change a YAML file here.

## Adding a service

1. Copy `services/example-service-template.yaml`.
2. Rename it to `<slug>.yaml`. The filename must match the `slug` field exactly.
3. Replace every field with information from an official source.
4. List those sources under `verification.sourceUrls`.
5. Set `verification.verified: true` and `lastVerified` to today's date **only
   after a human has checked each figure against those sources**.

Run `npm run knowledge:validate` to check your work. The same check runs
automatically before every build, so an invalid file cannot be deployed.

## Rules the schema enforces

- Both `en` and `am` are required for every piece of user-facing text. A
  half-translated record would render blank sections to Amharic readers.
- Unknown keys are rejected, so a typo in a field name fails the build instead
  of silently dropping content.
- `lastVerified` must be a real calendar date. `2026-02-31` is rejected.
- Source URLs must be `https`.
- A record with `verified: true` must cite at least one source.
- Slugs are lowercase kebab-case.

## Fees

`amount.kind` is either `fixed` or `variable`. If the official source does not
publish a single number, use `variable` and describe the situation. Do not
average, estimate, or convert a fee into a figure the source never stated — a
wrong fee sends someone to an office with too little money.

## Verified and unverified records

Unverified records are allowed to exist, and the build warns about them rather
than failing. The UI renders them behind a prominent warning and **suppresses
their fees and offices entirely**, since those are the fields that cause a
wasted trip when wrong.

## Amharic

Amharic strings in the template are placeholder copy written by a non-native
speaker. Government terminology in particular should be reviewed by a native
speaker before any real record is published.
