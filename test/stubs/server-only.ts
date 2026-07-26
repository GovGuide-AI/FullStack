/**
 * Test stub for the `server-only` package.
 *
 * The real package throws unless it is loaded under a server bundler
 * condition, which Vitest does not set. Aliasing it here keeps the guard in
 * production code — where it does its job of blocking client imports — while
 * letting tests import the same modules directly.
 */
export {};
