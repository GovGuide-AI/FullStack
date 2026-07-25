'use client';

/**
 * Last-resort boundary for a failure in the root layout itself.
 *
 * It cannot use next-intl, because the failure it catches may be the very thing
 * that stopped translations loading. The English copy here is deliberate, and
 * it is the only user-facing string in the app that is not translated.
 */
export default function GlobalError({ unstable_retry }: { error: Error; unstable_retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100dvh',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <main>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ marginTop: '0.5rem', color: '#666' }}>
            The page could not be loaded. Trying again usually works.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              marginTop: '1.5rem',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid #ccc',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
