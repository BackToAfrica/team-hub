# Team Hub — setup guide (about 15 minutes, all free)

Team Hub is your team's app: players log in with Discord and claim their spot on your roster, do daily check-ins, see their stats, the playbook, scouting, the Comp Checker, VOD reviews and patch notes. You (the coach) approve players and choose exactly what each of them can see.

It runs on two free services:

- **Supabase**: logins and the database.
- **Vercel**: hosts the app so everyone can open it from a link and install it on their phone or computer.

You do steps 1–4 once. After that you just share the link.

---

## 1. Create the database (Supabase)

1. Go to **supabase.com** → *Start your project* → sign up (GitHub or email).
2. Click **New project**. Name it `team-hub`, set a database password (save it somewhere), pick the region closest to your team, and keep the **Free** plan. Wait ~1 minute while it sets up.
3. In the left menu open **SQL Editor** → **New query**.
4. Open `supabase/schema.sql` from this folder, copy everything, paste it in, and click **Run**. You should see "Success. No rows returned".
5. Click **New query** again, paste everything from `supabase/seed.sql`, and click **Run**. This adds the daily drills, all 30 agents' counters, the patch notes and your comms guide.

### Login settings

6. Left menu → **Authentication** → **Sign In / Providers** → **Email**. Turn **Confirm email** OFF if you want players to get in straight away without a confirmation email. Free Supabase only sends a few emails per hour. Click **Save**.

### Copy the two keys

7. Left menu → **Project Settings** (gear) → **API** (or **Data API** / **API Keys**). Copy:
   - **Project URL**, which looks like `https://abcdefghijk.supabase.co`
   - the **anon public** key, a long string starting with `eyJ...`. (Newer projects may show it as the "publishable" key `sb_publishable_...`, which also works.)

   Never use the `service_role` / secret key in the app.

### Turn on Discord login

Players sign in with Discord, and their Discord name links them to their spot on the roster.

8. Still in **SQL Editor** → **New query**: paste everything from `supabase/discord-roster.sql` and click **Run**.
9. Go to **discord.com/developers/applications** → **New Application** → name it after your team → **Create**.
10. Open **OAuth2** in the left menu:
    - Copy the **Client ID**.
    - Click **Reset Secret** and copy the **Client Secret**.
    - Under **Redirects**, click **Add Redirect** and paste `https://YOUR-PROJECT.supabase.co/auth/v1/callback` (your Supabase Project URL + `/auth/v1/callback`). Click **Save Changes**.
11. In Supabase → **Authentication** → **Sign In / Providers** → **Discord**: switch it **on**, paste the Client ID and Client Secret, and click **Save**.

## 2. Put the keys in the app

Open `config.js` in any text editor (Notepad is fine) and replace the two `PASTE_...` values with what you just copied. You can also change `TEAM_NAME` to your team's name. Save the file.

## 3. Put the app online (Vercel)

**Easiest way, through GitHub:**

1. Make a free account at **github.com** → click **+** (top right) → **New repository** → name it `team-hub` → **Private** → **Create repository**.
2. On the new repo page click **uploading an existing file**. Drag in **everything inside this folder** (index.html, app.js, config.js, styles.css, sw.js, manifest.webmanifest, the `icons` folder…). Click **Commit changes**.
3. Go to **vercel.com** → sign up with your GitHub account → **Add New… → Project** → pick `team-hub` → **Import**.
4. Leave everything as it is (Framework preset: *Other*, no build command) → **Deploy**.
5. After ~30 seconds you get a link like `https://team-hub-xxxx.vercel.app`. That's your app.

**No-GitHub alternative:** go to **app.netlify.com/drop** and drag this whole folder onto the page. You get a link instantly; make a free Netlify account to keep it.

### Tell Supabase your app's address

6. Back in Supabase → **Authentication** → **URL Configuration**: set **Site URL** to your app link (e.g. `https://team-hub-xxxx.vercel.app`). Under **Redirect URLs**, add the same link followed by `/**` (e.g. `https://team-hub-xxxx.vercel.app/**`). Click **Save**. Discord login sends people back here.
7. In Vercel → your project → **Settings** → **Deployment Protection**: set **Vercel Authentication** to **Disabled** and click **Save**. Otherwise everyone gets a Vercel login page instead of your app.

## 4. Make yourself the coach

Open your app link and click **Continue with Discord**. **The very first account to sign in becomes the coach automatically** and has full control.

## 5. Add your players

First, in **Coach panel → Members → Roster slots**, add a row for each player and trialist: their name, in-game name, **Discord username**, role, IGL and trial. You can also import your sheet's Roster tab; add a "Discord username" column to it.

Then send your players the link. Each one:

1. opens it and taps **Continue with Discord**;
2. if the coach put their exact Discord username on a slot, **they're linked to it automatically** and they're in. Otherwise they see the roster, tap their own name to **claim** it, and you confirm it in **Members** (it shows "Claims <name>" with a **Confirm** button). A slot can only be claimed by one account, and you can **Unlink** a wrong claim;
3. **installs it**: on iPhone, Safari → Share → *Add to Home Screen*; on Android, Chrome → ⋮ → *Install app*; on PC/Mac, Chrome or Edge → the install icon at the right end of the address bar.

In **Coach panel → Members → Accounts** you can then, for each person:

- check their **In-game name** matches the name used in your stats sheet. That's how their stats get linked to them; trial players can be written as `Name *Trial` in the sheet;
- set **role**, **IGL**, **Trial player**;
- tick what they **can see**: check-in, my stats, team stats, playbook, comms, reviews, scouting, Comp Checker, patch notes. **Set what everyone sees** changes all players at once.

## 6. Keep it up to date from your coaching sheet

In **Coach panel → Content & import**:

- **Import from your coaching workbook**: download your Team Hub sheet as an Excel file (.xlsx) and pick it. The app reads the tabs it knows (Player Stats, Utility Usage, Matches, Set Plays, Pistol Rounds, Opponent Scouting, Comp Notes, Agent Counters, Patch Notes, Daily Routine). For each tab you choose **Replace** (best: the sheet is the master copy) or **Add**. A single tab exported as `.csv` works too.
- **Edit content**: add or change anything by hand, including VOD reviews (paste the key takeaways and the full review text) and the comms guide.
- **Announcements**: post messages to the team; pin the important ones.
- **Check-ins**: see who did their drills each day, read their takeaways, and **Download CSV** to paste into the sheet's Daily Check-in tab.

## Good to know

- **Cost:** both free plans are plenty for a team. A free Supabase project pauses after a week with no activity; daily check-ins keep it awake, and if it does pause you can un-pause it from the Supabase dashboard.
- **Privacy:** players only ever see what you allow. Each player sees only their own check-ins. The rules are enforced by the database itself, not just hidden in the app.
- **Updating the app:** replace the files in your GitHub repo (or drag the folder onto Netlify again) and Vercel redeploys automatically.
- **Email login:** off by default; Discord is the only way in. To also allow email and password, set `ALLOW_EMAIL_LOGIN: true` in `config.js`.
