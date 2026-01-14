"use client"

import { useEffect } from "react"
import { upsertOrder, type LocalOrder } from "../lib/orders-db"

export function OrderUpsertClient({ order }: { order: LocalOrder }) {
    useEffect(() => {
        upsertOrder(order).catch(() => {})
    }, [order])

    return null
}
