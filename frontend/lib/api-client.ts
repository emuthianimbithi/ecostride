// lib/api-client.ts (or wherever this file lives)

export type ApiErrorDetail = { field?: string; issue?: string }

export type ApiErrorPayload = {
    error: {
        code: string
        message: string
        details?: ApiErrorDetail[]
    }
}

export class ApiError extends Error {
    status: number
    code: string
    details?: ApiErrorDetail[]

    constructor(opts: { status: number; code: string; message: string; details?: ApiErrorDetail[] }) {
        super(opts.message)
        this.name = "ApiError"
        this.status = opts.status
        this.code = opts.code
        this.details = opts.details
    }
}

export function isApiError(err: unknown): err is ApiError {
    return err instanceof ApiError
}

async function safeReadText(res: Response): Promise<string> {
    try {
        return await res.text()
    } catch {
        return ""
    }
}

function tryParseJson(text: string): unknown {
    if (!text) return null
    try {
        return JSON.parse(text)
    } catch {
        return null
    }
}

function toApiErrorFromResponse(res: Response, bodyText: string): ApiError {
    const parsed = tryParseJson(bodyText) as any
    const status = res.status

    const code = parsed?.error?.code ?? `HTTP_${status}`
    const message = parsed?.error?.message ?? parsed?.message ?? parsed?.error ?? bodyText ?? `Request failed (${status})`
    const details = Array.isArray(parsed?.error?.details) ? (parsed.error.details as ApiErrorDetail[]) : undefined

    return new ApiError({ status, code: String(code), message: String(message), details })
}

function clearAuthTokens() {
    try {
        localStorage.removeItem("access_token")
        localStorage.removeItem("refresh_token")
    } catch {
        // ignore
    }
}

function redirectToPublicEvents() {
    if (typeof window === "undefined") return
    window.location.href = "/events"
}

function getStoredTokens(): { accessToken?: string; refreshToken?: string } {
    if (typeof window === "undefined") return {}
    try {
        return {
            accessToken: localStorage.getItem("access_token") ?? undefined,
            refreshToken: localStorage.getItem("refresh_token") ?? undefined
        }
    } catch {
        return {}
    }
}

function setStoredTokens(tokens: { access_token: string; refresh_token: string }) {
    try {
        localStorage.setItem("access_token", tokens.access_token)
        localStorage.setItem("refresh_token", tokens.refresh_token)
    } catch {
        // ignore
    }
}

// Avoid multiple refresh calls racing.
let refreshInFlight: Promise<{ access_token: string; refresh_token: string } | null> | null = null

async function refreshAccessToken(base: string): Promise<{ access_token: string; refresh_token: string } | null> {
    const { refreshToken } = getStoredTokens()
    if (!refreshToken) return null

    if (!refreshInFlight) {
        refreshInFlight = (async () => {
            try {
                const res = await fetch(`${base}/auth/refresh`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ refresh_token: refreshToken })
                })

                if (!res.ok) return null

                const text = await safeReadText(res)
                const parsed = tryParseJson(text) as any
                const access_token = parsed?.access_token
                const refresh_token = parsed?.refresh_token
                if (!access_token || !refresh_token) return null

                const tokens = { access_token: String(access_token), refresh_token: String(refresh_token) }
                setStoredTokens(tokens)
                return tokens
            } catch {
                return null
            } finally {
                refreshInFlight = null
            }
        })()
    }

    return refreshInFlight
}

function shouldAttemptRefresh(path: string): boolean {
    // Only for protected admin routes, and never for the refresh endpoint itself.
    return path.startsWith("/admin/") && !path.startsWith("/auth/refresh")
}

export async function apiFetchResponse(path: string, init: RequestInit = {}): Promise<Response> {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080/api/v1"

    const { accessToken } = getStoredTokens()

    const headers = new Headers(init.headers)
    if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`)
    }

    let res: Response
    try {
        res = await fetch(`${base}${path}`, { ...init, headers })
    } catch {
        throw new Error("Network error — check your connection and try again.")
    }

    // ✅ Try refresh once on 401 for admin endpoints
    if (!res.ok && res.status === 401 && shouldAttemptRefresh(path)) {
        const refreshed = await refreshAccessToken(base)
        if (refreshed?.access_token) {
            const retryHeaders = new Headers(init.headers)
            retryHeaders.set("Authorization", `Bearer ${refreshed.access_token}`)
            res = await fetch(`${base}${path}`, { ...init, headers: retryHeaders })
        }
    }

    if (!res.ok) {
        const text = await safeReadText(res)
        if (res.status === 401 && path.startsWith("/admin/")) {
            clearAuthTokens()
            redirectToPublicEvents()
        }
        throw toApiErrorFromResponse(res, text)
    }

    return res
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080/api/v1"

    const { accessToken } = getStoredTokens()

    const headers = new Headers(init.headers)
    if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
        headers.set("Content-Type", "application/json")
    }
    if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`)
    }

    let res: Response
    try {
        res = await fetch(`${base}${path}`, { ...init, headers })
    } catch {
        throw new Error("Network error — check your connection and try again.")
    }

    // ✅ Try to refresh once on 401 for admin endpoints
    if (!res.ok && res.status === 401 && shouldAttemptRefresh(path)) {
        const refreshed = await refreshAccessToken(base)
        if (refreshed?.access_token) {
            const retryHeaders = new Headers(init.headers)
            if (!retryHeaders.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
                retryHeaders.set("Content-Type", "application/json")
            }
            retryHeaders.set("Authorization", `Bearer ${refreshed.access_token}`)
            res = await fetch(`${base}${path}`, { ...init, headers: retryHeaders })
        }
    }

    if (!res.ok) {
        const text = await safeReadText(res)
        if (res.status === 401 && path.startsWith("/admin/")) {
            clearAuthTokens()
            redirectToPublicEvents()
        }
        throw toApiErrorFromResponse(res, text)
    }

    if (res.status === 204) {
        return undefined as unknown as T
    }

    const text = await safeReadText(res)
    if (!text.trim()) {
        return undefined as unknown as T
    }
    const parsed = tryParseJson(text)
    if (parsed === null) {
        throw new Error("Something went wrong. Please try again.")
    }
    return parsed as T
}

export async function apiGet<T>(path: string): Promise<T> {
    return apiFetch<T>(path)
}

export async function apiPost<T>(path: string, body: unknown, init: RequestInit = {}): Promise<T> {
    return apiFetch<T>(path, { ...init, method: "POST", body: body instanceof FormData ? body : JSON.stringify(body) })
}

export async function apiPut<T>(path: string, body: unknown, init: RequestInit = {}): Promise<T> {
    return apiFetch<T>(path, { ...init, method: "PUT", body: body instanceof FormData ? body : JSON.stringify(body) })
}

export async function apiDelete<T>(path: string, init: RequestInit = {}): Promise<T> {
    return apiFetch<T>(path, { ...init, method: "DELETE" })
}

export function summarizeApiError(err: unknown): { title: string; description?: string } {
    if (isApiError(err)) {
        if (err.status === 422 && err.details && err.details.length > 0) {
            const first = err.details[0]
            const rest = err.details.length - 1
            const head = first.field ? `${first.field}: ${first.issue ?? "invalid"}` : first.issue ?? err.message
            return {
                title: err.message || "Validation failed",
                description: rest > 0 ? `${head} (and ${rest} more)` : head
            }
        }
        return { title: err.message || "Request failed", description: err.code }
    }
    if (err instanceof Error) {
        return { title: err.message || "Something went wrong. Please try again." }
    }
    return { title: "Something went wrong. Please try again." }
}
