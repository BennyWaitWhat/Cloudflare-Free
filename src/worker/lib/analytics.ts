import type { Bindings } from "../env";

/**
 * One Workers Analytics Engine data point per product event.
 * blob1 = event, blob2 = detail, blob3 = country; index = user id or "anon".
 */
export function track(
  env: Bindings,
  event: string,
  details: { detail?: string; country?: string | null; userId?: string | null; value?: number } = {},
): void {
  try {
    env.EVENTS.writeDataPoint({
      blobs: [event, details.detail ?? "", details.country ?? ""],
      doubles: [details.value ?? 1],
      indexes: [details.userId ?? "anon"],
    });
  } catch (error) {
    console.warn("analytics write failed", error);
  }
}
