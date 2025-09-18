"use client";

import { usePathname } from "next/navigation";
import { AppHeader } from "./AppHeader";

export function ClientWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showHeader = pathname !== "/login";

  if (!showHeader) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}