import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { loadClient } from "./supabase/browser";

// One realtime channel per topic, shared by everything on the page that listens to it and kept for a moment after
// the last listener leaves, so going back and forth between boards doesn't tear it down and rebuild it.
// supabase-js hands back the existing channel for a topic until that channel has finished leaving, and removes
// every channel with the topic once it has. So a new channel waits for the old one to be gone first

export type Change = RealtimePostgresChangesPayload<Record<string, unknown>>;

export type Listener = {
  change: (table: string, payload: Change) => void;
  /** The channel is live. `again` means it had been live before and dropped, so changes may have been missed */
  joined?: (again: boolean) => void;
  presence?: (state: Record<string, unknown[]>) => void;
};

export type Watch = { table: string; filter?: string };

type Feed = {
  listeners: Set<Listener>;
  channel: RealtimeChannel | null;
  joined: boolean;
  everJoined: boolean;
  presence: Record<string, unknown[]> | null;
  linger: ReturnType<typeof setTimeout> | null;
  closed: boolean;
};

const LINGER = 15_000;
const feeds = new Map<string, Feed>();
const leaving = new Map<string, Promise<unknown>>();

export function listen(
  topic: string,
  watch: Watch[],
  listener: Listener,
  presence?: { key: string; me: Record<string, unknown> },
): () => void {
  let feed = feeds.get(topic);
  if (!feed) {
    feed = { listeners: new Set(), channel: null, joined: false, everJoined: false, presence: null, linger: null, closed: false };
    feeds.set(topic, feed);
    void open(topic, feed, watch, presence);
  }
  const f = feed;
  if (f.linger) clearTimeout(f.linger);
  f.linger = null;
  f.listeners.add(listener);
  // Already live: the newcomer catches up on whatever happened before it started listening
  if (f.joined) listener.joined?.(false);
  if (f.presence) listener.presence?.(f.presence);
  return () => {
    f.listeners.delete(listener);
    if (!f.listeners.size) f.linger = setTimeout(() => close(topic, f), LINGER);
  };
}

async function open(topic: string, feed: Feed, watch: Watch[], presence?: { key: string; me: Record<string, unknown> }) {
  const client = await loadClient();
  await leaving.get(topic);
  await client.realtime.setAuth().catch(() => {});
  if (feed.closed) return;
  const channel = client.channel(topic, presence ? { config: { presence: { key: presence.key } } } : undefined);
  for (const w of watch)
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: w.table, ...(w.filter ? { filter: w.filter } : {}) },
      (payload: Change) => feed.listeners.forEach((l) => l.change(w.table, payload)),
    );
  if (presence)
    channel.on("presence", { event: "sync" }, () => {
      feed.presence = channel.presenceState();
      feed.listeners.forEach((l) => l.presence?.(feed.presence!));
    });
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      const again = feed.everJoined;
      feed.joined = true;
      feed.everJoined = true;
      if (presence) void channel.track(presence.me);
      feed.listeners.forEach((l) => l.joined?.(again));
    } else feed.joined = false;
  });
  feed.channel = channel;
}

function close(topic: string, feed: Feed) {
  if (feeds.get(topic) === feed) feeds.delete(topic);
  feed.closed = true;
  feed.joined = false;
  const channel = feed.channel;
  if (!channel) return;
  const gone = loadClient()
    .then((client) => client.removeChannel(channel))
    .catch(() => {})
    .finally(() => {
      if (leaving.get(topic) === gone) leaving.delete(topic);
    });
  leaving.set(topic, gone);
}

/** Whether a topic's channel is live right now */
export const isLive = (topic: string) => feeds.get(topic)?.joined ?? false;
