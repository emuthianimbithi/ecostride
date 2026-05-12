"use client"

import { useState } from "react"
import { Mail } from "lucide-react"

export function ContactForm() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [subject, setSubject] = useState("Sponsor inquiry")
  const [message, setMessage] = useState("")

  const mailtoHref = `mailto:hello@estuarymarathon.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    `Name: ${name}\nEmail: ${email}\n\n${message}`
  )}`

  return (
    <form className="space-y-4 border border-sand-200 bg-sand-50 p-6" action={mailtoHref}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="contact-name">
          Name
        </label>
        <input
          id="contact-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-full border border-sand-300 bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sand-400/35"
          placeholder="Your name"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="contact-email">
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-full border border-sand-300 bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sand-400/35"
          placeholder="you@example.com"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="contact-subject">
          Subject
        </label>
        <input
          id="contact-subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          className="w-full rounded-full border border-sand-300 bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sand-400/35"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="contact-message">
          Message
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={6}
          className="w-full rounded-[1.25rem] border border-sand-300 bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sand-400/35"
          placeholder="Tell us what you need."
        />
      </div>

      <button
        type="submit"
        className="button-lift inline-flex h-11 items-center justify-center gap-2 rounded-full bg-sand-300 px-5 text-sm font-semibold text-forest-900 hover:bg-sand-200"
      >
        <Mail className="h-4 w-4" />
        Send email
      </button>
    </form>
  )
}
