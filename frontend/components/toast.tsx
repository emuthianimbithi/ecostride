"use client"

import React, { createContext, useContext, useState, useCallback } from "react"

export type ToastVariant = "default" | "success" | "destructive"

export type Toast = {
    id: string
    title: string
    description?: string
    variant?: ToastVariant
}

type ToastContextType = {
    toast: (props: Omit<Toast, "id">) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    const toast = useCallback(({ title, description, variant = "default" }: Omit<Toast, "id">) => {
        const id = Math.random().toString(36).substring(2, 9)
        setToasts((prev) => [...prev, { id, title, description, variant }])
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id))
        }, 5000)
    }, [])

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={`w-80 rounded-lg border p-4 shadow-lg transition-all ${t.variant === "destructive"
                                ? "bg-rose-600 text-white border-rose-700"
                                : t.variant === "success"
                                    ? "bg-emerald-600 text-white border-emerald-700"
                                    : "bg-white text-slate-800 border-slate-200"
                            }`}
                    >
                        <div className="font-semibold">{t.title}</div>
                        {t.description && <div className="mt-1 text-sm opacity-90">{t.description}</div>}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    )
}

export function useToast() {
    const context = useContext(ToastContext)
    if (!context) {
        throw new Error("useToast must be used within a ToastProvider")
    }
    return context
}
