/**
 * Raised when the routing step cannot complete: the provider is down, the
 * request timed out, or the model produced output the schema rejected twice.
 *
 * This is fatal for a request because without routing there is no verified
 * record to fall back to. A failure in the *explanation* step is different and
 * is handled by degrading, since the checklist is still worth showing.
 */
export class AiUnavailableError extends Error {
  constructor(cause: unknown) {
    super('The guidance model is unavailable');
    this.name = 'AiUnavailableError';
    this.cause = cause;
  }
}
