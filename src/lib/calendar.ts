import { google } from "googleapis";

function getCalendar() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.calendar({ version: "v3", auth });
}

const CALENDAR_ID   = () => process.env.GOOGLE_CALENDAR_ID             ?? "primary";
const TIMEZONE      = () => process.env.BUSINESS_TIMEZONE              ?? "Europe/Madrid";
const DURATION      = () => parseInt(process.env.APPOINTMENT_DURATION_MINUTES ?? "60", 10);
const HOURS_START   = () => process.env.BUSINESS_HOURS_START           ?? "09:00";
const MORNING_END   = () => process.env.BUSINESS_MORNING_END           ?? "13:00";
const AFTERNOON_START = () => process.env.BUSINESS_AFTERNOON_START     ?? "16:00";
const HOURS_END     = () => process.env.BUSINESS_HOURS_END             ?? "20:00";

export interface TimeSlot {
  start: string;
  end: string;
  label: string; // "09:00 - 10:00" in business timezone
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  description: string | null;
}

/**
 * Converts "HH:MM" on a given date from the business timezone to UTC.
 * Uses sv-SE locale (ISO-like output) to avoid machine-timezone issues.
 */
function zonedTimeToUTC(dateStr: string, timeStr: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  const tz = TIMEZONE();

  // Naive guess: treat the desired local time as UTC
  const naive = new Date(
    `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`
  );

  // Find what local time this UTC maps to in the business timezone
  const displayed = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  }).format(naive); // "YYYY-MM-DD HH:MM"

  const tzH = parseInt(displayed.slice(11, 13), 10);
  const tzM = parseInt(displayed.slice(14, 16), 10);

  // Shift: (wanted - displayed) compensates for the UTC offset
  const diffMins = (h * 60 + m) - (tzH * 60 + tzM);
  return new Date(naive.getTime() + diffMins * 60_000);
}

function localLabel(utcDate: Date): string {
  return utcDate.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIMEZONE(),
  });
}

/**
 * Generates slots respecting the morning/afternoon split and day-of-week rules:
 * - Sunday → closed (no slots)
 * - Saturday → morning only (9:00–13:00)
 * - Mon–Fri → morning + afternoon (9:00–13:00 and 16:00–20:00)
 */
function generateSlots(date: string): { start: Date; end: Date }[] {
  // Use noon UTC so the day-of-week is unambiguous for any timezone
  const dayOfWeek = new Date(`${date}T12:00:00Z`).getDay(); // 0=Sun, 6=Sat

  if (dayOfWeek === 0) return []; // Sunday — closed

  const dur = DURATION();
  const periods =
    dayOfWeek === 6
      ? [{ from: HOURS_START(), to: MORNING_END() }]               // Saturday: morning only
      : [
          { from: HOURS_START(),     to: MORNING_END()    },       // Mon–Fri morning
          { from: AFTERNOON_START(), to: HOURS_END()      },       // Mon–Fri afternoon
        ];

  const slots: { start: Date; end: Date }[] = [];

  for (const { from, to } of periods) {
    const limit = zonedTimeToUTC(date, to);
    let cur    = zonedTimeToUTC(date, from);

    if (cur >= limit) continue;

    while (cur < limit) {
      const next = new Date(cur.getTime() + dur * 60_000);
      if (next <= limit) slots.push({ start: new Date(cur), end: new Date(next) });
      cur = next;
    }
  }

  return slots;
}

export async function checkAvailability(date: string): Promise<TimeSlot[]> {
  const cal   = getCalendar();
  const slots = generateSlots(date);
  if (!slots.length) return [];

  const timeMin = slots[0].start.toISOString();
  const timeMax = slots[slots.length - 1].end.toISOString();

  const res = await cal.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: TIMEZONE(),
      items: [{ id: CALENDAR_ID() }],
    },
  });

  const busy = res.data.calendars?.[CALENDAR_ID()]?.busy ?? [];

  console.log(`[cal] freebusy ${date}: ${busy.length} bloques ocupados`, busy);

  const available = slots.filter((slot) =>
    !busy.some((b) => {
      const bs = new Date(b.start!).getTime();
      const be = new Date(b.end!).getTime();
      return slot.start.getTime() < be && slot.end.getTime() > bs;
    })
  );

  return available.map((s) => ({
    start: s.start.toISOString(),
    end:   s.end.toISOString(),
    label: `${localLabel(s.start)} - ${localLabel(s.end)}`,
  }));
}

export async function bookAppointment(params: {
  date: string;
  time: string;
  client_name: string;
  client_phone: string;
  service?: string;
  doctor?: string;
}): Promise<CalendarEvent> {
  const cal   = getCalendar();
  const dur   = DURATION();
  const start = zonedTimeToUTC(params.date, params.time);
  const end   = new Date(start.getTime() + dur * 60_000);

  // Pre-check: abort if slot is already taken
  const busyRes = await cal.freebusy.query({
    requestBody: {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      timeZone: TIMEZONE(),
      items: [{ id: CALENDAR_ID() }],
    },
  });
  const conflicts = busyRes.data.calendars?.[CALENDAR_ID()]?.busy ?? [];
  if (conflicts.length > 0) {
    throw new Error(`SLOT_TAKEN:${params.time}`);
  }

  const doctorPart = params.doctor ? ` · ${params.doctor}` : "";
  const summary    = params.service
    ? `${params.service} — ${params.client_name}${doctorPart}`
    : `Cita — ${params.client_name}${doctorPart}`;

  const res = await cal.events.insert({
    calendarId: CALENDAR_ID(),
    requestBody: {
      summary,
      description: `Teléfono: ${params.client_phone}${params.doctor ? `\nDoctor: ${params.doctor}` : ""}`,
      start: { dateTime: start.toISOString(), timeZone: TIMEZONE() },
      end:   { dateTime: end.toISOString(),   timeZone: TIMEZONE() },
    },
  });

  return {
    id:          res.data.id!,
    summary:     res.data.summary!,
    start:       res.data.start?.dateTime!,
    end:         res.data.end?.dateTime!,
    description: res.data.description ?? null,
  };
}

export async function listAppointmentsByPhone(clientPhone: string): Promise<CalendarEvent[]> {
  const cal = getCalendar();
  const res = await cal.events.list({
    calendarId: CALENDAR_ID(),
    timeMin: new Date().toISOString(),
    q: clientPhone,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 10,
  });

  return (res.data.items ?? []).map((e) => ({
    id:          e.id!,
    summary:     e.summary ?? "",
    start:       e.start?.dateTime ?? e.start?.date ?? "",
    end:         e.end?.dateTime   ?? e.end?.date   ?? "",
    description: e.description ?? null,
  }));
}

export async function cancelAppointment(eventId: string): Promise<void> {
  const cal = getCalendar();
  await cal.events.delete({ calendarId: CALENDAR_ID(), eventId });
}

export async function listUpcomingAppointments(maxResults = 20): Promise<CalendarEvent[]> {
  const cal = getCalendar();
  const res = await cal.events.list({
    calendarId: CALENDAR_ID(),
    timeMin: new Date().toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults,
  });

  return (res.data.items ?? []).map((e) => ({
    id:          e.id!,
    summary:     e.summary ?? "",
    start:       e.start?.dateTime ?? e.start?.date ?? "",
    end:         e.end?.dateTime   ?? e.end?.date   ?? "",
    description: e.description ?? null,
  }));
}
