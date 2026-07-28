import { NextRequest, NextResponse } from "next/server";

export async function createServerClientProxy(request: NextRequest) {
  // This function acts as a proxy to create a server client
  // In App Router, we need to ensure the session is carried through request headers

  const response = NextResponse.next();

  // Create the supabase client for the middleware to modify cookies
  const { createServerClient } = await import("@supabase/ssr");

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Get the user from the session
  const { data } = await supabase.auth.getUser();

  // The session is now in the response headers for App Router to use
  // App Router will read this response in getServerUser()

  return response;
}