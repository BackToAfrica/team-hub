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
    F('start_side', 'Start side'), F('type', 'Type', 'select', ['Type'], { options: ['Scrim', 'Official'] }), F('atk_won', 'Attack rounds won', 'int'), F('atk_lost', 'Attack rounds lost', 'int'),
    F('def_won', 'Defense rounds won', 'int'), F('def_lost', 'Defense rounds lost', 'int'), F('pistols_won', 'Pistols won (0-2)', 'int', ['Pistols won']), F('vod_link', 'VOD link', 'link'), F('notes', 'Notes', 'long')] },
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
  game_plans: { label: 'Game plans', order: 'match_date', req: 'opponent', keepOnAdd: ['scrim_id'], fields: [
    F('opponent', 'Opponent'), F('match_date', 'Match date', 'date'), F('maps', 'Maps (comma separated)'), F('their_tendencies', 'Their tendencies (how they play)', 'long'),
    F('comp', 'Our comp (per map)', 'long'), F('attack_plan', 'Attack plan', 'long'), F('defense_plan', 'Defense plan', 'long'), F('pistols', 'Pistol rounds', 'long'),
    F('anti_strat', 'Anti-strat (if they do X, we do Y)', 'long'), F('notes', 'Notes', 'long'), F('published', 'Players can see it', 'bool')] },
  patch_notes: { label: 'Patch notes', shared: true, sheet: 'Patch Notes', order: 'date', req: 'changed', fields: [
    F('patch', 'Patch'), F('date', 'Date', 'date'), F('category', 'Category'), F('item', 'Agent / item'), F('effect', 'Effect'), F('changed', 'What changed', 'long'), F('coach_notes', 'Coach notes', 'long')] }
};

// --------------------------------------------------------------- database
let sb = null;
const S = { session: null, me: null, team: null, route: 'home', cache: {} };
function teamName() { return (S.team && S.team.name) || TEAM; }
// can this person edit a table (shared tables: owner only)
// Assistant coaches and analysts can add and edit these (not the roster, members, team settings or map picks)
const STAFF_TABLES = ['reviews', 'work_on', 'matches', 'player_stats', 'utility_usage', 'set_plays', 'pistol_rounds', 'opponent_scouting', 'comp_notes', 'game_plans'];
// Other teams' coaches can read these, so always filter them to our own team
const CROSS_TABLES = ['matches', 'player_stats', 'utility_usage', 'reviews', 'comp_notes'];
const STAFF_ROLES = ['Assistant coach', 'Analyst'];
function isStaff() { return !!(S.me && (S.me.is_coach || S.me.staff_role)); }
function staffLabel(m) { return m.is_coach ? 'Head coach' : (m.staff_role || ''); }
function canEdit(table) { return !!(S.me && ((S.me.is_coach && (!(TABLES[table] || {}).shared || S.me.is_admin)) || (S.me.staff_role && STAFF_TABLES.includes(table)))); }

const db = {
  async list(table, opts) {
    opts = opts || {};
    const cfg = TABLES[table] || {};
    let q = sb.from(table).select('*');
    if (opts.eq) for (const k in opts.eq) q = q.eq(k, opts.eq[k]);
    if (opts.gte) for (const k in opts.gte) q = q.gte(k, opts.gte[k]);
    if (CROSS_TABLES.includes(table) && S.me && S.me.team_id && !(opts.eq && 'team_id' in opts.eq)) q = q.eq('team_id', S.me.team_id);
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
  if (me.is_coach || me.staff_role) return true;
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
  if (/^#\/t\//.test(location.hash)) { // public team page: no sign-in
    window.addEventListener('hashchange', () => { if (/^#\/t\//.test(location.hash)) renderPublic(); else location.reload(); });
    await renderPublic(); return;
  }
  // Keep the auth-state callback synchronous. Supabase holds an internal
  // auth lock while notifying listeners; awaiting database work (start/loadMe)
  // inside this callback can deadlock sign-in on some clients.
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { S.session = session; renderSetPassword(); return; }
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      const had = S.session && S.session.user && S.session.user.id;
      S.session = session;
      if (event !== 'SIGNED_IN' || had !== (session && session.user && session.user.id)) {
        setTimeout(() => {
          start().catch(err => {
            console.error('Team Hub failed to refresh after an auth change:', err);
            const app = $('#app');
            if (app) app.innerHTML = '<div class="auth"><div class="card error">Could not load your account. Please refresh and try again.</div></div>';
          });
        }, 0);
      }
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
  target: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="1.5"/>',
  cal: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  map: '<path d="M9 4L3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  swap: '<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>',
  cross: '<circle cx="12" cy="12" r="8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>'
};
function icon(n) { return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; }
const NAV = [
  { r: 'home', label: 'Home', sec: null, i: 'home', g: 'Team' },
  { r: 'team', label: 'Team', sec: null, i: 'users', g: 'Team' },
  { r: 'schedule', label: 'Schedule', sec: null, i: 'cal', g: 'Team' },
  { r: 'checkin', label: 'My check-ins', sec: 'checkin', i: 'check', g: 'Team' },
  { r: 'stats', label: 'My stats', sec: 'my_stats', i: 'chart', g: 'Team' },
  { r: 'workon', label: 'Work on', sec: 'reviews', i: 'target', g: 'Team' },
  { r: 'live', label: 'Live match', sec: 'scouting', i: 'bolt', g: 'Prepare' },
  { r: 'plans', label: 'Game plans', sec: 'scouting', i: 'flag', g: 'Prepare' },
  { r: 'veto', label: 'Veto simulator', sec: 'team_stats', i: 'swap', g: 'Prepare' },
  { r: 'maps', label: 'Map pool', sec: 'team_stats', i: 'map', g: 'Prepare' },
  { r: 'playbook', label: 'Playbook', sec: ['playbook', 'comms'], i: 'book', g: 'Prepare' },
  { r: 'lineups', label: 'Lineups', sec: 'playbook', i: 'pin', g: 'Prepare' },
  { r: 'comms', label: 'Comms', sec: 'comms', i: 'mic', g: 'Prepare' },
  { r: 'scouting', label: 'Scouting', sec: 'scouting', i: 'eye', g: 'Prepare' },
  { r: 'comps', label: 'Comp Checker', sec: 'comp_checker', i: 'shield', g: 'Prepare' },
  { r: 'reviews', label: 'VOD reviews', sec: 'reviews', i: 'play', g: 'Prepare' },
  { r: 'patches', label: 'Patch notes', sec: 'patch_notes', i: 'doc', g: 'Prepare' },
  { r: 'aim', label: 'Aim tracker', sec: null, i: 'cross', g: 'Improve' },
  { r: 'paths', label: 'Training path', sec: null, i: 'route', g: 'Improve' },
  { r: 'notes', label: '1-on-1', sec: null, i: 'chat', g: 'Improve' }
];
function navAllowed(n) {
  if (!n.sec) return true;
  if (isStaff() && !S.me.ign && (n.r === 'checkin' || n.r === 'stats')) return false; // coach without an IGN doesn't need these
  return Array.isArray(n.sec) ? n.sec.some(can) : can(n.sec);
}

function render() {
  const me = S.me;
  if (me && !me.team_id) { renderOnboard(); return; }
  if (!me || !me.approved) { renderPending(); return; }
  const items = NAV.filter(navAllowed);
  if (!items.some(n => n.r === S.route) && !((S.route === 'coach' || S.route === 'explore') && isStaff()) && !(S.route === 'owner' && me.is_admin) && S.route !== 'account') S.route = 'home';
  const ownerView = me.is_admin && S.team && S.team.owner_id !== me.id;
  const link = (r, label, i) => '<a href="#/' + r + '" class="' + (S.route === r ? 'active' : '') + '">' + icon(i) + '<span>' + esc(label) + '</span></a>';
  const groups = groupBy(items, 'g');
  const navHtml = groups.map(([g, list]) => '<div class="nav-g">' + esc(g) + '</div>' + list.map(n => link(n.r, n.label, n.i)).join('')).join('') +
    (isStaff() || me.is_admin ? '<div class="nav-g">Manage</div>' : '') +
    (isStaff() ? link('coach', me.is_coach ? 'Coach panel' : 'Staff panel', 'gear') + link('explore', 'Other teams', 'eye') : '') +
    (me.is_admin ? link('owner', 'All teams', 'globe') : '');
  $('#app').innerHTML =
    '<div class="topbar"><button id="menubtn" aria-label="Menu">☰</button><span class="dot"></span><b>' + esc(teamName()) + '</b></div>' +
    '<div class="layout"><aside class="sidebar" id="sidebar"><div class="brand"><span class="dot"></span><span class="bn">' + esc(teamName()) + '</span>' + (S.team && S.team.tag ? '<span class="tag">' + esc(S.team.tag) + '</span>' : '') + '</div>' +
    (ownerView ? '<a href="#/owner" class="ownerbar">Owner view: another team.<br><b>Back to all teams</b></a>' : '') +
    '<nav class="nav">' + navHtml + '</nav>' +
    '<a href="#/account" class="me' + (S.route === 'account' ? ' active' : '') + '">' + avatar(me, 34) + '<div class="grow"><div class="t">' + esc(nameOf(me)) + '</div><div class="small muted">' +
      esc([me.discord ? '@' + me.discord : '', isStaff() ? staffLabel(me) : me.role].filter(Boolean).join(' · ')) + '</div></div></a></aside>' +
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
  if (S.cache[key]) return S.cache[key];
  // Cache the in-flight request as well as its result so parallel page
  // renders share one query instead of racing each other.
  const pending = db.list(table, opts).then(rows => {
    S.cache[key] = rows;
    return rows;
  }).catch(err => {
    delete S.cache[key];
    throw err;
  });
  S.cache[key] = pending;
  return pending;
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
  let [roster, members] = await Promise.all([cached('roster'), cached('profiles_list')]);
  roster = roster || []; members = members || [];
  const byId = new Map(members.map(m => [m.id, m]));
  const out = roster.map(r => {
    const m = r.claimed_by ? byId.get(r.claimed_by) : null;
    return { key: 'r' + r.id, name: r.ign || (m && m.ign) || r.name, ign: r.ign || (m && m.ign), role: r.role || (m && m.role), is_igl: r.is_igl, is_trial: r.is_trial,
      discord: r.discord || (m && m.discord), avatar_url: m && m.avatar_url, rank: m && m.rank, rank_rr: m && m.rank_rr, peak_rank: m && m.peak_rank, riot_id: m && m.riot_id, rank_updated: m && m.rank_updated, user_id: m ? m.id : null, joined: !!(m && r.claim_status === 'approved'), rid: r.id, bench: r.status === 'Bench' };
  });
  members.forEach(m => { if (!m.is_coach && !m.staff_role && !roster.some(r => r.claimed_by === m.id)) out.push({ key: 'u' + m.id, name: nameOf(m), ign: m.ign, role: m.role, is_igl: m.is_igl, is_trial: m.is_trial, discord: m.discord, avatar_url: m.avatar_url, rank: m.rank, rank_rr: m.rank_rr, peak_rank: m.peak_rank, riot_id: m.riot_id, rank_updated: m.rank_updated, user_id: m.id, joined: true }); });
  const staffIds = new Set(members.filter(m => m.is_coach || m.staff_role).map(m => m.id));
  const coaches = members.filter(m => m.is_coach).concat(members.filter(m => !m.is_coach && m.staff_role));
  return { players: out.filter(p => !(p.user_id && staffIds.has(p.user_id))).sort((a, b) => (a.is_trial ? 1 : 0) - (b.is_trial ? 1 : 0) || String(a.name).localeCompare(String(b.name))), coaches: coaches };
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
    (p.rank ? '<div style="margin-top:6px">' + rankPill(p.rank, true) + '</div>' : '') +
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
  const me = S.me, coach = isStaff(), head = me.is_coach;
  const doCheckin = can('checkin') && !(coach && !me.ign);
  const today = todayISO();
  const [ann, team, myHist, todayRows, ps, work, nxt, avail, plans] = await Promise.all([
    cached('announcements'), teamPlayers(),
    doCheckin ? db.list('checkins', { eq: { user_id: me.id }, order: 'day', asc: false, limit: 60 }) : Promise.resolve([]),
    coach ? db.list('checkins', { eq: { day: today } }) : Promise.resolve([]),
    can('my_stats') || can('team_stats') ? cached('player_stats') : Promise.resolve([]),
    can('reviews') ? cached('work_on') : Promise.resolve([]),
    nextScrim().catch(() => null), db.list('availability', { eq: { user_id: me.id } }).catch(() => []),
    can('scouting') ? db.list('game_plans', { limit: 200 }).catch(() => []) : Promise.resolve([])
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
      (head ? '<div class="quick">' +
      '<a href="#/coach/team" class="qa"><b>Invite players</b><span>Team code &amp; link</span></a>' +
      '<a href="#/coach/members" class="qa"><b>Roster</b><span>Slots, roles, access</span></a>' +
      '<a href="#/coach/announce" class="qa"><b>Post an update</b><span>Announcement</span></a>' +
      '<a href="#/coach/data" class="qa"><b>Import sheet</b><span>Stats, plays, reviews</span></a></div>' : '<div class="quick"><a href="#/reviews" class="qa"><b>Add a VOD review</b><span>VOD reviews</span></a><a href="#/coach/work" class="qa"><b>Work on</b><span>Suggestions to approve</span></a><a href="#/coach/data" class="qa"><b>Import sheet</b><span>Stats, reviews</span></a><a href="#/explore" class="qa"><b>Other teams</b><span>Results &amp; stats</span></a></div>');
  }

  // my stats
  let statsHtml = '';
  if (can('my_stats') && me.ign) {
    const s = statsFor(ps, me.ign);
    statsHtml = panel('My stats', '<a class="small" href="#/stats">All →</a>', s ? '<div class="mini-kpis">' + kpi(num(s.kd, 2), 'K/D') + kpi(pct(s.hs), 'HS kill %') + kpi(s.maps, 'Maps') + '</div>' : '<p class="muted small">No stats logged for you yet. They show up after the coach reviews scrims.</p>');
  }
  // roster
  const rosterHtml = panel('The team', '<a class="small" href="#/team">Roster &amp; stats →</a>',
    (team.coaches.length ? '<div class="small muted" style="margin-bottom:6px">Coaching staff: ' + team.coaches.map(c => esc(nameOf(c)) + ' <span class="muted">(' + esc(staffLabel(c)) + ')</span>').join(', ') + '</div>' : '') +
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
  // next scrim + "fill in your times" nudge
  let schedHtml = '';
  {
    const plan = nxt && (plans.find(p => p.scrim_id === nxt.id) || plans.find(p => sameOpp(p.opponent, nxt.opponent) && p.match_date && String(p.match_date).slice(0, 10) === isoOf(new Date(nxt.starts_at))));
    const mySlots = new Set(((avail[0] || {}).slots) || []);
    const mon = weekMonday(0), mon2 = weekMonday(1);
    const filled = m => DAYS.some((_, d) => SCHED_HOURS.some(h => mySlots.has(slotKey(slotDate(m, d, h)))));
    const nudge = !coach && !filled(mon) && !filled(mon2) ? '<a class="card alert" href="#/schedule" style="margin-bottom:14px"><b>When can you play this week?</b><span class="small muted">Mark your free times so the coach can book scrims →</span></a>' : '';
    schedHtml = nudge + (nxt ? panel('Next scrim', '<a class="small" href="#/schedule">Schedule →</a>', '<div class="nextscrim"><div class="sdate"><b>' + new Date(nxt.starts_at).toLocaleDateString(undefined, { weekday: 'short' }) + '</b><span>' + new Date(nxt.starts_at).getDate() + '</span></div><div class="grow">' +
      '<div class="t">vs ' + esc(nxt.opponent || 'TBD') + '</div><div class="small muted">' + esc(fmtWhen(nxt.starts_at)) + ' · ' + relDays(nxt.starts_at) + '</div><div class="row small" style="gap:6px;margin-top:4px">' + mapList(nxt.maps).map(m => '<span class="pill">' + esc(m) + '</span>').join('') + '</div></div>' +
      (plan ? '<a class="btn small" href="#/plans/' + plan.id + '">Game plan</a>' : '') + '</div>') : (coach ? panel('Next scrim', '<a class="small" href="#/schedule">Schedule →</a>', '<p class="muted small">Nothing booked. See when everyone is free and book one.</p>') : ''));
  }
  const ciHtml = doCheckin ? panel('Today\'s check-in', '<span class="muted small">' + new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) + '</span>', '<div id="ci-box"><p class="muted">Loading…</p></div>', 'ci-panel') : '';
  el.innerHTML = hero + '<div class="home-grid"><div class="col">' + (coach ? focusHtml : '') + coachHtml + ciHtml + '</div><div class="col">' + schedHtml + (coach ? '' : focusHtml) + annHtml + statsHtml + rosterHtml + '</div></div>';
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
  const tabs = [['roster', 'Roster']].concat(showStats ? [['leaderboard', 'Leaderboard'], ['matches', 'Matches']] : []).concat([['ranks', 'Ranks']]);
  const won = matches.filter(m => Number(m.rounds_won) > Number(m.rounds_lost)).length;
  const rw = sum(matches, 'rounds_won'), rl = sum(matches, 'rounds_lost');
  let body = '';
  if (tab === 'ranks') {
    body = await ranksTab();
  } else if (tab === 'roster' || !showStats) {
    body = (team.coaches.length ? '<div class="small muted" style="margin:4px 0 12px">Coaching staff: ' + team.coaches.map(c => '<span class="chip">' + avatar(c, 20) + esc(nameOf(c)) + ' <span class="muted">' + esc(staffLabel(c)) + '</span></span>').join(' ') + '</div>' : '') +
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
    (w.drill ? '<div class="small muted" style="margin-top:6px">Drill: ' + inlineMd(w.drill) + '</div>' : '') + workProgressHtml(w) +
    '<div class="small muted row" style="margin-top:8px;gap:10px">' + (w.date ? '<span>' + fmtDate(w.date) + '</span>' : '') + (w.source ? '<span>' + esc(w.source) + '</span>' : '') +
      (vi ? (opts.onSeek && vi.id ? '<button type="button" class="linkbtn" data-seek="' + (vi.t || 0) + '">▶ Watch ' + fmtTs(vi.t || 0) + '</button>' : '<a href="' + esc(vi.url) + '" target="_blank" rel="noopener">▶ Watch the moment</a>') : '') + '</div>' +
    (opts.coachView ? '<div class="row" style="margin-top:10px;gap:6px">' + (!w.approved ? '<button class="btn small" data-wapprove="' + w.id + '">Approve for ' + esc(isTeamWide(w) ? 'team' : w.player) + '</button>' : '<button class="btn small ghost" data-wunapprove="' + w.id + '">Hide from player</button>') +
      (w.approved ? '<button class="btn small ghost" data-wseen="' + w.id + '" title="This mistake showed up again">Seen again</button>' : '') + '<button class="btn small ghost" data-wedit="' + w.id + '">Edit</button><button class="btn small ghost" data-wdel="' + w.id + '">' + (w.approved ? 'Delete' : 'Dismiss') + '</button></div>' : '') + '</div>';
}
function wireWork(box, items, refresh) {
  $$('.wstat', box).forEach(sel => sel.onchange = async () => {
    const { error } = await sb.rpc('set_work_status', { wid: Number(sel.dataset.wid), new_status: sel.value });
    toast(error ? error.message : sel.value === 'Fixed' ? 'Nice — marked fixed' : 'Updated'); S.cache = {}; if (refresh) refresh();
  });
  $$('[data-wapprove]', box).forEach(b => b.onclick = async () => { await db.update('work_on', Number(b.dataset.wapprove), { approved: true }); S.cache = {}; toast('Approved — the player can see it now'); refresh(); });
  $$('[data-wunapprove]', box).forEach(b => b.onclick = async () => { await db.update('work_on', Number(b.dataset.wunapprove), { approved: false }); S.cache = {}; toast('Hidden from the player'); refresh(); });
  $$('[data-wedit]', box).forEach(b => b.onclick = () => editRow('work_on', items.find(w => w.id === Number(b.dataset.wedit)), () => { S.cache = {}; refresh(); }));
  $$('[data-wseen]', box).forEach(b => b.onclick = () => seenAgain(items.find(w => w.id === Number(b.dataset.wseen)), refresh));
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
    (isStaff() ? '<button class="btn small" id="addrev">Add a review</button>' : '') + '</div>' +
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
    (isStaff() && r.link ? linkHtml(r.link, 'Full review (coach)').replace('<a ', '<a class="btn small ghost" ') : '') + (isStaff() ? '<button class="btn small ghost" id="editrev">Edit</button>' : '') + '</div></div>' +
    '<div class="review-grid"><div class="vcol"><div class="player">' + (canEmbed ? '<iframe id="vplayer" src="' + esc(embedSrc(vi, start)) + '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>' : '<div class="noembed">' + (vi ? '<a class="btn" href="' + esc(vi.url) + '" target="_blank" rel="noopener">Watch the VOD</a>' : 'No video link on this review.') + '</div>') + '</div>' +
      (start ? '<div class="small muted" style="margin-top:6px">Game starts at <button class="linkbtn" data-seek="' + start + '">' + fmtTs(start) + '</button></div>' : '') + '</div>' +
    '<div class="ncol">' +
      (r.summary ? panel('Key takeaways', '', '<div class="md takeaways">' + md(String(r.summary).replace(/\s(\d\))\s/g, '\n$1 ')) + '</div>') : '') +
      (items.length ? panel('What we need to work on', '<a class="small" href="#/workon">All →</a>', items.map(w => workCard(w, { onSeek: true, coachView: isStaff() })).join('')) : '') +
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
  const me = S.me, coach = isStaff();
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
    workSummary(list, coach && who === 'all') +
    '<div class="tabs">' + (coach ? '' : tab('me', 'Mine')) + tab('all', 'Everything') + tab('team', 'Whole team') + players.map(p => tab(p, p)).join('') + '</div>' +
    (open.length ? '<div class="wgrid">' + open.map(w => workCard(w, { coachView: coach })).join('') + '</div>' : empty(list.length ? 'Everything here is fixed. 💪' : (coach ? 'Nothing approved yet. Approve suggestions from the VOD reviews in Coach panel → Work on.' : 'Nothing to work on right now. Your coach adds items from VOD reviews.'))) +
    (fixed.length ? '<details class="item" style="margin-top:16px"' + (showFixed ? ' open' : '') + '><summary><span class="t">Fixed (' + fixed.length + ')</span></summary><div class="body"><div class="wgrid">' + fixed.map(w => workCard(w, { coachView: coach })).join('') + '</div></div></details>' : '');
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
    '<div class="card" style="max-width:520px;margin-top:14px"><h2>Rank</h2><div id="rkbox"></div></div>' +
    '<div class="card" style="max-width:520px;margin-top:14px"><b>Install the app</b><p class="small muted">Phone: open this site in Safari (iPhone) or Chrome (Android) → Share / menu → <b>Add to Home Screen</b>. Computer: in Chrome or Edge click the install icon at the right end of the address bar.</p></div>';
  rankForm($('#rkbox'), () => PAGES.account(el));
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
  if (!isStaff()) { el.innerHTML = '<p>Coaches only.</p>'; return; }
  const head = S.me.is_coach;
  const tabs = head ? [['members', 'Members'], ['work', 'Work on'], ['team', 'Team & invites'], ['publicpage', 'Public page & maps'], ['checkins', 'Check-ins'], ['announce', 'Announcements'], ['data', 'Content & import']]
    : [['work', 'Work on'], ['checkins', 'Check-ins'], ['data', 'Content & import']];
  let sub = location.hash.split('/')[2] || tabs[0][0];
  if (!tabs.some(t => t[0] === sub)) sub = tabs[0][0];
  el.innerHTML = '<div class="page-h"><div><h1>' + (head ? 'Coach panel' : 'Staff panel') + '</h1>' + (head ? '' : '<p class="muted">You\'re ' + esc(S.me.staff_role === 'Analyst' ? 'an analyst' : 'an assistant coach') + ': you can add VOD reviews, work-on items, stats and plays. Members, the roster, invites and map picks are managed by the head coach.</p>') + '</div></div><div class="tabs">' + tabs.map(t => '<button data-t="' + t[0] + '" class="' + (t[0] === sub ? 'active' : '') + '">' + t[1] + '</button>').join('') + '</div><div id="cp"></div>';
  $$('.tabs button', el).forEach(b => b.onclick = () => { location.hash = '#/coach/' + b.dataset.t; });
  await (COACH[sub] || COACH[tabs[0][0]])($('#cp'));
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
    if (f.staff_role) patch.staff_role = patch.is_coach ? null : (f.staff_role.value || null);
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
    (m.is_coach ? '<span class="pill red">Coach</span> ' : '') + (!m.is_coach && m.staff_role ? '<span class="pill purple">' + esc(m.staff_role) + '</span> ' : '') + (!m.approved ? '<span class="pill yellow">Waiting</span> ' : '') + (m.is_trial ? '<span class="pill yellow">Trial</span> ' : '') +
    '<span class="muted small">' + esc([m.discord ? '@' + m.discord : '', m.ign || 'no IGN', m.role || '', m.is_igl ? 'IGL' : ''].filter(Boolean).join(' · ')) + '</span>' +
    (m.staff_role ? '' : slot ? ' <span class="pill ' + (slot.claim_status === 'approved' ? 'green' : 'yellow') + '">' + (slot.claim_status === 'approved' ? 'Linked to ' : 'Claims ') + esc(slot.name) + '</span>' : (m.is_coach ? '' : ' <span class="pill">No roster slot</span>')) + '</div>' +
    (!m.approved ? '<button class="btn small" data-approve="' + m.id + '">' + (slot ? 'Confirm' : 'Approve') + '</button>' : '') + '</div></summary>' +
    '<div class="body"><form class="member" data-id="' + m.id + '"><div class="muted small" style="margin-bottom:8px">' + esc(m.discord ? 'Discord @' + m.discord : '') + ' · joined ' + fmtDate(m.created_at) + '</div>' +
    '<div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">' +
        '<label class="f"><span>In-game name (matches stats)</span><input name="ign" value="' + esc(m.ign || '') + '"></label>' +
    '<label class="f"><span>Role</span><select name="role">' + ROLES.map(r => '<option' + (r === m.role ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></label></div>' +
    '<div class="row" style="margin-bottom:10px">' +
    '<label class="row small"><input type="checkbox" name="approved"' + (m.approved ? ' checked' : '') + (me ? ' disabled' : '') + '> Approved</label>' +
    '<label class="row small"><input type="checkbox" name="is_igl"' + (m.is_igl ? ' checked' : '') + '> IGL</label>' +
    '<label class="row small"><input type="checkbox" name="is_trial"' + (m.is_trial ? ' checked' : '') + '> Trial player</label>' +
    (me ? '' : '<label class="row small"><input type="checkbox" name="is_coach"' + (m.is_coach ? ' checked' : '') + '> Head coach (full access)</label>') + '</div>' +
    (me || m.is_coach ? '' : '<label class="f" style="max-width:320px"><span>Team role</span><select name="staff_role"><option value="">Player</option>' + STAFF_ROLES.map(r => '<option' + (r === m.staff_role ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></label>') +
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
  const players = (members || []).filter(m => (!m.is_coach && !m.staff_role) || rows.some(r => r.user_id === m.id));
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
  const counts = await Promise.all(keys.map(async k => { let q = sb.from(k).select('id', { count: 'exact', head: true }); if (CROSS_TABLES.includes(k)) q = q.eq('team_id', S.me.team_id); const { count } = await q; return count || 0; }));
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
      if (!row.id) (cfg.keepOnAdd || []).forEach(k => { if (row[k] != null) rec[k] = row[k]; });
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
  // same player + same mistake on a different date = it came up again: log it on the existing item instead of adding a duplicate
  const same = r => normName(r.player) + '|' + String(r.issue || '').toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 80);
  const fresh = [];
  for (const r of rows) {
    if (seen.has(key(r))) continue;
    const ex = have.find(h => h.approved && same(h) === same(r));
    const d = r.date ? String(r.date).slice(0, 10) : null;
    if (ex && d) {
      const t = workTrack(ex);
      if (!t.dates.includes(d)) {
        const patch = { seen: (Array.isArray(ex.seen) ? ex.seen : []).concat([{ date: d, source: r.source || null }]) };
        if (ex.status === 'Fixed' && (!t.fixedAt || d > t.fixedAt)) { patch.status = 'Open'; patch.came_back = true; }
        await db.update('work_on', ex.id, patch); Object.assign(ex, patch);
      }
      seen.add(key(r)); continue;
    }
    fresh.push(Object.assign({ status: 'Open', priority: 'Medium' }, r, { approved: false })); seen.add(key(r));
  }
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


// =====================================================================
//  Scrim scheduler, map pool, game plans, work-on progress
// =====================================================================
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SCHED_HOURS = [];
for (let h = 10; h <= 25; h++) SCHED_HOURS.push(h); // 10am .. 1am (next day)
let SCHED_STOP = null;
document.addEventListener('pointerup', () => { if (SCHED_STOP) SCHED_STOP(); });
document.addEventListener('pointerdown', e => { window.__lastPointer = e.pointerType; }, true);
function weekMonday(offset) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * (offset || 0)); return d; }
function slotDate(monday, day, hour) { const d = new Date(monday); d.setDate(d.getDate() + day); d.setHours(hour, 0, 0, 0); return d; }
function slotKey(d) { return d.toISOString().slice(0, 13) + ':00Z'; }
function hourLabel(h) { h = h % 24; return (h % 12 || 12) + (h < 12 ? 'am' : 'pm'); }
function fmtWhen(iso) { const d = new Date(iso); return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
function relDays(iso) {
  const d = new Date(iso), now = new Date(); const a = new Date(d); a.setHours(0, 0, 0, 0); const b = new Date(now); b.setHours(0, 0, 0, 0);
  const n = Math.round((a - b) / 86400000);
  if (n === 0) return d > now ? 'today' : 'today'; if (n === 1) return 'tomorrow'; if (n === -1) return 'yesterday';
  return n > 0 ? 'in ' + n + ' days' : Math.abs(n) + ' days ago';
}
function myTZ() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } }
function sameOpp(a, b) { const x = normName(a), y = normName(b); return !!(x && y && (x === y || x.includes(y) || y.includes(x))); }
function mapList(s) { return String(s || '').split(/[,/+&]| and /i).map(x => x.trim()).filter(Boolean).map(x => MAPS.find(m => m.toLowerCase() === x.toLowerCase()) || x); }
function matchType(m) { return m.type || (/scrim/i.test(m.event || '') ? 'Scrim' : m.event ? 'Official' : 'Scrim'); }
function isWin(m) { return Number(m.rounds_won) > Number(m.rounds_lost); }
async function listScrims() { return db.list('scrims', { order: 'starts_at', asc: true, limit: 500 }); }
async function nextScrim() { const now = Date.now() - 3 * 3600000; return (await listScrims()).find(s => s.status === 'Planned' && new Date(s.starts_at).getTime() > now) || null; }

// ---- Schedule page
PAGES.schedule = async function (el) {
  const me = S.me, coach = isStaff();
  const off = Number(location.hash.split('/')[2]) || 0;
  const monday = weekMonday(off);
  const [avail, scrims, team, plans] = await Promise.all([db.list('availability', { limit: 200 }), listScrims(), teamPlayers(),
    can('scouting') ? db.list('game_plans', { limit: 500 }) : Promise.resolve([])]);
  const people = new Map(); // user_id -> display
  team.players.filter(p => p.user_id).forEach(p => people.set(p.user_id, p));
  team.coaches.forEach(c => { if (!people.has(c.id)) people.set(c.id, Object.assign({ coach: true }, c)); });
  const counted = new Set(team.players.filter(p => p.user_id && !p.bench).map(p => p.user_id)); // active players
  let mine = avail.find(a => a.user_id === me.id);
  const mySlots = new Set((mine && mine.slots) || []);
  const byKey = new Map();
  avail.forEach(a => (a.slots || []).forEach(k => { if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(a.user_id); }));
  const total = counted.size;
  const nowMs = Date.now();
  const upcoming = scrims.filter(s => s.status !== 'Cancelled' && new Date(s.starts_at).getTime() > nowMs - 3 * 3600000 && s.status === 'Planned');
  const past = scrims.filter(s => !upcoming.includes(s)).reverse().slice(0, 8);
  const planFor = s => plans.find(p => p.scrim_id === s.id) || plans.find(p => p.match_date && String(p.match_date).slice(0, 10) === isoOf(new Date(s.starts_at)) && sameOpp(p.opponent, s.opponent));
  const scrimRow = s => { const plan = planFor(s); const d = new Date(s.starts_at);
    return '<div class="srow' + (s.status === 'Cancelled' ? ' cancelled' : '') + '"><div class="sdate"><b>' + d.toLocaleDateString(undefined, { weekday: 'short' }) + '</b><span>' + d.getDate() + '</span></div>' +
      '<div class="grow"><div class="t">vs ' + esc(s.opponent || 'TBD') + ' <span class="muted small">' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) + ' · ' + relDays(s.starts_at) + '</span></div>' +
      '<div class="row small" style="gap:6px;margin-top:4px">' + mapList(s.maps).map(m => '<span class="pill">' + esc(m) + '</span>').join('') + (s.format ? '<span class="muted">' + esc(s.format) + '</span>' : '') +
      (s.status !== 'Planned' ? '<span class="pill ' + (s.status === 'Done' ? 'green' : '') + '">' + esc(s.status) + '</span>' : '') + '</div>' +
      (s.notes ? '<div class="small muted" style="margin-top:4px">' + inlineMd(s.notes) + '</div>' : '') + '</div>' +
      '<div class="row" style="gap:6px;justify-content:flex-end">' + (plan ? '<a class="btn small ghost" href="#/plans/' + plan.id + '">Game plan</a>' : (coach && s.status === 'Planned' ? '<button class="btn small ghost" data-plan="' + s.id + '">Make game plan</button>' : '')) +
      (coach ? (s.status === 'Planned' ? '<button class="btn small" data-result="' + s.id + '">Log result</button>' : '') + '<button class="btn small ghost" data-sedit="' + s.id + '">Edit</button>' : '') + '</div></div>'; };

  // best times: blocks of consecutive hours where (almost) everyone is free
  const need = total ? Math.min(5, total) : 1;
  const blocks = [];
  for (let d = 0; d < 7; d++) {
    let cur = null;
    SCHED_HOURS.forEach(h => { const k = slotKey(slotDate(monday, d, h)); const n = (byKey.get(k) || []).filter(u => counted.has(u)).length;
      if (n >= need && slotDate(monday, d, h).getTime() > nowMs) { if (cur && cur.end === h) { cur.end = h + 1; cur.min = Math.min(cur.min, n); } else { cur = { d: d, start: h, end: h + 1, min: n }; blocks.push(cur); } } else cur = null; });
  }
  blocks.sort((a, b) => b.min - a.min || (b.end - b.start) - (a.end - a.start));
  const bestHtml = blocks.length ? blocks.slice(0, 6).map(b => '<div class="best"><div class="grow"><b>' + DAYS[b.d] + ' ' + slotDate(monday, b.d, 0).getDate() + '</b> · ' + hourLabel(b.start) + '–' + hourLabel(b.end) +
      ' <span class="pill green">' + b.min + '/' + total + ' free</span></div>' + (coach ? '<button class="btn small ghost" data-book="' + slotDate(monday, b.d, b.start).toISOString() + '">Book scrim</button>' : '') + '</div>').join('')
    : '<p class="muted small">' + (total ? 'No time this week where ' + need + ' players are free yet. Ask everyone to fill in their times.' : 'Add players to the roster first.') + '</p>';
  const missing = Array.from(counted).filter(u => { const a = avail.find(x => x.user_id === u); const keys = new Set((a && a.slots) || []);
    return !DAYS.some((_, d) => SCHED_HOURS.some(h => keys.has(slotKey(slotDate(monday, d, h))))); }).map(u => nameOf(people.get(u)));

  const head = '<tr><th></th>' + DAYS.map((d, i) => { const dt = slotDate(monday, i, 0); const today = isoOf(dt) === todayISO();
    return '<th class="' + (today ? 'today' : '') + '">' + d + '<span>' + dt.getDate() + '</span></th>'; }).join('') + '</tr>';
  const rows = SCHED_HOURS.map(h => '<tr><th class="hl">' + hourLabel(h) + '</th>' + DAYS.map((_, d) => { const dt = slotDate(monday, d, h); const k = slotKey(dt);
    const who = (byKey.get(k) || []); const n = who.filter(u => counted.has(u)).length; const lvl = total ? Math.min(4, Math.round(n / total * 4)) : 0;
    const names = who.map(u => nameOf(people.get(u) || {})).join(', ');
    return '<td class="cell l' + lvl + (mySlots.has(k) ? ' mine' : '') + (dt.getTime() < nowMs ? ' past' : '') + '" data-k="' + k + '" title="' + esc(names || 'Nobody yet') + '">' + (n ? '<span>' + n + '</span>' : '') + '</td>'; }).join('') + '</tr>').join('');

  el.innerHTML = '<div class="page-h"><div><h1>Schedule</h1><p class="muted">Mark when you can play, and see when the whole team is free. Times are in your time zone' + (myTZ() ? ' (' + esc(myTZ().replace(/_/g, ' ')) + ')' : '') + '.</p></div>' +
    (coach ? '<button class="btn small" id="book">Book a scrim</button>' : '') + '</div>' +
    panel('Upcoming scrims', '', upcoming.length ? '<div class="slist">' + upcoming.map(scrimRow).join('') + '</div>' : empty(coach ? 'No scrims booked. Use “Best times” below to find when everyone is free.' : 'No scrims booked yet.')) +
    '<div class="sched-grid">' +
    '<section class="card panel"><div class="card-h"><h2>When are you free?</h2><div class="row" style="gap:6px"><a class="btn small ghost" href="#/schedule/' + (off - 1) + '">←</a><b class="small">' +
      (off === 0 ? 'This week' : off === 1 ? 'Next week' : off === -1 ? 'Last week' : 'Week of ' + monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) +
      '</b><a class="btn small ghost" href="#/schedule/' + (off + 1) + '">→</a></div></div>' +
      '<p class="small muted" style="margin-top:0">Click or drag over the hours you can play. Darker = more of the team is free; the number is how many players. Hover to see who.</p>' +
      '<div class="tablewrap"><table class="avail"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="row" style="margin-top:10px"><button class="btn small ghost" id="copyprev">Copy my times from last week</button><button class="btn small ghost" id="clearwk">Clear my week</button><span class="small muted" id="savest"></span></div></section>' +
    '<div class="col">' + panel('Best times this week', '', bestHtml) +
      (missing.length ? panel('Haven\'t filled in this week', '', '<p class="small">' + missing.map(esc).join(', ') + '</p>') : '') + '</div></div>' +
    (past.length ? '<details class="item" style="margin-top:16px"><summary><span class="t">Past &amp; cancelled scrims (' + past.length + ')</span></summary><div class="body"><div class="slist">' + past.map(scrimRow).join('') + '</div></div></details>' : '');

  // painting availability
  let painting = null, timer = null;
  const status = t => { const s = $('#savest'); if (s) s.textContent = t; };
  async function save() {
    const cutoff = Date.now() - 21 * 86400000;
    const slots = Array.from(mySlots).filter(k => new Date(k).getTime() > cutoff).sort();
    status('Saving…');
    try {
      if (mine && mine.id) await db.update('availability', mine.id, { slots: slots, updated_at: new Date().toISOString() });
      else { await db.insert('availability', [{ slots: slots, user_id: me.id }]); const again = await db.list('availability', { eq: { user_id: me.id } }); if (again[0]) mine = again[0]; }
      status('Saved ✓');
    } catch (err) { status('Couldn\'t save: ' + err.message); }
  }
  const queue = () => { clearTimeout(timer); timer = setTimeout(save, 700); status('…'); };
  const setCell = (td, on) => { const k = td.dataset.k; if (on) mySlots.add(k); else mySlots.delete(k); td.classList.toggle('mine', on);
    const who = (byKey.get(k) || []).filter(u => u !== me.id).concat(on ? [me.id] : []); byKey.set(k, who);
    const n = who.filter(u => counted.has(u)).length;
    td.innerHTML = n ? '<span>' + n + '</span>' : ''; td.className = td.className.replace(/\bl\d\b/, 'l' + (total ? Math.min(4, Math.round(n / total * 4)) : 0));
    td.title = who.map(u => nameOf(people.get(u) || {})).join(', ') || 'Nobody yet';
    queue(); };
  $$('td.cell', el).forEach(td => {
    td.addEventListener('pointerdown', e => { if (td.classList.contains('past') || e.pointerType === 'touch') return; e.preventDefault(); painting = !td.classList.contains('mine'); setCell(td, painting); });
    td.addEventListener('click', e => { if (td.classList.contains('past') || e.pointerType === 'mouse' || painting !== null) return; if (td.__lastToggle && Date.now() - td.__lastToggle < 300) return; td.__lastToggle = Date.now(); if (window.__lastPointer === 'touch') setCell(td, !td.classList.contains('mine')); });
    td.addEventListener('pointerenter', () => { if (painting === null || td.classList.contains('past')) return; if (td.classList.contains('mine') !== painting) setCell(td, painting); });
  });
  SCHED_STOP = () => { painting = null; };
  $('#copyprev').onclick = () => { const prev = weekMonday(off - 1); let n = 0;
    DAYS.forEach((_, d) => SCHED_HOURS.forEach(h => { const a = slotKey(slotDate(prev, d, h)); const b = slotDate(monday, d, h); if (mySlots.has(a) && b.getTime() > Date.now()) { mySlots.add(slotKey(b)); n++; } }));
    if (!n) { toast('Nothing to copy from last week'); return; } save().then(() => render()); };
  $('#clearwk').onclick = () => { DAYS.forEach((_, d) => SCHED_HOURS.forEach(h => mySlots.delete(slotKey(slotDate(monday, d, h))))); save().then(() => render()); };
  if ($('#book')) $('#book').onclick = () => scrimForm(null, null);
  $$('[data-book]', el).forEach(b => b.onclick = () => scrimForm(null, b.dataset.book));
  $$('[data-sedit]', el).forEach(b => b.onclick = () => scrimForm(scrims.find(s => s.id === Number(b.dataset.sedit))));
  $$('[data-result]', el).forEach(b => b.onclick = () => scrimResult(scrims.find(s => s.id === Number(b.dataset.result))));
  $$('[data-plan]', el).forEach(b => b.onclick = () => { const s = scrims.find(x => x.id === Number(b.dataset.plan)); newPlanFrom(s); });
};

function mapChecks(selected) {
  const sel = new Set(mapList(selected).map(m => m.toLowerCase()));
  return '<div class="mapchecks">' + MAPS.map(m => '<label><input type="checkbox" name="maps" value="' + m + '"' + (sel.has(m.toLowerCase()) ? ' checked' : '') + '> ' + m + '</label>').join('') + '</div>';
}
function scrimForm(s, startIso) {
  s = s || {};
  const d = s.starts_at ? new Date(s.starts_at) : startIso ? new Date(startIso) : (() => { const x = new Date(); x.setDate(x.getDate() + 1); x.setHours(19, 0, 0, 0); return x; })();
  const time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  openModal('<h2>' + (s.id ? 'Edit scrim' : 'Book a scrim') + '</h2><form id="sf">' +
    '<div class="row"><label class="f grow"><span>Date</span><input type="date" name="date" required value="' + isoOf(d) + '"></label><label class="f grow"><span>Start time (your time)</span><input type="time" name="time" required value="' + time + '"></label></div>' +
    '<label class="f"><span>Opponent</span><input name="opponent" required value="' + esc(s.opponent || '') + '" placeholder="Team name"></label>' +
    '<div class="f"><span>Maps</span>' + mapChecks(s.maps) + '</div>' +
    '<label class="f"><span>Format</span><input name="format" value="' + esc(s.format || '') + '" placeholder="e.g. 2 maps, 24 rounds each"></label>' +
    '<label class="f"><span>Notes (lobby, contact, what to practise)</span><textarea name="notes" rows="3">' + esc(s.notes || '') + '</textarea></label>' +
    (s.id ? '<label class="f"><span>Status</span><select name="status">' + ['Planned', 'Done', 'Cancelled'].map(x => '<option' + (x === s.status ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label>' : '') +
    '<div class="row"><button class="btn">' + (s.id ? 'Save' : 'Book it') + '</button><button type="button" class="btn ghost" data-close>Cancel</button>' + (s.id ? '<span class="grow"></span><button type="button" class="btn small danger" id="sdel">Delete</button>' : '') + '</div></form>', m => {
    $('#sf', m).onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      const rec = { starts_at: new Date(f.date.value + 'T' + f.time.value).toISOString(), opponent: f.opponent.value.trim(), maps: $$('[name=maps]:checked', f).map(c => c.value).join(', ') || null,
        format: f.format.value.trim() || null, notes: f.notes.value.trim() || null };
      if (f.status) rec.status = f.status.value;
      try { if (s.id) await db.update('scrims', s.id, rec); else await db.insert('scrims', [Object.assign({ status: 'Planned' }, rec)]); closeModal(); toast(s.id ? 'Saved' : 'Scrim booked'); S.cache = {}; render(); }
      catch (err) { toast('Error: ' + err.message); }
    };
    if ($('#sdel', m)) $('#sdel', m).onclick = async () => { if (!confirm('Delete this scrim?')) return; await db.remove('scrims', s.id); closeModal(); S.cache = {}; render(); };
  });
}
function scrimResult(s) {
  const maps = mapList(s.maps); if (!maps.length) maps.push('');
  const block = (m, i) => '<div class="resmap" data-i="' + i + '"><div class="row"><label class="f grow"><span>Map</span><select name="map' + i + '"><option value="">—</option>' + MAPS.map(x => '<option' + (x === m ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label>' +
    '<label class="f"><span>Rounds won</span><input name="rw' + i + '" inputmode="numeric" style="width:90px"></label><label class="f"><span>Rounds lost</span><input name="rl' + i + '" inputmode="numeric" style="width:90px"></label>' +
    '<label class="f"><span>Started on</span><select name="ss' + i + '"><option></option><option>Attack</option><option>Defense</option></select></label></div>' +
    '<div class="row small"><label class="f"><span>Attack rounds W–L</span><span class="row" style="gap:4px"><input name="aw' + i + '" style="width:60px">–<input name="al' + i + '" style="width:60px"></span></label>' +
    '<label class="f"><span>Defense rounds W–L</span><span class="row" style="gap:4px"><input name="dw' + i + '" style="width:60px">–<input name="dl' + i + '" style="width:60px"></span></label>' +
    '<label class="f"><span>Pistols won</span><select name="pw' + i + '"><option value=""></option><option>0</option><option>1</option><option>2</option></select></label></div></div>';
  openModal('<h2>Result vs ' + esc(s.opponent || '') + '</h2><p class="small muted">Saved as matches, so they count in the Map pool and on the Team page. Attack/defense and pistols are optional.</p><form id="rf"><div id="resmaps">' +
    maps.map(block).join('') + '</div><button type="button" class="btn small ghost" id="addmap">+ Another map</button><label class="f" style="margin-top:10px"><span>Notes</span><textarea name="notes" rows="2"></textarea></label>' +
    '<div class="row"><button class="btn">Save result</button><button type="button" class="btn ghost" data-close>Cancel</button></div></form>', m => {
    let n = maps.length;
    $('#addmap', m).onclick = () => { $('#resmaps', m).insertAdjacentHTML('beforeend', block('', n++)); };
    $('#rf', m).onsubmit = async e => {
      e.preventDefault(); const f = e.target; const int = v => v === '' || v == null || isNaN(v) ? null : parseInt(v, 10);
      const rows = [];
      for (let i = 0; i < n; i++) { if (!f['map' + i] || !f['map' + i].value) continue;
        rows.push({ date: isoOf(new Date(s.starts_at)), event: 'Scrim', type: 'Scrim', opponent: s.opponent, map: f['map' + i].value, rounds_won: int(f['rw' + i].value), rounds_lost: int(f['rl' + i].value),
          start_side: f['ss' + i].value || null, atk_won: int(f['aw' + i].value), atk_lost: int(f['al' + i].value), def_won: int(f['dw' + i].value), def_lost: int(f['dl' + i].value),
          pistols_won: int(f['pw' + i].value), notes: f.notes.value.trim() || null, scrim_id: s.id }); }
      if (!rows.length) { toast('Pick at least one map'); return; }
      if (rows.some(r => r.rounds_won == null || r.rounds_lost == null)) { toast('Enter rounds won and lost for each map'); return; }
      try { await db.insert('matches', rows); await db.update('scrims', s.id, { status: 'Done' }); closeModal(); S.cache = {}; toast('Result saved'); render(); }
      catch (err) { toast('Error: ' + err.message); }
    };
  });
}

// ---- Map pool
const POOL = ['Main pick', 'In pool', 'Practising', 'Ban'];
const POOL_PILL = { 'Main pick': 'green', 'In pool': 'blue', Practising: 'yellow', Ban: 'red' };
function mapStats(list) {
  const n = list.length, w = list.filter(isWin).length;
  const rw = sum(list, 'rounds_won'), rl = sum(list, 'rounds_lost');
  const atk = list.filter(m => m.atk_won != null || m.atk_lost != null), def = list.filter(m => m.def_won != null || m.def_lost != null);
  const aw = sum(atk, 'atk_won'), al = sum(atk, 'atk_lost'), dw = sum(def, 'def_won'), dl = sum(def, 'def_lost');
  const pist = list.filter(m => m.pistols_won != null && m.pistols_won !== '');
  const sorted = list.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a.id - b.id);
  return { n: n, w: w, l: n - w, wp: n ? w / n : null, rw: rw, rl: rl, rp: rw + rl ? rw / (rw + rl) : null,
    ap: aw + al ? aw / (aw + al) : null, aw: aw, al: al, dp: dw + dl ? dw / (dw + dl) : null, dw: dw, dl: dl,
    pw: sum(pist, 'pistols_won'), pn: pist.length * 2, last: sorted.length ? sorted[sorted.length - 1].date : null, form: sorted.slice(-5) };
}
PAGES.maps = async function (el) {
  const coach = S.me.is_coach;
  const parts = location.hash.split('/'); const typ = parts[2] || 'all', per = parts[3] || 'all';
  const [allMatches, pool, ps] = await Promise.all([cached('matches'), db.list('map_pool', { limit: 100 }), cached('player_stats')]);
  const since = per === '30' ? addDays(todayISO(), -30) : per === '90' ? addDays(todayISO(), -90) : null;
  const matches = allMatches.filter(m => m.map && (typ === 'all' || matchType(m).toLowerCase() === typ) && (!since || String(m.date || '') >= since));
  const names = Array.from(new Set(MAPS.concat(matches.map(m => m.map)).concat(pool.map(p => p.map))));
  const poolOf = m => pool.find(p => p.map.toLowerCase() === m.toLowerCase()) || {};
  const cards = names.map(m => { const list = matches.filter(x => String(x.map).toLowerCase() === m.toLowerCase()); return Object.assign({ map: m, pool: poolOf(m) }, mapStats(list),
    { best: bestOnMap(ps.filter(r => String(r.map || '').toLowerCase() === m.toLowerCase() && (!since || String(r.date || '') >= since))) }); });
  const rank = c => { const i = POOL.indexOf(c.pool.status); return i < 0 ? (c.n ? 3.5 : 5) : i === 3 ? 6 : i; };
  cards.sort((a, b) => rank(a) - rank(b) || b.n - a.n || a.map.localeCompare(b.map));
  const all = mapStats(matches);
  const played = cards.filter(c => c.n >= 2);
  const best = played.slice().sort((a, b) => b.wp - a.wp || b.rp - a.rp)[0], worst = played.slice().sort((a, b) => a.wp - b.wp || a.rp - b.rp)[0];
  const picks = cards.filter(c => c.pool.status !== 'Ban' && c.n >= 2 && c.wp >= .5).sort((a, b) => b.wp - a.wp || b.n - a.n).slice(0, 2);
  const bans = cards.filter(c => c.pool.status === 'Ban').concat(cards.filter(c => c.pool.status !== 'Ban' && c.n >= 2 && c.wp < .5).sort((a, b) => a.wp - b.wp)).slice(0, 2);
  const tab = (href, label, on) => '<a href="' + href + '" class="' + (on ? 'active' : '') + '">' + label + '</a>';
  const dots = c => c.form.map(m => '<span class="fdot ' + (isWin(m) ? 'w' : 'l') + '" title="' + esc((m.date ? fmtDate(m.date) + ' · ' : '') + (m.opponent || '') + ' ' + m.rounds_won + '–' + m.rounds_lost) + '"></span>').join('');
  const card = c => '<div class="mapcard' + (c.pool.status === 'Ban' ? ' ban' : '') + '"><div class="row spread"><h3>' + esc(c.map) + '</h3>' +
      (coach ? '<select class="poolsel" data-map="' + esc(c.map) + '"><option value="">Not set</option>' + POOL.map(p => '<option' + (p === c.pool.status ? ' selected' : '') + '>' + p + '</option>').join('') + '</select>'
        : (c.pool.status ? '<span class="pill ' + POOL_PILL[c.pool.status] + '">' + esc(c.pool.status) + '</span>' : '')) + '</div>' +
    (c.n ? '<div class="mbig"><b>' + pct(c.wp) + '</b><span class="muted small">' + c.w + 'W – ' + c.l + 'L · ' + c.n + ' played</span></div>' +
      '<div class="bar"><div style="width:' + Math.round((c.wp || 0) * 100) + '%"></div></div>' +
      '<div class="mgrid"><div><span>Rounds</span><b>' + pct(c.rp) + '</b><i>' + c.rw + '–' + c.rl + '</i></div><div><span>Attack</span><b>' + pct(c.ap) + '</b><i>' + (c.ap == null ? 'not logged' : c.aw + '–' + c.al) + '</i></div>' +
      '<div><span>Defense</span><b>' + pct(c.dp) + '</b><i>' + (c.dp == null ? 'not logged' : c.dw + '–' + c.dl) + '</i></div><div><span>Pistols</span><b>' + (c.pn ? c.pw + '/' + c.pn : '–') + '</b><i>' + (c.pn ? pct(c.pw / c.pn) : 'not logged') + '</i></div></div>' +
      '<div class="row small" style="margin-top:10px;gap:8px"><span class="muted">Form</span>' + dots(c) + '<span class="grow"></span><span class="muted">Last ' + (c.last ? fmtDate(c.last) : '–') + '</span></div>' +
      (c.best ? '<div class="small" style="margin-top:6px"><span class="muted">Top fragger:</span> <b>' + esc(c.best.name) + '</b> ' + num(c.best.kd, 2) + ' K/D</div>' : '')
      : '<p class="muted small" style="margin:10px 0">Not played' + (since ? ' in this period' : ' yet') + '.</p>') +
    (coach ? '<input class="poolnote" data-map="' + esc(c.map) + '" placeholder="Coach note (e.g. need a B retake)" value="' + esc(c.pool.notes || '') + '">' : (c.pool.notes ? '<div class="small quote" style="margin-top:8px">' + esc(c.pool.notes) + '</div>' : '')) + '</div>';
  el.innerHTML = '<div class="page-h"><div><h1>Map pool</h1><p class="muted">How we do on every map, from logged scrims and matches.' + (coach ? ' Set each map\'s status to plan your pool and veto.' : '') + '</p></div>' +
    (isStaff() ? '<button class="btn small" id="logm">Log a match</button>' : '') + '</div>' +
    '<div class="row spread" style="margin-bottom:6px"><div class="tabs" style="margin:0">' + tab('#/maps/all/' + per, 'All games', typ === 'all') + tab('#/maps/scrim/' + per, 'Scrims', typ === 'scrim') + tab('#/maps/official/' + per, 'Official', typ === 'official') + '</div>' +
    '<div class="tabs" style="margin:0">' + tab('#/maps/' + typ + '/all', 'All time', per === 'all') + tab('#/maps/' + typ + '/90', '90 days', per === '90') + tab('#/maps/' + typ + '/30', '30 days', per === '30') + '</div></div>' +
    '<div class="kpis">' + kpi(all.w + '–' + all.l, 'Map record') + kpi(pct(all.wp), 'Map win %') + kpi(pct(all.rp), 'Round win %') + kpi(best ? esc(best.map) : '–', 'Best map') + kpi(worst && worst !== best ? esc(worst.map) : '–', 'Weakest map') + '</div>' +
    (matches.length ? panel('Veto helper', '', '<div class="row" style="gap:18px;align-items:flex-start"><div class="grow"><div class="lbl small muted">PICK</div>' + (picks.length ? picks.map(c => '<div><b>' + esc(c.map) + '</b> <span class="small muted">' + pct(c.wp) + ' over ' + c.n + '</span></div>').join('') : '<div class="small muted">Need 2+ games on a map with a winning record.</div>') + '</div>' +
      '<div class="grow"><div class="lbl small muted">BAN</div>' + (bans.length ? bans.map(c => '<div><b>' + esc(c.map) + '</b> <span class="small muted">' + (c.pool.status === 'Ban' ? 'set as ban' : pct(c.wp) + ' over ' + c.n) + '</span></div>').join('') : '<div class="small muted">No weak maps yet.</div>') + '</div>' +
      '<div class="grow"><div class="lbl small muted">NOT PLAYED</div><div class="small">' + (cards.filter(c => !c.n && c.pool.status !== 'Ban').map(c => esc(c.map)).join(', ') || '—') + '</div></div></div>') : '') +
    (matches.length || coach ? '<div class="mapgrid">' + cards.filter(c => c.n || c.pool.status).map(card).join('') + '</div>' +
      (cards.some(c => !c.n && !c.pool.status) ? '<details class="item" style="margin-top:14px"' + (matches.length ? '' : ' open') + '><summary><span class="t">Other maps (' + cards.filter(c => !c.n && !c.pool.status).length + ')</span> <span class="muted small">not played' + (since ? ' in this period' : ' yet') + '</span></summary><div class="body"><div class="mapgrid">' +
        cards.filter(c => !c.n && !c.pool.status).map(card).join('') + '</div></div></details>' : '') : empty('No matches logged yet. Results show up here after the coach logs scrim results (Schedule → Log result) or imports the Matches tab.'));
  async function savePool(map, patch) {
    const ex = poolOf(map);
    try { if (ex.id) await db.update('map_pool', ex.id, patch); else { await db.insert('map_pool', [Object.assign({ map: map }, patch)]); const again = await db.list('map_pool', { limit: 100 }); pool.splice(0, pool.length, ...again); } toast('Saved'); }
    catch (err) { toast('Error: ' + err.message); }
  }
  $$('.poolsel', el).forEach(s => s.onchange = async () => { await savePool(s.dataset.map, { status: s.value || null }); render(); });
  $$('.poolnote', el).forEach(i => i.onchange = () => savePool(i.dataset.map, { notes: i.value.trim() || null }));
  if ($('#logm')) $('#logm').onclick = () => editRow('matches', { date: todayISO(), type: 'Scrim', event: 'Scrim' }, () => { S.cache = {}; render(); });
};
function bestOnMap(rows) {
  const by = new Map(); rows.forEach(r => { const n = normName(r.player); if (!n) return; if (!by.has(n)) by.set(n, { name: String(r.player).replace(/\s*\*\s*trial\s*$/i, ''), k: 0, d: 0 }); const x = by.get(n); x.k += Number(r.kills) || 0; x.d += Number(r.deaths) || 0; });
  const list = Array.from(by.values()).filter(x => x.k + x.d > 0).map(x => Object.assign(x, { kd: x.d ? x.k / x.d : x.k })).sort((a, b) => b.kd - a.kd);
  return list[0] || null;
}

// ---- Game plans
const PLAN_SECTIONS = [['their_tendencies', 'Their tendencies'], ['comp', 'Our comp'], ['attack_plan', 'Attack plan'], ['defense_plan', 'Defense plan'], ['pistols', 'Pistol rounds'], ['anti_strat', 'Anti-strat'], ['notes', 'Notes']];
function newPlanFrom(s) {
  editRow('game_plans', { opponent: s.opponent, match_date: isoOf(new Date(s.starts_at)), maps: s.maps, scrim_id: s.id, published: true }, () => { S.cache = {}; render(); });
}
PAGES.plans = async function (el) {
  const id = Number(location.hash.split('/')[2]) || null;
  const coach = isStaff();
  const plans = await db.list('game_plans', { order: 'match_date', asc: false, limit: 500 });
  if (id) return planDetail(el, plans.find(p => p.id === id));
  const today = todayISO();
  const up = plans.filter(p => !p.match_date || String(p.match_date).slice(0, 10) >= today).reverse(), old = plans.filter(p => !up.includes(p));
  const card = p => '<a class="plancard" href="#/plans/' + p.id + '"><div class="row spread"><div class="t">vs ' + esc(p.opponent) + '</div>' + (!p.published ? '<span class="pill purple">Draft</span>' : '') + '</div>' +
    '<div class="row small" style="gap:6px;margin-top:6px">' + (p.match_date ? '<span class="muted">' + fmtDate(p.match_date) + ' · ' + relDays(p.match_date + 'T12:00:00') + '</span>' : '<span class="muted">No date</span>') +
    mapList(p.maps).map(m => '<span class="pill">' + esc(m) + '</span>').join('') + '</div>' +
    '<div class="small muted" style="margin-top:8px">' + PLAN_SECTIONS.filter(s => p[s[0]]).map(s => s[1]).join(' · ') + '</div></a>';
  el.innerHTML = '<div class="page-h"><div><h1>Game plans</h1><p class="muted">One page per opponent: how they play, our comp, our plan, and what to do if it goes wrong. Read it before the match.</p></div>' +
    (coach ? '<button class="btn small" id="newplan">New game plan</button>' : '') + '</div>' +
    '<h2>Coming up</h2>' + (up.length ? '<div class="plangrid">' + up.map(card).join('') + '</div>' : empty(coach ? 'No game plans yet. Make one from a booked scrim (Schedule) or with “New game plan”.' : 'No game plans for upcoming matches yet.')) +
    (old.length ? '<h2 style="margin-top:22px">Past</h2><div class="plangrid">' + old.map(card).join('') + '</div>' : '');
  if ($('#newplan')) $('#newplan').onclick = () => editRow('game_plans', { published: true }, () => { S.cache = {}; render(); });
};
async function planDetail(el, p) {
  if (!p) { el.innerHTML = empty('That game plan isn\'t here any more.', '<a class="btn small" href="#/plans">All game plans</a>'); return; }
  const coach = isStaff();
  const [scout, comps, matches, scrims] = await Promise.all([can('scouting') ? cached('opponent_scouting') : [], can('scouting') ? cached('comp_notes') : [], can('team_stats') ? cached('matches') : [], p.scrim_id ? listScrims() : []]);
  const sc = scout.filter(r => sameOpp(r.opponent, p.opponent)), cn = comps.filter(r => sameOpp(r.team, p.opponent));
  const vs = matches.filter(m => sameOpp(m.opponent, p.opponent));
  const scrim = scrims.find(s => s.id === p.scrim_id);
  const maps = mapList(p.maps);
  const intel = [];
  if (vs.length) { const st = mapStats(vs); intel.push(panel('Our record vs them', '', '<div class="mini-kpis">' + kpi(st.w + '–' + st.l, 'Maps') + kpi(pct(st.rp), 'Rounds') + '</div>' +
    vs.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 6).map(m => '<div class="small row" style="gap:8px"><span class="fdot ' + (isWin(m) ? 'w' : 'l') + '"></span><b>' + esc(m.map) + '</b> ' + m.rounds_won + '–' + m.rounds_lost + '<span class="muted">' + (m.date ? fmtDate(m.date) : '') + '</span></div>').join(''))); }
  if (maps.length && can('team_stats')) intel.push(panel('Our form on these maps', '<a class="small" href="#/maps">Map pool →</a>', maps.map(m => { const st = mapStats(matches.filter(x => String(x.map).toLowerCase() === m.toLowerCase()));
    return '<div class="row small" style="gap:8px;margin:4px 0"><b style="min-width:80px">' + esc(m) + '</b>' + (st.n ? '<span>' + pct(st.wp) + ' win</span><span class="muted">' + st.w + '–' + st.l + ' · atk ' + pct(st.ap) + ' · def ' + pct(st.dp) + '</span>' : '<span class="muted">not played yet</span>') + '</div>'; }).join('')));
  if (sc.length) intel.push(panel('Scouting notes', '<a class="small" href="#/scouting">All →</a>', sc.map(r => '<div class="scout"><div class="row small" style="gap:6px">' + (r.map ? '<span class="pill">' + esc(r.map) + '</span>' : '') + (r.date ? '<span class="muted">' + fmtDate(r.date) + '</span>' : '') + '</div>' +
    [['veto', 'Veto'], ['fav_attack_site', 'Favourite attack site'], ['defense_setup', 'Defense setup'], ['pistol_plan', 'Pistol plan'], ['after_losing', 'After losing a round'], ['star_player', 'Star player'], ['weakness', 'Weakness to attack']]
      .filter(k => r[k[0]]).map(k => '<div class="small"><span class="muted">' + k[1] + ':</span> ' + inlineMd(r[k[0]]) + '</div>').join('') + '</div>').join('')));
  if (cn.length) intel.push(panel('Comps they ran', '', cn.map(r => '<div class="small" style="margin:4px 0"><b>' + [r.a1, r.a2, r.a3, r.a4, r.a5].filter(Boolean).map(esc).join(', ') + '</b>' + (r.map ? ' <span class="pill">' + esc(r.map) + '</span>' : '') + (r.weaknesses ? '<div class="muted">' + inlineMd(r.weaknesses) + '</div>' : '') + '</div>').join('')));
  const secs = PLAN_SECTIONS.filter(s => p[s[0]]);
  el.innerHTML = '<div class="page-h"><div><a href="#/plans" class="small">← All game plans</a><h1 style="margin-top:6px">Game plan vs ' + esc(p.opponent) + '</h1>' +
    '<div class="row small" style="gap:6px">' + (p.match_date ? '<span class="muted">' + fmtDate(p.match_date) + ' · ' + relDays(p.match_date + 'T12:00:00') + '</span>' : '') + (scrim ? '<span class="muted">' + esc(fmtWhen(scrim.starts_at)) + '</span>' : '') +
    maps.map(m => '<span class="pill">' + esc(m) + '</span>').join('') + (!p.published ? '<span class="pill purple">Draft — players can\'t see this yet</span>' : '') + '</div></div>' +
    (coach ? '<div class="row"><button class="btn small ghost" id="pub">' + (p.published ? 'Hide from players' : 'Publish to players') + '</button><button class="btn small" id="pedit">Edit</button><button class="btn small danger" id="pdel">Delete</button></div>' : '') + '</div>' +
    '<div class="plan-grid"><div class="col">' + (secs.length ? secs.map(s => panel(s[1], '', '<div class="md">' + md(p[s[0]]) + '</div>')).join('') : empty('This plan is empty so far.' + (coach ? ' Click Edit to fill it in.' : ''))) + '</div>' +
    '<div class="col">' + (intel.length ? intel.join('') : panel('Intel', '', '<p class="muted small">No scouting notes or past games vs ' + esc(p.opponent) + ' yet. Scouting notes with the same opponent name show up here automatically.</p>')) + '</div></div>';
  if (coach) {
    $('#pedit').onclick = () => editRow('game_plans', p, () => { S.cache = {}; render(); });
    $('#pub').onclick = async () => { await db.update('game_plans', p.id, { published: !p.published }); toast(p.published ? 'Hidden from players' : 'Published'); render(); };
    $('#pdel').onclick = async () => { if (!confirm('Delete this game plan?')) return; await db.remove('game_plans', p.id); location.hash = '#/plans'; };
  }
}

// ---- Work on: is the mistake coming back?
function workTrack(w) {
  const seen = Array.isArray(w.seen) ? w.seen : [];
  const dates = [w.date].concat(seen.map(s => s.date)).filter(Boolean).map(d => String(d).slice(0, 10)).sort();
  const last = dates[dates.length - 1] || null;
  const fixedAt = w.fixed_at ? String(w.fixed_at).slice(0, 10) : null;
  return { times: Math.max(1, dates.length), dates: dates, last: last, fixedAt: fixedAt, cameBack: !!w.came_back, cleanSince: w.status === 'Fixed' && fixedAt && !(last > fixedAt) };
}
function workProgressHtml(w) {
  const t = workTrack(w);
  const bits = [];
  if (t.cameBack) bits.push('<span class="pill red">Came back</span>');
  if (t.times > 1) bits.push('<span class="pill ' + (t.times >= 3 ? 'red' : 'yellow') + '">Seen ' + t.times + '×</span>');
  const dots = t.dates.length > 1 ? '<span class="tdots">' + t.dates.map(d => '<span class="fdot l" title="' + esc(fmtDate(d)) + '"></span>').join('') + (t.cleanSince ? '<span class="fdot w" title="Fixed"></span>' : '') + '</span>' : '';
  const txt = t.cleanSince ? 'Fixed ' + fmtDate(t.fixedAt) + ' · not seen since ✓' : t.times > 1 && t.last ? 'Last seen ' + relDays(t.last + 'T12:00:00') : '';
  if (!bits.length && !txt) return '';
  return '<div class="wprog row small">' + bits.join('') + dots + (txt ? '<span class="muted">' + txt + '</span>' : '') + '</div>';
}
function seenAgain(w, refresh) {
  openModal('<h2>Seen again</h2><p class="small muted">Log that this mistake showed up again. ' + (w.status === 'Fixed' ? 'It\'s marked fixed, so it will reopen and be flagged “Came back”.' : 'The player sees how often it keeps happening.') + '</p>' +
    '<div class="quote small" style="margin-bottom:12px">' + inlineMd(w.issue || '') + '</div><form id="sa"><label class="f"><span>Date</span><input type="date" name="date" value="' + todayISO() + '" required></label>' +
    '<label class="f"><span>Where (VOD / scrim)</span><input name="source" placeholder="e.g. Scrim vs Night Owls, Lotus"></label><div class="row"><button class="btn">Save</button><button type="button" class="btn ghost" data-close>Cancel</button></div></form>', m => {
    $('#sa', m).onsubmit = async e => {
      e.preventDefault();
      const seen = (Array.isArray(w.seen) ? w.seen : []).concat([{ date: e.target.date.value, source: e.target.source.value.trim() || null }]);
      const patch = { seen: seen };
      if (w.status === 'Fixed') { patch.status = 'Open'; patch.came_back = true; }
      try { await db.update('work_on', w.id, patch); closeModal(); S.cache = {}; toast(patch.came_back ? 'Reopened — flagged as came back' : 'Logged'); refresh(); } catch (err) { toast('Error: ' + err.message); }
    };
  });
}
function workSummary(items, coach) {
  const month = addDays(todayISO(), -30);
  const fixedRecent = items.filter(w => w.status === 'Fixed' && w.fixed_at && String(w.fixed_at).slice(0, 10) >= month).length;
  const back = items.filter(w => w.came_back && w.status !== 'Fixed').length;
  const repeat = items.filter(w => w.status !== 'Fixed' && workTrack(w).times >= 3).length;
  let html = '<div class="kpis">' + kpi(items.filter(w => w.status !== 'Fixed' && w.status !== 'Working on it').length, 'Open') + kpi(items.filter(w => w.status === 'Working on it').length, 'Working on it') +
    kpi(fixedRecent, 'Fixed (30 days)') + kpi(back, 'Came back') + kpi(repeat, 'Seen 3+ times') + '</div>';
  if (coach) {
    const by = groupBy(items.filter(w => !isTeamWide(w)), 'player');
    if (by.length) html += panel('Progress by player', '', '<div class="tablewrap"><table><thead><tr><th>Player</th><th class="num">Open</th><th class="num">Working</th><th class="num">Fixed (30d)</th><th class="num">Came back</th><th>Keeps happening</th></tr></thead><tbody>' +
      by.map(([p, list]) => { const rep = list.filter(w => w.status !== 'Fixed').map(w => [w, workTrack(w).times]).sort((a, b) => b[1] - a[1])[0];
        return '<tr><td><a href="#/workon/' + encodeURIComponent(p) + '"><b>' + esc(p) + '</b></a></td><td class="num">' + list.filter(w => w.status !== 'Fixed' && w.status !== 'Working on it').length + '</td><td class="num">' + list.filter(w => w.status === 'Working on it').length +
          '</td><td class="num">' + list.filter(w => w.status === 'Fixed' && w.fixed_at && String(w.fixed_at).slice(0, 10) >= month).length + '</td><td class="num">' + list.filter(w => w.came_back && w.status !== 'Fixed').length + '</td><td class="small">' +
          (rep && rep[1] > 1 ? esc(String(rep[0].issue || '').slice(0, 70)) + ' <span class="pill ' + (rep[1] >= 3 ? 'red' : 'yellow') + '">' + rep[1] + '×</span>' : '<span class="muted">—</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>');
  }
  return html;
}


// ---- Other teams (coaches & staff): read-only results, stats, VODs and comps. Map picks, plans, playbook stay private.
PAGES.explore = async function (el) {
  if (!isStaff()) { el.innerHTML = '<p>Coaches only.</p>'; return; }
  const parts = location.hash.split('/'); const tid = Number(parts[2]) || null; const tab = parts[3] || 'results';
  const { data: teams, error } = await sb.rpc('team_directory');
  if (error) { el.innerHTML = '<div class="card error">' + esc(error.message) + '</div>'; return; }
  const others = (teams || []).filter(t => t.id !== S.me.team_id);
  const note = '<p class="small muted">Read only. Each team\'s map pool &amp; picks, game plans, playbook, scouting, work-on list, check-ins and schedule stay private.</p>';
  if (!tid) {
    el.innerHTML = '<div class="page-h"><div><h1>Other teams</h1><p class="muted">Results, player stats, VOD reviews and comps from other teams using Team Hub.</p></div></div>' + note +
      (others.length ? '<div class="plangrid">' + others.map(t => '<a class="plancard" href="#/explore/' + t.id + '"><div class="row spread"><div class="t">' + esc(t.name) + '</div>' + (t.tag ? '<span class="pill">' + esc(t.tag) + '</span>' : '') + '</div>' +
        '<div class="small muted" style="margin-top:6px">' + t.players + ' player' + (t.players == 1 ? '' : 's') + ' · ' + t.maps_played + ' maps logged' + (t.last_match ? ' · last ' + fmtDate(t.last_match) : '') + '</div></a>').join('') + '</div>'
        : empty('No other teams yet.'));
    return;
  }
  const t = (teams || []).find(x => x.id === tid);
  if (!t) { el.innerHTML = empty('That team isn\'t here.', '<a class="btn small" href="#/explore">All teams</a>'); return; }
  const eq = { eq: { team_id: tid } };
  const [rosterRes, matches, ps, uu, reviews, comps] = await Promise.all([sb.rpc('team_public_roster', { tid: tid }), db.list('matches', eq), db.list('player_stats', eq), db.list('utility_usage', eq), db.list('reviews', eq), db.list('comp_notes', eq)]);
  const roster = rosterRes.data || [];
  const tabs = [['results', 'Results'], ['players', 'Players'], ['vods', 'VOD reviews'], ['comps', 'Comps']];
  let body = '';
  if (tab === 'players') {
    const names = new Map();
    roster.forEach(r => names.set(normName(r.ign || r.name), r.ign || r.name));
    ps.forEach(r => { const n = normName(r.player); if (n && !names.has(n)) names.set(n, String(r.player).replace(/\s*\*\s*trial\s*$/i, '')); });
    const rows = Array.from(names.entries()).map(([n, name]) => { const s = statsFor(ps, name); const r = roster.find(x => normName(x.ign || x.name) === n); const u = uu.filter(x => normName(x.player) === n);
      return { name: name, r: r, s: s, upr: avg(u, 'util_per_round') }; }).sort((a, b) => (b.s ? b.s.kd : -1) - (a.s ? a.s.kd : -1));
    body = rows.length ? '<div class="tablewrap"><table><thead><tr><th>Player</th><th>Role</th><th class="num">Maps</th><th class="num">K/D</th><th class="num">HS kill %</th><th class="num">First K / D</th><th class="num">Util / round</th></tr></thead><tbody>' +
      rows.map(x => '<tr><td><b>' + esc(x.name) + '</b>' + (x.r && x.r.is_igl ? ' <span class="pill yellow">IGL</span>' : '') + (x.r && x.r.status === 'Bench' ? ' <span class="pill">Bench</span>' : '') + '</td><td>' + rolePill(x.r && x.r.role) + '</td>' +
        (x.s ? '<td class="num">' + x.s.maps + '</td><td class="num"><b>' + num(x.s.kd, 2) + '</b></td><td class="num">' + pct(x.s.hs) + '</td><td class="num">' + x.s.fk + ' / ' + x.s.fd + '</td>' : '<td class="num">–</td><td class="num">–</td><td class="num">–</td><td class="num">–</td>') +
        '<td class="num">' + num(x.upr, 1) + '</td></tr>').join('') + '</tbody></table></div>' : empty('No players or stats yet.');
  } else if (tab === 'vods') {
    body = reviews.length ? '<div class="vgrid">' + reviews.map(r => { const vi = videoInfo(r.vod);
      return '<div class="vcard">' + thumbHtml(vi) + '<div class="vb"><div class="t">' + esc(r.title || 'VOD review') + '</div><div class="row small" style="gap:6px;margin-top:6px">' + (r.date ? '<span class="muted">' + fmtDate(r.date) + '</span>' : '') + (r.map ? '<span class="pill">' + esc(r.map) + '</span>' : '') + (r.type ? '<span class="pill">' + esc(r.type) + '</span>' : '') + '</div>' +
        (vi ? '<a class="small" href="' + esc(vi.url) + '" target="_blank" rel="noopener">▶ Watch</a>' : '') +
        (r.summary || r.body ? '<details style="margin-top:6px"><summary class="small">Notes</summary><div class="md small">' + md(r.summary || '') + md(r.body || '') + '</div></details>' : '') + '</div></div>'; }).join('') + '</div>' : empty('No VOD reviews yet.');
  } else if (tab === 'comps') {
    body = comps.length ? comps.map(r => '<div class="card" style="margin-bottom:10px"><div class="row" style="gap:6px"><b>' + esc(r.team || '') + '</b>' + (r.map ? '<span class="pill">' + esc(r.map) + '</span>' : '') + (r.date ? '<span class="muted small">' + fmtDate(r.date) + '</span>' : '') + '</div>' +
      '<div style="margin-top:4px">' + [r.a1, r.a2, r.a3, r.a4, r.a5].filter(Boolean).map(esc).join(', ') + '</div>' + (r.result ? '<div class="small muted">' + esc(r.result) + '</div>' : '') + (r.weaknesses ? '<div class="small" style="margin-top:4px">' + inlineMd(r.weaknesses) + '</div>' : '') + '</div>').join('') : empty('No comp notes yet.');
  } else {
    const all = mapStats(matches);
    const maps = groupBy(matches.filter(m => m.map), 'map').map(([m, list]) => Object.assign({ map: m }, mapStats(list))).sort((a, b) => b.n - a.n);
    body = matches.length ? '<div class="kpis">' + kpi(all.w + '–' + all.l, 'Map record') + kpi(pct(all.wp), 'Map win %') + kpi(pct(all.rp), 'Round win %') + kpi(matches.length, 'Maps logged') + '</div>' +
      panel('By map', '', '<div class="tablewrap"><table><thead><tr><th>Map</th><th class="num">Played</th><th class="num">W–L</th><th class="num">Win %</th><th class="num">Rounds</th></tr></thead><tbody>' +
        maps.map(x => '<tr><td><b>' + esc(x.map) + '</b></td><td class="num">' + x.n + '</td><td class="num">' + x.w + '–' + x.l + '</td><td class="num">' + pct(x.wp) + '</td><td class="num">' + x.rw + '–' + x.rl + '</td></tr>').join('') + '</tbody></table></div>') +
      panel('Recent matches', '', '<div class="tablewrap"><table><thead><tr><th>Date</th><th>Event</th><th>Opponent</th><th>Map</th><th class="num">Score</th></tr></thead><tbody>' +
        matches.slice(0, 30).map(m => '<tr><td>' + (m.date ? fmtDate(m.date) : '') + '</td><td>' + esc(m.event || matchType(m)) + '</td><td>' + esc(m.opponent || '') + '</td><td>' + esc(m.map || '') + '</td><td class="num"><span class="fdot ' + (isWin(m) ? 'w' : 'l') + '"></span> ' + (m.rounds_won ?? '') + '–' + (m.rounds_lost ?? '') + '</td></tr>').join('') + '</tbody></table></div>')
      : empty('No matches logged yet.');
  }
  el.innerHTML = '<div class="page-h"><div><a href="#/explore" class="small">← Other teams</a><h1 style="margin-top:6px">' + esc(t.name) + (t.tag ? ' <span class="pill">' + esc(t.tag) + '</span>' : '') + '</h1>' +
    '<p class="muted">' + roster.filter(r => r.status !== 'Bench').map(r => esc(r.name) + (r.role ? ' <span class="small">(' + esc(r.role) + ')</span>' : '')).join(' · ') + '</p></div></div>' + note +
    '<div class="tabs">' + tabs.map(x => '<a href="#/explore/' + tid + '/' + x[0] + '" class="' + (x[0] === tab ? 'active' : '') + '">' + x[1] + '</a>').join('') + '</div>' + body;
};


// =====================================================================
//  Live match mode, veto simulator, lineups, aim tracker, training paths,
//  comms recordings, 1-on-1 notes, public team page, ranks
// =====================================================================
const RANKS = ['Iron 1', 'Iron 2', 'Iron 3', 'Bronze 1', 'Bronze 2', 'Bronze 3', 'Silver 1', 'Silver 2', 'Silver 3', 'Gold 1', 'Gold 2', 'Gold 3',
  'Platinum 1', 'Platinum 2', 'Platinum 3', 'Diamond 1', 'Diamond 2', 'Diamond 3', 'Ascendant 1', 'Ascendant 2', 'Ascendant 3', 'Immortal 1', 'Immortal 2', 'Immortal 3', 'Radiant'];
const RANK_CLR = { Iron: '#6f7378', Bronze: '#a5733f', Silver: '#b8c0c4', Gold: '#e7b64b', Platinum: '#3fb6c8', Diamond: '#c08af2', Ascendant: '#3ec28f', Immortal: '#e2526b', Radiant: '#f5e9a8' };
function rankPill(r, small) {
  if (!r) return '';
  const c = RANK_CLR[String(r).split(' ')[0]] || '#8796a5';
  return '<span class="rankpill' + (small ? ' sm' : '') + '" style="--rk:' + c + '">' + esc(r) + '</span>';
}
function rankIdx(r) { return RANKS.indexOf(r); }
function trackerUrl(riot) { return riot && riot.includes('#') ? 'https://tracker.gg/valorant/profile/riot/' + encodeURIComponent(riot.replace('#', '#')) + '/overview' : null; }
function localStore(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
const AGENTS = ['Astra', 'Breach', 'Brimstone', 'Chamber', 'Clove', 'Cypher', 'Deadlock', 'Fade', 'Gekko', 'Harbor', 'Iso', 'Jett', 'KAY/O', 'Killjoy', 'Neon', 'Omen', 'Phoenix', 'Raze', 'Reyna', 'Sage', 'Skye', 'Sova', 'Tejo', 'Viper', 'Vyse', 'Waylay', 'Yoru'];

// ---------------------------------------------------------------- Ranks
async function rankForm(box, after) {
  const me = S.me;
  box.innerHTML = '<form id="rk" class="stack"><label class="f"><span>Riot ID</span><input name="riot" placeholder="Name#TAG" value="' + esc(me.riot_id || '') + '"></label>' +
    '<div class="row"><label class="f grow"><span>Current rank</span><select name="rank"><option value="">—</option>' + RANKS.map(r => '<option' + (r === me.rank ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></label>' +
    '<label class="f"><span>RR</span><input name="rr" inputmode="numeric" style="width:80px" value="' + esc(me.rank_rr == null ? '' : me.rank_rr) + '"></label></div>' +
    '<label class="f"><span>Peak rank</span><select name="peak"><option value="">—</option>' + RANKS.map(r => '<option' + (r === me.peak_rank ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></label>' +
    '<div class="row"><button class="btn small">Save rank</button>' + (trackerUrl(me.riot_id) ? '<a class="small" href="' + esc(trackerUrl(me.riot_id)) + '" target="_blank" rel="noopener">Check on tracker.gg →</a>' : '') + '</div>' +
    '<p class="small muted" style="margin:0">Update it whenever your rank changes. Your history shows on the Team page.</p></form>';
  $('#rk', box).onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    const rr = f.rr.value === '' ? null : parseInt(f.rr.value, 10);
    const { error } = await sb.rpc('set_my_rank', { p_riot_id: f.riot.value.trim(), p_rank: f.rank.value, p_rr: isNaN(rr) ? null : rr, p_peak: f.peak.value });
    if (error) { toast(error.message); return; }
    toast('Rank saved'); await loadMe(); S.cache = {}; if (after) after();
  };
}
async function ranksTab() {
  const [team, hist] = await Promise.all([teamPlayers(), db.list('rank_history', { order: 'date', asc: true, limit: 2000 })]);
  const rows = team.players.filter(p => p.user_id).map(p => ({ p: p, h: hist.filter(h => h.user_id === p.user_id) })).sort((a, b) => rankIdx(b.p.rank) - rankIdx(a.p.rank));
  const spark = h => { if (h.length < 2) return ''; const w = 120, hgt = 28, xs = h.map((x, i) => i / (h.length - 1) * w), ys = h.map(x => hgt - (Math.max(0, rankIdx(x.rank)) + (x.rr || 0) / 100) / RANKS.length * hgt);
    return '<svg width="' + w + '" height="' + hgt + '" class="spark"><polyline fill="none" stroke="var(--accent-2)" stroke-width="2" points="' + xs.map((x, i) => x.toFixed(1) + ',' + ys[i].toFixed(1)).join(' ') + '"/></svg>'; };
  return (S.me.rank || S.me.riot_id ? '' : '<div class="card alert" style="margin-bottom:12px"><b>Add your rank</b><span class="small muted">Account → Rank, so it shows here and on your player card.</span></div>') +
    (rows.length ? '<div class="tablewrap"><table><thead><tr><th>Player</th><th>Current</th><th>Peak</th><th>Riot ID</th><th>Trend</th><th>Updated</th></tr></thead><tbody>' +
      rows.map(x => '<tr><td><div class="row" style="gap:8px;flex-wrap:nowrap">' + avatar(x.p, 26) + '<b>' + esc(x.p.name) + '</b> ' + rolePill(x.p.role) + '</div></td><td>' + (x.p.rank ? rankPill(x.p.rank) + (x.p.rank_rr != null ? ' <span class="small muted">' + x.p.rank_rr + ' RR</span>' : '') : '<span class="muted small">not set</span>') + '</td>' +
        '<td>' + rankPill(x.p.peak_rank, true) + '</td><td class="small">' + (x.p.riot_id ? (trackerUrl(x.p.riot_id) ? '<a href="' + esc(trackerUrl(x.p.riot_id)) + '" target="_blank" rel="noopener">' + esc(x.p.riot_id) + '</a>' : esc(x.p.riot_id)) : '<span class="muted">—</span>') + '</td>' +
        '<td>' + spark(x.h) + '</td><td class="small muted">' + (x.p.rank_updated ? fmtDate(x.p.rank_updated) : '—') + '</td></tr>').join('') + '</tbody></table></div>' : empty('No players have joined the app yet.')) +
    '<p class="small muted">Players set their own Riot ID and rank in Account. Riot doesn\'t let apps read ranks automatically without an approved API key, so the tracker.gg link is there to double-check.</p>';
}

// ---------------------------------------------------------------- Live match mode
const DEFAULT_CARDS = [
  { category: 'Mid-round', title: 'Slow it down', body: 'Default, take info, don\'t give free picks. Hit with 40 seconds left on the site with fewer players.' },
  { category: 'Mid-round', title: 'They\'re stacking a site', body: 'Fake the stacked site with util, then hit the other site fast. Lurk one player to punish rotations.' },
  { category: 'Mid-round', title: 'We\'re losing opening duels', body: 'Stop dry peeking. Swing off util in pairs, trade within 2 seconds. Play for picks with the team close.' },
  { category: 'Economy', title: 'Save properly', body: 'Full save: nobody buys, nobody forces alone. Play for info and exit frags. Next round full buy together.' },
  { category: 'Economy', title: 'Force together', body: 'All five force (Spectre / Bulldog / Sheriff + util). Stack one site and play close angles.' },
  { category: 'Mental', title: 'Reset', body: 'Forget the last rounds. One round at a time. Calm voices, short calls. Next plan only.' },
  { category: 'Mental', title: 'Close it out', body: 'Don\'t play scared. Same plan that got us here, same discipline. Trade, play together, no hero plays.' },
  { category: 'Anti-strat', title: 'They rush every round', body: 'Hold off-angles back, delay with util on their entry, stack 3 on their favorite site, crossfire after the first contact.' }
];
PAGES.live = async function (el) {
  const parts = location.hash.split('/'); let pid = Number(parts[2]) || null; let mapSel = decodeURIComponent(parts[3] || '');
  const [plans, cards, matches, nxt] = await Promise.all([can('scouting') ? db.list('game_plans', { order: 'match_date', asc: false, limit: 100 }) : [], db.list('timeout_cards', { order: 'sort', asc: true, limit: 200 }), can('team_stats') ? cached('matches') : [], nextScrim().catch(() => null)]);
  if (!pid) { const p = (nxt && plans.find(x => x.scrim_id === nxt.id)) || plans.find(x => !x.match_date || String(x.match_date).slice(0, 10) >= todayISO()) || plans[0]; pid = p ? p.id : null; }
  const plan = plans.find(p => p.id === pid);
  const maps = plan ? mapList(plan.maps) : (nxt ? mapList(nxt.maps) : []);
  if (!mapSel && maps.length) mapSel = maps[0];
  const key = 'th_live_' + (pid || 0) + '_' + mapSel;
  const score = localStore(key) || { us: 0, them: 0, to: 2 };
  const st = mapSel ? mapStats(matches.filter(m => String(m.map).toLowerCase() === mapSel.toLowerCase())) : null;
  const sec = (title, txt) => txt ? '<section class="livesec"><h3>' + title + '</h3><div class="md">' + md(txt) + '</div></section>' : '';
  const allCards = cards.concat(DEFAULT_CARDS.filter(d => !cards.some(c => c.title === d.title)));
  el.innerHTML = '<div class="live">' +
    '<div class="row spread"><div><div class="eyebrow">Live match</div><h1 style="margin:0">' + (plan ? 'vs ' + esc(plan.opponent) : nxt ? 'vs ' + esc(nxt.opponent || 'TBD') : 'Match day') + '</h1></div>' +
    (plans.length ? '<select id="lplan" style="max-width:220px">' + plans.map(p => '<option value="' + p.id + '"' + (p.id === pid ? ' selected' : '') + '>vs ' + esc(p.opponent) + (p.match_date ? ' · ' + fmtDate(p.match_date) : '') + '</option>').join('') + '</select>' : '') + '</div>' +
    (maps.length ? '<div class="tabs" style="margin-top:10px">' + maps.map(m => '<a href="#/live/' + (pid || 0) + '/' + encodeURIComponent(m) + '" class="' + (m === mapSel ? 'active' : '') + '">' + esc(m) + '</a>').join('') + '</div>' : '') +
    '<div class="score"><div class="sc"><span>US</span><b id="sus">' + score.us + '</b><div><button class="btn small" data-sc="us,1">+1</button><button class="btn small ghost" data-sc="us,-1">−</button></div></div>' +
      '<div class="mid"><div class="small muted">Round ' + (score.us + score.them + 1) + ' · ' + ((score.us + score.them) < 12 ? 'first half' : 'second half') + '</div>' +
      '<div class="small">Timeouts left: <b>' + score.to + '</b> <button class="linkbtn" data-sc="to,-1">use one</button></div><button class="linkbtn small" data-sc="reset">Reset score</button></div>' +
      '<div class="sc"><span>THEM</span><b>' + score.them + '</b><div><button class="btn small" data-sc="them,1">+1</button><button class="btn small ghost" data-sc="them,-1">−</button></div></div></div>' +
    (st && st.n ? '<div class="livestats small"><b>' + esc(mapSel) + '</b> for us: ' + pct(st.wp) + ' win (' + st.w + '–' + st.l + ') · attack ' + pct(st.ap) + ' · defense ' + pct(st.dp) + ' · pistols ' + (st.pn ? st.pw + '/' + st.pn : '–') + '</div>' : '') +
    (plan ? sec('Our comp', plan.comp) + sec('Pistol rounds', plan.pistols) + sec('Attack', plan.attack_plan) + sec('Defense', plan.defense_plan) + sec('Their tendencies', plan.their_tendencies) + sec('Anti-strat', plan.anti_strat)
      : '<div class="card" style="margin-top:12px"><p class="muted" style="margin:0">No game plan for this match yet.' + (isStaff() ? ' <a href="#/plans">Make one in Game plans</a> and it shows here.' : '') + '</p></div>') +
    '<div class="row spread" style="margin-top:18px"><h2 style="margin:0">Timeout cards</h2>' + (isStaff() ? '<button class="btn small ghost" id="addcard">Add a card</button>' : '') + '</div>' +
    '<div class="tcards">' + allCards.map((c, i) => '<button class="tcard" data-card="' + i + '"><span class="pill">' + esc(c.category || 'Call') + '</span><b>' + esc(c.title) + '</b></button>').join('') + '</div></div>';
  const saveScore = () => { localStore(key, score); render(); };
  $$('[data-sc]', el).forEach(b => b.onclick = () => { const [k, d] = b.dataset.sc.split(','); if (k === 'reset') { score.us = 0; score.them = 0; score.to = 2; } else score[k] = Math.max(0, score[k] + Number(d)); saveScore(); });
  if ($('#lplan')) $('#lplan').onchange = e => { location.hash = '#/live/' + e.target.value; };
  $$('[data-card]', el).forEach(b => b.onclick = () => { const c = allCards[Number(b.dataset.card)];
    openModal('<div class="bigcard"><span class="pill">' + esc(c.category || 'Call') + '</span><h1>' + esc(c.title) + '</h1><div class="md">' + md(c.body || '') + '</div></div><div class="row"><button class="btn" data-close>Close</button>' +
      (isStaff() && c.id ? '<button class="btn ghost" id="edcard">Edit</button><button class="btn danger" id="delcard">Delete</button>' : '') + '</div>', m => {
      if ($('#edcard', m)) $('#edcard', m).onclick = () => cardForm(c);
      if ($('#delcard', m)) $('#delcard', m).onclick = async () => { await db.remove('timeout_cards', c.id); closeModal(); render(); };
    }); });
  if ($('#addcard')) $('#addcard').onclick = () => cardForm({});
};
function cardForm(c) {
  openModal('<h2>' + (c.id ? 'Edit' : 'Add') + ' timeout card</h2><form id="cf"><label class="f"><span>Category</span><select name="category">' + ['Mid-round', 'Economy', 'Mental', 'Anti-strat'].map(x => '<option' + (x === c.category ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label>' +
    '<label class="f"><span>Title (what you tap)</span><input name="title" required value="' + esc(c.title || '') + '"></label><label class="f"><span>What to say</span><textarea name="body" rows="5">' + esc(c.body || '') + '</textarea></label>' +
    '<div class="row"><button class="btn">Save</button><button type="button" class="btn ghost" data-close>Cancel</button></div></form>', m => {
    $('#cf', m).onsubmit = async e => { e.preventDefault(); const rec = { category: e.target.category.value, title: e.target.title.value.trim(), body: e.target.body.value.trim() };
      try { if (c.id) await db.update('timeout_cards', c.id, rec); else await db.insert('timeout_cards', [rec]); closeModal(); toast('Saved'); render(); } catch (err) { toast('Error: ' + err.message); } };
  });
}

// ---------------------------------------------------------------- Veto simulator
PAGES.veto = async function (el) {
  const [matches, pool, scout, dir] = await Promise.all([cached('matches'), db.list('map_pool', { limit: 100 }), can('scouting') ? cached('opponent_scouting') : [], isStaff() ? sb.rpc('team_directory').then(r => r.data || []).catch(() => []) : Promise.resolve([])]);
  const st = localStore('th_veto') || { opp: '', tid: '', fmt: 'BO1', first: 'us', steps: [] };
  let active = (S.team && S.team.active_maps && S.team.active_maps.length) ? S.team.active_maps : Array.from(new Set(pool.filter(p => p.status !== null).map(p => p.map).concat(matches.map(m => m.map)))).filter(Boolean);
  if (active.length < 3) active = MAPS.slice(0, 7);
  let theirMatches = [];
  if (st.tid) theirMatches = await db.list('matches', { eq: { team_id: Number(st.tid) } });
  const vsThem = matches.filter(m => st.opp && sameOpp(m.opponent, st.opp));
  const theirBans = scout.filter(s => st.opp && sameOpp(s.opponent, st.opp)).map(s => String(s.veto || '')).join(' ').toLowerCase();
  const POOLB = { 'Main pick': .15, 'In pool': .05, Practising: -.05, Ban: -.3 };
  const rate = list => (list.filter(isWin).length + 1) / (list.length + 2);
  const score = m => {
    const ours = matches.filter(x => String(x.map).toLowerCase() === m.toLowerCase());
    const p = pool.find(x => x.map.toLowerCase() === m.toLowerCase());
    const theirs = theirMatches.filter(x => String(x.map).toLowerCase() === m.toLowerCase());
    const h2h = vsThem.filter(x => String(x.map).toLowerCase() === m.toLowerCase());
    let s = rate(ours) + (p ? POOLB[p.status] || 0 : 0) - (theirs.length ? rate(theirs) - .5 : 0) + (h2h.length ? (rate(h2h) - .5) * .5 : 0) + (theirBans.includes(m.toLowerCase()) ? .1 : 0);
    return { m: m, s: s, ours: ours, theirs: theirs, h2h: h2h, status: p && p.status };
  };
  const seq = st.fmt === 'BO3' ? ['ban', 'ban', 'pick', 'pick', 'ban', 'ban', 'decider'] : ['ban', 'ban', 'ban', 'ban', 'ban', 'ban', 'decider'];
  const who = i => seq[i] === 'decider' ? 'decider' : ((i % 2 === 0) === (st.first === 'us') ? 'us' : 'them');
  const used = new Set(st.steps.map(s => s.map));
  const remaining = active.filter(m => !used.has(m));
  const i = st.steps.length;
  const scored = remaining.map(score).sort((a, b) => b.s - a.s);
  let advice = '';
  if (i < seq.length && remaining.length) {
    const act = seq[i], w = who(i);
    if (act === 'decider' || remaining.length === 1) advice = 'Decider: <b>' + esc(remaining[0]) + '</b>';
    else if (w === 'us') { const pick = act === 'ban' ? scored[scored.length - 1] : scored[0]; advice = 'Our ' + act + ': <b>' + esc(pick.m) + '</b> <span class="muted">— ' + (act === 'ban' ? 'our weakest of what\'s left' : 'our strongest of what\'s left') + '</span>'; }
    else advice = 'Their ' + act + ' — click the map they ' + (act === 'ban' ? 'banned' : 'picked') + '. They\'ll likely ' + act + ' <b>' + esc((act === 'ban' ? scored[0] : scored[scored.length - 1]).m) + '</b>.';
  }
  const card = x => '<button class="vmap" data-vm="' + esc(x.m) + '"><b>' + esc(x.m) + '</b>' + (x.status ? ' <span class="pill ' + (POOL_PILL[x.status] || '') + '">' + esc(x.status) + '</span>' : '') +
    '<div class="small muted">Us ' + (x.ours.length ? x.ours.filter(isWin).length + '–' + (x.ours.length - x.ours.filter(isWin).length) : 'unplayed') + (st.tid ? ' · them ' + (x.theirs.length ? x.theirs.filter(isWin).length + '–' + (x.theirs.length - x.theirs.filter(isWin).length) : 'unplayed') : '') + (x.h2h.length ? ' · vs them ' + x.h2h.filter(isWin).length + '–' + (x.h2h.length - x.h2h.filter(isWin).length) : '') + '</div>' +
    '<div class="bar"><div style="width:' + Math.round(Math.max(0, Math.min(1, x.s)) * 100) + '%"></div></div></button>';
  el.innerHTML = '<div class="page-h"><div><h1>Veto simulator</h1><p class="muted">Picks and bans suggested from our results, map pool and what we know about the opponent.</p></div></div>' +
    '<div class="card stack" style="margin-bottom:14px"><div class="row"><label class="f grow"><span>Opponent</span><input id="vopp" list="voppl" value="' + esc(st.opp) + '" placeholder="Team name"><datalist id="voppl">' + dir.filter(t => t.id !== S.me.team_id).map(t => '<option value="' + esc(t.name) + '">').join('') + '</datalist></label>' +
      '<label class="f"><span>Format</span><select id="vfmt"><option' + (st.fmt === 'BO1' ? ' selected' : '') + '>BO1</option><option' + (st.fmt === 'BO3' ? ' selected' : '') + '>BO3</option></select></label>' +
      '<label class="f"><span>First ban</span><select id="vfirst"><option value="us"' + (st.first === 'us' ? ' selected' : '') + '>Us</option><option value="them"' + (st.first === 'them' ? ' selected' : '') + '>Them</option></select></label></div>' +
      '<div class="small muted">' + (st.tid ? 'Using their logged results from Team Hub. ' : st.opp ? 'They\'re not on Team Hub (or not matched), so only our results' + (vsThem.length ? ' and past games vs them' : '') + ' are used. ' : '') +
      'Map pool: ' + active.map(esc).join(', ') + (S.me.is_coach ? ' · <a href="#/coach/publicpage">change</a>' : '') + '</div></div>' +
    '<div class="vetosteps">' + seq.map((a, k) => { const s = st.steps[k]; return '<div class="vstep' + (k === i ? ' now' : '') + (s ? ' done ' + a : '') + '"><span>' + (a === 'decider' ? 'Decider' : (who(k) === 'us' ? 'Us' : 'Them') + ' ' + a) + '</span><b>' + (s ? esc(s.map) : k === seq.length - 1 && remaining.length === 1 && i === k ? esc(remaining[0]) : '—') + '</b></div>'; }).join('') + '</div>' +
    (advice ? '<div class="card alert" style="margin:12px 0"><span>' + advice + '</span></div>' : '<div class="card" style="margin:12px 0"><b>Veto done.</b> Maps: ' + st.steps.filter(s => s.act !== 'ban').map(s => esc(s.map)).join(', ') + '</div>') +
    '<div class="vmaps">' + scored.map(card).join('') + '</div>' +
    '<div class="row" style="margin-top:12px"><button class="btn small ghost" id="vundo"' + (i ? '' : ' disabled') + '>Undo</button><button class="btn small ghost" id="vreset">Start over</button>' +
      (isStaff() ? '<a class="btn small ghost" href="#/plans">Make a game plan</a>' : '') + '</div>';
  const save = () => { localStore('th_veto', st); render(); };
  $('#vopp').onchange = e => { st.opp = e.target.value.trim(); const t = dir.find(x => x.name.toLowerCase() === st.opp.toLowerCase() && x.id !== S.me.team_id); st.tid = t ? t.id : ''; save(); };
  $('#vfmt').onchange = e => { st.fmt = e.target.value; st.steps = []; save(); };
  $('#vfirst').onchange = e => { st.first = e.target.value; st.steps = []; save(); };
  $$('[data-vm]', el).forEach(b => b.onclick = () => { if (i >= seq.length) return; st.steps.push({ map: b.dataset.vm, act: seq[i], by: who(i) });
    const left = active.filter(m => !st.steps.some(s => s.map === m)); if (st.steps.length === seq.length - 1 && left.length === 1) st.steps.push({ map: left[0], act: 'decider', by: 'decider' }); save(); });
  $('#vundo').onclick = () => { const last = st.steps.pop(); if (last && last.act === 'decider') st.steps.pop(); save(); };
  $('#vreset').onclick = () => { st.steps = []; save(); };
};

// ---------------------------------------------------------------- Lineup library
PAGES.lineups = async function (el) {
  const [rows, learned, team] = await Promise.all([db.list('lineups', { order: 'created_at', asc: false, limit: 1000 }), sb.from('lineup_learned').select('*').eq('team_id', S.me.team_id).then(r => r.data || []), teamPlayers()]);
  const f = localStore('th_lu') || {};
  const mine = new Set(learned.filter(l => l.user_id === S.me.id).map(l => l.lineup_id));
  const players = team.players.filter(p => p.user_id);
  const opts = (k, list) => '<select data-lf="' + k + '"><option value="">All ' + k + 's</option>' + list.map(x => '<option' + (f[k] === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>';
  const agents = Array.from(new Set(rows.map(r => r.agent).filter(Boolean))).sort(), maps = Array.from(new Set(rows.map(r => r.map).filter(Boolean))).sort();
  const list = rows.filter(r => (!f.agent || r.agent === f.agent) && (!f.map || r.map === f.map) && (!f.show || (f.show === 'todo' ? !mine.has(r.id) : mine.has(r.id))));
  const card = r => { const vi = videoInfo(r.link); const who = learned.filter(l => l.lineup_id === r.id).map(l => players.find(p => p.user_id === l.user_id)).filter(Boolean);
    return '<div class="lcard' + (mine.has(r.id) ? ' got' : '') + '">' + (r.image ? '<img src="' + esc(r.image) + '" alt="" loading="lazy">' : vi ? thumbHtml(vi) : '') +
      '<div class="lb"><div class="row" style="gap:6px">' + (r.agent ? '<span class="pill purple">' + esc(r.agent) + '</span>' : '') + (r.map ? '<span class="pill">' + esc(r.map) + '</span>' : '') + sidePill(r.side) + (r.site ? '<span class="pill">' + esc(r.site) + '</span>' : '') + '</div>' +
      '<div class="t">' + esc(r.title) + (r.ability ? ' <span class="muted small">· ' + esc(r.ability) + '</span>' : '') + '</div>' + (r.purpose ? '<div class="small">' + inlineMd(r.purpose) + '</div>' : '') +
      (r.stand ? '<div class="small"><span class="muted">Stand:</span> ' + inlineMd(r.stand) + '</div>' : '') + (r.aim ? '<div class="small"><span class="muted">Aim / throw:</span> ' + inlineMd(r.aim) + '</div>' : '') +
      '<div class="row small" style="margin-top:8px;gap:8px">' + (vi ? '<a href="' + esc(vi.url) + '" target="_blank" rel="noopener">▶ Watch</a>' : r.link ? linkHtml(r.link, 'Open') : '') +
        '<button class="btn small ' + (mine.has(r.id) ? '' : 'ghost') + '" data-learn="' + r.id + '">' + (mine.has(r.id) ? '✓ I know it' : 'I learned this') + '</button>' +
        ((isStaff() || r.created_by === S.me.id) ? '<button class="linkbtn" data-led="' + r.id + '">Edit</button>' : '') + '</div>' +
      (who.length ? '<div class="small muted" style="margin-top:6px">Knows it: ' + who.map(p => esc(p.name)).join(', ') + '</div>' : '') + '</div></div>'; };
  el.innerHTML = '<div class="page-h"><div><h1>Lineup library</h1><p class="muted">Utility lineups for our agents and maps. Mark the ones you\'ve learned; the coach sees who knows what.</p></div><button class="btn small" id="addlu">Add a lineup</button></div>' +
    '<div class="row" style="margin-bottom:12px">' + opts('agent', agents) + opts('map', maps) + '<select data-lf="show"><option value="">All lineups</option><option value="todo"' + (f.show === 'todo' ? ' selected' : '') + '>Not learned yet</option><option value="done"' + (f.show === 'done' ? ' selected' : '') + '>Learned</option></select>' +
    '<span class="small muted">You know ' + mine.size + ' of ' + rows.length + '</span></div>' +
    (isStaff() && rows.length && players.length ? '<details class="item" style="margin-bottom:12px"><summary><span class="t">Who knows what</span></summary><div class="body"><div class="tablewrap"><table><thead><tr><th>Player</th><th class="num">Learned</th><th>Missing (first 4)</th></tr></thead><tbody>' +
      players.map(p => { const got = new Set(learned.filter(l => l.user_id === p.user_id).map(l => l.lineup_id)); const rel = rows.filter(r => !p.role || !r.agent || true);
        return '<tr><td><b>' + esc(p.name) + '</b> ' + rolePill(p.role) + '</td><td class="num">' + got.size + ' / ' + rel.length + '</td><td class="small">' + rel.filter(r => !got.has(r.id)).slice(0, 4).map(r => esc(r.title)).join(', ') + '</td></tr>'; }).join('') + '</tbody></table></div></div></details>' : '') +
    (list.length ? '<div class="lgrid">' + list.map(card).join('') + '</div>' : empty(rows.length ? 'Nothing matches that filter.' : 'No lineups yet. Add the first one: agent, map, where to stand, where to aim, and a clip or screenshot link.'));
  $$('[data-lf]', el).forEach(s => s.onchange = () => { f[s.dataset.lf] = s.value; localStore('th_lu', f); render(); });
  $$('[data-learn]', el).forEach(b => b.onclick = async () => { const id = Number(b.dataset.learn);
    const { error } = mine.has(id) ? await sb.from('lineup_learned').delete().eq('lineup_id', id).eq('user_id', S.me.id) : await sb.from('lineup_learned').insert([{ lineup_id: id, user_id: S.me.id }]);
    if (error) toast(error.message); render(); });
  $('#addlu').onclick = () => lineupForm({});
  $$('[data-led]', el).forEach(b => b.onclick = () => lineupForm(rows.find(r => r.id === Number(b.dataset.led))));
};
function lineupForm(r) {
  const sel = (n, list, v) => '<select name="' + n + '"><option value=""></option>' + list.map(x => '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>';
  openModal('<h2>' + (r.id ? 'Edit' : 'Add') + ' lineup</h2><form id="lf"><label class="f"><span>Name</span><input name="title" required value="' + esc(r.title || '') + '" placeholder="e.g. Viper A main molly for post-plant"></label>' +
    '<div class="row"><label class="f grow"><span>Agent</span>' + sel('agent', AGENTS, r.agent) + '</label><label class="f grow"><span>Ability</span><input name="ability" value="' + esc(r.ability || '') + '" placeholder="Snake Bite"></label></div>' +
    '<div class="row"><label class="f grow"><span>Map</span>' + sel('map', MAPS, r.map) + '</label><label class="f"><span>Side</span>' + sel('side', ['Attack', 'Defense'], r.side) + '</label><label class="f"><span>Site</span><input name="site" style="width:90px" value="' + esc(r.site || '') + '" placeholder="A"></label></div>' +
    '<label class="f"><span>What it\'s for</span><input name="purpose" value="' + esc(r.purpose || '') + '" placeholder="Stops the defuse on default plant"></label>' +
    '<label class="f"><span>Where to stand</span><input name="stand" value="' + esc(r.stand || '') + '"></label><label class="f"><span>Where to aim / how to throw</span><input name="aim" value="' + esc(r.aim || '') + '" placeholder="Top of the pillar, jump throw"></label>' +
    '<label class="f"><span>Clip link (YouTube, Medal, Twitch…)</span><input name="link" value="' + esc(r.link || '') + '"></label><label class="f"><span>Screenshot link (optional)</span><input name="image" value="' + esc(r.image || '') + '" placeholder="https://i.imgur.com/…"></label>' +
    '<div class="row"><button class="btn">Save</button><button type="button" class="btn ghost" data-close>Cancel</button>' + (r.id ? '<span class="grow"></span><button type="button" class="btn small danger" id="ldel">Delete</button>' : '') + '</div></form>', m => {
    $('#lf', m).onsubmit = async e => { e.preventDefault(); const f = e.target; const rec = {}; ['title', 'agent', 'ability', 'map', 'side', 'site', 'purpose', 'stand', 'aim', 'link', 'image'].forEach(k => rec[k] = f[k].value.trim() || null);
      try { if (r.id) await db.update('lineups', r.id, rec); else await db.insert('lineups', [Object.assign({ created_by: S.me.id }, rec)]); closeModal(); toast('Saved'); render(); } catch (err) { toast('Error: ' + err.message); } };
    if ($('#ldel', m)) $('#ldel', m).onclick = async () => { if (!confirm('Delete this lineup?')) return; await db.remove('lineups', r.id); closeModal(); render(); };
  });
}

// ---------------------------------------------------------------- Aim tracker
const AIM_KINDS = ['Aim Lab', 'Kovaak\'s', 'Deathmatch', 'Team Deathmatch', 'Range'];
PAGES.aim = async function (el) {
  const who = location.hash.split('/')[2] || (isStaff() && !S.me.ign ? 'team' : 'me');
  const [logs, team] = await Promise.all([db.list('aim_logs', { order: 'date', asc: true, limit: 5000 }), teamPlayers()]);
  const players = team.players.filter(p => p.user_id);
  const nameOfId = id => { const p = players.find(x => x.user_id === id); return p ? p.name : (id === S.me.id ? nameOf(S.me) : 'Player'); };
  const tab = (k, l) => '<a href="#/aim/' + k + '" class="' + (who === k ? 'active' : '') + '">' + esc(l) + '</a>';
  let body = '';
  if (who === 'team') {
    const recent = addDays(todayISO(), -14);
    body = players.length ? '<div class="tablewrap"><table><thead><tr><th>Player</th><th class="num">Sessions (14 days)</th><th>Last logged</th><th>Best improvement</th></tr></thead><tbody>' +
      players.map(p => { const mine = logs.filter(l => l.user_id === p.user_id); const n = mine.filter(l => String(l.date) >= recent).length; const imp = bestImprovement(mine);
        return '<tr><td><a href="#/aim/' + p.user_id + '"><b>' + esc(p.name) + '</b></a></td><td class="num">' + n + '</td><td class="small">' + (mine.length ? fmtDate(mine[mine.length - 1].date) : '—') + '</td><td class="small">' + (imp ? esc(imp.scenario) + ' <b class="' + (imp.pct >= 0 ? 'up' : 'down') + '">' + (imp.pct >= 0 ? '+' : '') + Math.round(imp.pct * 100) + '%</b>' : '<span class="muted">—</span>') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : empty('No players yet.');
  } else {
    const uid = who === 'me' ? S.me.id : who;
    const mine = logs.filter(l => l.user_id === uid);
    const groups = groupBy(mine, 'scenario');
    body = (uid === S.me.id ? '<div class="card" style="margin-bottom:14px"><form id="aimf" class="row" style="align-items:flex-end">' +
      '<label class="f"><span>Date</span><input type="date" name="date" value="' + todayISO() + '"></label><label class="f"><span>Type</span><select name="kind">' + AIM_KINDS.map(k => '<option>' + esc(k) + '</option>').join('') + '</select></label>' +
      '<label class="f grow"><span>Scenario</span><input name="scenario" list="aimsc" required placeholder="Gridshot, Range hard 30 bots, DM kills…"><datalist id="aimsc">' + groups.map(g => '<option value="' + esc(g[0]) + '">').join('') + '</datalist></label>' +
      '<label class="f"><span>Score</span><input name="score" inputmode="decimal" style="width:110px" required></label><label class="f"><span>Accuracy %</span><input name="acc" inputmode="decimal" style="width:90px"></label>' +
      '<button class="btn">Log</button></form></div>' : '<h2>' + esc(nameOfId(uid)) + '</h2>') +
      (groups.length ? '<div class="aimgrid">' + groups.map(([sc, list]) => { const first = Number(list[0].score), last = Number(list[list.length - 1].score), best = Math.max.apply(null, list.map(x => Number(x.score)));
        return '<div class="card"><div class="row spread"><b>' + esc(sc) + '</b><span class="pill">' + esc(list[0].kind || '') + '</span></div>' + aimChart(list) +
          '<div class="row small" style="gap:14px"><span>Best <b>' + num(best, 0) + '</b></span><span>Last <b>' + num(last, 0) + '</b></span>' + (list.length > 1 && first ? '<span class="' + (last >= first ? 'up' : 'down') + '">' + (last >= first ? '+' : '') + Math.round((last - first) / first * 100) + '% since first</span>' : '') + '<span class="muted">' + list.length + ' sessions</span></div></div>'; }).join('') + '</div>'
        : empty('No scores logged yet. Log your aim trainer or deathmatch scores after each session to see your progress.'));
  }
  el.innerHTML = '<div class="page-h"><div><h1>Aim tracker</h1><p class="muted">Log aim trainer and deathmatch scores and watch them climb.</p></div></div>' +
    '<div class="tabs">' + (S.me.ign || !isStaff() ? tab('me', 'Mine') : '') + (isStaff() ? tab('team', 'Team') : '') + (isStaff() ? players.map(p => tab(p.user_id, p.name)).join('') : '') + '</div>' + body;
  if ($('#aimf')) $('#aimf').onsubmit = async e => { e.preventDefault(); const f = e.target; const acc = f.acc.value === '' ? null : Number(f.acc.value) / 100;
    try { await db.insert('aim_logs', [{ user_id: S.me.id, date: f.date.value, kind: f.kind.value, scenario: f.scenario.value.trim(), score: Number(f.score.value), accuracy: acc }]); toast('Logged'); render(); } catch (err) { toast('Error: ' + err.message); } };
};
function bestImprovement(logs) {
  let best = null; groupBy(logs, 'scenario').forEach(([sc, list]) => { if (list.length < 2) return; const a = Number(list[0].score), b = Number(list[list.length - 1].score); if (!a) return; const p = (b - a) / a; if (!best || p > best.pct) best = { scenario: sc, pct: p }; }); return best;
}
function aimChart(list) {
  const w = 300, h = 90, pad = 4; const v = list.map(x => Number(x.score)); const mn = Math.min.apply(null, v), mx = Math.max.apply(null, v); const rng = mx - mn || 1;
  const pts = v.map((y, i) => [pad + (list.length === 1 ? (w - 2 * pad) / 2 : i / (list.length - 1) * (w - 2 * pad)), h - pad - (y - mn) / rng * (h - 2 * pad)]);
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="aimchart" preserveAspectRatio="none"><polyline fill="none" stroke="var(--accent-2)" stroke-width="2" points="' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '"/>' +
    pts.map((p, i) => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="var(--accent)"><title>' + esc(fmtDate(list[i].date) + ': ' + list[i].score) + '</title></circle>').join('') + '</svg>';
}

// ---------------------------------------------------------------- Role training paths
const PATHS = {
  Everyone: [['xhair', 'Crosshair placement', 'Crosshair at head height on every angle you clear, never on the floor.'], ['strafe', 'Counter-strafing', 'Stop fully before the first bullet; tap the opposite key.'],
    ['trade', 'Trade within 2 seconds', 'Be close enough that when a teammate dies, you kill the enemy who got him.'], ['callout', 'Clean callouts', 'Number + spot + health, every time ("two B main, one\'s one-shot").'],
    ['eco', 'Buy discipline', 'Follow the team buy: save together, force together, no solo buys.']],
  Duelist: [['entry', 'Entry off utility', 'Only take the first fight after a flash, dash or smoke — never dry.'], ['space', 'Create space on the take', 'Clear close angles fast so the team can follow in.'],
    ['pair', 'Swing with the initiator', 'Peek on their flash/recon timing ("flash on 3").'], ['early', 'Early map control', 'Take space safely at round start without dying first.'],
    ['retake', 'Retake with util', 'Use your movement util to re-enter sites, not to run in alone.']],
  Initiator: [['flashtime', 'Flash timing for the entry', 'Pop flashes so the duelist can swing instantly; call the timing.'], ['info', 'Round-start info', 'Use recon early to find where they are before the team commits.'],
    ['clear', 'Clear common angles with util', 'Use util on the angles the entry can\'t check.'], ['saveutil', 'Save util for retakes', 'Keep one info/flash ability for the retake on defense.'],
    ['postplant', 'Post-plant denial', 'Stun / recon / flash on the defuser.'], ['call', 'Call what your util found', 'Every recon or flash hit = an instant callout.']],
  Controller: [['oneway', 'One-way smokes on every site', 'Know at least one one-way smoke per site on each map in our pool.'], ['exec', 'Smoke timing on executes', 'Smokes land together on the call, not early.'],
    ['ppsmoke', 'Post-plant smokes and mollies', 'Molly or smoke the spike to stop the defuse.'], ['midround', 'Mid-round smokes', 'Keep a smoke to cut rotations or cover a retake.'],
    ['alive', 'Stay alive', 'Play behind the team; a dead controller means no smokes.'], ['retakesmoke', 'Retake smokes', 'Smoke off angles that cover the spike on retakes.']],
  Sentinel: [['setup', 'Site setups on every map', 'A setup per site per map (trips, cams, alarms) that you can place in seconds.'], ['flank', 'Flank watch on attack', 'Watch the flank and call when it\'s clear.'],
    ['anchor', 'Anchor without dying', 'Delay on site and fall back; buy time for the rotate.'], ['reposition', 'Change setups after rounds', 'Don\'t leave the same setup every round.'],
    ['retakeutil', 'Retake utility', 'Use your util to win the retake, not just to hold.']],
  IGL: [['default', 'Defaults and mid-round calls', 'One clear plan in the buy phase, one call mid-round.'], ['econcall', 'Economy calls', 'Call buy/save/force for the team every round.'],
    ['timeout', 'Timeouts with a fix', 'Every timeout ends with one concrete change.'], ['anti', 'Anti-strat adjustments', 'Spot their pattern and adjust within 3 rounds.'], ['calm', 'Short, calm comms', 'Same voice when losing; no blame mid-match.']]
};
PAGES.paths = async function (el) {
  const [prog, team] = await Promise.all([db.list('skill_progress', { order: 'updated_at', limit: 5000 }), teamPlayers()]);
  const players = team.players.filter(p => p.user_id);
  const sub = location.hash.split('/')[2] || (isStaff() && !S.me.ign ? 'team' : 'me');
  const tab = (k, l) => '<a href="#/paths/' + k + '" class="' + (sub === k ? 'active' : '') + '">' + esc(l) + '</a>';
  const pathFor = p => ['Everyone', (p && p.role && PATHS[p.role]) ? p.role : null, p && p.is_igl ? 'IGL' : null].filter(Boolean);
  let body = '';
  if (sub === 'team') {
    body = players.length ? '<div class="tablewrap"><table><thead><tr><th>Player</th><th>Path</th><th class="num">Practising</th><th class="num">Can do</th><th class="num">Verified</th><th>Progress</th></tr></thead><tbody>' +
      players.map(p => { const keys = pathFor(p).flatMap(r => PATHS[r].map(s => r + ':' + s[0])); const mine = prog.filter(x => x.user_id === p.user_id && keys.includes(x.skill));
        const v = mine.filter(x => x.verified).length, c = mine.filter(x => x.status === 'I can do it').length, pr = mine.filter(x => x.status === 'Practising' && !x.verified).length;
        return '<tr><td><a href="#/paths/' + p.user_id + '"><b>' + esc(p.name) + '</b></a></td><td>' + rolePill(p.role) + (p.is_igl ? ' <span class="pill yellow">IGL</span>' : '') + '</td><td class="num">' + pr + '</td><td class="num">' + c + '</td><td class="num">' + v + '</td><td style="min-width:140px"><div class="bar"><div style="width:' + Math.round(v / (keys.length || 1) * 100) + '%"></div></div><span class="small muted">' + v + ' / ' + keys.length + ' verified</span></td></tr>'; }).join('') +
      '</tbody></table></div>' : empty('No players yet.');
  } else {
    const uid = sub === 'me' ? S.me.id : sub;
    const p = uid === S.me.id ? { role: S.me.role, is_igl: S.me.is_igl, name: nameOf(S.me), user_id: S.me.id } : players.find(x => x.user_id === uid);
    const canSelf = uid === S.me.id, canVerify = isStaff();
    body = !p ? empty('Player not found.') : pathFor(p).map(r => { const skills = PATHS[r]; const done = skills.filter(s => (prog.find(x => x.user_id === uid && x.skill === r + ':' + s[0]) || {}).verified).length;
      return '<section class="card panel"><div class="card-h"><h2>' + esc(r === 'Everyone' ? 'Core skills (everyone)' : r) + '</h2><span class="small muted">' + done + ' / ' + skills.length + ' verified</span></div>' +
        skills.map(s => { const k = r + ':' + s[0]; const x = prog.find(y => y.user_id === uid && y.skill === k) || {};
          const state = x.verified ? 'verified' : x.status === 'I can do it' ? 'can' : x.status ? 'practising' : 'todo';
          return '<div class="skill ' + state + '"><div class="sk-ic">' + (state === 'verified' ? '★' : state === 'can' ? '✓' : state === 'practising' ? '…' : '') + '</div><div class="grow"><b>' + esc(s[1]) + '</b><div class="small muted">' + esc(s[2]) + '</div>' + (x.note ? '<div class="small quote">' + esc(x.note) + '</div>' : '') + '</div>' +
            '<div class="row" style="gap:6px;justify-content:flex-end">' + (canSelf ? '<select class="skst" data-k="' + k + '"><option value=""' + (!x.status ? ' selected' : '') + '>Not started</option><option' + (x.status === 'Practising' ? ' selected' : '') + '>Practising</option><option' + (x.status === 'I can do it' ? ' selected' : '') + '>I can do it</option></select>' : '<span class="pill ' + (state === 'can' ? 'green' : state === 'practising' ? 'yellow' : '') + '">' + esc(x.status || 'Not started') + '</span>') +
            (canVerify ? '<button class="btn small ' + (x.verified ? '' : 'ghost') + '" data-ver="' + k + '">' + (x.verified ? '★ Verified' : 'Verify (seen in scrim)') + '</button>' : (x.verified ? '<span class="pill green">★ Coach verified</span>' : '')) + '</div></div>'; }).join('') + '</section>'; }).join('');
  }
  el.innerHTML = '<div class="page-h"><div><h1>Training path</h1><p class="muted">Skills for each role. Mark what you\'re practising and what you can do; the coach verifies it once they see it in a scrim.</p></div></div>' +
    '<div class="tabs">' + (S.me.ign || !isStaff() ? tab('me', 'Mine') : '') + (isStaff() ? tab('team', 'Team') + players.map(p => tab(p.user_id, p.name)).join('') : '') + '</div>' + body;
  const uidNow = sub === 'me' ? S.me.id : sub;
  const upsert = async (k, patch) => { const x = prog.find(y => y.user_id === uidNow && y.skill === k);
    const res = x ? await sb.from('skill_progress').update(patch).eq('id', x.id) : await sb.from('skill_progress').insert([Object.assign({ user_id: uidNow, skill: k, status: 'Practising' }, patch)]);
    if (res.error) toast(res.error.message); else toast('Saved'); render(); };
  $$('.skst', el).forEach(s => s.onchange = () => s.value ? upsert(s.dataset.k, { status: s.value }) : (async () => { const x = prog.find(y => y.user_id === uidNow && y.skill === s.dataset.k); if (x && !x.verified) await sb.from('skill_progress').delete().eq('id', x.id); render(); })());
  $$('[data-ver]', el).forEach(b => b.onclick = () => { const x = prog.find(y => y.user_id === uidNow && y.skill === b.dataset.ver) || {}; upsert(b.dataset.ver, { verified: !x.verified, verified_by: S.me.id }); });
};

// ---------------------------------------------------------------- Comms recordings
const COMMS_RATINGS = [['clarity', 'Clarity'], ['brevity', 'Brevity'], ['calm', 'Calm'], ['info', 'Info'], ['calls', 'Calls']];
PAGES.comms = async function (el) {
  const id = Number(location.hash.split('/')[2]) || null;
  const [rows, guides] = await Promise.all([db.list('comms_recordings', { order: 'date', asc: false, limit: 500 }), cached('guides')]);
  const guide = guides.find(g => /clean comms/i.test(g.title || ''));
  if (id) return commsDetail(el, rows.find(r => r.id === id), guide);
  const avgR = k => { const v = rows.map(r => Number((r.ratings || {})[k])).filter(x => x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  el.innerHTML = '<div class="page-h"><div><h1>Comms</h1><p class="muted">Recordings of our voice comms with notes on what to clean up, plus how we want our comms to sound.</p></div>' + (isStaff() ? '<button class="btn small" id="addcm">Add a recording</button>' : '') + '</div>' +
    (rows.length ? '<div class="kpis">' + COMMS_RATINGS.map(([k, l]) => kpi(avgR(k) ? num(avgR(k), 1) + '/5' : '–', l)).join('') + '</div>' : '') +
    '<div class="home-grid"><div class="col">' + panel('Recordings', '', rows.length ? '<div class="slist">' + rows.map(r => { const sc = COMMS_RATINGS.map(([k]) => Number((r.ratings || {})[k])).filter(x => x > 0);
      return '<a class="srow" href="#/comms/' + r.id + '" style="color:inherit;text-decoration:none"><div class="grow"><div class="t">' + esc(r.title) + (!r.published ? ' <span class="pill purple">Draft</span>' : '') + '</div><div class="row small" style="gap:6px;margin-top:4px">' + (r.date ? '<span class="muted">' + fmtDate(r.date) + '</span>' : '') + (r.map ? '<span class="pill">' + esc(r.map) + '</span>' : '') + (r.opponent ? '<span class="muted">vs ' + esc(r.opponent) + '</span>' : '') + '</div></div>' +
        (sc.length ? '<span class="pill ' + (sc.reduce((a, b) => a + b, 0) / sc.length >= 4 ? 'green' : sc.reduce((a, b) => a + b, 0) / sc.length >= 3 ? 'yellow' : 'red') + '">' + num(sc.reduce((a, b) => a + b, 0) / sc.length, 1) + '/5</span>' : '') + '</a>'; }).join('') + '</div>'
      : empty('No recordings yet. Record comms in Discord (e.g. with Craig bot or OBS), upload to YouTube (unlisted) or Google Drive, and add the link here.')) + '</div>' +
    '<div class="col">' + (guide ? panel('How we want our comms', '', '<div class="md small">' + md(guide.body) + '</div>') : '') + '</div></div>';
  if ($('#addcm')) $('#addcm').onclick = () => commsForm({ date: todayISO(), published: true });
};
async function commsDetail(el, r, guide) {
  if (!r) { el.innerHTML = empty('That recording isn\'t here.', '<a class="btn small" href="#/comms">All recordings</a>'); return; }
  const vi = videoInfo(r.link), audio = r.link && /\.(mp3|m4a|ogg|wav|webm|aac)(\?|$)/i.test(r.link);
  const canEmbed = vi && (vi.kind === 'yt' || vi.kind === 'tw');
  el.innerHTML = '<div class="page-h"><div><a href="#/comms" class="small">← Comms</a><h1 style="margin-top:6px">' + esc(r.title) + '</h1><div class="row small" style="gap:6px">' + (r.date ? '<span class="muted">' + fmtDate(r.date) + '</span>' : '') + (r.map ? '<span class="pill">' + esc(r.map) + '</span>' : '') + (r.opponent ? '<span class="muted">vs ' + esc(r.opponent) + '</span>' : '') + (r.vod ? linkHtml(r.vod, 'Gameplay VOD') : '') + '</div></div>' +
    (isStaff() ? '<button class="btn small ghost" id="edcm">Edit</button>' : '') + '</div>' +
    '<div class="review-grid"><div class="vcol"><div class="player' + (audio ? ' audio' : '') + '">' + (audio ? '<audio id="cplayer" controls src="' + esc(r.link) + '"></audio>' : canEmbed ? '<iframe id="vplayer" src="' + esc(embedSrc(vi, vi.t || 0)) + '" allow="autoplay; fullscreen" allowfullscreen></iframe>' : '<div class="noembed">' + (r.link ? '<a class="btn" href="' + esc(r.link) + '" target="_blank" rel="noopener">Open the recording</a>' : 'No recording link.') + '</div>') + '</div>' +
      '<div class="ratings">' + COMMS_RATINGS.map(([k, l]) => { const v = Number((r.ratings || {})[k]) || 0; return '<div><span>' + l + '</span><b>' + (v ? '★'.repeat(v) + '<i>' + '★'.repeat(5 - v) + '</i>' : '<i>not rated</i>') + '</b></div>'; }).join('') + '</div></div>' +
    '<div class="ncol">' + panel('How to clean up our comms', '', r.notes ? '<div class="md notes">' + md(r.notes) + '</div>' : '<p class="muted small">No notes yet.</p>') + '</div></div>';
  // timestamps jump the recording
  $$('.notes', el).forEach(box => { const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT); const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => { if (n.parentNode.closest('a,button') || !/\b\d{1,2}:\d{2}(?::\d{2})?\b/.test(n.nodeValue)) return; const span = document.createElement('span');
      span.innerHTML = esc(n.nodeValue).replace(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g, (m0, t) => '<button type="button" class="ts" data-seek="' + tsToSec(t) + '">' + t + '</button>'); n.parentNode.replaceChild(span, n); }); });
  el.addEventListener('click', e => { const t = e.target.closest('[data-seek]'); if (!t) return; const sec = Number(t.dataset.seek);
    if ($('#cplayer')) { $('#cplayer').currentTime = sec; $('#cplayer').play(); } else if ($('#vplayer')) $('#vplayer').src = embedSrc(vi, sec); });
  if ($('#edcm')) $('#edcm').onclick = () => commsForm(r);
}
function commsForm(r) {
  const tpl = '## What went well\n- \n\n## Where comms broke down\n- 0:00 — \n\n## Fix for next time\n- ';
  openModal('<h2>' + (r.id ? 'Edit' : 'Add') + ' comms recording</h2><form id="cmf"><div class="row"><label class="f grow"><span>Title</span><input name="title" required value="' + esc(r.title || '') + '" placeholder="Scrim vs Night Owls — Lotus"></label><label class="f"><span>Date</span><input type="date" name="date" value="' + esc(r.date ? String(r.date).slice(0, 10) : '') + '"></label></div>' +
    '<div class="row"><label class="f grow"><span>Opponent</span><input name="opponent" value="' + esc(r.opponent || '') + '"></label><label class="f grow"><span>Map</span><select name="map"><option value=""></option>' + MAPS.map(m => '<option' + (m === r.map ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></label></div>' +
    '<label class="f"><span>Recording link (YouTube / Twitch / Drive / .mp3)</span><input name="link" value="' + esc(r.link || '') + '"></label><label class="f"><span>Gameplay VOD link (optional)</span><input name="vod" value="' + esc(r.vod || '') + '"></label>' +
    '<div class="f"><span>Ratings (1–5)</span><div class="row">' + COMMS_RATINGS.map(([k, l]) => '<label class="small">' + l + ' <select name="r_' + k + '"><option value=""></option>' + [1, 2, 3, 4, 5].map(n => '<option' + (Number((r.ratings || {})[k]) === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>').join('') + '</div></div>' +
    '<label class="f"><span>Notes on how to improve (timestamps like 12:34 become buttons)</span><textarea name="notes" rows="10">' + esc(r.notes || tpl) + '</textarea></label>' +
    '<label class="row small"><input type="checkbox" name="published"' + (r.published !== false ? ' checked' : '') + '> Players can see it</label>' +
    '<div class="row" style="margin-top:10px"><button class="btn">Save</button><button type="button" class="btn ghost" data-close>Cancel</button>' + (r.id ? '<span class="grow"></span><button type="button" class="btn small danger" id="cmdel">Delete</button>' : '') + '</div></form>', m => {
    $('#cmf', m).onsubmit = async e => { e.preventDefault(); const f = e.target; const ratings = {}; COMMS_RATINGS.forEach(([k]) => { if (f['r_' + k].value) ratings[k] = Number(f['r_' + k].value); });
      const rec = { title: f.title.value.trim(), date: f.date.value || null, opponent: f.opponent.value.trim() || null, map: f.map.value || null, link: f.link.value.trim() || null, vod: f.vod.value.trim() || null, ratings: ratings, notes: f.notes.value.trim() || null, published: f.published.checked };
      try { if (r.id) await db.update('comms_recordings', r.id, rec); else await db.insert('comms_recordings', [rec]); closeModal(); toast('Saved'); render(); } catch (err) { toast('Error: ' + err.message); } };
    if ($('#cmdel', m)) $('#cmdel', m).onclick = async () => { if (!confirm('Delete this recording?')) return; await db.remove('comms_recordings', r.id); closeModal(); location.hash = '#/comms'; };
  });
}

// ---------------------------------------------------------------- 1-on-1 notes
const NOTE_KINDS = ['Note', 'Goal', 'Feedback', 'Concern'];
const NOTE_PILL = { Goal: 'blue', Feedback: 'green', Concern: 'red', Note: '' };
PAGES.notes = async function (el) {
  const head = S.me.is_coach;
  const team = await teamPlayers();
  const players = team.players.filter(p => p.user_id);
  let uid = location.hash.split('/')[2] || null;
  if (!head) uid = S.me.id;
  const notes = await db.list('one_on_one', { order: 'created_at', asc: true, limit: 2000 });
  if (head && !uid) {
    el.innerHTML = '<div class="page-h"><div><h1>1-on-1 notes</h1><p class="muted">Private notes between you and each player. Only you and that player can see them.</p></div></div>' +
      (players.length ? '<div class="plist">' + players.map(p => { const mine = notes.filter(n => n.player_id === p.user_id); const last = mine[mine.length - 1]; const goals = mine.filter(n => n.kind === 'Goal' && !n.done).length;
        return '<a class="prow" href="#/notes/' + p.user_id + '" style="color:inherit;text-decoration:none">' + avatar(p, 36) + '<div class="grow"><div class="t">' + esc(p.name) + ' ' + rolePill(p.role) + '</div><div class="small muted">' + (last ? fmtDate(last.created_at) + ' · ' + esc(String(last.body).slice(0, 80)) : 'No notes yet') + '</div></div>' + (goals ? '<span class="pill blue">' + goals + ' open goal' + (goals > 1 ? 's' : '') + '</span>' : '') + '</a>'; }).join('') + '</div>' : empty('No players have joined yet.'));
    return;
  }
  const p = uid === S.me.id ? { name: nameOf(S.me) } : players.find(x => x.user_id === uid) || { name: 'Player' };
  const thread = notes.filter(n => n.player_id === uid);
  const coachIds = new Set(team.coaches.filter(c => c.is_coach).map(c => c.id));
  el.innerHTML = '<div class="page-h"><div>' + (head ? '<a href="#/notes" class="small">← All players</a>' : '') + '<h1 style="margin-top:6px">' + (head ? '1-on-1 with ' + esc(p.name) : 'My 1-on-1 with the coach') + '</h1><p class="muted">Private: only ' + (head ? esc(p.name) + ' and you' : 'you and the head coach') + ' can see this.</p></div></div>' +
    '<div class="thread">' + (thread.length ? thread.map(n => '<div class="msg ' + (n.author_id === S.me.id ? 'me' : '') + (n.done ? ' done' : '') + '"><div class="row small" style="gap:6px"><span class="pill ' + (NOTE_PILL[n.kind] || '') + '">' + esc(n.kind || 'Note') + '</span><b>' + (coachIds.has(n.author_id) ? 'Coach' : esc(p.name)) + '</b><span class="muted">' + fmtDate(n.created_at) + '</span>' +
        (n.kind === 'Goal' ? '<button class="linkbtn" data-done="' + n.id + '">' + (n.done ? '✓ Done' : 'Mark done') + '</button>' : '') + (n.author_id === S.me.id ? '<button class="linkbtn" data-ndel="' + n.id + '">Delete</button>' : '') + '</div><div class="md">' + md(n.body) + '</div></div>').join('') : '<p class="muted">Nothing here yet. ' + (head ? 'Write the first note: feedback, a goal, or something to talk about.' : 'Write something for your coach: a goal, a question or anything on your mind.') + '</p>') + '</div>' +
    '<form id="nf" class="card stack" style="margin-top:14px"><div class="row"><select name="kind" style="max-width:160px">' + NOTE_KINDS.map(k => '<option>' + k + '</option>').join('') + '</select></div><textarea name="body" rows="3" required placeholder="Write a note…"></textarea><div><button class="btn small">Add note</button></div></form>';
  $('#nf').onsubmit = async e => { e.preventDefault(); try { await db.insert('one_on_one', [{ player_id: uid, author_id: S.me.id, kind: e.target.kind.value, body: e.target.body.value.trim() }]); render(); } catch (err) { toast('Error: ' + err.message); } };
  $$('[data-done]', el).forEach(b => b.onclick = async () => { const n = thread.find(x => x.id === Number(b.dataset.done)); await db.update('one_on_one', n.id, { done: !n.done }); render(); });
  $$('[data-ndel]', el).forEach(b => b.onclick = async () => { if (!confirm('Delete this note?')) return; await db.remove('one_on_one', Number(b.dataset.ndel)); render(); });
};

// ---------------------------------------------------------------- Public team page (no sign-in)
async function renderPublic() {
  const slug = decodeURIComponent((location.hash.match(/^#\/t\/([^/?]+)/) || [])[1] || '');
  $('#app').innerHTML = '<div class="pub"><p class="muted">Loading…</p></div>';
  const { data, error } = await sb.rpc('public_team', { p_slug: slug });
  if (error || !data) { $('#app').innerHTML = '<div class="pub"><div class="card"><h1>Team not found</h1><p class="muted">This team page doesn\'t exist or isn\'t public.</p><a class="btn small" href="' + esc(location.pathname) + '">Team Hub</a></div></div>'; return; }
  const t = data, L = t.links || {};
  const linkBtn = (k, label) => L[k] ? '<a class="btn small ghost" href="' + esc(L[k]) + '" target="_blank" rel="noopener">' + label + '</a>' : '';
  const res = t.results || []; const w = res.filter(m => Number(m.rounds_won) > Number(m.rounds_lost)).length;
  document.title = t.name + ' — Team Hub';
  $('#app').innerHTML = '<div class="pub"><div class="pubhero"><div class="dot"></div><div class="grow"><h1>' + esc(t.name) + (t.tag ? ' <span class="pill">' + esc(t.tag) + '</span>' : '') + '</h1>' + (t.bio ? '<p>' + esc(t.bio) + '</p>' : '') +
    '<div class="row">' + linkBtn('twitter', 'X / Twitter') + linkBtn('twitch', 'Twitch') + linkBtn('youtube', 'YouTube') + linkBtn('discord', 'Discord') + linkBtn('website', 'Website') + linkBtn('vlr', 'VLR.gg') + '</div></div>' +
    (res.length ? '<div class="hero-stats">' + statLine(w + '–' + (res.length - w), 'recent maps') + '</div>' : '') + '</div>' +
    '<h2>Roster</h2><div class="pcards">' + (t.roster || []).map(p => '<div class="pcard"><span class="av" style="width:52px;height:52px;font-size:21px">' + esc(String(p.ign || '?').slice(0, 2).toUpperCase()) + '</span><div class="nm">' + esc(p.ign || '') + '</div>' +
      '<div class="row" style="justify-content:center;gap:4px">' + rolePill(p.role) + (p.igl ? '<span class="pill yellow">IGL</span>' : '') + '</div>' + (p.rank ? '<div style="margin-top:8px">' + rankPill(p.rank) + '</div>' : '') + (p.peak ? '<div class="small muted">Peak ' + esc(p.peak) + '</div>' : '') + (p.riot_id ? '<div class="small muted">' + esc(p.riot_id) + '</div>' : '') + '</div>').join('') + '</div>' +
    ((t.staff || []).length ? '<p class="small muted" style="margin-top:10px">Staff: ' + t.staff.map(s => esc(s.name) + ' (' + esc(s.role) + ')').join(', ') + '</p>' : '') +
    (res.length ? '<h2 style="margin-top:20px">Recent results</h2><div class="tablewrap"><table><thead><tr><th>Date</th><th>Event</th><th>Opponent</th><th>Map</th><th class="num">Score</th></tr></thead><tbody>' +
      res.map(m => '<tr><td>' + (m.date ? fmtDate(m.date) : '') + '</td><td>' + esc(m.event || '') + '</td><td>' + esc(m.opponent || '') + '</td><td>' + esc(m.map || '') + '</td><td class="num"><span class="fdot ' + (Number(m.rounds_won) > Number(m.rounds_lost) ? 'w' : 'l') + '"></span> ' + (m.rounds_won ?? '') + '–' + (m.rounds_lost ?? '') + '</td></tr>').join('') + '</tbody></table></div>' : '') +
    '<p class="small muted" style="margin-top:24px">Powered by Team Hub · <a href="' + esc(location.pathname) + '">Run your team on Team Hub</a></p></div>';
}
COACH.publicpage = async function (box) {
  const t = S.team || {}; const L = t.public_links || {};
  const url = location.origin + location.pathname + '#/t/' + encodeURIComponent(t.public_slug || '');
  box.innerHTML = '<div class="card stack" style="max-width:640px"><h2>Public team page</h2><p class="small muted">A page anyone can open without signing in: roster (in-game names, roles, ranks), staff, bio, links and recent official results. Scrims, stats, plans and everything else stay private.</p>' +
    '<form id="pf" class="stack"><label class="row"><input type="checkbox" name="on"' + (t.public_enabled ? ' checked' : '') + '> <b>Page is public</b></label>' +
    '<label class="f"><span>Page address</span><div class="row"><span class="small muted">' + esc(location.host) + '/#/t/</span><input name="slug" value="' + esc(t.public_slug || '') + '" placeholder="' + esc(String(t.tag || t.name || 'team').toLowerCase().replace(/[^a-z0-9]+/g, '')) + '" style="max-width:200px" pattern="[A-Za-z0-9-]{2,30}"></div></label>' +
    '<label class="f"><span>Bio</span><textarea name="bio" rows="3" placeholder="NA Valorant team chasing VCT. Looking for scrims.">' + esc(t.public_bio || '') + '</textarea></label>' +
    ['twitter', 'twitch', 'youtube', 'discord', 'website', 'vlr'].map(k => '<label class="f"><span>' + ({ twitter: 'X / Twitter', twitch: 'Twitch', youtube: 'YouTube', discord: 'Discord invite', website: 'Website', vlr: 'VLR.gg team page' })[k] + '</span><input name="l_' + k + '" value="' + esc(L[k] || '') + '" placeholder="https://…"></label>').join('') +
    '<label class="row small"><input type="checkbox" name="results"' + (L.show_results !== false ? ' checked' : '') + '> Show recent official results (scrims are never shown)</label>' +
    '<label class="row small"><input type="checkbox" name="riot"' + (L.show_riot_ids ? ' checked' : '') + '> Show players\' Riot IDs</label>' +
    '<div class="row"><button class="btn">Save</button>' + (t.public_enabled && t.public_slug ? '<a class="btn ghost small" href="' + esc(url) + '" target="_blank" rel="noopener">Open page</a><button type="button" class="btn ghost small" id="cpp">Copy link</button>' : '') + '</div></form></div>' +
    '<div class="card stack" style="max-width:640px;margin-top:14px"><h2>Map pool for the veto simulator</h2><p class="small muted">The maps currently in competitive rotation. Used by the Veto simulator.</p><div id="am">' + mapChecks((t.active_maps || []).join(', ')) + '</div><div><button class="btn small" id="amsave">Save map pool</button></div></div>';
  $('#pf').onsubmit = async e => { e.preventDefault(); const f = e.target; const links = {}; ['twitter', 'twitch', 'youtube', 'discord', 'website', 'vlr'].forEach(k => { const v = f['l_' + k].value.trim(); if (v) links[k] = v; });
    links.show_results = f.results.checked; links.show_riot_ids = f.riot.checked;
    const slug = f.slug.value.trim().toLowerCase();
    if (f.on.checked && !slug) { toast('Pick a page address first'); return; }
    const { error } = await sb.from('teams').update({ public_enabled: f.on.checked, public_slug: slug || null, public_bio: f.bio.value.trim() || null, public_links: links }).eq('id', t.id);
    if (error) { toast(/duplicate|unique/i.test(error.message) ? 'That address is taken — try another' : error.message); return; }
    toast('Saved'); await loadMe(); COACH.publicpage(box); };
  if ($('#cpp')) $('#cpp').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch (e) { toast(url); } };
  $('#amsave').onclick = async () => { const maps = $$('#am [name=maps]:checked').map(c => c.value); const { error } = await sb.from('teams').update({ active_maps: maps.length ? maps : null }).eq('id', t.id); toast(error ? error.message : 'Saved'); if (!error) await loadMe(); };
};

// ----- cached member list for the leaderboard (names/roles of teammates)
const _origCached = cached;
cached = async function (table, opts) {
  if (table === 'profiles_list') {
    if (!S.me || !S.me.team_id) return [];
    if (!S.cache.profiles_list) {
      // Never load every approved account into a team's roster view. Only
      // profiles belonging to the active team may be joined to its roster.
      const pending = sb.from('profiles')
        .select('id,display_name,ign,role,is_igl,is_trial,is_coach,staff_role,approved,discord,avatar_url,riot_id,rank,rank_rr,peak_rank,rank_updated')
        .eq('approved', true)
        .eq('team_id', S.me.team_id)
        .then(({ data, error }) => {
          if (error) throw error;
          const rows = data || [];
          S.cache.profiles_list = rows;
          return rows;
        }).catch(err => {
          delete S.cache.profiles_list;
          throw err;
        });
      S.cache.profiles_list = pending;
    }
    return S.cache.profiles_list;
  }
  return _origCached(table, opts);
};

// expose pure helpers for tests
window.__TEAMHUB__ = { md: md, planImport: planImport, mergeWork: mergeWork, coerce: coerce, compAnalysis: compAnalysis, calcStreak: calcStreak, parseCSV: parseCSV, TABLES: TABLES, normName: normName };

if (!window.__TEAMHUB_NO_BOOT__) boot();
})();
