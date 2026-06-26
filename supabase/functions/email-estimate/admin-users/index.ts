// Supabase Edge Function — admin-users
//
// Admin-only operations on the profiles table + auth.users. Used by the
// in-app "Manage Users" modal so Mo never has to touch SQL to onboard or
// manage agents.
//
// SECURITY: every action verifies the caller is an admin by reading the
// JWT in the Authorization header, finding the caller's profile, and
// confirming role='admin' AND suspended=false. Non-admins get 403.
//
// Once verified, the function uses the SUPABASE_SERVICE_ROLE_KEY to
// perform privileged operations (creating auth users, inserting profile
// rows). The service role bypasses RLS — that's why this function MUST
// gate every action behind the admin check.
//
// Actions (POST body: { action, ...payload }):
//   • action='list'    → returns all profiles + last sign in
//   • action='invite'  → creates auth user + profile, sends magic link
//   • action='update'  → updates a profile's role / features / expiry / suspended
//   • action='delete'  → permanently deletes auth user + profile row
//
// DEPLOY:
//   supabase functions deploy admin-users

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/* Verify the caller is an admin. Returns their user_id on success,
   throws on failure. The JWT comes from the Authorization header
   (Supabase JS client attaches it automatically). */
async function requireAdmin(req: Request, supa: SupabaseClient): Promise<string> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Missing auth token");

  // Decode the caller's identity from the JWT
  const { data: { user }, error } = await supa.auth.getUser(token);
  if (error || !user) throw new Error("Invalid auth token");

  // Look up their profile to confirm admin
  const { data: profile, error: pErr } = await supa
    .from("profiles")
    .select("role, suspended")
    .eq("id", user.id)
    .maybeSingle();
  if (pErr) throw new Error("Profile lookup failed: " + pErr.message);
  if (!profile) throw new Error("No profile — admin access denied");
  if (profile.suspended) throw new Error("Your account is suspended");
  if (profile.role !== "admin") throw new Error("Admin role required");

  return user.id;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any;
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const action = String(body?.action || "").trim();
  if (!action) return json({ error: "action is required" }, 400);

  const supa = getServiceClient();

  let callerId: string;
  try { callerId = await requireAdmin(req, supa); }
  catch (e) { return json({ error: String((e as Error).message) }, 403); }

  try {
    if (action === "list")   return await listUsers(supa);
    if (action === "invite") return await inviteUser(supa, body, callerId);
    if (action === "update") return await updateUser(supa, body, callerId);
    if (action === "delete") return await deleteUser(supa, body, callerId);
    return json({ error: "Unknown action: " + action }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message) }, 500);
  }
});

// ---------- Actions ----------

async function listUsers(supa: SupabaseClient): Promise<Response> {
  // Profiles + a left-join to auth.users for last_sign_in_at
  const { data: profiles, error: pErr } = await supa
    .from("profiles")
    .select("id, email, full_name, brokerage, phone, role, features, " +
            "subscription_starts_at, subscription_expires_at, suspended, created_at")
    .order("created_at", { ascending: false });
  if (pErr) throw new Error(pErr.message);

  // Get last_sign_in_at for each user from auth.users (requires admin API)
  const userIds = (profiles || []).map(p => p.id);
  let lastSignIns: Record<string, string | null> = {};
  if (userIds.length > 0) {
    try {
      const { data: { users } } = await supa.auth.admin.listUsers({ perPage: 1000 });
      (users || []).forEach(u => {
        if (userIds.includes(u.id)) {
          lastSignIns[u.id] = u.last_sign_in_at || null;
        }
      });
    } catch (e) {
      // Non-fatal — we just won't show last sign in
      console.warn("auth.admin.listUsers failed:", e);
    }
  }

  const result = (profiles || []).map(p => ({
    ...p,
    last_sign_in_at: lastSignIns[p.id] || null,
  }));
  return json({ users: result });
}

async function inviteUser(supa: SupabaseClient, body: any, callerId: string): Promise<Response> {
  const email = String(body.email || "").trim().toLowerCase();
  const full_name = String(body.full_name || "").trim();
  const brokerage = String(body.brokerage || "").trim() || null;
  const phone = String(body.phone || "").trim() || null;
  const role = String(body.role || "agent").trim();
  const features = body.features || {};
  const subscription_expires_at = body.subscription_expires_at || null;

  if (!email || !email.includes("@")) return json({ error: "Valid email required" }, 400);
  if (!full_name)                     return json({ error: "Full name required" }, 400);
  if (!["admin", "staff", "agent"].includes(role)) return json({ error: "Invalid role" }, 400);

  // Create or get the auth user. Supabase's inviteUserByEmail sends a
  // magic-link sign-in to the address; if they already exist it errors,
  // so we fall back to looking them up by email.
  let userId: string | null = null;
  const { data: inviteData, error: inviteErr } = await supa.auth.admin.inviteUserByEmail(email, {
    data: { full_name, invited_by: callerId },
  });
  if (inviteErr) {
    // If error is "already registered", look up the existing user
    const msg = (inviteErr.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exist")) {
      const { data: { users } } = await supa.auth.admin.listUsers({ perPage: 1000 });
      const existing = (users || []).find(u => (u.email || "").toLowerCase() === email);
      if (!existing) {
        return json({ error: "User already exists but not found: " + inviteErr.message }, 500);
      }
      userId = existing.id;
    } else {
      return json({ error: "Invite failed: " + inviteErr.message }, 500);
    }
  } else {
    userId = inviteData.user?.id || null;
  }
  if (!userId) return json({ error: "Could not determine user_id" }, 500);

  // Upsert the profile row
  const { error: upsertErr } = await supa
    .from("profiles")
    .upsert({
      id: userId,
      email,
      full_name,
      brokerage,
      phone,
      role,
      features,
      subscription_starts_at: new Date().toISOString(),
      subscription_expires_at,
      suspended: false,
    }, { onConflict: "id" });
  if (upsertErr) return json({ error: "Profile upsert failed: " + upsertErr.message }, 500);

  return json({ ok: true, user_id: userId, invited_email: email });
}

async function updateUser(supa: SupabaseClient, body: any, _callerId: string): Promise<Response> {
  const user_id = String(body.user_id || "").trim();
  const updates = body.updates || {};
  if (!user_id) return json({ error: "user_id required" }, 400);

  // Only allow updating these whitelisted fields
  const allowed: any = {};
  if (typeof updates.full_name === "string") allowed.full_name = updates.full_name;
  if (typeof updates.brokerage === "string") allowed.brokerage = updates.brokerage;
  if (typeof updates.phone === "string")     allowed.phone = updates.phone;
  if (typeof updates.role === "string" && ["admin","staff","agent"].includes(updates.role)) {
    allowed.role = updates.role;
  }
  if (typeof updates.features === "object" && updates.features !== null) {
    allowed.features = updates.features;
  }
  if (typeof updates.subscription_expires_at === "string" || updates.subscription_expires_at === null) {
    allowed.subscription_expires_at = updates.subscription_expires_at;
  }
  if (typeof updates.suspended === "boolean") allowed.suspended = updates.suspended;
  if (Object.keys(allowed).length === 0) {
    return json({ error: "No valid fields to update" }, 400);
  }
  allowed.updated_at = new Date().toISOString();

  const { error } = await supa.from("profiles").update(allowed).eq("id", user_id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

async function deleteUser(supa: SupabaseClient, body: any, callerId: string): Promise<Response> {
  const user_id = String(body.user_id || "").trim();
  if (!user_id) return json({ error: "user_id required" }, 400);
  if (user_id === callerId) return json({ error: "Cannot delete your own account" }, 400);

  // Delete profile row (cascades won't affect auth.users)
  const { error: pErr } = await supa.from("profiles").delete().eq("id", user_id);
  if (pErr) return json({ error: "Profile delete failed: " + pErr.message }, 500);

  // Delete auth.users row
  const { error: aErr } = await supa.auth.admin.deleteUser(user_id);
  if (aErr) {
    // Profile is already gone — log the auth error but don't fail
    console.warn("auth.admin.deleteUser failed:", aErr.message);
  }

  return json({ ok: true });
}
