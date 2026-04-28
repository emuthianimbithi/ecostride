import { ReactNode } from "react"

type DataStateProps = {
  loading?: boolean
  error?: string | null
  isEmpty?: boolean
  loadingView?: ReactNode
  emptyView?: ReactNode
  errorView?: ReactNode
  children: ReactNode
}

export function DataState({
  loading = false,
  error = null,
  isEmpty = false,
  loadingView,
  emptyView,
  errorView,
  children
}: DataStateProps) {
  if (loading) {
    return (
      <>
        {loadingView ?? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading...</div>
        )}
      </>
    )
  }

  if (error) {
    return (
      <>
        {errorView ?? (
          <div className="rounded-2xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">{error}</div>
        )}
      </>
    )
  }

  if (isEmpty) {
    return (
      <>
        {emptyView ?? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
            No data available.
          </div>
        )}
      </>
    )
  }

  return <>{children}</>
}
