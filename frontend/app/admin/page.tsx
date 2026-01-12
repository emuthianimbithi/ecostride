"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "../../components/auth-provider"
import { firstAllowedAdminRoute } from "../../lib/admin-nav"

export default function AdminIndexPage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace("/admin/login")
      return
    }
    const next = firstAllowedAdminRoute({ roles: user.roles, permissions: user.permissions }) ?? "/admin/dashboard"
    router.replace(next)
  }, [loading, router, user])

  return null
}

