import { Mail, MapPin, Phone } from "lucide-react"
import { ContactForm } from "../../components/contact-form"
import { Eyebrow } from "../../components/eyebrow"
import { Reveal } from "../../components/reveal"
import { Section } from "../../components/section"

export default function Page() {
  return (
    <main>
      <Section>
        <Reveal className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
          <div className="space-y-8">
            <div className="space-y-3">
              <Eyebrow>Contact</Eyebrow>
              <h1 className="font-display text-h1 text-foreground md:text-display-lg">A direct line for sponsors, runners, and cleanup partners.</h1>
              <p className="max-w-2xl text-base leading-8 text-muted-foreground">
                Keep this page simple: message, location, and the fastest way to reach the team behind EcoStride.
              </p>
            </div>

            <div className="overflow-hidden border border-sand-200 bg-sand-50">
              <iframe
                src="https://www.google.com/maps?q=Malindi%2C%20Kenya&output=embed"
                title="EcoStride map"
                className="h-[360px] w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 border-t border-sand-200 pt-4">
                <MapPin className="h-5 w-5 text-tide-600" />
                <p className="text-sm font-semibold text-foreground">Malindi, Kenya</p>
                <p className="text-sm text-muted-foreground">Coastal event base and field operations.</p>
              </div>
              <div className="space-y-2 border-t border-sand-200 pt-4">
                <Mail className="h-5 w-5 text-tide-600" />
                <a href="mailto:hello@estuarymarathon.com" className="link-underline text-sm font-semibold text-foreground">
                  hello@estuarymarathon.com
                </a>
                <p className="text-sm text-muted-foreground">Best for sponsor and partnership requests.</p>
              </div>
              <div className="space-y-2 border-t border-sand-200 pt-4">
                <Phone className="h-5 w-5 text-tide-600" />
                <a href="tel:+254700000000" className="link-underline text-sm font-semibold text-foreground">
                  +254 791 648 304
                </a>
                <p className="text-sm text-muted-foreground">Race-day coordination and urgent follow-up.</p>
              </div>
            </div>
          </div>

          <ContactForm />
        </Reveal>
      </Section>
    </main>
  )
}
