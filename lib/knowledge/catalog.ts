import { getKnowledgeBase } from './loader';
import type { Locale, LocalizedText, ServiceCategory } from './schema';

export interface CatalogEntry {
  readonly slug: string;
  readonly category: ServiceCategory;
  readonly title: LocalizedText;
  readonly summary: LocalizedText;
  readonly aliases: readonly string[];
  readonly verified: boolean;
}

export function getCatalog(): CatalogEntry[] {
  return getKnowledgeBase().services.map((service) => ({
    slug: service.slug,
    category: service.category,
    title: service.title,
    summary: service.summary,
    aliases: [...service.aliases.en, ...service.aliases.am],
    verified: service.verification.verified,
  }));
}

/**
 * The exact set of values the router model is allowed to return. Building the
 * enum from this list is what makes it impossible for the model to name a
 * service that does not exist.
 */
export function getCatalogSlugs(): string[] {
  return [...getKnowledgeBase().slugs];
}

/**
 * A compact catalog rendering for the router prompt. Both languages are always
 * included: a user may ask in Amharic about a service whose common name they
 * only know in English, or the reverse.
 */
export function renderCatalogForPrompt(): string {
  return getCatalog()
    .map((entry) => {
      const lines = [
        `- slug: ${entry.slug}`,
        `  title_en: ${entry.title.en}`,
        `  title_am: ${entry.title.am}`,
        `  summary_en: ${entry.summary.en}`,
      ];
      if (entry.aliases.length > 0) {
        lines.push(`  also_known_as: ${entry.aliases.join('; ')}`);
      }
      return lines.join('\n');
    })
    .join('\n');
}

export function getCatalogByCategory(locale: Locale): Map<ServiceCategory, CatalogEntry[]> {
  const grouped = new Map<ServiceCategory, CatalogEntry[]>();

  const sorted = [...getCatalog()].sort((a, b) => a.title[locale].localeCompare(b.title[locale]));
  for (const entry of sorted) {
    const bucket = grouped.get(entry.category);
    if (bucket) {
      bucket.push(entry);
    } else {
      grouped.set(entry.category, [entry]);
    }
  }

  return grouped;
}
