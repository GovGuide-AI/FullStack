/**
 * Audits the citations behind the knowledge base.
 *
 * Two different questions, deliberately weighted differently:
 *
 *   Is every cited URL covered by the source registry? That is a fact about
 *   this repository, so an unregistered citation always fails. It means a
 *   record is resting on a domain nobody vetted.
 *
 *   Does every cited URL still respond? That is a fact about the public
 *   internet. Ethiopian government hosts go down routinely, so an unreachable
 *   citation only warns. `--strict` promotes it to a failure for the times you
 *   genuinely want the network checked, such as a scheduled audit.
 */
import { loadKnowledgeBase } from '../lib/knowledge/loader';
import { findRegisteredSource, loadSourceRegistry } from '../lib/knowledge/sources';

const USER_AGENT = 'GovGuideAI-citation-check/1.0 (+https://github.com/govguide-ai)';
const TIMEOUT_MS = 30_000;

interface Reachability {
  readonly ok: boolean;
  readonly detail: string;
}

async function checkReachable(url: string, relaxedTls: boolean): Promise<Reachability> {
  if (relaxedTls) {
    // The registry already records why this host cannot present a full chain;
    // re-reporting it as a network failure every run would be noise.
    return { ok: true, detail: 'skipped (source declares an incomplete TLS chain)' };
  }
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    });
    return { ok: response.ok, detail: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, detail: (error as Error).message };
  }
}

async function main(): Promise<void> {
  const strict = process.argv.includes('--strict');
  const skipNetwork = process.argv.includes('--offline');

  const registry = loadSourceRegistry();
  const knowledgeBase = loadKnowledgeBase();

  const errors: string[] = [];
  const warnings: string[] = [];

  console.log(
    `Auditing ${knowledgeBase.services.length} record(s) against ${registry.sources.length} registered source(s)…\n`,
  );

  const citations = new Map<string, string[]>();
  for (const service of knowledgeBase.services) {
    if (service.verification.sourceUrls.length === 0) {
      // Permitted only because the schema already blocks `verified: true` with
      // no sources; an unverified placeholder may legitimately cite nothing.
      warnings.push(`${service.slug}: cites no source at all`);
      continue;
    }
    for (const url of service.verification.sourceUrls) {
      const users = citations.get(url) ?? [];
      users.push(service.slug);
      citations.set(url, users);
    }
  }

  for (const [url, users] of citations) {
    const source = findRegisteredSource(registry, url);
    const label = `${url}\n      cited by: ${users.join(', ')}`;

    if (source === undefined) {
      errors.push(`unregistered source — ${label}`);
      console.log(`  ✗ ${url}`);
      console.log(`      not covered by any entry in knowledge/sources.json`);
      continue;
    }

    if (source.lane !== 'official') {
      errors.push(`community-lane source cited as procedure — ${label}`);
      console.log(`  ✗ ${url}`);
      console.log(`      resolves to "${source.id}", which is in the community lane`);
      continue;
    }

    if (skipNetwork) {
      console.log(`  · ${url}  → ${source.id}`);
      continue;
    }

    const reachable = await checkReachable(url, source.incompleteTlsChain);
    if (reachable.ok) {
      console.log(`  ✓ ${url}  → ${source.id} (${reachable.detail})`);
    } else {
      warnings.push(`unreachable — ${url} (${reachable.detail})`);
      console.log(`  ! ${url}  → ${source.id} (${reachable.detail})`);
    }
  }

  const unverified = knowledgeBase.services.filter((service) => !service.verification.verified);
  if (unverified.length > 0) {
    console.log(`\nTODO_VERIFY — ${unverified.length} record(s) awaiting human review:`);
    for (const service of unverified) {
      console.log(`    - ${service.slug}`);
    }
  }

  if (warnings.length > 0) {
    console.warn(`\n  ! ${warnings.length} warning(s):`);
    for (const warning of warnings) {
      console.warn(`    - ${warning}`);
    }
  }

  if (errors.length > 0) {
    console.error(`\n  ✗ ${errors.length} error(s):`);
    for (const error of errors) {
      console.error(`    - ${error}`);
    }
    console.error('');
    process.exit(1);
  }

  if (strict && warnings.length > 0) {
    console.error('\nFailing because --strict was passed and there were warnings.\n');
    process.exit(1);
  }

  console.log('\nCitation audit passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
