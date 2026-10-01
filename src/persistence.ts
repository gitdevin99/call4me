import type { AppData } from "./model";
// Search-provider content stays in memory. Persist the user's request and place ID,
// then re-query on return rather than making a permanent business-directory cache.
export function persistentPreview(data: AppData): AppData {
  return {
    ...data,
    threads: data.threads.map((thread) => {
      const discovery = thread.discovery;
      if (
        !discovery ||
        discovery.mode === "demo" ||
        discovery.selected?.source === "demo"
      )
        return thread;
      if (!discovery.candidates && !discovery.selected) return thread;
      return {
        ...thread,
        title: discovery.intent.business || "A new call",
        status: thread.status === "ready" ? "draft" : thread.status,
        plan: {
          ...thread.plan,
          business: discovery.intent.business,
          phone: "",
        },
        transcript: undefined,
        discovery: {
          intent: discovery.intent,
          placeId: discovery.selected?.id,
          error: "Search again to refresh business details.",
        },
      };
    }),
  };
}
