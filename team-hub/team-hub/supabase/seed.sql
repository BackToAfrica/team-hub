-- Starter content: drills, agent counters, patch notes and the comms guide.
-- Run once AFTER schema.sql. Running it again adds duplicates (except agents).

insert into public.drills (role, block, minutes, drill, how, success, sort) values
('Everyone','Warm-up','10','Aim trainer or Range bots','Range bots on medium/hard with strafing on, or 2–3 short aim-trainer scenarios (clicking + tracking). Keep your crosshair at head height between targets.','Steady accuracy; crosshair rarely drops toward the floor between targets.',0),
('Everyone','Warm-up','5','Counter-strafe drill','In the Range, strafe left/right and only shoot once fully stopped (tap the opposite key). 50 reps each direction.','Your first bullet lands where you aimed after stopping.',1),
('Everyone','Mechanics','15','Deathmatch with ONE focus','One Deathmatch or Team Deathmatch. Pick one focus: crosshair placement at head level around corners, or first-bullet accuracy. Ignore the score.','You can name your focus and rate yourself 1–5 on it.',2),
('Everyone','Review','10','Death review','Watch 3 of your deaths from yesterday. For each ask: Should I have taken that fight? Could I be traded? Did I have info?','One takeaway written in your check-in.',3),
('Everyone','Games','60+','Ranked or team stack','Play with comms on and use your role habit (below) every round.','You used your role habit in most rounds.',4),
('Duelist','Role drill','10','Entry timing','In a custom game, run your entry onto each site of the team''s maps: util in (yours or a teammate''s flash), then swing. Repeat each entry 5 times.','You swing right as the util lands, not before or after.',5),
('Duelist','Role drill','5','Peek types','Practice jiggle peeks (for info) and wide swings (to take the fight) vs. Range bots or a friend.','You know before peeking whether it''s for info or for a kill.',6),
('Duelist','Habit','In games','First-contact calls','The moment you make contact, call how many, where, and what util they used, even if you die.','Teammates can trade you because they know where the fight is.',7),
('Duelist','Study','10','Pro duelist POV','Watch 10 minutes of a pro duelist on a map in your pool. Note how they use the space their team''s util creates.','One entry idea to try in scrims.',8),
('Initiator','Role drill','15','Utility lineups','In a custom, learn 2 new recon/flash/stun lineups per week for the team''s maps: one for the execute, one for retake or post-plant. Repeat each 10 times.','You can throw each one in under 3 seconds without thinking.',9),
('Initiator','Role drill','5','Flash timing with duelist','In a custom with your duelist: you flash, they swing. Count the timing out loud together.','Flash pops as they swing and the enemy is blind.',10),
('Initiator','Habit','In games','Info call after util','Every time your util gets info, call it in one short sentence: how many, where, and whether they''re hit.','Short calls that come right after the util lands.',11),
('Initiator','Study','10','Pro initiator POV','Watch a pro initiator on one of your maps. Note when they use util: round start, mid-round, or retake.','One util timing to copy.',12),
('Controller','Role drill','15','Smoke placements','In a custom, place execute smokes, retake smokes and a default smoke for every site on the team''s maps, from where you''ll actually stand.','Smokes land in the right spot every time, fast.',13),
('Controller','Role drill','5','Smoke timing','Learn how long your smokes last. Practice saving one for later in the round.','You still have a smoke for the retake or post-plant when it matters.',14),
('Controller','Habit','In games','Call the clock','Track round time and call key moments: ''40 seconds, we need to go'', ''smoke is dropping''.','The team never runs out of time without a plan.',15),
('Controller','Study','10','Pro controller POV','Watch a pro controller on one of your maps. Note where they stand to smoke and when they play off their own smokes.','One smoke or position to add.',16),
('Sentinel','Role drill','15','Site setups','In a custom, build 2 setups per site on the team''s maps: one standard, one off-meta. Check they''re hard to spot and hard to destroy.','Each setup gets info or a kill and isn''t easy to clear.',17),
('Sentinel','Role drill','5','Flank watch','Practice placing util that watches the flank on attack, and staying alive late in the round.','The team gets warned of flanks; you''re alive for post-plant.',18),
('Sentinel','Habit','In games','Anchor calls','When holding a site alone, call early and fall back to delay instead of dying first.','You buy time for the retake instead of dying for nothing.',19),
('Sentinel','Study','10','Pro sentinel POV','Watch a pro sentinel on one of your maps. Note how they change setups after losing a round.','One setup to try in scrims.',20),
('Flex','Role drill','15','Second-role practice','Do the role drills for whichever role you''re filling this week (see that role''s drills).','You''re comfortable on 2 roles.',21),
('IGL','Prep','10','Scrim review','Pick 3 lost rounds from the last scrim. Watch them and write one adjustment.','One clear change to bring to the team.',22),
('IGL','Habit','In games','Mid-round calls','In team-stack games, make one mid-round call each round (rotate, fake, hold, go). Keep it short.','Teammates react without asking you to repeat.',23),
('IGL','Prep','Weekly','New set play','Plan one new execute or default per week for a map in your pool, with each player''s util job written down.','It gets run in scrims that week.',24);

insert into public.agent_counters (agent, role, brings, weaknesses, beat_attack, beat_defense, counters, smokes, flash, recon, stall, entry, heal) values
('Astra','Controller','Stars placed pre-round → smokes, Gravity Well pull, Nova Pulse concuss, Nebula; ult Cosmic Divide wall.','Slow to set up and stands still in Astral form; star placement shows her plan; once stars are used she can''t re-smoke fast.','Read her star spots early — they show where they''ll hit. Push through the edge of a Gravity Well, not the centre. After her stars are spent, retake through open space.','Fake a hit to pull stars to one site, then go the other way. Catch her body while she''s in Astral form (she''s frozen). Break through Cosmic Divide with sound info, not peeks.','Fast hits before stars are set; lurks to catch her in Astral; info agents (Sova/Fade) to find her body.','Y','N','N','Y','N','N'),
('Breach','Initiator','Aftershock, Flashpoint (through walls), Fault Line stun, Rolling Thunder ult.','All util has wind-up and comes through walls from predictable spots; no smokes or info; weak once util is used; needs teammates to follow it.','Hold off-angles away from the walls he flashes through, or play deeper so the flash pops where you aren''t. Play back from Fault Line lanes and swing after the stun ends. Once his flashes are gone they have no blind.','Plant for post-plant spots that aren''t in straight Fault Line lanes; don''t group in a line. Bait his ult with one player and trade.','Spacing (don''t stack in a line), off-angles, Veto Interceptor, play off-site and retake.','N','Y','N','Y','N','N'),
('Brimstone','Controller','3 sky smokes (one-time), Stim Beacon, Incendiary, Orbital Strike ult.','Smokes can''t be re-used — count them (3); range limited to near spawn/site; no info; molly lineups are predictable.','Wait out his smokes and retake after they fade; count smokes — after 3 they''re blind on site.','Bait his smokes early with fake pressure, then hit when he''s out. Push through the edge of his molly, not the centre.','Patience, fakes, info to see smoke timings, double-controller comps.','Y','N','N','N','N','N'),
('Chamber','Sentinel','Trademark trap, Headhunter Sheriff, Rendezvous teleport, Tour de Force Operator ult.','Relies on Op/Sheriff angles and teleport escape; once TP is used or his anchor is found he''s stuck; very little team utility.','Flash/stun/smoke his long angle before peeking; he''ll TP out — hold his TP anchor spot. Trade him quickly; he can''t help teammates with util.','Find and break his TP anchor, then play his angle with util (molly, stun) so he can''t hold it. Smoke his Op lane and fight close.','Smokes on his Op lane, flashes, molly/stun, close-range fights.','N','N','N','Y','N','N'),
('Clove','Controller','Ruse smokes (can smoke after death), Meddle decay, Pick-Me-Up, Not Dead Yet self-revive ult.','Smokes are short and Clove plays aggressive; Not Dead Yet only lasts if they get a kill/assist — otherwise they die again; decay isn''t damage.','Expect smokes even after you kill them. Trade Clove fast; when they ult, isolate and kill again before they get a kill. Don''t fight while decayed — back off and re-peek.','Clove anchors aggressively — punish over-peeks with crossfires. After their smokes run out, push.','Crossfires, trading, holding them off after revive.','Y','N','N','N','N','N'),
('Cypher','Sentinel','Trapwires, Cyber Cages, Spycam, Neural Theft ult.','Setup is static and can be shot/destroyed; once found, he''s blind; slow to rotate setup.','On attack he uses a flank trip and cam for lurk info — check your flank and shoot the cam.','Clear trips with util or gunfire, shoot the Spycam, then hit; or hit the other site — he can''t move setup quickly. Use drones/dogs to clear trips.','Raze, Sova/Fade/Skye/KAY-O to clear util, shooting trips, fast hits on the other site.','N','N','Y','Y','N','N'),
('Deadlock','Sentinel','GravNet, Sonic Sensor (sound), Barrier Mesh, Annihilation ult.','Sensor triggers on sound only; Barrier Mesh can be shot down; no blind and no smokes.','When she attacks: hold away from her GravNet landing and shoot down mesh on retake.','Shift-walk past Sonic Sensors; shoot the corners of Barrier Mesh to open it; spread out vs GravNet.','Shift-walking, gunfire on mesh, spacing.','N','N','Y','Y','N','N'),
('Fade','Initiator','Haunt (reveal eye), Prowlers (nearsight), Seize tether, Nightfall ult.','Haunt and Prowlers can be shot; reveals need line of sight; weak duelist once util is out.','Shoot Haunt the instant it lands, or play behind cover so it doesn''t see you; face and shoot Prowlers.','Shoot Haunt; hide from Nightfall behind walls; after her util is gone, re-take space.','Shooting util, Veto Interceptor, playing behind hard cover.','N','Y','Y','N','N','N'),
('Gekko','Initiator','Wingman (can plant/defuse), Dizzy blind, Mosh Pit, Thrash ult.','Creatures can be shot; he needs to pick up globs to reuse them — deny the pickup; util-dependent.','Shoot Dizzy/Wingman; hold the glob spot after his util lands to punish the pickup.','Shoot Wingman going for defuse; kill Thrash.','Shooting creatures, holding glob spots.','N','Y','N','N','N','N'),
('Harbor','Controller','High Tide wall, Cove (bulletproof shield sphere), Cascade, Reckoning ult.','Cove shield breaks with damage; walls are temporary; limited ways to stop pushes once used.','Shoot Cove to break it; wait out walls, then re-take.','Push after walls fade; break Cove before planting/defusing.','Damage on Cove, patience.','Y','N','N','N','N','N'),
('Hush','Duelist','Flow (longest dash, short delay + anchor), Flashbulb (redirectable flash), Displacement (redirectable pull), Telekinesis passive (grabs dropped guns/spike at range), Suspension ult (steerable orb lifts & disarms).','Very high skill ceiling; Flow has a short delay and an anchor that shows where she''s going; Veto''s Interceptor destroys Flashbulb, Displacement and Suspension; the pull doesn''t stun by itself.','Hold the landing spot of her Flow, not the entrance. Stand close to teammates so a pull doesn''t isolate you. Turn from her flash — it can curve, so play deeper angles.','Watch for her steering Suspension onto the spike to stop defuses — clear her first, then defuse.','Veto (hard counter), close holds at dash landings, spacing.','N','Y','N','N','Y','N'),
('Iso','Duelist','Double Tap shield (on kill/orb), Undercut vulnerable, Contingency bulletproof wall, Kill Contract 1v1 ult.','Shield only after he gets a kill/orb; Contingency is slow and predictable; no team utility.','Don''t give him the first kill — trade him with a double swing (the first bullet pops his shield). Util his angle before peeking.','Double-swing him; don''t take his ult duel at bad HP.','Double swings, trading, util before peek.','N','N','N','N','Y','N'),
('Jett','Duelist','Tailwind dash, Updraft, Cloudburst smokes, Blade Storm ult; often the Operator.','Needs dash to be safe; after dashing she''s committed; small smokes.','Hold close angles on her dash landing; stun/slow before she dashes; after dash, swing her.','Smoke/flash her Op lane; push close where she can''t dash out cleanly.','Stuns/concuss (Breach, KAY/O), close holds, flashes vs Op.','N','N','N','N','Y','N'),
('KAY/O','Initiator','ZERO/point knife (suppress + reveal), FLASH/drive, FRAG/ment, NULL/cmd ult.','Knife reveals him too and can be shot; in ult he goes down instead of dying — kill him again or hold the revive.','Shoot the knife; turn from flashes; in ult, kill him and hold his body so he can''t be revived.','Suppression stops your util — use guns and play angles; shoot the knife.','Shooting knife, holding revive.','N','Y','Y','Y','N','N'),
('Killjoy','Sentinel','Turret, Alarmbot, Nanoswarm, Lockdown ult.','Util turns off if she''s too far away; turret/bot can be shot; Lockdown device can be destroyed.','When she attacks with turret: shoot turret first.','Make her leave her site (hit the other site / pull her away) so her util deactivates; shoot turret/bot; destroy Lockdown.','Raze, Sova/Fade reveals, gunfire on util, hitting her off-site.','N','N','Y','Y','N','N'),
('Miks','Controller','Waveform map-targeted smokes, M-pulse (2 charges: concuss OR heal), Harmonize combat stim, Bassquake forward-cone ult (knockback, deafen, slow).','Kit is split between smokes/heals/stun — if he heals he loses concuss; Bassquake is a forward cone only; support needs coordination.','Bait the M-pulse; fight from the side or behind vs Bassquake; kill him first to remove smokes and heals.','Push after his concuss is used for healing; kill him first to remove smokes and heals.','Spread out, flank angles, kill-priority on him.','Y','N','N','Y','N','Y'),
('Neon','Duelist','High Gear sprint/slide, Fast Lane walls, Relay Bolt stun, Overdrive ult.','Loud and fast but predictable; energy limited; walls block vision both ways.','Hold the end of Fast Lane / slide spots; dodge Relay Bolt; pre-aim close.','Don''t over-peek her walls; hold slide spots close.','Close holds, traps (Cypher/KJ), stuns.','N','N','N','Y','Y','N'),
('Omen','Controller','Dark Cover smokes, Paranoia blind, Shrouded Step TP, From the Shadows ult.','Paranoia is a visible line — dodge or turn; TP has a sound/shade; one-way smokes can be spotted.','Listen for TP and hold its spots; turn from Paranoia; watch smoke edges for one-ways.','Push through smoke edges with info; listen for TP.','Sound discipline, info agents, Veto.','Y','Y','N','N','N','N'),
('Phoenix','Duelist','Curveball flash, Blaze wall, Hot Hands, Run It Back ult.','Flash is short and comes from predictable corners; selfish kit; ult means he comes back.','Turn from curveball corners; after killing him in ult, hold his return marker.','Turn from curveball corners; trade him fast.','Disciplined angles, trading.','N','Y','N','N','Y','Y'),
('Raze','Duelist','Boom Bot, Blast Pack satchels, Paint Shells, Showstopper ult.','Loud satchels; Boom Bot can be shot; damage util can be avoided by moving; needs space.','Shoot Boom Bot; hold above/behind satchel landing spots; spread out vs nade.','Shoot Boom Bot; spread out vs nade.','Spacing, shooting bots.','N','N','N','N','Y','N'),
('Reyna','Duelist','Leer (nearsight eye), Devour, Dismiss, Empress ult.','Needs kills to use her kit; Leer can be shot; no team utility.','Shoot Leer; don''t give her the first kill; trade her instantly.','Shoot Leer; trade her instantly.','Trading, util before peek.','N','Y','N','N','Y','Y'),
('Sage','Sentinel','Barrier wall, Slow Orb, Healing Orb, Resurrection.','Wall breaks with damage; slows wear off; Resurrection is long and visible.','Break the wall with damage; hold where the rez will happen.','Break the wall with damage; hold the rez spot.','Damage on wall, holding rez spot.','N','N','N','Y','N','Y'),
('Skye','Initiator','Trailblazer dog, Guiding Light flash (voice cue), Regrowth heal, Seekers ult.','Flash has a voice cue — turn; dog can be shot; heal is slow.','Turn on her flash voice line; shoot the dog.','Turn on her flash voice line; shoot the dog.','Disciplined turns, shooting dog.','N','Y','Y','N','N','Y'),
('Sova','Initiator','Recon Bolt, Owl Drone, Shock Bolt, Hunter''s Fury ult.','Recon and drone can be shot; relies on lineups from predictable spots.','Shoot Recon immediately or stay out of its line of sight; shoot drone.','Learn his lineup spots and hold them; shoot recon.','Shooting recon, playing out of LOS.','N','N','Y','N','N','N'),
('Tejo','Initiator','Stealth Drone, Special Delivery concuss, Guided Salvo missiles, Armageddon ult.','Missiles are predictable and avoidable by moving; drone can be shot.','Move off Salvo marks; shoot drone.','Move off Salvo marks; shoot drone.','Movement, shooting drone.','N','N','Y','Y','N','N'),
('Veto','Sentinel','Crosscut teleport node, Chokehold trap, Interceptor (destroys util in an area), Evolution ult (debuff immunity, regen).','Interceptor is a placed device — bait it with cheap util before throwing key util; in Evolution util won''t stop him, so use gunfights.','Throw cheap util first to bait Interceptor, then the real util. Find his Crosscut node.','Break his node and Interceptor before executing; bait Interceptor with cheap util.','Bait util, gunfire on devices.','N','N','N','Y','N','N'),
('Viper','Controller','Toxic Screen wall, Poison Cloud, Snake Bite molly, Viper''s Pit ult; fuel meter.','Needs fuel; wall/orb positions predictable; decay makes you vulnerable; in Pit she''s stuck in it.','Push when her fuel is low / wall drops; clear Pit with numbers and util.','Learn post-plant molly lineups and tap-defuse to bait them; push through wall gaps.','Patience, util to clear Pit.','Y','N','N','Y','N','N'),
('Vyse','Sentinel','Razorvine, Shear wall, Arc Rose flash, Steel Garden ult (jams primaries).','Arc Rose can be shot; Razorvine is visible; Steel Garden only jams primaries.','Shoot Arc Rose; walk around/shoot Razorvine; in Steel Garden fight with your secondary.','Shoot Arc Rose and Razorvine before you commit; have a good secondary.','Shooting util, having a good secondary.','N','Y','N','Y','N','N'),
('Waylay','Duelist','Lightspeed dash, Refract (return beacon), Saturate hinder, Convergent Paths ult.','Refract shows where she''ll return; after Lightspeed she''s committed.','Hold her Refract return spot; dodge Saturate.','Hold her Refract return spot.','Holding return spots.','N','N','N','N','Y','N'),
('Yoru','Duelist','Gatecrash TP, Fakeout decoy, Blindside flash, Dimensional Drift ult.','TP tether is visible/audible; decoy can be shot; flash bounces — turn.','Shoot tethers; listen for TP; turn from bouncing flash.','Listen for TP; shoot tethers.','Sound discipline, shooting tethers.','N','Y','N','N','Y','N')
on conflict (agent) do nothing;

insert into public.patch_notes (patch, date, category, item, effect, changed) values
('13.09','2026-10-27','Agent','Hush','New','New Duelist added. Uses telekinesis to redirect her utility and suspend enemies.'),
('13.09','2026-10-27','Agent','Clove','Nerf','Pick-me-up bonus speed 15% → 10%. Killing Clove after Not Dead Yet now gives the killer an ult point and a signature refresh.'),
('13.09','2026-10-27','Weapon','Warden','Buff','Smoother recoil on the first few bullets; less spread on 2nd and 3rd bullets.'),
('13.08','2026-10-13','Map pool','Bind, Corrode in · Ascent, Split out','Map pool','Corrode reworked: faster defender rotations, reworked Mid, A site plant zone changed to weaken post-plants from A Link. Pool: Abyss, Bind, Corrode, Haven, Lotus, Summit, Sunset.'),
('13.00','2026-06-23','Agent','Cypher','Buff','Trapwire windup 0.9s → 0.7s.'),
('13.00','2026-06-23','Agent','Killjoy','Buff','Turret fire rate +50%, Nanoswarm duration 4s → 5s, Alarmbot speed +50%.'),
('13.00','2026-06-23','Agent','Veto','Buff','Interceptor reclaim cooldown 30s → 20s; Crosscut range 24m → 30m, arming time 1.5s → 0.75s.'),
('13.00','2026-06-23','Agent','Sage','Buff','Healing Orb self-heal 50 → 100.'),
('13.00','2026-06-23','Agent','Deadlock','Buff','GravNet cooldown 60s → 50s.'),
('13.00','2026-06-23','Agent','Sova, Fade, Skye, Breach, KAY/O','Buff','Signature ability cooldown 60s → 50s.'),
('13.00','2026-06-23','Agent','Gekko','Buff','Ability cooldown after reclaiming buddies 20s → 15s.'),
('13.00','2026-06-23','Map pool','Summit (new), Sunset in · Fracture, Pearl out','Map pool','New map Summit added to Competitive.'),
('12.09','2026-05-12','Agent','Neon','Nerf','No speed bonus while airborne with High Gear; fuel only regenerates from kills while her ultimate is active.'),
('12.09','2026-05-12','Weapon','Shotguns','Nerf','All shotguns less accurate while moving, jumping and on ropes; Bucky close-range damage down; Shorty fire rate 3.33 → 3.0.'),
('12.00','2026-01-06','Agent','Breach','Buff','Flashpoint projectile 20% faster; Fault Line wider (7.5m → 8m).'),
('12.00','2026-01-06','Agent','Harbor','Buff','Storm Surge no longer needs line of sight, faster windup (0.8s → 0.6s), slow 0.6s → 2s; Reckoning slow 0.6s → 2s.'),
('12.00','2026-01-06','Agent','Tejo','Mixed','Special Delivery concuss 4s → 2.5s but now deals 20–35 damage; Stealth Drone now fully reveals but pulse radius 30m → 16m.'),
('12.00','2026-01-06','Agent','Vyse','Buff','Steel Garden radius 26m → 28m.'),
('12.00','2026-01-06','Agent','Sage','Change','Healing Orb can heal allies whose lower body is blocked by geometry.'),
('12.00','2026-01-06','Weapon','Bandit','New','New 600-credit sidearm: 8-round mag, one-tap headshots, medium wall penetration.'),
('12.00','2026-01-06','Map pool','Breeze (reworked) in · Sunset out','Map pool','Breeze returns with a full rework.');

insert into public.guides (section, title, body, sort) values ('comms', 'Team Comms Guide', 'Good comms are short, come at the right moment, and use words everyone understands the same way. Learn the calls in this guide by heart; use them in every scrim and ranked stack.

## The 6 comms rules

1. **Info first, feelings never.** Say what you saw, not how you feel about it. "Two A Main" helps; "how did he hit that" costs your team a second of attention.
2. **Short calls.** Five words or fewer while a fight is happening. Save explanations for the buy phase.
3. **One voice mid-round.** Once the round is live, the IGL makes the decisions. Everyone else only calls info, unless the IGL is dead.
4. **Dead players get one sentence, then go quiet.** Give your last info ("Jett Heaven, 50 HP, no dash") and stop talking. Players who are still alive need a clear channel.
5. **Use the team''s words, the same way every time.** One name per spot on each map, and the code words in the dictionary below. If two players call the same spot different names, the call is useless.
6. **Reset between rounds.** Win or lose: one adjustment, the next plan, then move on. No arguing about the last round until after the match.

## How to make a call

Every info call follows the same order: **How many → Where → What state → What you''re doing.** Drop any part you don''t know, but keep the order so teammates know what''s coming.

| Part | Examples |
| --- | --- |
| How many | "One", "Two", "Three plus", "Five, Bingo" |
| Where | A callout name: "A Main", "Garage", "Heaven" |
| What state | "Tagged 80", "One-shot", "No dash", "Op", "Used flash" |
| What you''re doing | "Falling back", "Holding", "Swinging", "Need trade" |

**Good calls:**

- "Two A Main, one tagged 80, falling back."
- "Jett Heaven, one-shot, no dash."
- "Op mid. Don''t peek."

**Bad calls:**

- "They''re like, over there by the thing." (no number, no callout)
- "I hit him!" (who? how much? where?)
- A long story about how you died while the round is still going.

## Comms dictionary

Team code words are ours. Change or add to them, but everyone has to use them the same way. Standard terms are what most Valorant players already say.

### Team code words (IGL commands)

| Call | Means | What you do |
| --- | --- | --- |
| **Calm** | Everyone freeze. | Stop moving, stop peeking, hold your angle, stay quiet until the IGL speaks. |
| **Bingo** | All five enemies are located. | Say where they are once, briefly. The IGL decides whether to hit, rotate or play for picks. |
| **Go / Execute** | Hit the site now with the planned utility. | Throw your assigned util, then entry in the order the plan says. |
| **Default** | Spread out and take map control; no site yet. | Play your default spot, gather info, don''t take fights you can''t trade. |
| **Fake** | Make noise and use some util at one site, then hit the other. | Fake players use util and sound; everyone else waits for the call to go. |
| **Rotate \[site\]** | Move to the named site now. | Rotate by the fastest safe path and call when you arrive. |
| **Stack \[site\]** | Put extra players on one site. | Go where the IGL sends you; the other site plays for time. |
| **Hold** | Don''t push. Keep your angle until told otherwise. | Stay put even if it gets quiet. |
| **Reset** | The plan is off. Fall back to safe positions. | Back off, regroup, wait for the new call. |
| **Play time** | We''re ahead on players or the clock. Don''t take risky fights. | Hold angles and let them come to you. |

### Info calls

| Call | Means |
| --- | --- |
| **Contact** | I see enemies right now (follow with number and spot). |
| **Lit / Tagged \[HP\]** | I damaged someone; say how much HP they have left. |
| **One-shot / Low** | That enemy is almost dead. |
| **Last seen \[spot\]** | Where an enemy was before you lost sight. Not where they are now. |
| **Clear** | Checked a spot: nobody there. |
| **Lurk** | One enemy (or ours) is alone, away from the team, waiting for a flank. |
| **Flank** | Someone is coming from behind. |
| **Op \[spot\]** | An enemy Operator is holding that spot. Don''t peek it dry. |
| **Util used** | Name the ability: "Jett dash used", "Sova ult down". |
| **Ult ready** | Say it in the buy phase so the IGL can plan around it. |

### Fight calls

| Call | Means |
| --- | --- |
| **Trade me** | I''m about to take a fight; be right behind me. |
| **Swing together** | Peek at the same time so they can''t win two fights in a row. |
| **Jiggle** | Quick peek for info, not to fight. |
| **Mine** | I''m taking this angle or this enemy; don''t double-peek it. |
| **Flash out / Flashing \[spot\]** | I''m about to throw a flash; turn away or swing off it. |
| **Smoke dropping** | One of our smokes is about to fade; adjust now. |

### Spike calls

| Call | Means |
| --- | --- |
| **Spike down \[spot\]** | The spike is planted; say where (default, A Main side, etc.). |
| **Tapping** | An enemy started defusing but may stop. Go check or spray. |
| **Stick / Full defuse** | Keep defusing no matter what; teammates cover. |
| **Half** | Defuse is at half; you can stop and restart from there. |
| **Retake** | We''re taking the site back together after a plant. Group up first. |
| **Save** | This round can''t be won. Stay alive and keep your gun. |

### Economy calls

| Call | Means |
| --- | --- |
| **Full buy** | Rifles, armor and full util for everyone. |
| **Eco / Save** | Spend little or nothing so next round is a full buy. |
| **Force** | Buy what you can now, even if it''s not ideal. |
| **Bonus** | After winning a pistol, keep cheap guns and hold the money. |
| **Drop \[gun\]** | Ask for, or offer, a weapon to a teammate who''s short on credits. |

## Who talks when

A round has phases, and each one has different rules for who speaks.

1. **Buy phase (everyone, briefly).** The IGL calls the buy and the plan: "Full buy, default, A exec if we get Main." Players say their credits only if they can''t afford the call, and say ult status if they have it.
2. **Early round (info only).** Call contact, utility the enemy used, and anything clear. No opinions about the plan.
3. **Mid-round (IGL leads).** The IGL makes the call: go, rotate, fake, hold. Everyone else keeps info to one line. If the IGL says **Calm**, everyone stops talking and moving.
4. **Post-plant (one voice on the spike).** Whoever can see or hear the spike calls it: "Tapping", "Stick", "Half". Everyone else calls only positions.
5. **Retake (group, then go).** The IGL calls who goes where: "Wait for three. Smoke Heaven, flash and go on my call." Nobody walks in alone.
6. **After you die (one line, then silent).** Your killer''s spot, HP and utility, then quiet. Watch your teammates'' screens and only speak if you see something they can''t.
7. **Between rounds (5 seconds).** One thing to fix, said calmly by the IGL, then the next buy. Save arguments for the VOD review.

## Grading trial players'' comms

Rate each trial player 1–5 on each line after a scrim. Comms habits are hard to fix later, so they deserve as much weight as aim.

| What to look for | 1 = poor | 5 = great |
| --- | --- | --- |
| Uses the call formula | Vague, no numbers or callouts | Number, spot, state, action every time |
| Speed | Calls late or after the fight | Calls the moment they see contact |
| Uses our words | Makes up their own names | Uses team callouts and code words |
| Quiet when dead | Talks over the living players | One line, then silent |
| Follows the IGL | Argues mid-round or ignores calls | Acts on calls instantly, including Calm |
| Tone after losses | Tilts, blames, sighs | Calm, gives one useful fix |
| Asks for help | Stays quiet when lost | "Need trade", "Where''s rotate?" |

If a trial player scores 3 or below on **Follows the IGL** or **Tone after losses**, take it seriously. Those two are the hardest to coach.

## Comms drills

1. **Callout quiz (5 min, before scrims).** The IGL names a spot on a map; everyone types the team''s name for it in chat. Any mismatch gets fixed on the spot, so the whole team uses one name per spot.
2. **5-word death calls (in ranked stacks).** After every death, say your killer''s info in five words or fewer, then go silent. A teammate counts any extra words.
3. **Calm reps (in customs).** During a practice execute, the IGL calls "Calm" at random. Anyone who keeps moving or talking does the rep again.
4. **Bingo hunts (in scrims).** On defense, try to locate all five attackers before they hit a site. Count how often you get to Bingo; aim for more each week.
5. **Comms review.** Record team comms in one scrim a week. Listen back to two rounds you lost and pick out one late call, one vague call and one time people talked over each other.
', 0);

insert into public.announcements (title, body, pinned) values ('Welcome to Team Hub', 'Do your check-in every day: it takes 30 seconds and it''s how the coach sees who''s putting in the work. Your stats, the playbook and the comms guide are all in the menu.', true);
