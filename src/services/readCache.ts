import { getDataVersion } from "@/services/api";
import { getAccessToken } from "@/services/authToken";

type Entry = {
  version: number;
  token: string | null;
  loadedAt: number;
  promise: Promise<unknown>;
};

const reads = new Map<string, Entry>();
const CACHE_MS = 20_000;

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        if (!signal.aborted) resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        if (!signal.aborted) reject(error);
      },
    );
  });
}

/**
 * Coalesce heavy, read-only local API loads across adjacent pages. Writes bump
 * the API data version, so stock/product mutations cannot reuse an old result.
 * Each caller can still abort its own wait without cancelling another page.
 */
export function cachedLocalRead<T>(
  key: string,
  loader: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  const version = getDataVersion();
  const token = getAccessToken();
  const existing = reads.get(key);
  if (
    existing &&
    existing.version === version &&
    existing.token === token &&
    (existing.loadedAt === 0 || Date.now() - existing.loadedAt < CACHE_MS)
  ) {
    return withAbort(existing.promise as Promise<T>, signal);
  }
  const entry: Entry = {
    version,
    token,
    loadedAt: 0,
    promise: Promise.resolve().then(loader),
  };
  reads.set(key, entry);
  if (reads.size > 32) reads.delete(reads.keys().next().value as string);
  entry.promise = entry.promise.then(
    (value) => {
      entry.loadedAt = Date.now();
      return value;
    },
    (error) => {
      if (reads.get(key) === entry) reads.delete(key);
      throw error;
    },
  );
  return withAbort(entry.promise as Promise<T>, signal);
}
