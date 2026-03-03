import { createBrowserRouter } from "react-router";
import { RootLayout } from "./components/RootLayout";
import { AgentsDashboard } from "./pages/AgentsDashboard";
import { AgentDetail } from "./pages/AgentDetail";
import { ChannelsView } from "./pages/ChannelsView";
import { ChannelDetail } from "./pages/ChannelDetail";
import { PluginsView } from "./pages/PluginsView";
import { Settings } from "./pages/Settings";
import { Onboarding } from "./pages/Onboarding";

export const router = createBrowserRouter([
  {
    path: "/onboarding",
    Component: Onboarding,
  },
  {
    path: "/",
    Component: RootLayout,
    children: [
      { index: true, Component: AgentsDashboard },
      { path: "agents", Component: AgentsDashboard },
      { path: "agents/:agentId", Component: AgentDetail },
      { path: "channels", Component: ChannelsView },
      { path: "channels/:channelId", Component: ChannelDetail },
      { path: "plugins", Component: PluginsView },
      { path: "settings/*", Component: Settings },
    ],
  },
]);
