import { useState } from "react";
import { useNavigate } from "react-router";
import { Check } from "lucide-react";

export function Onboarding() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    provider: "openai",
    apiKey: "",
    defaultModel: "gpt-4-turbo-preview",
    launchChuck: true,
    agentName: "",
    agentRole: "",
    alwaysOn: true,
    runNow: true,
  });

  const totalSteps = 4;

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      // Complete onboarding
      navigate("/agents");
    }
  };

  const handleSkip = () => {
    navigate("/agents");
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-xl font-bold">A1</span>
          </div>
          <h1 className="text-2xl text-white mb-2">Welcome to A1 Engineer</h1>
          <p className="text-white/60">Let's get your AI agent platform set up</p>
        </div>

        {/* Step Indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {Array.from({ length: totalSteps }).map((_, index) => (
            <div key={index} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors ${
                  index + 1 < currentStep
                    ? "bg-green-500 text-white"
                    : index + 1 === currentStep
                    ? "bg-blue-600 text-white"
                    : "bg-white/10 text-white/40"
                }`}
              >
                {index + 1 < currentStep ? (
                  <Check className="w-4 h-4" />
                ) : (
                  index + 1
                )}
              </div>
              {index < totalSteps - 1 && (
                <div
                  className={`w-12 h-0.5 ${
                    index + 1 < currentStep ? "bg-green-500" : "bg-white/10"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-8">
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl text-white mb-2">Create Your Account</h2>
                <p className="text-sm text-white/60">
                  Enter your details to get started
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-white/60 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    placeholder="you@example.com"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    placeholder="••••••••"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              <div className="pt-4">
                <p className="text-sm text-white/60 text-center mb-4">
                  Or continue with
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button className="flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white hover:bg-white/10 transition-colors">
                    GitHub
                  </button>
                  <button className="flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white hover:bg-white/10 transition-colors">
                    Google
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl text-white mb-2">Configure AI Provider</h2>
                <p className="text-sm text-white/60">
                  Choose your AI provider and add your API key
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-white/60 mb-2">
                    Provider
                  </label>
                  <select
                    value={formData.provider}
                    onChange={(e) =>
                      setFormData({ ...formData, provider: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic Claude</option>
                    <option value="aider">Aider</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-2">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={formData.apiKey}
                    onChange={(e) =>
                      setFormData({ ...formData, apiKey: e.target.value })
                    }
                    placeholder="sk-..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-2">
                    Default Model
                  </label>
                  <select
                    value={formData.defaultModel}
                    onChange={(e) =>
                      setFormData({ ...formData, defaultModel: e.target.value })
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="gpt-4-turbo-preview">GPT-4 Turbo</option>
                    <option value="gpt-4">GPT-4</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl text-white mb-2">Meet Chuck</h2>
                <p className="text-sm text-white/60">
                  Your always-on watchdog agent
                </p>
              </div>

              <div className="p-6 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">🐕</span>
                  </div>
                  <div>
                    <h3 className="text-white mb-2">Chuck - The Watchdog</h3>
                    <p className="text-sm text-white/70">
                      Chuck is your system orchestrator. He monitors all agents,
                      manages workflows, handles task assignments, and ensures
                      everything runs smoothly. Chuck is always running in the
                      background, keeping your agent ecosystem healthy.
                    </p>
                  </div>
                </div>

                <ul className="space-y-2 text-sm text-white/70">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Monitors agent health and status</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Orchestrates task distribution</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span>Handles inter-agent communication</span>
                  </li>
                </ul>
              </div>

              <div className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-lg">
                <input
                  type="checkbox"
                  id="launch-chuck"
                  checked={formData.launchChuck}
                  onChange={(e) =>
                    setFormData({ ...formData, launchChuck: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-white/20 bg-white/5"
                />
                <label htmlFor="launch-chuck" className="text-white text-sm">
                  Launch Chuck automatically (recommended)
                </label>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl text-white mb-2">Create Your First Agent</h2>
                <p className="text-sm text-white/60">
                  Optional: Set up an agent to get started quickly
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-white/60 mb-2">
                    Agent Name
                  </label>
                  <input
                    type="text"
                    value={formData.agentName}
                    onChange={(e) =>
                      setFormData({ ...formData, agentName: e.target.value })
                    }
                    placeholder="e.g., Frontend Dev"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-2">
                    Role / Specialty
                  </label>
                  <input
                    type="text"
                    value={formData.agentRole}
                    onChange={(e) =>
                      setFormData({ ...formData, agentRole: e.target.value })
                    }
                    placeholder="e.g., React Development Specialist"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="always-on"
                      checked={formData.alwaysOn}
                      onChange={(e) =>
                        setFormData({ ...formData, alwaysOn: e.target.checked })
                      }
                      className="w-4 h-4 rounded border-white/20 bg-white/5"
                    />
                    <label htmlFor="always-on" className="text-white text-sm">
                      Always ON (keep running after tasks)
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="run-now"
                      checked={formData.runNow}
                      onChange={(e) =>
                        setFormData({ ...formData, runNow: e.target.checked })
                      }
                      className="w-4 h-4 rounded border-white/20 bg-white/5"
                    />
                    <label htmlFor="run-now" className="text-white text-sm">
                      Run now (launch immediately)
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-6 mt-6 border-t border-white/10">
            {currentStep > 1 ? (
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                className="px-4 py-2 text-white/60 hover:text-white transition-colors"
              >
                Back
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-3">
              {currentStep === totalSteps && (
                <button
                  onClick={handleSkip}
                  className="px-4 py-2 text-white/60 hover:text-white transition-colors"
                >
                  Skip
                </button>
              )}
              <button
                onClick={handleNext}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                {currentStep === totalSteps ? "Get Started" : "Continue"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
