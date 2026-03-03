type StatusType = "running" | "ghost" | "ghost-context" | "starting" | "stopped";

interface StatusDotProps {
  status: StatusType;
}

export function StatusDot({ status }: StatusDotProps) {
  const getStatusClasses = () => {
    switch (status) {
      case "running":
        return "bg-green-500"; // Filled circle - green
      case "ghost":
        return "border-2 border-gray-500 bg-transparent"; // Empty circle - gray
      case "ghost-context":
        return "border-2 border-blue-500 bg-transparent ring-2 ring-blue-500/30"; // Empty + ring - blue
      case "starting":
        return "bg-yellow-500 opacity-60"; // Half-filled - yellow
      case "stopped":
        return "border-2 border-red-500 bg-transparent relative"; // Crossed - red
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="relative w-2 h-2 flex-shrink-0">
      <div className={`w-full h-full rounded-full ${getStatusClasses()}`}>
        {status === "stopped" && (
          <>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3 h-[1.5px] bg-red-500 rotate-45" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3 h-[1.5px] bg-red-500 -rotate-45" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
