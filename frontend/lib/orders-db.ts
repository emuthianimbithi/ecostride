"use client"

export type LocalOrder = {
    slug: string
    status?: string
    email?: string
    name?: string

    // optional metadata you may have
    amount_minor?: number
    currency?: string
    created_at?: string

    // optional extra fields
    title?: string
    notes?: string
    updated_at?: string
}

const DB_NAME = "ecostride"
const DB_VERSION = 2

const STORE_ORDERS = "orders"

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION)

        req.onupgradeneeded = () => {
            const db = req.result

            // If you already have "registrations" in version 1, this will keep it.
            // Add orders store if missing.
            if (!db.objectStoreNames.contains(STORE_ORDERS)) {
                const store = db.createObjectStore(STORE_ORDERS, { keyPath: "slug" })
                store.createIndex("created_at", "created_at", { unique: false })
                store.createIndex("status", "status", { unique: false })
            }
        }

        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) {
    return new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_ORDERS, mode)
        const store = transaction.objectStore(STORE_ORDERS)
        const request = fn(store)

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

export async function upsertOrder(order: LocalOrder) {
    const db = await openDb()
    const payload: LocalOrder = {
        ...order,
        updated_at: new Date().toISOString()
    }
    await tx(db, "readwrite", (store) => store.put(payload))
    db.close()
}

export async function getOrder(slug: string): Promise<LocalOrder | null> {
    const db = await openDb()
    const res = await tx(db, "readonly", (store) => store.get(slug))
    db.close()
    return (res as any) ?? null
}

export async function listOrders(): Promise<LocalOrder[]> {
    const db = await openDb()

    const result = await new Promise<LocalOrder[]>((resolve, reject) => {
        const transaction = db.transaction(STORE_ORDERS, "readonly")
        const store = transaction.objectStore(STORE_ORDERS)
        const req = store.getAll()

        req.onsuccess = () => resolve((req.result as LocalOrder[]) ?? [])
        req.onerror = () => reject(req.error)
    })

    db.close()

    // newest first (if created_at present)
    return [...result].sort((a, b) => {
        const at = a.created_at ? new Date(a.created_at).getTime() : 0
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0
        return bt - at
    })
}

export async function deleteOrder(slug: string) {
    const db = await openDb()
    await tx(db, "readwrite", (store) => store.delete(slug))
    db.close()
}
