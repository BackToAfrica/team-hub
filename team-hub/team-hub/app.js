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
  reviews: 'VOD reviews',
  scouting: 'Scouting & comp notes',
  comp_checker: 'Comp Checker & agent counters',
  patch_notes: 'Patch notes'
};

function F(k, label, type, aliases, extra) { return Object.assign({ k: k, label: label, type: type || 'text', aliases: aliases || [label] }, extra || {}); }

// Each table: label, sheet tab name in the coach's workbook, fields (with sheet header aliases), required key.
const TABLES = {
  announcements: { label: 'Announcements', order: 'created_at', req: 'title', fields: [
    F('title', 'Title'), F('body', 'Message', 'long'), F('pinned', 'Pinned', 'bool')] },
  drills: { label: 'Daily drills', sheet: 'Daily Routine', order: 'sort', asc: true, req: 'drill', fields: [
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
  guides: { label: 'Guides (comms etc.)', order: 'sort', asc: true, req: 'title', fields: [
    F('title', 'Title'), F('section', 'Shown in', 'select', ['Section'], { options: ['comms', 'playbook', 'reviews', 'scouting'] }), F('body', 'Text (markdown)', 'long'), F('sort', 'Order', 'int')] },
  reviews: { label: 'VOD reviews', order: 'date', req: 'title', fields: [
    F('date', 'Date', 'date'), F('title', 'Title'), F('opponent', 'Opponent'), F('type', 'Type'), F('map', 'Map'), F('vod', 'VOD link', 'link'),
    F('summary', 'Key takeaways', 'long'), F('body', 'Full review (markdown)', 'long'), F('link', 'Coach-only doc link', 'link')] },
  opponent_scouting: { label: 'Opponent scouting', sheet: 'Opponent Scouting', order: 'date', req: 'opponent', fields: [
    F('date', 'Date', 'date'), F('opponent', 'Opponent'), F('map', 'Map'), F('veto', 'Their veto'), F('source', 'Source'), F('pistol_plan', 'Pistol plan (attack)', 'long'),
    F('fav_attack_site', 'Favorite attack site'), F('defense_setup', 'Defense setup', 'long'), F('after_losing', 'After losing a round', 'long'),
    F('first_fights', 'Takes first fights'), F('star_player', 'Star player'), F('weakness', 'Weakness to attack', 'long'), F('notes', 'Notes', 'long')] },
  comp_notes: { label: 'Comp notes', sheet: 'Comp Notes', order: 'date', req: 'a1', fields: [
    F('date', 'Date', 'date'), F('a1', 'Agent 1'), F('a2', 'Agent 2'), F('a3', 'Agent 3'), F('a4', 'Agent 4'), F('a5', 'Agent 5'), F('map', 'Map'),
    F('team', 'Team that ran it'), F('result', 'Result vs it'), F('weaknesses', 'Weaknesses seen / what beat it', 'long'), F('watch', 'Watch it', 'link')] },
  agent_counters: { label: 'Agent counters', sheet: 'Agent Counters', order: 'agent', asc: true, req: 'agent', fields: [
    F('agent', 'Agent'), F('role', 'Role'), F('brings', 'What they bring', 'long'), F('weaknesses', 'Weaknesses', 'long'),
    F('beat_attack', 'Beat them when they attack', 'long', ['Beat them when THEY attack (we defend)', 'Beat them when they attack']),
    F('beat_defense', 'Beat them when they defend', 'long', ['Beat them when THEY defend (we attack)', 'Beat them when they defend']),
    F('counters', 'Best counters', 'long', ['Best counters (util / agents)', 'Best counters']),
    F('smokes', 'Smokes'), F('flash', 'Flash'), F('recon', 'Recon'), F('stall', 'Stall', 'text', ['Stall / flank', 'Stall']), F('entry', 'Entry'), F('heal', 'Heal'),
    F('seen', 'Seen in VODs', 'long'), F('updated', 'Last updated')] },
  roster: { label: 'Roster slots', sheet: 'Roster', order: 'name', asc: true, req: 'name', merge: true, fields: [
    F('name', 'Name', 'text', ['Player (IGN)', 'Player', 'Name']), F('ign', 'In-game name', 'text', ['Player (IGN)', 'IGN', 'In-game name']), F('discord', 'Discord username', 'text', ['Discord username', 'Discord']),
    F('role', 'Role', 'select', ['Role'], { options: ROLES }), F('is_igl', 'IGL', 'bool', ['IGL?', 'IGL']), F('is_trial', 'Trial', 'bool', ['Trial', 'Trial player'])] },
  patch_notes: { label: 'Patch notes', sheet: 'Patch Notes', order: 'date', req: 'changed', fields: [
    F('patch', 'Patch'), F('date', 'Date', 'date'), F('category', 'Category'), F('item', 'Agent / item'), F('effect', 'Effect'), F('changed', 'What changed', 'long'), F('coach_notes', 'Coach notes', 'long')] }
};

// --------------------------------------------------------------- database
let sb = null;
const S = { session: null, me: null, route: 'home', cache: {} };

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
    const { error } = await sb.from(table).delete().gt('id', 0);
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
      '<h2>Sign in</h2><p class="muted">Use your Discord account. The first time, you\'ll pick your name on the team roster.</p>' +
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
const NAV = [
  { r: 'home', label: 'Home', sec: null },
  { r: 'checkin', label: 'Daily check-in', sec: 'checkin' },
  { r: 'stats', label: 'My stats', sec: 'my_stats' },
  { r: 'team', label: 'Team', sec: 'team_stats' },
  { r: 'playbook', label: 'Playbook', sec: ['playbook', 'comms'] },
  { r: 'scouting', label: 'Scouting', sec: 'scouting' },
  { r: 'comps', label: 'Comp Checker', sec: 'comp_checker' },
  { r: 'reviews', label: 'VOD reviews', sec: 'reviews' },
  { r: 'patches', label: 'Patch notes', sec: 'patch_notes' }
];
function navAllowed(n) {
  if (!n.sec) return true;
  if (S.me.is_coach && !S.me.ign && (n.r === 'checkin' || n.r === 'stats')) return false; // coach without an IGN doesn't need these

  return Array.isArray(n.sec) ? n.sec.some(can) : can(n.sec);
}

function render() {
  const me = S.me;
  if (!me || !me.approved) { renderPending(); return; }
  const items = NAV.filter(navAllowed);
  if (!items.some(n => n.r === S.route) && !(S.route === 'coach' && me.is_coach) && S.route !== 'account') S.route = 'home';
  const navHtml = items.map(n => '<a href="#/' + n.r + '" class="' + (S.route === n.r ? 'active' : '') + '">' + esc(n.label) + '</a>').join('') +
    (me.is_coach ? '<div class="sep"></div><a href="#/coach" class="' + (S.route === 'coach' ? 'active' : '') + '">Coach panel</a>' : '') +
    '<div class="sep"></div><a href="#/account" class="' + (S.route === 'account' ? 'active' : '') + '">Account</a>';
  $('#app').innerHTML =
    '<div class="topbar"><button id="menubtn" aria-label="Menu">☰</button><b>' + esc(TEAM) + '</b></div>' +
    '<div class="layout"><aside class="sidebar" id="sidebar"><div class="brand"><span class="dot"></span>' + esc(TEAM) + '</div>' +
    '<nav class="nav">' + navHtml + '</nav>' +
    '<div class="me">' + (me.avatar_url ? '<img src="' + esc(me.avatar_url) + '" alt="" style="width:28px;height:28px;border-radius:50%;vertical-align:middle;margin-right:6px">' : '') + esc(me.display_name || me.email) + '<br>' + esc([me.discord ? '@' + me.discord : '', me.ign, me.is_coach ? 'Coach' : me.role].filter(Boolean).join(' · ')) + '</div></aside>' +
    '<main class="main" id="main"><div class="muted">Loading…</div></main></div>';
  $('#menubtn').onclick = () => $('#sidebar').classList.toggle('open');
  $$('#sidebar a').forEach(a => a.addEventListener('click', () => $('#sidebar').classList.remove('open')));
  const page = PAGES[S.route] || PAGES.home;
  Promise.resolve(page($('#main'))).catch(err => { $('#main').innerHTML = '<div class="card error">Something went wrong: ' + esc(err.message || err) + '</div>'; console.error(err); });
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
  const who = me ? (me.discord ? '@' + me.discord : (me.display_name || me.email)) : '';
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
    : (mine ? '' : '<p class="muted">There are no open spots on the roster yet. Ask your coach to add you (Coach panel → Members → Roster slots), then tap refresh.</p>');
  $('#app').innerHTML = '<div class="auth"><h1>' + esc(TEAM) + '</h1><div class="card">' + body + list +
    '<div id="claimmsg" class="error" style="margin-top:8px"></div>' +
    '<div class="row" style="margin-top:14px"><button class="btn" id="refresh">Refresh</button><button class="btn ghost" id="out">Sign out</button></div></div></div>';
  $('#refresh').onclick = () => { S._autoTried = false; start(); };
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

PAGES.home = async function (el) {
  const me = S.me;
  const [ann, todayRow] = await Promise.all([
    cached('announcements'),
    can('checkin') ? db.list('checkins', { eq: { user_id: me.id, day: todayISO() } }) : Promise.resolve([])
  ]);
  const anns = ann.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.created_at).localeCompare(String(a.created_at)));
  let statsHtml = '';
  if (can('my_stats') && me.ign) {
    const mine = (await cached('player_stats')).filter(r => normName(r.player) === normName(me.ign));
    if (mine.length) {
      const k = sum(mine, 'kills'), d = sum(mine, 'deaths'), hs = sum(mine, 'hs_kills');
      statsHtml = '<div class="kpis" style="margin-top:12px">' + kpi(num(d ? k / d : k, 2), 'K/D') + kpi(pct(k ? hs / k : null), 'Headshot kill %') + kpi(mine.length, 'Maps logged') + '</div>';
    }
  }
  el.innerHTML = '<h1>Hey ' + esc((me.display_name || '').split(' ')[0] || 'there') + '</h1>' +
    (can('checkin') && !(me.is_coach && !me.ign) ? '<div class="card row spread" style="margin-bottom:14px"><div><b>Today\'s check-in</b><div class="muted small">' +
      (todayRow.length ? 'Done for today. Nice.' : 'Not done yet — takes 30 seconds.') + '</div></div>' +
      '<a class="btn' + (todayRow.length ? ' ghost' : '') + '" href="#/checkin">' + (todayRow.length ? 'Edit' : 'Check in') + '</a></div>' : '') +
    statsHtml +
    '<h2 style="margin-top:22px">From the coach</h2>' +
    (anns.length ? anns.map(a => '<div class="card" style="margin-bottom:10px">' + (a.pinned ? '<span class="pill red">Pinned</span> ' : '') +
      '<b>' + esc(a.title) + '</b> <span class="muted small">' + fmtDate(a.created_at) + '</span>' + md(a.body) + '</div>').join('') : '<p class="muted">Nothing posted yet.</p>');
};
function sum(rows, k) { return rows.reduce((s, r) => s + (Number(r[k]) || 0), 0); }
function avg(rows, k) { const v = rows.map(r => r[k]).filter(x => x != null && x !== '' && !isNaN(x)).map(Number); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
function kpi(v, l) { return '<div class="kpi"><div class="v">' + v + '</div><div class="l">' + esc(l) + '</div></div>'; }

// ---- Daily check-in
PAGES.checkin = async function (el) {
  const me = S.me;
  const day = (location.hash.split('/')[2]) || todayISO();
  const [drills, existing, history] = await Promise.all([
    cached('drills'),
    db.list('checkins', { eq: { user_id: me.id, day: day } }),
    db.list('checkins', { eq: { user_id: me.id }, order: 'day', asc: false, limit: 60 })
  ]);
  const roles = ['Everyone', me.role || 'Flex'].concat(me.is_igl ? ['IGL'] : []);
  const mine = drills.filter(d => roles.includes(d.role));
  const row = existing[0] || {};
  const done = new Set((row.drills_done || []).map(String));
  let rating = row.rating || 0;
  const streak = calcStreak(history.map(h => h.day));
  el.innerHTML = '<div class="row spread"><h1>Daily check-in</h1><div class="row"><input type="date" id="day" value="' + day + '" max="' + todayISO() + '" style="width:auto"></div></div>' +
    '<div class="row" style="margin-bottom:14px"><div class="card"><div class="streak">' + streak + '</div><div class="muted small">day streak</div></div>' +
    '<div class="muted small grow">Tick what you did today. Your role is <b>' + esc(me.role || 'Flex') + '</b>' + (me.is_igl ? ' + IGL' : '') + '.</div></div>' +
    '<form id="ci">' +
    groupBy(mine, 'role').map(([role, list]) => '<h3 style="margin-top:14px">' + esc(role) + '</h3>' + list.map(d =>
      '<label class="check' + (done.has(String(d.id)) ? ' done' : '') + '"><input type="checkbox" name="d" value="' + d.id + '"' + (done.has(String(d.id)) ? ' checked' : '') + '>' +
      '<div><div class="t">' + esc(d.drill) + ' <span class="pill">' + esc(d.block || '') + (d.minutes ? ' · ' + esc(d.minutes) + (/^\d+$/.test(d.minutes) ? ' min' : '') : '') + '</span></div>' +
      '<div class="small">' + esc(d.how || '') + '</div>' + (d.success ? '<div class="small muted">✓ ' + esc(d.success) + '</div>' : '') + '</div></label>').join('')).join('') +
    (mine.length ? '' : '<p class="muted">The coach hasn\'t added drills for your role yet.</p>') +
    '<div class="cards" style="margin-top:16px"><label class="f"><span>Minutes practised</span><input name="minutes" type="number" min="0" value="' + esc(row.minutes || '') + '"></label>' +
    '<label class="f"><span>Games played</span><input name="games" type="number" min="0" value="' + esc(row.games || '') + '"></label></div>' +
    '<label class="f"><span>How focused was your practice? (1–5)</span><div class="rating">' + [1, 2, 3, 4, 5].map(n => '<button type="button" data-r="' + n + '" class="' + (rating === n ? 'on' : '') + '">' + n + '</button>').join('') + '</div></label>' +
    '<label class="f"><span>What I worked on</span><textarea name="worked_on">' + esc(row.worked_on || '') + '</textarea></label>' +
    '<label class="f"><span>One takeaway</span><textarea name="takeaway">' + esc(row.takeaway || '') + '</textarea></label>' +
    '<button class="btn">Save check-in</button></form>' +
    '<h2 style="margin-top:28px">Your last check-ins</h2>' +
    (history.length ? '<div class="tablewrap"><table><thead><tr><th>Date</th><th>Warm-up</th><th>Role drills</th><th class="num">Min</th><th class="num">Games</th><th>Takeaway</th></tr></thead><tbody>' +
      history.slice(0, 30).map(h => '<tr><td><a href="#/checkin/' + h.day + '">' + fmtDate(h.day) + '</a></td><td>' + statusPill(h.warmup) + '</td><td>' + statusPill(h.role_drills) + '</td><td class="num">' + esc(h.minutes == null ? '' : h.minutes) + '</td><td class="num">' + esc(h.games == null ? '' : h.games) + '</td><td>' + esc(h.takeaway || '') + '</td></tr>').join('') +
      '</tbody></table></div>' : '<p class="muted">No check-ins yet.</p>');
  $('#day').onchange = e => { location.hash = '#/checkin/' + e.target.value; };
  $$('.check input', el).forEach(c => c.onchange = () => c.closest('.check').classList.toggle('done', c.checked));
  $$('.rating button', el).forEach(b => b.onclick = () => { rating = Number(b.dataset.r); $$('.rating button', el).forEach(x => x.classList.toggle('on', x === b)); });
  $('#ci').onsubmit = async e => {
    e.preventDefault();
    const f = e.target;
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
      toast('Check-in saved'); render();
    } catch (err) { toast('Couldn\'t save: ' + err.message); }
  };
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
  if (!me.ign) { el.innerHTML = '<h1>My stats</h1><p class="muted">Your in-game name isn\'t set yet. Ask the coach to add it in Coach panel → Members so your stats can be matched to you.</p>'; return; }
  const [ps, uu] = await Promise.all([cached('player_stats'), cached('utility_usage')]);
  const mine = ps.filter(r => normName(r.player) === normName(me.ign));
  const util = uu.filter(r => normName(r.player) === normName(me.ign));
  const k = sum(mine, 'kills'), d = sum(mine, 'deaths'), hs = sum(mine, 'hs_kills');
  el.innerHTML = '<h1>My stats</h1><p class="muted small">Matched to in-game name <b>' + esc(me.ign) + '</b>. Stats come from reviewed scrims and matches.</p>' +
    (mine.length || util.length ? '' : '<p class="muted">No stats logged for you yet.</p>') +
    '<div class="kpis">' + kpi(num(d ? k / d : k, 2), 'K/D') + kpi(k, 'Kills') + kpi(pct(k ? hs / k : null), 'Headshot kill %') + kpi(pct(avg(mine, 'true_hs_pct')), 'True HS %') +
    kpi(sum(mine, 'first_kills') + ' / ' + sum(mine, 'first_deaths'), 'First kills / deaths') + kpi(num(avg(util, 'util_per_round'), 1), 'Util per round') +
    kpi(pct(avg(util, 'util_before_fight')), 'Util before first fight') + kpi(mine.length, 'Maps') + '</div>' +
    (mine.length ? '<h2 style="margin-top:22px">Map by map</h2>' + statsTable(mine, ['date', 'map', 'agent', 'kills', 'deaths', 'assists', 'kd', 'hs_kill_pct', 'true_hs_pct', 'first_kills', 'first_deaths', 'notes'], TABLES.player_stats) : '') +
    (util.length ? '<h2 style="margin-top:22px">Utility usage</h2>' + statsTable(util, ['date', 'map', 'agent', 'rounds', 'util_per_round', 'q_casts', 'e_casts', 'c_casts', 'ults_used', 'ults_available', 'died_with_util', 'util_before_fight', 'source', 'notes'], TABLES.utility_usage) : '');
};
function statsTable(rows, keys, cfg) {
  const fs = keys.map(k => cfg.fields.find(f => f.k === k)).filter(Boolean);
  return '<div class="tablewrap"><table><thead><tr>' + fs.map(f => '<th class="' + (/int|num|pct/.test(f.type) ? 'num' : '') + '">' + esc(f.label) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(r => '<tr>' + fs.map(f => '<td class="' + (/int|num|pct/.test(f.type) ? 'num' : '') + '">' + (fieldVal(f, r[f.k]) || '<span class="muted">–</span>') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
}

// ---- Team
PAGES.team = async function (el) {
  const [ps, matches, members] = await Promise.all([cached('player_stats'), cached('matches'), cached('profiles_list')]);
  const by = new Map();
  ps.forEach(r => { const n = normName(r.player); if (!n) return; if (!by.has(n)) by.set(n, { name: String(r.player).replace(/\s*\*\s*trial\s*$/i, ''), trial: isTrialName(r.player), rows: [] }); const g = by.get(n); g.rows.push(r); if (!isTrialName(r.player)) g.trial = false; });
  const memberByIgn = new Map((members || []).map(m => [normName(m.ign), m]));
  const lb = Array.from(by.values()).map(g => {
    const k = sum(g.rows, 'kills'), d = sum(g.rows, 'deaths'), hs = sum(g.rows, 'hs_kills');
    const m = memberByIgn.get(normName(g.name));
    return { name: g.name, trial: g.trial || (m && m.is_trial), role: m ? m.role : '', maps: g.rows.length, k: k, kd: d ? k / d : k, hs: k ? hs / k : null, ths: avg(g.rows, 'true_hs_pct'), fk: sum(g.rows, 'first_kills'), fd: sum(g.rows, 'first_deaths') };
  }).sort((a, b) => b.kd - a.kd);
  const won = matches.filter(m => Number(m.rounds_won) > Number(m.rounds_lost)).length;
  const rw = sum(matches, 'rounds_won'), rl = sum(matches, 'rounds_lost');
  el.innerHTML = '<h1>Team</h1><div class="kpis">' + kpi(won + '–' + (matches.length - won), 'Map record') + kpi(pct(rw + rl ? rw / (rw + rl) : null), 'Round win %') + kpi(matches.length, 'Maps played') + '</div>' +
    '<h2 style="margin-top:22px">Leaderboard</h2>' +
    (lb.length ? '<div class="tablewrap"><table><thead><tr><th>#</th><th>Player</th><th>Role</th><th class="num">Maps</th><th class="num">K/D</th><th class="num">Kills</th><th class="num">HS kill %</th><th class="num">True HS %</th><th class="num">First K / D</th></tr></thead><tbody>' +
      lb.map((p, i) => '<tr><td>' + (i + 1) + '</td><td><b>' + esc(p.name) + '</b>' + (p.trial ? ' <span class="pill yellow">Trial</span>' : '') + '</td><td>' + esc(p.role || '') + '</td><td class="num">' + p.maps + '</td><td class="num">' + num(p.kd, 2) + '</td><td class="num">' + p.k + '</td><td class="num">' + pct(p.hs) + '</td><td class="num">' + pct(p.ths) + '</td><td class="num">' + p.fk + ' / ' + p.fd + '</td></tr>').join('') +
      '</tbody></table></div>' : '<p class="muted">No player stats yet.</p>') +
    '<h2 style="margin-top:22px">Matches</h2>' +
    (matches.length ? statsTable(matches, ['date', 'event', 'opponent', 'map', 'rounds_won', 'rounds_lost', 'start_side', 'vod_link', 'notes'], TABLES.matches) : '<p class="muted">No matches logged yet.</p>');
};

// ---- Playbook
PAGES.playbook = async function (el) {
  const tabs = [];
  if (can('playbook')) tabs.push(['plays', 'Set plays'], ['pistols', 'Pistol rounds']);
  if (can('comms')) tabs.push(['comms', 'Comms guide']);
  const sub = location.hash.split('/')[2] || tabs[0][0];
  el.innerHTML = '<h1>Playbook</h1><div class="tabs">' + tabs.map(t => '<button data-t="' + t[0] + '" class="' + (t[0] === sub ? 'active' : '') + '">' + t[1] + '</button>').join('') + '</div><div id="pb"></div>';
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
  el.innerHTML = '<h1>Scouting</h1><div class="tabs"><button data-t="opponents" class="' + (sub === 'opponents' ? 'active' : '') + '">Opponents</button><button data-t="comps" class="' + (sub === 'comps' ? 'active' : '') + '">Comp notes</button></div><div id="sc"></div>';
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
  el.innerHTML = '<h1>Comp Checker</h1><p class="muted">Pick the enemy comp and your side. It shows each agent\'s weakness, how to beat it, and what the whole comp is missing.</p>' +
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
PAGES.reviews = async function (el) {
  const rows = await cached('reviews');
  el.innerHTML = '<h1>VOD reviews</h1>' + (rows.length ? '' : '<p class="muted">No reviews shared yet.</p>') + '<div id="rv"></div>';
  $('#rv').innerHTML = rows.map(r => '<details class="item"><summary><div class="t">' + esc(r.title || 'Review') + '</div><div class="row small" style="margin-top:4px">' +
    (r.date ? '<span class="muted">' + fmtDate(r.date) + '</span>' : '') + (r.type ? '<span class="pill">' + esc(r.type) + '</span>' : '') + (r.map ? '<span class="pill">' + esc(r.map) + '</span>' : '') + (r.vod ? linkHtml(r.vod, 'Watch VOD') : '') + '</div></summary>' +
    '<div class="body">' + (r.summary ? '<div class="field"><div class="lbl">Key takeaways</div><div class="val">' + inlineMd(r.summary) + '</div></div>' : '') + (r.body ? md(r.body) : '') +
    (S.me.is_coach && r.link ? '<p class="small muted">Coach doc: ' + linkHtml(r.link, 'open') + '</p>' : '') + '</div></details>').join('');
};

// ---- Patch notes
PAGES.patches = async function (el) {
  const rows = await cached('patch_notes');
  el.innerHTML = '<h1>Patch notes</h1>' + (rows.length ? '' : '<p class="muted">No patch notes yet.</p>');
  groupBy(rows, 'patch').forEach(([p, list]) => {
    el.insertAdjacentHTML('beforeend', '<div class="card" style="margin-bottom:12px"><h2>Patch ' + esc(p) + ' <span class="muted small">' + fmtDate(list[0].date) + '</span></h2>' +
      list.map(r => '<div style="margin:8px 0"><span class="pill ' + ({ Buff: 'green', Nerf: 'red', New: 'purple', Mixed: 'yellow' }[r.effect] || '') + '">' + esc(r.effect || r.category || '') + '</span> <b>' + esc(r.item || '') + '</b> — ' + esc(r.changed || '') +
        (r.coach_notes ? '<div class="small muted">Coach: ' + esc(r.coach_notes) + '</div>' : '') + '</div>').join('') + '</div>');
  });
};

// ---- Account
PAGES.account = async function (el) {
  const me = S.me;
  el.innerHTML = '<h1>Account</h1><div class="card stack" style="max-width:520px"><div><b>' + esc(me.display_name || '') + '</b><div class="muted small">' + esc(me.email || '') + '</div></div>' +
    '<div class="small">In-game name: <b>' + esc(me.ign || '—') + '</b> · Role: <b>' + esc(me.role || '—') + '</b>' + (me.is_igl ? ' · IGL' : '') + '</div>' +
    '<p class="muted small">The coach manages your name, role and what you can see.</p>' +
    '<form id="pw" class="stack"><label class="f"><span>New password</span><input name="p" type="password" minlength="6" required></label><button class="btn ghost">Change password</button></form>' +
    '<button class="btn danger" id="so">Sign out</button></div>' +
    '<div class="card" style="max-width:520px;margin-top:14px"><b>Install the app</b><p class="small muted">Phone: open this site in Safari (iPhone) or Chrome (Android) → Share / menu → <b>Add to Home Screen</b>. Computer: in Chrome or Edge click the install icon at the right end of the address bar.</p></div>';
  $('#so').onclick = () => sb.auth.signOut();
  $('#pw').onsubmit = async e => { e.preventDefault(); const { error } = await sb.auth.updateUser({ password: e.target.p.value }); toast(error ? error.message : 'Password changed'); e.target.reset(); };
};

// ------------------------------------------------------------ coach panel
PAGES.coach = async function (el) {
  if (!S.me.is_coach) { el.innerHTML = '<p>Coach only.</p>'; return; }
  const sub = location.hash.split('/')[2] || 'members';
  const tabs = [['members', 'Members'], ['checkins', 'Check-ins'], ['announce', 'Announcements'], ['data', 'Content & import']];
  el.innerHTML = '<h1>Coach panel</h1><div class="tabs">' + tabs.map(t => '<button data-t="' + t[0] + '" class="' + (t[0] === sub ? 'active' : '') + '">' + t[1] + '</button>').join('') + '</div><div id="cp"></div>';
  $$('.tabs button', el).forEach(b => b.onclick = () => { location.hash = '#/coach/' + b.dataset.t; });
  await COACH[sub]($('#cp'));
};

const COACH = {};

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
    const patch = { display_name: f.display_name.value, ign: f.ign.value || null, role: f.role.value, is_igl: f.is_igl.checked, is_trial: f.is_trial.checked, approved: f.approved.checked, visibility: vis };
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
    if (!confirm('Remove this person from the team? They\'ll lose access (their login still exists).')) return;
    const { error } = await sb.from('profiles').delete().eq('id', b.dataset.remove);
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
  return '<details class="item"' + (!m.approved ? ' open' : '') + '><summary><div class="row spread"><div><span class="t">' + esc(m.display_name || m.email) + '</span> ' +
    (m.is_coach ? '<span class="pill red">Coach</span> ' : '') + (!m.approved ? '<span class="pill yellow">Waiting</span> ' : '') + (m.is_trial ? '<span class="pill yellow">Trial</span> ' : '') +
    '<span class="muted small">' + esc([m.discord ? '@' + m.discord : '', m.ign || 'no IGN', m.role || '', m.is_igl ? 'IGL' : ''].filter(Boolean).join(' · ')) + '</span>' +
    (slot ? ' <span class="pill ' + (slot.claim_status === 'approved' ? 'green' : 'yellow') + '">' + (slot.claim_status === 'approved' ? 'Linked to ' : 'Claims ') + esc(slot.name) + '</span>' : (m.is_coach ? '' : ' <span class="pill">No roster slot</span>')) + '</div>' +
    (!m.approved ? '<button class="btn small" data-approve="' + m.id + '">' + (slot ? 'Confirm' : 'Approve') + '</button>' : '') + '</div></summary>' +
    '<div class="body"><form class="member" data-id="' + m.id + '"><div class="muted small" style="margin-bottom:8px">' + esc([m.discord ? 'Discord @' + m.discord : '', m.email || ''].filter(Boolean).join(' · ')) + ' · joined ' + fmtDate(m.created_at) + '</div>' +
    '<div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">' +
    '<label class="f"><span>Name</span><input name="display_name" value="' + esc(m.display_name || '') + '"></label>' +
    '<label class="f"><span>In-game name (matches stats)</span><input name="ign" value="' + esc(m.ign || '') + '"></label>' +
    '<label class="f"><span>Role</span><select name="role">' + ROLES.map(r => '<option' + (r === m.role ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></label></div>' +
    '<div class="row" style="margin-bottom:10px">' +
    '<label class="row small"><input type="checkbox" name="approved"' + (m.approved ? ' checked' : '') + (me ? ' disabled' : '') + '> Approved</label>' +
    '<label class="row small"><input type="checkbox" name="is_igl"' + (m.is_igl ? ' checked' : '') + '> IGL</label>' +
    '<label class="row small"><input type="checkbox" name="is_trial"' + (m.is_trial ? ' checked' : '') + '> Trial player</label>' +
    (me ? '' : '<label class="row small"><input type="checkbox" name="is_coach"' + (m.is_coach ? ' checked' : '') + '> Coach (full access)</label>') + '</div>' +
    '<div class="lbl small muted" style="margin-bottom:6px">CAN SEE</div><div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px">' +
    Object.keys(SECTIONS).map(k => '<label class="row small"><input type="checkbox" data-vis="' + k + '"' + (vis[k] !== false ? ' checked' : '') + (m.is_coach ? ' disabled' : '') + '> ' + esc(SECTIONS[k]) + '</label>').join('') + '</div>' +
    '<div class="row" style="margin-top:12px"><button class="btn small">Save</button>' + (me ? '' : '<button type="button" class="btn small danger" data-remove="' + m.id + '">Remove from team</button>') + '</div></form></div></details>';
}

function rosterTable(roster, members) {
  const byId = new Map(members.map(m => [m.id, m]));
  const row = r => {
    const who = r.claimed_by ? byId.get(r.claimed_by) : null;
    const status = !r.claimed_by ? '<span class="pill">Open</span>' : r.claim_status === 'approved' ? '<span class="pill green">Linked</span>' : '<span class="pill yellow">Waiting for you</span>';
    return '<tr data-rid="' + (r.id || '') + '">' +
      '<td><input data-f="name" value="' + esc(r.name || '') + '" placeholder="Name"></td>' +
      '<td><input data-f="ign" value="' + esc(r.ign || '') + '" placeholder="In-game name"></td>' +
      '<td><input data-f="discord" value="' + esc(r.discord || '') + '" placeholder="discord username"></td>' +
      '<td><select data-f="role">' + ROLES.map(x => '<option' + (x === (r.role || 'Flex') ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></td>' +
      '<td style="text-align:center"><input type="checkbox" data-f="is_igl"' + (r.is_igl ? ' checked' : '') + '></td>' +
      '<td style="text-align:center"><input type="checkbox" data-f="is_trial"' + (r.is_trial ? ' checked' : '') + '></td>' +
      '<td>' + (r.id ? status + (who ? '<div class="small muted">' + esc(who.discord ? '@' + who.discord : who.display_name || '') + '</div>' : '') : '') + '</td>' +
      '<td style="white-space:nowrap">' + (r.id ? '<button class="btn small" data-rsave>Save</button> ' + (r.claimed_by ? '<button class="btn small ghost" data-runlink>Unlink</button> ' : '') + '<button class="btn small danger" data-rdel>×</button>' : '<button class="btn small" data-rsave>Add</button>') + '</td></tr>';
  };
  return '<div class="tablewrap"><table><thead><tr><th>Name</th><th>In-game name</th><th>Discord username</th><th>Role</th><th>IGL</th><th>Trial</th><th>Status</th><th></th></tr></thead><tbody>' +
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
    if (!v.name) { toast('Give the slot a name'); return; }
    const res = id ? await sb.from('roster').update(v).eq('id', id) : await sb.from('roster').insert([v]);
    if (!res.error && id) { const r = roster.find(x => x.id === id); if (r && r.claimed_by) await sb.from('profiles').update({ display_name: v.name, ign: v.ign, role: v.role, is_igl: v.is_igl, is_trial: v.is_trial }).eq('id', r.claimed_by); }
    toast(res.error ? res.error.message : 'Saved'); S.cache = {}; refresh();
  });
  $$('[data-runlink]', box).forEach(b => b.onclick = async () => {
    const id = Number(b.closest('tr').dataset.rid); const r = roster.find(x => x.id === id);
    if (!confirm('Unlink this slot from its account? That account loses access until it claims a slot again.')) return;
    await sb.from('roster').update({ claimed_by: null, claim_status: null }).eq('id', id);
    if (r && r.claimed_by) await sb.from('profiles').update({ approved: false }).eq('id', r.claimed_by).eq('is_coach', false);
    toast('Unlinked'); refresh();
  });
  $$('[data-rdel]', box).forEach(b => b.onclick = async () => {
    if (!confirm('Delete this roster slot?')) return;
    await sb.from('roster').delete().eq('id', Number(b.closest('tr').dataset.rid)); toast('Deleted'); refresh();
  });
}

COACH.checkins = async function (box) {
  const [{ data: members }, rows] = await Promise.all([
    sb.from('profiles').select('*').eq('approved', true).order('display_name'),
    db.list('checkins', { order: 'day', asc: false, gte: { day: addDays(todayISO(), -30) } })
  ]);
  const days = []; for (let i = 6; i >= 0; i--) days.push(addDays(todayISO(), -i));
  const byKey = new Map(rows.map(r => [r.user_id + '|' + String(r.day).slice(0, 10), r]));
  const players = (members || []).filter(m => !m.is_coach || rows.some(r => r.user_id === m.id));
  const name = id => { const m = (members || []).find(x => x.id === id); return m ? (m.display_name || m.ign || m.email) : 'Unknown'; };
  box.innerHTML = '<div class="row spread"><h2>Last 7 days</h2><button class="btn ghost small" id="csv">Download CSV (for the sheet)</button></div>' +
    '<div class="card" style="overflow-x:auto"><div class="daygrid"><div></div>' + days.map(d => '<div class="muted small" style="text-align:center">' + new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'short' }) + '</div>').join('') +
    players.map(m => '<div>' + esc(m.display_name || m.email) + (m.is_trial ? ' <span class="pill yellow">Trial</span>' : '') + '</div>' + days.map(d => { const r = byKey.get(m.id + '|' + d); return '<div class="c ' + (r ? (r.role_drills === 'Done' && r.warmup === 'Done' ? 'y' : 'p') : '') + '">' + (r ? (r.minutes ? r.minutes + 'm' : '✓') : '–') + '</div>'; }).join('')).join('') +
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
    '<label class="row small" style="margin-bottom:10px"><input type="checkbox" name="pinned"> Pin to the top</label><button class="btn">Post</button></form></div>' +
    '<h2 style="margin-top:18px">Posted</h2>' + (rows.length ? rows.map(a => '<div class="card row spread" style="margin-bottom:8px"><div><b>' + esc(a.title) + '</b> ' + (a.pinned ? '<span class="pill red">Pinned</span>' : '') + '<div class="small muted">' + fmtDate(a.created_at) + '</div></div><button class="btn small danger" data-del="' + a.id + '">Delete</button></div>').join('') : '<p class="muted">Nothing yet.</p>');
  $('#an').onsubmit = async e => {
    e.preventDefault();
    try { await db.insert('announcements', [{ title: e.target.title.value, body: e.target.body.value, pinned: e.target.pinned.checked }]); S.cache = {}; toast('Posted'); COACH.announce(box); }
    catch (err) { toast(err.message); }
  };
  $$('[data-del]', box).forEach(b => b.onclick = async () => { if (!confirm('Delete this announcement?')) return; await db.remove('announcements', Number(b.dataset.del)); S.cache = {}; COACH.announce(box); });
};

// ---- Content manager + workbook import
COACH.data = async function (box) {
  const keys = Object.keys(TABLES);
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
  if (cur && TABLES[cur]) await tableManager(cur, $('#tm'), () => COACH.data(box));
};

async function tableManager(table, box, refresh) {
  const cfg = TABLES[table];
  const rows = await db.list(table);
  const show = cfg.fields.slice(0, 4);
  box.innerHTML = '<div class="row spread"><h2>' + esc(cfg.label) + '</h2><div class="row"><button class="btn small" id="add">Add row</button>' +
    '<button class="btn small ghost" id="clr">Delete all</button></div></div>' +
    (rows.length ? '<div class="tablewrap"><table><thead><tr>' + show.map(f => '<th>' + esc(f.label) + '</th>').join('') + '<th></th></tr></thead><tbody>' +
      rows.map(r => '<tr>' + show.map(f => '<td>' + (fieldVal(f, r[f.k]) || '') + '</td>').join('') + '<td style="white-space:nowrap"><button class="btn small ghost" data-edit="' + r.id + '">Edit</button> <button class="btn small danger" data-del="' + r.id + '">×</button></td></tr>').join('') +
      '</tbody></table></div>' : '<p class="muted">Empty.</p>');
  $('#add').onclick = () => editRow(table, null, refresh);
  $('#clr').onclick = async () => { if (!confirm('Delete ALL ' + rows.length + ' rows in ' + cfg.label + '? This can\'t be undone.')) return; await db.clear(table); S.cache = {}; toast('Cleared'); refresh(); };
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
      rows.push(rec);
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
async function importFile(file, out, done) {
  out.innerHTML = '<p class="muted">Reading ' + esc(file.name) + '…</p>';
  let plan;
  try { plan = planImport(await readWorkbook(file)); } catch (err) { out.innerHTML = '<p class="error">' + esc(err.message) + '</p>'; return; }
  if (!plan.length) { out.innerHTML = '<p class="error">Didn\'t find any tabs I recognise. Tab names need to match (e.g. "Player Stats", "Set Plays").</p>'; return; }
  out.innerHTML = '<div class="tablewrap"><table><thead><tr><th>Import?</th><th>Tab</th><th>Goes to</th><th class="num">Rows</th><th>Mode</th></tr></thead><tbody>' +
    plan.map((p, i) => '<tr><td><input type="checkbox" data-i="' + i + '"' + (p.rows.length ? ' checked' : '') + '></td><td>' + esc(p.sheet) + '</td><td>' + esc(TABLES[p.table].label) +
      '<div class="muted small">' + p.matched + '/' + p.total + ' columns matched</div></td><td class="num">' + p.rows.length + '</td><td><select data-m="' + i + '"><option value="replace">Replace what\'s in the app</option><option value="append">Add to it</option></select></td></tr>').join('') +
    '</tbody></table></div><button class="btn" id="go" style="margin-top:10px">Import selected</button> <span class="muted small">"Replace" is best when your sheet has everything.</span>';
  $('#go', out).onclick = async () => {
    const btn = $('#go', out); btn.disabled = true;
    const log = [];
    for (let i = 0; i < plan.length; i++) {
      if (!$('[data-i="' + i + '"]', out).checked) continue;
      const p = plan[i], mode = $('[data-m="' + i + '"]', out).value;
      try {
        if (TABLES[p.table].merge) { await mergeRoster(p.rows); log.push('✓ Roster slots: ' + p.rows.length + ' merged (claims kept)'); continue; }
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
    if (!S.cache.profiles_list) { const { data } = await sb.from('profiles').select('id,display_name,ign,role,is_trial,approved').eq('approved', true); S.cache.profiles_list = data || []; }
    return S.cache.profiles_list;
  }
  return _origCached(table, opts);
};

// expose pure helpers for tests
window.__TEAMHUB__ = { md: md, planImport: planImport, coerce: coerce, compAnalysis: compAnalysis, calcStreak: calcStreak, parseCSV: parseCSV, TABLES: TABLES, normName: normName };

if (!window.__TEAMHUB_NO_BOOT__) boot();
})();
