import { formatFeeAmount } from './format';
import type { Locale, Service } from './schema';

/**
 * A single quotable fact from a service record.
 *
 * The `id` is derived from the record's shape rather than authored by hand, so
 * writing a YAML file stays cheap. Ids are stable for the lifetime of a request
 * but change if a list is reordered, which is why they are never persisted —
 * the AI cache is keyed by a hash of the record content.
 */
export interface Citation {
  readonly id: string;
  readonly label: string;
}

export function listCitations(service: Service, locale: Locale): Citation[] {
  const citations: Citation[] = [{ id: 'summary', label: service.summary[locale] }];

  service.eligibility.forEach((item, index) => {
    citations.push({ id: `eligibility.${index}`, label: item[locale] });
  });

  service.documents.forEach((doc, index) => {
    citations.push({ id: `documents.${index}`, label: doc.name[locale] });
  });

  service.fees.forEach((fee, index) => {
    citations.push({
      id: `fees.${index}`,
      label: `${fee.label[locale]}: ${formatFeeAmount(fee.amount, locale)}`,
    });
  });

  service.offices.forEach((office, index) => {
    citations.push({
      id: `offices.${index}`,
      label: `${office.name[locale]} — ${office.address[locale]}`,
    });
  });

  service.steps.forEach((step, index) => {
    citations.push({ id: `steps.${index}`, label: step.title[locale] });
  });

  if (service.processingTime) {
    citations.push({ id: 'processingTime', label: service.processingTime[locale] });
  }

  service.commonMistakes.forEach((item, index) => {
    citations.push({ id: `commonMistakes.${index}`, label: item[locale] });
  });

  service.followUp.forEach((item, index) => {
    citations.push({ id: `followUp.${index}`, label: item[locale] });
  });

  return citations;
}

export function listCitationIds(service: Service): string[] {
  return listCitations(service, 'en').map((citation) => citation.id);
}

export function hasCitation(service: Service, id: string): boolean {
  return listCitationIds(service).includes(id);
}

/**
 * Splits model-supplied citation ids into the ones that resolve against this
 * record and the ones that do not. A non-empty `unknown` list means the model
 * cited something that is not in the knowledge base, which is the exact failure
 * this system exists to catch.
 */
export function partitionCitations(
  service: Service,
  ids: readonly string[],
): { known: string[]; unknown: string[] } {
  const valid = new Set(listCitationIds(service));
  const known: string[] = [];
  const unknown: string[] = [];

  for (const id of ids) {
    if (valid.has(id)) {
      if (!known.includes(id)) known.push(id);
    } else {
      unknown.push(id);
    }
  }

  return { known, unknown };
}
