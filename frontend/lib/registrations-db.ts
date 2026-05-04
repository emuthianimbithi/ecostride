// lib/registrations-db.ts
// Tiny IndexedDB wrapper (no external deps)

export type StoredRegistration = {
    slug: string
    email: string
    athlete_name: string
    event_slug?: string
    event_title?: string
    event_start_at?: string
    category_name?: string
    status: string
    created_at?: string
    last_seen_at: string
}

const DB_NAME = "ecostride-registrations"
const DB_VERSION = 1
const STORE = "registrations"

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION)

        req.onupgradeneeded = () => {
            const db = req.result
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: "slug" })
                store.createIndex("last_seen_at", "last_seen_at")
                store.createIndex("email", "email")
                store.createIndex("event_slug", "event_slug")
            }
        }

        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return openDB().then(
        (db) =>
            new Promise<T>((resolve, reject) => {
                const t = db.transaction(STORE, mode)
                const store = t.objectStore(STORE)
                const req = fn(store)
                req.onsuccess = () => resolve(req.result)
                req.onerror = () => reject(req.error)
                t.oncomplete = () => db.close()
                t.onerror = () => {
                    db.close()
                    reject(t.error)
                }
            })
    )
}

export async function upsertRegistration(input: Partial<StoredRegistration> & { slug: string }) {
    const now = new Date().toISOString()
    const existing = await getRegistration(input.slug).catch(() => null)

    const merged: StoredRegistration = {
        slug: input.slug,
        email: input.email ?? existing?.email ?? "",
        athlete_name: input.athlete_name ?? existing?.athlete_name ?? "",
        event_slug: input.event_slug ?? existing?.event_slug,
        event_title: input.event_title ?? existing?.event_title,
        event_start_at: input.event_start_at ?? existing?.event_start_at,
        category_name: input.category_name ?? existing?.category_name,
        status: input.status ?? existing?.status ?? "pending_payment",
        created_at: input.created_at ?? existing?.created_at,
        last_seen_at: now
    }

    await tx("readwrite", (store) => store.put(merged))
    return merged
}

export async function getRegistration(slug: string) {
    return tx<StoredRegistration | undefined>("readonly", (store) => store.get(slug))
}

export async function listRegistrations() {
    // return newest first by last_seen_at
    const all = await tx<StoredRegistration[]>("readonly", (store) => store.getAll())
    return [...(all ?? [])].sort((a, b) => String(b.last_seen_at).localeCompare(String(a.last_seen_at)))
}

export async function deleteRegistration(slug: string) {
    await tx("readwrite", (store) => store.delete(slug))
}

export async function clearRegistrations() {
    await tx("readwrite", (store) => store.clear())
}
