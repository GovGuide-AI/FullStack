import { DEFAULT_LOCALE } from '@/lib/locales';

/**
 * Catches paths that match no route at all, such as `/nonsense`.
 *
 * These render outside the `[locale]` segment, so there is no locale to read
 * and no root layout above this file — hence the inline `<html>` and the
 * absence of next-intl. Both languages are shown side by side rather than
 * guessing which one the visitor reads.
 */
export default function NotFound() {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100dvh',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}
      >
        <main style={{ textAlign: 'center', maxWidth: '32rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Page not found</h1>
          <p style={{ marginTop: '0.5rem', color: '#666' }}>
            The page you are looking for does not exist.
          </p>
          <p lang="am" style={{ marginTop: '1rem', color: '#666' }}>
            የሚፈልጉት ገጽ የለም።
          </p>
          <p style={{ marginTop: '1.5rem' }}>
            <a href={`/${DEFAULT_LOCALE}`} style={{ textDecoration: 'underline' }}>
              Go to the start
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
