"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { detectProvider, isValidUrl } from "@/lib/utils";
import type { PropertyStatus } from "@/lib/types";

export async function addProperty(vacationId: string, inviteCode: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nicht angemeldet" };

  const url = (formData.get("url") as string)?.trim();
  if (!url || !isValidUrl(url)) {
    return { error: "Bitte eine gültige URL eingeben" };
  }

  const { data: duplicate } = await supabase
    .from("properties")
    .select("id")
    .eq("vacation_id", vacationId)
    .eq("url", url)
    .maybeSingle();

  if (duplicate) {
    return { error: "Dieses Haus ist bereits in der Liste" };
  }

  const title = (formData.get("title") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim() || null;
  const imageUrl = (formData.get("image_url") as string)?.trim() || null;
  const provider = (formData.get("provider") as string)?.trim() || detectProvider(url);
  const priceRaw = formData.get("price") as string;
  const price = priceRaw ? parseFloat(priceRaw) : null;
  const beds = formData.get("beds") ? parseInt(formData.get("beds") as string) : null;
  const bedrooms = formData.get("bedrooms") ? parseInt(formData.get("bedrooms") as string) : null;
  const bathrooms = formData.get("bathrooms") ? parseFloat(formData.get("bathrooms") as string) : null;
  const hasPool = formData.get("has_pool") === "on";

  const { error } = await supabase.from("properties").insert({
    vacation_id: vacationId,
    url,
    title,
    description,
    image_url: imageUrl,
    provider,
    price,
    beds,
    bedrooms,
    bathrooms,
    has_pool: hasPool,
    suggested_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath(`/v/${inviteCode}`);
  return { success: true };
}

export async function updatePropertyStatus(
  propertyId: string,
  inviteCode: string,
  status: PropertyStatus
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nicht angemeldet" };

  const { data: property } = await supabase
    .from("properties")
    .select("vacation_id")
    .eq("id", propertyId)
    .single();

  if (!property) return { error: "Haus nicht gefunden" };

  const { data: participant } = await supabase
    .from("participants")
    .select("role")
    .eq("vacation_id", property.vacation_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (participant?.role !== "owner") {
    return { error: "Nur der Owner kann den Status ändern" };
  }

  const { error } = await supabase
    .from("properties")
    .update({ status })
    .eq("id", propertyId);

  if (error) return { error: error.message };

  revalidatePath(`/v/${inviteCode}`);
  return { success: true };
}

export async function deleteProperty(
  propertyId: string,
  inviteCode: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nicht angemeldet" };

  const { error } = await supabase
    .from("properties")
    .delete()
    .eq("id", propertyId);

  if (error) return { error: error.message };

  revalidatePath(`/v/${inviteCode}`);
  return { success: true };
}

export async function updateProperty(
  propertyId: string,
  inviteCode: string,
  formData: FormData
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nicht angemeldet" };

  const priceRaw = formData.get("price") as string;
  const price = priceRaw ? parseFloat(priceRaw) : null;
  const beds = formData.get("beds") ? parseInt(formData.get("beds") as string) : null;
  const bedrooms = formData.get("bedrooms") ? parseInt(formData.get("bedrooms") as string) : null;
  const bathrooms = formData.get("bathrooms") ? parseFloat(formData.get("bathrooms") as string) : null;
  const hasPool = formData.get("has_pool") === "on";
  const title = (formData.get("title") as string)?.trim() || null;

  const { error } = await supabase
    .from("properties")
    .update({
      title,
      price,
      beds,
      bedrooms,
      bathrooms,
      has_pool: hasPool,
    })
    .eq("id", propertyId);

  if (error) return { error: error.message };

  revalidatePath(`/v/${inviteCode}`);
  return { success: true };
}
