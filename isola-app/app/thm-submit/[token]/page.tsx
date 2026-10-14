import ThmSubmit from "@/components/ThmSubmit";

export const metadata = { title: "THM Materials — Isola Excavation & Design" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ThmSubmit token={token} />;
}
