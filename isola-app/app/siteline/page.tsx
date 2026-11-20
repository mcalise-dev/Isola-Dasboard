import { ClientSignIn } from "@/components/siteline/ClientAuth";

export const metadata = { title: "Your projects — Isola SiteLine" };

// v91 (11/20/26): email + password sign-in. The older email-only lookup (SiteLineFind) is retired
// because anyone who knew a client's email could open their projects.
export default function Page() {
  return <ClientSignIn />;
}
