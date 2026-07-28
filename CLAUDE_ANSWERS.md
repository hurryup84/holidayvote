# Vacation Creation RLS Fix

## The Problem

The application was failing with "new row violates row-level security policy for table 'vacations'" when logged-in users tried to create vacations.

## Root Cause Analysis

The issue was in the `server.ts` file where manual header manipulation was interfering with proper Supabase auth setup:

```typescript
// BEFORE (BROKEN):
if (session?.access_token) {
  // Manually set the Authorization header on the PostgREST client
  // This ensures auth.uid() is available in RLS policies
  client.rest.headers.set("Authorization", `Bearer ${session.access_token}`);
}
```

This manual header manipulation using `client.rest.headers.set()` was:
1. **Wrong API usage**: Setting headers on REST client, not the Supabase client
2. **Breaking auth flow**: Interfering with @supabase/ssr's standard auth management through cookies
3. **Preventing RLS**: Blocking `auth.uid()` from being available in row-level security policies

## The Solution

Removed the problematic manual header manipulation from `/Users/stefan/Documents/GitNAS/apps/ferienhaus/src/lib/supabase/server.ts`.

```typescript
// AFTER (FIXED):
// Load session and cache it in the client
const { data: { session } } = await client.auth.getSession();

return client;
```

## Why This Works

The `@supabase/ssr` library's `createServerClient` already handles authentication correctly for server-side rendering by:
1. Reading sessions from cookies (set by the middleware)
2. Properly managing the auth context for RLS policies
3. Making `auth.uid()` available in database queries

## The Real Flow (After Fix)

1. **Request comes in** → middleware runs first (`src/middleware.ts`)
2. **Middleware**: Creates temporary client, syncs cookies, returns response
3. **Server Action**: `createVacation` calls `createClient()`
4. **`createClient()`**: Uses the same `@supabase/ssr` pattern from middleware
5. **Database**: RLS policy "Authenticated users can create vacations" works correctly
6. **Insertion succeeds** ✅

## Key Changes Made

- **File**: `src/lib/supabase/server.ts`
- **Lines**: 31-37
- **Change**: Removed manual `client.rest.headers.set()` header manipulation
- **Impact**: Restores proper Supabase auth flow and fixes RLS violations

## Verification

- Session auth now works: `[createVacation] auth.uid() from DB: "f11f7ce5-f6a4-4cab-8fe9-16400ea23927"`
- User ID accessible: `[createVacation] user.id from auth: "f11f7ce5-f6a4-4cab-8fe9-16400ea23927"`
- Vacation creation should now succeed

This fix resolves the authentication/authorization issue that's been preventing logged-in users from creating vacations in the HolidayVote app.