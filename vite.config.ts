import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Expose Ecove Supabase runtime envs (ECOVE_SUPABASE_*) to the browser at build time.
// We re-publish them as VITE_PUBLIC_* so the client bundle can read them via
// import.meta.env. The service role key is intentionally NOT exposed.
const supabaseUrl =
  process.env.ECOVE_SUPABASE_URL ?? process.env.VITE_PUBLIC_SUPABASE_URL ?? "";
const supabasePublishableKey =
  process.env.ECOVE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

export default defineConfig({
  vite: {
    define: {
      "import.meta.env.VITE_PUBLIC_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        supabasePublishableKey,
      ),
    },
  },
});
