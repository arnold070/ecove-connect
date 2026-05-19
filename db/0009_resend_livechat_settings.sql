-- 0009: Seed admin-configurable platform settings for Resend email
-- and Live Chat widget providers (Tawk.to, Crisp, Intercom).
--
-- All widget IDs are non-secret (they get embedded in client HTML by
-- their respective providers). RESEND_API_KEY is a secret.

insert into public.platform_settings (key, label, description, category, is_secret) values
  -- Resend transactional email
  ('RESEND_API_KEY', 'Resend API Key',
    'Resend API key for transactional email (starts with re_)', 'email', true),
  ('RESEND_FROM_EMAIL', 'Resend From Address',
    'Default From address for Resend (e.g. orders@yourdomain.com). Domain must be verified in Resend.',
    'email', false),

  -- Live chat widget
  ('LIVE_CHAT_PROVIDER', 'Live Chat Provider',
    'Which live chat widget to load on the storefront. One of: none, tawk, crisp, intercom.',
    'livechat', false),
  ('TAWK_PROPERTY_ID', 'Tawk.to Property ID',
    'Property ID from your Tawk.to dashboard (Admin → Channels → Chat Widget).',
    'livechat', false),
  ('TAWK_WIDGET_ID', 'Tawk.to Widget ID',
    'Widget ID from your Tawk.to dashboard (defaults to 1 if you have only one widget).',
    'livechat', false),
  ('CRISP_WEBSITE_ID', 'Crisp Website ID',
    'Website ID from Crisp (Settings → Setup instructions → Chatbox).',
    'livechat', false),
  ('INTERCOM_APP_ID', 'Intercom App ID',
    'Intercom workspace App ID (Settings → Installation → Web).',
    'livechat', false)
on conflict (key) do nothing;
