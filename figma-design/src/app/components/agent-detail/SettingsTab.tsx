import { Switch } from "../ui/switch";
import { Hash } from "lucide-react";

interface Agent {
  id: string | undefined;
  name: string;
  status: string;
  role: string;
  runtime: string;
  model: string;
  mode: string;
  team: string;
  uptime: string;
  taskCount: number;
}

interface SettingsTabProps {
  agent: Agent;
}

export function SettingsTab({ agent }: SettingsTabProps) {
  return (
    <div className="py-6 max-w-3xl">
      <div className="space-y-8">
        {/* Mode Settings */}
        <div>
          <h3 className="text-white mb-4">Mode</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-lg">
              <div>
                <div className="text-white mb-1">Always ON</div>
                <div className="text-sm text-white/60">
                  Keep agent running after tasks complete
                </div>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-lg">
              <div>
                <div className="text-white mb-1">Keep Context</div>
                <div className="text-sm text-white/60">
                  Preserve container and session between tasks
                </div>
              </div>
              <Switch />
            </div>
          </div>
        </div>

        {/* Runtime Settings */}
        <div>
          <h3 className="text-white mb-4">Runtime Configuration</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-white/60 mb-2">
                Provider
              </label>
              <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                <option>OpenAI</option>
                <option>Anthropic Claude</option>
                <option>Aider</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-2">Model</label>
              <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                <option>gpt-4-turbo-preview</option>
                <option>gpt-4</option>
                <option>gpt-3.5-turbo</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-2">Effort</label>
              <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                <option>Standard</option>
                <option>High</option>
                <option>Maximum</option>
              </select>
            </div>
          </div>
        </div>

        {/* Channel Subscriptions */}
        <div>
          <h3 className="text-white mb-4">Channel Subscriptions</h3>
          <div className="space-y-2">
            {["dev-team", "frontend", "engineering"].map((channel) => (
              <div
                key={channel}
                className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-lg"
              >
                <Hash className="w-4 h-4 text-white/60" />
                <span className="flex-1 text-white">{channel}</span>
                <button className="text-xs text-red-400 hover:text-red-300">
                  Unsubscribe
                </button>
              </div>
            ))}
            <button className="w-full p-3 border border-dashed border-white/20 rounded-lg text-sm text-white/60 hover:text-white hover:border-white/40 transition-colors">
              + Add Channel
            </button>
          </div>
        </div>

        {/* Plugin Settings */}
        <div>
          <h3 className="text-white mb-4">Plugins</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-lg">
              <div>
                <div className="text-white mb-1">GitHub</div>
                <div className="text-sm text-white/60">
                  Git operations and PR management
                </div>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-lg">
              <div>
                <div className="text-white mb-1">Linear</div>
                <div className="text-sm text-white/60">
                  Issue tracking and project management
                </div>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-lg opacity-50">
              <div>
                <div className="text-white mb-1">Slack</div>
                <div className="text-sm text-white/60">
                  Not installed
                </div>
              </div>
              <Switch disabled />
            </div>
          </div>
        </div>

        {/* Team */}
        <div>
          <h3 className="text-white mb-4">Team Assignment</h3>
          <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50">
            <option>Engineering</option>
            <option>Product</option>
            <option>Design</option>
            <option>System</option>
          </select>
        </div>

        {/* Save Button */}
        <div className="pt-4 border-t border-white/10">
          <button className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg transition-colors">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
