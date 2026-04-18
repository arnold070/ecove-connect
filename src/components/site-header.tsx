import { Link } from "@tanstack/react-router";
import { ShoppingBag, Search, User2, Heart } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-display font-bold">
            e
          </span>
          <span className="font-display text-xl font-bold tracking-tight">ecove</span>
        </Link>

        <div className="ml-4 hidden flex-1 md:block">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search products, vendors, categories…"
              className="h-10 w-full rounded-full border border-input bg-muted pl-10 pr-4 text-sm outline-none transition focus:border-ring focus:bg-background"
            />
          </div>
        </div>

        <nav className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Wishlist">
            <Heart className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Cart">
            <ShoppingBag className="h-5 w-5" />
          </Button>
          {user ? (
            <Button variant="ghost" onClick={() => void signOut()} className="gap-2">
              <User2 className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          ) : (
            <Button asChild variant="default" className="gap-2">
              <Link to="/login">
                <User2 className="h-4 w-4" />
                <span>Sign in</span>
              </Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
