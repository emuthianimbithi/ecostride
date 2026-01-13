/**
 * Server-side API client for Next.js App Router server components.
 * Uses snake_case JSON contract. Default cache: "no-store" for dynamic SSR.
 */

// Prefer server-only env, fall back to public env
export const apiBase = process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080/api/v1"

export type ServerFetchOptions = RequestInit & {
  /** Override cache behavior. Default is "no-store" for dynamic SSR. */
  cache?: RequestCache
}

/**
 * Fetch JSON from the API (server-side). Returns parsed JSON with snake_case keys.
 * @throws Error with URL, status, and response body on failure.
 */
export async function serverGet<T>(path: string, init: ServerFetchOptions = {}): Promise<T> {
  const url = `${apiBase}${path}`
  const { cache = "no-store", ...rest } = init

  const res = await fetch(url, {
    method: "GET",
    cache,
    ...rest,
    headers: {
      "Accept": "application/json",
      ...(rest.headers ?? {})
    }
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`GET ${url} failed [${res.status}]: ${text}`)
  }

  return (await res.json()) as T
}

/**
 * POST JSON to the API (server-side). Sends and expects snake_case keys.
 * @throws Error with URL, status, and response body on failure.
 */
export async function serverPost<T>(path: string, body: unknown, init: ServerFetchOptions = {}): Promise<T> {
  const url = `${apiBase}${path}`
  const { cache = "no-store", ...rest } = init

  const res = await fetch(url, {
    method: "POST",
    cache,
    ...rest,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(rest.headers ?? {})
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`POST ${url} failed [${res.status}]: ${text}`)
  }

  if (res.status === 204) {
    return undefined as unknown as T
  }

  return (await res.json()) as T
}
