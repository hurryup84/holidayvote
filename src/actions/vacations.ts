"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Participant, Property, Vacation } from "@/lib/types";

export async function createVacation(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("Auth error:", authError.message);
    return { error: `Auth-Fehler: ${authError.message}` };
  }
  if (!user) return { error: "Nicht angemeldet" };

  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) || null;
  const destination = (formData.get("destination") as string) || null;
  const startDate = (formData.get("start_date") as string) || null;
  const endDate = (formData.get("end_date") as string) || null;

  if (!name?.trim()) {
    return { error: "Name ist erforderlich" };
  }

  // Use database function to create vacation (bypasses RLS issues in Server Actions)
  const { data: vacation, error } = await supabase.rpc("create_vacation", {
    p_name: name.trim(),
    p_description: description?.trim() || null,
    p_destination: destination?.trim() || null,
    p_start_date: startDate || null,
    p_end_date: endDate || null,
  });

  if (error) {
    console.error("Vacation insert error:", error.message, "Code:", error.code);
    return { error: error.message };
  }

  redirect(`/v/${vacation[0].invite_code}`);
}

export async function joinVacation(inviteCode: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nicht angemeldet" };

  const { data, error } = await supabase.rpc("join_vacation_by_invite", {
    p_invite_code: inviteCode,
  });

  if (error) return { error: error.message };

  revalidatePath(`/v/${inviteCode}`);
  return { success: true, vacationId: data };
}

export async function updateVacation(vacationId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nicht angemeldet" };

  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) || null;
  const destination = (formData.get("destination") as string) || null;
  const startDate = (formData.get("start_date") as string) || null;
  const endDate = (formData.get("end_date") as string) || null;

  const { error } = await supabase.rpc("update_vacation", {
    p_vacation_id: vacationId,
    p_name: name.trim(),
    p_description: description?.trim() || null,
    p_destination: destination?.trim() || null,
    p_start_date: startDate || null,
    p_end_date: endDate || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteVacation(vacationId: string, inviteCode: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nicht angemeldet" };

  const { error } = await supabase.rpc("delete_vacation", {
    p_vacation_id: vacationId,
    p_invite_code: inviteCode,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function getVacationPublic(inviteCode: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_vacation_public", {
    p_invite_code: inviteCode,
  });

  if (error || !data?.[0]) return null;
  return data[0];
}

export async function getVacationWithDetails(inviteCode: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: vacation, error } = await supabase
    .from("vacations")
    .select("*")
    .eq("invite_code", inviteCode)
    .single();

  if (error || !vacation) return null;

  const { data: participants } = await supabase
    .from("participants")
    .select("*, profile:profiles(*)")
    .eq("vacation_id", vacation.id);

  const { data: properties } = await supabase
    .from("properties")
    .select(
      `
      *,
      suggester:profiles!properties_suggested_by_fkey(*),
      votes(*, profile:profiles(*)),
      vetoes(*, profile:profiles(*)),
      comments(*, profile:profiles(*))
    `
    )
    .eq("vacation_id", vacation.id);

  const userRole =
    participants?.find((p) => p.user_id === user?.id)?.role ?? null;

  return {
    vacation: vacation as Vacation,
    participants: (participants ?? []) as Participant[],
    properties: (properties ?? []) as Property[],
    userRole,
    userId: user?.id ?? null,
  };
}

export async function getUserVacations() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: participations } = await supabase
    .from("participants")
    .select("vacation_id")
    .eq("user_id", user.id);

  if (!participations?.length) return [];

  const vacationIds = participations.map((p) => p.vacation_id);

  const { data: vacations } = await supabase
    .from("vacations")
    .select("*")
    .in("id", vacationIds)
    .order("created_at", { ascending: false });

  return vacations ?? [];
}