import { formatFeeAmount } from './format';
import type { Locale, Service, ServiceCategory } from './schema';

export interface DocumentView {
  readonly name: string;
  readonly notes: string | null;
  readonly required: boolean;
  readonly copies: number | null;
}

export interface FeeView {
  readonly label: string;
  readonly amount: string;
  readonly notes: string | null;
}

export interface OfficeView {
  readonly name: string;
  readonly address: string;
  readonly hours: string | null;
  readonly phone: string | null;
  readonly website: string | null;
}

export interface StepView {
  readonly title: string;
  readonly detail: string | null;
}

export interface ServiceView {
  readonly slug: string;
  readonly category: ServiceCategory;
  readonly title: string;
  readonly summary: string;
  readonly eligibility: readonly string[];
  readonly documents: readonly DocumentView[];
  /** `null` when suppressed because the record is unverified. */
  readonly fees: readonly FeeView[] | null;
  /** `null` when suppressed because the record is unverified. */
  readonly offices: readonly OfficeView[] | null;
  readonly steps: readonly StepView[];
  readonly processingTime: string | null;
  readonly commonMistakes: readonly string[];
  readonly followUp: readonly string[];
  readonly verified: boolean;
  readonly lastVerified: string;
  readonly sourceUrls: readonly string[];
}

/**
 * The suppression rule, in one place.
 *
 * A wrong fee or office address sends someone on a wasted trip across a city,
 * so neither is disclosed until a human has checked the record against its
 * cited sources. Both the rendered view and the set of facts the model is
 * allowed to cite are gated on this, so the two can never drift apart.
 */
export function canDiscloseFeesAndOffices(service: Service): boolean {
  return service.verification.verified;
}

/**
 * Flattens a bilingual record down to one locale and applies the suppression
 * rule for unverified records.
 *
 * Suppression happens here, on the server, rather than by hiding elements in a
 * component. An unverified fee or office address is never serialized to the
 * client at all, so there is no way for a UI change to accidentally reveal one.
 */
export function toServiceView(service: Service, locale: Locale): ServiceView {
  const verified = service.verification.verified;
  const disclose = canDiscloseFeesAndOffices(service);

  return {
    slug: service.slug,
    category: service.category,
    title: service.title[locale],
    summary: service.summary[locale],
    eligibility: service.eligibility.map((item) => item[locale]),
    documents: service.documents.map((doc) => ({
      name: doc.name[locale],
      notes: doc.notes?.[locale] ?? null,
      required: doc.required,
      copies: doc.copies ?? null,
    })),
    fees: disclose
      ? service.fees.map((fee) => ({
          label: fee.label[locale],
          amount: formatFeeAmount(fee.amount, locale),
          notes: fee.notes?.[locale] ?? null,
        }))
      : null,
    offices: disclose
      ? service.offices.map((office) => ({
          name: office.name[locale],
          address: office.address[locale],
          hours: office.hours?.[locale] ?? null,
          phone: office.phone ?? null,
          website: office.website ?? null,
        }))
      : null,
    steps: service.steps.map((step) => ({
      title: step.title[locale],
      detail: step.detail?.[locale] ?? null,
    })),
    processingTime: service.processingTime?.[locale] ?? null,
    commonMistakes: service.commonMistakes.map((item) => item[locale]),
    followUp: service.followUp.map((item) => item[locale]),
    verified,
    lastVerified: service.verification.lastVerified,
    sourceUrls: service.verification.sourceUrls,
  };
}
