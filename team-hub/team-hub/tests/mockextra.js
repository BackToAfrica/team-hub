(function () {
  const DB = window.__MOCKDB__;
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const mon = new Date(); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const at = (dayOff, h) => { const d = new Date(mon); d.setDate(d.getDate() + dayOff); d.setHours(h, 0, 0, 0); return d; };
  const key = d => d.toISOString().slice(0, 13) + ':00Z';
  const slots = (days, from, to) => { const out = []; days.forEach(d => { for (let h = from; h < to; h++) out.push(key(at(d, h))); }); return out; };
  // next week too so "best times" is never empty late in the week
  DB.availability = [
    { id: 1, team_id: 1, user_id: 'u-fear', slots: slots([1, 2, 3, 5, 8, 9, 10], 19, 23) },
    { id: 2, team_id: 1, user_id: 'u-kai', slots: slots([1, 3, 5, 6, 8, 10], 18, 22) }
  ];
  const soon = new Date(); soon.setDate(soon.getDate() + 2); soon.setHours(19, 0, 0, 0);
  const ago = new Date(); ago.setDate(ago.getDate() - 3); ago.setHours(20, 0, 0, 0);
  DB.scrims = [
    { id: 71, team_id: 1, starts_at: soon.toISOString(), opponent: 'Night Owls', maps: 'Lotus, Ascent', format: '2 maps, 24 rounds', notes: 'Lobby by Fear', status: 'Planned' },
    { id: 72, team_id: 1, starts_at: ago.toISOString(), opponent: 'Red Fox', maps: 'Bind', status: 'Done' }
  ];
  const t = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
  DB.matches.push(
    { id: 2, date: t(3), event: 'Scrim', type: 'Scrim', opponent: 'Red Fox', map: 'Bind', rounds_won: 8, rounds_lost: 13, atk_won: 3, atk_lost: 9, def_won: 5, def_lost: 4, pistols_won: 0, scrim_id: 72, source: 'riot',
      rounds: 'LLWLLWLLLLWL'.split('').concat('WWLWLWLLW'.split('')).map((c, i) => ({ n: i + 1, w: c === 'W', side: i < 12 ? 'A' : 'D', end: i === 6 ? 'det' : 'elim' })) },
    { id: 3, date: t(6), event: 'Scrim', type: 'Scrim', opponent: 'Blue Jays', map: 'Lotus', rounds_won: 13, rounds_lost: 6, atk_won: 7, atk_lost: 5, def_won: 6, def_lost: 1, pistols_won: 2 },
    { id: 4, date: t(9), event: 'Premier', type: 'Official', opponent: 'Night Owls', map: 'Ascent', rounds_won: 11, rounds_lost: 13, atk_won: 6, atk_lost: 6, def_won: 5, def_lost: 7, pistols_won: 1 },
    { id: 5, date: t(12), event: 'Scrim', type: 'Scrim', opponent: 'Grey Wolves', map: 'Ascent', rounds_won: 13, rounds_lost: 10 },
    { id: 6, date: t(40), event: 'Scrim', type: 'Scrim', opponent: 'Grey Wolves', map: 'Bind', rounds_won: 9, rounds_lost: 13 }
  );
  DB.player_stats.push({ id: 90, date: t(6), map: 'Lotus', player: 'Kairo', kills: 22, deaths: 11 }, { id: 91, date: t(6), map: 'Lotus', player: 'Fear', kills: 15, deaths: 14 });
  DB.map_pool = [{ id: 1, team_id: 1, map: 'Lotus', status: 'Main pick', notes: 'Our best map — A executes' }, { id: 2, team_id: 1, map: 'Bind', status: 'Ban' }];
  DB.game_plans = [
    { id: 81, team_id: 1, opponent: 'Night Owls', match_date: iso(soon), scrim_id: 71, maps: 'Lotus, Ascent', their_tendencies: '- 5-man **B rush** on attack pistol\n- Slow rotations to A', comp: 'Lotus: Raze, Omen, Fade, Killjoy, Viper', attack_plan: 'Default A main, fast hit when they rotate B.', anti_strat: 'If they rush B pistol, stack 3 B with Killjoy setup.', published: true },
    { id: 82, team_id: 1, opponent: 'Secret Team', match_date: t(-5), maps: 'Bind', notes: 'Draft', published: false }
  ];
  const w601 = DB.work_on.find(w => w.id === 601); w601.date = t(10); w601.seen = [{ date: t(6), source: 'Scrim vs Blue Jays' }, { date: t(3), source: 'Scrim vs Red Fox' }];
  DB.work_on.push({ id: 604, team_id: 1, date: t(20), source: 'Scrim vs Grey Wolves', area: 'Positioning', player: 'Fear', issue: 'Holding the same off-angle every round on B.', tip: 'Change spots after you get a kill.', priority: 'Medium', status: 'Fixed', fixed_at: t(8), seen: [], approved: true },
                  { id: 605, team_id: 1, date: t(25), source: 'Scrim vs Grey Wolves', area: 'Comms', player: 'Fear', issue: 'Calls are late after trading.', tip: 'Say the call before re-peeking.', priority: 'Low', status: 'Open', came_back: true, fixed_at: t(15), seen: [{ date: t(4), source: 'Scrim' }], approved: true });
})();
(function () {
  const DB = window.__MOCKDB__;
  ['matches', 'player_stats', 'utility_usage', 'reviews', 'comp_notes'].forEach(t => (DB[t] || []).forEach(r => { if (r.team_id == null) r.team_id = 1; }));
  DB.profiles.push({ id: 'u-ana', email: 'ana@x.com', display_name: 'Ana', ign: null, role: 'Flex', is_coach: false, staff_role: 'Analyst', approved: true, visibility: {}, created_at: '2026-11-12', discord: 'ana_analyst', team_id: 1 });
  DB.matches.push({ id: 50, team_id: 2, date: '2026-11-11', event: 'Premier', type: 'Official', opponent: 'Night Owls', map: 'Haven', rounds_won: 13, rounds_lost: 11 },
                  { id: 51, team_id: 2, date: '2026-11-09', event: 'Scrim', type: 'Scrim', opponent: 'XRG', map: 'Lotus', rounds_won: 7, rounds_lost: 13 });
  DB.player_stats.push({ id: 95, team_id: 2, date: '2026-11-11', map: 'Haven', player: 'newguy', kills: 20, deaths: 15, hs_kills: 6 });
  DB.reviews.push({ id: 590, team_id: 2, date: '2026-11-11', title: 'Team Two vs Night Owls', map: 'Haven', vod: 'https://youtu.be/abc', summary: 'Good retakes' });
  DB.map_pool.push({ id: 9, team_id: 2, map: 'Haven', status: 'Main pick' });
})();
(function () {
  const DB = window.__MOCKDB__;
  const iso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const t1 = DB.teams.find(t => t.id === 1); Object.assign(t1, { public_slug: 'xrg', public_enabled: true, public_bio: 'NA Valorant team chasing VCT.', public_links: { twitter: 'https://x.com/xrg', show_results: true }, active_maps: ['Abyss', 'Ascent', 'Bind', 'Haven', 'Lotus', 'Sunset', 'Corrode'] });
  const fear = DB.profiles.find(p => p.id === 'u-fear'); Object.assign(fear, { riot_id: 'Fear#NA1', rank: 'Diamond 2', rank_rr: 40, peak_rank: 'Ascendant 1', rank_updated: iso(1) });
  const kai = DB.profiles.find(p => p.id === 'u-kai'); Object.assign(kai, { riot_id: 'Kairo#777', rank: 'Ascendant 2', peak_rank: 'Immortal 1', rank_updated: iso(3) });
  DB.rank_history = [{ id: 1, team_id: 1, user_id: 'u-fear', date: iso(20), rank: 'Diamond 1', rr: 30 }, { id: 2, team_id: 1, user_id: 'u-fear', date: iso(10), rank: 'Diamond 1', rr: 80 }, { id: 3, team_id: 1, user_id: 'u-fear', date: iso(1), rank: 'Diamond 2', rr: 40 }];
  DB.timeout_cards = [{ id: 1, team_id: 1, category: 'Anti-strat', title: 'Night Owls B rush', body: 'Stack 3 B, KJ setup, Viper molly main.', sort: 0 }];
  DB.lineups = [{ id: 1, team_id: 1, created_by: 'u-coach', title: 'Viper A main molly', agent: 'Viper', ability: 'Snake Bite', map: 'Lotus', side: 'Attack', site: 'A', purpose: 'Stops defuse on default plant', stand: 'A main left corner', aim: 'Top of the pillar, jump throw', link: 'https://youtu.be/QnBTE-UVpX4?t=100' },
                { id: 2, team_id: 1, created_by: 'u-fear', title: 'Sova recon B site', agent: 'Sova', ability: 'Recon Bolt', map: 'Bind', side: 'Attack', site: 'B', stand: 'B long box', aim: 'Antenna, 1 bounce' }];
  DB.lineup_learned = [{ lineup_id: 1, user_id: 'u-fear', team_id: 1 }];
  DB.aim_logs = [5, 4, 3, 2, 1].map((n, i) => ({ id: 10 + i, team_id: 1, user_id: 'u-fear', date: iso(n * 3), kind: 'Aim Lab', scenario: 'Gridshot', score: 80000 + i * 3000 }))
    .concat([{ id: 20, team_id: 1, user_id: 'u-fear', date: iso(2), kind: 'Deathmatch', scenario: 'DM kills', score: 32 }, { id: 21, team_id: 1, user_id: 'u-kai', date: iso(4), kind: 'Range', scenario: 'Range hard 30', score: 24 }, { id: 22, team_id: 1, user_id: 'u-kai', date: iso(1), kind: 'Range', scenario: 'Range hard 30', score: 27 }]);
  DB.skill_progress = [{ id: 1, team_id: 1, user_id: 'u-fear', skill: 'Initiator:flashtime', status: 'I can do it', verified: true }, { id: 2, team_id: 1, user_id: 'u-fear', skill: 'Everyone:trade', status: 'Practising', verified: false }];
  DB.comms_recordings = [{ id: 1, team_id: 1, date: iso(3), title: 'Scrim vs Red Fox — Bind comms', opponent: 'Red Fox', map: 'Bind', link: 'https://youtu.be/QnBTE-UVpX4', ratings: { clarity: 3, brevity: 2, calm: 4, info: 3, calls: 2 }, notes: '## Where comms broke down\n- 1:23 — three people talking at once on the B retake\n- 4:10 — no number on the callout', published: true },
                         { id: 2, team_id: 1, date: iso(1), title: 'Draft comms', published: false, ratings: {} }];
  DB.one_on_one = [{ id: 1, team_id: 1, player_id: 'u-fear', author_id: 'u-coach', kind: 'Goal', body: 'Get first deaths under 15% this month.', done: false, created_at: iso(5) + 'T12:00:00Z' },
                   { id: 2, team_id: 1, player_id: 'u-fear', author_id: 'u-fear', kind: 'Note', body: 'I feel rushed on attack.', done: false, created_at: iso(2) + 'T12:00:00Z' }];
  DB.guides.push({ id: 99, section: 'comms', title: 'Clean comms: how to make our comms flow', body: '**The goal:** everyone hears what they need.\n\n## 1. The call format\n- "Two B main"', sort: 5 });
  // riot + review stats (features3)
  const rv = (DB.reviews || []).find(r => r.team_id === 1) || null;
  if (rv) DB.player_stats = (DB.player_stats || []).concat([
    { id: 9001, team_id: 1, date: rv.date, map: 'Haven', player: 'Fear', agent: 'Sova', rounds: 23, kills: 20, deaths: 14, assists: 9, kd: 1.43, hs_kills: 9, hs_kill_pct: 0.45, first_kills: 3, first_deaths: 1, trades: 4, traded_deaths: 3, review_id: rv.id, source: 'VOD', notes: 'Great trades' },
    { id: 9002, team_id: 1, date: rv.date, map: 'Haven', player: 'Kairo', agent: 'Jett', rounds: 23, kills: 11, deaths: 19, assists: 2, kd: 0.58, hs_kills: 4, hs_kill_pct: 0.36, first_kills: 2, first_deaths: 5, trades: 1, traded_deaths: 2, review_id: rv.id, source: 'VOD' }]);
  window.__REVIEW_WITH_STATS__ = rv && rv.id;
  DB.riot_links = [{ user_id: 'u-fear', riot_name: 'Fear', riot_tag: 'NA1', region: 'na', synced_at: iso(0) + 'T10:00:00Z' }];
  DB.riot_summary = [{ user_id: 'u-fear', team_id: 1, games: 12, wins: 7, kills: 190, deaths: 160, kd: 1.19, hs_pct: 0.24, acs: 231, adr: 148, win_pct: 0.583, top_agents: [{ agent: 'Jett', games: 6, role: 'Duelist' }, { agent: 'Raze', games: 4, role: 'Duelist' }, { agent: 'Neon', games: 2, role: 'Duelist' }], main_role: 'Duelist', rank: 'Ascendant 2', rank_rr: 41, peak_rank: 'Immortal 1', updated_at: iso(0) + 'T10:00:00Z' }];
  DB.riot_matches = [
    { id: 1, user_id: 'u-fear', team_id: 1, match_id: 'm1', started_at: iso(0) + 'T02:00:00Z', map: 'Lotus', queue: 'competitive', agent: 'Sova', won: true, rounds_won: 13, rounds_lost: 9, rounds: 22, score: 5200, kills: 19, deaths: 14, assists: 8, headshots: 30, bodyshots: 80, legshots: 10, damage: 3300, first_kills: 3, first_deaths: 2, trades: 4, traded_deaths: 2,
      detail: { players: [{ n: 'Fear', team: 'Red', me: true, agent: 'Sova', k: 19, d: 14, a: 8, s: 5200 }, { n: 'Enemy1', team: 'Blue', agent: 'Jett', k: 22, d: 15, a: 3, s: 6000 }] } },
    { id: 2, user_id: 'u-fear', team_id: 1, match_id: 'm2', started_at: iso(1) + 'T02:00:00Z', map: 'Bind', queue: 'custom', agent: 'Fade', won: false, rounds_won: 10, rounds_lost: 13, rounds: 23, score: 4100, kills: 14, deaths: 17, assists: 6, headshots: 20, bodyshots: 70, legshots: 8, damage: 2800, first_kills: 1, first_deaths: 3, trades: 2, traded_deaths: 4, detail: { players: [] } },
    { id: 3, user_id: 'u-kai', team_id: 1, match_id: 'm3', started_at: iso(1) + 'T02:00:00Z', map: 'Bind', queue: 'custom', agent: 'Jett', won: false, rounds: 23, kills: 9, deaths: 17, assists: 1, headshots: 5, bodyshots: 50, legshots: 9, damage: 2000, first_kills: 1, first_deaths: 3, trades: 1, traded_deaths: 1, detail: {} }];
})();
// ---- analytics / practice / VOD rounds test data
(function () {
  const DB = window.__MOCKDB__;
  const t = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  DB.practice_plans = [];
  const mk = (pattern, extra) => pattern.split('').map((c, i) => Object.assign({ n: i + 1, w: c === 'W', side: (i < 12) ? 'A' : 'D', end: c === 'W' ? 'elim' : (i < 12 ? (i % 3 ? 'defuse' : 'time') : (i % 2 ? 'det' : 'elim')),
    fk: i % 3 === 0 ? 'us' : 'them', fkp: i % 3 === 0 ? 'Fear' : 'enemy', buy: i === 0 || i === 12 ? 'pistol' : i === 1 || i === 13 ? 'eco' : i % 4 === 0 ? 'semi' : 'full', obuy: i === 0 || i === 12 ? 'pistol' : i === 2 ? 'eco' : 'full', site: i < 12 && c === 'W' ? (i % 2 ? 'A' : 'B') : undefined }, extra ? extra(i) : {}));
  DB.matches.push(
    { id: 7, team_id: 1, date: t(2), event: 'Scrim (from Riot)', type: 'Scrim', opponent: 'Night Owls', map: 'Haven', rounds_won: 10, rounds_lost: 13, source: 'riot', riot_match_id: 'r-7', rounds: mk('LWLLWLLWLLWL' + 'WWLWLWLLWLL') },
    { id: 8, team_id: 1, date: '2026-11-12', event: 'Scrim', type: 'Scrim', opponent: 'Night Owls', map: 'Lotus', rounds_won: 13, rounds_lost: 7, rounds: mk('WLWWLWWLWWLW' + 'WWLWWLWW', i => i < 5 ? { t: 60 + i * 110 } : {}) }
  );
  DB.player_stats.push(
    { id: 300, team_id: 1, date: t(20), map: 'Bind', player: 'Fear', rounds: 22, kills: 14, deaths: 17, assists: 4, first_kills: 2, first_deaths: 6, trades: 1, traded_deaths: 2 },
    { id: 301, team_id: 1, date: t(15), map: 'Ascent', player: 'Fear', rounds: 20, kills: 13, deaths: 16, assists: 3, first_kills: 1, first_deaths: 5, trades: 2, traded_deaths: 3 },
    { id: 302, team_id: 1, date: t(4), map: 'Haven', player: 'Fear', rounds: 23, kills: 19, deaths: 15, assists: 6, first_kills: 4, first_deaths: 2, trades: 3, traded_deaths: 5 },
    { id: 303, team_id: 1, date: t(2), map: 'Haven', player: 'Fear', rounds: 23, kills: 18, deaths: 14, assists: 5, first_kills: 3, first_deaths: 2, trades: 2, traded_deaths: 4 },
    { id: 304, team_id: 1, date: t(2), map: 'Haven', player: 'Silverbodyguard', rounds: 23, kills: 12, deaths: 18, assists: 2, first_kills: 1, first_deaths: 4, trades: 0, traded_deaths: 1 });
  DB.work_on.push({ id: 650, team_id: 1, date: t(8), source: 'Scrim analytics', area: 'Opening duels', player: 'Fear', issue: 'Too many first deaths without util.', tip: 'Entry with util first.', priority: 'High', status: 'Working on it', seen: [], approved: true, metric: 'First deaths per round', target: 0.12 });
})();
(function () { const DB = window.__MOCKDB__; const m = new Date(); m.setHours(12, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  const ws = m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0') + '-' + String(m.getDate()).padStart(2, '0');
  DB.practice_plans = [{ id: 1, team_id: 1, week_start: ws, title: 'Pistols week', published: true, items: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].flatMap(d => [{ day: d, minutes: 15, focus: 'Warm-up', detail: 'Aim routine' }, { day: d, minutes: 45, focus: 'Pistol rounds', detail: 'Script pistols', area: 'Pistols' }, { day: d, minutes: 20, focus: 'Opening duels: Fear', detail: 'Util first', player: 'Fear' }]) }];
})();
(function () { const DB = window.__MOCKDB__; const t = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const ag = { 300: 'Sova', 301: 'Sova', 302: 'Fade', 303: 'Fade', 304: 'Omen' }; DB.player_stats.forEach(r => { if (ag[r.id]) r.agent = ag[r.id]; });
  [['Kairo', 'Jett', 21, 15, 4, 2], ['Nova', 'Killjoy', 15, 16, 1, 3], ['Zeph', 'Viper', 13, 17, 2, 2]].forEach(([pl, a, k, d, fk, fd], i) => DB.player_stats.push({ id: 320 + i, team_id: 1, date: t(2), map: 'Haven', player: pl, agent: a, rounds: 23, kills: k, deaths: d, assists: 5, first_kills: fk, first_deaths: fd, trades: 2, traded_deaths: 4, match_id: 7 }));
  DB.player_stats.find(r => r.id === 303).match_id = 7; DB.player_stats.find(r => r.id === 304).match_id = 7;
  DB.checkins = (DB.checkins || []).concat([{ id: 900, user_id: 'u-fear', team_id: 1, day: t(0), minutes: 60 }, { id: 901, user_id: 'u-fear', team_id: 1, day: t(1), minutes: 45 }]);
})();
(function () { const DB = window.__MOCKDB__;
  DB.comms_recordings = (DB.comms_recordings || []).concat([
    { id: 41, team_id: 1, date: '2026-11-12', title: 'Fear — late rotate calls', notes: '## Fix\n- 2:10 call the rotate earlier', ratings: { clarity: 3 }, published: true, for_player: 'Fear' },
    { id: 42, team_id: 1, date: '2026-11-12', title: 'Kairo — over-talking', notes: 'Less talk mid-fight', ratings: { clarity: 2 }, published: true, for_player: 'Kairo' },
    { id: 43, team_id: 1, date: '2026-11-11', title: 'Draft notes', notes: 'not ready', published: false }]);
})();
(function () { const DB = window.__MOCKDB__; const t = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  DB.tryouts = [{ id: 1, team_id: 1, name: 'Viperking', riot_id: 'Viperking#NA1', role: 'Controller', rank: 'Immortal 1', status: 'Trial', trial_start: t(5), scores: { aim: 4, comms: 3 }, notes: 'Good smokes' },
    { id: 2, team_id: 1, name: 'Silverbodyguard', role: 'Sentinel', status: 'Applied', scores: {} }];
  DB.team_goals = [{ id: 1, team_id: 1, title: 'Win 60% of scrim maps', metric: 'Map win %', target: 60, since: t(30), deadline: t(-40), created_at: t(30) },
    { id: 2, team_id: 1, title: 'Pistols over 50%', metric: 'Pistol win %', target: 50, since: t(30), deadline: t(-10), created_at: t(30) },
    { id: 3, team_id: 1, title: 'Qualify for open qualifiers', deadline: t(-60), notes: 'Sign-ups open in December', created_at: t(30) }];
  DB.app_errors = [{ id: 1, created_at: new Date().toISOString(), message: 'TypeError: x is undefined', stack: 'at foo (app.js:1)', url: '#/maps', ua: 'Chrome' }];
  // kill positions on the Riot-imported game (id 7, Haven): [round, ms, us, killer, victim, kx, ky, vx, vy, weapon, first]
  const m7 = DB.matches.find(m => m.id === 7);
  if (m7) { const ks = []; for (let r = 0; r < 23; r++) { const us = (r * 7) % 3 !== 0; ks.push([r, 8000, us ? 1 : 0, us ? ['Kairo', 'Nova', 'Zeph'][r % 3] : 'OwlA', us ? 'OwlB' : ['Kairo', 'Nova', 'Zeph'][r % 3], 1000 + r * 180, -2000 + r * 150, 1500 + r * 160, -1500 + r * 120, 'Vandal', 1]);
      ks.push([r, 21000, us ? 0 : 1, us ? 'OwlC' : 'Nova', us ? 'Zeph' : 'OwlC', -3000 + r * 200, 2500 - r * 90, -2600 + r * 170, 2900 - r * 110, 'Phantom', 0]); } m7.kills = ks; }
  DB.opponent_scouts = [{ id: 1, team_id: 1, opponent: 'Night Owls', riot_ids: ['OwlA#NA1', 'OwlB#1234', 'Ghost#NA1'], created_at: t(1),
    data: { scouted_at: new Date(Date.now() - 86400000).toISOString(), players: [
      { riot_id: 'OwlA#NA1', rank: 'Diamond 2', peak: 'Ascendant 1', games: 10, wins: 6, kd: 1.21, acs: 241, hs: 0.27, fk: 14, fd: 8, main_role: 'Duelist', agents: [{ name: 'Jett', games: 6, wins: 4 }, { name: 'Raze', games: 4, wins: 2 }], maps: [{ name: 'Haven', games: 4, wins: 3 }, { name: 'Lotus', games: 3, wins: 1 }],
        events: [['Haven', 'A', 'k', 1200, -1800, 1500, -1400, 1, 'Jett'], ['Haven', 'D', 'd', -2500, 2300, -2100, 2600, 0, 'Jett'], ['Lotus', 'A', 'k', 300, 400, 600, 800, 0, 'Raze']] },
      { riot_id: 'OwlB#1234', rank: 'Diamond 1', games: 9, wins: 4, kd: 0.92, acs: 188, hs: 0.21, fk: 4, fd: 6, main_role: 'Controller', agents: [{ name: 'Omen', games: 7, wins: 3 }], maps: [{ name: 'Haven', games: 2, wins: 1 }], events: [['Haven', 'D', 'k', 800, -900, 1100, -500, 0, 'Omen']] },
      { riot_id: 'Ghost#NA1', error: "Riot couldn't find this player" }],
      together: [{ map: 'Haven', score: '13-9', won: true, queue: 'premier', at: new Date().toISOString(), comp: [{ agent: 'Jett', name: 'OwlA#NA1' }, { agent: 'Omen', name: 'OwlB#1234' }, { agent: 'Sova' }, { agent: 'Killjoy' }, { agent: 'Breach' }] }] } }];
})();
