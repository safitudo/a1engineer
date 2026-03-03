import { Outlet, Link, useLocation } from "react-router";
import { Menu, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function RootLayout() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/" || path === "/agents") {
      return location.pathname === "/" || location.pathname === "/agents" || location.pathname.startsWith("/agents/");
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-foreground">
      {/* Top Navigation */}
      <nav className="border-b border-white/10 bg-black/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center h-14 px-6 gap-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 mr-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">A1</span>
            </div>
          </Link>

          {/* Nav Links */}
          <Link
            to="/agents"
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              isActive("/agents")
                ? "bg-white/10 text-white"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            Agents
          </Link>
          <Link
            to="/channels"
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              isActive("/channels")
                ? "bg-white/10 text-white"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            Channels
          </Link>
          <Link
            to="/plugins"
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              isActive("/plugins")
                ? "bg-white/10 text-white"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            Plugins
          </Link>

          {/* Spacer */}
          <div className="flex-1" />

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors outline-none">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-white" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-[#1a1a1a] border-white/10">
              <DropdownMenuItem className="text-white/90 focus:bg-white/10 focus:text-white cursor-pointer">
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem className="text-white/90 focus:bg-white/10 focus:text-white cursor-pointer">
                <Link to="/settings" className="w-full">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem className="text-red-400 focus:bg-red-500/10 focus:text-red-400 cursor-pointer">
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      {/* Page Content */}
      <main>
        <Outlet />
      </main>
    </div>
  );
}
