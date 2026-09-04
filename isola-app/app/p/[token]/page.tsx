import PublicProposal from "@/components/PublicProposal";

export const metadata = { title: "Proposal — Isola Excavation & Design" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicProposal token={token} />;
}
