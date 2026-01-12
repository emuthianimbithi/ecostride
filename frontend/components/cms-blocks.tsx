type CMSBlock = {
  type?: string
  data?: Record<string, unknown>
}

function isProbablyHTML(value: string) {
  const trimmed = value.trim()
  return trimmed.startsWith("<") && trimmed.endsWith(">")
}

export function CMSBlocks({ blocks }: { blocks: CMSBlock[] | null }) {
  if (!blocks || blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">No content yet.</p>
  }

  return (
    <div className="space-y-6">
      {blocks.map((block, index) => {
        const key = `${block.type ?? "block"}-${index}`
        const data = block.data ?? {}
        const imageURL =
          typeof data.url === "string"
            ? data.url
            : typeof data.src === "string"
              ? data.src
              : typeof data.imageUrl === "string"
                ? data.imageUrl
                : ""
        const alt =
          typeof data.alt === "string"
            ? data.alt
            : typeof data.altText === "string"
              ? data.altText
              : ""
        const caption = typeof data.caption === "string" ? data.caption : ""
        const text =
          typeof data.text === "string"
            ? data.text
            : typeof data.body === "string"
              ? data.body
              : typeof data.title === "string"
                ? data.title
                : ""

        switch (block.type) {
          case "heading":
            return (
              <h2 key={key} className="text-2xl font-semibold text-foreground">
                {text || "Heading"}
              </h2>
            )
          case "image":
            if (!imageURL) {
              return null
            }
            return (
              <figure key={key} className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageURL}
                  alt={alt}
                  className="w-full rounded-2xl border border-border/60 bg-muted object-cover"
                  loading="lazy"
                />
                {caption && <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>}
              </figure>
            )
          case "hero":
            return (
              <div key={key} className="rounded-2xl border border-border/60 bg-muted p-6">
                <h2 className="text-2xl font-semibold text-foreground">{text || "Hero section"}</h2>
              </div>
            )
          case "richText":
          case "paragraph":
            if (typeof data.html === "string" && data.html.trim()) {
              return (
                <div
                  key={key}
                  className="prose prose-slate max-w-none text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: data.html }}
                />
              )
            }
            if (typeof text === "string" && isProbablyHTML(text)) {
              return (
                <div
                  key={key}
                  className="prose prose-slate max-w-none text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: text }}
                />
              )
            }
            return (
              <p key={key} className="text-sm leading-relaxed text-muted-foreground">
                {text || "Content block"}
              </p>
            )
          default:
            return (
              <div key={key} className="rounded-xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
                {text || "Content block"}
              </div>
            )
        }
      })}
    </div>
  )
}
