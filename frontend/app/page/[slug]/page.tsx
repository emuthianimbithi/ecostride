import { CMSPage } from "../../../components/cms-page"

export default async function Page({
                                       params
                                   }: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const fallbackTitle = (slug || "page").replace(/-/g, " ")

    return <CMSPage urlSlug={slug} fallbackTitle={fallbackTitle} />
}
