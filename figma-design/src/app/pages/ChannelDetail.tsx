import { Link, useParams } from "react-router";
import { ChevronLeft, Hash, Users, Settings, Send } from "lucide-react";
import { useState } from "react";

export function ChannelDetail() {
  const { channelId } = useParams();
  const [message, setMessage] = useState("");

  // Mock data
  const channel = {
    id: channelId,
    name: "dev-team",
    adapter: "slack",
    description: "Main development team communication channel",
    subscribers: [
      { name: "Frontend Dev", type: "agent" },
      { name: "Backend API", type: "agent" },
      { name: "Code Reviewer", type: "agent" },
      { name: "Chuck", type: "agent" },
      { name: "Sarah Chen", type: "human" },
      { name: "Mike Rodriguez", type: "human" },
    ],
  };

  const messages = [
    {
      id: "1",
      sender: "Sarah Chen",
      type: "human",
      content: "Starting work on the new dashboard feature",
      timestamp: "10:15 AM",
    },
    {
      id: "2",
      sender: "Chuck",
      type: "agent",
      content: "I've assigned Frontend Dev to assist with the React components",
      timestamp: "10:16 AM",
    },
    {
      id: "3",
      sender: "Frontend Dev",
      type: "agent",
      content: "Ready to help! I'll start by analyzing the design requirements.",
      timestamp: "10:16 AM",
    },
    {
      id: "4",
      sender: "Mike Rodriguez",
      type: "human",
      content: "Great! I'll review the PR when it's ready",
      timestamp: "10:18 AM",
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/20">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <Link
            to="/channels"
            className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors mb-4"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Channels
          </Link>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Hash className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl text-white mb-1">{channel.name}</h1>
                <p className="text-sm text-white/60">{channel.description}</p>
              </div>
            </div>

            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm transition-colors">
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-3 gap-6">
          {/* Messages */}
          <div className="col-span-2">
            <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
              {/* Message List */}
              <div className="p-4 h-[600px] overflow-y-auto space-y-4">
                {messages.map((msg) => (
                  <div key={msg.id} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          msg.type === "agent"
                            ? "text-green-400"
                            : "text-white"
                        }
                      >
                        {msg.sender}
                      </span>
                      <span className="text-xs text-white/30">
                        {msg.timestamp}
                      </span>
                    </div>
                    <div className="text-sm text-white/80">{msg.content}</div>
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="border-t border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Send a message..."
                    className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/40 text-sm"
                  />
                  <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors">
                    <Send className="w-4 h-4" />
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Adapter Info */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-4">
              <h3 className="text-white mb-3">Adapter</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/60">Type</span>
                  <span className="text-white">{channel.adapter}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Status</span>
                  <span className="text-green-400">Connected</span>
                </div>
              </div>
            </div>

            {/* Subscribers */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white">Subscribers</h3>
                <div className="flex items-center gap-1 text-sm text-white/60">
                  <Users className="w-4 h-4" />
                  <span>{channel.subscribers.length}</span>
                </div>
              </div>
              <div className="space-y-2">
                {channel.subscribers.map((sub, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-white">{sub.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        sub.type === "agent"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-blue-500/20 text-blue-400"
                      }`}
                    >
                      {sub.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
