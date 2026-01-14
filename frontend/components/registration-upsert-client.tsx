"use client"

import { useEffect } from "react"
import { upsertRegistration, type StoredRegistration } from "../lib/registrations-db"

export function RegistrationUpsertClient({ registration }: { registration: Partial<StoredRegistration> & { slug: string } }) {
    useEffect(() => {
        upsertRegistration(registration).catch(() => {})
    }, [registration])

    return null
}
