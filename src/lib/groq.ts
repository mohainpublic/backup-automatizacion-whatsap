import OpenAI from "openai";
import { getSystemPrompt } from "./system-prompt";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });
  }
  return _client;
}

export interface CalendarTool {
  name: "check_availability" | "book_appointment" | "list_appointments" | "cancel_appointment";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arguments: Record<string, any>;
}

export interface GenerateReplyResult {
  text: string | null;
  toolCall: CalendarTool | null;
  toolCallId: string | null;
  assistantMessage: OpenAI.Chat.ChatCompletionMessage | null;
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
          date: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
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
          time: { type: "string", description: "Hora en formato HH:MM (24h)" },
          client_name: { type: "string", description: "Nombre del cliente" },
          client_phone: { type: "string", description: "Teléfono del cliente" },
          service: {
            type: "string",
            description: "Tratamiento dental solicitado (endodoncia, periodoncia, cirugía oral, estética dental, odontopediatría, prótesis dental, ortodoncia, ortodoncia infantil, implantología dental, AquaCare, OrthoApnea, tratamiento láser, bruxismo).",
          },
          doctor: {
            type: "string",
            description: "Nombre del doctor con quien el paciente quiere la cita.",
          },
        },
        required: ["date", "time", "client_name", "client_phone", "service", "doctor"],
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

function buildHistory(
  history: { role: "user" | "assistant" | "human"; content: string }[]
): OpenAI.Chat.ChatCompletionMessageParam[] {
  return history.map((m) => ({
    role: (m.role === "human" ? "assistant" : m.role) as "user" | "assistant",
    content: m.content,
  }));
}

export async function generateReply(
  history: { role: "user" | "assistant" | "human"; content: string }[],
  _clientPhone: string
): Promise<GenerateReplyResult> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const response = await getClient().chat.completions.create({
    model,
    messages: [{ role: "system", content: getSystemPrompt() }, ...buildHistory(history)],
    tools: CALENDAR_TOOLS,
    tool_choice: "auto",
    max_tokens: 500,
  });

  const choice = response.choices[0];
  const assistantMsg = choice.message;

  if (choice.finish_reason === "tool_calls" && assistantMsg.tool_calls?.length) {
    const tc = assistantMsg.tool_calls[0];
    return {
      text: null,
      toolCall: {
        name: tc.function.name as CalendarTool["name"],
        arguments: JSON.parse(tc.function.arguments ?? "{}"),
      },
      toolCallId: tc.id,
      assistantMessage: assistantMsg,
    };
  }

  return {
    text: assistantMsg.content ?? "",
    toolCall: null,
    toolCallId: null,
    assistantMessage: null,
  };
}

export async function generateReplyAfterTool(
  history: { role: "user" | "assistant" | "human"; content: string }[],
  assistantMessage: OpenAI.Chat.ChatCompletionMessage,
  toolCallId: string,
  _toolName: string,
  toolResult: string
): Promise<string> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: getSystemPrompt() },
    ...buildHistory(history),
    assistantMessage as OpenAI.Chat.ChatCompletionMessageParam,
    { role: "tool", tool_call_id: toolCallId, content: toolResult },
  ];

  const response = await getClient().chat.completions.create({
    model,
    messages,
    max_tokens: 500,
  });

  return response.choices[0].message.content ?? "";
}
