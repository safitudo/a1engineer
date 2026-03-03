import { Plus, Settings, Power, Github, Workflow, Server } from "lucide-react";
import { Switch } from "../components/ui/switch";

interface Plugin {
  id: string;
  name: string;
  type: "integration" | "mcp";
  status: "active" | "inactive" | "error";
  description: string;
  usedBy: number;
  config?: {
    label: string;
    value: string;
  }[];
  installed: boolean;
}

const mockPlugins: Plugin[] = [
  {
    id: "1",
    name: "GitHub",
    type: "integration",
    status: "active",
    description: "Git operations, PR management, and code reviews",
    usedBy: 6,
    config: [
      { label: "Token Status", value: "Valid (expires in 28 days)" },
      { label: "Active Worktrees", value: "3" },
    ],
    installed: true,
  },
  {
    id: "2",
    name: "Linear",
    type: "integration",
    status: "active",
    description: "Issue tracking and project management",
    usedBy: 4,
    config: [
      { label: "Workspace", value: "acme-corp" },
      { label: "Synced Issues", value: "127" },
    ],
    installed: true,
  },
  {
    id: "3",
    name: "MCP Server - Local",
    type: "mcp",
    status: "active",
    description: "Model Context Protocol server for local tools",
    usedBy: 8,
    config: [
      { label: "Server URL", value: "localhost:3000" },
      { label: "Port", value: "3000" },
    ],
    installed: true,
  },
  {
    id: "4",
    name: "Slack Notifications",
    type: "integration",
    status: "inactive",
    description: "Send notifications to Slack channels",
    usedBy: 0,
    installed: true,
  },
  {
    id: "5",
    name: "Jira",
    type: "integration",
    status: "error",
    description: "Jira project management and issue tracking",
    usedBy: 2,
    config: [{ label: "Status", value: "Authentication failed" }],
    installed: true,
  },
  {
    id: "6",
    name: "Vercel Deploy",
    type: "integration",
    status: "inactive",
    description: "Automated deployments to Vercel",
    usedBy: 0,
    installed: false,
  },
];

export function PluginsView() {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "text-green-400";
      case "inactive":
        return "text-white/40";
      case "error":
        return "text-red-400";
      default:
        return "text-white/60";
    }
  };

  const getPluginIcon = (type: string) => {
    switch (type) {
      case "integration":
        return <Workflow className="w-5 h-5 text-purple-400" />;
      case "mcp":
        return <Server className="w-5 h-5 text-blue-400" />;
      default:
        return <Settings className="w-5 h-5 text-white/60" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl text-white mb-1">Plugins</h1>
          <p className="text-sm text-white/50">
            Extend agent capabilities with integrations and tools
          </p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">
          <Plus className="w-4 h-4" />
          Install Plugin
        </button>
      </div>

      {/* Plugins Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mockPlugins.map((plugin) => (
          <div
            key={plugin.id}
            className="bg-white/5 border border-white/10 rounded-lg p-5 hover:bg-white/10 transition-colors"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                  {getPluginIcon(plugin.type)}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-white">{plugin.name}</h3>
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        plugin.type === "mcp"
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                          : "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                      }`}
                    >
                      {plugin.type.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-white/60">{plugin.description}</p>
                </div>
              </div>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-2 ${
                plugin.status === "active" ? "bg-green-500" :
                plugin.status === "error" ? "bg-red-500" :
                "bg-white/20"
              }`} />
            </div>

            {/* Config */}
            {plugin.config && plugin.config.length > 0 && (
              <div className="mb-4 p-3 bg-black/30 rounded-lg space-y-2">
                {plugin.config.map((item, index) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span className="text-white/60">{item.label}</span>
                    <span className={plugin.status === "error" ? "text-red-400" : "text-white"}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-white/10">
              <div className="text-sm text-white/60">
                Used by{" "}
                <span className="text-white">{plugin.usedBy}</span>{" "}
                {plugin.usedBy === 1 ? "agent" : "agents"}
              </div>
              <div className="flex items-center gap-2">
                {plugin.installed ? (
                  <>
                    <button className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm transition-colors">
                      <Settings className="w-4 h-4" />
                    </button>
                    <Switch
                      defaultChecked={plugin.status === "active"}
                      disabled={plugin.status === "error"}
                    />
                  </>
                ) : (
                  <button className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors">
                    Install
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
