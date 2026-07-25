/**
 * Build gate for the knowledge base.
 *
 * Wired to `prebuild`, so `npm run build` cannot produce a deployable app from
 * a malformed or unparseable knowledge file. Shipping a broken service record
 * is worse than failing to ship.
 */
import { KnowledgeValidationError, loadKnowledgeBase } from '../lib/knowledge/loader';

function main(): void {
  let knowledgeBase;
  try {
    knowledgeBase = loadKnowledgeBase();
  } catch (error) {
    if (error instanceof KnowledgeValidationError) {
      console.error(`\nKnowledge validation failed with ${error.issues.length} problem(s):\n`);
      for (const issue of error.issues) {
        console.error(`  ✗ ${issue}`);
      }
      console.error('');
      process.exit(1);
    }
    throw error;
  }

  const total = knowledgeBase.services.length;
  const unverified = knowledgeBase.services.filter((s) => !s.verification.verified);

  console.log(`Knowledge base OK — ${total} service${total === 1 ? '' : 's'} validated.`);

  if (unverified.length > 0) {
    // A warning, not a failure. Unverified records are allowed to exist; the UI
    // renders them behind a banner with fees and offices suppressed.
    console.warn(
      `\n  ! ${unverified.length} unverified record(s), shown to users with a warning:`,
    );
    for (const service of unverified) {
      console.warn(`    - ${service.slug}`);
    }
    console.warn('');
  }
}

main();
