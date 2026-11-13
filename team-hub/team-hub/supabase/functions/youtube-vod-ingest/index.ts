import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function youtubeId(input: string): string | null {
  let url: URL;
  try { url = new URL(input); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(host)) return null;
  let id = "";
  if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
  else if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
  else {
    const parts = url.pathname.split("/").filter(Boolean);
    if (["shorts", "live", "embed", "v"].includes(parts[0])) id = parts[1] || "";
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return response({ error: "Sign in as a team coach to import VODs." }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return response({ error: "Supabase function configuration is incomplete." }, 500);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const token = auth.slice("Bearer ".length);
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return response({ error: "Your session is invalid or expired. Please sign in again." }, 401);
    const body = await req.json();
    if (body?.action === "provider_status") {
      const { data: staff, error: staffError } = await userClient.rpc("is_staff");
      if (staffError || staff !== true) return response({ error: "Only authorized team staff can check provider settings." }, 403);
      const apiKey = Deno.env.get("TWELVELABS_API_KEY");
      if (!apiKey) return response({ ok: false, configured: false, error: "TWELVELABS_API_KEY is not configured in Supabase Edge Function secrets." }, 503);
      const providerCheck = await fetch("https://api.twelvelabs.io/v1.3/indexes", {
        method: "GET", headers: { "x-api-key": apiKey, "Accept": "application/json" },
        signal: AbortSignal.timeout(12000),
      });
      if (!providerCheck.ok) {
        const providerError = await providerCheck.text();
        return response({ ok: false, configured: true, error: providerCheck.status === 401 ? "TwelveLabs rejected the configured API key. Check that it is active." : "TwelveLabs returned HTTP " + providerCheck.status + (providerError ? ": " + providerError.slice(0, 220) : "") }, 502);
      }
      const providerData = await providerCheck.json();
      const indexes = Array.isArray(providerData?.data) ? providerData.data : [];
      return response({ ok: true, configured: true, provider: "TwelveLabs", index_count: indexes.length });
    }
    const rawUrl = String(body?.url || "").trim();
    const videoId = youtubeId(rawUrl);
    if (!videoId) return response({ error: "Enter a valid YouTube video, Shorts, or live URL." }, 400);
    const canonicalUrl = "https://www.youtube.com/watch?v=" + videoId;
    let youtubeMeta: Record<string, unknown> = {};
    let metadataStatus = "unavailable";
    try {
      const oembed = await fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(canonicalUrl), {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "TeamHub-VOD-Importer/1.0" },
      });
      if (oembed.ok) { youtubeMeta = await oembed.json(); metadataStatus = "available"; }
    } catch (_) { /* A restricted video can still be registered for later authorized processing. */ }
    const title = String(body?.title || youtubeMeta.title || "YouTube VOD review").slice(0, 180);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.date || "")) ? body.date : new Date().toISOString().slice(0, 10);
    const reviewPayload = {
      vod: canonicalUrl, link: canonicalUrl, title, date,
      opponent: String(body?.opponent || "").slice(0, 120) || null,
      map: String(body?.map || "").slice(0, 40) || null,
      type: String(body?.type || "Scrim").slice(0, 40),
      pov: String(body?.pov || "").slice(0, 100) || null,
      whose: "Our team", summary: null, body: null,
    };
    const { data: review, error: reviewError } = await userClient.from("reviews").insert(reviewPayload).select("id").single();
    if (reviewError) {
      const forbidden = reviewError.code === "42501" || /row-level security|permission denied/i.test(reviewError.message);
      return response({ error: forbidden ? "Only authorized team staff can add VODs." : reviewError.message }, forbidden ? 403 : 400);
    }
    const { data: job, error: jobError } = await userClient.from("vod_analysis_jobs").insert({
      review_id: review.id, source: "youtube", source_url: canonicalUrl, youtube_video_id: videoId,
      video_title: String(youtubeMeta.title || title).slice(0, 500),
      channel_title: String(youtubeMeta.author_name || "").slice(0, 250) || null,
      thumbnail_url: String(youtubeMeta.thumbnail_url || "") || null,
      status: "awaiting_media", stage: "awaiting_authorized_video_asset", progress: 5,
      metadata: { oembed_status: metadataStatus, oembed: youtubeMeta, imported_by: authData.user.id },
    }).select("id,status,stage,progress").single();
    if (jobError) {
      await userClient.from("reviews").delete().eq("id", review.id);
      return response({ error: "The VOD was not queued: " + jobError.message }, 500);
    }
    return response({
      ok: true, review_id: review.id, job,
      video: { id: videoId, title: youtubeMeta.title || title, channel: youtubeMeta.author_name || null, thumbnail: youtubeMeta.thumbnail_url || null },
      next_step: "awaiting_authorized_video_asset",
      message: "VOD registered. Video analysis is waiting for an authorized video asset; a YouTube share link alone is not a downloadable media file.",
    }, 201);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Unexpected VOD import error." }, 500);
  }
});
