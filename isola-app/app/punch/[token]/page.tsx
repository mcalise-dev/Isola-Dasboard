import PublicPunch from "@/components/PublicPunch";

export const metadata = { title: "Punch List — Isola Excavation & Design" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicPunch token={token} />;
}
