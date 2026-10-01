# Agente WhatsApp — Sistema de Reservas (Demo para Negocios)

Bot de WhatsApp con IA configurado como demo para clínicas y negocios. Gestiona citas via Google Calendar con dashboard protegido. Contexto predeterminado: clínica genérica sin nombre específico, listo para personalizar por cada negocio.

## Requisitos

- Node.js 20+ (recomendado: 22)
- Cuenta en [OpenRouter](https://openrouter.ai) con créditos cargados
- Proyecto Google Cloud con Google Calendar API habilitada

---

## Configuración inicial

### 1. Instalar dependencias

```bash
npm install
```

### 2. Crear `.env.local`

Copia `.env.example` a `.env.local` y rellena los valores:

```bash
cp .env.example .env.local
```

```env
# OpenRouter — recomendado gpt-4o-mini ($0.15/M tokens)
# Los modelos :free tienen límite de 50 req/día y fallan en producción
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=openai/gpt-4o-mini

# Google Calendar
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_CALENDAR_ID=primary
BUSINESS_TIMEZONE=Europe/Madrid
BUSINESS_HOURS_START=09:00
BUSINESS_HOURS_END=20:00
APPOINTMENT_DURATION_MINUTES=60

# Dashboard auth
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=tu_clave_segura
SESSION_SECRET=cadena_aleatoria_larga_y_secreta
```

### 3. Obtener GOOGLE_REFRESH_TOKEN

1. Ve a [Google Cloud Console](https://console.cloud.google.com) → APIs → Calendar API → Habilitar
2. Crea credenciales OAuth2 (tipo "Aplicación de escritorio")
3. Descarga el JSON con client_id y client_secret
4. Usa [OAuth Playground](https://developers.google.com/oauthplayground) con tu client_id:
   - Scope: `https://www.googleapis.com/auth/calendar`
   - Intercambia el code por tokens y copia el `refresh_token`

---

## Arrancar en desarrollo

```bash
# Terminal 1 — bot de WhatsApp
npm run start:bot

# Terminal 2 — dashboard Next.js
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). La primera vez verás la pantalla de login, luego el QR para vincular tu WhatsApp.

O todo junto:
```bash
npm run start:all
```

---

## Personalizar el bot (para cada cliente)

Edita [src/lib/system-prompt.ts](src/lib/system-prompt.ts) con los datos reales del negocio:
- Nombre de la clínica o negocio
- Dirección y teléfono reales
- Servicios específicos que ofrece
- Horarios ajustados

El contexto por defecto es una clínica genérica sin nombre, pensada como demo. El bot ya sabe usar Google Calendar; solo adapta el texto a cada cliente.

---

## Despliegue en producción (EasyPanel / Railway)

1. Sube el repo a GitHub (sin `auth/`, `data/`, `.env.local`)
2. En EasyPanel: nuevo servicio → selecciona el repo
3. Variables de entorno: copia todo el contenido de `.env.local`
4. Volúmenes persistentes **obligatorios**:
   - `/app/data` — base de datos SQLite
   - `/app/auth` — sesión de WhatsApp (sin esto tendrás que re-escanear en cada redespliegue)

### IMPORTANTE — Seguridad

El dashboard tiene login pero **no usa HTTPS por defecto en desarrollo local**. En producción:

- Pon el servicio detrás de un proxy con TLS (EasyPanel y Railway lo hacen automáticamente)
- Cambia `DASHBOARD_PASSWORD` y `SESSION_SECRET` a valores seguros y únicos
- Si necesitas acceso multi-usuario, añade basic auth a nivel proxy (Caddy/Nginx) como capa extra

---

## Mejoras pendientes (v2)

- Soporte imágenes y archivos salientes (enviar PDF de menú/precios)
- Function calling avanzado con confirmación de cita por email
- Auto-toggle a modo HUMAN cuando el bot detecta frase clave ("hablar con humano")
- WebSocket en lugar de polling para menor latencia
- Múltiples usuarios con roles (admin / operador) en el dashboard
- Notificaciones push cuando llega un mensaje nuevo
