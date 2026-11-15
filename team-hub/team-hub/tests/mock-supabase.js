// In-memory stand-in for supabase-js, for local testing only.
(function () {
  const params = new URLSearchParams(location.search);
  const as = params.get('as') || 'u-coach';
  const DB = window.__MOCKDB__;
  let nextId = 1000;
  const listeners = [];
  let session = as === 'none' ? null : { user: { id: as, email: as + '@x.com' } };

  function Q(table) {
    this.t = table; this.filters = []; this.op = 'select'; this.payload = null; this.ord = []; this.lim = null; this.head = false; this.count = false;
  }
  Q.prototype.select = function (cols, o) { if (this.op === 'select') this.op = 'select'; if (o && o.head) this.head = true; if (o && o.count) this.count = true; return this; };
  Q.prototype.eq = function (k, v) { this.filters.push(r => String(r[k]) === String(v)); return this; };
  Q.prototype.neq = function (k, v) { this.filters.push(r => String(r[k]) !== String(v)); return this; };
  Q.prototype.gt = function (k, v) { this.filters.push(r => r[k] > v); return this; };
  Q.prototype.gte = function (k, v) { this.filters.push(r => String(r[k]) >= String(v)); return this; };
  Q.prototype.order = function (k, o) { this.ord.push([k, o && o.ascending]); return this; };
  Q.prototype.limit = function (n) { this.lim = n; return this; };
  Q.prototype.insert = function (rows) { this.op = 'insert'; this.payload = rows; return this; };
  Q.prototype.update = function (p) { this.op = 'update'; this.payload = p; return this; };
  Q.prototype.delete = function () { this.op = 'delete'; return this; };
  Q.prototype.in = function (k, vs) { this.filters.push(r => vs.map(String).includes(String(r[k]))); return this; };
  Q.prototype.maybeSingle = function () { const q = this; return { then: (res, rej) => q.then(r => res({ data: r.data && r.data.length ? r.data[0] : null, error: r.error }), rej), catch: f => Promise.resolve() }; };
  Q.prototype.single = Q.prototype.maybeSingle;
  Q.prototype.then = function (res, rej) {
    try {
      const T = DB[this.t] = DB[this.t] || [];
      const match = r => this.filters.every(f => f(r));
      if (this.op === 'insert') { const made = this.payload.map(r => { const x = Object.assign({ id: nextId++, created_at: new Date().toISOString(), team_id: 1 }, r); T.push(x); return x; }); return Promise.resolve({ data: made, error: null }).then(res, rej); }
      if (this.op === 'update') { T.filter(match).forEach(r => Object.assign(r, this.payload)); return Promise.resolve({ data: null, error: null }).then(res, rej); }
      if (this.op === 'delete') { DB[this.t] = T.filter(r => !match(r)); return Promise.resolve({ data: null, error: null }).then(res, rej); }
      let rows = T.filter(match).map(r => Object.assign({}, r));
      this.ord.slice().reverse().forEach(([k, asc]) => rows.sort((a, b) => { const x = a[k], y = b[k]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1); }));
      if (this.lim) rows = rows.slice(0, this.lim);
      return Promise.resolve({ data: this.head ? null : rows, count: rows.length, error: null }).then(res, rej);
    } catch (e) { return Promise.resolve({ data: null, error: e }).then(res, rej); }
  };

  window.supabase = {
    createClient: function () {
      return {
        from: t => new Q(t),
        functions: { invoke: async (name, opts) => { window.__fnCalls = (window.__fnCalls || []).concat([[name, opts && opts.body]]); const b = (opts && opts.body) || {};
          if (name === 'riot-sync' && b.action === 'scrim_candidates') return { data: { ok: true, games: [{ match_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', started_at: new Date().toISOString(), map: 'Haven', score: [10, 14], players: 2, imported: false }, { match_id: 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee', started_at: new Date().toISOString(), map: 'Lotus', score: [13, 7], players: 4, imported: true }] }, error: null };
          if (name === 'riot-sync' && b.action === 'import_scrim') { DB.matches.push({ id: 999, team_id: 1, date: new Date().toISOString().slice(0, 10), type: 'Scrim', opponent: b.opponent || 'Scrim (from Riot)', map: 'Haven', rounds_won: 10, rounds_lost: 13, source: 'riot', riot_match_id: b.match_id, rounds: Array.from({ length: 23 }, (_, i) => ({ n: i + 1, w: i % 2 === 0 && i < 20, side: i < 12 ? 'A' : 'D' })) }); return { data: { ok: true, imported: true, map: 'Haven', result: '10-13' }, error: null }; }
          if (name === 'riot-sync' && b.action === 'scout') { if (!b.riot_ids || !b.riot_ids.length) return { data: { error: 'Add at least one Riot ID (Name#TAG).' }, error: null };
            const row = { id: 100 + (DB.opponent_scouts || []).length, team_id: 1, opponent: b.opponent, riot_ids: b.riot_ids, created_at: new Date().toISOString(), data: { scouted_at: new Date().toISOString(), together: [], players: b.riot_ids.map(r => ({ riot_id: r, rank: 'Gold 3', games: 5, wins: 3, kd: 1.05, acs: 200, hs: 0.2, fk: 3, fd: 2, agents: [{ name: 'Sova', games: 5, wins: 3 }], maps: [{ name: 'Bind', games: 5, wins: 3 }], events: [['Bind', 'A', 'k', 100, 200, 300, 400, 1, 'Sova']] })) } };
            DB.opponent_scouts = [row].concat(DB.opponent_scouts || []); return { data: { ok: true, id: row.id, data: row.data }, error: null }; }
          if (name === 'discord-announce') { if (!(DB.team_discord || []).length) return { data: { error: 'Discord isn\'t connected yet.' }, error: null };
            if (b.action === 'post') { const a = DB.announcements.find(x => x.id === b.id); if (a) a.discord_sent_at = new Date().toISOString(); }
            return { data: { ok: true }, error: null }; }
          if (name !== 'riot-sync') return { data: null, error: { message: 'no fn' } };
          const uid = session && session.user.id; DB.riot_links = DB.riot_links || [];
          if (b.action === 'link') { if (!/#/.test(b.riot_id || '')) return { data: { error: 'Enter your Riot ID as Name#TAG (for example Fear#NA1).' }, error: null }; const [n, t] = b.riot_id.split('#'); DB.riot_links = DB.riot_links.filter(x => x.user_id !== uid).concat([{ user_id: uid, riot_name: n, riot_tag: t, region: 'na', synced_at: new Date().toISOString() }]); return { data: { ok: true, new_games: (DB.riot_matches || []).filter(m => m.user_id === uid).length }, error: null }; }
          if (b.action === 'unlink') { DB.riot_links = DB.riot_links.filter(x => x.user_id !== uid); return { data: { ok: true }, error: null }; }
          if (b.action === 'sync_team') return { data: { ok: true, synced: 2, failed: 0 }, error: null };
          return { data: { ok: true, new_games: 0 }, error: null }; } },
        rpc: async (fn, args) => {
          if (fn === 'public_team') { const t = DB.teams.find(x => x.public_enabled && String(x.public_slug).toLowerCase() === String(args.p_slug).toLowerCase()); if (!t) return { data: null, error: null };
            return { data: { name: t.name, tag: t.tag, bio: t.public_bio, links: t.public_links, roster: DB.roster.filter(r => r.team_id === t.id && r.status !== 'Bench' && !r.is_trial).map(r => { const p = DB.profiles.find(x => x.id === r.claimed_by) || {}; return { ign: r.ign || r.name, role: r.role, igl: r.is_igl, rank: p.rank, peak: p.peak_rank }; }),
              staff: [{ name: 'dylanl', role: 'Head coach' }], results: DB.matches.filter(m => m.team_id === t.id && m.type !== 'Scrim').map(m => ({ date: m.date, event: m.event, opponent: m.opponent, map: m.map, rounds_won: m.rounds_won, rounds_lost: m.rounds_lost })) }, error: null }; }
          if (fn === 'discord_status') { const d = (DB.team_discord || [])[0]; return { data: d ? { connected: true, mention: d.mention, hint: d.webhook_url.slice(-4), remind_day: d.remind_day, remind_hour: d.remind_hour, remind_avail: d.remind_avail } : { connected: false }, error: null }; }
          if (fn === 'set_discord_webhook') { if (!args.p_url) { DB.team_discord = []; return { data: null, error: null }; } if (!/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]{20,}$/.test(args.p_url)) return { data: null, error: { message: 'That isn\'t a Discord webhook link.' } }; DB.team_discord = [{ team_id: 1, webhook_url: args.p_url, mention: args.p_mention || '' }]; return { data: null, error: null }; }
          if (fn === 'set_discord_reminders') { (DB.team_discord || []).forEach(d => { d.remind_day = args.p_day; d.remind_hour = args.p_hour; d.remind_avail = args.p_avail; }); return { data: null, error: null }; }
          if (fn === 'set_discord_mention') { (DB.team_discord || []).forEach(d => d.mention = args.p_mention); return { data: null, error: null }; }
          const me = DB.profiles.find(x => x.id === session.user.id);
          const claim = rid => { const r = DB.roster.find(x => x.id === rid); if (r.claimed_by && r.claimed_by !== me.id) return 'taken';
            DB.roster.forEach(x => { if (x.claimed_by === me.id) { x.claimed_by = null; x.claim_status = null; } });
            const m = r.discord && me.discord && r.discord.toLowerCase() === me.discord.toLowerCase();
            r.claimed_by = me.id; r.claim_status = m ? 'approved' : 'pending';
            Object.assign(me, { team_id: me.team_id || r.team_id, display_name: r.name, ign: r.ign, role: r.role, approved: me.approved || m }); return m ? 'approved' : 'pending'; };
          if (fn === 'claim_roster') return { data: claim(args.rid), error: null };
          if (fn === 'my_calendar_token') return { data: 'a'.repeat(64), error: null };
          if (fn === 'rotate_calendar_token') return { data: 'b'.repeat(64), error: null };
          if (fn === 'admin_health') return { data: me.is_admin ? { cron: [{ start: new Date().toISOString(), status: 'succeeded', msg: '1 row' }], http: [{ status: 200, body: '{"ok":true,"due":2,"synced":2}', at: new Date().toISOString() }], links: 2, stale_links: 0, errors_24h: (DB.app_errors || []).length, teams: 2, members: 10 } : null, error: null };
          const ok = d => ({ data: d, error: null }), bad = m => ({ data: null, error: { message: m } });
          if (fn === 'my_invites') return ok(me.team_id ? [] : DB.roster.filter(r => !r.claimed_by && r.discord && r.discord === me.discord).map(r => { const t = DB.teams.find(x => x.id === r.team_id); return { slot_id: r.id, slot_name: r.name, team_id: t.id, team_name: t.name, team_tag: t.tag }; }));
          if (fn === 'join_team') { const t = DB.teams.find(x => x.join_code === args.p_code); if (!t) return bad('That code doesn\'t match any team. Check it with your coach.'); Object.assign(me, { team_id: t.id, approved: false, is_coach: false }); return ok(t.name); }
          if (fn === 'create_team') { const id = nextId++; DB.teams.push({ id, name: args.p_name, tag: args.p_tag, join_code: 'NEW' + id, owner_id: me.id }); Object.assign(me, { team_id: id, is_coach: true, approved: true }); return ok(id); }
          if (fn === 'leave_team') { Object.assign(me, { team_id: null, approved: false, is_coach: false }); return ok('ok'); }
          if (fn === 'remove_member') { const p = DB.profiles.find(x => x.id === args.uid); Object.assign(p, { team_id: null, approved: false }); return ok('ok'); }
          if (fn === 'new_join_code') { const t = DB.teams.find(x => x.id === me.team_id); t.join_code = 'Z' + (nextId++); return ok(t.join_code); }
          if (fn === 'admin_teams') return ok(DB.teams.map(t => ({ id: t.id, name: t.name, tag: t.tag, join_code: t.join_code, created_at: '2026-11-12', owner: (DB.profiles.find(p => p.id === t.owner_id) || {}).discord, coaches: 1, members: DB.profiles.filter(p => p.team_id === t.id && p.approved).length, waiting: DB.profiles.filter(p => p.team_id === t.id && !p.approved).length, checkins_7d: 3, last_checkin: '2026-11-12' })));
          if (fn === 'admin_open_team') { me.team_id = args.tid; return ok('ok'); }
          if (fn === 'admin_delete_team') { DB.teams = DB.teams.filter(t => t.id !== args.tid); DB.profiles.forEach(p => { if (p.team_id === args.tid) p.team_id = null; }); return ok('ok'); }
          if (fn === 'set_work_status') { const w = DB.work_on.find(x => x.id === args.wid); if (args.new_status === 'Fixed') { w.fixed_at = w.fixed_at && w.status === 'Fixed' ? w.fixed_at : new Date().toISOString().slice(0, 10); w.came_back = false; } w.status = args.new_status; return ok('ok'); }
          if (fn === 'team_directory') { if (!(me.is_coach || me.staff_role)) return bad('Coaches only.'); return ok(DB.teams.map(t => ({ id: t.id, name: t.name, tag: t.tag, players: DB.roster.filter(r => r.team_id === t.id).length, maps_played: DB.matches.filter(m => m.team_id === t.id).length, last_match: null }))); }
          if (fn === 'team_public_roster') { if (!(me.is_coach || me.staff_role)) return bad('Coaches only.'); return ok(DB.roster.filter(r => r.team_id === args.tid).map(r => ({ name: r.ign || r.name, ign: r.ign, role: r.role, is_igl: r.is_igl, is_trial: r.is_trial, status: r.status || 'Active' }))); }
          if (fn === 'set_my_rank') { Object.assign(me, { riot_id: args.p_riot_id, rank: args.p_rank, rank_rr: args.p_rr, peak_rank: args.p_peak, rank_updated: new Date().toISOString().slice(0, 10) }); DB.rank_history.push({ id: 900 + DB.rank_history.length, team_id: me.team_id, user_id: me.id, date: new Date().toISOString().slice(0, 10), rank: args.p_rank, rr: args.p_rr }); return ok('ok'); }
          if (fn === 'auto_claim') { if (DB.roster.some(x => x.claimed_by === me.id)) return { data: 'already' }; const r = DB.roster.find(x => !x.claimed_by && x.discord && x.discord === me.discord && x.team_id === me.team_id); return { data: r ? claim(r.id) : 'none' }; }
          return ok(null);
        },
        __dummy: 0,
        auth: {
          getSession: async () => ({ data: { session: session } }),
          onAuthStateChange: cb => listeners.push(cb),
          signInWithPassword: async ({ email }) => { const p = DB.profiles.find(x => x.email === email); if (!p) return { error: { message: 'Invalid login credentials' } }; session = { user: { id: p.id } }; listeners.forEach(l => l('SIGNED_IN', session)); return { error: null }; },
          signUp: async ({ email, options }) => { const id = 'u-' + (nextId++); DB.profiles.push(Object.assign({ id: id, email: email, approved: false, is_coach: false, visibility: {} }, options.data)); session = { user: { id: id } }; listeners.forEach(l => l('SIGNED_IN', session)); return { data: { session: session }, error: null }; },
          signInWithOAuth: async () => ({ error: null }),
          signOut: async () => { session = null; listeners.forEach(l => l('SIGNED_OUT', null)); return {}; },
          resetPasswordForEmail: async () => ({ error: null }),
          updateUser: async () => ({ error: null })
        }
      };
    }
  };
})();
