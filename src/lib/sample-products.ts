// Sample storefront products used until real vendor catalogs are wired up.
// Prices are in Naira (whole units).

export interface SampleProduct {
  id: number;
  name: string;
  price: number;
  old: number;
  icon: string;
  category: string;
  discount: number;
  rating: number;
  reviews: number;
  badge: "SALE" | "HOT" | "NEW" | "DEAL";
}

export const sampleProducts: SampleProduct[] = [
  { id: 1, name: "Samsung Galaxy S24 Ultra 256GB", price: 950000, old: 1100000, icon: "📱", category: "Phones", discount: 14, rating: 4.8, reviews: 234, badge: "SALE" },
  { id: 2, name: "HP Pavilion 15 Laptop Core i5 8GB RAM", price: 285000, old: 320000, icon: "💻", category: "Computing", discount: 11, rating: 4.6, reviews: 189, badge: "SALE" },
  { id: 3, name: 'LG 55" 4K UHD Smart TV', price: 480000, old: 550000, icon: "📺", category: "Electronics", discount: 13, rating: 4.7, reviews: 156, badge: "SALE" },
  { id: 4, name: "Nike Air Max 270 Running Shoes", price: 45000, old: 62000, icon: "👟", category: "Fashion", discount: 27, rating: 4.9, reviews: 312, badge: "HOT" },
  { id: 5, name: "Philips Air Fryer HD9252", price: 38000, old: 52000, icon: "🍳", category: "Home", discount: 27, rating: 4.5, reviews: 98, badge: "SALE" },
  { id: 6, name: "Neutrogena Skincare Gift Set", price: 12500, old: 18000, icon: "💆", category: "Beauty", discount: 31, rating: 4.4, reviews: 67, badge: "DEAL" },
  { id: 7, name: "Tecno Spark 20 Pro+ 256GB", price: 145000, old: 175000, icon: "📱", category: "Phones", discount: 17, rating: 4.3, reviews: 445, badge: "NEW" },
  { id: 8, name: "Hisense 7kg Front Load Washer", price: 215000, old: 280000, icon: "🫧", category: "Appliances", discount: 23, rating: 4.6, reviews: 78, badge: "SALE" },
  { id: 9, name: "Logitech MX Master 3 Mouse", price: 28000, old: 35000, icon: "🖱️", category: "Computing", discount: 20, rating: 4.9, reviews: 201, badge: "HOT" },
  { id: 10, name: "Adidas Originals Classic Backpack", price: 18500, old: 25000, icon: "🎒", category: "Fashion", discount: 26, rating: 4.5, reviews: 133, badge: "SALE" },
  { id: 11, name: "Pampers Diapers Size 4 (82 pcs)", price: 8500, old: 11000, icon: "👶", category: "Baby", discount: 23, rating: 4.8, reviews: 567, badge: "HOT" },
  { id: 12, name: "Wilson Tennis Racket Pro", price: 22000, old: 30000, icon: "🎾", category: "Sports", discount: 27, rating: 4.7, reviews: 89, badge: "SALE" },
];

export interface StorefrontCategory {
  name: string;
  slug: string;
  icon: string;
  tone: string;
  subcategories: { name: string; slug: string; icon: string }[];
}

export const storefrontCategories: StorefrontCategory[] = [
  {
    name: "Gadgets",
    slug: "gadgets",
    icon: "📱",
    tone: "from-blue-100 to-blue-200",
    subcategories: [
      { name: "Phones & Tablets", slug: "phones-tablets", icon: "📱" },
      { name: "Computing", slug: "computing", icon: "💻" },
      { name: "Electronics & TV", slug: "electronics-tv", icon: "📺" },
      { name: "Gaming", slug: "gaming", icon: "🎮" },
      { name: "Audio & Accessories", slug: "audio-accessories", icon: "🎧" },
    ],
  },
  {
    name: "Fashion",
    slug: "fashion",
    icon: "👗",
    tone: "from-pink-100 to-pink-200",
    subcategories: [
      { name: "Men's Fashion", slug: "mens-fashion", icon: "👔" },
      { name: "Women's Fashion", slug: "womens-fashion", icon: "👗" },
      { name: "Kids & Babies", slug: "kids-fashion", icon: "🧒" },
      { name: "Shoes & Sneakers", slug: "shoes", icon: "👟" },
      { name: "Bags & Accessories", slug: "bags-accessories", icon: "👜" },
    ],
  },
  {
    name: "Services",
    slug: "services",
    icon: "🛠️",
    tone: "from-emerald-100 to-emerald-200",
    subcategories: [
      { name: "Repairs", slug: "repairs", icon: "🔧" },
      { name: "Delivery & Logistics", slug: "delivery", icon: "🚚" },
      { name: "Installation", slug: "installation", icon: "🛠️" },
      { name: "Consulting", slug: "consulting", icon: "💼" },
      { name: "Cleaning", slug: "cleaning", icon: "🧹" },
    ],
  },
];

