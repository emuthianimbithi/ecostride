export const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080/api/v1"

export async function serverGet<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  })

  if (!res.ok) {
    throw new Error(await res.text())
  }

  return (await res.json()) as T
}
