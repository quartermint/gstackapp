const DEFAULT_API_URL = "http://100.123.8.125:3000";

export async function fetchApi<T>(path: string): Promise<T> {
  const baseUrl = process.env.MC_API_URL ?? DEFAULT_API_URL;
  const url = `${baseUrl}${path}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MC API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}
