import { useState, useEffect, useRef } from "react";
import { Send } from "lucide-react";

export function ConsoleTab() {
  const [command, setCommand] = useState("");
  const [lines, setLines] = useState<string[]>([
    "$ Agent initialized with GPT-4 Turbo runtime",
    "$ Loading workspace context...",
    "$ Workspace: /projects/dashboard-v2",
    "$ Connected to channels: #dev-team, #frontend",
    "$ Plugins loaded: GitHub (active), Linear (active)",
    "",
    "[2024-03-03 14:23:41] Task received: Implement new dashboard components",
    "[2024-03-03 14:23:42] Analyzing component requirements...",
    "[2024-03-03 14:23:45] Creating React component structure",
    "[2024-03-03 14:24:12] Generated AgentCard.tsx",
    "[2024-03-03 14:24:18] Generated StatusIndicator.tsx",
    "[2024-03-03 14:24:25] Running type checks...",
    "[2024-03-03 14:24:28] ✓ Type check passed",
    "[2024-03-03 14:24:30] Committing changes to feature/dashboard-components",
    "[2024-03-03 14:24:33] ✓ Commit successful: a3f5d9c",
    "",
    "$ Waiting for next directive...",
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const handleSendCommand = () => {
    if (!command.trim()) return;

    setLines((prev) => [
      ...prev,
      `> ${command}`,
      `[${new Date().toLocaleTimeString()}] Processing directive...`,
    ]);
    setCommand("");

    // Simulate response
    setTimeout(() => {
      setLines((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ✓ Directive acknowledged`,
        "",
      ]);
    }, 1000);
  };

  return (
    <div className="py-6">
      {/* Terminal Window */}
      <div className="bg-black border border-white/10 rounded-lg overflow-hidden">
        {/* Terminal Header */}
        <div className="bg-white/5 border-b border-white/10 px-4 py-2 flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <div className="text-xs text-white/40 ml-2">tmux: Agent Console</div>
        </div>

        {/* Terminal Content */}
        <div
          ref={scrollRef}
          className="p-4 h-[500px] overflow-y-auto font-mono text-sm"
        >
          {lines.map((line, i) => (
            <div
              key={i}
              className={
                line.startsWith("$")
                  ? "text-blue-400"
                  : line.startsWith(">")
                  ? "text-green-400"
                  : line.includes("✓")
                  ? "text-green-400"
                  : line.includes("Error") || line.includes("✗")
                  ? "text-red-400"
                  : "text-white/70"
              }
            >
              {line || "\u00A0"}
            </div>
          ))}
          <div className="flex items-center mt-2">
            <span className="text-blue-400 mr-2">$</span>
            <span className="w-2 h-4 bg-white/70 animate-pulse" />
          </div>
        </div>

        {/* Input Bar */}
        <div className="border-t border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendCommand()}
              placeholder="Send directive to agent..."
              className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/40 text-sm"
            />
            <button
              onClick={handleSendCommand}
              disabled={!command.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm transition-colors"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
