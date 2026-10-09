/**
 * Explicit rollout gate for atomic campaign scheduling.
 * Keeps existing iOS/Android/web clients on legacy behavior until operators
 * separately verify the database migration and all client auth headers.
 */
export function atomicSchedulingEnabled(env = process.env) {
  return env.ENABLE_ATOMIC_SCHEDULE_QUOTA === "true" &&
    env.ATOMIC_SCHEDULE_MIGRATION_VERIFIED === "true" &&
    env.SCHEDULE_CLIENT_AUTH_VERIFIED === "true";
}
