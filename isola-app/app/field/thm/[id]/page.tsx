import ThmJobGate from "@/components/field/ThmJobGate";

// Tyler's crew login: the full job file (money, crew, materials, tools, tasks…) for a THM job
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ThmJobGate id={id} />;
}
