# Deploy WePuzzle to Vercel with Supabase

WePuzzle remains a local, single-player game when no cloud variables are present. Adding Supabase turns on the global leaderboard and private real-time multiplayer rooms.

## 1. Create the database

1. Create a project at [Supabase](https://supabase.com/dashboard).
2. Open **SQL Editor**, paste the contents of [`supabase/migrations/001_online_features.sql`](../supabase/migrations/001_online_features.sql), and run it once.
3. Open **Authentication → Providers → Anonymous Sign-Ins** and enable anonymous users.
4. Open the project's **Connect** dialog and copy:
   - Project URL
   - Publishable key (`sb_publishable_…`). A legacy anon key also works.

The migration enables Row Level Security. Scores can be read publicly, players can only insert scores under their own anonymous user ID, and room state/realtime messages are limited to room members.

> Never expose a Supabase secret key or `service_role` key in this frontend. Only use the publishable key.

## 2. Push the project to Git

Create a GitHub, GitLab, or Bitbucket repository and push this project. Do not commit `.env.local`.

For local testing, create `.env.local`:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Then run:

```bash
npm install
npm run dev
```

## 3. Import it into Vercel

1. In [Vercel](https://vercel.com/new), import the Git repository.
2. Set **Framework Preset** to **Other**.
3. Set **Build Command** to `npm run build:vercel`.
4. Leave **Output Directory** blank. Nitro writes Vercel's Build Output API structure directly to `.vercel/output`.
5. Add these environment variables for Production, Preview, and Development:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

6. Click **Deploy**.

The Vercel build uses vinext with Nitro's Vercel preset. Nitro emits the server and static assets into Vercel's native `.vercel/output` structure.

## 4. Finish Supabase URL settings

After the first Vercel deployment:

1. Copy the Vercel production URL.
2. In Supabase, open **Authentication → URL Configuration**.
3. Set **Site URL** to the production URL.
4. Add the production URL and your Vercel preview pattern to **Redirect URLs** if you later add email or social login.

Anonymous sign-in does not redirect today, but setting the URL now avoids surprises when accounts are added later.

## 5. Smoke-test the live app

1. Finish a small puzzle and confirm its score appears on **Leaderboard**.
2. Open **Multiplayer**, create a room, and copy the code.
3. Open the site in a private/incognito window, choose a different name, and join the code.
4. Move a puzzle piece in either window. It should move in the other window, and both players should appear in the room bar.
5. Test the game at a phone-sized viewport and use the `−` / `+` zoom controls.

## Troubleshooting

- **“Setup needed”**: check both `VITE_SUPABASE_*` variables in Vercel, then redeploy. Vite embeds public variables at build time.
- **Anonymous sign-in error**: enable Anonymous Sign-Ins in Supabase Authentication settings.
- **Room not found or expired**: room codes expire after 24 hours by design. Create a new room.
- **`column reference "room_id" is ambiguous`**: run `supabase/migrations/002_fix_join_room_ambiguity.sql` in the SQL Editor. Fresh projects using the updated first migration already include this fix.
- **No Multiplayer leaderboard tab data**: run `supabase/migrations/003_multiplayer_leaderboard.sql` in the SQL Editor, then finish a new multiplayer puzzle.
- **Players are visible but their boards diverge**: run `supabase/migrations/004_reliable_room_sync_and_closing.sql`. This enables database-backed Realtime fallback and the host-only room-closing function.
- **Leaderboard is local**: the app fell back safely because Supabase was unavailable or the migration was not run.
- **Realtime stays reconnecting**: confirm the two `realtime.messages` policies exist and the user joined through the lobby.

Official references: [vinext deployment via Nitro](https://github.com/cloudflare/vinext#other-platforms-via-nitro), [Supabase anonymous users](https://supabase.com/docs/guides/auth/auth-anonymous), [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization), and [Vercel build settings](https://vercel.com/docs/builds).
