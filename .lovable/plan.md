

# Ecove Multi-Vendor Marketplace — Build Plan

A Jumia/Konga-style Nigerian marketplace with three roles (Customer, Vendor, Admin), built on TanStack Start + Supabase + edge deployment. Brand: orange `#f68b1f`, charcoal `#1a1a1a`, Sora + Plus Jakarta Sans, lowercase "ecove" wordmark, Naira (₦) throughout.

## How this build will be sequenced

You asked for everything at once. I'll deliver it in **one large initial build** covering the full surface area, then we iterate. Realistically the first build will have:
- ✅ All database tables + RLS + seed data
- ✅ All routes/pages scaffolded with the correct layouts and brand styling
- ✅ Auth (3 roles), product browsing, cart, checkout, vendor product CRUD, admin moderation — all functional end-to-end
- 🟡 Paystack integrated in **test mode** (you'll provide a test secret key when prompted)
- 🟡 Some admin analytics charts, advanced filters, and reports will be functional but minimal — we'll polish in follow-ups
- 🟡 Background jobs run as **pg_cron** (flash sale expiry, low stock alerts) — not `setInterval`
- 🟡 Rate limiting via Postgres counters (lighter than Redis but works on edge)

## Tech foundation

- **Framework:** TanStack Start (already set up)
- **DB + Auth + Storage + Email:** Lovable Cloud (Supabase under the hood)
- **State:** Zustand (cart, wishlist), TanStack Query (server data)
- **Forms:** React Hook Form + Zod
- **Payments:** Paystack via REST API + webhook server route (HMAC-SHA512 verified)
- **Background jobs:** pg_cron
- **Fonts:** Sora + Plus Jakarta Sans via Google Fonts

## Brand & design system

- Orange `#f68b1f`, dark accent `#d4720e`, charcoal `#1a1a1a`, success green `#1e8a44`
- All colors as HSL tokens in `index.css` and Tailwind theme
- Lowercase wordmark logo: "eco" white + "ve" orange
- Money formatter: `₦1,234,567.89`
- Date formatter: `Jun 15, 2025`
- Order status badges with the specified color scheme
- Skeleton loaders on every async section, react-hot-toast for mutations

## Database (Supabase + RLS)

All ~25 tables from your spec, plus:
- `user_roles` table with `app_role` enum (`customer`, `vendor`, `admin`, `super_admin`) — roles stored separately from profiles for security
- `has_role()` security-definer function used by all RLS policies
- RLS policies scoped per role (customer sees own data, vendor sees own products/orders, admin sees all)
- Triggers for: auto-create profile on signup, auto-generate order numbers (`ECO-YYMMDD-XXXXXX` using `gen_random_bytes`), auto-update `updated_at`
- Seed: 1 admin user, 12 categories with emoji icons, global 10% commission rule, default site settings

## Authentication

- **Customer:** `/login`, `/register`, `/forgot-password`, `/reset-password` — Supabase email/password with email verification before checkout
- **Vendor:** `/vendor/login`, `/vendor/register` (3-step application form: Business Info → Bank Details → Terms), pending status until admin approves
- **Admin:** `/admin` login, role-gated via `has_role()` check
- Guest checkout supported (email + name + phone collected)
- Route guards via TanStack `_authenticated` and role-based pathless layouts (`_customer`, `_vendor`, `_admin`)

## Storefront pages

Homepage with all 10 sections (top bar, orange nav, category strip, trust strip, hero with category sidebar + carousel + 3 promo cards, category grid, flash sales w/ countdown, featured grid, vendor CTA, footer), Search with sidebar filters, Product Detail with gallery + variants + reviews + tabs, Vendor Store, Cart, Checkout (Paystack), Order Confirmation, Track Order with step progress, My Account (4 tabs), Order Detail, Category pages, static pages (Privacy, Returns, Vendor Policies).

## Vendor dashboard

`/vendor/dashboard` with charcoal sidebar — Overview, Products (CRUD with image upload, variants, specs, flash sale toggle), Orders (with ship/deliver actions), Earnings (with payout requests), Inventory (stock levels), Reports (revenue chart), My Store (banner/logo edit), Profile (bank details), Settings.

## Admin panel

`/admin` with charcoal sidebar — Dashboard with stats + charts, Vendors (approve/reject/suspend), Products (moderation queue), Orders, Payouts (approve/reject/mark-paid with proper balance accounting), Commissions (global/category/vendor rules), Categories, Banners, Coupons, Reviews moderation, Customers, Analytics, Settings.

## Server logic (server functions + server routes)

- Server functions for all authenticated mutations (cart sync, checkout init, vendor product CRUD, admin actions)
- Server routes at `/api/webhooks/paystack` for HMAC-verified webhooks (idempotency via Postgres unique constraint on event ID)
- Server route at `/api/payments/paystack` to initialize transactions
- Server route at `/api/health`
- Image upload via Supabase Storage server function
- Commission resolution function with the 5-level priority you specified
- Order number generation using `crypto.getRandomValues()`

## Payment flow

1. Checkout server fn validates cart, stock, email verification, coupon → creates `pending/unpaid` order
2. Calls Paystack `initialize` → returns `authorization_url`
3. Customer redirected to Paystack hosted checkout (test mode)
4. Webhook receives `charge.success` → HMAC verify → idempotency check → mark paid → decrement stock → credit `pendingBalance` per vendor → increment coupon usage → enqueue confirmation emails
5. Customer lands on `/order/confirm`

## Email notifications (Lovable Email)

Welcome, email verification, password reset, order confirmation, vendor new-order alert (per-vendor only their items), order shipped, order delivered, vendor application approved/rejected, product approved/rejected, payout status updates. All as React Email templates with Ecove branding.

## Background jobs (pg_cron)

- Every 5 min: expire flash sales
- Every 1 hour: low-stock vendor notifications
- Every 12 hours: recalc vendor average ratings
- (Sessions handled by Supabase Auth automatically)

## Security

- Roles in separate table with `has_role()` SECURITY DEFINER
- HMAC-SHA512 verification on Paystack webhooks
- Webhook idempotency via Postgres
- Postgres-based rate limiting on login, register, forgot-password, checkout, coupon validate, review submit, image upload
- Zod validation on every server function input
- Email verification gate on logged-in user checkout
- Role-based route guards + RLS as defense in depth

## What you'll need to provide later

- **Paystack test secret key** — I'll prompt you for this when wiring up the payment integration
- **Email domain** — for branded emails (optional; default Lovable sender works for testing)
- **Cloudinary** is replaced by Supabase Storage (no key needed)

## Out of scope for v1 (we'll add after the foundation works)

- Flutterwave (Paystack only for v1; Flutterwave is a quick add later)
- WhatsApp chat buttons (placeholder links only)
- Advanced analytics charts (basic ones in v1)
- Fraud detection (`FraudFlag` table created, surfacing UI in a follow-up)
- Live typeahead search (basic search in v1, debounced typeahead added next)
- Mobile hamburger polish (responsive works, polish pass after)

