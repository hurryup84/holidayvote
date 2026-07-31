"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function castVote(
  propertyId: string,
  vacationId: string,
  inviteCode: string,
  stars: number
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nicht angemeldet" };
  if (stars < 1 || stars > 5) return { error: "Ungültige Bewertung" };

  const { data: existing } = await supabase
    .from("votes")
    .select("*")
    .eq("property_id", propertyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("votes")
      .update({ stars })
      .eq("property_id", propertyId)
      .eq("user_id", user.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("votes").insert({
      property_id: propertyId,
      user_id: user.id,
      stars,
    });
    if (error) return { error: error.message };
  }

  revalidatePath(`/v/${inviteCode}`);
  return { success: true };
}

export async function removeVote(
  propertyId: string,
  inviteCode: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nicht angemeldet" };

  const { error } = await supabase
    .from("votes")
    .delete()
    .eq("property_id", propertyId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/v/${inviteCode}`);
  return { success: true };
}

export async function castVeto(
  propertyId: string,
  vacationId: string,
  inviteCode: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nicht angemeldet" };

  // Check existing veto in this vacation
  const { data: vacationProperties } = await supabase
    .from("properties")
    .select("id")
    .eq("vacation_id", vacationId);

  const propertyIds = vacationProperties?.map((p) => p.id) ?? [];

  const { data: existingVetoes } = await supabase
    .from("vetoes")
    .select("property_id")
    .eq("user_id", user.id)
    .in("property_id", propertyIds);

  const vacationVeto = existingVetoes?.[0];

  if (vacationVeto && vacationVeto.property_id !== propertyId) {
    // Remove old veto first
    await supabase
      .from("vetoes")
      .delete()
      .eq("property_id", vacationVeto.property_id)
      .eq("user_id", user.id);
  }

  if (vacationVeto?.property_id === propertyId) {
    // Toggle off
    await supabase
      .from("vetoes")
      .delete()
      .eq("property_id", propertyId)
      .eq("user_id", user.id);
  } else {
    const { error } = await supabase.from("vetoes").insert({
      property_id: propertyId,
      user_id: user.id,
    });
    if (error) return { error: error.message };
  }

  revalidatePath(`/v/${inviteCode}`);
  return { success: true };
}

export async function addComment(
  propertyId: string,
  inviteCode: string,
  text: string,
  stars?: number | null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nicht angemeldet" };
  if (!text.trim()) return { error: "Kommentar darf nicht leer sein" };

  const { error } = await supabase.from("comments").insert({
    property_id: propertyId,
    user_id: user.id,
    text: text.trim(),
    stars: stars ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath(`/v/${inviteCode}`);
  return { success: true };
}

export async function deleteComment(commentId: string, inviteCode: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nicht angemeldet" };

  const { error } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/v/${inviteCode}`);
  return { success: true };
}

export async function toggleFavorite(
  propertyId: string,
  inviteCode: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nicht angemeldet" };

  // Resolve vacation_id from the property
  const { data: property } = await supabase
    .from("properties")
    .select("vacation_id")
    .eq("id", propertyId)
    .single();

  if (!property) return { error: "Haus nicht gefunden" };

  // Check if this property is already the favorite
  const { data: existing } = await supabase
    .from("favorites")
    .select("*")
    .eq("property_id", propertyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    // Toggle off: remove the favorite
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("property_id", propertyId)
      .eq("user_id", user.id);
    if (error) return { error };
  } else {
    // Set as favorite: first clear any existing favorite in this vacation (one per vacation per user)
    // Find all properties in the same vacation
    const { data: vacationProperties } = await supabase
      .from("properties")
      .select("id")
      .eq("vacation_id", property.vacation_id);

    const vacationPropertyIds =
      vacationProperties?.map((p) => p.id) ?? [];

    // Delete any favorites the user has for properties in the same vacation
    await supabase
      .from("favorites")
      .delete()
      .eq("user_id", user.id)
      .in("property_id", vacationPropertyIds);

    // Then set the new favorite
    const { error } = await supabase.from("favorites").insert({
      property_id: propertyId,
      user_id: user.id,
    });
    if (error) return { error };
  }

  revalidatePath(`/v/${inviteCode}`);
  return { success: true };
}
