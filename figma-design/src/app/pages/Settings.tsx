import { Link, useLocation } from "react-router";
import { User, Users, Key, CreditCard, FileText } from "lucide-react";

export function Settings() {
  const location = useLocation();
  const currentPath = location.pathname;

  const navItems = [
    { path: "/settings/account", label: "Account", icon: User },
    { path: "/settings/teams", label: "Teams", icon: Users },
    { path: "/settings/api-keys", label: "API Keys", icon: Key },
    { path: "/settings/billing", label: "Billing", icon: CreditCard },
    { path: "/settings/templates", label: "Templates", icon: FileText },
  ];

  const isActive = (path: string) => currentPath === path || (currentPath === "/settings" && path === "/settings/account");

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl text-white mb-8">Settings</h1>

      <div className="grid grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="col-span-1">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive(item.path)
                      ? "bg-blue-600 text-white"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="col-span-3">
          <div className="bg-white/5 border border-white/10 rounded-lg p-6">
            {currentPath === "/settings" || currentPath === "/settings/account" ? (
              <AccountSettings />
            ) : currentPath === "/settings/teams" ? (
              <TeamsSettings />
            ) : currentPath === "/settings/api-keys" ? (
              <ApiKeysSettings />
            ) : currentPath === "/settings/billing" ? (
              <BillingSettings />
            ) : currentPath === "/settings/templates" ? (
              <TemplatesSettings />
            ) : (
              <AccountSettings />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl text-white mb-4">Account Settings</h2>
        <p className="text-sm text-white/60 mb-6">
          Manage your account information and preferences
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-white/60 mb-2">Name</label>
          <input
            type="text"
            defaultValue="John Doe"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-2">Email</label>
          <input
            type="email"
            defaultValue="john@example.com"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-2">
            Default AI Provider
          </label>
          <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50">
            <option>OpenAI</option>
            <option>Anthropic Claude</option>
            <option>Aider</option>
          </select>
        </div>
      </div>

      <div className="pt-4">
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors">
          Save Changes
        </button>
      </div>
    </div>
  );
}

function TeamsSettings() {
  const teams = ["System", "Engineering", "Product", "Design"];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl text-white mb-4">Teams</h2>
        <p className="text-sm text-white/60 mb-6">
          Organize agents into teams for better management
        </p>
      </div>

      <div className="space-y-2">
        {teams.map((team) => (
          <div
            key={team}
            className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg"
          >
            <span className="text-white">{team}</span>
            <button className="text-sm text-red-400 hover:text-red-300">
              Delete
            </button>
          </div>
        ))}
      </div>

      <button className="w-full p-3 border border-dashed border-white/20 rounded-lg text-sm text-white/60 hover:text-white hover:border-white/40 transition-colors">
        + Add Team
      </button>
    </div>
  );
}

function ApiKeysSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl text-white mb-4">API Keys</h2>
        <p className="text-sm text-white/60 mb-6">
          Manage API keys for external integrations
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-white/60 mb-2">
            OpenAI API Key
          </label>
          <input
            type="password"
            defaultValue="sk-••••••••••••••••"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-2">
            Anthropic API Key
          </label>
          <input
            type="password"
            placeholder="Not configured"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
      </div>

      <div className="pt-4">
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors">
          Save Keys
        </button>
      </div>
    </div>
  );
}

function BillingSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl text-white mb-4">Billing</h2>
        <p className="text-sm text-white/60 mb-6">
          Manage your subscription and billing information
        </p>
      </div>

      <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white">Pro Plan</span>
          <span className="text-blue-400">$49/month</span>
        </div>
        <p className="text-sm text-white/60">
          Next billing date: April 3, 2026
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-white">Usage This Month</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-white/60">API Calls</span>
            <span className="text-white">127,453 / 1,000,000</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/60">Active Agents</span>
            <span className="text-white">6 / 20</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplatesSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl text-white mb-4">Agent Templates</h2>
        <p className="text-sm text-white/60 mb-6">
          Create and manage templates for quick agent setup
        </p>
      </div>

      <div className="text-center py-12">
        <p className="text-white/40 mb-4">No templates yet</p>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
          Create Template
        </button>
      </div>
    </div>
  );
}
