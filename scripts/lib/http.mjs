// Minimal fetch wrapper: browser-like headers, timeout, retry with backoff,
// and a clear error when a Cloudflare challenge page comes back instead of data.

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

export class NoRetryError extends Error {}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isChallenge = (text) => /<title>\s*Just a moment/i.test(text);

export async function getText(url, { retries = 3, timeoutMs = 20_000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      if (isChallenge(text)) throw new NoRetryError(`Cloudflare challenge served for ${url}`);
      if (res.status === 403 || res.status === 404) throw new NoRetryError(`HTTP ${res.status} for ${url}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return text;
    } catch (err) {
      if (err instanceof NoRetryError) throw err;
      lastErr = err;
      if (attempt < retries) await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastErr;
}

export async function getJson(url, opts) {
  const text = await getText(url, opts);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 120)}`);
  }
}
