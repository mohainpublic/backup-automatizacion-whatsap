/**
 * Script para obtener el Google OAuth refresh token.
 * Uso: node get-token.js
 *
 * Requisitos previos:
 *  1. Crea un proyecto en https://console.cloud.google.com
 *  2. Activa la API "Google Calendar API"
 *  3. Crea credenciales OAuth 2.0 (tipo "Aplicación web")
 *     - URI de redirección autorizada: http://localhost:3001/callback
 *  4. Copia el Client ID y Client Secret en .env.local
 *  5. Ejecuta: node get-token.js
 */

const http = require("http");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

// Leer .env.local manualmente
const envPath = path.resolve(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq < 0 || line.startsWith("#")) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT = "http://localhost:3001/callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "\n❌  Faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET en .env.local\n" +
    "    Añádelos antes de ejecutar este script.\n"
  );
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);

const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/calendar"],
});

console.log("\n1. Abre esta URL en tu navegador:\n");
console.log("   " + url + "\n");
console.log("2. Autoriza la aplicación con tu cuenta de Google.");
console.log("3. Serás redirigido automáticamente aquí.\n");

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost:3001");
  if (u.pathname !== "/callback") return;

  const code = u.searchParams.get("code");
  if (!code) {
    res.end("Error: no se recibió el código.");
    return;
  }

  try {
    const { tokens } = await oauth2.getToken(code);

    res.end(`
      <html><body style="font-family:sans-serif;padding:2rem">
        <h2>✅ Autorización completada</h2>
        <p>Copia el token de la terminal y cierra esta ventana.</p>
      </body></html>
    `);

    console.log("\n✅  Tokens obtenidos:\n");
    console.log("   GOOGLE_REFRESH_TOKEN=" + tokens.refresh_token);
    console.log("\nCopia esa línea en tu .env.local y ya puedes usar el calendario.\n");

    server.close();
  } catch (err) {
    res.end("Error al obtener tokens: " + err.message);
    console.error("Error:", err);
    server.close();
  }
});

server.listen(3001, () => {
  console.log("Esperando autorización en http://localhost:3001/callback ...\n");
});
