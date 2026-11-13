// riot-sync: links a player's Riot ID and pulls their recent VALORANT matches from the HenrikDev API.
// Secrets (Supabase → Edge Functions → Secrets): HENRIK_API_KEY. SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
// The API key never reaches the browser. A player's Riot ID and match list are stored owner-only;
// teammates and coaches only get the riot_summary row (games, K/D, HS%, ACS, ADR).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const REGIONS = ["na", "eu", "ap", "kr", "latam", "br"];
const API = "https://api.henrikdev.xyz";
const TRADE_MS = 3000;

async function henrik(path: string) {
  const key = Deno.env.get("HENRIK_API_KEY");
  if (!key) throw new Error("The HenrikDev API key isn't set up yet (Supabase secret HENRIK_API_KEY).");
  const res = await fetch(API + path, { headers: { Authorization: key, Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  const body = await res.json().catch(() => ({}));
  if (res.status === 404) return { notFound: true, body };
  if (res.status === 429) throw new Error("Riot stats are busy right now (rate limit). Try again in a few minutes.");
  if (!res.ok) throw new Error("Stats service error " + res.status + (body?.errors?.[0]?.message ? ": " + body.errors[0].message : ""));
  return { body };
}

type Kill = { round: number; time_in_round_in_ms: number; killer: { puuid: string; team: string }; victim: { puuid: string; team: string } };

function summarise(match: any, puuid: string) {
  const players: any[] = match.players || [];
  const me = players.find((p) => p.puuid === puuid);
  if (!me) return null;
  const myTeam = me.team_id;
  const team = (match.teams || []).find((t: any) => t.team_id === myTeam) || {};
  const rw = team?.rounds?.won ?? null, rl = team?.rounds?.lost ?? null;
  const rounds = rw != null && rl != null ? rw + rl : (match.rounds || []).length || null;
  const kills: Kill[] = (match.kills || []).filter((k: any) => k?.killer && k?.victim);
  const byRound = new Map<number, Kill[]>();
  for (const k of kills) { const r = Number(k.round); if (!byRound.has(r)) byRound.set(r, []); byRound.get(r)!.push(k); }
  let fk = 0, fd = 0, trades = 0, traded = 0;
  for (const list of byRound.values()) {
    list.sort((a, b) => a.time_in_round_in_ms - b.time_in_round_in_ms);
    const first = list[0];
    if (first.killer.puuid === puuid) fk++;
    if (first.victim.puuid === puuid) fd++;
    for (const k of list) {
      // my trade kills: I kill E within 3 s after E killed a teammate
      if (k.killer.puuid === puuid && list.some((j) => j.killer.puuid === k.victim.puuid && j.victim.team === myTeam && j.victim.puuid !== puuid && k.time_in_round_in_ms - j.time_in_round_in_ms >= 0 && k.time_in_round_in_ms - j.time_in_round_in_ms <= TRADE_MS)) trades++;
      // my deaths that a teammate traded within 3 s
      if (k.victim.puuid === puuid && list.some((j) => j.victim.puuid === k.killer.puuid && j.killer.team === myTeam && j.killer.puuid !== puuid && j.time_in_round_in_ms - k.time_in_round_in_ms >= 0 && j.time_in_round_in_ms - k.time_in_round_in_ms <= TRADE_MS)) traded++;
    }
  }
  const s = me.stats || {};
  const md = match.metadata || {};
  return {
    match_id: md.match_id, started_at: md.started_at || null, map: md.map?.name || null,
    queue: (md.queue?.id || md.queue?.name || "").toString().toLowerCase() || null, agent: me.agent?.name || null,
    won: team?.won ?? null, rounds_won: rw, rounds_lost: rl, rounds,
    score: s.score ?? null, kills: s.kills ?? null, deaths: s.deaths ?? null, assists: s.assists ?? null,
    headshots: s.headshots ?? null, bodyshots: s.bodyshots ?? null, legshots: s.legshots ?? null, damage: s.damage?.dealt ?? null,
    first_kills: fk, first_deaths: fd, trades, traded_deaths: traded,
    detail: { players: players.map((p) => ({ n: p.name, team: p.team_id, me: p.puuid === puuid, agent: p.agent?.name, k: p.stats?.kills, d: p.stats?.deaths, a: p.stats?.assists, s: p.stats?.score })) },
  };
}

async function syncUser(admin: SupabaseClient, userId: string, force = false) {
  const { data: link } = await admin.from("riot_links").select("*").eq("user_id", userId).maybeSingle();
  if (!link) return { linked: false };
  if (!force && link.synced_at && Date.now() - new Date(link.synced_at).getTime() < 5 * 60 * 1000) return { linked: true, skipped: true };
  const { data: prof } = await admin.from("profiles").select("team_id").eq("id", userId).maybeSingle();
  const r = await henrik(`/valorant/v4/by-puuid/matches/${link.region}/pc/${link.puuid}?size=10`);
  const matches: any[] = r.notFound ? [] : (r.body?.data || []);
  const rows = matches.map((m) => summarise(m, link.puuid)).filter((x) => x && x.match_id).map((x) => ({ ...x, user_id: userId, team_id: prof?.team_id ?? null }));
  if (rows.length) {
    const { error } = await admin.from("riot_matches").upsert(rows, { onConflict: "user_id,match_id" });
    if (error) throw new Error(error.message);
  }
  // summary over the last 20 stored games
  const { data: last } = await admin.from("riot_matches").select("*").eq("user_id", userId).order("started_at", { ascending: false }).limit(20);
  const L = last || [];
  const sum = (k: string) => L.reduce((a: number, x: any) => a + (Number(x[k]) || 0), 0);
  const k = sum("kills"), d = sum("deaths"), hits = sum("headshots") + sum("bodyshots") + sum("legshots"), rnds = sum("rounds");
  await admin.from("riot_summary").upsert({
    user_id: userId, team_id: prof?.team_id ?? null, games: L.length, wins: L.filter((x: any) => x.won).length,
    kills: k, deaths: d, assists: sum("assists"), kd: d ? +(k / d).toFixed(2) : k, hs_pct: hits ? +(sum("headshots") / hits).toFixed(3) : null,
    acs: rnds ? +(sum("score") / rnds).toFixed(0) : null, adr: rnds ? +(sum("damage") / rnds).toFixed(0) : null,
    first_kills: sum("first_kills"), first_deaths: sum("first_deaths"), trades: sum("trades"),
    last_game_at: L[0]?.started_at ?? null, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  await admin.from("riot_links").update({ synced_at: new Date().toISOString() }).eq("user_id", userId);
  return { linked: true, new_games: rows.length };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Sign in first." }, 401);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: u, error: ue } = await userClient.auth.getUser(auth.slice(7));
    if (ue || !u.user) return json({ error: "Your session expired. Sign in again." }, 401);
    const uid = u.user.id;
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "link") {
      const raw = String(body.riot_id || "").trim();
      const m = raw.match(/^(.{3,16})#([A-Za-z0-9]{2,5})$/);
      if (!m) return json({ error: "Enter your Riot ID as Name#TAG (for example Fear#NA1)." }, 400);
      const acc = await henrik(`/valorant/v2/account/${encodeURIComponent(m[1])}/${encodeURIComponent(m[2])}`);
      if (acc.notFound || !acc.body?.data?.puuid) return json({ error: "Riot couldn't find that Riot ID. Check the spelling and the tag." }, 404);
      const region = REGIONS.includes(String(acc.body.data.region || "").toLowerCase()) ? String(acc.body.data.region).toLowerCase() : (REGIONS.includes(body.region) ? body.region : "na");
      const { error } = await admin.from("riot_links").upsert({ user_id: uid, riot_name: acc.body.data.name || m[1], riot_tag: acc.body.data.tag || m[2], region, puuid: acc.body.data.puuid, linked_at: new Date().toISOString(), synced_at: null }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      const res = await syncUser(admin, uid, true);
      return json({ ok: true, ...res });
    }
    if (action === "sync") return json({ ok: true, ...(await syncUser(admin, uid, !!body.force)) });
    if (action === "unlink") {
      await admin.from("riot_links").delete().eq("user_id", uid);
      return json({ ok: true });
    }
    if (action === "sync_team") {
      const { data: staff } = await userClient.rpc("is_staff");
      if (staff !== true) return json({ error: "Only team staff can refresh everyone." }, 403);
      const { data: team } = await userClient.rpc("my_team");
      const { data: members } = await admin.from("profiles").select("id").eq("team_id", team);
      const ids = (members || []).map((x: any) => x.id);
      const { data: links } = await admin.from("riot_links").select("user_id").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      let done = 0, failed = 0;
      for (const l of (links || []).slice(0, 15)) { try { await syncUser(admin, l.user_id, true); done++; } catch { failed++; } }
      return json({ ok: true, synced: done, failed });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
