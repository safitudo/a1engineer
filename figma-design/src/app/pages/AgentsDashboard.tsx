import { useState } from "react";
import { Link } from "react-router";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import { StatusDot } from "../components/StatusDot";

type AgentStatus = "running" | "ghost" | "ghost-context" | "starting" | "stopped";

interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  mode: string;
  runtime: string;
  state: string;
  summary: string;
  timeAgo: string;
  team: string;
}

const mockAgents: Agent[] = [
  {
    id: "1",
    name: "Chuck",
    status: "running",
    mode: "Always ON",
    runtime: "Claude Sonnet 3.5",
    state: "Active",
    summary: "Monitoring system health and orchestrating agent workflows",
    timeAgo: "Active now",
    team: "System",
  },
  {
    id: "2",
    name: "Frontend Dev",
    status: "running",
    mode: "Always ON",
    runtime: "GPT-4 Turbo",
    state: "Working",
    summary: "Implementing new dashboard components in React",
    timeAgo: "2m ago",
    team: "Engineering",
  },
  {
    id: "3",
    name: "Backend API",
    status: "ghost-context",
    mode: "Ghost",
    runtime: "Claude Code",
    state: "Idle",
    summary: "Last completed: API endpoint refactoring",
    timeAgo: "1h ago",
    team: "Engineering",
  },
  {
    id: "4",
    name: "Code Reviewer",
    status: "ghost",
    mode: "Ghost",
    runtime: "GPT-4",
    state: "Idle",
    summary: "Awaiting new pull requests",
    timeAgo: "3h ago",
    team: "Engineering",
  },
  {
    id: "5",
    name: "Documentation Bot",
    status: "starting",
    mode: "On Demand",
    runtime: "Claude Haiku",
    state: "Starting",
    summary: "Initializing documentation update workflow",
    timeAgo: "Just now",
    team: "Product",
  },
  {
    id: "6",
    name: "QA Tester",
    status: "stopped",
    mode: "On Demand",
    runtime: "GPT-3.5",
    state: "Stopped",
    summary: "Completed regression testing suite",
    timeAgo: "1d ago",
    team: "Product",
  },
];

export function AgentsDashboard() {
  const [filterStatus, setFilterStatus] = useState("All");
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set(["System", "Engineering", "Product"]));

  const toggleTeam = (team: string) => {
    const newExpanded = new Set(expandedTeams);
    if (newExpanded.has(team)) {
      newExpanded.delete(team);
    } else {
      newExpanded.add(team);
    }
    setExpandedTeams(newExpanded);
  };

  // Group agents by team
  const agentsByTeam = mockAgents.reduce((acc, agent) => {
    if (!acc[agent.team]) {
      acc[agent.team] = [];
    }
    acc[agent.team].push(agent);
    return acc;
  }, {} as Record<string, Agent[]>);

  const filteredAgents = (agents: Agent[]) => {
    return agents.filter((agent) => {
      const matchesFilter =
        filterStatus === "All" ||
        (filterStatus === "Running" && agent.status === "running") ||
        (filterStatus === "Ghost" && (agent.status === "ghost" || agent.status === "ghost-context")) ||
        agent.team === filterStatus;
      return matchesFilter;
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl text-white mb-1">Agents</h1>
          <p className="text-sm text-white/50">
            Manage and monitor your AI agents
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-6">
        {/* Filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
        >
          <option value="All">All Agents</option>
          <option value="Running">Running</option>
          <option value="Ghost">Ghost</option>
          <option value="System">System</option>
          <option value="Engineering">Engineering</option>
          <option value="Product">Product</option>
        </select>

        {/* New Agent Button */}
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">
          <Plus className="w-4 h-4" />
          New Agent
        </button>
      </div>

      {/* Agents List by Team */}
      <div className="space-y-8">
        {Object.entries(agentsByTeam).map(([team, agents]) => {
          const filtered = filteredAgents(agents);
          if (filtered.length === 0) return null;

          const isExpanded = expandedTeams.has(team);

          return (
            <div key={team}>
              {/* Team Header */}
              <button
                onClick={() => toggleTeam(team)}
                className="flex items-center gap-2 mb-4 group w-full"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-white/40" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-white/40" />
                )}
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-xs uppercase tracking-wider text-white/40">
                    {team}
                  </span>
                  <span className="text-xs text-white/30">
                    {filtered.length} {filtered.length === 1 ? "agent" : "agents"}
                  </span>
                  <div className="flex-1 h-px border-t border-dashed border-white/10" />
                </div>
              </button>

              {/* Team Agents - Card Grid */}
              {isExpanded && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map((agent) => (
                    <Link
                      key={agent.id}
                      to={`/agents/${agent.id}`}
                      className="flex flex-col p-5 rounded-lg bg-white/5 hover:bg-white/10 transition-all group border border-white/10 hover:border-white/20"
                    >
                      {/* Card Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <StatusDot status={agent.status} />
                          <div>
                            <div className="text-white group-hover:text-blue-400 transition-colors font-medium">
                              {agent.name}
                            </div>
                            <div className="text-xs text-white/40 mt-0.5">
                              {agent.timeAgo}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Card Body - Active Task */}
                      <div className="flex-1 mb-4">
                        <div className="text-sm text-white/60 line-clamp-2">
                          {agent.summary}
                        </div>
                      </div>

                      {/* Card Footer - Tags */}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-white/40 pt-3 border-t border-white/10">
                        <span className="px-2 py-1 bg-white/5 rounded">{agent.mode}</span>
                        <span className="px-2 py-1 bg-white/5 rounded">{agent.runtime}</span>
                        <span className="px-2 py-1 bg-white/5 rounded">{agent.state}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {Object.values(agentsByTeam).every((agents) => filteredAgents(agents).length === 0) && (
        <div className="text-center py-12">
          <p className="text-white/40">No agents found</p>
        </div>
      )}
    </div>
  );
}