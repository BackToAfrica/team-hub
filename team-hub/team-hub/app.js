/* Team Hub — single-file app. Talks to Supabase (auth + database). */
(function () {
'use strict';

const CFG = window.TEAM_CONFIG || {};
const TEAM = CFG.TEAM_NAME || 'Team Hub';
document.title = TEAM;

// ---------------------------------------------------------------- helpers
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}
function todayISO() {
  const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function isoOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function addDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d); }
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  if (isNaN(d)) return esc(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
function pct(v) { return v == null || v === '' || isNaN(v) ? '–' : Math.round(Number(v) * 100) + '%'; }
function num(v, dp) { return v == null || v === '' || isNaN(v) ? '–' : Number(v).toFixed(dp == null ? 0 : dp); }
function normName(n) { return String(n || '').replace(/\s*\*\s*trial\s*$/i, '').trim().toLowerCase(); }
function isTrialName(n) { return /\*\s*trial\s*$/i.test(String(n || '')); }

// "[text](url)" or a bare url -> link html
function linkHtml(v, fallbackText) {
  if (!v) return '';
  const s = String(v).trim();
  const m = s.match(/^\[([^\]]*)\]\((https?:[^)]+)\)$/);
  if (m) return '<a href="' + esc(m[2]) + '" target="_blank" rel="noopener">' + esc(m[1] || fallbackText || 'Open') + '</a>';
  if (/^https?:\/\//i.test(s)) return '<a href="' + esc(s) + '" target="_blank" rel="noopener">' + esc(fallbackText || shortUrl(s)) + '</a>';
  return inlineMd(s);
}
function shortUrl(u) { try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? '/…' : ''); } catch (e) { return u; } }

// --------------------------------------------------------------- markdown
function inlineMd(s) {
  let h = esc(s);
  h = h.replace(/\\([\[\]\*_\\])/g, '$1');
  h = h.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  h = h.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return h;
}
function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let out = '', i = 0;
  const isTableRow = l => /^\s*\|.*\|\s*$/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { const n = Math.min(m[1].length + 1, 4); out += '<h' + n + '>' + inlineMd(m[2]) + '</h' + n + '>'; i++; continue; }
    if (isTableRow(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = r => r.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim());
      const head = cells(l); i += 2;
      let t = '<div class="tablewrap"><table><thead><tr>' + head.map(c => '<th>' + inlineMd(c) + '</th>').join('') + '</tr></thead><tbody>';
      while (i < lines.length && isTableRow(lines[i])) { t += '<tr>' + cells(lines[i]).map(c => '<td>' + inlineMd(c) + '</td>').join('') + '</tr>'; i++; }
      out += t + '</tbody></table></div>'; continue;
    }
    if (/^\s*[-*]\s+/.test(l)) {
      out += '<ul>'; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { out += '<li>' + inlineMd(lines[i].replace(/^\s*[-*]\s+/, '')) + '</li>'; i++; } out += '</ul>'; continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      out += '<ol>'; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { out += '<li>' + inlineMd(lines[i].replace(/^\s*\d+[.)]\s+/, '')) + '</li>'; i++; } out += '</ol>'; continue;
    }
    let p = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s/.test(lines[i]) && !isTableRow(lines[i]) && !/^\s*([-*]|\d+[.)])\s+/.test(lines[i])) { p.push(lines[i]); i++; }
    out += '<p>' + p.map(inlineMd).join('<br>') + '</p>';
  }
  return '<div class="md">' + out + '</div>';
}

// ------------------------------------------------------------ data model
const ROLES = ['Duelist', 'Initiator', 'Controller', 'Sentinel', 'Flex'];
const MAPS = ['Abyss', 'Ascent', 'Bind', 'Breeze', 'Corrode', 'Fracture', 'Haven', 'Icebox', 'Lotus', 'Pearl', 'Split', 'Summit', 'Sunset'];
const SECTIONS = {
  checkin: 'Daily check-in',
  my_stats: 'My stats',
  team_stats: 'Team stats & leaderboard',
  playbook: 'Playbook (set plays & pistols)',
  comms: 'Comms guide',
  reviews: 'VOD reviews & work-on list',
  scouting: 'Scouting & comp notes',
  comp_checker: 'Comp Checker & agent counters',
  patch_notes: 'Patch notes'
};

function F(k, label, type, aliases, extra) { return Object.assign({ k: k, label: label, type: type || 'text', aliases: aliases || [label] }, extra || {}); }

// Each table: label, sheet tab name in the coach's workbook, fields (with sheet header aliases), required key.
const TABLES = {
  announcements: { label: 'Announcements', builtin: true, order: 'created_at', req: 'title', fields: [
    F('title', 'Title'), F('body', 'Message', 'long'), F('pinned', 'Pinned', 'bool')] },
  drills: { label: 'Daily drills', builtin: true, sheet: 'Daily Routine', order: 'sort', asc: true, req: 'drill', fields: [
    F('role', 'Role', 'select', ['Role'], { options: ['Everyone', 'Duelist', 'Initiator', 'Controller', 'Sentinel', 'Flex', 'IGL'] }),
    F('block', 'Block'), F('minutes', 'Minutes'), F('drill', 'Drill'), F('how', 'How to do it', 'long'), F('success', 'Success looks like', 'long'), F('sort', 'Order', 'int', ['Order', 'Sort'])] },
  matches: { label: 'Matches', sheet: 'Matches', order: 'date', req: 'map', fields: [
    F('date', 'Date', 'date'), F('event', 'Event'), F('opponent', 'Opponent'), F('map', 'Map'), F('rounds_won', 'Rounds won', 'int'), F('rounds_lost', 'Rounds lost', 'int'),
    F('start_side', 'Start side'), F('vod_link', 'VOD link', 'link'), F('notes', 'Notes', 'long')] },
  player_stats: { label: 'Player stats', sheet: 'Player Stats', order: 'date', req: 'player', fields: [
    F('date', 'Date', 'date'), F('map', 'Map'), F('player', 'Player'), F('agent', 'Agent'), F('rounds', 'Rounds', 'int'), F('kills', 'Kills', 'int'), F('deaths', 'Deaths', 'int'),
    F('assists', 'Assists', 'int'), F('kd', 'K/D', 'num'), F('hs_kills', 'Headshot kills', 'int'), F('hs_kill_pct', 'Headshot kill %', 'pct'), F('true_hs_pct', 'True HS %', 'pct'),
    F('first_kills', 'First kills', 'int'), F('first_deaths', 'First deaths', 'int'), F('source', 'Source'), F('notes', 'Notes', 'long')] },
  utility_usage: { label: 'Utility usage', sheet: 'Utility Usage', order: 'date', req: 'player', fields: [
    F('date', 'Date', 'date'), F('map', 'Map'), F('player', 'Player'), F('agent', 'Agent'), F('rounds', 'Rounds', 'int'), F('util_per_round', 'Util per round', 'num'),
    F('q_casts', 'Ability 1 (Q)', 'int'), F('e_casts', 'Ability 2 (E)', 'int'), F('c_casts', 'Grenade (C)', 'int'), F('ults_used', 'Ults used', 'int'), F('ults_available', 'Ults available', 'int'),
    F('died_with_util', 'Died with util left', 'int'), F('util_before_fight', 'Util before first fight', 'pct'), F('source', 'Source'), F('notes', 'Notes', 'long')] },
  set_plays: { label: 'Set plays', sheet: 'Set Plays', order: 'map', asc: true, req: 'play_name', fields: [
    F('play_name', 'Play name'), F('map', 'Map'), F('side', 'Side'), F('type', 'Type'), F('valoplant', 'ValoPlant', 'link', ['Valoplant link', 'ValoPlant link', 'ValoPlant']), F('site', 'Site'),
    F('how', 'How it works', 'long'), F('duelist_job', 'Duelist job', 'long'), F('initiator_job', 'Initiator job', 'long'), F('controller_job', 'Controller job', 'long'),
    F('sentinel_job', 'Sentinel job', 'long'), F('flex_job', 'Flex job', 'long'), F('seen_in', 'Seen in', 'link', ['Seen in (VOD + time)', 'Seen in']), F('taken_from', 'Taken from')] },
  pistol_rounds: { label: 'Pistol rounds', sheet: 'Pistol Rounds', order: 'date', req: 'team', fields: [
    F('date', 'Date', 'date'), F('team', 'Team that ran it', 'text', ['Team that ran it (vs)', 'Team that ran it']), F('map', 'Map'), F('side', 'Side'), F('round', 'Round'), F('result', 'Result'),
    F('loadouts', 'Loadouts', 'long', ['Loadouts (each player)', 'Loadouts']), F('setup', 'Setup', 'long', ['Setup (start positions)', 'Setup']),
    F('utility', 'Utility used', 'long', ['Utility used (who / what / where / when)', 'Utility used']), F('timeline', 'How it played out', 'long', ['How it played out (timeline)', 'How it played out']),
    F('why', 'Why it won', 'long', ['Why it won (or lost)', 'Why it won']), F('how_we_run', 'How we run it', 'long', ['How we run it (role by role)', 'How we run it']),
    F('how_to_beat', 'How to beat it', 'long'), F('set_play', 'Set Play name'), F('valoplant', 'ValoPlant', 'link'), F('watch', 'Watch it', 'link'), F('taken_from', 'Taken from')] },
  guides: { label: 'Guides (comms etc.)', builtin: true, order: 'sort', asc: true, req: 'title', fields: [
    F('title', 'Title'), F('section', 'Shown in', 'select', ['Section'], { options: ['comms', 'playbook', 'reviews', 'scouting'] }), F('body', 'Text (markdown)', 'long'), F('sort', 'Order', 'int')] },
  reviews: { label: 'VOD reviews', sheet: 'VOD Queue', order: 'date', req: 'vod', keep: r => !!(r.summary || r.body), fix: r => { if (!r.title) r.title = [r.opponent, r.type].filter(Boolean).join(' · ') || 'VOD review'; return r; }, fields: [
    F('date', 'Date', 'date'), F('title', 'Title'), F('opponent', 'Opponent / teams', 'text', ['Opponent']), F('type', 'Type'), F('map', 'Map'), F('vod', 'VOD link', 'link'),
    F('starts_at', 'Starts at'), F('pov', 'POV player'), F('whose', 'Whose POV', 'select', ['Whose POV'], { options: ['Our team', 'Opponent (vs us)', 'Other teams'] }),
    F('summary', 'Key takeaways', 'long', ['Notes from Claude', 'Key takeaways']), F('body', 'Notes & tips for players (markdown, timestamps like 12:34 become clickable)', 'long', ['Player notes (shown in app)', 'Player notes']),
    F('link', 'Coach-only doc link', 'link', ['Review'])] },
  work_on: { label: 'Work on', sheet: 'Work On', order: 'date', req: 'issue', fields: [
    F('date', 'Date', 'date'), F('source', 'From VOD', 'text', ['From VOD', 'Source', 'Scrim']), F('area', 'Area', 'select', ['Area'], { options: ['Comms', 'Utility', 'Trades', 'Opening duels', 'Executes', 'Retakes', 'Post-plant', 'Defense setups', 'Rotations', 'Economy', 'Positioning', 'Aim / mechanics', 'Mid-round calls'] }),
    F('player', 'Player (or Team)', 'text', ['Player']), F('issue', 'What we need to work on', 'long', ['What we need to work on', 'Issue']), F('tip', 'How to fix it', 'long', ['How to fix it', 'Tip']),
    F('priority', 'Priority', 'select', ['Priority'], { options: ['High', 'Medium', 'Low'] }), F('status', 'Status', 'select', ['Status'], { options: ['Open', 'Working on it', 'Fixed'] }),
    F('watch', 'Watch it', 'link', ['Watch it']), F('drill', 'Drill', 'long', ['Drill'])] },
  opponent_scouting: { label: 'Opponent scouting', sheet: 'Opponent Scouting', order: 'date', req: 'opponent', fields: [
    F('date', 'Date', 'date'), F('opponent', 'Opponent'), F('map', 'Map'), F('veto', 'Their veto'), F('source', 'Source'), F('pistol_plan', 'Pistol plan (attack)', 'long'),
    F('fav_attack_site', 'Favorite attack site'), F('defense_setup', 'Defense setup', 'long'), F('after_losing', 'After losing a round', 'long'),
    F('first_fights', 'Takes first fights'), F('star_player', 'Star player'), F('weakness', 'Weakness to attack', 'long'), F('notes', 'Notes', 'long')] },
  comp_notes: { label: 'Comp notes', sheet: 'Comp Notes', order: 'date', req: 'a1', fields: [
    F('date', 'Date', 'date'), F('a1', 'Agent 1'), F('a2', 'Agent 2'), F('a3', 'Agent 3'), F('a4', 'Agent 4'), F('a5', 'Agent 5'), F('map', 'Map'),
    F('team', 'Team that ran it'), F('result', 'Result vs it'), F('weaknesses', 'Weaknesses seen / what beat it', 'long'), F('watch', 'Watch it', 'link')] },
  agent_counters: { label: 'Agent counters', shared: true, sheet: 'Agent Counters', order: 'agent', asc: true, req: 'agent', fields: [
    F('agent', 'Agent'), F('role', 'Role'), F('brings', 'What they bring', 'long'), F('weaknesses', 'Weaknesses', 'long'),
    F('beat_attack', 'Beat them when they attack', 'long', ['Beat them when THEY attack (we defend)', 'Beat them when they attack']),
    F('beat_defense', 'Beat them when they defend', 'long', ['Beat them when THEY defend (we attack)', 'Beat them when they defend']),
    F('counters', 'Best counters', 'long', ['Best counters (util / agents)', 'Best counters']),
    F('smokes', 'Smokes'), F('flash', 'Flash'), F('recon', 'Recon'), F('stall', 'Stall', 'text', ['Stall / flank', 'Stall']), F('entry', 'Entry'), F('heal', 'Heal'),
    F('seen', 'Seen in VODs', 'long'), F('updated', 'Last updated')] },
  roster: { label: 'Roster slots', sheet: 'Roster', order: 'name', asc: true, req: 'name', merge: true, fields: [
    F('name', 'Name', 'text', ['Player (IGN)', 'Player', 'Name']), F('ign', 'In-game name', 'text', ['Player (IGN)', 'IGN', 'In-game name']), F('discord', 'Discord username', 'text', ['Discord username', 'Discord']),
    F('role', 'Role', 'select', ['Role'], { options: ROLES }), F('is_igl', 'IGL', 'bool', ['IGL?', 'IGL']), F('is_trial', 'Trial', 'bool', ['Trial', 'Trial player']), F('status', 'Status', 'select', ['Status'], { options: ['Active', 'Bench'] })] },
  patch_notes: { label: 'Patch notes', shared: true, sheet: 'Patch Notes', order: 'date', req: 'changed', fields: [
    F('patch', 'Patch'), F('date', 'Date', 'date'), F('category', 'Category'), F('item', 'Agent / item'), F('effect', 'Effect'), F('changed', 'What changed', 'long'), F('coach_notes', 'Coach notes', 'long')] }
};

// --------------------------------------------------------------- database
let sb = null;
const S = { session: null, me: null, team: null, route: 'home', cache: {} };
function teamName() { return (S.team && S.team.name) || TEAM; }
// can this person edit a table (shared tables: owner only)
function canEdit(table) { return !!(S.me && S.me.is_coach && (!(TABLES[table] || {}).shared || S.me.is_admin)); }

const db = {
  async list(table, opts) {
    opts = opts || {};
    const cfg = TABLES[table] || {};
    let q = sb.from(table).select('*');
    if (opts.eq) for (const k in opts.eq) q = q.eq(k, opts.eq[k]);
    if (opts.gte) for (const k in opts.gte) q = q.gte(k, opts.gte[k]);
    const order = opts.order || cfg.order || 'id';
    q = q.order(order, { ascending: opts.asc != null ? opts.asc : !!cfg.asc, nullsFirst: false });
    if (order !== 'id') q = q.order('id', { ascending: true });
    q = q.limit(opts.limit || 2000);
    const { data, error } = await q;
    if (error) { console.warn(table, error); return []; }
    return data || [];
  },
  async insert(table, rows) {
    const { error } = await sb.from(table).insert(rows);
    if (error) throw error;
  },
  async update(table, id, patch) {
    const { error } = await sb.from(table).update(patch).eq('id', id);
    if (error) throw error;
  },
  async remove(table, id) {
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) throw error;
  },
  async clear(table) {
    let q = sb.from(table).delete().gt('id', 0);
    if (!(TABLES[table] || {}).shared) q = q.eq('team_id', S.me.team_id); // never touch other teams or built-in rows
    const { error } = await q;
    if (error) throw error;
  }
};

function can(sec) {
  const me = S.me; if (!me || !me.approved) return false;
  if (me.is_coach) return true;
  const v = me.visibility || {};
  return v[sec] !== false;
}

// ------------------------------------------------------------------ boot
async function boot() {
  if (!CFG.SUPABASE_URL || /PASTE_/.test(CFG.SUPABASE_URL) || !CFG.SUPABASE_ANON_KEY || /PASTE_/.test(CFG.SUPABASE_ANON_KEY)) {
    $('#app').innerHTML = '<div class="auth"><div class="card stack"><h1>' + esc(TEAM) + '</h1>' +
      '<p>This app isn\'t connected to its database yet.</p><p class="muted">Open <b>config.js</b> and paste your Supabase Project URL and anon public key (Supabase → Project Settings → API), then deploy again. The setup guide (README) walks through it.</p></div></div>';
    return;
  }
  if (!window.supabase || !window.supabase.createClient) {
    $('#app').innerHTML = '<div class="auth"><div class="card"><h1>Can\'t load</h1><p>Couldn\'t load the Supabase library. Check your internet connection and refresh.</p></div></div>';
    return;
  }
  const jm = location.hash.match(/^#\/join\/([A-Za-z0-9]+)/);
  if (jm) { try { localStorage.setItem('th_join', jm[1].toUpperCase()); } catch (e) {} location.hash = '#/home'; }
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } });
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') { S.session = session; renderSetPassword(); return; }
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      const had = S.session && S.session.user && S.session.user.id;
      S.session = session;
      if (event !== 'SIGNED_IN' || had !== (session && session.user && session.user.id)) await start();
    }
  });
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  window.addEventListener('hashchange', () => { S.route = (location.hash.slice(2) || 'home').split('/')[0]; render(); });
  await start();
}

async function loadMe() {
  if (!S.session) { S.me = null; return; }
  const { data } = await sb.from('profiles').select('*').eq('id', S.session.user.id).limit(1);
  S.me = (data && data[0]) || null;
  S.team = null;
  if (S.me && S.me.team_id) {
    const { data: t } = await sb.from('teams').select('*').eq('id', S.me.team_id).limit(1);
    S.team = (t && t[0]) || null;
    if (S.me.is_admin) { S.me.is_coach = true; S.me.approved = true; } // the app owner can run any team they open
  }
}

async function start() {
  if (!S.session) { renderAuth('signin'); return; }
  await loadMe();
  S.cache = {};
  S.route = (location.hash.slice(2) || 'home').split('/')[0];
  render();
}

// ------------------------------------------------------------------ auth
const DISCORD_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.7ZM8.3 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm7.4 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>';
async function discordLogin() {
  const { error } = await sb.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: location.origin + location.pathname, scopes: 'identify email' } });
  if (error) toast(error.message);
}
function renderAuth(mode, msg) {
  if (!CFG.ALLOW_EMAIL_LOGIN && mode !== 'email') {
    $('#app').innerHTML = '<div class="auth"><h1>' + esc(TEAM) + '</h1><div class="card stack" style="text-align:center">' +
      '<h2>Sign in</h2><p class="muted">Use your Discord account. New here? After signing in you can register your team, or join your team with the code your coach gives you.</p>' +
      '<button class="btn discord" id="dlogin" style="width:100%">' + DISCORD_SVG + ' Continue with Discord</button>' +
      (msg ? '<div class="' + (msg.ok ? 'ok' : 'error') + '">' + esc(msg.text) + '</div>' : '') + '</div></div>';
    $('#dlogin').onclick = discordLogin;
    return;
  }
  if (mode === 'email') mode = 'signin';
  const signup = mode === 'signup', forgot = mode === 'forgot';
  $('#app').innerHTML =
    '<div class="auth"><h1>' + esc(TEAM) + '</h1><div class="card">' +
    '<h2>' + (signup ? 'Create your account' : forgot ? 'Reset password' : 'Sign in') + '</h2>' +
    '<form id="authform">' +
    (signup ? '<label class="f"><span>Your name</span><input name="display_name" required autocomplete="name"></label>' +
      '<label class="f"><span>In-game name (exactly as in Valorant, without the #tag)</span><input name="ign" required></label>' +
      '<label class="f"><span>Main role</span><select name="role">' + ROLES.map(r => '<option>' + r + '</option>').join('') + '</select></label>' : '') +
    '<label class="f"><span>Email</span><input name="email" type="email" required autocomplete="email"></label>' +
    (forgot ? '' : '<label class="f"><span>Password</span><input name="password" type="password" required minlength="6" autocomplete="' + (signup ? 'new-password' : 'current-password') + '"></label>') +
    '<div id="authmsg" class="' + (msg && msg.ok ? 'ok' : 'error') + '">' + esc(msg ? msg.text : '') + '</div>' +
    '<button class="btn" style="width:100%;margin-top:10px">' + (signup ? 'Create account' : forgot ? 'Email me a reset link' : 'Sign in') + '</button>' +
    '</form><button class="btn discord" id="dlogin" style="width:100%;margin-top:12px">' + DISCORD_SVG + ' Continue with Discord</button><div class="row spread small" style="margin-top:14px">' +
    (signup || forgot ? '<a href="#" data-mode="signin">Back to sign in</a>' : '<a href="#" data-mode="signup">New here? Create an account</a><a href="#" data-mode="forgot">Forgot password?</a>') +
    '</div></div></div>';
  $$('[data-mode]').forEach(a => a.onclick = e => { e.preventDefault(); renderAuth(a.dataset.mode === 'signin' ? 'email' : a.dataset.mode); });
  $('#dlogin').onclick = discordLogin;
  $('#authform').onsubmit = async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('button'); btn.disabled = true;
    const out = $('#authmsg'); out.className = 'error'; out.textContent = '';
    try {
      if (signup) {
        const { data, error } = await sb.auth.signUp({ email: fd.email, password: fd.password,
          options: { data: { display_name: fd.display_name, ign: fd.ign, role: fd.role }, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (!data.session) { renderAuth('signin', { ok: true, text: 'Account created. Check your email to confirm it, then sign in.' }); return; }
      } else if (forgot) {
        const { error } = await sb.auth.resetPasswordForEmail(fd.email, { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        out.className = 'ok'; out.textContent = 'If that email has an account, a reset link is on its way.';
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: fd.email, password: fd.password });
        if (error) throw error;
      }
    } catch (err) { out.textContent = err.message || String(err); }
    btn.disabled = false;
  };
}

function renderSetPassword() {
  $('#app').innerHTML = '<div class="auth"><h1>' + esc(TEAM) + '</h1><div class="card"><h2>Choose a new password</h2>' +
    '<form id="pwform"><label class="f"><span>New password</span><input name="p" type="password" minlength="6" required></label>' +
    '<div id="pwmsg" class="error"></div><button class="btn" style="width:100%">Save password</button></form></div></div>';
  $('#pwform').onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: e.target.p.value });
    if (error) { $('#pwmsg').textContent = error.message; return; }
    toast('Password saved'); location.hash = '#/home'; start();
  };
}

// ---------------------------------------------------------------- layout
const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.5c2.6.2 4.4 2 5 5"/>',
  check: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 12.5l3 3 5-6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5V4.5"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>',
  play: '<rect x="2.5" y="4.5" width="19" height="15" rx="3"/><path d="M10 9v6l5-3z"/>',
  doc: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  globe: '<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c2.6 2.6 3.9 5.8 3.9 9.5s-1.3 6.9-3.9 9.5c-2.6-2.6-3.9-5.8-3.9-9.5S9.4 5.1 12 2.5z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6"/>',
  target: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="1.5"/>'
};
function icon(n) { return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; }
const NAV = [
  { r: 'home', label: 'Home', sec: null, i: 'home', g: 'Team' },
  { r: 'team', label: 'Team', sec: null, i: 'users', g: 'Team' },
  { r: 'checkin', label: 'My check-ins', sec: 'checkin', i: 'check', g: 'Team' },
  { r: 'stats', label: 'My stats', sec: 'my_stats', i: 'chart', g: 'Team' },
  { r: 'workon', label: 'Work on', sec: 'reviews', i: 'target', g: 'Team' },
  { r: 'playbook', label: 'Playbook', sec: ['playbook', 'comms'], i: 'book', g: 'Prepare' },
  { r: 'scouting', label: 'Scouting', sec: 'scouting', i: 'eye', g: 'Prepare' },
  { r: 'comps', label: 'Comp Checker', sec: 'comp_checker', i: 'shield', g: 'Prepare' },
  { r: 'reviews', label: 'VOD reviews', sec: 'reviews', i: 'play', g: 'Prepare' },
  { r: 'patches', label: 'Patch notes', sec: 'patch_notes', i: 'doc', g: 'Prepare' }
];
function navAllowed(n) {
  if (!n.sec) return true;
  if (S.me.is_coach && !S.me.ign && (n.r === 'checkin' || n.r === 'stats')) return false; // coach without an IGN doesn't need these
  return Array.isArray(n.sec) ? n.sec.some(can) : can(n.sec);
}

function render() {
  const me = S.me;
  if (me && !me.team_id) { renderOnboard(); return; }
  if (!me || !me.approved) { renderPending(); return; }
  const items = NAV.filter(navAllowed);
  if (!items.some(n => n.r === S.route) && !(S.route === 'coach' && me.is_coach) && !(S.route === 'owner' && me.is_admin) && S.route !== 'account') S.route = 'home';
  const ownerView = me.is_admin && S.team && S.team.owner_id !== me.id;
  const link = (r, label, i) => '<a href="#/' + r + '" class="' + (S.route === r ? 'active' : '') + '">' + icon(i) + '<span>' + esc(label) + '</span></a>';
  const groups = groupBy(items, 'g');
  const navHtml = groups.map(([g, list]) => '<div class="nav-g">' + esc(g) + '</div>' + list.map(n => link(n.r, n.label, n.i)).join('')).join('') +
    (me.is_coach || me.is_admin ? '<div class="nav-g">Manage</div>' : '') +
    (me.is_coach ? link('coach', 'Coach panel', 'gear') : '') +
    (me.is_admin ? link('owner', 'All teams', 'globe') : '');
  $('#app').innerHTML =
    '<div class="topbar"><button id="menubtn" aria-label="Menu">☰</button><span class="dot"></span><b>' + esc(teamName()) + '</b></div>' +
    '<div class="layout"><aside class="sidebar" id="sidebar"><div class="brand"><span class="dot"></span><span class="bn">' + esc(teamName()) + '</span>' + (S.team && S.team.tag ? '<span class="tag">' + esc(S.team.tag) + '</span>' : '') + '</div>' +
    (ownerView ? '<a href="#/owner" class="ownerbar">Owner view: another team.<br><b>Back to all teams</b></a>' : '') +
    '<nav class="nav">' + navHtml + '</nav>' +
    '<a href="#/account" class="me' + (S.route === 'account' ? ' active' : '') + '">' + avatar(me, 34) + '<div class="grow"><div class="t">' + esc(nameOf(me)) + '</div><div class="small muted">' +
      esc([me.discord ? '@' + me.discord : '', me.is_coach ? 'Coach' : me.role].filter(Boolean).join(' · ')) + '</div></div></a></aside>' +
    '<main class="main" id="main"><div class="muted">Loading…</div></main></div>';
  $('#menubtn').onclick = () => $('#sidebar').classList.toggle('open');
  $$('#sidebar a').forEach(a => a.addEventListener('click', () => $('#sidebar').classList.remove('open')));
  window.scrollTo(0, 0);
  const page = PAGES[S.route] || PAGES.home;
  Promise.resolve(page($('#main'))).catch(err => { $('#main').innerHTML = '<div class="card error">Something went wrong: ' + esc(err.message || err) + '</div>'; console.error(err); });
}

async function renderOnboard() {
  const me = S.me;
  let invites = [];
  try { const { data } = await sb.rpc('my_invites'); invites = data || []; } catch (e) { invites = []; }
  let saved = ''; try { saved = localStorage.getItem('th_join') || ''; } catch (e) {}
  const who = nameOf(me);
  $('#app').innerHTML = '<div class="auth" style="max-width:520px"><h1>' + esc(TEAM) + '</h1>' +
    '<div class="card stack"><h2>Welcome, ' + esc(nameOf(me)) + '</h2><p class="muted small">Signed in as <b>' + esc(who) + '</b>.</p>' +
    (invites.length ? '<div class="stack"><b>You\'ve been added to a roster</b>' + invites.map((v, i) =>
      '<button class="check" style="width:100%;text-align:left;color:inherit;font:inherit" data-inv="' + i + '"><div><div class="t">Join ' + esc(v.team_name) + (v.team_tag ? ' [' + esc(v.team_tag) + ']' : '') + '</div><div class="small muted">as ' + esc(v.slot_name) + '</div></div></button>').join('') + '</div>' : '') +
    '<form id="joinf" class="stack"><b>Join your team</b><p class="small muted">Ask your coach for the team code (Coach panel → Team &amp; invites).</p>' +
    '<div class="row"><input name="code" placeholder="Team code, e.g. 4F9A2C" value="' + esc(saved) + '" style="max-width:220px;text-transform:uppercase" required><button class="btn">Join</button></div></form>' +
    '<div class="sep" style="border-top:1px solid var(--line);margin:6px 0"></div>' +
    '<form id="createf" class="stack"><b>Register a new team</b><p class="small muted">For coaches. You\'ll be the coach and get a code to invite your players. Each team\'s data is private to that team (the app owner can also open it to run and support the app).</p>' +
    '<label class="f"><span>Team name</span><input name="name" required minlength="2" maxlength="40"></label>' +
    '<label class="f"><span>Tag (optional)</span><input name="tag" maxlength="6" style="max-width:120px;text-transform:uppercase"></label>' +
    '<button class="btn">Create team</button></form>' +
    '<div id="obmsg" class="error"></div><button class="btn ghost" id="out">Sign out</button></div></div>';
  const fail = err => { $('#obmsg').textContent = (err && err.message) || String(err); };
  $('#out').onclick = () => sb.auth.signOut();
  $$('[data-inv]').forEach(b => b.onclick = async () => {
    const v = invites[Number(b.dataset.inv)];
    const { data, error } = await sb.rpc('claim_roster', { rid: v.slot_id });
    if (error) return fail(error);
    if (data !== 'approved' && data !== 'pending') return fail('Couldn\'t join (' + data + '). Ask your coach to check your Discord name on the roster.');
    toast('Welcome to ' + v.team_name + '!'); start();
  });
  $('#joinf').onsubmit = async e => {
    e.preventDefault();
    const { data, error } = await sb.rpc('join_team', { p_code: e.target.code.value.trim().toUpperCase() });
    if (error) return fail(error);
    try { localStorage.removeItem('th_join'); } catch (er) {}
    toast('Joined ' + data); S._autoTried = false; start();
  };
  $('#createf').onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.rpc('create_team', { p_name: e.target.name.value, p_tag: e.target.tag.value || null });
    if (error) return fail(error);
    toast('Team created'); location.hash = '#/coach/team'; start();
  };
}

async function renderPending() {
  const me = S.me;
  $('#app').innerHTML = '<div class="auth"><h1>' + esc(TEAM) + '</h1><div class="card"><p class="muted">Loading…</p></div></div>';
  let roster = [];
  try {
    if (me && !S._autoTried) { S._autoTried = true; const { data } = await sb.rpc('auto_claim'); if (data === 'approved') { await start(); return; } }
    const { data } = await sb.from('roster').select('*').order('name'); roster = data || [];
  } catch (e) { roster = []; }
  const mine = me ? roster.find(r => r.claimed_by === me.id) : null;
  const open = roster.filter(r => !r.claimed_by);
  const who = me ? nameOf(me) : '';
  let body;
  if (mine) {
    body = '<h2>Waiting for the coach</h2><p>You picked <b>' + esc(mine.name) + '</b>' + (mine.role ? ' (' + esc(mine.role) + ')' : '') + '. The coach just needs to confirm it\'s you (signed in as <b>' + esc(who) + '</b>).</p>' +
      '<p class="muted small">Picked the wrong name? Choose another below.</p>';
  } else {
    body = '<h2>Which player are you?</h2><p>Signed in as <b>' + esc(who) + '</b>. Tap your name to claim your profile.</p>';
  }
  const list = open.length ? '<div class="stack" style="margin-top:12px">' + open.map(r =>
      '<button class="check" style="width:100%;text-align:left;color:inherit;font:inherit" data-claim="' + r.id + '"><div><div class="t">' + esc(r.name) + '</div>' +
      '<div class="small muted">' + esc([r.ign && r.ign !== r.name ? 'IGN ' + r.ign : '', r.role, r.is_igl ? 'IGL' : '', r.is_trial ? 'Trial' : ''].filter(Boolean).join(' · ')) + '</div></div></button>').join('') + '</div>'
    : (mine ? '' : '<p class="muted">There are no open spots on ' + esc(teamName()) + '\'s roster yet. Ask your coach to add you (Coach panel → Members → Roster slots), then tap refresh.</p>');
  $('#app').innerHTML = '<div class="auth"><h1>' + esc(teamName()) + '</h1><div class="card">' + body + list +
    '<div id="claimmsg" class="error" style="margin-top:8px"></div>' +
    '<div class="row" style="margin-top:14px"><button class="btn" id="refresh">Refresh</button><button class="btn ghost" id="leave">Wrong team? Leave</button><button class="btn ghost" id="out">Sign out</button></div></div></div>';
  $('#refresh').onclick = () => { S._autoTried = false; start(); };
  $('#leave').onclick = async () => { if (!confirm('Leave ' + teamName() + '?')) return; const { error } = await sb.rpc('leave_team'); if (error) { $('#claimmsg').textContent = error.message; return; } start(); };
  $('#out').onclick = () => sb.auth.signOut();
  $$('[data-claim]').forEach(b => b.onclick = async () => {
    const r = open.find(x => x.id === Number(b.dataset.claim));
    if (!confirm('Claim "' + r.name + '" as your profile?')) return;
    const { data, error } = await sb.rpc('claim_roster', { rid: r.id });
    if (error) { $('#claimmsg').textContent = error.message; return; }
    if (data === 'taken') { $('#claimmsg').textContent = 'Someone already claimed that spot. If it\'s you, tell your coach.'; return; }
    if (data === 'already_linked') { $('#claimmsg').textContent = 'Your account is already linked to a player.'; return; }
    toast(data === 'approved' ? 'Welcome, ' + r.name + '!' : 'Claimed — waiting for the coach to confirm');
    await start();
  });
}

// ------------------------------------------------------- generic display
function fieldVal(f, v) {
  if (v == null || v === '') return '';
  switch (f.type) {
    case 'date': return fmtDate(v);
    case 'pct': return pct(v);
    case 'num': return num(v, 2);
    case 'int': return esc(v);
    case 'link': return linkHtml(v, /watch|seen|vod/i.test(f.label) ? 'Watch' : /valoplant/i.test(f.label) ? 'Open in ValoPlant' : null);
    case 'bool': return v ? 'Yes' : 'No';
    case 'long': return inlineMd(v);
    default: return esc(v);
  }
}
function detailFields(cfg, row, skip) {
  return cfg.fields.filter(f => !(skip || []).includes(f.k) && row[f.k] != null && row[f.k] !== '')
    .map(f => '<div class="field"><div class="lbl">' + esc(f.label) + '</div><div class="val">' + fieldVal(f, row[f.k]) + '</div></div>').join('');
}
function sidePill(s) { return s ? '<span class="pill ' + (/att/i.test(s) ? 'red' : /def/i.test(s) ? 'blue' : '') + '">' + esc(s) + '</span>' : ''; }

function filterBar(rows, keys, onChange) {
  const wrap = document.createElement('div'); wrap.className = 'row'; wrap.style.marginBottom = '12px';
  const state = { q: '' };
  const search = document.createElement('input'); search.placeholder = 'Search…'; search.style.maxWidth = '240px';
  search.oninput = () => { state.q = search.value.toLowerCase(); onChange(state); };
  wrap.appendChild(search);
  keys.forEach(k => {
    const vals = Array.from(new Set(rows.map(r => r[k]).filter(Boolean))).sort();
    if (vals.length < 2) return;
    const sel = document.createElement('select'); sel.style.maxWidth = '180px';
    sel.innerHTML = '<option value="">All ' + esc(k.replace(/_/g, ' ')) + 's</option>' + vals.map(v => '<option>' + esc(v) + '</option>').join('');
    sel.onchange = () => { state[k] = sel.value; onChange(state); };
    wrap.appendChild(sel);
  });
  return { el: wrap, apply: list => list.filter(r => keys.every(k => !state[k] || r[k] === state[k]) && (!state.q || JSON.stringify(r).toLowerCase().includes(state.q))) };
}

async function cached(table, opts) {
  const key = table + JSON.stringify(opts || {});
  if (!S.cache[key]) S.cache[key] = await db.list(table, opts);
  return S.cache[key];
}

// ------------------------------------------------------------------ pages
const PAGES = {};

// ---- small UI helpers
const ROLE_PILL = { Duelist: 'red', Initiator: 'green', Controller: 'purple', Sentinel: 'blue', IGL: 'yellow' };
function rolePill(r) { return r ? '<span class="pill ' + (ROLE_PILL[r] || '') + '">' + esc(r) + '</span>' : ''; }
function avatar(p, size) {
  size = size || 36;
  const name = (p && (p.ign || p.name || p.discord)) || '?';
  const st = 'width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.4) + 'px';
  if (p && p.avatar_url) return '<img class="av" src="' + esc(p.avatar_url) + '" alt="" style="' + st + '">';
  const ini = String(name).trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return '<span class="av" style="' + st + '">' + esc(ini) + '</span>';
}
function panel(title, right, body, cls) {
  return '<section class="card panel ' + (cls || '') + '"><div class="card-h"><h2>' + title + '</h2>' + (right || '') + '</div>' + body + '</section>';
}
function nameOf(p) { return (p && (p.ign || p.name || (p.discord ? '@' + p.discord : ''))) || 'Player'; }
function firstName(p) { return nameOf(p); }
function empty(text, action) { return '<div class="empty"><p>' + text + '</p>' + (action || '') + '</div>'; }
function statLine(n, l) { return '<div class="hs"><div class="v">' + n + '</div><div class="l">' + esc(l) + '</div></div>'; }
function checkStatus(r) {
  if (!r) return { label: 'Not yet', cls: '' };
  if (r.warmup === 'Done' && (r.role_drills === 'Done' || r.role_drills == null)) return { label: 'Done', cls: 'green' };
  return { label: 'Partial', cls: 'yellow' };
}
// one entry per player: roster slot + their account (if linked)
async function teamPlayers() {
  const [roster, members] = await Promise.all([cached('roster'), cached('profiles_list')]);
  const byId = new Map(members.map(m => [m.id, m]));
  const out = roster.map(r => {
    const m = r.claimed_by ? byId.get(r.claimed_by) : null;
    return { key: 'r' + r.id, name: r.ign || (m && m.ign) || r.name, ign: r.ign || (m && m.ign), role: r.role || (m && m.role), is_igl: r.is_igl, is_trial: r.is_trial,
      discord: r.discord || (m && m.discord), avatar_url: m && m.avatar_url, user_id: m ? m.id : null, joined: !!(m && r.claim_status === 'approved'), rid: r.id, bench: r.status === 'Bench' };
  });
  members.forEach(m => { if (!m.is_coach && !roster.some(r => r.claimed_by === m.id)) out.push({ key: 'u' + m.id, name: nameOf(m), ign: m.ign, role: m.role, is_igl: m.is_igl, is_trial: m.is_trial, discord: m.discord, avatar_url: m.avatar_url, user_id: m.id, joined: true }); });
  const coaches = members.filter(m => m.is_coach);
  return { players: out.sort((a, b) => (a.is_trial ? 1 : 0) - (b.is_trial ? 1 : 0) || String(a.name).localeCompare(String(b.name))), coaches: coaches };
}
async function kickPlayer(p, done) {
  if (!confirm('Kick ' + p.name + ' from ' + teamName() + '?\n\nThey lose access to the team and their roster spot is removed. Their past stats stay.')) return;
  if (p.user_id) { const { error } = await sb.rpc('remove_member', { uid: p.user_id }); if (error) { toast(error.message); return; } }
  if (p.rid) await sb.from('roster').delete().eq('id', p.rid);
  S.cache = {}; toast(p.name + ' was removed from the team'); if (done) done();
}
async function setBench(p, bench, done) {
  if (!p.rid) { toast('Add ' + p.name + ' to the roster first (Coach panel → Members)'); return; }
  const { error } = await sb.from('roster').update({ status: bench ? 'Bench' : 'Active' }).eq('id', p.rid);
  S.cache = {}; toast(error ? error.message : p.name + (bench ? ' moved to the bench' : ' is back on the active roster')); if (done) done();
}
function statsFor(ps, ign) {
  const rows = ps.filter(r => normName(r.player) === normName(ign));
  if (!rows.length) return null;
  const k = sum(rows, 'kills'), d = sum(rows, 'deaths'), hs = sum(rows, 'hs_kills');
  return { maps: rows.length, k: k, kd: d ? k / d : k, hs: k ? hs / k : null, ths: avg(rows, 'true_hs_pct'), fk: sum(rows, 'first_kills'), fd: sum(rows, 'first_deaths'), a: sum(rows, 'assists') };
}

function pcard(p, ps) {
  const s = ps && p.ign ? statsFor(ps, p.ign) : null;
  const key = p.rid ? 'r' + p.rid : 'u' + p.user_id;
  return '<div class="pcard' + (p.bench ? ' bench' : '') + '">' + avatar(p, 52) + '<div class="nm">' + esc(p.name) + '</div>' +
    '<div class="sub">' + esc([p.ign && p.ign !== p.name ? p.ign : '', p.discord ? '@' + p.discord : ''].filter(Boolean).join(' · ')) + '</div>' +
    '<div class="row" style="justify-content:center;gap:4px">' + rolePill(p.role) + (p.is_igl ? '<span class="pill yellow">IGL</span>' : '') + (p.is_trial ? '<span class="pill yellow">Trial</span>' : '') + (p.bench ? '<span class="pill">Bench</span>' : '') + (!p.user_id ? '<span class="pill">Not joined</span>' : '') + '</div>' +
    (ps ? '<div class="pstats">' + (s ? '<div><b>' + num(s.kd, 2) + '</b><span>K/D</span></div><div><b>' + pct(s.hs) + '</b><span>HS%</span></div><div><b>' + s.maps + '</b><span>Maps</span></div>' : '<div class="muted small" style="grid-column:1/-1">No stats yet</div>') + '</div>' : '') +
    (S.me.is_coach ? '<div class="pact"><button class="btn small ghost" data-bench="' + key + '">' + (p.bench ? 'Make active' : 'Bench') + '</button><button class="btn small ghost danger-t" data-kick="' + key + '">Kick</button></div>' : '') + '</div>';
}

// ---- Daily check-in form (used on Home and the Check-ins page)
async function checkinForm(box, day, onSaved) {
  const me = S.me;
  const [drills, existing] = await Promise.all([cached('drills'), db.list('checkins', { eq: { user_id: me.id, day: day } })]);
  const roles = ['Everyone', me.role || 'Flex'].concat(me.is_igl ? ['IGL'] : []);
  const mine = drills.filter(d => roles.includes(d.role));
  const row = existing[0] || {};
  const done = new Set((row.drills_done || []).map(String));
  let rating = row.rating || 0;
  const v = x => esc(x == null ? '' : x);
  box.innerHTML = '<form class="ciform">' +
    (mine.length ? groupBy(mine, 'role').map(([role, list]) => '<div class="grp"><div class="grp-h">' + esc(role === 'Everyone' ? 'Warm-up & basics' : role + ' drills') + '</div>' +
      list.map(d => '<label class="check' + (done.has(String(d.id)) ? ' done' : '') + '"><input type="checkbox" name="d" value="' + d.id + '"' + (done.has(String(d.id)) ? ' checked' : '') + '>' +
        '<div class="grow"><div class="t">' + esc(d.drill) + '</div>' + (d.how ? '<div class="small muted how">' + esc(d.how) + '</div>' : '') + '</div>' +
        (d.minutes ? '<span class="pill">' + esc(d.minutes) + (/^\d+$/.test(d.minutes) ? ' min' : '') + '</span>' : '') + '</label>').join('') + '</div>').join('')
      : '<p class="muted small">No drills set for your role yet — just fill in the rest.</p>') +
    '<div class="ci-grid"><label class="f"><span>Minutes practised</span><input name="minutes" type="number" min="0" inputmode="numeric" value="' + v(row.minutes) + '"></label>' +
    '<label class="f"><span>Games played</span><input name="games" type="number" min="0" inputmode="numeric" value="' + v(row.games) + '"></label></div>' +
    '<label class="f"><span>How focused were you? <span class="muted">1 = distracted · 5 = locked in</span></span><div class="rating">' + [1, 2, 3, 4, 5].map(n => '<button type="button" data-r="' + n + '" class="' + (rating === n ? 'on' : '') + '">' + n + '</button>').join('') + '</div></label>' +
    '<label class="f"><span>What I worked on</span><input name="worked_on" placeholder="e.g. crosshair placement on Ascent A main" value="' + v(row.worked_on) + '"></label>' +
    '<label class="f"><span>One takeaway for the coach</span><textarea name="takeaway" rows="2" placeholder="What did you learn or notice today?">' + v(row.takeaway) + '</textarea></label>' +
    '<div class="row"><button class="btn">' + (row.id ? 'Update check-in' : 'Submit check-in') + '</button>' + (row.id ? '<span class="pill green">✓ Submitted</span>' : '') + '</div></form>';
  $$('.check input', box).forEach(c => c.onchange = () => c.closest('.check').classList.toggle('done', c.checked));
  $$('.rating button', box).forEach(b => b.onclick = () => { rating = Number(b.dataset.r); $$('.rating button', box).forEach(x => x.classList.toggle('on', x === b)); });
  $('form', box).onsubmit = async e => {
    e.preventDefault();
    const f = e.target, btn = $('button.btn', f); btn.disabled = true;
    const ids = $$('input[name=d]:checked', f).map(c => Number(c.value));
    const status = list => { const n = list.filter(d => ids.includes(d.id)).length; return !list.length ? null : n === 0 ? 'Skipped' : n === list.length ? 'Done' : 'Partial'; };
    const rec = {
      user_id: me.id, day: day, drills_done: ids,
      warmup: status(mine.filter(d => d.role === 'Everyone')),
      role_drills: status(mine.filter(d => d.role !== 'Everyone')),
      minutes: f.minutes.value === '' ? null : Number(f.minutes.value),
      games: f.games.value === '' ? null : Number(f.games.value),
      rating: rating || null, worked_on: f.worked_on.value || null, takeaway: f.takeaway.value || null
    };
    try {
      if (row.id) await db.update('checkins', row.id, rec); else await db.insert('checkins', [rec]);
      toast('Check-in saved'); if (onSaved) onSaved();
    } catch (err) { toast('Couldn\'t save: ' + err.message); btn.disabled = false; }
  };
}

// ---- Home
PAGES.home = async function (el) {
  const me = S.me, coach = me.is_coach;
  const doCheckin = can('checkin') && !(coach && !me.ign);
  const today = todayISO();
  const [ann, team, myHist, todayRows, ps, work] = await Promise.all([
    cached('announcements'), teamPlayers(),
    doCheckin ? db.list('checkins', { eq: { user_id: me.id }, order: 'day', asc: false, limit: 60 }) : Promise.resolve([]),
    coach ? db.list('checkins', { eq: { day: today } }) : Promise.resolve([]),
    can('my_stats') || can('team_stats') ? cached('player_stats') : Promise.resolve([]),
    can('reviews') ? cached('work_on') : Promise.resolve([])
  ]);
  const doneToday = myHist.some(h => String(h.day).slice(0, 10) === today);
  const streak = calcStreak(myHist.map(h => h.day));
  const players = team.players;
  const byUser = new Map(todayRows.map(r => [r.user_id, r]));
  const joined = players.filter(p => p.user_id);
  const doneCount = joined.filter(p => byUser.has(p.user_id)).length;

  // announcements, newest pinned first, duplicates hidden
  const seen = new Set();
  const anns = ann.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.created_at).localeCompare(String(a.created_at)))
    .filter(a => { const k = (a.title || '') + '|' + (a.body || ''); if (seen.has(k)) return false; seen.add(k); return true; });

  const hero = '<div class="hero"><div class="grow"><div class="eyebrow">' + esc(teamName()) + (S.team && S.team.tag && S.team.tag.toLowerCase() !== teamName().toLowerCase() ? ' · ' + esc(S.team.tag) : '') + '</div>' +
    '<h1>Welcome to the team, ' + esc(firstName(me)) + '!</h1><p>' +
    (coach ? (joined.length ? doneCount + ' of ' + joined.length + ' players have checked in today.' : 'Add your players and send them the invite link to get started.')
      : doneToday ? 'Today\'s check-in is done — nice work. Keep the streak going.' : 'Start with today\'s check-in below. It takes about 30 seconds.') + '</p></div>' +
    '<div class="hero-stats">' + (doCheckin ? statLine(streak, streak === 1 ? 'day streak' : 'day streak') : '') + statLine(players.length, 'players') +
    (coach ? statLine(joined.length ? Math.round(doneCount / joined.length * 100) + '%' : '–', 'checked in today') : '') + '</div></div>';

  // coach: today's check-ins
  let coachHtml = '';
  if (coach) {
    const list = players.map(p => {
      const r = p.user_id ? byUser.get(p.user_id) : null; const s = checkStatus(r);
      return '<div class="prow">' + avatar(p, 36) + '<div class="grow"><div class="t">' + esc(p.name) + ' ' + rolePill(p.role) + (p.is_trial ? ' <span class="pill yellow">Trial</span>' : '') + (p.bench ? ' <span class="pill">Bench</span>' : '') + '</div>' +
        (r ? '<div class="small muted">' + esc([r.minutes != null ? r.minutes + ' min' : '', r.games != null ? r.games + ' games' : '', r.rating ? 'focus ' + r.rating + '/5' : ''].filter(Boolean).join(' · ')) + '</div>' +
          (r.takeaway || r.worked_on ? '<div class="small quote">' + esc(r.takeaway || r.worked_on) + '</div>' : '')
          : '<div class="small muted">' + (p.user_id ? 'No check-in yet today' : 'Hasn\'t joined the app yet') + '</div>') +
        '</div>' + (p.user_id ? '<span class="pill ' + s.cls + '">' + s.label + '</span>' : '<span class="pill">Invite</span>') + '</div>';
    }).join('');
    coachHtml = panel('Today\'s check-ins', '<a class="btn small ghost" href="#/coach/checkins">Week view</a>',
      (joined.length ? '<div class="progress"><div style="width:' + Math.round(doneCount / joined.length * 100) + '%"></div></div>' : '') +
      (players.length ? '<div class="plist">' + list + '</div>' : empty('No players on the roster yet.', '<a class="btn small" href="#/coach/members">Add players</a>'))) +
      '<div class="quick">' +
      '<a href="#/coach/team" class="qa"><b>Invite players</b><span>Team code &amp; link</span></a>' +
      '<a href="#/coach/members" class="qa"><b>Roster</b><span>Slots, roles, access</span></a>' +
      '<a href="#/coach/announce" class="qa"><b>Post an update</b><span>Announcement</span></a>' +
      '<a href="#/coach/data" class="qa"><b>Import sheet</b><span>Stats, plays, reviews</span></a></div>';
  }

  // my stats
  let statsHtml = '';
  if (can('my_stats') && me.ign) {
    const s = statsFor(ps, me.ign);
    statsHtml = panel('My stats', '<a class="small" href="#/stats">All →</a>', s ? '<div class="mini-kpis">' + kpi(num(s.kd, 2), 'K/D') + kpi(pct(s.hs), 'HS kill %') + kpi(s.maps, 'Maps') + '</div>' : '<p class="muted small">No stats logged for you yet. They show up after the coach reviews scrims.</p>');
  }
  // roster
  const rosterHtml = panel('The team', '<a class="small" href="#/team">Roster &amp; stats →</a>',
    (team.coaches.length ? '<div class="small muted" style="margin-bottom:6px">Coach' + (team.coaches.length > 1 ? 'es' : '') + ': ' + team.coaches.map(c => esc(nameOf(c))).join(', ') + '</div>' : '') +
    (players.length ? '<div class="plist compact">' + players.slice().sort((a, b) => (a.bench ? 1 : 0) - (b.bench ? 1 : 0)).map(p => '<div class="prow' + (p.bench ? ' benched' : '') + '">' + avatar(p, 28) + '<div class="grow t">' + esc(p.name) + (p.is_igl ? ' <span class="pill yellow">IGL</span>' : '') + (p.is_trial ? ' <span class="pill yellow">Trial</span>' : '') + (p.bench ? ' <span class="pill">Bench</span>' : '') + '</div>' + rolePill(p.role) + '</div>').join('') + '</div>' : '<p class="muted small">No players yet.</p>'));
  const annHtml = panel('From the coach', coach ? '<a class="small" href="#/coach/announce">Post →</a>' : '',
    anns.length ? anns.slice(0, 5).map(a => '<div class="ann">' + (a.pinned ? '<span class="pill red">Pinned</span> ' : '') + '<b>' + esc(a.title) + '</b> <span class="muted small">' + fmtDate(a.created_at) + '</span><div class="md">' + md(a.body) + '</div></div>').join('') : '<p class="muted small">Nothing posted yet.</p>');

  const order = { High: 0, Medium: 1, Low: 2 };
  let focusHtml = '';
  if (can('reviews')) {
    if (coach) {
      const pend = work.filter(w => !w.approved).length;
      if (pend) focusHtml = '<a class="card alert" href="#/coach/work"><b>' + pend + ' work-on suggestion' + (pend === 1 ? '' : 's') + ' from VOD reviews</b><span class="small muted">Approve what each player should work on →</span></a>';
    } else {
      const mineW = work.filter(w => w.approved && w.status !== 'Fixed' && (isMine(w) || isTeamWide(w))).sort((a, b) => (isMine(b) ? 1 : 0) - (isMine(a) ? 1 : 0) || (order[a.priority] ?? 1) - (order[b.priority] ?? 1));
      focusHtml = panel('My focus from VODs', '<a class="small" href="#/workon">All →</a>', mineW.length ? mineW.slice(0, 3).map(w => '<div class="focus"><div class="row" style="gap:6px">' + (w.priority ? '<span class="pill ' + (PRIO[w.priority] || '') + '">' + esc(w.priority) + '</span>' : '') + (w.area ? '<span class="pill blue">' + esc(w.area) + '</span>' : '') + (isTeamWide(w) ? '<span class="pill">Whole team</span>' : '') + '</div><div class="t">' + inlineMd(w.issue || '') + '</div>' + (w.tip ? '<div class="small muted">→ ' + inlineMd(w.tip) + '</div>' : '') + '</div>').join('') + (mineW.length > 3 ? '<a class="small" href="#/workon">+' + (mineW.length - 3) + ' more</a>' : '') : '<p class="muted small">Nothing right now. Your coach adds things to work on from VOD reviews.</p>');
    }
  }
  const ciHtml = doCheckin ? panel('Today\'s check-in', '<span class="muted small">' + new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) + '</span>', '<div id="ci-box"><p class="muted">Loading…</p></div>', 'ci-panel') : '';
  el.innerHTML = hero + '<div class="home-grid"><div class="col">' + (coach ? focusHtml : '') + coachHtml + ciHtml + '</div><div class="col">' + (coach ? '' : focusHtml) + annHtml + statsHtml + rosterHtml + '</div></div>';
  if (doCheckin) {
    const mineToday = myHist.find(h => String(h.day).slice(0, 10) === today);
    const showForm = () => checkinForm($('#ci-box'), today, () => { S.cache = {}; render(); });
    if (mineToday) {
      const r = mineToday;
      $('#ci-box').innerHTML = '<div class="done-box"><div class="big">✓</div><div class="grow"><b>Checked in for today</b><div class="small muted">' +
        esc([r.minutes != null ? r.minutes + ' min practised' : '', r.games != null ? r.games + ' games' : '', r.rating ? 'focus ' + r.rating + '/5' : ''].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="row" style="gap:6px;margin-top:6px">' + (r.warmup ? '<span class="small muted">Warm-up</span> ' + statusPill(r.warmup) : '') + (r.role_drills ? ' <span class="small muted">Role drills</span> ' + statusPill(r.role_drills) : '') + '</div>' +
        (r.takeaway ? '<div class="small quote" style="margin-top:8px">' + esc(r.takeaway) + '</div>' : '') + '</div><button class="btn small ghost" id="ci-edit">Edit</button></div>';
      $('#ci-edit').onclick = showForm;
    } else await showForm();
  }
};
function sum(rows, k) { return rows.reduce((s, r) => s + (Number(r[k]) || 0), 0); }
function avg(rows, k) { const v = rows.map(r => r[k]).filter(x => x != null && x !== '' && !isNaN(x)).map(Number); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
function kpi(v, l) { return '<div class="kpi"><div class="v">' + v + '</div><div class="l">' + esc(l) + '</div></div>'; }

// ---- My check-ins (any day + history)
PAGES.checkin = async function (el) {
  const me = S.me;
  const day = (location.hash.split('/')[2]) || todayISO();
  const history = await db.list('checkins', { eq: { user_id: me.id }, order: 'day', asc: false, limit: 60 });
  const streak = calcStreak(history.map(h => h.day));
  const last7 = []; for (let i = 6; i >= 0; i--) last7.push(addDays(todayISO(), -i));
  const has = new Set(history.map(h => String(h.day).slice(0, 10)));
  el.innerHTML = '<div class="page-h"><div><h1>My check-ins</h1><p class="muted">Fill in today from the Home page, or pick another day here.</p></div></div>' +
    '<div class="kpis">' + kpi(streak, 'Day streak') + kpi(history.filter(h => String(h.day).slice(0, 10) >= addDays(todayISO(), -6)).length + '/7', 'This week') +
    kpi(sum(history.slice(0, 7), 'minutes') || 0, 'Minutes (last 7)') + '</div>' +
    '<div class="week">' + last7.map(d => '<a href="#/checkin/' + d + '" class="day' + (has.has(d) ? ' on' : '') + (d === day ? ' sel' : '') + '"><span>' + new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'short' }) + '</span><b>' + Number(d.slice(8)) + '</b></a>').join('') + '</div>' +
    panel('Check-in for ' + fmtDate(day), '<input type="date" id="day" value="' + day + '" max="' + todayISO() + '" style="width:auto">', '<div id="ci-box"></div>') +
    panel('History', '', history.length ? '<div class="tablewrap"><table><thead><tr><th>Date</th><th>Warm-up</th><th>Role drills</th><th class="num">Min</th><th class="num">Games</th><th class="num">Focus</th><th>Takeaway</th></tr></thead><tbody>' +
      history.slice(0, 30).map(h => '<tr><td><a href="#/checkin/' + h.day + '">' + fmtDate(h.day) + '</a></td><td>' + statusPill(h.warmup) + '</td><td>' + statusPill(h.role_drills) + '</td><td class="num">' + esc(h.minutes == null ? '' : h.minutes) + '</td><td class="num">' + esc(h.games == null ? '' : h.games) + '</td><td class="num">' + esc(h.rating || '') + '</td><td>' + esc(h.takeaway || '') + '</td></tr>').join('') +
      '</tbody></table></div>' : '<p class="muted small">No check-ins yet.</p>');
  $('#day').onchange = e => { location.hash = '#/checkin/' + e.target.value; };
  await checkinForm($('#ci-box'), day, () => render());
};
function statusPill(s) { return s ? '<span class="pill ' + (s === 'Done' ? 'green' : s === 'Partial' ? 'yellow' : 'red') + '">' + esc(s) + '</span>' : ''; }
function groupBy(list, k) { const m = new Map(); list.forEach(x => { const g = x[k] || 'Other'; if (!m.has(g)) m.set(g, []); m.get(g).push(x); }); return Array.from(m.entries()); }
function calcStreak(days) {
  const set = new Set(days.map(d => String(d).slice(0, 10)));
  let d = todayISO(); if (!set.has(d)) d = addDays(d, -1);
  let n = 0; while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

// ---- My stats
PAGES.stats = async function (el) {
  const me = S.me;
  if (!me.ign) { el.innerHTML = '<div class="page-h"><h1>My stats</h1></div>' + empty('Your in-game name isn\'t set yet. Ask the coach to add it (Coach panel → Members) so your stats can be matched to you.'); return; }
  const [ps, uu] = await Promise.all([cached('player_stats'), cached('utility_usage')]);
  const mine = ps.filter(r => normName(r.player) === normName(me.ign));
  const util = uu.filter(r => normName(r.player) === normName(me.ign));
  const k = sum(mine, 'kills'), d = sum(mine, 'deaths'), hs = sum(mine, 'hs_kills');
  el.innerHTML = '<div class="page-h"><div><h1>My stats</h1><p class="muted">Matched to in-game name <b>' + esc(me.ign) + '</b>. Stats come from reviewed scrims and matches.</p></div></div>' +
    (mine.length || util.length ? '' : empty('No stats logged for you yet.')) +
    '<div class="kpis">' + kpi(num(d ? k / d : k, 2), 'K/D') + kpi(k, 'Kills') + kpi(pct(k ? hs / k : null), 'Headshot kill %') + kpi(pct(avg(mine, 'true_hs_pct')), 'True HS %') +
    kpi(sum(mine, 'first_kills') + ' / ' + sum(mine, 'first_deaths'), 'First kills / deaths') + kpi(num(avg(util, 'util_per_round'), 1), 'Util per round') +
    kpi(pct(avg(util, 'util_before_fight')), 'Util before first fight') + kpi(mine.length, 'Maps') + '</div>' +
    (mine.length ? panel('Map by map', '', statsTable(mine, ['date', 'map', 'agent', 'kills', 'deaths', 'assists', 'kd', 'hs_kill_pct', 'true_hs_pct', 'first_kills', 'first_deaths', 'notes'], TABLES.player_stats)) : '') +
    (util.length ? panel('Utility usage', '', statsTable(util, ['date', 'map', 'agent', 'rounds', 'util_per_round', 'q_casts', 'e_casts', 'c_casts', 'ults_used', 'ults_available', 'died_with_util', 'util_before_fight', 'source', 'notes'], TABLES.utility_usage)) : '');
};
function statsTable(rows, keys, cfg) {
  const fs = keys.map(k => cfg.fields.find(f => f.k === k)).filter(Boolean);
  return '<div class="tablewrap"><table><thead><tr>' + fs.map(f => '<th class="' + (/int|num|pct/.test(f.type) ? 'num' : '') + '">' + esc(f.label) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(r => '<tr>' + fs.map(f => '<td class="' + (/int|num|pct/.test(f.type) ? 'num' : '') + '">' + (fieldVal(f, r[f.k]) || '<span class="muted">–</span>') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
}

// ---- Team: roster, leaderboard, matches
PAGES.team = async function (el) {
  const showStats = can('team_stats');
  const tab = location.hash.split('/')[2] || 'roster';
  const [team, ps, uu, matches] = await Promise.all([teamPlayers(), showStats ? cached('player_stats') : [], showStats ? cached('utility_usage') : [], showStats ? cached('matches') : []]);
  const tabs = [['roster', 'Roster']].concat(showStats ? [['leaderboard', 'Leaderboard'], ['matches', 'Matches']] : []);
  const won = matches.filter(m => Number(m.rounds_won) > Number(m.rounds_lost)).length;
  const rw = sum(matches, 'rounds_won'), rl = sum(matches, 'rounds_lost');
  let body = '';
  if (tab === 'roster' || !showStats) {
    body = (team.coaches.length ? '<div class="small muted" style="margin:4px 0 12px">Coaching staff: ' + team.coaches.map(c => '<span class="chip">' + avatar(c, 20) + esc(nameOf(c)) + '</span>').join(' ') + '</div>' : '') +
      (team.players.length ? ['Active roster', 'Bench'].map(sec => { const list = team.players.filter(p => (sec === 'Bench') === !!p.bench);
        if (sec === 'Bench' && !list.length && !S.me.is_coach) return '';
        return '<div class="sec-h"><h2>' + sec + ' <span class="muted small">' + list.length + '</span></h2>' + (sec === 'Bench' ? '<span class="small muted">Bench players keep their access and check-ins.</span>' : '') + '</div>' +
          (list.length ? '<div class="pcards">' + list.map(p => pcard(p, showStats ? ps : null)).join('') + '</div>' : '<p class="muted small">' + (sec === 'Bench' ? 'Nobody on the bench. Use “Bench” on a player to move them here.' : 'No active players.') + '</p>'); }).join('')
        : empty('No players on the roster yet.', S.me.is_coach ? '<a class="btn small" href="#/coach/members">Add players</a>' : ''));
  } else if (tab === 'leaderboard') {
    const names = new Map();
    ps.forEach(r => { const n = normName(r.player); if (n && !names.has(n)) names.set(n, String(r.player).replace(/\s*\*\s*trial\s*$/i, '')); });
    const byIgn = new Map(team.players.filter(p => p.ign).map(p => [normName(p.ign), p]));
    const lb = Array.from(names.entries()).map(([n, name]) => { const s = statsFor(ps, name); const p = byIgn.get(n); const u = uu.filter(r => normName(r.player) === n);
      return Object.assign(s, { name: p ? p.name : name, p: p || { name: name }, trial: (p && p.is_trial) || ps.some(r => normName(r.player) === n && isTrialName(r.player)), role: p ? p.role : '', upr: avg(u, 'util_per_round'), ubf: avg(u, 'util_before_fight') }); })
      .sort((a, b) => b.kd - a.kd);
    body = lb.length ? '<div class="tablewrap"><table><thead><tr><th>#</th><th>Player</th><th class="num">Maps</th><th class="num">K/D</th><th class="num">Kills</th><th class="num">Assists</th><th class="num">HS kill %</th><th class="num">True HS %</th><th class="num">First K / D</th><th class="num">Util / round</th><th class="num">Util before fight</th></tr></thead><tbody>' +
      lb.map((p, i) => '<tr><td><span class="rank r' + (i + 1) + '">' + (i + 1) + '</span></td><td><div class="row" style="gap:8px;flex-wrap:nowrap">' + avatar(p.p, 26) + '<b>' + esc(p.name) + '</b> ' + rolePill(p.role) + (p.trial ? ' <span class="pill yellow">Trial</span>' : '') + '</div></td><td class="num">' + p.maps + '</td><td class="num"><b>' + num(p.kd, 2) + '</b></td><td class="num">' + p.k + '</td><td class="num">' + p.a + '</td><td class="num">' + pct(p.hs) + '</td><td class="num">' + pct(p.ths) + '</td><td class="num">' + p.fk + ' / ' + p.fd + '</td><td class="num">' + num(p.upr, 1) + '</td><td class="num">' + pct(p.ubf) + '</td></tr>').join('') +
      '</tbody></table></div><p class="small muted">Sorted by K/D. Stats come from reviewed scrims and matches.</p>' : empty('No player stats logged yet. Import them from your sheet (Coach panel → Content & import).');
  } else {
    const maps = groupBy(matches, 'map').map(([m, list]) => { const w = list.filter(x => Number(x.rounds_won) > Number(x.rounds_lost)).length; return { m: m, n: list.length, w: w, rw: sum(list, 'rounds_won'), rl: sum(list, 'rounds_lost') }; }).sort((a, b) => b.n - a.n);
    body = matches.length ? '<div class="kpis">' + kpi(won + '–' + (matches.length - won), 'Map record') + kpi(pct(rw + rl ? rw / (rw + rl) : null), 'Round win %') + kpi(matches.length, 'Maps played') + '</div>' +
      panel('By map', '', '<div class="tablewrap"><table><thead><tr><th>Map</th><th class="num">Played</th><th class="num">Won</th><th class="num">Win %</th><th class="num">Rounds</th></tr></thead><tbody>' +
        maps.map(x => '<tr><td><b>' + esc(x.m) + '</b></td><td class="num">' + x.n + '</td><td class="num">' + x.w + '</td><td class="num">' + pct(x.n ? x.w / x.n : null) + '</td><td class="num">' + x.rw + '–' + x.rl + '</td></tr>').join('') + '</tbody></table></div>') +
      panel('All matches', '', statsTable(matches, ['date', 'event', 'opponent', 'map', 'rounds_won', 'rounds_lost', 'start_side', 'vod_link', 'notes'], TABLES.matches))
      : empty('No matches logged yet.');
  }
  el.innerHTML = '<div class="page-h"><div><h1>' + esc(teamName()) + '</h1><p class="muted">' + team.players.length + ' player' + (team.players.length === 1 ? '' : 's') +
    (showStats && matches.length ? ' · ' + won + '–' + (matches.length - won) + ' on maps' : '') + '</p></div></div>' +
    (tabs.length > 1 ? '<div class="tabs">' + tabs.map(t => '<a href="#/team/' + t[0] + '" class="' + ((tab === t[0] || (t[0] === 'roster' && !tabs.some(x => x[0] === tab))) ? 'active' : '') + '">' + t[1] + '</a>').join('') + '</div>' : '') + body;
  const find = k => team.players.find(p => (p.rid ? 'r' + p.rid : 'u' + p.user_id) === k);
  $$('[data-bench]', el).forEach(b => b.onclick = () => { const p = find(b.dataset.bench); setBench(p, !p.bench, render); });
  $$('[data-kick]', el).forEach(b => b.onclick = () => kickPlayer(find(b.dataset.kick), render));
};

// ---- Playbook
PAGES.playbook = async function (el) {
  const tabs = [];
  if (can('playbook')) tabs.push(['plays', 'Set plays'], ['pistols', 'Pistol rounds']);
  if (can('comms')) tabs.push(['comms', 'Comms guide']);
  const sub = location.hash.split('/')[2] || tabs[0][0];
  el.innerHTML = '<div class="page-h"><h1>Playbook</h1></div><div class="tabs">' + tabs.map(t => '<button data-t="' + t[0] + '" class="' + (t[0] === sub ? 'active' : '') + '">' + t[1] + '</button>').join('') + '</div><div id="pb"></div>';
  $$('.tabs button', el).forEach(b => b.onclick = () => { location.hash = '#/playbook/' + b.dataset.t; });
  const box = $('#pb');
  if (sub === 'comms') {
    const g = (await cached('guides')).filter(x => (x.section || 'comms') === 'comms');
    box.innerHTML = g.length ? g.map(x => '<div class="card" style="margin-bottom:12px"><h2>' + esc(x.title) + '</h2>' + md(x.body) + '</div>').join('') : '<p class="muted">No comms guide yet.</p>';
    return;
  }
  const table = sub === 'pistols' ? 'pistol_rounds' : 'set_plays';
  const cfg = TABLES[table];
  const rows = await cached(table);
  if (!rows.length) { box.innerHTML = '<p class="muted">Nothing here yet. The coach adds ' + (sub === 'pistols' ? 'pistol breakdowns' : 'set plays') + ' from VOD reviews.</p>'; return; }
  const fb = filterBar(rows, sub === 'pistols' ? ['map', 'side'] : ['map', 'side', 'type'], () => draw());
  box.appendChild(fb.el);
  const list = document.createElement('div'); box.appendChild(list);
  function draw() {
    list.innerHTML = fb.apply(rows).map(r => {
      const title = sub === 'pistols' ? esc(r.team || '') + ' — ' + esc(r.map || '') + ' R' + esc(r.round || '') : esc(r.play_name);
      const meta = [r.map && sub !== 'pistols' ? '<span class="pill">' + esc(r.map) + '</span>' : '', sidePill(r.side), r.type ? '<span class="pill purple">' + esc(r.type) + '</span>' : '',
        r.result ? '<span class="pill ' + (r.result === 'Won' ? 'green' : 'red') + '">' + esc(r.result) + '</span>' : '', r.valoplant ? linkHtml(r.valoplant, 'Open in ValoPlant') : ''].join(' ');
      return '<details class="item"><summary><div class="t">' + title + '</div><div class="row small" style="margin-top:4px">' + meta + '</div></summary><div class="body">' +
        detailFields(cfg, r, sub === 'pistols' ? ['team', 'map', 'side', 'round', 'result'] : ['play_name', 'map', 'side', 'type']) + '</div></details>';
    }).join('') || '<p class="muted">No matches for that filter.</p>';
  }
  draw();
};

// ---- Scouting
PAGES.scouting = async function (el) {
  const sub = location.hash.split('/')[2] || 'opponents';
  el.innerHTML = '<div class="page-h"><h1>Scouting</h1></div><div class="tabs"><button data-t="opponents" class="' + (sub === 'opponents' ? 'active' : '') + '">Opponents</button><button data-t="comps" class="' + (sub === 'comps' ? 'active' : '') + '">Comp notes</button></div><div id="sc"></div>';
  $$('.tabs button', el).forEach(b => b.onclick = () => { location.hash = '#/scouting/' + b.dataset.t; });
  const box = $('#sc');
  const table = sub === 'comps' ? 'comp_notes' : 'opponent_scouting';
  const cfg = TABLES[table];
  const rows = await cached(table);
  if (!rows.length) { box.innerHTML = '<p class="muted">Nothing here yet.</p>'; return; }
  const fb = filterBar(rows, sub === 'comps' ? ['map', 'team'] : ['opponent', 'map'], () => draw());
  box.appendChild(fb.el);
  const list = document.createElement('div'); box.appendChild(list);
  function draw() {
    list.innerHTML = fb.apply(rows).map(r => {
      const title = sub === 'comps' ? esc(r.team || '') + ' — ' + [r.a1, r.a2, r.a3, r.a4, r.a5].filter(Boolean).map(esc).join(', ') : esc(r.opponent || '');
      const meta = [r.map ? '<span class="pill">' + esc(r.map) + '</span>' : '', r.date ? '<span class="muted">' + fmtDate(r.date) + '</span>' : '', r.result ? '<span class="pill">' + esc(r.result) + '</span>' : ''].join(' ');
      return '<details class="item"><summary><div class="t">' + title + '</div><div class="row small" style="margin-top:4px">' + meta + '</div></summary><div class="body">' +
        detailFields(cfg, r, sub === 'comps' ? ['a1', 'a2', 'a3', 'a4', 'a5', 'team', 'map', 'date', 'result'] : ['opponent', 'map', 'date']) + '</div></details>';
    }).join('') || '<p class="muted">No matches for that filter.</p>';
  }
  draw();
};

// ---- Comp Checker
const COMP_RULES = [
  { test: c => c.smokes === 0, text: 'NO SMOKES: they can\'t block sightlines. Take long-range fights, hold long angles and the Operator, and make them dry-peek you on executes and retakes.' },
  { test: c => c.smokes === 1, text: c => 'ONE SMOKER (' + c.smokers[0] + '): kill them first or bait their smokes early. Once their smokes are gone or they\'re dead, they can\'t execute or retake through smoke — hit or retake then.' },
  { test: c => c.smokes >= 2, text: 'DOUBLE SMOKES: strong executes and retakes but less firepower. Take space early before smokes go down, punish slow defaults, and play post-plant from spots their smokes don\'t cover.' },
  { test: c => c.flash === 0, text: 'NO FLASHES: they have to dry-swing or use other util to take fights. Hold tight angles and off-angles in crossfires and swing back after they peek.' },
  { test: c => c.recon === 0, text: 'NO RECON: they only learn where you are by contact. Fakes, lurks, stacks and off-angles work; stay quiet and don\'t show early.' },
  { test: c => c.stall === 0, text: 'NO STALL / FLANK WATCH: lurk behind them and hit their backs. On defense their sites are held by bodies only, so fast hits and splits overwhelm them.' },
  { test: c => c.entry >= 2, text: c => 'AIM-HEAVY (' + c.entry + ' entry agents): light on team util. Don\'t take 1v1 dry duels — use util to win fights 2v1, play retakes and trades.' },
  { test: c => c.entry === 0, text: 'NO ENTRY: their site takes are slow. Use early aggression and info on defense, and stack the site they lean on — they struggle to make space.' },
  { test: c => c.heal === 0, text: 'NO HEALS: damage sticks. Play for chip damage (spam smokes, wallbang common spots) and fight them after they\'ve taken damage.' }
];
function compAnalysis(agentRows) {
  const Y = k => agentRows.filter(a => String(a[k] || '').toUpperCase().startsWith('Y'));
  const c = { smokes: Y('smokes').length, smokers: Y('smokes').map(a => a.agent), flash: Y('flash').length, recon: Y('recon').length, recons: Y('recon').map(a => a.agent),
    stall: Y('stall').length, entry: Y('entry').length, heal: Y('heal').length };
  const notes = COMP_RULES.filter(r => r.test(c)).map(r => typeof r.text === 'function' ? r.text(c) : r.text);
  notes.push('KILL PRIORITY: ' + (c.smokes === 1 ? c.smokers[0] + ' (their only smokes)' : c.recon === 1 ? c.recons[0] + ' (their only info)' : 'their entry — trade them instantly'));
  return notes;
}
PAGES.comps = async function (el) {
  const agents = await cached('agent_counters');
  const notes = can('scouting') ? await cached('comp_notes') : [];
  const names = agents.map(a => a.agent).filter(Boolean).sort();
  const sel = JSON.parse(sessionStorage.getItem('compSel') || '{"a":["","","","",""],"side":"Attacking"}');
  el.innerHTML = '<div class="page-h"><h1>Comp Checker</h1></div><p class="muted">Pick the enemy comp and your side. It shows each agent\'s weakness, how to beat it, and what the whole comp is missing.</p>' +
    '<div class="card"><div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">' +
    sel.a.map((v, i) => '<label class="f"><span>Enemy ' + (i + 1) + '</span><select data-i="' + i + '"><option value="">—</option>' + names.map(n => '<option' + (n === v ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></label>').join('') +
    '<label class="f"><span>We are</span><select id="side"><option' + (sel.side === 'Attacking' ? ' selected' : '') + '>Attacking</option><option' + (sel.side === 'Defending' ? ' selected' : '') + '>Defending</option></select></label></div></div>' +
    '<div id="cc" style="margin-top:16px"></div>' +
    '<h2 style="margin-top:28px">Agent counters</h2><div id="ac"></div>';
  const out = $('#cc');
  function draw() {
    sessionStorage.setItem('compSel', JSON.stringify(sel));
    const picked = sel.a.filter(Boolean).map(n => agents.find(a => a.agent === n)).filter(Boolean);
    if (picked.length < 5) { out.innerHTML = '<p class="muted">Pick all 5 enemy agents.</p>'; return; }
    const beatKey = sel.side === 'Defending' ? 'beat_attack' : 'beat_defense';
    const lc = new Set(picked.map(a => a.agent.toLowerCase()));
    let best = null;
    notes.forEach(n => { const s = [n.a1, n.a2, n.a3, n.a4, n.a5].filter(x => x && lc.has(String(x).toLowerCase())).length; if (s >= 3 && (!best || s > best.s)) best = { s: s, n: n }; });
    out.innerHTML = '<h2>Whole-comp weaknesses to exploit</h2>' + compAnalysis(picked).map(t => '<div class="warnbox">' + esc(t) + '</div>').join('') +
      '<h2 style="margin-top:18px">Each agent</h2><div class="tablewrap"><table><thead><tr><th>Agent</th><th>Weakness</th><th>How we beat it (' + (sel.side === 'Defending' ? 'we defend' : 'we attack') + ')</th><th>Smk</th><th>Fls</th><th>Rec</th><th>Stl</th><th>Ent</th><th>Heal</th></tr></thead><tbody>' +
      picked.map(a => '<tr><td><b>' + esc(a.agent) + '</b><div class="muted small">' + esc(a.role || '') + '</div></td><td>' + inlineMd(a.weaknesses || '') + '</td><td>' + inlineMd(a[beatKey] || '') + '</td>' +
        ['smokes', 'flash', 'recon', 'stall', 'entry', 'heal'].map(k => '<td><span class="flag ' + (String(a[k] || 'N').toUpperCase().startsWith('Y') ? 'Y' : 'N') + '">' + (String(a[k] || 'N').toUpperCase().startsWith('Y') ? 'Y' : 'N') + '</span></td>').join('') + '</tr>').join('') +
      '</tbody></table></div>' +
      (can('scouting') ? '<h2 style="margin-top:18px">Seen before in our VODs</h2>' + (best ? '<div class="card"><b>' + best.s + '/5 agents match</b> — ' + esc(best.n.team || '') + ' on ' + esc(best.n.map || '') + ' (' + esc(best.n.result || '') + ')' + '<div style="margin-top:6px">' + inlineMd(best.n.weaknesses || '') + '</div>' + (best.n.watch ? '<div style="margin-top:6px">' + linkHtml(best.n.watch, 'Watch') + '</div>' : '') + '</div>' : '<p class="muted">No similar comp in our notes yet.</p>') : '');
  }
  $$('select[data-i]', el).forEach(s => s.onchange = () => { sel.a[Number(s.dataset.i)] = s.value; draw(); });
  $('#side').onchange = e => { sel.side = e.target.value; draw(); };
  draw();
  $('#ac').innerHTML = agents.map(a => '<details class="item"><summary><div class="t">' + esc(a.agent) + ' <span class="pill">' + esc(a.role || '') + '</span></div></summary><div class="body">' + detailFields(TABLES.agent_counters, a, ['agent', 'role', 'smokes', 'flash', 'recon', 'stall', 'entry', 'heal']) + '</div></details>').join('');
};

// ---- Reviews
// ---- video helpers (YouTube + Twitch)
function urlOf(v) { if (!v) return null; const s = String(v); const m = s.match(/\]\((https?:[^)\s]+)\)/) || s.match(/https?:\/\/[^\s)\]]+/); return m ? (m[1] || m[0]) : null; }
function tsToSec(t) {
  if (t == null || t === '') return 0; t = String(t).replace(/^'/, '').trim();
  if (/^\d+$/.test(t)) return Number(t);
  if (/[hms]/i.test(t)) { const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i); if (m) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0); }
  const p = t.split(':').map(Number); if (p.some(isNaN)) return 0; return p.reduce((a, b) => a * 60 + b, 0);
}
function fmtTs(sec) { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s2 = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s2).padStart(2, '0'); }
function videoInfo(v) {
  const u = urlOf(v); if (!u) return null; let x; try { x = new URL(u); } catch (e) { return null; }
  const h = x.hostname.replace(/^(www|m)\./, '');
  if (h === 'youtu.be') return { kind: 'yt', id: x.pathname.slice(1), t: tsToSec(x.searchParams.get('t')), url: u };
  if (h.endsWith('youtube.com')) { const id = x.searchParams.get('v') || (x.pathname.match(/\/(?:embed|live|shorts)\/([\w-]+)/) || [])[1]; if (id) return { kind: 'yt', id: id, t: tsToSec(x.searchParams.get('t') || x.searchParams.get('start')), url: u }; }
  if (h.endsWith('twitch.tv')) { const m = x.pathname.match(/\/videos\/(\d+)/); if (m) return { kind: 'tw', id: m[1], t: tsToSec(x.searchParams.get('t')), url: u }; }
  return { kind: 'link', url: u };
}
function embedSrc(vi, sec) {
  sec = Math.max(0, Math.round(sec || 0));
  if (vi.kind === 'yt') return 'https://www.youtube.com/embed/' + vi.id + '?rel=0&start=' + sec + (sec ? '&autoplay=1' : '');
  if (vi.kind === 'tw') return 'https://player.twitch.tv/?video=v' + vi.id + '&parent=' + location.hostname + '&time=' + Math.floor(sec / 3600) + 'h' + Math.floor(sec % 3600 / 60) + 'm' + (sec % 60) + 's&autoplay=' + (sec ? 'true' : 'false');
  return null;
}
function thumbHtml(vi) {
  if (vi && vi.kind === 'yt') return '<div class="thumb" style="background-image:url(https://i.ytimg.com/vi/' + encodeURIComponent(vi.id) + '/hqdefault.jpg)"><span class="play">▶</span></div>';
  return '<div class="thumb ph' + (vi && vi.kind === 'tw' ? ' tw' : '') + '"><span class="play">▶</span><span class="src">' + (vi && vi.kind === 'tw' ? 'Twitch' : 'VOD') + '</span></div>';
}
function sameVideo(a, b) { const x = videoInfo(a), y = videoInfo(b); return !!(x && y && x.id && x.kind === y.kind && x.id === y.id); }
function isOurs(r) { return r.whose === 'Our team' || r.whose === 'Opponent (vs us)' || (!r.whose && /scrim|premier|tournament|qualifier/i.test(r.type || '')); }
function workFor(r, items) {
  return items.filter(w => (r.vod && w.watch && sameVideo(w.watch, r.vod)) || (r.date && w.date && String(w.date).slice(0, 10) === String(r.date).slice(0, 10) && w.source && r.opponent && normName(w.source).includes(normName(r.opponent).split(/[ ,(]/)[0])));
}
const PRIO = { High: 'red', Medium: 'yellow', Low: '' };
const WSTAT = { Open: '', 'Working on it': 'yellow', Fixed: 'green' };
function isMine(w) { const me = S.me; return !!(w.player && me && [me.ign, me.display_name].filter(Boolean).some(n => normName(n) === normName(w.player))); }
function isTeamWide(w) { return !w.player || /^(team|whole team|everyone|all)$/i.test(String(w.player).trim()); }
function workCard(w, opts) {
  opts = opts || {};
  const canMark = !opts.coachView && w.approved && isMine(w);
  const vi = videoInfo(w.watch);
  return '<div class="wcard' + (w.status === 'Fixed' ? ' fixed' : '') + '" data-w="' + w.id + '">' +
    '<div class="row" style="gap:6px;margin-bottom:6px">' + (w.priority ? '<span class="pill ' + (PRIO[w.priority] || '') + '">' + esc(w.priority) + '</span>' : '') +
      (w.area ? '<span class="pill blue">' + esc(w.area) + '</span>' : '') + '<span class="pill">' + esc(isTeamWide(w) ? 'Whole team' : w.player) + '</span>' +
      (opts.coachView && !w.approved ? '<span class="pill purple">Needs approval</span>' : '') + '<span class="grow"></span>' +
      (canMark || opts.coachView ? '<select class="wstat" data-wid="' + w.id + '">' + ['Open', 'Working on it', 'Fixed'].map(x => '<option' + (x === (w.status || 'Open') ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>' : '<span class="pill ' + (WSTAT[w.status] || '') + '">' + esc(w.status || 'Open') + '</span>') + '</div>' +
    '<div class="wi"><span class="lbl">Mistake</span>' + inlineMd(w.issue || '') + '</div>' +
    (w.tip ? '<div class="wt"><span class="lbl">How to avoid it</span>' + inlineMd(w.tip) + '</div>' : '') +
    (w.drill ? '<div class="small muted" style="margin-top:6px">Drill: ' + inlineMd(w.drill) + '</div>' : '') +
    '<div class="small muted row" style="margin-top:8px;gap:10px">' + (w.date ? '<span>' + fmtDate(w.date) + '</span>' : '') + (w.source ? '<span>' + esc(w.source) + '</span>' : '') +
      (vi ? (opts.onSeek && vi.id ? '<button type="button" class="linkbtn" data-seek="' + (vi.t || 0) + '">▶ Watch ' + fmtTs(vi.t || 0) + '</button>' : '<a href="' + esc(vi.url) + '" target="_blank" rel="noopener">▶ Watch the moment</a>') : '') + '</div>' +
    (opts.coachView ? '<div class="row" style="margin-top:10px;gap:6px">' + (!w.approved ? '<button class="btn small" data-wapprove="' + w.id + '">Approve for ' + esc(isTeamWide(w) ? 'team' : w.player) + '</button>' : '<button class="btn small ghost" data-wunapprove="' + w.id + '">Hide from player</button>') +
      '<button class="btn small ghost" data-wedit="' + w.id + '">Edit</button><button class="btn small ghost" data-wdel="' + w.id + '">' + (w.approved ? 'Delete' : 'Dismiss') + '</button></div>' : '') + '</div>';
}
function wireWork(box, items, refresh) {
  $$('.wstat', box).forEach(sel => sel.onchange = async () => {
    const { error } = await sb.rpc('set_work_status', { wid: Number(sel.dataset.wid), new_status: sel.value });
    toast(error ? error.message : sel.value === 'Fixed' ? 'Nice — marked fixed' : 'Updated'); S.cache = {}; if (refresh) refresh();
  });
  $$('[data-wapprove]', box).forEach(b => b.onclick = async () => { await db.update('work_on', Number(b.dataset.wapprove), { approved: true }); S.cache = {}; toast('Approved — the player can see it now'); refresh(); });
  $$('[data-wunapprove]', box).forEach(b => b.onclick = async () => { await db.update('work_on', Number(b.dataset.wunapprove), { approved: false }); S.cache = {}; toast('Hidden from the player'); refresh(); });
  $$('[data-wedit]', box).forEach(b => b.onclick = () => editRow('work_on', items.find(w => w.id === Number(b.dataset.wedit)), () => { S.cache = {}; refresh(); }));
  $$('[data-wdel]', box).forEach(b => b.onclick = async () => { if (!confirm('Remove this item?')) return; await db.remove('work_on', Number(b.dataset.wdel)); S.cache = {}; refresh(); });
}

// ---- VOD reviews: list + one review with the video beside the notes
PAGES.reviews = async function (el) {
  const id = Number(location.hash.split('/')[2]) || null;
  const [rows, work] = await Promise.all([cached('reviews'), cached('work_on')]);
  if (id) return reviewDetail(el, rows.find(r => r.id === id), work);
  const f = location.hash.split('/')[3] || '';
  const filt = f === 'ours' ? rows.filter(isOurs) : f === 'pro' ? rows.filter(r => !isOurs(r)) : rows;
  el.innerHTML = '<div class="page-h"><div><h1>VOD reviews</h1><p class="muted">Watch the VOD with the notes beside it. Timestamps jump the video to that moment.</p></div>' +
    (S.me.is_coach ? '<button class="btn small" id="addrev">Add a review</button>' : '') + '</div>' +
    '<div class="tabs"><a href="#/reviews" class="' + (!f ? 'active' : '') + '">All</a><a href="#/reviews/0/ours" class="' + (f === 'ours' ? 'active' : '') + '">Our scrims &amp; matches</a><a href="#/reviews/0/pro" class="' + (f === 'pro' ? 'active' : '') + '">Pro &amp; other teams</a></div>' +
    (filt.length ? '<div class="vgrid">' + filt.map(r => { const vi = videoInfo(r.vod); const n = workFor(r, work).filter(w => w.status !== 'Fixed').length;
      return '<a class="vcard" href="#/reviews/' + r.id + '">' + thumbHtml(vi) + '<div class="vb"><div class="t">' + esc(r.title || 'VOD review') + '</div>' +
        '<div class="row small" style="gap:6px;margin-top:6px">' + (r.date ? '<span class="muted">' + fmtDate(r.date) + '</span>' : '') + (r.type ? '<span class="pill">' + esc(r.type) + '</span>' : '') + (r.map ? '<span class="pill">' + esc(r.map) + '</span>' : '') +
        (n ? '<span class="pill red">' + n + ' to work on</span>' : '') + '</div></div></a>'; }).join('') + '</div>'
      : empty(rows.length ? 'Nothing in this list yet.' : 'No reviews yet. They show up here after the coach imports the VOD Queue tab, or adds one.'));
  if ($('#addrev')) $('#addrev').onclick = () => editRow('reviews', null, () => { S.cache = {}; render(); });
};
async function reviewDetail(el, r, work) {
  if (!r) { el.innerHTML = empty('That review isn\'t here any more.', '<a class="btn small" href="#/reviews">All reviews</a>'); return; }
  const vi = videoInfo(r.vod), items = workFor(r, work), start = vi ? (vi.t || tsToSec(r.starts_at)) : 0;
  const canEmbed = vi && (vi.kind === 'yt' || vi.kind === 'tw');
  el.innerHTML = '<div class="page-h"><div><a href="#/reviews" class="small">← All reviews</a><h1 style="margin-top:6px">' + esc(r.title || 'VOD review') + '</h1>' +
    '<div class="row small" style="gap:6px">' + (r.date ? '<span class="muted">' + fmtDate(r.date) + '</span>' : '') + (r.type ? '<span class="pill">' + esc(r.type) + '</span>' : '') + (r.map ? '<span class="pill">' + esc(r.map) + '</span>' : '') +
    (r.pov ? '<span class="pill">POV: ' + esc(r.pov) + '</span>' : '') + (r.whose ? '<span class="pill ' + (isOurs(r) ? 'green' : '') + '">' + esc(r.whose) + '</span>' : '') + '</div></div>' +
    '<div class="row">' + (vi ? '<a class="btn small ghost" href="' + esc(vi.url) + '" target="_blank" rel="noopener">Open on ' + (vi.kind === 'tw' ? 'Twitch' : vi.kind === 'yt' ? 'YouTube' : 'site') + '</a>' : '') +
    (S.me.is_coach && r.link ? linkHtml(r.link, 'Full review (coach)').replace('<a ', '<a class="btn small ghost" ') : '') + (S.me.is_coach ? '<button class="btn small ghost" id="editrev">Edit</button>' : '') + '</div></div>' +
    '<div class="review-grid"><div class="vcol"><div class="player">' + (canEmbed ? '<iframe id="vplayer" src="' + esc(embedSrc(vi, start)) + '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>' : '<div class="noembed">' + (vi ? '<a class="btn" href="' + esc(vi.url) + '" target="_blank" rel="noopener">Watch the VOD</a>' : 'No video link on this review.') + '</div>') + '</div>' +
      (start ? '<div class="small muted" style="margin-top:6px">Game starts at <button class="linkbtn" data-seek="' + start + '">' + fmtTs(start) + '</button></div>' : '') + '</div>' +
    '<div class="ncol">' +
      (r.summary ? panel('Key takeaways', '', '<div class="md takeaways">' + md(String(r.summary).replace(/\s(\d\))\s/g, '\n$1 ')) + '</div>') : '') +
      (items.length ? panel('What we need to work on', '<a class="small" href="#/workon">All →</a>', items.map(w => workCard(w, { onSeek: true, coachView: S.me.is_coach })).join('')) : '') +
      (r.body ? panel('Notes &amp; tips', '', '<div class="md notes">' + md(r.body) + '</div>') : (!r.summary && !items.length ? empty('No notes on this review yet.') : '')) +
    '</div></div>';
  // timestamps in the notes become buttons that seek the video
  if (canEmbed) {
    $$('.notes, .takeaways', el).forEach(box => {
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT); const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(n => { if (n.parentNode.closest('a,button') || !/\b\d{1,2}:\d{2}(?::\d{2})?\b/.test(n.nodeValue)) return;
        const span = document.createElement('span');
        span.innerHTML = esc(n.nodeValue).replace(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g, (m0, t) => '<button type="button" class="ts" data-seek="' + tsToSec(t) + '">' + t + '</button>');
        n.parentNode.replaceChild(span, n); });
      $$('a', box).forEach(a => { const v2 = videoInfo(a.href); if (v2 && v2.id && v2.id === vi.id) { a.dataset.seek = v2.t || 0; } });
    });
    el.addEventListener('click', e => { const t = e.target.closest('[data-seek]'); if (!t) return; e.preventDefault();
      $('#vplayer').src = embedSrc(vi, Number(t.dataset.seek)); $('#vplayer').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  }
  wireWork(el, items, () => render());
  if ($('#editrev')) $('#editrev').onclick = () => editRow('reviews', r, () => { S.cache = {}; render(); });
}

// ---- Work on: mistakes from VODs and how to avoid them
PAGES.workon = async function (el) {
  const me = S.me, coach = me.is_coach;
  const items = (await cached('work_on')).filter(w => coach ? w.approved : true);
  const who = location.hash.split('/')[2] || (coach ? 'all' : 'me');
  const showFixed = location.hash.split('/')[3] === 'fixed';
  const players = Array.from(new Set(items.filter(w => !isTeamWide(w)).map(w => String(w.player).trim()))).sort();
  let list = who === 'me' ? items.filter(w => isMine(w) || isTeamWide(w)) : who === 'team' ? items.filter(isTeamWide) : who === 'all' ? items : items.filter(w => normName(w.player) === normName(decodeURIComponent(who)));
  const open = list.filter(w => w.status !== 'Fixed'), fixed = list.filter(w => w.status === 'Fixed');
  const order = { High: 0, Medium: 1, Low: 2 };
  open.sort((a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1) || String(b.date || '').localeCompare(String(a.date || '')));
  const tab = (k, l) => '<a href="#/workon/' + encodeURIComponent(k) + '" class="' + (who === k ? 'active' : '') + '">' + esc(l) + '</a>';
  el.innerHTML = '<div class="page-h"><div><h1>Work on</h1><p class="muted">Mistakes from our VODs and how to avoid them next time. ' + (coach ? 'Players see the items you approve (Coach panel → Work on).' : 'Mark yours as you work on them.') + '</p></div>' +
    (coach ? '<a class="btn small" href="#/coach/work">Review suggestions</a>' : '') + '</div>' +
    '<div class="kpis">' + kpi(open.filter(w => w.status !== 'Working on it').length, 'Open') + kpi(open.filter(w => w.status === 'Working on it').length, 'Working on it') + kpi(fixed.length, 'Fixed') + '</div>' +
    '<div class="tabs">' + (coach ? '' : tab('me', 'Mine')) + tab('all', 'Everything') + tab('team', 'Whole team') + players.map(p => tab(p, p)).join('') + '</div>' +
    (open.length ? '<div class="wgrid">' + open.map(w => workCard(w)).join('') + '</div>' : empty(list.length ? 'Everything here is fixed. 💪' : (coach ? 'Nothing approved yet. Approve suggestions from the VOD reviews in Coach panel → Work on.' : 'Nothing to work on right now. Your coach adds items from VOD reviews.'))) +
    (fixed.length ? '<details class="item" style="margin-top:16px"' + (showFixed ? ' open' : '') + '><summary><span class="t">Fixed (' + fixed.length + ')</span></summary><div class="body"><div class="wgrid">' + fixed.map(w => workCard(w)).join('') + '</div></div></details>' : '');
  wireWork(el, items, () => render());
};

// Coach: approve what each player sees
async function coachWork(box) {
  const items = await db.list('work_on', { order: 'date' });
  const pending = items.filter(w => !w.approved), live = items.filter(w => w.approved && w.status !== 'Fixed');
  const byPlayer = groupBy(pending, 'player');
  box.innerHTML = '<div class="row spread" style="margin-bottom:10px"><p class="muted small" style="margin:0;max-width:720px">Mistakes found in VOD reviews land here first. <b>Approve</b> the ones you want each player to work on (you can edit the wording), and <b>dismiss</b> the rest. Players only ever see approved items, on their Home page and in Work on.</p>' +
    '<button class="btn small" id="addw">Add an item</button></div>' +
    '<h2>Waiting for approval <span class="pill purple">' + pending.length + '</span></h2>' +
    (pending.length ? byPlayer.map(([p, list]) => '<h3 style="margin-top:14px">' + esc(isTeamWide({ player: p === 'Other' ? '' : p }) ? 'Whole team' : p) + ' <span class="muted small">' + list.length + '</span>' +
      (list.length > 1 ? ' <button class="btn small ghost" data-approveall="' + esc(p) + '">Approve all ' + list.length + '</button>' : '') + '</h3><div class="wgrid">' + list.map(w => workCard(w, { coachView: true })).join('') + '</div>').join('')
      : empty('Nothing waiting. New suggestions arrive when you import the Work On tab from your sheet (Content & import).')) +
    '<h2 style="margin-top:24px">Live for players <span class="pill green">' + live.length + '</span></h2>' +
    (live.length ? '<div class="wgrid">' + live.map(w => workCard(w, { coachView: true })).join('') + '</div>' : '<p class="muted small">None yet.</p>');
  wireWork(box, items, () => COACH.work(box));
  $$('[data-approveall]', box).forEach(b => b.onclick = async () => { const p = b.dataset.approveall;
    for (const w of pending.filter(x => (x.player || 'Other') === p)) await db.update('work_on', w.id, { approved: true });
    S.cache = {}; toast('Approved'); COACH.work(box); });
  $('#addw').onclick = () => editRow('work_on', { approved: true, status: 'Open', priority: 'Medium', date: todayISO() }, () => { S.cache = {}; COACH.work(box); });
};

// ---- Patch notes
PAGES.patches = async function (el) {
  const rows = await cached('patch_notes');
  el.innerHTML = '<div class="page-h"><h1>Patch notes</h1></div>' + (rows.length ? '' : '<p class="muted">No patch notes yet.</p>');
  groupBy(rows, 'patch').forEach(([p, list]) => {
    el.insertAdjacentHTML('beforeend', '<div class="card" style="margin-bottom:12px"><h2>Patch ' + esc(p) + ' <span class="muted small">' + fmtDate(list[0].date) + '</span></h2>' +
      list.map(r => '<div style="margin:8px 0"><span class="pill ' + ({ Buff: 'green', Nerf: 'red', New: 'purple', Mixed: 'yellow' }[r.effect] || '') + '">' + esc(r.effect || r.category || '') + '</span> <b>' + esc(r.item || '') + '</b> — ' + esc(r.changed || '') +
        (r.coach_notes ? '<div class="small muted">Coach: ' + esc(r.coach_notes) + '</div>' : '') + '</div>').join('') + '</div>');
  });
};

// ---- Account
PAGES.account = async function (el) {
  const me = S.me;
  el.innerHTML = '<div class="page-h"><h1>Account</h1></div><div class="card stack" style="max-width:520px"><div><b>' + esc(nameOf(me)) + '</b></div>' +
    '<div class="small">In-game name: <b>' + esc(me.ign || '—') + '</b> · Role: <b>' + esc(me.role || '—') + '</b>' + (me.is_igl ? ' · IGL' : '') + '</div>' +
    '<div class="small">Team: <b>' + esc(teamName()) + '</b>' + (me.is_coach ? ' · Coach' : '') + '</div>' +
    '<p class="muted small">The coach manages your name, role and what you can see.</p>' +
    '<form id="pw" class="stack"><label class="f"><span>New password</span><input name="p" type="password" minlength="6" required></label><button class="btn ghost">Change password</button></form>' +
    '<div class="row"><button class="btn danger" id="so">Sign out</button><button class="btn ghost" id="lt">Leave ' + esc(teamName()) + '</button></div></div>' +
    '<div class="card" style="max-width:520px;margin-top:14px"><b>Install the app</b><p class="small muted">Phone: open this site in Safari (iPhone) or Chrome (Android) → Share / menu → <b>Add to Home Screen</b>. Computer: in Chrome or Edge click the install icon at the right end of the address bar.</p></div>';
  $('#so').onclick = () => sb.auth.signOut();
  $('#lt').onclick = async () => {
    if (!confirm('Leave ' + teamName() + '? You\'ll lose access to its data until a coach lets you back in.')) return;
    const { error } = await sb.rpc('leave_team'); if (error) { toast(error.message); return; }
    location.hash = '#/home'; start();
  };
  $('#pw').onsubmit = async e => { e.preventDefault(); const { error } = await sb.auth.updateUser({ password: e.target.p.value }); toast(error ? error.message : 'Password changed'); e.target.reset(); };
};

// ------------------------------------------------------------ coach panel
PAGES.coach = async function (el) {
  if (!S.me.is_coach) { el.innerHTML = '<p>Coach only.</p>'; return; }
  const sub = location.hash.split('/')[2] || 'members';
  const tabs = [['members', 'Members'], ['work', 'Work on'], ['team', 'Team & invites'], ['checkins', 'Check-ins'], ['announce', 'Announcements'], ['data', 'Content & import']];
  el.innerHTML = '<div class="page-h"><h1>Coach panel</h1></div><div class="tabs">' + tabs.map(t => '<button data-t="' + t[0] + '" class="' + (t[0] === sub ? 'active' : '') + '">' + t[1] + '</button>').join('') + '</div><div id="cp"></div>';
  $$('.tabs button', el).forEach(b => b.onclick = () => { location.hash = '#/coach/' + b.dataset.t; });
  await (COACH[sub] || COACH.members)($('#cp'));
};

const COACH = {};
COACH.work = coachWork;

COACH.members = async function (box) {
  const [{ data: members }, { data: rosterData }] = await Promise.all([
    sb.from('profiles').select('*').order('created_at', { ascending: true }),
    sb.from('roster').select('*').order('name')
  ]);
  const list = members || [];
  const roster = rosterData || [];
  const slotOf = id => roster.find(r => r.claimed_by === id);
  const pending = list.filter(m => !m.approved);
  box.innerHTML = '<h2>Roster slots</h2><p class="muted small">Add a slot for each player (and trialist) with their <b>Discord username</b>. When they sign in with that Discord account the slot is linked to them automatically. If the Discord name doesn\'t match, they can still claim it and you confirm it below.</p>' +
    rosterTable(roster, list) +
    '<h2 style="margin-top:24px">Accounts</h2><p class="muted small">Everyone who has signed in. Set in-game name (must match your stats sheet), role, and what they can see.</p>' +
    (pending.length ? '<div class="warnbox">' + pending.length + ' waiting for approval</div>' : '') +
    list.map(m => memberCard(m, slotOf(m.id))).join('') +
    '<div class="card" style="margin-top:14px"><b>Set what everyone sees</b><p class="small muted">Applies to every player (not you). You can still change single players above.</p>' +
    '<div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">' + Object.keys(SECTIONS).map(k => '<label class="row small"><input type="checkbox" data-all="' + k + '" checked> ' + esc(SECTIONS[k]) + '</label>').join('') + '</div>' +
    '<button class="btn ghost" id="applyall" style="margin-top:10px">Apply to all players</button></div>';
  $$('form.member', box).forEach(f => f.onsubmit = async e => {
    e.preventDefault();
    const id = f.dataset.id;
    const vis = {}; Object.keys(SECTIONS).forEach(k => vis[k] = !!f.querySelector('[data-vis="' + k + '"]').checked);
    const patch = { ign: f.ign.value || null, role: f.role.value, is_igl: f.is_igl.checked, is_trial: f.is_trial.checked, approved: f.approved.checked, visibility: vis };
    if (f.is_coach) patch.is_coach = f.is_coach.checked;
    const { error } = await sb.from('profiles').update(patch).eq('id', id);
    toast(error ? 'Error: ' + error.message : 'Saved'); S.cache = {};
    if (!error && id === S.me.id) await loadMe();
  });
  $$('[data-approve]', box).forEach(b => b.onclick = async e => {
    e.preventDefault(); e.stopPropagation();
    const { error } = await sb.from('profiles').update({ approved: true }).eq('id', b.dataset.approve);
    if (!error) await sb.from('roster').update({ claim_status: 'approved' }).eq('claimed_by', b.dataset.approve);
    toast(error ? error.message : 'Approved'); COACH.members(box);
  });
  wireRoster(box, roster, () => COACH.members(box));
  $$('[data-remove]', box).forEach(b => b.onclick = async () => {
    if (!confirm('Remove this person from the team? They lose access to the team (they can join again with the code if you approve them).')) return;
    const { error } = await sb.rpc('remove_member', { uid: b.dataset.remove });
    toast(error ? error.message : 'Removed'); COACH.members(box);
  });
  $('#applyall').onclick = async () => {
    const vis = {}; $$('[data-all]', box).forEach(c => vis[c.dataset.all] = c.checked);
    const { error } = await sb.from('profiles').update({ visibility: vis }).eq('is_coach', false);
    toast(error ? error.message : 'Updated everyone'); COACH.members(box);
  };
};
function memberCard(m, slot) {
  const me = m.id === S.me.id;
  const vis = m.visibility || {};
  return '<details class="item"' + (!m.approved ? ' open' : '') + '><summary><div class="row spread"><div><span class="t">' + esc(nameOf(m)) + '</span> ' +
    (m.is_coach ? '<span class="pill red">Coach</span> ' : '') + (!m.approved ? '<span class="pill yellow">Waiting</span> ' : '') + (m.is_trial ? '<span class="pill yellow">Trial</span> ' : '') +
    '<span class="muted small">' + esc([m.discord ? '@' + m.discord : '', m.ign || 'no IGN', m.role || '', m.is_igl ? 'IGL' : ''].filter(Boolean).join(' · ')) + '</span>' +
    (slot ? ' <span class="pill ' + (slot.claim_status === 'approved' ? 'green' : 'yellow') + '">' + (slot.claim_status === 'approved' ? 'Linked to ' : 'Claims ') + esc(slot.name) + '</span>' : (m.is_coach ? '' : ' <span class="pill">No roster slot</span>')) + '</div>' +
    (!m.approved ? '<button class="btn small" data-approve="' + m.id + '">' + (slot ? 'Confirm' : 'Approve') + '</button>' : '') + '</div></summary>' +
    '<div class="body"><form class="member" data-id="' + m.id + '"><div class="muted small" style="margin-bottom:8px">' + esc(m.discord ? 'Discord @' + m.discord : '') + ' · joined ' + fmtDate(m.created_at) + '</div>' +
    '<div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">' +
        '<label class="f"><span>In-game name (matches stats)</span><input name="ign" value="' + esc(m.ign || '') + '"></label>' +
    '<label class="f"><span>Role</span><select name="role">' + ROLES.map(r => '<option' + (r === m.role ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></label></div>' +
    '<div class="row" style="margin-bottom:10px">' +
    '<label class="row small"><input type="checkbox" name="approved"' + (m.approved ? ' checked' : '') + (me ? ' disabled' : '') + '> Approved</label>' +
    '<label class="row small"><input type="checkbox" name="is_igl"' + (m.is_igl ? ' checked' : '') + '> IGL</label>' +
    '<label class="row small"><input type="checkbox" name="is_trial"' + (m.is_trial ? ' checked' : '') + '> Trial player</label>' +
    (me ? '' : '<label class="row small"><input type="checkbox" name="is_coach"' + (m.is_coach ? ' checked' : '') + '> Coach (full access)</label>') + '</div>' +
    '<div class="lbl small muted" style="margin-bottom:6px">CAN SEE</div><div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px">' +
    Object.keys(SECTIONS).map(k => '<label class="row small"><input type="checkbox" data-vis="' + k + '"' + (vis[k] !== false ? ' checked' : '') + (m.is_coach ? ' disabled' : '') + '> ' + esc(SECTIONS[k]) + '</label>').join('') + '</div>' +
    '<div class="row" style="margin-top:12px"><button class="btn small">Save</button>' + (me ? '' : '<button type="button" class="btn small danger" data-remove="' + m.id + '">Kick from team</button>') + '</div></form></div></details>';
}

function rosterTable(roster, members) {
  const byId = new Map(members.map(m => [m.id, m]));
  const row = r => {
    const who = r.claimed_by ? byId.get(r.claimed_by) : null;
    const status = !r.claimed_by ? '<span class="pill">Open</span>' : r.claim_status === 'approved' ? '<span class="pill green">Linked</span>' : '<span class="pill yellow">Waiting for you</span>';
    return '<tr data-rid="' + (r.id || '') + '">' +
      '<td><input data-f="ign" value="' + esc(r.ign || '') + '" placeholder="In-game name"></td>' +
      '<td><input data-f="discord" value="' + esc(r.discord || '') + '" placeholder="discord username"></td>' +
      '<td><select data-f="role">' + ROLES.map(x => '<option' + (x === (r.role || 'Flex') ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></td>' +
      '<td style="text-align:center"><input type="checkbox" data-f="is_igl"' + (r.is_igl ? ' checked' : '') + '></td>' +
      '<td style="text-align:center"><input type="checkbox" data-f="is_trial"' + (r.is_trial ? ' checked' : '') + '></td>' +
      '<td><select data-f="status" style="min-width:96px">' + ['Active', 'Bench'].map(x => '<option' + (x === (r.status || 'Active') ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></td>' +
      '<td>' + (r.id ? status + (who ? '<div class="small muted">' + esc(nameOf(who)) + '</div>' : '') : '') + '</td>' +
      '<td style="white-space:nowrap">' + (r.id ? '<button class="btn small ghost" data-rsave>Save</button> ' + (r.claimed_by ? '<button class="btn small ghost" data-runlink>Unlink</button> <button class="btn small danger" data-rkick>Kick</button>' : '<button class="btn small danger" data-rdel title="Delete slot">×</button>') : '<button class="btn small" data-rsave>Add</button>') + '</td></tr>';
  };
  return '<div class="tablewrap"><table><thead><tr><th>In-game name</th><th>Discord username</th><th>Role</th><th>IGL</th><th>Trial</th><th>Roster</th><th>Status</th><th></th></tr></thead><tbody>' +
    roster.map(row).join('') + row({}) + '</tbody></table></div>';
}
function wireRoster(box, roster, refresh) {
  const read = tr => {
    const v = {}; $$('[data-f]', tr).forEach(i => v[i.dataset.f] = i.type === 'checkbox' ? i.checked : (i.value.trim() || null));
    if (v.discord) v.discord = v.discord.replace(/^@/, '').replace(/#0+$/, '');
    return v;
  };
  $$('[data-rsave]', box).forEach(b => b.onclick = async () => {
    const tr = b.closest('tr'); const v = read(tr); const id = Number(tr.dataset.rid);
    v.name = v.ign || v.discord; if (!v.name) { toast('Add an in-game name or Discord username'); return; }
    const res = id ? await sb.from('roster').update(v).eq('id', id) : await sb.from('roster').insert([v]);
    if (!res.error && id) { const r = roster.find(x => x.id === id); if (r && r.claimed_by) await sb.from('profiles').update({ ign: v.ign, role: v.role, is_igl: v.is_igl, is_trial: v.is_trial }).eq('id', r.claimed_by); }
    toast(res.error ? res.error.message : 'Saved'); S.cache = {}; refresh();
  });
  $$('[data-runlink]', box).forEach(b => b.onclick = async () => {
    const id = Number(b.closest('tr').dataset.rid); const r = roster.find(x => x.id === id);
    if (!confirm('Unlink this slot from its account? That account loses access until it claims a slot again.')) return;
    await sb.from('roster').update({ claimed_by: null, claim_status: null }).eq('id', id);
    if (r && r.claimed_by) await sb.from('profiles').update({ approved: false }).eq('id', r.claimed_by).eq('is_coach', false);
    toast('Unlinked'); refresh();
  });
  $$('[data-rkick]', box).forEach(b => b.onclick = () => { const r = roster.find(x => x.id === Number(b.closest('tr').dataset.rid));
    kickPlayer({ name: nameOf(r), rid: r.id, user_id: r.claimed_by }, refresh); });
  $$('[data-rdel]', box).forEach(b => b.onclick = async () => {
    if (!confirm('Delete this roster slot?')) return;
    await sb.from('roster').delete().eq('id', Number(b.closest('tr').dataset.rid)); toast('Deleted'); refresh();
  });
}

COACH.team = async function (box) {
  const t = S.team || {};
  const link = location.origin + location.pathname + '#/join/' + (t.join_code || '');
  box.innerHTML = '<div class="card stack" style="max-width:620px"><h2>Invite players</h2>' +
    '<p class="small muted">Send players this link or the code. After they sign in with Discord they land on your team and pick their roster slot. If you put their Discord username on a roster slot (Members tab) they\'re let in automatically; otherwise you approve them.</p>' +
    '<div class="row"><div class="kpi"><div class="v" style="letter-spacing:3px">' + esc(t.join_code || '—') + '</div><div class="l">Team code</div></div></div>' +
    '<div class="row"><input id="jl" value="' + esc(link) + '" readonly><button class="btn small" id="cp1">Copy link</button></div>' +
    '<div><button class="btn ghost small" id="nc">Make a new code</button> <span class="small muted">Old code and link stop working.</span></div></div>' +
    '<div class="card stack" style="max-width:620px;margin-top:14px"><h2>Team details</h2><form id="tf" class="stack">' +
    '<label class="f"><span>Team name</span><input name="name" value="' + esc(t.name || '') + '" required minlength="2" maxlength="40"></label>' +
    '<label class="f"><span>Tag</span><input name="tag" value="' + esc(t.tag || '') + '" maxlength="6" style="max-width:120px;text-transform:uppercase"></label>' +
    '<button class="btn">Save</button></form><p class="small muted">Only your team can see your team\'s data. Other teams using the app can\'t see it. The app owner can open any team to run and support the app.</p></div>';
  $('#cp1').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch (e) { $('#jl').select(); toast('Press Ctrl+C to copy'); } };
  $('#nc').onclick = async () => {
    if (!confirm('Make a new code? Anyone with the old code or link won\'t be able to join with it.')) return;
    const { error } = await sb.rpc('new_join_code'); if (error) { toast(error.message); return; }
    await loadMe(); COACH.team(box);
  };
  $('#tf').onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.from('teams').update({ name: e.target.name.value.trim(), tag: e.target.tag.value.trim().toUpperCase() || null }).eq('id', t.id);
    toast(error ? error.message : 'Saved'); if (!error) { await loadMe(); render(); }
  };
};

PAGES.owner = async function (el) {
  if (!S.me.is_admin) { el.innerHTML = '<p>Owner only.</p>'; return; }
  const { data, error } = await sb.rpc('admin_teams');
  if (error) { el.innerHTML = '<div class="card error">' + esc(error.message) + '</div>'; return; }
  const teams = data || [];
  el.innerHTML = '<div class="page-h"><h1>All teams</h1></div><p class="muted small">Every team registered on the app. Open one to see it exactly as its coach does (you count as a coach there). You\'re currently in <b>' + esc(teamName()) + '</b>.</p>' +
    '<div class="kpis">' + kpi(teams.length, 'Teams') + kpi(teams.reduce((s, t) => s + Number(t.members || 0), 0), 'Members') + kpi(teams.reduce((s, t) => s + Number(t.checkins_7d || 0), 0), 'Check-ins (7 days)') + '</div>' +
    (teams.length ? '<div class="tablewrap" style="margin-top:14px"><table><thead><tr><th>Team</th><th>Created by</th><th class="num">Coaches</th><th class="num">Members</th><th class="num">Waiting</th><th class="num">Check-ins 7d</th><th>Last check-in</th><th>Created</th><th></th></tr></thead><tbody>' +
      teams.map(t => '<tr' + (S.team && t.id === S.team.id ? ' style="background:rgba(255,70,85,.08)"' : '') + '><td><b>' + esc(t.name) + '</b>' + (t.tag ? ' <span class="pill">' + esc(t.tag) + '</span>' : '') + '<div class="small muted">code ' + esc(t.join_code) + '</div></td><td>' + esc(t.owner || '—') + '</td>' +
        '<td class="num">' + t.coaches + '</td><td class="num">' + t.members + '</td><td class="num">' + t.waiting + '</td><td class="num">' + t.checkins_7d + '</td><td>' + (t.last_checkin ? fmtDate(t.last_checkin) : '—') + '</td><td>' + fmtDate(t.created_at) + '</td>' +
        '<td style="white-space:nowrap">' + (S.team && t.id === S.team.id ? '<span class="pill green">Open now</span>' : '<button class="btn small" data-open="' + t.id + '">Open</button>') + ' <button class="btn small danger" data-tdel="' + t.id + '">Delete</button></td></tr>').join('') +
      '</tbody></table></div>' : '<p class="muted">No teams yet.</p>') +
    '<p class="small muted" style="margin-top:14px">To make a team of your own, open your team and use it as normal. Deleting a team removes all of its data and sends its members back to the join screen.</p>';
  $$('[data-open]', el).forEach(b => b.onclick = async () => {
    const { error: e2 } = await sb.rpc('admin_open_team', { tid: Number(b.dataset.open) });
    if (e2) { toast(e2.message); return; }
    location.hash = '#/home'; start();
  });
  $$('[data-tdel]', el).forEach(b => b.onclick = async () => {
    const t = teams.find(x => x.id === Number(b.dataset.tdel));
    const typed = prompt('This deletes "' + t.name + '" and ALL its data (stats, reviews, check-ins…). It can\'t be undone.\n\nType the team name to confirm:');
    if (typed == null) return;
    if (typed.trim() !== t.name) { toast('Name didn\'t match — nothing deleted'); return; }
    const { error: e3 } = await sb.rpc('admin_delete_team', { tid: t.id });
    toast(e3 ? e3.message : 'Team deleted'); await loadMe(); if (!S.me.team_id) { start(); return; } PAGES.owner(el);
  });
};

COACH.checkins = async function (box) {
  const [{ data: members }, rows] = await Promise.all([
    sb.from('profiles').select('*').eq('approved', true).order('display_name'),
    db.list('checkins', { order: 'day', asc: false, gte: { day: addDays(todayISO(), -30) } })
  ]);
  const days = []; for (let i = 6; i >= 0; i--) days.push(addDays(todayISO(), -i));
  const byKey = new Map(rows.map(r => [r.user_id + '|' + String(r.day).slice(0, 10), r]));
  const players = (members || []).filter(m => !m.is_coach || rows.some(r => r.user_id === m.id));
  const name = id => { const m = (members || []).find(x => x.id === id); return m ? nameOf(m) : 'Unknown'; };
  box.innerHTML = '<div class="row spread"><h2>Last 7 days</h2><button class="btn ghost small" id="csv">Download CSV (for the sheet)</button></div>' +
    '<div class="card" style="overflow-x:auto"><div class="daygrid"><div></div>' + days.map(d => '<div class="muted small" style="text-align:center">' + new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'short' }) + '</div>').join('') +
    players.map(m => '<div>' + esc(nameOf(m)) + (m.is_trial ? ' <span class="pill yellow">Trial</span>' : '') + '</div>' + days.map(d => { const r = byKey.get(m.id + '|' + d); return '<div class="c ' + (r ? (r.role_drills === 'Done' && r.warmup === 'Done' ? 'y' : 'p') : '') + '">' + (r ? (r.minutes ? r.minutes + 'm' : '✓') : '–') + '</div>'; }).join('')).join('') +
    '</div><p class="small muted">Green = warm-up and role drills done · amber = partial · – = no check-in.</p></div>' +
    '<h2 style="margin-top:20px">Latest takeaways</h2>' +
    (rows.length ? '<div class="tablewrap"><table><thead><tr><th>Date</th><th>Player</th><th>Warm-up</th><th>Role drills</th><th class="num">Min</th><th class="num">Games</th><th class="num">Focus</th><th>Worked on</th><th>Takeaway</th></tr></thead><tbody>' +
      rows.slice(0, 60).map(r => '<tr><td>' + fmtDate(r.day) + '</td><td>' + esc(name(r.user_id)) + '</td><td>' + statusPill(r.warmup) + '</td><td>' + statusPill(r.role_drills) + '</td><td class="num">' + esc(r.minutes == null ? '' : r.minutes) + '</td><td class="num">' + esc(r.games == null ? '' : r.games) + '</td><td class="num">' + esc(r.rating || '') + '</td><td>' + esc(r.worked_on || '') + '</td><td>' + esc(r.takeaway || '') + '</td></tr>').join('') +
      '</tbody></table></div>' : '<p class="muted">No check-ins in the last 30 days.</p>');
  $('#csv').onclick = async () => {
    const all = await db.list('checkins', { order: 'day', asc: true, limit: 5000 });
    const head = ['Date', 'Player', 'Warm-up', 'Role drills', 'Minutes', 'Games played', 'What I worked on', 'One takeaway', 'Focus (1-5)'];
    const lines = [head].concat(all.map(r => [String(r.day).slice(0, 10), name(r.user_id), r.warmup || '', r.role_drills || '', r.minutes == null ? '' : r.minutes, r.games == null ? '' : r.games, r.worked_on || '', r.takeaway || '', r.rating || '']));
    download('check-ins.csv', lines.map(l => l.map(csvCell).join(',')).join('\n'));
  };
};
function csvCell(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function download(name, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

COACH.announce = async function (box) {
  const rows = await db.list('announcements');
  box.innerHTML = '<div class="card"><form id="an"><label class="f"><span>Title</span><input name="title" required></label>' +
    '<label class="f"><span>Message (you can use **bold**, lists and links)</span><textarea name="body"></textarea></label>' +
    '<label class="row small" style="margin-bottom:10px"><input type="checkbox" name="pinned"> Pin to the top</label>' +
    (S.me.is_admin ? '<label class="row small" style="margin-bottom:10px"><input type="checkbox" name="everyone"> Show to every team (owner)</label>' : '') + '<button class="btn">Post</button></form></div>' +
    '<h2 style="margin-top:18px">Posted</h2>' + (rows.length ? rows.map(a => '<div class="card row spread" style="margin-bottom:8px"><div><b>' + esc(a.title) + '</b> ' + (a.pinned ? '<span class="pill red">Pinned</span>' : '') + (a.team_id == null ? ' <span class="pill">All teams</span>' : '') + '<div class="small muted">' + fmtDate(a.created_at) + '</div></div>' + (a.team_id == null && !S.me.is_admin ? '' : '<button class="btn small danger" data-del="' + a.id + '">Delete</button>') + '</div>').join('') : '<p class="muted">Nothing yet.</p>');
  $('#an').onsubmit = async e => {
    e.preventDefault();
    const rec = { title: e.target.title.value, body: e.target.body.value, pinned: e.target.pinned.checked };
    if (e.target.everyone && e.target.everyone.checked) rec.team_id = null;
    try { await db.insert('announcements', [rec]); S.cache = {}; toast('Posted'); COACH.announce(box); }
    catch (err) { toast(err.message); }
  };
  $$('[data-del]', box).forEach(b => b.onclick = async () => { if (!confirm('Delete this announcement?')) return; await db.remove('announcements', Number(b.dataset.del)); S.cache = {}; COACH.announce(box); });
};

// ---- Content manager + workbook import
COACH.data = async function (box) {
  const keys = Object.keys(TABLES).filter(canEdit);
  const counts = await Promise.all(keys.map(async k => { const { count } = await sb.from(k).select('id', { count: 'exact', head: true }); return count || 0; }));
  const cur = location.hash.split('/')[3] || '';
  box.innerHTML = '<div class="card"><h2>Import from your coaching workbook</h2>' +
    '<p class="small muted">Download your Team Hub sheet as an Excel file (.xlsx) and pick it here. Tabs with these names are read: ' +
    keys.filter(k => TABLES[k].sheet).map(k => '<b>' + esc(TABLES[k].sheet) + '</b>').join(', ') + '. You choose per tab whether to replace what\'s in the app or add to it.</p>' +
    '<input type="file" id="wb" accept=".xlsx,.xls,.csv" style="max-width:360px"><div id="wbout" style="margin-top:12px"></div></div>' +
    '<h2 style="margin-top:20px">Edit content</h2><div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">' +
    keys.map((k, i) => '<a class="card" style="text-decoration:none;color:inherit' + (k === cur ? ';border-color:var(--accent)' : '') + '" href="#/coach/data/' + k + '"><b>' + esc(TABLES[k].label) + '</b><div class="muted small">' + counts[i] + ' rows</div></a>').join('') +
    '</div><div id="tm" style="margin-top:18px"></div>';
  $('#wb').onchange = e => { const f = e.target.files[0]; if (f) importFile(f, $('#wbout'), () => COACH.data(box)); };
  if (cur && TABLES[cur] && canEdit(cur)) await tableManager(cur, $('#tm'), () => COACH.data(box));
};

async function tableManager(table, box, refresh) {
  const cfg = TABLES[table];
  const rows = await db.list(table);
  const show = cfg.fields.slice(0, 4);
  box.innerHTML = '<div class="row spread"><h2>' + esc(cfg.label) + '</h2><div class="row"><button class="btn small" id="add">Add row</button>' +
    '<button class="btn small ghost" id="clr">Delete all</button></div></div>' +
    (rows.length ? '<div class="tablewrap"><table><thead><tr>' + show.map(f => '<th>' + esc(f.label) + '</th>').join('') + '<th></th></tr></thead><tbody>' +
      rows.map(r => '<tr>' + show.map(f => '<td>' + (fieldVal(f, r[f.k]) || '') + '</td>').join('') + '<td style="white-space:nowrap">' +
        (cfg.builtin && r.team_id == null && !S.me.is_admin ? '<span class="pill" title="Shown to every team; add your own rows to customise">Built-in</span>' :
          (cfg.builtin && r.team_id == null ? '<span class="pill">Built-in</span> ' : '') + '<button class="btn small ghost" data-edit="' + r.id + '">Edit</button> <button class="btn small danger" data-del="' + r.id + '">×</button>') + '</td></tr>').join('') +
      '</tbody></table></div>' : '<p class="muted">Empty.</p>');
  $('#add').onclick = () => editRow(table, null, refresh);
  const mineCount = cfg.shared ? rows.length : rows.filter(r => r.team_id != null).length;
  $('#clr').onclick = async () => { if (!confirm('Delete ALL ' + mineCount + ' of your team\'s rows in ' + cfg.label + (cfg.builtin ? ' (built-in rows stay)' : '') + '? This can\'t be undone.')) return; await db.clear(table); S.cache = {}; toast('Cleared'); refresh(); };
  $$('[data-edit]', box).forEach(b => b.onclick = () => editRow(table, rows.find(r => r.id === Number(b.dataset.edit)), refresh));
  $$('[data-del]', box).forEach(b => b.onclick = async () => { if (!confirm('Delete this row?')) return; await db.remove(table, Number(b.dataset.del)); S.cache = {}; refresh(); });
}

function editRow(table, row, refresh) {
  const cfg = TABLES[table];
  row = row || {};
  const input = f => {
    const v = row[f.k];
    if (f.type === 'long') return '<textarea name="' + f.k + '" rows="' + (f.k === 'body' ? 14 : 4) + '">' + esc(v || '') + '</textarea>';
    if (f.type === 'bool') return '<input type="checkbox" name="' + f.k + '"' + (v ? ' checked' : '') + '>';
    if (f.type === 'select') return '<select name="' + f.k + '">' + f.options.map(o => '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>';
    if (f.type === 'date') return '<input type="date" name="' + f.k + '" value="' + esc(v ? String(v).slice(0, 10) : '') + '">';
    if (f.type === 'pct') return '<input name="' + f.k + '" placeholder="e.g. 45%" value="' + esc(v == null ? '' : Math.round(v * 1000) / 10 + '%') + '">';
    if (/int|num/.test(f.type)) return '<input name="' + f.k + '" inputmode="decimal" value="' + esc(v == null ? '' : v) + '">';
    return '<input name="' + f.k + '" value="' + esc(v || '') + '">';
  };
  openModal('<h2>' + (row.id ? 'Edit' : 'Add') + ' — ' + esc(cfg.label) + '</h2><form id="er">' +
    cfg.fields.map(f => '<label class="f"><span>' + esc(f.label) + (f.type === 'link' ? ' (link)' : '') + '</span>' + input(f) + '</label>').join('') +
    '<div class="row"><button class="btn">Save</button><button type="button" class="btn ghost" data-close>Cancel</button></div></form>', m => {
    $('#er', m).onsubmit = async e => {
      e.preventDefault();
      const rec = {};
      cfg.fields.forEach(f => { const el = e.target[f.k]; rec[f.k] = f.type === 'bool' ? el.checked : coerce(f, el.value); });
      if (!row.id && table === 'work_on') rec.approved = row.approved !== false;
      try { if (row.id) await db.update(table, row.id, rec); else await db.insert(table, [rec]); S.cache = {}; closeModal(); toast('Saved'); refresh(); }
      catch (err) { toast('Error: ' + err.message); }
    };
  });
}

function openModal(html, wire) {
  const root = $('#modal-root');
  root.innerHTML = '<div class="modal-bg"><div class="modal">' + html + '</div></div>';
  const m = $('.modal', root);
  $('.modal-bg', root).onclick = e => { if (e.target.classList.contains('modal-bg')) closeModal(); };
  $$('[data-close]', m).forEach(b => b.onclick = closeModal);
  if (wire) wire(m);
}
function closeModal() { $('#modal-root').innerHTML = ''; }

// ----- value coercion shared by forms and the importer
function excelSerialToISO(n) { const d = new Date(Math.round((n - 25569) * 86400 * 1000)); return d.toISOString().slice(0, 10); }
function coerce(f, v) {
  if (v instanceof Date) return f.type === 'date' ? isoOf(v) : isoOf(v);
  if (v == null) return null;
  if (typeof v === 'string') { v = v.trim(); if (v === '') return null; }
  switch (f.type) {
    case 'date': {
      if (typeof v === 'number') return v > 20000 && v < 80000 ? excelSerialToISO(v) : null;
      const s = String(v).replace(/^'/, '');
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      const d = new Date(s); return isNaN(d) ? null : isoOf(d);
    }
    case 'int': { const n = parseFloat(String(v).replace(/[^\d.\-]/g, '')); return isNaN(n) ? null : Math.round(n); }
    case 'num': { const n = parseFloat(String(v).replace(/[^\d.\-]/g, '')); return isNaN(n) ? null : n; }
    case 'pct': {
      if (typeof v === 'number') return v > 1.5 ? v / 100 : v;
      const s = String(v); const n = parseFloat(s.replace(/[^\d.\-]/g, '')); if (isNaN(n)) return null;
      return s.includes('%') || n > 1.5 ? n / 100 : n;
    }
    case 'bool': return /^(y|yes|true|1|x|✓)$/i.test(String(v));
    default: return String(v).replace(/^'/, '');
  }
}

// ----- workbook / CSV import
// grids: { sheetName: [[{v, l}...], ...] }  ->  plan: [{table, rows, header}]
function planImport(grids) {
  const plan = [];
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  Object.keys(TABLES).forEach(table => {
    const cfg = TABLES[table]; if (!cfg.sheet) return;
    const sheetName = Object.keys(grids).find(n => norm(n) === norm(cfg.sheet));
    if (!sheetName) return;
    const grid = grids[sheetName];
    let best = -1, bestScore = 0;
    for (let r = 0; r < Math.min(8, grid.length); r++) {
      const cells = (grid[r] || []).map(c => norm(c && c.v));
      const score = cfg.fields.filter(f => f.aliases.some(a => cells.includes(norm(a)))).length;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    if (best < 0 || bestScore < 2) return;
    const head = (grid[best] || []).map(c => norm(c && c.v));
    const colOf = {};
    cfg.fields.forEach(f => { const i = head.findIndex(h => f.aliases.some(a => norm(a) === h)); if (i >= 0) colOf[f.k] = i; });
    const rows = [];
    for (let r = best + 1; r < grid.length; r++) {
      const line = grid[r] || [];
      const rec = {}; let any = false;
      cfg.fields.forEach(f => {
        if (colOf[f.k] == null) return;
        const cell = line[colOf[f.k]] || {};
        let v = cell.v;
        if (f.type === 'link' && cell.l) { const text = v == null ? '' : String(v).trim(); v = text && text !== cell.l ? '[' + text + '](' + cell.l + ')' : cell.l; }
        const c = coerce(f, v);
        rec[f.k] = c; if (c != null && c !== false) any = true;
      });
      if (!any || rec[cfg.req] == null) continue;
      if (cfg.keep && !cfg.keep(rec)) continue;
      rows.push(cfg.fix ? cfg.fix(rec) : rec);
    }
    plan.push({ table: table, sheet: sheetName, rows: rows, matched: Object.keys(colOf).length, total: cfg.fields.length });
  });
  return plan;
}

function parseCSV(text) {
  const out = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); out.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); out.push(row); }
  return out.map(r => r.map(v => ({ v: v })));
}

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Couldn\'t load ' + src)); document.head.appendChild(s); });
}

async function readWorkbook(file) {
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    const name = prompt('Which tab is this CSV? Type its sheet name (e.g. Player Stats):', file.name.replace(/\.csv$/i, '')) || file.name;
    const g = {}; g[name] = parseCSV(text); return g;
  }
  if (!window.XLSX) await loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const grids = {};
  wb.SheetNames.forEach(n => {
    const ws = wb.Sheets[n]; if (!ws['!ref']) return;
    const range = window.XLSX.utils.decode_range(ws['!ref']);
    const grid = [];
    for (let r = range.s.r; r <= Math.min(range.e.r, 5000); r++) {
      const line = [];
      for (let c = range.s.c; c <= Math.min(range.e.c, 60); c++) {
        const cell = ws[window.XLSX.utils.encode_cell({ r: r, c: c })];
        line.push(cell ? { v: cell.v, l: cell.l && cell.l.Target ? cell.l.Target : null } : {});
      }
      grid.push(line);
    }
    grids[n] = grid;
  });
  return grids;
}

async function mergeRoster(rows) {
  const { data } = await sb.from('roster').select('*');
  const have = data || [];
  for (const r of rows) {
    if (/^player \d+$/i.test(r.name || '')) continue; // skip placeholder names
    const ex = have.find(h => (h.ign && r.ign && normName(h.ign) === normName(r.ign)) || normName(h.name) === normName(r.name));
    const v = {}; Object.keys(r).forEach(k => { if (r[k] != null && r[k] !== '') v[k] = r[k]; });
    if (ex) await sb.from('roster').update(v).eq('id', ex.id); else await sb.from('roster').insert([Object.assign({ role: 'Flex' }, v)]);
  }
}
async function mergeWork(rows) {
  const have = await db.list('work_on', { limit: 5000 });
  const key = r => String(r.date || '').slice(0, 10) + '|' + normName(r.player) + '|' + String(r.issue || '').toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 80);
  const seen = new Set(have.map(key));
  const fresh = rows.filter(r => !seen.has(key(r))).map(r => Object.assign({ status: 'Open', priority: 'Medium' }, r, { approved: false }));
  for (let j = 0; j < fresh.length; j += 400) await db.insert('work_on', fresh.slice(j, j + 400));
  return fresh.length;
}
async function importFile(file, out, done) {
  out.innerHTML = '<p class="muted">Reading ' + esc(file.name) + '…</p>';
  let plan;
  try { plan = planImport(await readWorkbook(file)).filter(p => canEdit(p.table)); } catch (err) { out.innerHTML = '<p class="error">' + esc(err.message) + '</p>'; return; }
  if (!plan.length) { out.innerHTML = '<p class="error">Didn\'t find any tabs I recognise. Tab names need to match (e.g. "Player Stats", "Set Plays").</p>'; return; }
  out.innerHTML = '<div class="tablewrap"><table><thead><tr><th>Import?</th><th>Tab</th><th>Goes to</th><th class="num">Rows</th><th>Mode</th></tr></thead><tbody>' +
    plan.map((p, i) => '<tr><td><input type="checkbox" data-i="' + i + '"' + (p.rows.length ? ' checked' : '') + '></td><td>' + esc(p.sheet) + '</td><td>' + esc(TABLES[p.table].label) +
      '<div class="muted small">' + p.matched + '/' + p.total + ' columns matched</div></td><td class="num">' + p.rows.length + '</td><td>' + (p.table === 'roster' || p.table === 'work_on' ? '<span class="small muted">Adds new ones, keeps yours</span><select data-m="' + i + '" hidden><option value="append"></option></select>' : '<select data-m="' + i + '"><option value="replace">Replace what\'s in the app</option><option value="append">Add to it</option></select>') + '</td></tr>').join('') +
    '</tbody></table></div><button class="btn" id="go" style="margin-top:10px">Import selected</button> <span class="muted small">"Replace" is best when your sheet has everything.</span>';
  $('#go', out).onclick = async () => {
    const btn = $('#go', out); btn.disabled = true;
    const log = [];
    for (let i = 0; i < plan.length; i++) {
      if (!$('[data-i="' + i + '"]', out).checked) continue;
      const p = plan[i], mode = $('[data-m="' + i + '"]', out).value;
      try {
        if (p.table === 'roster') { await mergeRoster(p.rows); log.push('✓ Roster slots: ' + p.rows.length + ' merged (claims kept)'); continue; }
        if (p.table === 'work_on') { const n = await mergeWork(p.rows); log.push('✓ Work on: ' + n + ' new suggestion' + (n === 1 ? '' : 's') + ' waiting for your approval (Coach panel → Work on)'); continue; }
        if (mode === 'replace') await db.clear(p.table);
        for (let j = 0; j < p.rows.length; j += 400) await db.insert(p.table, p.rows.slice(j, j + 400));
        log.push('✓ ' + TABLES[p.table].label + ': ' + p.rows.length + ' rows');
      } catch (err) { log.push('✗ ' + TABLES[p.table].label + ': ' + err.message); }
    }
    S.cache = {};
    out.innerHTML = '<div class="card">' + log.map(esc).join('<br>') + '</div>';
    toast('Import finished');
    setTimeout(done, 1500);
  };
}

// ----- cached member list for the leaderboard (names/roles of teammates)
const _origCached = cached;
cached = async function (table, opts) {
  if (table === 'profiles_list') {
    if (!S.cache.profiles_list) { const { data } = await sb.from('profiles').select('id,display_name,ign,role,is_igl,is_trial,is_coach,approved,discord,avatar_url').eq('approved', true); S.cache.profiles_list = data || []; }
    return S.cache.profiles_list;
  }
  return _origCached(table, opts);
};

// expose pure helpers for tests
window.__TEAMHUB__ = { md: md, planImport: planImport, coerce: coerce, compAnalysis: compAnalysis, calcStreak: calcStreak, parseCSV: parseCSV, TABLES: TABLES, normName: normName };

if (!window.__TEAMHUB_NO_BOOT__) boot();
})();
