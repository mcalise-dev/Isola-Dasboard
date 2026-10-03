import JobRecord from "@/components/job/JobRecord";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JobRecord id={id} />;
}
