import { Link } from "react-router";
import { Plus, Hash, Users } from "lucide-react";

interface Channel {
  id: string;
  name: string;
  adapter: "slack" | "discord" | "irc" | "telegram" | "webhook";
  subscribers: number;
  description: string;
}

const mockChannels: Channel[] = [
  {
    id: "1",
    name: "dev-team",
    adapter: "slack",
    subscribers: 8,
    description: "Main development team communication channel",
  },
  {
    id: "2",
    name: "frontend",
    adapter: "slack",
    subscribers: 5,
    description: "Frontend development and UI discussions",
  },
  {
    id: "3",
    name: "backend-api",
    adapter: "discord",
    subscribers: 6,
    description: "Backend API development and architecture",
  },
  {
    id: "4",
    name: "deployments",
    adapter: "webhook",
    subscribers: 12,
    description: "Automated deployment notifications and alerts",
  },
  {
    id: "5",
    name: "code-review",
    adapter: "slack",
    subscribers: 9,
    description: "Pull request reviews and code quality discussions",
  },
];

export function ChannelsView() {
  const getAdapterColor = (adapter: string) => {
    switch (adapter) {
      case "slack":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "discord":
        return "bg-indigo-500/20 text-indigo-400 border-indigo-500/30";
      case "irc":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "telegram":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "webhook":
        return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      default:
        return "bg-white/10 text-white/60 border-white/20";
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl text-white mb-1">Channels</h1>
          <p className="text-sm text-white/50">
            Communication channels for agent collaboration
          </p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">
          <Plus className="w-4 h-4" />
          New Channel
        </button>
      </div>

      {/* Channels List */}
      <div className="space-y-2">
        {mockChannels.map((channel) => (
          <Link
            key={channel.id}
            to={`/channels/${channel.id}`}
            className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:border-white/20 transition-colors group"
          >
            {/* Channel Icon */}
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Hash className="w-5 h-5 text-blue-400" />
            </div>

            {/* Channel Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-white group-hover:text-blue-400 transition-colors">
                  {channel.name}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-xs border ${getAdapterColor(
                    channel.adapter
                  )}`}
                >
                  {channel.adapter}
                </span>
              </div>
              <p className="text-sm text-white/60 truncate">
                {channel.description}
              </p>
            </div>

            {/* Subscribers */}
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Users className="w-4 h-4" />
              <span>{channel.subscribers}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
