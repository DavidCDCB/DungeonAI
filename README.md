# Dungeon AI Web

Versión web de **Dungeon AI**, adaptada a escritorio, con **Vite + Vue 3 + TypeScript + Tailwind CSS**. Usa el mismo prompt de Dungeon Master, la memoria persistente `[ESTADO]`, las 5 opciones, el lanzador de dados múltiple y la **voz del navegador**.

## Requisitos

- Node.js 22+ (probado con 22.11).
- No requiere servidor TTS ni API key de voz.

## Arrancar

```powershell
Set-Location "E:\NewBackup2\BackupCDCB\Algoritmos\protoWeb\dungeon-ai-web"
npm install
npm run dev
```

Abre `http://localhost:5173`. La primera vez se abre **Ajustes** porque no hay proveedor configurado.

## Configuración

| Campo | Valor por defecto |
|---|---|
| Proveedor | `OpenCode (proxy local)` |
| API key | vacía; la introduces tú |
| URL base | `/api/opencode` (proxy de Vite) |
| Modelo | `claude-haiku-5-5` |
| Razonamiento | `high` (`low`, `medium`, `high`, `xhigh`, `max`) |
| Tema | `Alta Fantasía` |
| Mundo | `Faerûn (Reinos Olvidados)` |
| Personaje | `Sabrina` |
| Clase | `Maga` |
| Raza | `Humana` |
| Voz | automática (mejor voz española del navegador) |

### Proveedores

El desplegable **Servicio** rellena la URL base y puedes cambiarla por la de cualquier endpoint compatible con OpenAI (la app añade `/chat/completions`):

| Proveedor | URL base |
|---|---|
| OpenCode (por defecto) | `/api/opencode` |
| OpenAI | `https://api.openai.com/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| DeepSeek | `https://api.deepseek.com/v1` |
| Ollama local | `http://localhost:11434/v1` |
| LM Studio local | `http://localhost:1234/v1` |
| Personalizado | cualquiera |

La API key se guarda en `localStorage` y viaja como `Authorization`; es opcional en servidores locales (`localhost`, `127.0.0.1`, rangos privados) y en el proxy de OpenCode es obligatoria. La URL base por defecto usa el proxy `/api/opencode` de Vite para evitar CORS. Si pones una URL directa, el servidor del modelo debe permitir CORS. En producción necesitas un proxy inverso equivalente para `/api/opencode`.

## Funciones

- Chat de varios mensajes con historial persistente en `localStorage`.
- Respuestas del DM con Markdown; las 5 opciones se muestran como botones solo en la última respuesta y desaparecen al responder.
- Memoria `[ESTADO]` persistente, editable en Ajustes y en el panel lateral; se reinyecta en cada turno.
- Marcador `[TIRADA]` y detección de peticiones de tirada; si el modelo olvida las opciones, la app pide completarlas automáticamente.
- Lanzador de dados con varias tiradas, tipos d4–d100, cantidad y bono; confirmación antes de enviar; configuración conservada hasta que se lanzan.
- Historial completo: no hay límite de 40 mensajes. Se envía todo lo que cabe en la ventana del modelo; si no cabe, se descartan los mensajes más antiguos. La app reserva 64k tokens para la salida.
- Contador de tokens sin porcentaje ni límite visible: muestra contexto y razonamiento del último turno, y el desglose exacto al pulsarlo.
- TTS del navegador con selección de voz, pausa/reanudación y lectura automática.
- Exportación e importación de todo el progreso en un único JSON.
- Layout de escritorio con panel lateral de sesión, campaña, memoria y voz; adaptación para pantallas menores.

## Progreso: exportar e importar

En **Ajustes → Progreso** hay dos botones:

- **Exportar JSON** descarga `dungeon-ai-progreso-AAAA-MM-DD.json` con historial, memoria `[ESTADO]`, contador de tokens, lanzador de dados y todos los ajustes, **incluida la API key**.
- **Importar JSON** reemplaza la partida actual tras pedir confirmación. Acepta archivos de la misma versión o anteriores y valida el formato; los mensajes o ajustes inválidos se normalizan o se descartan.

Formato del archivo:

```json
{
  "app": "dungeon-ai-web",
  "version": 1,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "settings": { "apiKey": "…", "baseUrl": "…", "model": "…" },
  "messages": [{ "role": "user", "content": "…" }],
  "state": "[ESTADO]…",
  "usage": { "prompt": 0, "completion": 0, "total": 0 },
  "dice": [{ "die": "d20", "count": "1", "bonus": "0" }]
}
```

El archivo contiene la API key en texto plano: guárdalo donde no se comparta.

## Voz

La app usa la **Web Speech API** del navegador:

- No requiere servidor ni key.
- Toma las voces instaladas en el sistema/navegador.
- La voz automática prioriza español de Colombia, Estados Unidos, México y España, y prefiere voces naturales/online.
- La pausa y reanudación usan `speechSynthesis.pause()` y `resume()`.
- Si el navegador bloquea la lectura automática, toca el altavoz del mensaje.

## Contador de tokens

La barra inferior muestra, por ejemplo:

```text
Contexto: 12k tokens
Razonamiento: 0 tokens
```

No hay `/1M` ni porcentaje. El desglose muestra entrada, salida, razonamiento, total, caché, mensajes enviados y modelo.

## Prompt

El prompt está en `src/prompts/dungeon_master.md`, copiado desde la app Android. Se interpolan:

- `{{tema}}`
- `{{mundo}}`
- `{{personaje}}` / `{{nombre}}`
- `{{clase}}`
- `{{raza}}`

La app añade la memoria vigente y el recordatorio de cierre en cada turno.

## Build y preview

```powershell
npm run build
npm run preview
```

`vite.config.ts` configura el proxy de OpenCode tanto en `server` como en `preview`. Para publicar en un servidor estático necesitas replicar ese proxy o mover el cliente API a un backend.

## Pruebas

```powershell
npm test
```

Cubren parser de opciones, memoria, dados, presupuesto de contexto, limpieza para TTS y mensajes.

## Estructura

```text
src/
├─ App.vue
├─ components/
│  ├─ ChatBubble.vue
│  ├─ SettingsDrawer.vue
│  ├─ DiceModal.vue
│  └─ ContextModal.vue
├─ composables/useGame.ts
├─ lib/
│  ├─ api.ts
│  ├─ contextBudget.ts
│  ├─ dice.ts
│  ├─ gameState.ts
│  ├─ messages.ts
│  ├─ options.ts
│  ├─ prompt.ts
│  ├─ providers.ts
│  ├─ storage.ts
│  ├─ transfer.ts
│  └─ ttsText.ts
├─ prompts/dungeon_master.md
└─ types.ts
tests/
```

## Notas

- La voz del navegador no requiere servidor ni API key; usa las voces instaladas en el sistema.
- No hay integración con motores TTS locales o servidores externos.
- En navegadores con políticas de autoplay estrictas, la lectura automática puede requerir un toque en el altavoz del mensaje.
- La app web no incluye el orbe ni la wake word de la versión Android; el resto del flujo de juego está portado.
