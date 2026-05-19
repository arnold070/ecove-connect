# Marketplace Core: Vendors → Products → Checkout → Payouts

Four delicate feature areas, built in one sequence so each phase unlocks the next. Every phase ships DB schema + RLS, server functions, and admin/vendor UI.

## Phase 1 — Vendor onboarding & KYC

**DB (`db/0006_vendors_kyc.sql`)**
- `vendors` (id, user_id unique, business_name, slug, phone, country, status: `draft|pending|approved|rejected|suspended`, rejection_reason, approved_at/by, created_at)
- `vendor_kyc_documents` (id, vendor_id, doc_type: `id_front|id_back|business_reg|tax_cert|address_proof`, storage_path, status, reviewer_note)
- Storage bucket `vendor-kyc` (private), RLS: vendor reads/writes own; admins read all
- RLS on `vendors`: owner can read/update draft; admin full access; public can read approved (name, slug only via view)
- `vendor_public` view exposing only safe fields

**Server fns (`src/lib/vendors.functions.ts`)**
- `getMyVendor`, `upsertVendorDraft`, `submitVendorForReview`, `uploadKycDocument` (signed URL), `listPendingVendors` (admin), `approveVendor` / `rejectVendor` (admin, writes audit row)

**UI**
- `/vendor/onboarding` — multi-step form (business info → KYC docs upload → review & submit), status banner
- `/vendor/index` gated: shows onboarding CTA until approved
- `/vendor/admin/approvals` — admin queue with doc preview, approve/reject with reason

## Phase 2 — Product listing & moderation

**DB (`db/0007_products.sql`)**
- `products` (id, vendor_id, title, slug, description, price_kobo, currency, category_id, subcategory, stock, status: `draft|pending|approved|rejected|archived`, rejection_reason, created_at)
- `product_images` (id, product_id, storage_path, sort_order, is_primary)
- Reuse existing `product-images` bucket
- RLS: vendor CRUD own drafts/pending; public reads only `status='approved'`; admin full

**Server fns (`src/lib/products.functions.ts`)**
- `createProduct`, `updateProductDraft`, `submitProductForReview`, `archiveProduct`
- `addProductImage` (signed URL), `reorderProductImages`
- `listMyProducts(status?)`, `listPendingProducts` (admin), `approveProduct` / `rejectProduct`
- Public: `listApprovedProducts({category, q, page})`, `getProductBySlug`

**UI**
- `/vendor/products/new` — full form with image upload + drag-reorder
- `/vendor/products` — tabs draft / pending / live / rejected
- `/vendor/admin/products/pending` — moderation queue
- Storefront `/` and `/p/$slug` swap from sample data → DB-backed approved products

## Phase 3 — Cart, checkout & Paystack payments

**DB (`db/0008_orders.sql`)**
- `carts` (id, user_id, created_at) + `cart_items` (cart_id, product_id, qty, unit_price_kobo)
- `orders` (id, buyer_id, status: `pending|paid|fulfilled|delivered|cancelled|refunded`, total_kobo, currency, paystack_ref, paid_at, shipping_address jsonb, created_at)
- `order_items` (order_id, product_id, vendor_id, qty, unit_price_kobo, subtotal_kobo, status per-item)
- RLS: buyer reads own orders; vendor reads order_items where they're the vendor; admin full

**Server fns + routes**
- `src/lib/cart.functions.ts`: `getMyCart`, `addToCart`, `updateQty`, `removeItem`, `clearCart`
- `src/lib/checkout.functions.ts`: `initializeCheckout` → creates pending order, calls Paystack `/transaction/initialize` (key from `platform_settings`), returns authorization_url + reference
- `src/routes/api/public/paystack-webhook.ts` — verifies `x-paystack-signature` HMAC-SHA512 with secret from `platform_settings`, marks order `paid`, decrements stock
- Idempotency: dedupe by `paystack_ref`

**UI**
- `/cart`, `/checkout` (address + summary), `/checkout/success?ref=...` (verifies & shows receipt)
- Header cart badge

## Phase 4 — Order lifecycle & payouts

**DB (`db/0009_payouts.sql`)**
- Add `order_items.fulfillment_status: pending|shipped|delivered|cancelled`, `tracking_ref`
- `vendor_ledger` (vendor_id, order_item_id, type: `sale|refund|payout|fee`, amount_kobo, balance_after, created_at)
- `payout_requests` (vendor_id, amount_kobo, status: `requested|approved|paid|rejected`, bank_details jsonb encrypted, processed_at/by, paystack_transfer_ref)
- DB function `vendor_balance(vendor_id)` summing ledger
- Trigger: on `orders.status='paid'` → insert `sale` ledger rows for each item (minus platform fee from `platform_settings.platform_fee_bps`)

**Server fns**
- Vendor: `markItemShipped`, `markItemDelivered`, `getMyEarnings`, `requestPayout`
- Admin: `listPayoutRequests`, `approvePayout` (calls Paystack Transfer API), `rejectPayout`
- Buyer: `confirmDelivery`, `requestRefund`

**UI**
- `/vendor/orders` — list of order_items for this vendor with status transitions
- `/vendor/earnings` — balance, ledger, "Request payout" dialog
- `/vendor/admin/payouts` — review queue
- `/account/orders` — buyer order history with confirm/refund

## Cross-cutting

- All admin actions write to existing `platform_settings_audit` pattern (extend with generic `admin_audit_log`)
- All money in **kobo** (NGN minor units), formatted via existing `currency.ts`
- Use existing `requireSupabaseAuth` + `assertAdmin` patterns
- Paystack/Stripe keys read at runtime via existing `getPlatformValue`
- Tests: extend `tests/` with one happy-path integration per phase (cart→checkout→webhook→ledger)

## Execution order

I will build **Phase 1 in this turn** (vendor onboarding + KYC end-to-end), then ask you to confirm before Phase 2, since each phase is itself substantial and you'll want to verify the UX before moving on.

---

## Status — Phase 3 in progress

- `db/0008_paystack_orders.sql` adds `payment_webhook_events` table, paid_at/access_code/auth_url columns, admin update RLS on order_items, and seeds `PAYSTACK_WEBHOOK_SECRET`, `PAYSTACK_CALLBACK_URL`, `PLATFORM_COMMISSION_BPS` into platform_settings.
- `src/lib/cart.functions.ts` — getMyCart / addToCart / updateCartItem / clearCart.
- `src/lib/checkout.functions.ts` — initializeCheckout (Paystack), verifyCheckout, listMyOrders, listOrdersAdmin, updateOrderStatusAdmin.
- `src/routes/api/public/paystack-webhook.ts` — HMAC-SHA512 verify + idempotent event log + marks order paid on `charge.success`.
- UI: `/cart`, `/checkout`, `/checkout/success`, `/vendor/admin/orders`.
- Cloudinary admin: storage category surfaces in `/vendor/settings` with a **Test Cloudinary** button (admin-only).
