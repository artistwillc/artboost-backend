/**
 * Verify that a scheduling request belongs to the signed-in Supabase user.
 * Supply a Supabase client from the trusted server, not from the request.
 * Never accept userId from a request body as authentication.
 */
export async function verifySchedulingUser(supabase, authorization, claimedUserId) {
  if (typeof authorization !== "string") return { ok: false, status: 401, reason: "Authentication required" };
  const match = /^Bearer[ \t]+([^\s]+)$/i.exec(authorization.trim());
  if (!match) return { ok: false, status: 401, reason: "Authentication required" };
  let data, error;
  try {
    ({ data, error } = await supabase.auth.getUser(match[1]));
  } catch {
    return { ok: false, status: 401, reason: "Invalid or expired session" };
  }
  if (error || typeof data?.user?.id !== "string" || !data.user.id) {
    return { ok: false, status: 401, reason: "Invalid or expired session" };
  }
  if (typeof claimedUserId !== "string" || !claimedUserId || data.user.id !== claimedUserId) {
    return { ok: false, status: 403, reason: "Account mismatch" };
  }
  return { ok: true, userId: data.user.id };
}
