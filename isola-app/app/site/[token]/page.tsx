import PublicSiteLine from "@/components/PublicSiteLine";

export const metadata = { title: "SiteLine — Isola Excavation & Design" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicSiteLine token={token} />;
}
