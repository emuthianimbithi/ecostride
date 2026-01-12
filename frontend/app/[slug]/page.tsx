import { CMSPage } from "../../components/cms-page"

export default function Page({ params }: { params: { slug: string } }) {
  return <CMSPage slug={params.slug} fallbackTitle={params.slug.replace(/-/g, " ")} />
}
