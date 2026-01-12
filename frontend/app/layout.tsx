import "./globals.css"
import type { Metadata } from "next"
import { SiteFooter } from "../components/site-footer"
import { SiteHeader } from "../components/site-header"

export const metadata: Metadata = {
  title: "EcoStride",
  description: "Community-first race and environmental events platform.",
  icons: {
    icon: "/ecostride.svg"
  }
}

import { ToastProvider } from "../components/toast"

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-background text-foreground">
        <ToastProvider>
          <div className="min-h-screen">
            <SiteHeader />
            {children}
            <SiteFooter />
          </div>
        </ToastProvider>
      </body>
    </html>
  )
}
