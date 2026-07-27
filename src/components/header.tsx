import Link from "next/link";
import { signOut } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Palmtree, LogOut } from "lucide-react";

interface HeaderProps {
  userEmail?: string | null;
}

export function Header({ userEmail }: HeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-teal-700">
          <Palmtree className="h-5 w-5" />
          HolidayVote
        </Link>
        <div className="flex items-center gap-3">
          {userEmail && (
            <span className="hidden text-sm text-slate-500 sm:inline">
              {userEmail}
            </span>
          )}
          <form action={signOut}>
            <Button variant="ghost" size="sm" type="submit">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Abmelden</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
