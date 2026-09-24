// v4.4 crew logins. Crew sign in with just a name ("tony"); behind the scenes that is
// tony@crew.isola-ri.com — an address that never receives mail, it only names the login.
export const CREW_DOMAIN = "crew.isola-ri.com";
export const loginEmail = (s: string) => {
  const v = s.trim().toLowerCase();
  return v.includes("@") ? v : `${v.replace(/[^a-z0-9._-]/g, "")}@${CREW_DOMAIN}`;
};
export const isCrewUser = (u: { app_metadata?: Record<string, any> } | null | undefined) => u?.app_metadata?.role === "crew";
