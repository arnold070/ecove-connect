-- =============================================================================
-- Categories v2: collapse to 3 top-level categories with subcategories.
--   1. Gadgets    → phones, computing, electronics, gaming, accessories
--   2. Fashion    → mens, womens, kids, shoes, bags
--   3. Services   → repairs, delivery, installation, consulting, cleaning
-- =============================================================================

set search_path = public;

-- 1. Detach products from any category we are about to remove. RLS-safe because
--    products.category_id is "on delete set null".
delete from public.categories;

-- 2. Insert top-level categories.
insert into public.categories (name, slug, icon, position) values
  ('Gadgets',  'gadgets',  '📱', 1),
  ('Fashion',  'fashion',  '👗', 2),
  ('Services', 'services', '🛠️', 3);

-- 3. Insert subcategories using the parents above.
with parents as (
  select id, slug from public.categories where slug in ('gadgets','fashion','services')
)
insert into public.categories (parent_id, name, slug, icon, position)
select p.id, sub.name, sub.slug, sub.icon, sub.position
from (
  -- Gadgets
  values
    ('gadgets',  'Phones & Tablets',     'phones-tablets',     '📱', 1),
    ('gadgets',  'Computing',            'computing',          '💻', 2),
    ('gadgets',  'Electronics & TV',     'electronics-tv',     '📺', 3),
    ('gadgets',  'Gaming',               'gaming',             '🎮', 4),
    ('gadgets',  'Audio & Accessories',  'audio-accessories',  '🎧', 5),
  -- Fashion
    ('fashion',  'Men''s Fashion',       'mens-fashion',       '👔', 1),
    ('fashion',  'Women''s Fashion',     'womens-fashion',     '👗', 2),
    ('fashion',  'Kids & Babies',        'kids-fashion',       '🧒', 3),
    ('fashion',  'Shoes & Sneakers',     'shoes',              '👟', 4),
    ('fashion',  'Bags & Accessories',   'bags-accessories',   '👜', 5),
  -- Services
    ('services', 'Repairs',              'repairs',            '🔧', 1),
    ('services', 'Delivery & Logistics', 'delivery',           '🚚', 2),
    ('services', 'Installation',         'installation',       '🛠️', 3),
    ('services', 'Consulting',           'consulting',         '💼', 4),
    ('services', 'Cleaning',             'cleaning',           '🧹', 5)
) as sub(parent_slug, name, slug, icon, position)
join parents p on p.slug = sub.parent_slug;
