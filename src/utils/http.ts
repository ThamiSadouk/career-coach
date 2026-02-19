import { log } from '../logger.js';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;
const FETCH_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
): Promise<Response | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.ok) return response;
      log.warn(`${url} returned ${response.status} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`Fetch failed ${url} (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${message}`);
    }
    if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
  }
  log.error(`All ${MAX_RETRIES + 1} attempts failed for ${url}`);
  return null;
}
