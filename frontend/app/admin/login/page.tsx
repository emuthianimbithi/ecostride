"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { apiPost } from "../../../lib/api-client"
import { EcoStrideLogo } from "../../../components/ecostride-logo"
import { useToast } from "../../../components/toast"
import { toastApiError } from "../../../lib/toast-api-error"
import { firstAllowedAdminRoute } from "../../../lib/admin-nav"

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
})

type FormValues = z.infer<typeof schema>

export default function AdminLoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async (values: FormValues) => {
    setError(null)
    try {
      const data = await apiPost<{ access_token: string; refresh_token: string; user?: any }>(
        "/auth/login",
        values
      )
      localStorage.setItem("access_token", data.access_token)
      localStorage.setItem("refresh_token", data.refresh_token)
      window.dispatchEvent(new Event("auth:changed"))

      const user = data.user
        ? {
            roles: data.user.roles ?? data.user.Roles ?? [],
            permissions: data.user.permissions ?? data.user.Permissions ?? []
          }
        : null

      const next = firstAllowedAdminRoute(user) ?? "/admin/dashboard"
      router.push(next)
    } catch (err) {
      toastApiError(toast, err)
      setError("Sign in failed")
    }
  }

  return (
    <main className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-md">
        <div className="rounded-3xl border border-border bg-background p-8 shadow-sm">
          <EcoStrideLogo textClassName="text-xl" />
          <h1 className="mt-4 text-2xl font-semibold text-foreground">Admin login</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to manage events, registrations, sponsors, and content.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <label className="block text-sm">
              <span className="text-muted-foreground">Email</span>
              <input
                type="email"
                className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                {...register("email")}
              />
              {errors.email && <span className="text-xs text-destructive">{errors.email.message}</span>}
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Password</span>
              <input
                type="password"
                className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                {...register("password")}
              />
              {errors.password && (
                <span className="text-xs text-destructive">{errors.password.message}</span>
              )}
            </label>

            {error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-xs text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between text-sm">
            <Link href="/events" className="text-muted-foreground hover:text-foreground">
              Back to events
            </Link>
            <span className="text-xs text-muted-foreground">Admin access only</span>
          </div>
        </div>
      </div>
    </main>
  )
}
