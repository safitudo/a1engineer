import { useState } from "react";
import { Send, Hash } from "lucide-react";

interface Message {
  id: string;
  sender: string;
  channel: string;
  channelColor: string;
  content: string;
  timestamp: string;
  isAgent?: boolean;
}

const mockMessages: Message[] = [
  {
    id: "1",
    sender: "Sarah Chen",
    channel: "dev-team",
    channelColor: "bg-purple-500",
    content: "Can someone review the new dashboard PR?",
    timestamp: "10:23 AM",
  },
  {
    id: "2",
    sender: "Frontend Dev",
    channel: "dev-team",
    channelColor: "bg-purple-500",
    content: "I'll take a look at it now. Running code review checks...",
    timestamp: "10:24 AM",
    isAgent: true,
  },
  {
    id: "3",
    sender: "Frontend Dev",
    channel: "dev-team",
    channelColor: "bg-purple-500",
    content:
      "Review complete. Found 2 minor suggestions:\n• Consider memoizing the filtered list in AgentsDashboard\n• Add loading state to the search input\n\nOverall looks good! ✓",
    timestamp: "10:25 AM",
    isAgent: true,
  },
  {
    id: "4",
    sender: "Mike Rodriguez",
    channel: "frontend",
    channelColor: "bg-blue-500",
    content: "The build is failing on staging",
    timestamp: "10:28 AM",
  },
  {
    id: "5",
    sender: "Frontend Dev",
    channel: "frontend",
    channelColor: "bg-blue-500",
    content:
      "Checking the staging logs... Found the issue: missing environment variable VITE_API_URL. I'll create a task to add it to the deployment config.",
    timestamp: "10:29 AM",
    isAgent: true,
  },
];

export function ChatTab() {
  const [messages] = useState<Message[]>(mockMessages);
  const [newMessage, setNewMessage] = useState("");

  const handleSend = () => {
    if (!newMessage.trim()) return;
    // In a real app, this would send the message
    setNewMessage("");
  };

  return (
    <div className="py-6">
      <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
        {/* Messages */}
        <div className="p-4 h-[500px] overflow-y-auto space-y-4">
          {messages.map((message) => (
            <div key={message.id} className="space-y-1">
              {/* Message Header */}
              <div className="flex items-center gap-2">
                <span
                  className={
                    message.isAgent ? "text-green-400" : "text-white"
                  }
                >
                  {message.sender}
                </span>
                <div className="flex items-center gap-1 text-xs">
                  <div
                    className={`${message.channelColor} w-1 h-1 rounded-full`}
                  />
                  <Hash className="w-3 h-3 text-white/40" />
                  <span className="text-white/40">{message.channel}</span>
                </div>
                <span className="text-xs text-white/30">
                  {message.timestamp}
                </span>
              </div>
              {/* Message Content */}
              <div className="text-sm text-white/80 whitespace-pre-wrap pl-0">
                {message.content}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="border-t border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Send a message to subscribed channels..."
              className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/40 text-sm"
            />
            <button
              onClick={handleSend}
              disabled={!newMessage.trim()}
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
