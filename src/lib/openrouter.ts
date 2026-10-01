import OpenAI from "openai";
import { getSystemPrompt } from "./system-prompt";
const SYSTEM_PROMPT = getSystemPrompt();

// Inicialización lazy para que env-loader tenga tiempo de correr
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY ?? "",
      baseURL: "https://openrouter.ai/api/v1",
    });
  }
  return _client;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CalendarTool {
  name: "check_availability" | "book_appointment" | "list_appointments" | "cancel_appointment";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arguments: Record<string, any>;
}

export interface GenerateReplyResult {
  text: string | null;
  toolCall: CalendarTool | null;
}

const CALENDAR_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "check_availability",
      description:
        "Consulta los huecos disponibles en el calendario para una fecha dada. Devuelve una lista de franjas horarias libres.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Fecha en formato YYYY-MM-DD",
          },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description:
        "Reserva una cita en el calendario para el cliente. Usar solo cuando el cliente haya confirmado fecha y hora.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
          time: {
            type: "string",
            description: "Hora en formato HH:MM (24h)",
          },
          client_name: { type: "string", description: "Nombre del cliente" },
          client_phone: { type: "string", description: "Teléfono del cliente" },
          service: {
            type: "string",
            description: "Tratamiento dental solicitado (endodoncia, periodoncia, cirugía oral, estética dental, odontopediatría, prótesis dental, ortodoncia, ortodoncia infantil, implantología dental, AquaCare, OrthoApnea, tratamiento láser, bruxismo).",
          },
        },
        required: ["date", "time", "client_name", "client_phone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_appointments",
      description:
        "Lista las citas del cliente por su número de teléfono. Usar cuando el cliente pregunta por sus reservas.",
      parameters: {
        type: "object",
        properties: {
          client_phone: { type: "string", description: "Teléfono del cliente" },
        },
        required: ["client_phone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_appointment",
      description:
        "Cancela una cita existente. Usar solo cuando el cliente confirme explícitamente que quiere cancelar.",
      parameters: {
        type: "object",
        properties: {
          event_id: {
            type: "string",
            description: "ID del evento de Google Calendar a cancelar",
          },
        },
        required: ["event_id"],
      },
    },
  },
];

export async function generateReply(
  history: { role: "user" | "assistant" | "human"; content: string }[],
  clientPhone: string
): Promise<GenerateReplyResult> {
  const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({
      role: (m.role === "human" ? "assistant" : m.role) as "user" | "assistant",
      content: m.content,
    })),
  ];

  const response = await getClient().chat.completions.create({
    model,
    messages,
    tools: CALENDAR_TOOLS,
    tool_choice: "auto",
    max_tokens: 500,
  });

  const choice = response.choices[0];

  // El LLM quiere llamar a una herramienta del calendario
  if (choice.finish_reason === "tool_calls" && choice.message.tool_calls?.length) {
    const tc = choice.message.tool_calls[0];
    return {
      text: null,
      toolCall: {
        name: tc.function.name as CalendarTool["name"],
        arguments: JSON.parse(tc.function.arguments ?? "{}"),
      },
    };
  }

  return {
    text: choice.message.content ?? "",
    toolCall: null,
  };
}

// Segunda llamada al LLM después de ejecutar la tool, para que redacte la respuesta final
export async function generateReplyAfterTool(
  history: { role: "user" | "assistant" | "human"; content: string }[],
  toolName: string,
  toolResult: string
): Promise<string> {
  const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({
      role: (m.role === "human" ? "assistant" : m.role) as "user" | "assistant",
      content: m.content,
    })),
    {
      role: "tool" as const,
      tool_call_id: "local",
      content: toolResult,
    },
  ];

  const response = await getClient().chat.completions.create({
    model,
    messages,
    max_tokens: 500,
  });

  return response.choices[0].message.content ?? "";
}
