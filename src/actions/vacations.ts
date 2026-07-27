"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { customAlphabet } from "nanoid";
import { createClient } from "@/lib/supabase/server";
import type { Participant, Property, Vacation } from "@/lib/types";

const generateInviteCode = customAlphabet(
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZ",
  8
);

export async function createVacation(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // Debug: check what auth context is being used
  const { data: { session } } = await supabase.auth.getSession();
  console.log("[createVacation] Session exists:", !!session);
  if (session) {
    console.log("[createVacation] Session access_token (first 50):", session.access_token.substring(0, 50));
    // Decode JWT to check claims
    const parts = session.access_token.split('.');
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        console.log("[createVacation] JWT claims:", { sub: payload.sub, email: payload.email, role: payload.role });
      } catch (e) {
        console.log("[createVacation] Failed to decode JWT");
      }
    }
  }

  if (authError) {
    console.error("Auth error:", authError.message);
    return { error: `Auth-Fehler: ${authError.message}` };
  }
  if (!user) return { error: "Nicht angemeldet" };

  // Ensure profile exists (in case trigger didn't fire)
  const { error: ensureProfileError } = await supabase.rpc("ensure_profile", {
    p_user_id: user.id,
    p_email: user.email,
    p_name: user.user_metadata?.name ?? null,
  });
  if (ensureProfileError) {
    console.error("Ensure profile error:", ensureProfileError.message);
    // Continue anyway - profile might already exist
  }

  // Verify profile exists
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) || null;
  const destination = (formData.get("destination") as string) || null;
  const startDate = (formData.get("start_date") as string) || null;
  const endDate = (formData.get("end_date") as string) || null;

  if (!name?.trim()) {
    return { error: "Name ist erforderlich" };
  }

  const inviteCode = generateInviteCode();

  // TEST: Try direct fetch to PostgREST with explicit headers
  const sessionData = await supabase.auth.getSession();
  const session = sessionData.data.session;
  if (session?.access_token) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/vacations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        name: name.trim(),
        description: description?.trim() || null,
        destination: destination?.trim() || null,
        start_date: startDate || null,
        end_date: endDate || null,
        invite_code: inviteCode,
        owner_id: user.id,
      }),
    });
    const data = await res.json();
    console.log("[createVacation] Direct fetch result:", res.status, data);
    if (res.ok && data?.[0]) {
      const vacation = data[0];
      // Insert participant
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/participants`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vacation_id: vacation.id,
          user_id: user.id,
          role: 'owner',
        }),
      });
      redirect(`/v/${vacation.invite_code}`);
    }
    console.error("[createVacation] Direct fetch failed:", res.status, data);
  }

  const { data: vacation, error } = await supabase
    .from("vacations")
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
      destination: destination?.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
      invite_code: inviteCode,
      owner_id: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("Vacation insert error:", error.message, "Code:", error.code);
    return { error: error.message };
  }

  const { error: participantError } = await supabase
    .from("participants")
    .insert({
      vacation_id: vacation.id,
      user_id: user.id,
      role: "owner",
    });

  if (participantError) return { error: participantError.message };

  redirect(`/v/${vacation.invite_code}`);
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

  const { error } = await supabase
    .from("vacations")
    .update({
      name: name.trim(),
      description: description?.trim() || null,
      destination: destination?.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
    })
    .eq("id", vacationId)
    .eq("owner_id", user.id);

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

  const { error } = await supabase
    .from("vacations")
    .delete()
    .eq("id", vacationId)
    .eq("owner_id", user.id);

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