"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginEmail, isCrewUser } from "@/lib/crew";

export async function login(formData: FormData) {
  // crew type just their name; Mike types his email
  const email = loginEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=1");
  redirect(isCrewUser(data.user) ? "/field" : "/home");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
