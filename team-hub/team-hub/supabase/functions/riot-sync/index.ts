// riot-sync: links a player's Riot ID and pulls their recent VALORANT matches from the HenrikDev API.
// Secrets (Supabase → Edge Functions → Secrets): HENRIK_API_KEY. SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
// The API key never reaches the browser. A player's Riot ID and match list are stored owner-only;
// teammates and coaches only get the riot_summary row (games, K/D, HS%, win %, main agents/role, rank).
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
// Only real 5v5 games count toward K/D, HS%, win % and agents (no deathmatch / TDM / arcade modes).
const STANDARD = new Set(["competitive", "unrated", "premier", "custom", "swiftplay"]);
const AGENT_ROLE: Record<string, string> = {
  Jett: "Duelist", Phoenix: "Duelist", Reyna: "Duelist", Raze: "Duelist", Yoru: "Duelist", Neon: "Duelist", Iso: "Duelist", Waylay: "Duelist",
  Sova: "Initiator", Breach: "Initiator", Skye: "Initiator", "KAY/O": "Initiator", Fade: "Initiator", Gekko: "Initiator", Tejo: "Initiator",
  Brimstone: "Controller", Omen: "Controller", Viper: "Controller", Astra: "Controller", Harbor: "Controller", Clove: "Controller",
  Sage: "Sentinel", Cypher: "Sentinel", Killjoy: "Sentinel", Chamber: "Sentinel", Deadlock: "Sentinel", Vyse: "Sentinel", Veto: "Sentinel",
};

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
    events: playerEvents(match, puuid),
  };
}

async function fetchRank(region: string, puuid: string) {
  // v3 first, v2 as a fallback (older response shape)
  try {
    const r = await henrik(`/valorant/v3/by-puuid/mmr/${region}/pc/${puuid}`);
    const d = r.body?.data;
    if (d && (d.current || d.peak)) {
      return { rank: d.current?.tier?.name || null, rank_rr: d.current?.rr ?? null, peak_rank: d.peak?.tier?.name || null };
    }
  } catch (_) { /* try v2 */ }
  try {
    const r = await henrik(`/valorant/v2/by-puuid/mmr/${region}/${puuid}`);
    const d = r.body?.data;
    if (d) return { rank: d.current_data?.currenttierpatched || null, rank_rr: d.current_data?.ranking_in_tier ?? null, peak_rank: d.highest_rank?.patched_tier || null };
  } catch (_) { /* no rank */ }
  return null;
}


// ---------------------------------------------------------------- scrims (custom games)
// A custom game counts as a team scrim when at least SCRIM_MIN linked players from the same Team Hub team
// were on the same side. Scrims are often played with "play out all rounds" on, so the real result stops
// at the round where a team reached 13 (win by 2 in overtime); later rounds don't count.
const SCRIM_MIN = 3;
const pidOf = (p: any) => String(p?.puuid || "");
const teamOf = (p: any) => String(p?.team_id ?? p?.team ?? "");
function roundEnd(r: any): string | null {
  const t = String(r?.result || r?.end_type || "").toLowerCase();
  if (t.includes("elim")) return "elim";
  if (t.includes("deton") || t.includes("exploded")) return "det";
  if (t.includes("defus")) return "defuse";
  if (t.includes("time") || t.includes("expir")) return "time";
  if (t.includes("surrender")) return "ff";
  return t ? t.slice(0, 12) : null;
}
function etDate(iso: string) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso)); } catch { return String(iso || "").slice(0, 10); }
}
// eco / semi (force or half buy) / full, from the average loadout value of each side
export function buyTypes(round: any, i: number, teamById: Map<string, string>): Record<string, string> | null {
  if (i === 0 || i === 12) return { red: "pistol", blue: "pistol" };
  const st: any[] = round?.stats || round?.player_stats || [];
  const tot: Record<string, number[]> = { red: [], blue: [] };
  for (const s of st) {
    const id = pidOf(s.player || s);
    const team = String(s.player?.team || s.team || teamById.get(id) || "").toLowerCase();
    const v = Number(s.economy?.loadout_value ?? s.economy?.loadoutValue);
    if ((team === "red" || team === "blue") && !isNaN(v)) tot[team].push(v);
  }
  const kind = (vals: number[]) => { if (!vals.length) return null; const a = vals.reduce((x, y) => x + y, 0) / vals.length; return a < 1500 ? "eco" : a < 3300 ? "semi" : "full"; };
  const red = kind(tot.red), blue = kind(tot.blue);
  if (!red && !blue) return null;
  return { red: red || "", blue: blue || "" };
}
export function scrimResult(match: any, ourTeam: string) {
  const rounds: any[] = match.rounds || [];
  const startAtk = ourTeam.toLowerCase() === "red"; // Red attacks first
  let a = 0, b = 0, decided = rounds.length;
  const out: any[] = [];
  const teamById = new Map<string, string>((match.players || []).map((p: any) => [pidOf(p), teamOf(p).toLowerCase()]));
  // earliest kill in each round (kill rounds can be 0- or 1-based depending on the API version)
  const kills: any[] = (match.kills || []).filter((k: any) => k?.killer && k?.victim);
  const base = kills.length && kills.every((k: any) => Number(k.round) >= 1) ? 1 : 0;
  const firstKills = new Map<number, any>();
  for (const k of kills) {
    const ri = Number(k.round) - base; const cur = firstKills.get(ri);
    if (!cur || (k.time_in_round_in_ms || 0) < (cur.time_in_round_in_ms || 0)) firstKills.set(ri, k);
  }
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    const winner = String(r?.winning_team ?? r?.winningTeam ?? "");
    const w = winner.toLowerCase() === ourTeam.toLowerCase();
    if (w) a++; else b++;
    const firstHalf = i < 12, ot = i >= 24;
    const atk = ot ? ((i - 24) % 2 === 0 ? startAtk : !startAtk) : (firstHalf ? startAtk : !startAtk);
    const row: any = { n: i + 1, w, side: atk ? "A" : "D", end: roundEnd(r) };
    // first kill of the round (us / them) and who got it
    const fk = firstKills.get(i);
    if (fk) { row.fk = teamOf(fk.killer).toLowerCase() === ourTeam.toLowerCase() ? "us" : "them"; row.fkp = fk.killer?.name || null; row.fdp = fk.victim?.name || null; }
    // what each side bought (average loadout value)
    const bt = buyTypes(r, i, teamById);
    if (bt) { row.buy = bt[ourTeam.toLowerCase()] || null; row.obuy = bt[ourTeam.toLowerCase() === "red" ? "blue" : "red"] || null; }
    const site = r?.plant?.site || r?.plant_events?.plant_site || null;
    if (site) row.site = String(site).toUpperCase();
    out.push(row);
    if ((a >= 13 || b >= 13) && Math.abs(a - b) >= 2) { decided = i + 1; break; }
  }
  const R = out.length;
  const cnt = (f: (x: any) => boolean) => out.filter(f).length;
  return {
    rounds: out, R, decided: R > 0 && (a >= 13 || b >= 13), won: a, lost: b, start_side: startAtk ? "Offense" : "Defense",
    atk_won: cnt((x) => x.side === "A" && x.w), atk_lost: cnt((x) => x.side === "A" && !x.w),
    def_won: cnt((x) => x.side === "D" && x.w), def_lost: cnt((x) => x.side === "D" && !x.w),
    pistols_won: (out[0]?.w ? 1 : 0) + (out[12]?.w ? 1 : 0),
  };
}
// per-player stats over the first R rounds only
export function scrimPlayerStats(match: any, ourTeam: string, R: number) {
  const players: any[] = (match.players || []).filter((p: any) => teamOf(p).toLowerCase() === ourTeam.toLowerCase());
  const kills: any[] = (match.kills || []).filter((k: any) => k?.killer && k?.victim);
  const base = kills.length && kills.every((k: any) => Number(k.round) >= 1) ? 1 : 0; // 0- or 1-based rounds
  const inR = (k: any) => Number(k.round) - base < R;
  const K = kills.filter(inR);
  const byRound = new Map<number, any[]>();
  for (const k of K) { const r = Number(k.round); if (!byRound.has(r)) byRound.set(r, []); byRound.get(r)!.push(k); }
  for (const l of byRound.values()) l.sort((x, y) => (x.time_in_round_in_ms || 0) - (y.time_in_round_in_ms || 0));
  const total = (match.rounds || []).length;
  return players.map((p) => {
    const id = pidOf(p);
    let k = 0, d = 0, a = 0, fk = 0, fd = 0, tr = 0, trd = 0;
    for (const x of K) {
      if (pidOf(x.killer) === id) k++;
      if (pidOf(x.victim) === id) d++;
      if ((x.assistants || []).some((s: any) => pidOf(s) === id)) a++;
    }
    for (const l of byRound.values()) {
      if (pidOf(l[0].killer) === id) fk++;
      if (pidOf(l[0].victim) === id) fd++;
      for (const x of l) {
        const t = x.time_in_round_in_ms || 0;
        if (pidOf(x.killer) === id && l.some((j) => pidOf(j.killer) === pidOf(x.victim) && teamOf(j.victim).toLowerCase() === ourTeam.toLowerCase() && pidOf(j.victim) !== id && t - (j.time_in_round_in_ms || 0) >= 0 && t - (j.time_in_round_in_ms || 0) <= TRADE_MS)) tr++;
        if (pidOf(x.victim) === id && l.some((j) => pidOf(j.victim) === pidOf(x.killer) && teamOf(j.killer).toLowerCase() === ourTeam.toLowerCase() && pidOf(j.killer) !== id && (j.time_in_round_in_ms || 0) - t >= 0 && (j.time_in_round_in_ms || 0) - t <= TRADE_MS)) trd++;
      }
    }
    // shots and score: per-round stats when available, otherwise whole-match totals (only if nothing was cut)
    let hs = 0, bs = 0, ls = 0, score = 0, perRound = false;
    (match.rounds || []).slice(0, R).forEach((r: any) => {
      const st = (r?.stats || r?.player_stats || []).find((s: any) => pidOf(s.player || s) === id);
      if (!st) return; perRound = true;
      const v = st.stats || st;
      hs += Number(v.headshots) || 0; bs += Number(v.bodyshots) || 0; ls += Number(v.legshots) || 0; score += Number(v.score) || 0;
    });
    if (!perRound && R >= total) { const v = p.stats || {}; hs = Number(v.headshots) || 0; bs = Number(v.bodyshots) || 0; ls = Number(v.legshots) || 0; score = Number(v.score) || 0; }
    const shots = hs + bs + ls;
    return { puuid: id, name: p.name, tag: p.tag, agent: p.agent?.name || null, rounds: R, kills: k, deaths: d, assists: a,
      first_kills: fk, first_deaths: fd, trades: tr, traded_deaths: trd, true_hs_pct: shots ? +(hs / shots).toFixed(3) : null, acs: score && R ? Math.round(score / R) : null };
  });
}
// ---------------------------------------------------------------- kill positions (kill maps)
// Compact rows: [round (0-based), ms into round, 1 = our kill / 0 = our death, killer, victim, killer x, killer y, victim x, victim y, weapon, 1 = first kill of the round]
const roundBase = (kills: any[]) => (kills.length && kills.every((k: any) => Number(k.round) >= 1) ? 1 : 0);
const locOf = (k: any, puuid: string) => {
  const l = (k.player_locations || k.player_locations_on_kill || []).find((p: any) => pidOf(p.player || p) === puuid);
  return l?.location || l?.player_location || null;
};
const rnd = (v: any) => (v == null || isNaN(Number(v)) ? null : Math.round(Number(v)));
export function killEvents(match: any, ourTeam: string, R: number) {
  const kills: any[] = (match.kills || []).filter((k: any) => k?.killer && k?.victim);
  const base = roundBase(kills);
  const first = new Map<number, any>();
  for (const k of kills) { const ri = Number(k.round) - base; const c = first.get(ri); if (!c || (k.time_in_round_in_ms || 0) < (c.time_in_round_in_ms || 0)) first.set(ri, k); }
  const out: any[] = [];
  for (const k of kills) {
    const ri = Number(k.round) - base; if (ri < 0 || ri >= R) continue;
    const kl = locOf(k, pidOf(k.killer)); const vl = k.location || k.victim_death_location || locOf(k, pidOf(k.victim));
    if (!kl && !vl) continue;
    out.push([ri, k.time_in_round_in_ms || 0, teamOf(k.killer).toLowerCase() === ourTeam.toLowerCase() ? 1 : 0, k.killer.name || "", k.victim.name || "",
      rnd(kl?.x), rnd(kl?.y), rnd(vl?.x), rnd(vl?.y), k.weapon?.name || k.damage_weapon_name || "", first.get(ri) === k ? 1 : 0]);
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
// one player's kill/death positions in a game: [map, side A/D, "k"/"d", my x, my y, other x, other y, first duel 1/0, agent]
export function playerEvents(m: any, puuid: string) {
  const me = (m.players || []).find((p: any) => pidOf(p) === puuid); if (!me) return [];
  const map = m.metadata?.map?.name || m.metadata?.map || null; if (!map) return [];
  const myTeam = teamOf(me);
  const kills: any[] = (m.kills || []).filter((k: any) => k?.killer && k?.victim); const base = roundBase(kills);
  const first = new Map<number, any>();
  for (const k of kills) { const ri = Number(k.round) - base; const c = first.get(ri); if (!c || (k.time_in_round_in_ms || 0) < (c.time_in_round_in_ms || 0)) first.set(ri, k); }
  const out: any[] = [];
  for (const k of kills) {
    const ri = Number(k.round) - base; const isK = pidOf(k.killer) === puuid, isD = pidOf(k.victim) === puuid; if (!isK && !isD) continue;
    const mine = isK ? locOf(k, puuid) : (k.location || k.victim_death_location || locOf(k, puuid));
    const other = isK ? (k.location || k.victim_death_location || locOf(k, pidOf(k.victim))) : locOf(k, pidOf(k.killer));
    if (mine) out.push([map, sideIn(myTeam, ri), isK ? "k" : "d", rnd(mine.x), rnd(mine.y), rnd(other?.x), rnd(other?.y), first.get(ri) === k ? 1 : 0, me.agent?.name || ""]);
  }
  return out;
}
// which side a team was on in round i (Red attacks first; overtime swaps every round)
function sideIn(team: string, i: number) {
  const red = team.toLowerCase() === "red";
  const atk = i >= 24 ? ((i - 24) % 2 === 0 ? red : !red) : (i < 12 ? red : !red);
  return atk ? "A" : "D";
}

async function teamPuuids(admin: SupabaseClient, teamId: number) {
  const { data: members } = await admin.from("profiles").select("id, ign").eq("team_id", teamId);
  const ids = (members || []).map((m: any) => m.id);
  if (!ids.length) return new Map<string, any>();
  const { data: links } = await admin.from("riot_links").select("user_id, puuid, riot_name, riot_tag, region").in("user_id", ids);
  const ign = new Map((members || []).map((m: any) => [m.id, m.ign]));
  return new Map((links || []).map((l: any) => [l.puuid, { ...l, ign: ign.get(l.user_id) || null }]));
}
// our side = the side with the most linked team members
function ourSide(match: any, linked: Map<string, any>) {
  const c = new Map<string, number>();
  for (const p of match.players || []) if (linked.has(pidOf(p))) c.set(teamOf(p), (c.get(teamOf(p)) || 0) + 1);
  const best = [...c.entries()].sort((x, y) => y[1] - x[1])[0];
  return best ? { team: best[0], n: best[1] } : null;
}
export async function importScrim(admin: SupabaseClient, teamId: number, match: any, opts: { opponent?: string; minLinked?: number; post?: boolean } = {}) {
  const md = match.metadata || {};
  const matchId = md.match_id || md.matchid;
  if (!matchId) return { skipped: "no match id" };
  const linked = await teamPuuids(admin, teamId);
  const side = ourSide(match, linked);
  if (!side || side.n < (opts.minLinked ?? SCRIM_MIN)) return { skipped: "not enough team members in this game" };
  const res = scrimResult(match, side.team);
  if (res.R < 1) return { skipped: "no rounds" };
  const date = etDate(md.started_at || new Date().toISOString());
  const map = md.map?.name || md.map || null;
  const roundsTxt = res.rounds.map((r: any) => (r.w ? "W" : "L")).join("");
  const notes = `Imported from Riot. Real result ${res.won}–${res.lost}` + (res.decided ? ` (decided R${res.R})` : " (not finished)") +
    `. Rounds: ${roundsTxt.slice(0, 12)}${roundsTxt.length > 12 ? " | " + roundsTxt.slice(12) : ""}.` + ((match.rounds || []).length > res.R ? ` ${(match.rounds || []).length - res.R} more round(s) were played out and don't count.` : "");
  const fields: Record<string, unknown> = {
    team_id: teamId, date, map, type: "Scrim", rounds_won: res.won, rounds_lost: res.lost, start_side: res.start_side,
    atk_won: res.atk_won, atk_lost: res.atk_lost, def_won: res.def_won, def_lost: res.def_lost, pistols_won: res.pistols_won,
    rounds: res.rounds, riot_match_id: matchId, source: "riot", notes, kills: killEvents(match, side.team, res.R),
  };
  // already imported? update it. A hand-logged game on the same day and map? attach to it. Otherwise insert.
  let { data: existing } = await admin.from("matches").select("id, opponent, event, rounds, discord_posted_at").eq("riot_match_id", matchId).maybeSingle();
  if (!existing) {
    const { data: manual } = await admin.from("matches").select("id, opponent, event, rounds, discord_posted_at").eq("team_id", teamId).eq("date", date).eq("map", map).is("riot_match_id", null).limit(1);
    existing = manual?.[0] || null;
  }
  let id: number;
  if (existing) {
    // keep VOD timestamps the coach marked on each round
    const old: any[] = Array.isArray(existing.rounds) ? existing.rounds : [];
    (fields.rounds as any[]).forEach((r: any, i: number) => { if (old[i] && old[i].t != null) r.t = old[i].t; });
    if (opts.opponent) fields.opponent = opts.opponent;
    const { error } = await admin.from("matches").update(fields).eq("id", existing.id);
    if (error) throw new Error(error.message);
    id = existing.id;
  } else {
    fields.opponent = opts.opponent || "Scrim (from Riot)";
    fields.event = "Scrim (from Riot)";
    const { data, error } = await admin.from("matches").insert(fields).select("id").single();
    if (error) throw new Error(error.message);
    id = data.id;
  }
  // player stats: our five, over the counted rounds only
  const { data: roster } = await admin.from("roster").select("ign").eq("team_id", teamId);
  const rosterIgn = new Map((roster || []).filter((r: any) => r.ign).map((r: any) => [String(r.ign).toLowerCase(), r.ign]));
  const stats = scrimPlayerStats(match, side.team, res.R).map((p: any) => {
    const riotId = `${p.name}#${p.tag}`;
    const l = linked.get(p.puuid);
    const player = (l?.ign && rosterIgn.get(String(l.ign).toLowerCase())) || rosterIgn.get(riotId.toLowerCase()) || l?.ign || riotId;
    return { team_id: teamId, date, map, player, agent: p.agent, rounds: p.rounds, kills: p.kills, deaths: p.deaths, assists: p.assists,
      kd: p.deaths ? +(p.kills / p.deaths).toFixed(2) : p.kills, true_hs_pct: p.true_hs_pct, first_kills: p.first_kills, first_deaths: p.first_deaths,
      trades: p.trades, traded_deaths: p.traded_deaths, source: "Riot API (custom game)", riot_match_id: matchId, match_id: id,
      notes: p.acs != null ? `ACS ${p.acs}` : null };
  });
  await admin.from("player_stats").delete().eq("riot_match_id", matchId);
  if (stats.length) { const { error } = await admin.from("player_stats").insert(stats); if (error) throw new Error(error.message); }
  // post a summary to the team's Discord once, for games from the last day (never for old games being refreshed)
  const recent = md.started_at && Date.now() - new Date(md.started_at).getTime() < 24 * 3600000;
  if (opts.post !== false && recent && !existing?.discord_posted_at) {
    try { if (await postScrimSummary(admin, teamId, id, res, map, String(fields.opponent || existing?.opponent || "Scrim"), stats)) await admin.from("matches").update({ discord_posted_at: new Date().toISOString() }).eq("id", id); }
    catch (_) { /* Discord problems never block the import */ }
  }
  return { imported: true, match_id: id, result: `${res.won}-${res.lost}`, map, date };
}
async function autoImportScrims(admin: SupabaseClient, teamId: number | null, matches: any[]) {
  if (!teamId) return 0;
  const customs = matches.filter((m) => String(m?.metadata?.queue?.id || m?.metadata?.queue?.name || "").toLowerCase() === "custom" && (m.rounds || []).length);
  if (!customs.length) return 0;
  // games already imported with the current round format are left alone (saves work on every sync)
  const ids = customs.map((m) => m.metadata?.match_id).filter(Boolean);
  const { data: done } = await admin.from("matches").select("riot_match_id, rounds, kills").in("riot_match_id", ids);
  const fresh = new Set((done || []).filter((d: any) => Array.isArray(d.rounds) && d.rounds.some((r: any) => "fk" in r || "buy" in r) && Array.isArray(d.kills)).map((d: any) => d.riot_match_id));
  let n = 0;
  for (const m of customs) {
    if (fresh.has(m.metadata?.match_id)) continue;
    try { const r = await importScrim(admin, teamId, m); if ((r as any).imported) n++; } catch (_) { /* one bad game shouldn't stop the sync */ }
  }
  return n;
}

async function syncUser(admin: SupabaseClient, userId: string, force = false) {
  const { data: link } = await admin.from("riot_links").select("*").eq("user_id", userId).maybeSingle();
  if (!link) return { linked: false };
  if (!force && link.synced_at && Date.now() - new Date(link.synced_at).getTime() < 5 * 60 * 1000) return { linked: true, skipped: true };
  const { data: prof } = await admin.from("profiles").select("team_id").eq("id", userId).maybeSingle();
  // latest games of any mode (catches scrims/customs) + latest competitive games
  const base = `/valorant/v4/by-puuid/matches/${link.region}/pc/${link.puuid}?size=10`;
  const [all, comp] = await Promise.all([henrik(base), henrik(base + "&mode=competitive").catch(() => ({ body: { data: [] } } as any))]);
  const seen = new Set<string>();
  const matches: any[] = [...(all.notFound ? [] : (all.body?.data || [])), ...((comp as any).notFound ? [] : ((comp as any).body?.data || []))]
    .filter((m) => { const id = m?.metadata?.match_id; if (!id || seen.has(id)) return false; seen.add(id); return true; });
  const rows = matches.map((m) => summarise(m, link.puuid)).filter((x) => x && x.match_id).map((x) => ({ ...x, user_id: userId, team_id: prof?.team_id ?? null }));
  if (rows.length) {
    const { error } = await admin.from("riot_matches").upsert(rows, { onConflict: "user_id,match_id" });
    if (error) throw new Error(error.message);
  }
  const scrims = await autoImportScrims(admin, prof?.team_id ?? null, matches);
  const rank = await fetchRank(link.region, link.puuid);
  // summary over the last 20 real 5v5 games
  const { data: last } = await admin.from("riot_matches").select("*").eq("user_id", userId).order("started_at", { ascending: false }).limit(80);
  const L = (last || []).filter((x: any) => STANDARD.has(String(x.queue || ""))).slice(0, 20);
  const sum = (k: string) => L.reduce((a: number, x: any) => a + (Number(x[k]) || 0), 0);
  const k = sum("kills"), d = sum("deaths"), hits = sum("headshots") + sum("bodyshots") + sum("legshots"), rnds = sum("rounds");
  const decided = L.filter((x: any) => x.won != null);
  const agents = new Map<string, number>();
  for (const x of L) if (x.agent && x.agent !== "Unknown") agents.set(x.agent, (agents.get(x.agent) || 0) + 1);
  const top = [...agents.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([agent, games]) => ({ agent, games, role: AGENT_ROLE[agent] || null }));
  const roles = new Map<string, number>();
  for (const [agent, n] of agents) { const r = AGENT_ROLE[agent]; if (r) roles.set(r, (roles.get(r) || 0) + n); }
  const mainRole = [...roles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const row: Record<string, unknown> = {
    user_id: userId, team_id: prof?.team_id ?? null, games: L.length, wins: decided.filter((x: any) => x.won).length,
    win_pct: decided.length ? +(decided.filter((x: any) => x.won).length / decided.length).toFixed(3) : null,
    kills: k, deaths: d, assists: sum("assists"), kd: d ? +(k / d).toFixed(2) : k, hs_pct: hits ? +(sum("headshots") / hits).toFixed(3) : null,
    acs: rnds ? +(sum("score") / rnds).toFixed(0) : null, adr: rnds ? +(sum("damage") / rnds).toFixed(0) : null,
    first_kills: sum("first_kills"), first_deaths: sum("first_deaths"), trades: sum("trades"),
    top_agents: top, main_role: mainRole,
    last_game_at: L[0]?.started_at ?? null, updated_at: new Date().toISOString(),
  };
  if (rank) Object.assign(row, rank, { rank_at: new Date().toISOString() });
  await admin.from("riot_summary").upsert(row, { onConflict: "user_id" });
  await admin.from("riot_links").update({ synced_at: new Date().toISOString() }).eq("user_id", userId);
  return { linked: true, new_games: rows.length, scrims, rank: rank?.rank || null };
}

// Scheduled sync (pg_cron every 20 min): refresh the linked players who haven't synced in the last 50 minutes.
// A few per run keeps us well inside the HenrikDev rate limit.
const CRON_BATCH = 6;
async function cronSync(admin: SupabaseClient) {
  let reminders = 0;
  try { reminders = await sendReminders(admin); } catch (_) { /* reminders never block the Riot sync */ }
  const { data: links } = await admin.from("riot_links").select("user_id, synced_at").order("synced_at", { ascending: true, nullsFirst: true }).limit(60);
  const due = (links || []).filter((l: any) => !l.synced_at || Date.now() - new Date(l.synced_at).getTime() > 50 * 60 * 1000).slice(0, CRON_BATCH);
  let synced = 0, failed = 0, scrims = 0;
  for (const l of due) {
    try { const r: any = await syncUser(admin, l.user_id, true); synced++; scrims += r.scrims || 0; }
    catch (e) { failed++; if (/rate limit/i.test(String((e as Error)?.message))) break; }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return { ok: true, due: due.length, synced, failed, scrims, reminders };
}

// ---------------------------------------------------------------- opponent scouting from Riot IDs
// Looks at each player's last 10 games: rank, agents, maps, K/D, ACS, HS %, opening duels, where they get kills and die,
// and games where 3+ of them queued together (Premier / 5-stacks).
function scoutPlayer(riotId: string, puuid: string, matches: any[], rank: any) {
  const games: any[] = [], events: any[] = [];
  for (const m of matches) {
    const md = m.metadata || {};
    const queue = String(md.queue?.id || md.queue?.name || "").toLowerCase();
    if (!STANDARD.has(queue)) continue;
    const me = (m.players || []).find((p: any) => pidOf(p) === puuid); if (!me) continue;
    const myTeam = teamOf(me); const team = (m.teams || []).find((t: any) => String(t.team_id) === myTeam) || {};
    const rounds = (m.rounds || []).length || ((team?.rounds?.won ?? 0) + (team?.rounds?.lost ?? 0)) || 0;
    const s = me.stats || {}; const map = md.map?.name || md.map || null;
    const kills: any[] = (m.kills || []).filter((k: any) => k?.killer && k?.victim); const base = roundBase(kills);
    const first = new Map<number, any>();
    for (const k of kills) { const ri = Number(k.round) - base; const c = first.get(ri); if (!c || (k.time_in_round_in_ms || 0) < (c.time_in_round_in_ms || 0)) first.set(ri, k); }
    let fk = 0, fd = 0;
    for (const k of kills) {
      const ri = Number(k.round) - base; const isK = pidOf(k.killer) === puuid, isD = pidOf(k.victim) === puuid; if (!isK && !isD) continue;
      const fb = first.get(ri) === k; if (fb && isK) fk++; if (fb && isD) fd++;
      const mine = isK ? locOf(k, puuid) : (k.location || k.victim_death_location || locOf(k, puuid));
      const other = isK ? (k.location || k.victim_death_location || locOf(k, pidOf(k.victim))) : locOf(k, pidOf(k.killer));
      if (mine && map) events.push([map, sideIn(myTeam, ri), isK ? "k" : "d", rnd(mine.x), rnd(mine.y), rnd(other?.x), rnd(other?.y), fb ? 1 : 0, me.agent?.name || ""]);
    }
    const hs = Number(s.headshots) || 0, shots = hs + (Number(s.bodyshots) || 0) + (Number(s.legshots) || 0);
    games.push({ id: md.match_id, at: md.started_at || null, map, queue, agent: me.agent?.name || null, won: team?.won ?? null,
      score: team?.rounds ? `${team.rounds.won ?? 0}-${team.rounds.lost ?? 0}` : null, rounds, k: s.kills ?? 0, d: s.deaths ?? 0, a: s.assists ?? 0,
      acs: rounds ? Math.round((Number(s.score) || 0) / rounds) : null, hs: shots ? +(hs / shots).toFixed(3) : null, fk, fd });
  }
  const tally = (key: string) => { const t = new Map<string, { n: number; w: number }>(); for (const g of games) { const v = g[key]; if (!v) continue; const x = t.get(v) || { n: 0, w: 0 }; x.n++; if (g.won) x.w++; t.set(v, x); }
    return [...t.entries()].sort((a, b) => b[1].n - a[1].n).map(([name, x]) => ({ name, games: x.n, wins: x.w })); };
  const agents = tally("agent"); const roles = new Map<string, number>();
  for (const a of agents) { const r = AGENT_ROLE[a.name]; if (r) roles.set(r, (roles.get(r) || 0) + a.games); }
  const K = games.reduce((a, g) => a + g.k, 0), D = games.reduce((a, g) => a + g.d, 0), R = games.reduce((a, g) => a + g.rounds, 0);
  const acsW = games.filter((g) => g.acs != null); const hsW = games.filter((g) => g.hs != null);
  return { riot_id: riotId, puuid, rank: rank?.rank || null, rr: rank?.rank_rr ?? null, peak: rank?.peak_rank || null, games: games.length, wins: games.filter((g) => g.won).length,
    kd: D ? +(K / D).toFixed(2) : K, kpr: R ? +(K / R).toFixed(2) : null, acs: acsW.length ? Math.round(acsW.reduce((a, g) => a + g.acs * g.rounds, 0) / Math.max(1, acsW.reduce((a, g) => a + g.rounds, 0))) : null,
    hs: hsW.length ? +(hsW.reduce((a, g) => a + g.hs, 0) / hsW.length).toFixed(3) : null, fk: games.reduce((a, g) => a + g.fk, 0), fd: games.reduce((a, g) => a + g.fd, 0),
    agents, maps: tally("map"), main_role: [...roles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null, recent: games, events };
}
async function scoutTeam(riotIds: string[]) {
  const players: any[] = []; const raw = new Map<string, any>(); const puuids = new Map<string, string>();
  for (const id of riotIds) {
    const m = id.match(/^(.{3,16})#([A-Za-z0-9]{2,5})$/);
    if (!m) { players.push({ riot_id: id, error: "Not a Riot ID (Name#TAG)" }); continue; }
    try {
      const acc = await henrik(`/valorant/v2/account/${encodeURIComponent(m[1])}/${encodeURIComponent(m[2])}`);
      if (acc.notFound || !acc.body?.data?.puuid) { players.push({ riot_id: id, error: "Riot couldn't find this player" }); continue; }
      const puuid = acc.body.data.puuid; const region = REGIONS.includes(String(acc.body.data.region || "").toLowerCase()) ? String(acc.body.data.region).toLowerCase() : "na";
      const name = `${acc.body.data.name || m[1]}#${acc.body.data.tag || m[2]}`;
      const r = await henrik(`/valorant/v4/by-puuid/matches/${region}/pc/${puuid}?size=10`);
      const list: any[] = r.notFound ? [] : (r.body?.data || []);
      for (const x of list) if (x?.metadata?.match_id) raw.set(x.metadata.match_id, x);
      puuids.set(puuid, name);
      players.push(scoutPlayer(name, puuid, list, await fetchRank(region, puuid)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      players.push({ riot_id: id, error: msg });
      if (/rate limit/i.test(msg)) break;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  // games where 3+ of them were on the same side
  const together: any[] = [];
  for (const m of raw.values()) {
    const by = new Map<string, any[]>();
    for (const p of m.players || []) if (puuids.has(pidOf(p))) { const t = teamOf(p); by.set(t, [...(by.get(t) || []), p]); }
    for (const [t, ps] of by) {
      if (ps.length < 3) continue;
      const team = (m.teams || []).find((x: any) => String(x.team_id) === t) || {};
      together.push({ id: m.metadata?.match_id, at: m.metadata?.started_at || null, map: m.metadata?.map?.name || null, queue: String(m.metadata?.queue?.id || m.metadata?.queue?.name || "").toLowerCase(),
        won: team?.won ?? null, score: team?.rounds ? `${team.rounds.won ?? 0}-${team.rounds.lost ?? 0}` : null,
        comp: (m.players || []).filter((p: any) => teamOf(p) === t).map((p: any) => ({ agent: p.agent?.name || null, name: puuids.get(pidOf(p)) || null })) });
    }
  }
  together.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  return { players, together, scouted_at: new Date().toISOString() };
}

// ---------------------------------------------------------------- Discord scrim summary
export function scrimSummary(res: any, map: string | null, opponent: string, stats: any[]) {
  const won = res.won > res.lost, rate = (w: number, l: number) => (w + l ? w / (w + l) : null);
  const fkUs = res.rounds.filter((r: any) => r.fk === "us").length, fkThem = res.rounds.filter((r: any) => r.fk === "them").length;
  const top = stats.map((p: any) => ({ p, acs: Number(String(p.notes || "").replace(/\D+/g, "")) || 0 })).sort((a, b) => b.acs - a.acs || (b.p.kills - b.p.deaths) - (a.p.kills - a.p.deaths))[0];
  const weak = [
    { k: "Attack rounds", r: rate(res.atk_won, res.atk_lost), t: `${res.atk_won}–${res.atk_lost}` },
    { k: "Defense rounds", r: rate(res.def_won, res.def_lost), t: `${res.def_won}–${res.def_lost}` },
    { k: "Opening duels", r: rate(fkUs, fkThem), t: `${fkUs}–${fkThem}` },
  ].filter((x) => x.r != null && x.r < 0.5).sort((a, b) => (a.r as number) - (b.r as number));
  return {
    title: `${won ? "✅ Win" : res.won === res.lost ? "➖ Draw" : "❌ Loss"} ${res.won}–${res.lost}${map ? " on " + map : ""} vs ${opponent}`,
    color: won ? 0x3ba55d : 0xff4655, url: APP_URL + "#/analytics",
    fields: [
      { name: "Attack", value: `${res.atk_won}–${res.atk_lost}`, inline: true }, { name: "Defense", value: `${res.def_won}–${res.def_lost}`, inline: true },
      { name: "Pistols", value: `${res.pistols_won}/2`, inline: true }, { name: "First kills", value: `${fkUs}–${fkThem}`, inline: true },
      top ? { name: "Top player", value: `${top.p.player} (${top.p.agent || "?"}) ${top.p.kills}/${top.p.deaths}/${top.p.assists}${top.acs ? " · ACS " + top.acs : ""}`, inline: true } : null,
      { name: "Work on", value: weak.length ? weak.slice(0, 2).map((x) => `${x.k} (${x.t})`).join(", ") : "Nothing below 50%. Nice.", inline: false },
    ].filter(Boolean),
    footer: { text: "Full round-by-round breakdown in Team Hub → Scrim analytics" },
  };
}
async function postScrimSummary(admin: SupabaseClient, teamId: number, _matchId: number, res: any, map: string | null, opponent: string, stats: any[]) {
  const { data: hook } = await admin.from("team_discord").select("*").eq("team_id", teamId).maybeSingle();
  if (!hook?.webhook_url || hook.post_scrims === false) return false;
  return await postDiscord({ ...hook, mention: "" }, "📊 Scrim result", scrimSummary(res, map, opponent, stats));
}

// ---------------------------------------------------------------- Discord reminders (run with the 20-minute cron)
const APP_URL = Deno.env.get("APP_URL") || "https://team-hub-xrg.vercel.app/";
async function postDiscord(hook: any, text: string, embed: any) {
  const content = [hook.mention || "", text].filter(Boolean).join(" ");
  const res = await fetch(hook.webhook_url, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ username: "Team Hub", content, embeds: [embed], allowed_mentions: { parse: hook.mention ? ["everyone"] : [] } }) });
  return res.ok;
}
const etParts = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" })
  .formatToParts(d).map((p) => [p.type, p.value]));
export async function sendReminders(admin: SupabaseClient) {
  const { data: hooks } = await admin.from("team_discord").select("*");
  let sent = 0;
  const now = Date.now();
  for (const h of hooks || []) {
    if (!h.webhook_url) continue;
    try {
      if (h.remind_day !== false || h.remind_hour !== false) {
        const { data: scrims } = await admin.from("scrims").select("id, starts_at, opponent, maps, format, notes, status, reminded_day_at, reminded_hour_at").eq("team_id", h.team_id)
          .gte("starts_at", new Date(now).toISOString()).lte("starts_at", new Date(now + 25 * 3600000).toISOString()).order("starts_at").limit(20);
        for (const s of scrims || []) {
          if (String(s.status || "").toLowerCase() === "cancelled") continue;
          const at = new Date(s.starts_at).getTime(), ms = at - now, unix = Math.floor(at / 1000);
          let kind: "hour" | "day" | null = null;
          if (h.remind_hour !== false && !s.reminded_hour_at && ms <= 75 * 60000) kind = "hour";
          else if (h.remind_day !== false && !s.reminded_day_at && ms <= 24 * 3600000 && ms > 3 * 3600000) kind = "day";
          if (!kind) continue;
          const embed = { title: `Scrim vs ${s.opponent || "TBD"}`, url: APP_URL + "#/schedule", color: kind === "hour" ? 0xff4655 : 0x5865f2,
            description: `<t:${unix}:F> (<t:${unix}:R>)`, fields: [s.maps ? { name: "Maps", value: String(s.maps).slice(0, 200), inline: true } : null, s.format ? { name: "Format", value: String(s.format).slice(0, 50), inline: true } : null,
              s.notes ? { name: "Notes", value: String(s.notes).slice(0, 500) } : null].filter(Boolean) };
          const ok = await postDiscord(h, kind === "hour" ? "⏰ Scrim starts soon. Get on and warm up." : "📅 Scrim tomorrow.", embed);
          if (ok) { await admin.from("scrims").update(kind === "hour" ? { reminded_hour_at: new Date().toISOString(), reminded_day_at: s.reminded_day_at || new Date().toISOString() } : { reminded_day_at: new Date().toISOString() }).eq("id", s.id); sent++; }
        }
      }
      if (h.remind_avail) {
        const p = etParts(new Date(now)); const today = `${p.year}-${p.month}-${p.day}`;
        if (p.weekday === "Mon" && Number(p.hour) >= 10 && h.avail_nudged_on !== today) {
          const ok = await postDiscord(h, "🗓️ New week: fill in when you can play.", { title: "Update your availability", url: APP_URL + "#/schedule", color: 0x3ba55d, description: "Open Team Hub → Schedule and mark the times you can play this week so we can book scrims." });
          if (ok) { await admin.from("team_discord").update({ avail_nudged_on: today }).eq("team_id", h.team_id); sent++; }
        }
      }
      if (h.digest !== false) {
        const p = etParts(new Date(now)); const today = `${p.year}-${p.month}-${p.day}`;
        if (p.weekday === "Mon" && Number(p.hour) >= 9 && h.digest_sent_on !== today) {
          const embed = await weeklyDigest(admin, h.team_id, now);
          if (embed) { const ok = await postDiscord(h, "📊 Weekly team report", embed); if (ok) { await admin.from("team_discord").update({ digest_sent_on: today }).eq("team_id", h.team_id); sent++; } }
          else await admin.from("team_discord").update({ digest_sent_on: today }).eq("team_id", h.team_id);
        }
      }
    } catch (_) { /* one team's bad webhook shouldn't stop the others */ }
  }
  return sent;
}

// Monday summary of the last 7 days: results, attendance, check-ins, work-on, and the coming week's scrims.
export function digestStreak(days: string[], today: string) {
  const set = new Set(days); let d = today, n = 0;
  const back = (x: string) => { const t = new Date(x + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };
  if (!set.has(d)) d = back(d);
  while (set.has(d)) { n++; d = back(d); }
  return n;
}
export async function weeklyDigest(admin: SupabaseClient, teamId: number, now: number) {
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const today = iso(now), weekAgo = iso(now - 7 * 86400000), monthAgo = iso(now - 40 * 86400000);
  const [{ data: matches }, { data: att }, { data: checks }, { data: work }, { data: scrims }, { data: members }] = await Promise.all([
    admin.from("matches").select("date, opponent, map, rounds_won, rounds_lost").eq("team_id", teamId).gte("date", weekAgo).order("date").limit(50),
    admin.from("attendance").select("player, status").eq("team_id", teamId).gte("day", weekAgo).limit(500),
    admin.from("checkins").select("user_id, day").eq("team_id", teamId).gte("day", monthAgo).limit(2000),
    admin.from("work_on").select("status, fixed_at, date").eq("team_id", teamId).limit(2000),
    admin.from("scrims").select("starts_at, opponent, status").eq("team_id", teamId).gte("starts_at", new Date(now).toISOString()).lte("starts_at", new Date(now + 7 * 86400000).toISOString()).order("starts_at").limit(10),
    admin.from("profiles").select("id, ign, display_name, is_coach, staff_role").eq("team_id", teamId).limit(100)]);
  const fields: any[] = [];
  const ms = matches || [];
  if (ms.length) {
    const w = ms.filter((m: any) => Number(m.rounds_won) > Number(m.rounds_lost)).length;
    fields.push({ name: `Results: ${w}W–${ms.length - w}L`, value: ms.slice(-6).map((m: any) => `${Number(m.rounds_won) > Number(m.rounds_lost) ? "✅" : "❌"} ${m.map || "?"} ${m.rounds_won}–${m.rounds_lost} vs ${m.opponent || "?"}`).join("\n").slice(0, 1000) });
  }
  const a = att || [];
  if (a.length) {
    const by = new Map<string, { n: number; on: number; miss: string[] }>();
    for (const r of a) { const x = by.get(r.player) || { n: 0, on: 0, miss: [] }; x.n++; if (r.status === "On time") x.on++; else if (r.status !== "Excused") x.miss.push(r.status); by.set(r.player, x); }
    fields.push({ name: "Attendance", value: [...by.entries()].sort((p, q) => (q[1].on / q[1].n) - (p[1].on / p[1].n)).map(([p, x]) => `${x.miss.length ? "⚠️" : "✅"} ${p}: ${x.on}/${x.n} on time${x.miss.length ? " (" + x.miss.join(", ").toLowerCase() + ")" : ""}`).join("\n").slice(0, 1000) });
  }
  const players = (members || []).filter((m: any) => !m.is_coach && !m.staff_role);
  if (players.length) {
    const days = new Map<string, string[]>(); for (const c of checks || []) { const l = days.get(c.user_id) || []; l.push(String(c.day).slice(0, 10)); days.set(c.user_id, l); }
    const rows = players.map((m: any) => { const l = days.get(m.id) || []; return { name: m.ign || m.display_name || "Player", week: l.filter((d) => d >= weekAgo).length, streak: digestStreak(l, today) }; }).sort((p: any, q: any) => q.week - p.week);
    if (rows.some((r: any) => r.week)) fields.push({ name: "Check-ins this week", value: rows.map((r: any) => `${r.streak >= 3 ? "🔥" : r.week ? "•" : "⚪"} ${r.name}: ${r.week}/7${r.streak >= 3 ? ` (${r.streak}-day streak)` : ""}`).join("\n").slice(0, 1000) });
  }
  const wk = work || [];
  if (wk.length) {
    const open = wk.filter((x: any) => x.status !== "Fixed").length, fixed = wk.filter((x: any) => x.status === "Fixed" && x.fixed_at && String(x.fixed_at).slice(0, 10) >= weekAgo).length, added = wk.filter((x: any) => x.date && String(x.date).slice(0, 10) >= weekAgo).length;
    fields.push({ name: "Work on", value: `${fixed} fixed · ${added} new · ${open} still open`, inline: true });
  }
  const sc = (scrims || []).filter((x: any) => String(x.status || "").toLowerCase() !== "cancelled");
  fields.push({ name: "This week", value: sc.length ? sc.map((x: any) => `<t:${Math.floor(new Date(x.starts_at).getTime() / 1000)}:f> vs ${x.opponent || "TBD"}`).join("\n").slice(0, 1000) : "No scrims booked yet. Try the scrim finder.", inline: !sc.length });
  if (fields.length <= 1 && !sc.length && !ms.length) return null; // nothing happened and nothing planned: skip the post
  return { title: "Week in review", url: APP_URL + "#/home", color: 0xff4655, description: `${weekAgo} → ${today}`, fields };
}

// ---------------------------------------------------------------- calendar feed (GET ?calendar=<team token>)
// Google / Apple / Outlook subscribe to this URL. The token is the team's secret calendar link.
const icsEsc = (s: unknown) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsTime = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsDate = (iso: string) => iso.slice(0, 10).replace(/-/g, "");
function icsFold(line: string) { const out: string[] = []; let l = line; while (l.length > 74) { out.push(l.slice(0, 74)); l = " " + l.slice(74); } out.push(l); return out.join("\r\n"); }
export async function buildCalendar(admin: SupabaseClient, teamId: number) {
  const { data: team } = await admin.from("teams").select("name").eq("id", teamId).maybeSingle();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: scrims } = await admin.from("scrims").select("id, starts_at, opponent, maps, format, notes, status").eq("team_id", teamId).gte("starts_at", since).order("starts_at").limit(200);
  const weekAgo = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10);
  const { data: plans } = await admin.from("practice_plans").select("id, week_start, title, items").eq("team_id", teamId).eq("published", true).gte("week_start", weekAgo).order("week_start").limit(6);
  const name = team?.name || "Team Hub";
  const now = icsTime(new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Team Hub//Schedule//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:" + icsEsc(name + " schedule"), "X-PUBLISHED-TTL:PT1H", "REFRESH-INTERVAL;VALUE=DURATION:PT1H"];
  for (const s of scrims || []) {
    if (!s.starts_at || String(s.status || "").toLowerCase() === "cancelled") continue;
    const start = new Date(s.starts_at); const hours = /bo3/i.test(String(s.format || "")) ? 3 : /bo2/i.test(String(s.format || "")) ? 2.5 : 2;
    lines.push("BEGIN:VEVENT", "UID:scrim-" + s.id + "@teamhub", "DTSTAMP:" + now, "DTSTART:" + icsTime(start), "DTEND:" + icsTime(new Date(start.getTime() + hours * 3600000)),
      "SUMMARY:" + icsEsc("Scrim vs " + (s.opponent || "TBD") + (s.status && s.status !== "Planned" ? " (" + s.status + ")" : "")),
      "DESCRIPTION:" + icsEsc([s.format, s.maps ? "Maps: " + s.maps : "", s.notes].filter(Boolean).join("\n")), "END:VEVENT");
  }
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (const p of plans || []) {
    const items: any[] = Array.isArray(p.items) ? p.items : [];
    DAYS.forEach((d, i) => {
      const list = items.filter((it) => it && it.day === d && !it.player); if (!list.length) return;
      const day = new Date(p.week_start + "T12:00:00Z"); day.setUTCDate(day.getUTCDate() + i);
      const iso = day.toISOString().slice(0, 10), next = new Date(day.getTime() + 86400000).toISOString().slice(0, 10);
      const mins = list.reduce((a, it) => a + (Number(it.minutes) || 0), 0);
      lines.push("BEGIN:VEVENT", "UID:practice-" + p.id + "-" + d + "@teamhub", "DTSTAMP:" + now, "DTSTART;VALUE=DATE:" + icsDate(iso), "DTEND;VALUE=DATE:" + icsDate(next),
        "SUMMARY:" + icsEsc("Practice: " + list.filter((it) => it.focus && it.focus !== "Warm-up").map((it) => it.focus).slice(0, 2).join(" + ") || "Practice"),
        "DESCRIPTION:" + icsEsc((p.title ? p.title + "\n" : "") + list.map((it) => "• " + (it.minutes ? it.minutes + " min " : "") + (it.focus || "") + (it.detail ? " — " + it.detail : "")).join("\n") + (mins ? "\n(" + mins + " min total)" : "")),
        "TRANSP:TRANSPARENT", "END:VEVENT");
    });
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  if (req.method === "GET") {
    const tok = new URL(req.url).searchParams.get("calendar") || "";
    if (!/^[a-f0-9]{32,80}$/i.test(tok)) return new Response("Not found", { status: 404 });
    const { data: teamId } = await admin.rpc("calendar_team", { t: tok });
    if (!teamId) return new Response("This calendar link was reset. Ask your coach for the new one.", { status: 404 });
    try { return new Response(await buildCalendar(admin, Number(teamId)), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "public, max-age=900", "Access-Control-Allow-Origin": "*" } }); }
    catch (e) { return new Response("Calendar error: " + (e instanceof Error ? e.message : String(e)), { status: 500 }); }
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const cronToken = req.headers.get("x-cron-token");
  if (cronToken) {
    const { data: ok } = await admin.rpc("cron_token_ok", { t: cronToken });
    if (ok !== true) return json({ error: "Not allowed." }, 401);
    try { return json(await cronSync(admin)); } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 500); }
  }
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Sign in first." }, 401);
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
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
    if (action === "scrim_candidates" || action === "import_scrim" || action === "reimport_scrims") {
      const { data: staff } = await userClient.rpc("is_staff");
      if (staff !== true) return json({ error: "Only team staff can import scrims." }, 403);
      const { data: team } = await userClient.rpc("my_team");
      if (!team) return json({ error: "You're not on a team." }, 400);
      if (action === "scrim_candidates") {
        // custom games that linked team members played recently (from their synced history)
        const { data: rows } = await admin.from("riot_matches").select("match_id, started_at, map, rounds_won, rounds_lost, user_id").eq("team_id", team).eq("queue", "custom").order("started_at", { ascending: false }).limit(200);
        const by = new Map<string, any>();
        for (const r of rows || []) { const x = by.get(r.match_id) || { match_id: r.match_id, started_at: r.started_at, map: r.map, score: [r.rounds_won, r.rounds_lost], players: 0 }; x.players++; by.set(r.match_id, x); }
        const ids = [...by.keys()];
        const { data: done } = ids.length ? await admin.from("matches").select("riot_match_id").in("riot_match_id", ids) : { data: [] as any[] };
        const imported = new Set((done || []).map((d: any) => d.riot_match_id));
        return json({ ok: true, games: [...by.values()].slice(0, 30).map((g) => ({ ...g, imported: imported.has(g.match_id) })) });
      }
      if (action === "reimport_scrims") {
        // refresh every Riot-imported scrim (new round details like first kills and buys)
        const { data: list } = await admin.from("matches").select("riot_match_id").eq("team_id", team).eq("source", "riot").not("riot_match_id", "is", null).limit(40);
        let ok = 0, failed = 0;
        for (const x of list || []) {
          try {
            const { data: who } = await admin.from("riot_matches").select("user_id").eq("team_id", team).eq("match_id", x.riot_match_id).limit(1);
            const { data: link } = who?.length ? await admin.from("riot_links").select("region").eq("user_id", who[0].user_id).maybeSingle() : { data: null as any };
            const r = await henrik(`/valorant/v4/match/${link?.region || "na"}/${x.riot_match_id}`);
            if (r.notFound || !r.body?.data) { failed++; continue; }
            const res: any = await importScrim(admin, team, r.body.data, { minLinked: 1, post: false });
            if (res.imported) ok++; else failed++;
          } catch (_) { failed++; }
        }
        return json({ ok: true, refreshed: ok, failed });
      }
      const matchId = String(body.match_id || "");
      if (!/^[0-9a-f-]{20,}$/i.test(matchId)) return json({ error: "Missing match." }, 400);
      // region from a team member who played it
      const { data: who } = await admin.from("riot_matches").select("user_id").eq("team_id", team).eq("match_id", matchId).limit(1);
      if (!who?.length) return json({ error: "No one on your team has this game in their history." }, 404);
      const { data: link } = await admin.from("riot_links").select("region").eq("user_id", who[0].user_id).maybeSingle();
      const r = await henrik(`/valorant/v4/match/${link?.region || "na"}/${matchId}`);
      if (r.notFound || !r.body?.data) return json({ error: "Riot couldn't find that game any more." }, 404);
      const res = await importScrim(admin, team, r.body.data, { opponent: String(body.opponent || "").trim().slice(0, 80) || undefined, minLinked: 1 });
      return json({ ok: true, ...res });
    }
    if (action === "scout") {
      const { data: staff } = await userClient.rpc("is_staff");
      if (staff !== true) return json({ error: "Only team staff can scout opponents." }, 403);
      const { data: team } = await userClient.rpc("my_team");
      if (!team) return json({ error: "You're not on a team." }, 400);
      const opponent = String(body.opponent || "").trim().slice(0, 80);
      if (!opponent) return json({ error: "Which team is this?" }, 400);
      const ids = [...new Set((Array.isArray(body.riot_ids) ? body.riot_ids : []).map((x: unknown) => String(x).trim()).filter(Boolean))].slice(0, 7) as string[];
      if (!ids.length) return json({ error: "Add at least one Riot ID (Name#TAG)." }, 400);
      const data = await scoutTeam(ids);
      const { data: row, error } = await admin.from("opponent_scouts").insert({ team_id: team, opponent, riot_ids: ids, data, created_by: uid }).select("id").single();
      if (error) throw new Error(error.message);
      return json({ ok: true, id: row.id, data });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
