"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, User, BarChart3, Database, Search, Target, Webhook, Bug, FolderOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function AppHeader() {
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Get current user
    fetch('/api/auth/user')
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setUser(data.user);
        }
      })
      .catch(console.error);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <header className="flex items-center justify-between p-4 bg-muted/50 border-b">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-2xl font-bold hover:text-primary transition-colors">
          EMP Monitor
        </Link>
      </div>

      <nav className="flex items-center gap-2">
        <Link href="/">
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <BarChart3 className="h-3 w-3" />
            Dashboard
          </Button>
        </Link>
        <Link href="/database">
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Database className="h-3 w-3" />
            Database Connections
          </Button>
        </Link>
        <Link href="/collections">
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <FolderOpen className="h-3 w-3" />
            Collections
          </Button>
        </Link>
        <Link href="/forensics">
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Search className="h-3 w-3" />
            Job Forensics
          </Button>
        </Link>
        <Link href="/webhook-test">
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Webhook className="h-3 w-3" />
            Webhooks
          </Button>
        </Link>
        <Link href="/workflow-debug">
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Bug className="h-3 w-3" />
            Debug
          </Button>
        </Link>
        <Link href="/northstar">
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Target className="h-3 w-3" />
            North Star
          </Button>
        </Link>

        {user && (
          <div className="flex items-center gap-2 ml-4 px-3 py-1 bg-background border rounded-md">
            <User className="h-4 w-4" />
            <span className="text-sm">{user.name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="h-6 w-6 p-0 hover:bg-red-100"
              title="Sign out"
            >
              <LogOut className="h-3 w-3" />
            </Button>
          </div>
        )}
      </nav>
    </header>
  );
}