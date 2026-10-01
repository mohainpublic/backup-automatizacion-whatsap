interface Props {
  role: "user" | "assistant" | "human";
  content: string;
  createdAt: number;
}

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessageBubble({ role, content, createdAt }: Props) {
  if (role === "user") {
    return (
      <div className="flex justify-start mb-2">
        <div className="max-w-xs lg:max-w-md">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-tl-sm px-4 py-2 text-sm text-gray-100">
            {content}
          </div>
          <div className="text-xs text-gray-500 mt-1 ml-1">{formatTime(createdAt)}</div>
        </div>
      </div>
    );
  }

  if (role === "assistant") {
    return (
      <div className="flex justify-end mb-2">
        <div className="max-w-xs lg:max-w-md">
          <div className="bg-emerald-900 border border-emerald-700 rounded-2xl rounded-tr-sm px-4 py-2 text-sm text-emerald-100">
            {content}
          </div>
          <div className="text-xs text-gray-500 mt-1 text-right mr-1">
            IA · {formatTime(createdAt)}
          </div>
        </div>
      </div>
    );
  }

  // role === "human"
  return (
    <div className="flex justify-end mb-2">
      <div className="max-w-xs lg:max-w-md">
        <div className="bg-amber-900 border border-amber-700 rounded-2xl rounded-tr-sm px-4 py-2 text-sm text-amber-100">
          {content}
        </div>
        <div className="text-xs text-gray-500 mt-1 text-right mr-1">
          Tú · {formatTime(createdAt)}
        </div>
      </div>
    </div>
  );
}
