// discord-announce: posts a Team Hub announcement to the team's Discord channel through a webhook.
// The webhook link lives in public.team_discord, which only this function (service role) can read.
// Only coaches of the team can post; the announcement is read with the coach's own permissions.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

async function send(webhook: string, payload: Record<string, unknown>) {
  const res = await fetch(webhook + "?wait=true", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
  if (res.status === 404 || res.status === 401) throw new Error("Discord says this webhook no longer exists. Make a new one and connect it again.");
  if (res.status === 429) throw new Error("Discord is rate limiting this channel. Try again in a minute.");
  if (!res.ok) throw new Error("Discord error " + res.status + ": " + clip(await res.text().catch(() => ""), 200));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Sign in first." }, 401);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const user = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: u, error: ue } = await user.auth.getUser(auth.slice(7));
    if (ue || !u.user) return json({ error: "Your session expired. Sign in again." }, 401);
    const { data: coach } = await user.rpc("is_coach");
    if (coach !== true) return json({ error: "Only coaches can post to Discord." }, 403);
    const { data: team } = await user.rpc("my_team");
    if (!team) return json({ error: "You're not on a team." }, 400);
    const { data: hook } = await admin.from("team_discord").select("webhook_url, mention").eq("team_id", team).maybeSingle();
    if (!hook) return json({ error: "Discord isn't connected yet. Paste a webhook link in Coach panel → Announcements." }, 400);
    const { data: t } = await admin.from("teams").select("name").eq("id", team).maybeSingle();
    const teamName = t?.name || "Team Hub";
    const origin = req.headers.get("origin") || "";
    const appUrl = /^https:\/\/[a-z0-9.-]+$/i.test(origin) ? origin + "/#/home" : undefined;
    const body = await req.json().catch(() => ({}));

    if (body?.action === "test") {
      await send(hook.webhook_url, { username: teamName + " · Team Hub", allowed_mentions: { parse: [] },
        embeds: [{ title: "Team Hub is connected ✅", description: "Announcements posted in Team Hub will show up in this channel.", color: 0xff4655, url: appUrl, footer: { text: teamName + " · Team Hub" } }] });
      return json({ ok: true });
    }
    if (body?.action === "post") {
      const id = Number(body.id);
      if (!id) return json({ error: "Missing announcement." }, 400);
      // read with the coach's own permissions (RLS), so you can only post what you can see
      const { data: a } = await user.from("announcements").select("id, title, body, team_id, created_at").eq("id", id).maybeSingle();
      if (!a) return json({ error: "That announcement isn't here any more." }, 404);
      const mention = ["@everyone", "@here"].includes(hook.mention) ? hook.mention : "";
      await send(hook.webhook_url, {
        username: teamName + " · Team Hub",
        content: mention || undefined,
        allowed_mentions: { parse: mention ? ["everyone"] : [] },
        embeds: [{ title: clip(String(a.title || "Announcement"), 250), description: clip(String(a.body || ""), 4000) || undefined, color: 0xff4655, url: appUrl,
          footer: { text: teamName + " · Team Hub" }, timestamp: a.created_at || new Date().toISOString() }],
      });
      await admin.from("announcements").update({ discord_sent_at: new Date().toISOString() }).eq("id", a.id);
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
