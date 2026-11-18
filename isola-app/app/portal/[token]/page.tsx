import ContactPortal from "@/components/ContactPortal";

export const metadata = { title: "Your projects — Isola SiteLine", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ContactPortal token={token} />;
}
