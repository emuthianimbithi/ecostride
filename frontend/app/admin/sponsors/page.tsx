"use client"

import { useEffect, useMemo, useState } from "react"
import { apiFetch, apiGet, apiPost, apiPut } from "../../../lib/api-client"
import { useToast } from "../../../components/toast"
import { toastApiError } from "../../../lib/toast-api-error"
import { IconAction } from "../../../components/icon-action"
import { BarChart3, Pencil, Pin } from "lucide-react"

type Placement = {
  LocationKey: string
  EventSlug?: string
  EventTitle?: string
}

type Sponsor = {
  Slug: string
  Name: string
  URLSlug: string
  Description?: string
  WebsiteURL?: string
  IsFeatured: boolean
  DisplayOrder: number
  TierSlug: string
  TierName: string
  TierPriority: number
  LogoMediaID?: number
  LogoURL?: string
  LogoAlt?: string
  Placements?: Placement[]
}

type SponsorAPI = {
  slug: string
  url_slug: string
  name: string
  description?: string
  website_url?: string
  is_featured: boolean
  display_order: number
  tier_slug: string
  tier_name: string
  tier_priority: number
  logo_media_id?: number | null
  logo_url?: string | null
  logo_alt?: string | null
  placements?: Array<{ location_key: string; event_slug?: string | null; event_title?: string | null }>
}

function normalizeSponsorAdmin(raw: SponsorAPI): Sponsor {
  return {
    Slug: raw.slug,
    URLSlug: raw.url_slug,
    Name: raw.name,
    Description: raw.description,
    WebsiteURL: raw.website_url,
    IsFeatured: Boolean(raw.is_featured),
    DisplayOrder: Number(raw.display_order ?? 0),
    TierSlug: raw.tier_slug,
    TierName: raw.tier_name,
    TierPriority: Number(raw.tier_priority ?? 0),
    LogoMediaID: raw.logo_media_id ?? undefined,
    LogoURL: raw.logo_url ?? undefined,
    LogoAlt: raw.logo_alt ?? undefined,
    Placements: raw.placements?.map((p) => ({ LocationKey: p.location_key, EventSlug: p.event_slug ?? undefined, EventTitle: p.event_title ?? undefined })) ?? []
  }
}

type SponsorTier = {
  Slug: string
  Name: string
  Priority: number
}

type SponsorAnalytics = {
  PageKey: string
  Count: number
}

type Event = {
  URLSlug: string
  Title: string
  StartAt: string
}

const placementOptions = ["HOME_STRIP", "EVENT_PAGE", "SPONSOR_PAGE", "FOOTER", "CHECKOUT_PAGE"]

export default function SponsorsPage() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [tiers, setTiers] = useState<SponsorTier[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [showSponsorForm, setShowSponsorForm] = useState(false)
  const [showTierForm, setShowTierForm] = useState(false)
  const [editingSponsor, setEditingSponsor] = useState<Sponsor | null>(null)
  const [sponsorForm, setSponsorForm] = useState({
    tierSlug: "",
    name: "",
    slug: "",
    websiteUrl: "",
    description: "",
    isFeatured: false,
    displayOrder: 0,
    logoMediaId: undefined as number | undefined,
    logoUrl: "",
    logoAlt: ""
  })
  const [tierForm, setTierForm] = useState({
    name: "",
    priority: 1
  })
  const [placementSponsor, setPlacementSponsor] = useState<Sponsor | null>(null)
  const [placementDrafts, setPlacementDrafts] = useState<Array<{ locationKey: string; eventSlug: string }>>([])
  const [analyticsSponsor, setAnalyticsSponsor] = useState<Sponsor | null>(null)
  const [analytics, setAnalytics] = useState<SponsorAnalytics[]>([])
  const { toast } = useToast()

  useEffect(() => {
    loadSponsors()
    loadTiers()
    loadEvents()
  }, [])

  const loadSponsors = async () => {
    try {
      const data = await apiGet<SponsorAPI[]>("/admin/sponsors")
      setSponsors((data ?? []).map(normalizeSponsorAdmin))
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to load sponsors")
    }
  }

  const loadTiers = async () => {
    try {
      const data = await apiGet<SponsorTier[]>("/admin/sponsor-tiers")
      setTiers(data)
      if (data.length > 0 && !sponsorForm.tierSlug) {
        setSponsorForm((prev) => ({ ...prev, tierSlug: data[0].Slug }))
      }
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to load tiers")
    }
  }

  const loadEvents = async () => {
    try {
      const data = await apiGet<Event[]>("/admin/events")
      setEvents(data)
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to load events")
    }
  }

  const resetSponsorForm = () => {
    setSponsorForm({
      tierSlug: tiers[0]?.Slug ?? "",
      name: "",
      slug: "",
      websiteUrl: "",
      description: "",
      isFeatured: false,
      displayOrder: 0,
      logoMediaId: undefined,
      logoUrl: "",
      logoAlt: ""
    })
    setEditingSponsor(null)
  }

  const handleUploadLogo = async (file: File | null) => {
    if (!file) return
    setError(null)
    setStatus("Uploading logo...")
    try {
      const form = new FormData()
      form.append("file", file)
      if (sponsorForm.logoAlt) {
        form.append("alt_text", sponsorForm.logoAlt)
      }
      const media = await apiFetch<any>("/admin/media/upload", { method: "POST", body: form })
      setSponsorForm((prev) => ({
        ...prev,
        logoMediaId: media.ID,
        logoUrl: media.URL || media.Path || ""
      }))
      setStatus("Logo uploaded")
    } catch (err) {
      toastApiError(toast, err)
      setStatus(null)
      setError(err instanceof Error ? err.message : "Failed to upload logo")
    }
  }

  const handleSaveSponsor = async () => {
    setError(null)
    setStatus(null)
    if (!sponsorForm.name || !sponsorForm.slug || !sponsorForm.tierSlug) {
      setError("Name, slug, and tier are required.")
      return
    }
    const payload = {
      tier_slug: sponsorForm.tierSlug,
      name: sponsorForm.name,
      slug: sponsorForm.slug,
      website_url: sponsorForm.websiteUrl,
      description: sponsorForm.description,
      is_featured: sponsorForm.isFeatured,
      display_order: sponsorForm.displayOrder,
      logo_media_id: sponsorForm.logoMediaId
    }
    try {
      if (editingSponsor) {
        await apiPut(`/admin/sponsors/${editingSponsor.Slug}`, payload)
        setStatus("Sponsor updated")
      } else {
        await apiPost("/admin/sponsors", payload)
        setStatus("Sponsor created")
      }
      resetSponsorForm()
      setShowSponsorForm(false)
      await loadSponsors()
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to save sponsor")
    }
  }

  const handleCreateTier = async () => {
    setError(null)
    setStatus(null)
    if (!tierForm.name) {
      setError("Tier name is required.")
      return
    }
    try {
      await apiPost("/admin/sponsor-tiers", {
        name: tierForm.name,
        priority: tierForm.priority
      })
      setStatus("Tier created")
      setTierForm({ name: "", priority: 1 })
      setShowTierForm(false)
      await loadTiers()
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to create tier")
    }
  }

  const openPlacements = (sponsor: Sponsor) => {
    setPlacementSponsor(sponsor)
    const drafts = sponsor.Placements && sponsor.Placements.length > 0
      ? sponsor.Placements.map((placement) => ({
          locationKey: placement.LocationKey,
          eventSlug: placement.EventSlug ?? ""
        }))
      : [{ locationKey: "HOME_STRIP", eventSlug: "" }]
    setPlacementDrafts(drafts)
  }

  const openAnalytics = async (sponsor: Sponsor) => {
    setAnalyticsSponsor(sponsor)
    setError(null)
    try {
      const data = await apiGet<SponsorAnalytics[]>(`/admin/sponsors/${sponsor.Slug}/analytics`)
      setAnalytics(data)
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to load analytics")
      setAnalytics([])
    }
  }

  const handleSavePlacements = async () => {
    if (!placementSponsor) return
    setError(null)
    setStatus(null)
    try {
      await apiPost(`/admin/sponsors/${placementSponsor.Slug}/placements`,
        placementDrafts
          .filter((draft) => draft.locationKey)
          .map((draft) => ({
            location_key: draft.locationKey,
            event_slug: draft.eventSlug || undefined
          }))
      )
      setStatus("Placements updated")
      setPlacementSponsor(null)
      setPlacementDrafts([])
      await loadSponsors()
    } catch (err) {
      toastApiError(toast, err)
      setError(err instanceof Error ? err.message : "Failed to update placements")
    }
  }

  const formattedSponsors = useMemo(() => {
    return sponsors.map((sponsor) => ({
      ...sponsor,
      placementsLabel: sponsor.Placements?.map((placement) => {
        if (placement.EventTitle) {
          return `${placement.LocationKey} (${placement.EventTitle})`
        }
        return placement.LocationKey
      }).join(", ")
    }))
  }, [sponsors])

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-forest">Sponsors</h1>
          <p className="text-sm text-slate-600">Manage tiers, placements, and profiles.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowTierForm((prev) => !prev)}
            className="rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest"
          >
            {showTierForm ? "Close tier" : "New tier"}
          </button>
          <button
            onClick={() => {
              setShowSponsorForm((prev) => !prev)
              if (!showSponsorForm) {
                resetSponsorForm()
              }
            }}
            className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
          >
            {showSponsorForm ? "Close sponsor" : "New sponsor"}
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}
      {status && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{status}</div>}

      {showTierForm && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-800">New Tier</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={tierForm.name}
              onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Tier name"
            />
            <input
              type="number"
              value={tierForm.priority}
              onChange={(e) => setTierForm({ ...tierForm, priority: Number(e.target.value) })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Priority"
            />
          </div>
          <button
            onClick={handleCreateTier}
            className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
          >
            Create tier
          </button>
        </section>
      )}

      {showSponsorForm && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-800">{editingSponsor ? "Edit Sponsor" : "New Sponsor"}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={sponsorForm.name}
              onChange={(e) => setSponsorForm({ ...sponsorForm, name: e.target.value })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Sponsor name"
            />
            <input
              value={sponsorForm.slug}
              onChange={(e) => setSponsorForm({ ...sponsorForm, slug: e.target.value })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Sponsor slug"
            />
            <select
              value={sponsorForm.tierSlug}
              onChange={(e) => setSponsorForm({ ...sponsorForm, tierSlug: e.target.value })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              {tiers.map((tier) => (
                <option key={tier.Slug} value={tier.Slug}>
                  {tier.Name}
                </option>
              ))}
            </select>
            <input
              value={sponsorForm.websiteUrl}
              onChange={(e) => setSponsorForm({ ...sponsorForm, websiteUrl: e.target.value })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Website URL"
            />
            <input
              type="number"
              value={sponsorForm.displayOrder}
              onChange={(e) => setSponsorForm({ ...sponsorForm, displayOrder: Number(e.target.value) })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Display order"
            />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={sponsorForm.isFeatured}
                onChange={(e) => setSponsorForm({ ...sponsorForm, isFeatured: e.target.checked })}
              />
              Featured
            </label>
          </div>
          <textarea
            value={sponsorForm.description}
            onChange={(e) => setSponsorForm({ ...sponsorForm, description: e.target.value })}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            rows={3}
            placeholder="Description"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={sponsorForm.logoAlt}
              onChange={(e) => setSponsorForm({ ...sponsorForm, logoAlt: e.target.value })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Logo alt text"
            />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleUploadLogo(e.target.files?.[0] ?? null)}
            />
          </div>
          {sponsorForm.logoUrl && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              Logo uploaded: {sponsorForm.logoUrl}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSaveSponsor}
              className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
            >
              {editingSponsor ? "Update sponsor" : "Create sponsor"}
            </button>
            {editingSponsor && (
              <button
                onClick={resetSponsorForm}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm"
              >
                Cancel edit
              </button>
            )}
          </div>
        </section>
      )}

      {placementSponsor && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Placements for {placementSponsor.Name}</h2>
            <button
              onClick={() => setPlacementSponsor(null)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm"
            >
              Close
            </button>
          </div>
          <div className="space-y-3">
            {placementDrafts.map((placement, index) => (
              <div key={`${placement.locationKey}-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <select
                  value={placement.locationKey}
                  onChange={(e) => {
                    const next = [...placementDrafts]
                    next[index] = { ...next[index], locationKey: e.target.value }
                    setPlacementDrafts(next)
                  }}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  {placementOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select
                  value={placement.eventSlug}
                  onChange={(e) => {
                    const next = [...placementDrafts]
                    next[index] = { ...next[index], eventSlug: e.target.value }
                    setPlacementDrafts(next)
                  }}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">All events</option>
                  {events.map((event) => (
                    <option key={event.URLSlug} value={event.URLSlug}>
                      {event.Title} ({event.StartAt ? new Date(event.StartAt).toLocaleDateString() : "TBD"})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const next = placementDrafts.filter((_, idx) => idx !== index)
                    setPlacementDrafts(next.length > 0 ? next : [{ locationKey: "HOME_STRIP", eventSlug: "" }])
                  }}
                  className="rounded-full border border-slate-200 px-3 py-2 text-xs"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPlacementDrafts([...placementDrafts, { locationKey: "HOME_STRIP", eventSlug: "" }])}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm"
            >
              Add placement
            </button>
            <button
              onClick={handleSavePlacements}
              className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
            >
              Save placements
            </button>
          </div>
        </section>
      )}

      {analyticsSponsor && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Analytics for {analyticsSponsor.Name}</h2>
            <button
              onClick={() => setAnalyticsSponsor(null)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm"
            >
              Close
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {analytics.map((row) => (
              <div key={row.PageKey} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-slate-500">{row.PageKey}</div>
                <div className="mt-1 text-lg font-semibold text-slate-800">{row.Count}</div>
              </div>
            ))}
            {analytics.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                No views recorded yet.
              </div>
            )}
          </div>
        </section>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Sponsor</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Placements</th>
              <th className="px-4 py-3">Featured</th>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {formattedSponsors.map((sponsor) => (
              <tr key={sponsor.Slug} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{sponsor.Name}</div>
                  <div className="text-xs text-slate-500">{sponsor.URLSlug}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">{sponsor.TierName}</td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {sponsor.placementsLabel || "No placements"}
                </td>
                <td className="px-4 py-3 text-slate-600">{sponsor.IsFeatured ? "Yes" : "No"}</td>
                <td className="px-4 py-3 text-slate-600">{sponsor.DisplayOrder}</td>
                <td className="px-4 py-3 text-xs">
                  <div className="flex items-center gap-2">
                    <IconAction
                      label="Edit"
                      onClick={() => {
                        setEditingSponsor(sponsor)
                        setShowSponsorForm(true)
                        setSponsorForm({
                          tierSlug: sponsor.TierSlug,
                          name: sponsor.Name,
                          slug: sponsor.URLSlug,
                          websiteUrl: sponsor.WebsiteURL ?? "",
                          description: sponsor.Description ?? "",
                          isFeatured: sponsor.IsFeatured,
                          displayOrder: sponsor.DisplayOrder,
                          logoMediaId: sponsor.LogoMediaID,
                          logoUrl: sponsor.LogoURL ?? "",
                          logoAlt: sponsor.LogoAlt ?? ""
                        })
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </IconAction>
                    <IconAction label="Placements" onClick={() => openPlacements(sponsor)}>
                      <Pin className="h-4 w-4" />
                    </IconAction>
                    <IconAction label="Analytics" onClick={() => void openAnalytics(sponsor)}>
                      <BarChart3 className="h-4 w-4" />
                    </IconAction>
                  </div>
                </td>
              </tr>
            ))}
            {formattedSponsors.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  No sponsors yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
