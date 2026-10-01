import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const dataDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "messages.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    phone            TEXT UNIQUE NOT NULL,
    name             TEXT,
    mode             TEXT CHECK(mode IN ('AI','HUMAN')) NOT NULL DEFAULT 'AI',
    last_message_at  INTEGER,
    created_at       INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS messages (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id  INTEGER NOT NULL REFERENCES conversations(id),
    role             TEXT CHECK(role IN ('user','assistant','human')) NOT NULL,
    content          TEXT NOT NULL,
    created_at       INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conv
    ON messages(conversation_id, created_at);

  CREATE TABLE IF NOT EXISTS connection_state (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    status      TEXT CHECK(status IN ('disconnected','qr','connecting','connected'))
                  NOT NULL DEFAULT 'disconnected',
    qr_string   TEXT,
    phone       TEXT,
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  INSERT OR IGNORE INTO connection_state (id, status) VALUES (1, 'disconnected');

  CREATE TABLE IF NOT EXISTS outbox (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id  INTEGER NOT NULL,
    phone            TEXT NOT NULL,
    content          TEXT NOT NULL,
    sent             INTEGER NOT NULL DEFAULT 0,
    created_at       INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox(sent, created_at);
`);

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: "AI" | "HUMAN";
  last_message_at: number | null;
  created_at: number;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | "human";
  content: string;
  created_at: number;
}

export interface ConnectionState {
  id: 1;
  status: "disconnected" | "qr" | "connecting" | "connected";
  qr_string: string | null;
  phone: string | null;
  updated_at: number;
}

export interface OutboxItem {
  id: number;
  conversation_id: number;
  phone: string;
  content: string;
  sent: number;
  created_at: number;
}

// ── Conversaciones ───────────────────────────────────────────────────────────

const stmtGetConvByPhone = db.prepare<[string]>(
  "SELECT * FROM conversations WHERE phone = ?"
);
const stmtInsertConv = db.prepare<[string, string | null]>(
  "INSERT INTO conversations (phone, name) VALUES (?, ?) RETURNING *"
);
const stmtUpdateName = db.prepare<[string | null, string]>(
  "UPDATE conversations SET name = ? WHERE phone = ?"
);

export function getOrCreateConversation(
  phone: string,
  name?: string | null
): Conversation {
  let conv = stmtGetConvByPhone.get(phone) as Conversation | undefined;
  if (!conv) {
    conv = stmtInsertConv.get(phone, name ?? null) as Conversation;
  } else if (name && conv.name !== name) {
    stmtUpdateName.run(name, phone);
    conv.name = name;
  }
  return conv;
}

export function getConversationById(id: number): Conversation | null {
  return (
    (db.prepare<[number]>("SELECT * FROM conversations WHERE id = ?").get(id) as
      | Conversation
      | undefined) ?? null
  );
}

export function listConversations(): (Conversation & {
  last_message_preview: string | null;
})[] {
  return db
    .prepare(
      `SELECT c.*,
        (SELECT content FROM messages WHERE conversation_id = c.id
         ORDER BY created_at DESC LIMIT 1) AS last_message_preview
       FROM conversations c
       ORDER BY c.last_message_at DESC NULLS LAST`
    )
    .all() as (Conversation & { last_message_preview: string | null })[];
}

export function setMode(conversationId: number, mode: "AI" | "HUMAN") {
  db.prepare<[string, number]>(
    "UPDATE conversations SET mode = ? WHERE id = ?"
  ).run(mode, conversationId);
}

export const deleteConversation = db.transaction((id: number) => {
  db.prepare<[number]>(
    "DELETE FROM outbox WHERE conversation_id = ? AND sent = 0"
  ).run(id);
  db.prepare<[number]>("DELETE FROM messages WHERE conversation_id = ?").run(id);
  db.prepare<[number]>("DELETE FROM conversations WHERE id = ?").run(id);
});

// ── Mensajes ─────────────────────────────────────────────────────────────────

const insertAndUpdateTs = db.transaction(
  (conversationId: number, role: string, content: string) => {
    const msg = db
      .prepare<[number, string, string]>(
        "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?) RETURNING *"
      )
      .get(conversationId, role, content) as Message;
    db.prepare<[number]>(
      "UPDATE conversations SET last_message_at = unixepoch() WHERE id = ?"
    ).run(conversationId);
    return msg;
  }
);

export function insertMessage(
  conversationId: number,
  role: "user" | "assistant" | "human",
  content: string
): Message {
  return insertAndUpdateTs(conversationId, role, content);
}

export function getMessages(
  conversationId: number,
  limit = 50
): Message[] {
  return db
    .prepare<[number, number]>(
      `SELECT * FROM messages WHERE conversation_id = ?
       ORDER BY created_at DESC, id DESC LIMIT ?`
    )
    .all(conversationId, limit)
    .reverse() as Message[];
}

export function getRecentHistory(
  conversationId: number,
  limit = 20
): Message[] {
  const rows = db
    .prepare<[number, number]>(
      `SELECT * FROM messages WHERE conversation_id = ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(conversationId, limit) as Message[];
  return rows.reverse();
}

// ── Estado de conexión ───────────────────────────────────────────────────────

export function getConnectionState(): ConnectionState {
  return db
    .prepare("SELECT * FROM connection_state WHERE id = 1")
    .get() as ConnectionState;
}

export function setConnectionState(patch: {
  status?: ConnectionState["status"];
  qr_string?: string | null;
  phone?: string | null;
}) {
  const current = getConnectionState();
  const next = {
    status: patch.status !== undefined ? patch.status : current.status,
    qr_string:
      patch.qr_string !== undefined ? patch.qr_string : current.qr_string,
    phone: patch.phone !== undefined ? patch.phone : current.phone,
  };
  db.prepare(
    `UPDATE connection_state
     SET status = ?, qr_string = ?, phone = ?, updated_at = unixepoch()
     WHERE id = 1`
  ).run(next.status, next.qr_string, next.phone);
}

// ── Outbox ───────────────────────────────────────────────────────────────────

export function enqueueOutbox(
  conversationId: number,
  phone: string,
  content: string
): void {
  db.prepare<[number, string, string]>(
    "INSERT INTO outbox (conversation_id, phone, content) VALUES (?, ?, ?)"
  ).run(conversationId, phone, content);
}

export function getPendingOutbox(limit = 20): OutboxItem[] {
  return db
    .prepare<[number]>(
      "SELECT * FROM outbox WHERE sent = 0 ORDER BY created_at ASC LIMIT ?"
    )
    .all(limit) as OutboxItem[];
}

export function markOutboxSent(id: number): void {
  db.prepare<[number]>("UPDATE outbox SET sent = 1 WHERE id = ?").run(id);
}

export default db;
