# Ecove — database migrations

Supabase Cloud is managed by you (not by Lovable), so these SQL files are
**run by you** — they are NOT auto-applied.

## How to apply

### Option A — Supabase Dashboard (fastest)
1. Open https://supabase.com/dashboard/project/stynlkikhkpvzmmpvmri/sql/new
2. Paste the entire contents of `0001_init.sql`
3. Click **Run**

### Option B — Supabase CLI
```bash
mkdir -p supabase/migrations
cp db/0001_init.sql supabase/migrations/$(date +%Y%m%d%H%M%S)_init.sql
supabase link --project-ref stynlkikhkpvzmmpvmri
supabase db push
```

## After running the migration

1. **Auth providers** — Dashboard → Authentication → Providers
   - Enable **Email** (confirm-on-signup OFF for faster dev testing)
   - Enable **Google**, paste your OAuth client ID + secret
2. **Auth URLs** — Dashboard → Authentication → URL Configuration
   - Site URL: your preview URL (and later, your VPS URL)
   - Redirect URLs: add the same + `http://localhost:5173`
3. **Storage buckets** — Dashboard → Storage → New bucket
   - `product-images` — **public**
   - `vendor-logos` — **public**
   - `banner-images` — **public**
   - `kyc-documents` — **private**
4. **Make yourself admin**
   ```sql
   insert into public.user_roles (user_id, role)
   values ('<your-auth-user-id-from-auth.users>', 'admin');
   ```
