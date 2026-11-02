import { redirect } from "next/navigation"

export default function SupportPage() {
  // Fundraising is temporarily paused; keep old links safe while the page is offline.
  redirect("/contact")
}
