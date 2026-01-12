"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { apiGet } from "../lib/api-client"

export type AuthUser = {
  id: number
  slug: string
  name: string
  email: string
  roles: string[]
  permissions: string[]
}

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  refresh: () => Promise<void>
  hasPermission: (permission: string) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
    if (!token) {
      setUser(null)
      setLoading(false)
      return
    }

    try {
      const raw = await apiGet<any>("/me")
      const data: AuthUser = {
        id: raw.id ?? raw.ID,
        slug: raw.slug ?? raw.Slug,
        name: raw.name ?? raw.Name,
        email: raw.email ?? raw.Email,
        roles: raw.roles ?? raw.Roles ?? [],
        permissions: raw.permissions ?? raw.Permissions ?? []
      }
      setUser(data)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const handler = () => {
      void refresh()
    }
    window.addEventListener("storage", handler)
    window.addEventListener("auth:changed", handler as EventListener)
    return () => {
      window.removeEventListener("storage", handler)
      window.removeEventListener("auth:changed", handler as EventListener)
    }
  }, [refresh])

  const hasPermission = useCallback(
    (permission: string) => {
      if (!permission) return true
      return user?.permissions?.includes(permission) ?? false
    },
    [user]
  )

  const value = useMemo(
    () => ({
      user,
      loading,
      refresh,
      hasPermission
    }),
    [user, loading, refresh, hasPermission]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return ctx
}
