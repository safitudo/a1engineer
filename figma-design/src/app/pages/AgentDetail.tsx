import { useState } from "react";
import { useParams, Link } from "react-router";
import { ChevronLeft, Pause, RotateCw, Square, Settings } from "lucide-react";
import { StatusDot } from "../components/StatusDot";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { ConsoleTab } from "../components/agent-detail/ConsoleTab";
import { ChatTab } from "../components/agent-detail/ChatTab";
import { TasksTab } from "../components/agent-detail/TasksTab";
import { LogsTab } from "../components/agent-detail/LogsTab";
import { SettingsTab } from "../components/agent-detail/SettingsTab";

export function AgentDetail() {
  const { agentId } = useParams();
  const [activeTab, setActiveTab] = useState("console");

  // Mock agent data
  const agent = {
    id: agentId,
    name: "Frontend Dev",
    status: "running" as const,
    role: "React Development Specialist",
    runtime: "GPT-4 Turbo",
    model: "gpt-4-turbo-preview",
    mode: "Always ON",
    team: "Engineering",
    uptime: "2d 4h 23m",
    taskCount: 47,
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/20">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Breadcrumb */}
          <Link
            to="/agents"
            className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors mb-4"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Agents
          </Link>

          {/* Agent Header Card */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-start gap-4">
                <StatusDot status={agent.status} />
                <div>
                  <h1 className="text-2xl text-white mb-1">{agent.name}</h1>
                  <p className="text-sm text-white/60">{agent.role}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm transition-colors">
                  <Pause className="w-4 h-4" />
                  Pause
                </button>
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm transition-colors">
                  <RotateCw className="w-4 h-4" />
                  Restart
                </button>
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm transition-colors">
                  <Square className="w-4 h-4" />
                  Stop
                </button>
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm transition-colors">
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
              </div>
            </div>

            {/* Agent Info */}
            <div className="grid grid-cols-5 gap-6">
              <div>
                <div className="text-xs text-white/40 mb-1">Runtime</div>
                <div className="text-sm text-white">{agent.runtime}</div>
              </div>
              <div>
                <div className="text-xs text-white/40 mb-1">Model</div>
                <div className="text-sm text-white">{agent.model}</div>
              </div>
              <div>
                <div className="text-xs text-white/40 mb-1">Mode</div>
                <div className="text-sm text-white">{agent.mode}</div>
              </div>
              <div>
                <div className="text-xs text-white/40 mb-1">Uptime</div>
                <div className="text-sm text-white">{agent.uptime}</div>
              </div>
              <div>
                <div className="text-xs text-white/40 mb-1">Tasks Completed</div>
                <div className="text-sm text-white">{agent.taskCount}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList className="bg-transparent border-b border-white/10 rounded-none p-0 h-auto w-full justify-start">
            <TabsTrigger
              value="console"
              className="bg-transparent data-[state=active]:bg-transparent border-b-2 border-transparent data-[state=active]:border-blue-500 rounded-none px-4 py-3 text-white/60 data-[state=active]:text-white"
            >
              Console
            </TabsTrigger>
            <TabsTrigger
              value="chat"
              className="bg-transparent data-[state=active]:bg-transparent border-b-2 border-transparent data-[state=active]:border-blue-500 rounded-none px-4 py-3 text-white/60 data-[state=active]:text-white"
            >
              Chat
            </TabsTrigger>
            <TabsTrigger
              value="tasks"
              className="bg-transparent data-[state=active]:bg-transparent border-b-2 border-transparent data-[state=active]:border-blue-500 rounded-none px-4 py-3 text-white/60 data-[state=active]:text-white"
            >
              Tasks
            </TabsTrigger>
            <TabsTrigger
              value="logs"
              className="bg-transparent data-[state=active]:bg-transparent border-b-2 border-transparent data-[state=active]:border-blue-500 rounded-none px-4 py-3 text-white/60 data-[state=active]:text-white"
            >
              Logs
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="bg-transparent data-[state=active]:bg-transparent border-b-2 border-transparent data-[state=active]:border-blue-500 rounded-none px-4 py-3 text-white/60 data-[state=active]:text-white"
            >
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="console" className="mt-0">
            <ConsoleTab />
          </TabsContent>

          <TabsContent value="chat" className="mt-0">
            <ChatTab />
          </TabsContent>

          <TabsContent value="tasks" className="mt-0">
            <TasksTab />
          </TabsContent>

          <TabsContent value="logs" className="mt-0">
            <LogsTab />
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
            <SettingsTab agent={agent} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
