import { Clock, ExternalLink, MapPin, Receipt } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { DocumentChecklist } from '@/components/service/document-checklist';
import { VerificationBanner } from '@/components/service/verification-banner';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatVerificationDate } from '@/lib/knowledge/format';
import type { ServiceView } from '@/lib/knowledge/view';
import type { Locale } from '@/lib/locales';

interface ServiceDetailProps {
  readonly service: ServiceView;
  readonly locale: Locale;
  readonly initialCheckedIds: readonly string[];
}

export function ServiceDetail({ service, locale, initialCheckedIds }: ServiceDetailProps) {
  const t = useTranslations('service');
  const tCategories = useTranslations('categories');
  const tVerification = useTranslations('verification');

  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <Badge variant="secondary">{tCategories(service.category)}</Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{service.title}</h1>
        <p className="max-w-prose text-pretty text-muted-foreground">{service.summary}</p>
      </header>

      <VerificationBanner verified={service.verified} />

      {service.eligibility.length > 0 ? (
        <Section title={t('eligibility')}>
          <BulletList items={service.eligibility} />
        </Section>
      ) : null}

      <Separator />

      <DocumentChecklist
        serviceSlug={service.slug}
        documents={service.documents}
        initialCheckedIds={initialCheckedIds}
      />

      <Separator />

      <Section title={t('fees')} icon={<Receipt aria-hidden="true" className="size-4" />}>
        {service.fees === null ? (
          <Suppressed>{tVerification('suppressed')}</Suppressed>
        ) : service.fees.length === 0 ? (
          <Empty>{t('noneRecorded')}</Empty>
        ) : (
          <ul className="space-y-2">
            {service.fees.map((fee) => (
              <li key={fee.label} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>{fee.label}</span>
                <span className="font-medium tabular-nums">{fee.amount}</span>
                {fee.notes ? (
                  <span className="w-full text-sm text-muted-foreground">{fee.notes}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('offices')} icon={<MapPin aria-hidden="true" className="size-4" />}>
        {service.offices === null ? (
          <Suppressed>{tVerification('suppressed')}</Suppressed>
        ) : service.offices.length === 0 ? (
          <Empty>{t('noneRecorded')}</Empty>
        ) : (
          <ul className="space-y-4">
            {service.offices.map((office) => (
              <li key={office.name} className="space-y-1">
                <p className="font-medium">{office.name}</p>
                <p className="text-sm text-muted-foreground">{office.address}</p>
                {office.hours ? (
                  <p className="text-sm text-muted-foreground">{office.hours}</p>
                ) : null}
                {office.phone ? (
                  <a
                    href={`tel:${office.phone}`}
                    className="text-sm underline underline-offset-4"
                  >
                    {office.phone}
                  </a>
                ) : null}
                {office.website ? (
                  <a
                    href={office.website}
                    className="flex w-fit items-center gap-1 text-sm underline underline-offset-4"
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {office.website}
                    <ExternalLink aria-hidden="true" className="size-3" />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {service.steps.length > 0 ? (
        <Section title={t('steps')}>
          <ol className="space-y-4">
            {service.steps.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-sm tabular-nums"
                >
                  {index + 1}
                </span>
                <div className="space-y-1">
                  <p>{step.title}</p>
                  {step.detail ? (
                    <p className="text-sm text-muted-foreground">{step.detail}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {service.processingTime ? (
        <Section title={t('processingTime')} icon={<Clock aria-hidden="true" className="size-4" />}>
          <p>{service.processingTime}</p>
        </Section>
      ) : null}

      {service.commonMistakes.length > 0 ? (
        <Section title={t('commonMistakes')}>
          <BulletList items={service.commonMistakes} />
        </Section>
      ) : null}

      {service.followUp.length > 0 ? (
        <Section title={t('followUp')}>
          <BulletList items={service.followUp} />
        </Section>
      ) : null}

      <Separator />

      <Section title={t('sources')}>
        {service.sourceUrls.length === 0 ? (
          <Empty>{t('noneRecorded')}</Empty>
        ) : (
          <ul className="space-y-1">
            {service.sourceUrls.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  rel="noreferrer noopener"
                  target="_blank"
                  className="flex w-fit items-center gap-1 text-sm underline underline-offset-4 break-all"
                >
                  {url}
                  <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          {t('lastVerified', { date: formatVerificationDate(service.lastVerified, locale) })}
        </p>
      </Section>
    </article>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden="true" className="text-muted-foreground">
            •
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>;
}

function Suppressed({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
      {children}
    </p>
  );
}
