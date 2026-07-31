"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "./geocode";

export async function signInWithMagicLink(formData: FormData) {
  const email = formData.get("email") as string;
  const redirectTo = (formData.get("redirectTo") as string) || "/dashboard";

  if (!email) {
    return { error: "E-Mail ist erforderlich" };
  }

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function updateProfileName(name: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nicht angemeldet" };

  const { error } = await supabase
    .from("profiles")
    .update({ name })
    .eq("id", user.id);

  if (error) return { error: error.message };
  return { success: true };
}

export async function updateProfileHomeLocation(address: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Nicht angemeldet" };

  // Geocode the address
  const geoResult = await geocodeAddress(address);
  if (!geoResult.success || !geoResult.lat || !geoResult.lng) {
    return { error: geoResult.error || "Adresse konnte nicht gefunden werden" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      home_lat: geoResult.lat,
      home_lng: geoResult.lng,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };
  return { success: true, lat: geoResult.lat, lng: geoResult.lng };
}
