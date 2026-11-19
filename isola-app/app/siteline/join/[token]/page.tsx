import SiteLineJoin from "@/components/SiteLineJoin";

export const metadata = { title: "Set up your SiteLine — Isola" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SiteLineJoin token={token} />;
}
