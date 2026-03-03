import { GitCommit, GitPullRequest, CheckCircle2, Circle, Clock } from "lucide-react";

interface Task {
  id: string;
  title: string;
  status: "completed" | "in-progress" | "pending";
  timestamp: string;
  artifacts: Array<{
    type: "commit" | "pr";
    id: string;
    title: string;
  }>;
}

const mockTasks: Task[] = [
  {
    id: "1",
    title: "Implement new dashboard components",
    status: "in-progress",
    timestamp: "2m ago",
    artifacts: [
      { type: "commit", id: "a3f5d9c", title: "feat: add agent card component" },
      { type: "commit", id: "b2e4f1a", title: "feat: add status indicator" },
    ],
  },
  {
    id: "2",
    title: "Fix responsive layout issues",
    status: "completed",
    timestamp: "1h ago",
    artifacts: [
      { type: "commit", id: "c5d6e2f", title: "fix: mobile layout improvements" },
      { type: "pr", id: "#247", title: "Fix responsive layout on mobile" },
    ],
  },
  {
    id: "3",
    title: "Add real-time WebSocket updates",
    status: "completed",
    timestamp: "3h ago",
    artifacts: [
      { type: "commit", id: "d7e8f3a", title: "feat: websocket integration" },
      { type: "pr", id: "#246", title: "Add WebSocket support for live updates" },
    ],
  },
  {
    id: "4",
    title: "Optimize bundle size",
    status: "pending",
    timestamp: "Scheduled",
    artifacts: [],
  },
];

export function TasksTab() {
  return (
    <div className="py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white">Tasks</h3>
        <button className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors">
          Assign New Task
        </button>
      </div>

      {/* Tasks List */}
      <div className="space-y-3">
        {mockTasks.map((task) => (
          <div
            key={task.id}
            className={`bg-white/5 border rounded-lg p-4 ${
              task.status === "in-progress"
                ? "border-blue-500/50 bg-blue-500/5"
                : "border-white/10"
            }`}
          >
            {/* Task Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3">
                {task.status === "completed" && (
                  <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                )}
                {task.status === "in-progress" && (
                  <Clock className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0 animate-pulse" />
                )}
                {task.status === "pending" && (
                  <Circle className="w-5 h-5 text-white/40 mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <h4 className="text-white mb-1">{task.title}</h4>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                        task.status === "completed"
                          ? "bg-green-500/20 text-green-400"
                          : task.status === "in-progress"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-white/10 text-white/60"
                      }`}
                    >
                      {task.status === "completed" && "Completed"}
                      {task.status === "in-progress" && "In Progress"}
                      {task.status === "pending" && "Pending"}
                    </span>
                    <span className="text-xs text-white/40">
                      {task.timestamp}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Artifacts */}
            {task.artifacts.length > 0 && (
              <div className="space-y-2 pl-8">
                {task.artifacts.map((artifact, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 text-sm text-white/70"
                  >
                    {artifact.type === "commit" ? (
                      <GitCommit className="w-4 h-4 text-purple-400" />
                    ) : (
                      <GitPullRequest className="w-4 h-4 text-green-400" />
                    )}
                    <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded text-white/60">
                      {artifact.id}
                    </code>
                    <span>{artifact.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
