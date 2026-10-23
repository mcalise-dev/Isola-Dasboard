import SiteLinePortal from "@/components/SiteLinePortal";

export const metadata = { title: "Your projects — Isola SiteLine" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SiteLinePortal token={token} />;
}
