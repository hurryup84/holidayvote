"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/actions/geocode";

export async function updateHomeLocation(
  formData: FormData
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nicht angemeldet" };

  const address = (formData.get("address") as string)?.trim();

  if (!address) {
    // Clear home location
    const { error } = await supabase
      .from("profiles")
      .update({ home_lat: null, home_lng: null })
      .eq("id", user.id);

    if (error) return { error: error.message };
    revalidatePath("/dashboard");
    return { success: true };
  }

  // Geocode the address
  const coords = await geocodeAddress(address);
  if (!coords) {
    return { error: "Adresse konnte nicht gefunden werden" };
  }

  // Save lat/lng to profile
  const { error } = await supabase
    .from("profiles")
    .update({ home_lat: coords.lat, home_lng: coords.lng })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/v/[inviteCode]", "page");
  return { success: true };
}