export type QueuedRequest = {
  id: string;
  url: string;
  method: "POST" | "PATCH" | "DELETE";
  body: Record<string, unknown>;
  createdAt: string;
};

const QUEUE_KEY = "actos_offline_queue_v1";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getOfflineQueue(): QueuedRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedRequest[]) : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineRequest(
  item: Omit<QueuedRequest, "id" | "createdAt">
): QueuedRequest {
  const queue = getOfflineQueue();
  const entry: QueuedRequest = {
    ...item,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  queue.push(entry);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new Event("actos-queue-updated"));
  return entry;
}

export async function flushOfflineQueue(getToken: () => Promise<string>): Promise<number> {
  if (typeof window === "undefined" || !navigator.onLine) return 0;
  const queue = getOfflineQueue();
  if (queue.length === 0) return 0;

  const token = await getToken();
  const remaining: QueuedRequest[] = [];
  let syncedCount = 0;

  for (const item of queue) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(item.body),
      });
      if (res.ok) syncedCount++;
      else remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }

  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  window.dispatchEvent(new Event("actos-queue-updated"));
  return syncedCount;
}
