/**
 * Verify that a scheduling request belongs to the signed-in Supabase user.
 * Supply a Supabase client from the trusted server, not from the request.
 * Never accept userId from a request body as authentication.
 */
export async function verifySchedulingUser(supabase, authorization, claimedUserId) {
  const match = /^Bearer\s+([^\s]+)$/i.exec(String(authorization || "").trim());
  if (!match) return { ok: false, status: 401, reason: "Authentication required" };
  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data?.user?.id) {
    return { ok: false, status: 401, reason: "Invalid or expired session" };
  }
  if (!claimedUserId || data.user.id !== claimedUserId) {
    return { ok: false, status: 403, reason: "Account mismatch" };
  }
  return { ok: true, userId: data.user.id };
}
