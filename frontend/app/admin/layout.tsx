"use client"

import { usePathname } from "next/navigation"
import { AdminShell } from "../../components/admin-shell"
import { AuthProvider } from "../../components/auth-provider"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLogin = pathname === "/admin/login"

  return (
    <AuthProvider>
      {isLogin ? children : <AdminShell>{children}</AdminShell>}
    </AuthProvider>
  )
}
