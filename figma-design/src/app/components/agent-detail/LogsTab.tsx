import { useState } from "react";
import { Activity, AlertCircle, Info, Heart, RefreshCw } from "lucide-react";

type LogType = "heartbeat" | "status" | "error" | "info";

interface LogEntry {
  id: string;
  type: LogType;
  message: string;
  timestamp: string;
}

const mockLogs: LogEntry[] = [
  {
    id: "1",
    type: "heartbeat",
    message: "Agent heartbeat - all systems operational",
    timestamp: "2024-03-03 14:32:15",
  },
  {
    id: "2",
    type: "info",
    message: "Task assigned: Implement new dashboard components",
    timestamp: "2024-03-03 14:23:41",
  },
  {
    id: "3",
    type: "status",
    message: "Status changed: idle → working",
    timestamp: "2024-03-03 14:23:42",
  },
  {
    id: "4",
    type: "info",
    message: "Created commit a3f5d9c on branch feature/dashboard-components",
    timestamp: "2024-03-03 14:24:33",
  },
  {
    id: "5",
    type: "heartbeat",
    message: "Agent heartbeat - all systems operational",
    timestamp: "2024-03-03 14:02:15",
  },
  {
    id: "6",
    type: "status",
    message: "Plugin activated: GitHub",
    timestamp: "2024-03-03 13:45:22",
  },
  {
    id: "7",
    type: "error",
    message: "API rate limit approaching (85% used)",
    timestamp: "2024-03-03 13:30:10",
  },
  {
    id: "8",
    type: "info",
    message: "Connected to channel: #dev-team",
    timestamp: "2024-03-03 13:15:05",
  },
  {
    id: "9",
    type: "status",
    message: "Agent started with runtime: GPT-4 Turbo",
    timestamp: "2024-03-03 13:15:00",
  },
];

export function LogsTab() {
  const [filterType, setFilterType] = useState<LogType | "all">("all");

  const filteredLogs =
    filterType === "all"
      ? mockLogs
      : mockLogs.filter((log) => log.type === filterType);

  const getLogIcon = (type: LogType) => {
    switch (type) {
      case "heartbeat":
        return <Heart className="w-4 h-4 text-green-400" />;
      case "status":
        return <RefreshCw className="w-4 h-4 text-blue-400" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case "info":
        return <Info className="w-4 h-4 text-white/60" />;
    }
  };

  const getLogColor = (type: LogType) => {
    switch (type) {
      case "heartbeat":
        return "text-green-400";
      case "status":
        return "text-blue-400";
      case "error":
        return "text-red-400";
      case "info":
        return "text-white/80";
    }
  };

  return (
    <div className="py-6">
      {/* Filter */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-white/60">Filter:</span>
        <div className="flex gap-2">
          {["all", "heartbeat", "status", "error", "info"].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type as LogType | "all")}
              className={`px-3 py-1 rounded-md text-xs transition-colors ${
                filterType === type
                  ? "bg-blue-600 text-white"
                  : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Logs */}
      <div className="bg-black border border-white/10 rounded-lg overflow-hidden">
        <div className="p-4 h-[500px] overflow-y-auto font-mono text-sm space-y-2">
          {filteredLogs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 py-1">
              <span className="text-white/40 text-xs w-32 flex-shrink-0 mt-0.5">
                {log.timestamp}
              </span>
              <div className="flex-shrink-0 mt-0.5">{getLogIcon(log.type)}</div>
              <div className={`flex-1 ${getLogColor(log.type)}`}>
                {log.message}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
