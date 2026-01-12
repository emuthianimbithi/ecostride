import type { Toast } from "../components/toast"
import { summarizeApiError } from "./api-client"

export function toastApiError(toast: (t: Omit<Toast, "id">) => void, err: unknown) {
  const { title, description } = summarizeApiError(err)
  toast({ title, description, variant: "destructive" })
}

