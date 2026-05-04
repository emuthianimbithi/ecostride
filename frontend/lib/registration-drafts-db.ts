export type StoredRegistrationDraft = {
  id: string
  event_slug: string
  step: number
  form_values: Record<string, unknown>
  field_values: Record<string, string | boolean | number>
  updated_at: string
}

const DB_NAME = "ecostride-drafts"
const DB_VERSION = 1
const STORE = "registration_drafts"

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" })
        store.createIndex("event_slug", "event_slug")
        store.createIndex("updated_at", "updated_at")
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

function draftId(eventSlug: string) {
  return `register:${eventSlug}`
}

export async function getRegistrationDraft(eventSlug: string) {
  return tx<StoredRegistrationDraft | undefined>("readonly", (store) => store.get(draftId(eventSlug)))
}

export async function upsertRegistrationDraft(input: {
  event_slug: string
  step: number
  form_values: Record<string, unknown>
  field_values: Record<string, string | boolean | number>
}) {
  const payload: StoredRegistrationDraft = {
    id: draftId(input.event_slug),
    event_slug: input.event_slug,
    step: input.step,
    form_values: input.form_values,
    field_values: input.field_values,
    updated_at: new Date().toISOString()
  }
  await tx("readwrite", (store) => store.put(payload))
  return payload
}

export async function deleteRegistrationDraft(eventSlug: string) {
  await tx("readwrite", (store) => store.delete(draftId(eventSlug)))
}
