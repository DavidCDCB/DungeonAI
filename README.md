# Dungeon AI Web

Partidas de rol en español con un **Dungeon Master de IA**, hechas con **Vite + Vue 3 + TypeScript + Tailwind CSS 4**. Narración en streaming, 5 opciones como botones, lanzador de dados con ventaja/desventaja, memoria `[ESTADO]` persistente, voz del navegador y **PWA instalable** que funciona sin conexión. Lista para desplegar en **Vercel** (incluido Vercel Drop).

## Requisitos

- Node.js 22+ (probado con 22.11).
- No requiere servidor TTS ni API key de voz.

## Arrancar

```powershell
Set-Location "E:\NewBackup2\BackupCDCB\Algoritmos\protoWeb\dungeon-ai-web"
npm install
npm run dev
```

Abre `http://localhost:5173`. La primera vez se abre **Ajustes → Conexión** porque no hay proveedor configurado. Usa **Probar conexión** para validar URL, key y modelo antes de jugar.

## Funciones

### Partida
- **Streaming:** el texto del DM aparece mientras se escribe. Mientras tanto se ocultan el bloque `[ESTADO]` y las opciones a medio escribir. Un indicador muestra la fase (consultando notas, pensando, escribiendo), el tiempo y los tokens de razonamiento. **Detener** cancela el turno.
- **Opciones** como botones numerados (atajos `1`–`5`). La opción 🃏 se destaca como *comodín* y cualquier opción se puede editar antes de enviarla.
- **Regenerar** la última respuesta del DM; si falla, se restaura la anterior.
- **Editar** cualquier mensaje tuyo: deshace desde ese punto, devuelve el texto al cuadro y la memoria vuelve a como estaba. El aviso trae **Deshacer**.
- **Comandos OOC** desde el menú del compositor: hoja, inventario, misiones, resumen, «lanza por mí», cambiar de escena.
- El borrador se guarda solo. Las campañas largas se paginan (60 mensajes, «Mostrar anteriores»).

### Dados
- Cuando el DM pide una tirada, la app lee la notación (`1d20 + 5`, `1d8`, «con ventaja», «6 grupos de 4d6 descartando el más bajo») y ofrece botones **Lanzar 1d20 + 5**.
- Lanzador con d4–d100, cantidad, modificador, **ventaja/desventaja** y **descartar el menor**, varias tiradas por mensaje y sugerencias del DM.
- La tirada se envía en el mismo momento en que se lanza. La animación es solo visual, así que cerrar el diálogo no permite repetirla. Los resultados se muestran como tarjetas, con el dado descartado tachado y el **crítico** o la **pifia** resaltados.

### Memoria y panel
- Panel lateral (escritorio) o cajón (móvil) con personaje, **escena**, **combate activo**, hoja, inventario, dinero, condiciones, misiones y PNJs.
- La sección **Trama (solo DM)** está oculta por defecto (spoilers); se puede mostrar en *Lectura y voz*.
- Editor de memoria dedicado. Cada turno guarda una instantánea de la memoria, lo que permite deshacer y regenerar sin corromperla.

### Lectura y voz
- Tamaño de texto (pequeño/normal/grande) y letra de narración (Literata «libro» o Inter «moderna»). Letra capital en cada escena.
- Voz del navegador con selector, **Probar**, velocidad y lectura automática. El texto se lee por fragmentos para evitar el corte de ~15 s de Chrome con voces largas.

### Conexión y contexto
- Proveedores OpenAI-compatibles (OpenCode, OpenAI, OpenRouter, Groq, DeepSeek, Ollama, LM Studio, personalizado).
- **Ventana de contexto** configurable (32k–1M). Si el modelo informa una ventana menor, la app la detecta, reintenta y la guarda.
- Reintentos automáticos: sin `stream_options`, sin streaming, sin `reasoning_effort` o con menos razonamiento, según lo que soporte el proveedor.
- Contador de tokens sin porcentaje: contexto y razonamiento del último turno, con el desglose al pulsarlo.

### Datos
- Autoguardado en `localStorage`, con aviso si el almacenamiento se llena y medidor de uso en *Ajustes → Datos*.
- **Exportar/Importar** la partida en JSON. Por defecto **sin la API key**; al importar un archivo sin key se conserva la de este navegador.

### Móvil (probado con el viewport del POCO X7 Pro, 407×904)
- El teclado encoge la app (`interactive-widget=resizes-content`): el compositor queda sobre el teclado y el chat sigue anclado al final.
- Compositor en una sola fila (dados · comandos · texto · enviar); la línea de tokens se oculta mientras escribes.
- Funciona con Gboard: el botón Enviar se activa aunque la palabra siga «en composición».
- Objetivos táctiles de 40–44 px y acciones de los mensajes siempre visibles en pantallas táctiles (también en horizontal).
- El gesto **atrás** de Android cierra el diálogo abierto en lugar de salir de la app.
- Pantalla encendida mientras el DM piensa, escribe o lee en voz alta (Screen Wake Lock), y vibración al lanzar dados (más marcada con críticos y pifias).
- Sin «tirar para recargar»; aviso antes de recargar con un turno en curso.
- Lectura a 16 px en pantallas estrechas; cabecera y compositor compactos en horizontal.
- El manifest incluye capturas para el diálogo de instalación enriquecido de Chrome.

### Accesibilidad
- Diálogos con foco atrapado, `Esc` y restauración del foco; región `aria-live` para avisar de respuestas nuevas; enlace «saltar al compositor»; respeta `prefers-reduced-motion`.
- Atajos: `1`–`5` opciones · `D` dados · `/` escribir · `Esc` cerrar.

## PWA

- Instalable (botón **Instalar app** en la cabecera o en *Ajustes → Datos*; en iOS: Compartir → «Añadir a pantalla de inicio»).
- El service worker precachea la app, las fuentes (subconjunto latino, locales) y los iconos: abre sin conexión. Las llamadas al modelo (`/api/…`) nunca se cachean.
- Aviso de **nueva versión** con botón *Actualizar*; indicador *Sin conexión* en la cabecera.
- Iconos generados desde `public/favicon.svg` con `npm run icons`.

## Desplegar en Vercel

`vercel.json` define el proxy `/api/opencode` → `https://opencode.ai/inference/go/openai/v1` como **rewrite externo** (OpenCode no permite CORS), las cabeceras de seguridad (CSP, `X-Frame-Options`, etc.) y la caché correcta de `sw.js`, el manifest y `/assets`. No hace falta ninguna función serverless.

### Opción A — Vercel Drop sin compilar en Vercel (funciona sin cuenta)

```powershell
npm run build
```

Arrastra la carpeta **`dist/`** a [vercel.com/drop](https://vercel.com/drop). El build copia en `dist/vercel.json` el proxy y las cabeceras (sin las opciones de build), así que `dist/` es un sitio estático completo. Sin cuenta, el despliegue es temporal hasta que lo reclames.

### Opción B — Vercel compila el proyecto (requiere cuenta)

Arrastra la carpeta del proyecto (o súbela a Git y conéctala). Vercel detecta Vite y usa `npm run build` y `dist` según `vercel.json`. `.vercelignore` excluye `node_modules` y `dist`.

### Notas de producción
- El CDN de Vercel espera hasta **120 s** al primer byte de un rewrite externo. Deja el **streaming activado** (por defecto): sin él, el razonamiento `max` puede superar ese límite.
- La API key la pone cada jugador en su navegador y viaja al proveedor a través del proxy; no se guarda en el servidor.
- Desde una página HTTPS, el navegador bloquea URLs `http://` que no sean `localhost`. Ollama o LM Studio funcionan en `http://localhost` del propio equipo.

## Prompt del Dungeon Master

`src/prompts/dungeon_master.md` define el contrato entre el DM y la app:

- Orden de cada respuesta: narración → `[ESTADO]…[/ESTADO]` → cierre. Una petición de tirada (`[TIRADA]` con notación completa) va al final de la narración; si no hay tirada, van 5 opciones en primera persona y una con 🃏.
- Cada sección de `[ESTADO]` reemplaza entera a la guardada. `Combate:` se omite al terminar el combate, y `Trama (solo DM)` es secreta.
- Documenta el formato exacto de los mensajes del lanzador de dados y avisa al modelo de que su historial le llega sin `[ESTADO]` ni opciones (para que no imite el recorte).
- Se interpolan `{{tema}}`, `{{mundo}}`, `{{personaje}}`/`{{nombre}}`, `{{clase}}` y `{{raza}}`. La app añade la memoria vigente y un recordatorio de cierre (`src/lib/prompt.ts`).

`tests/prompt.test.ts` comprueba que el prompt y el parser encajan: la plantilla `[ESTADO]` produce todas las secciones, los ejemplos de dados coinciden con lo que genera el lanzador, los ejemplos de petición producen botones y los comandos del menú están documentados.

## Exportar e importar

```json
{
  "app": "dungeon-ai-web",
  "version": 1,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "settings": { "apiKey": "", "baseUrl": "…", "model": "…", "stream": true, "contextWindow": 1000000 },
  "messages": [{ "role": "assistant", "content": "…", "memory": "Escena: …" }],
  "state": "Escena: …",
  "usage": { "prompt": 0, "completion": 0, "total": 0 },
  "dice": [{ "die": "d20", "count": "1", "bonus": "5", "mode": "advantage" }]
}
```

Los archivos de versiones anteriores siguen siendo compatibles (`memory` y `mode` son opcionales).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con proxy de OpenCode |
| `npm run build` | Typecheck + build de producción (PWA y `dist/vercel.json`) |
| `npm run preview` | Sirve `dist/` con el proxy de Vite |
| `npm test` | Pruebas (Vitest) |
| `npm run icons` | Regenera los iconos PWA desde `public/favicon.svg` |

## Estructura

```text
src/
├─ App.vue                    layout, atajos de teclado, nueva partida
├─ components/
│  ├─ AppDialog.vue           base de diálogos y cajones accesibles
│  ├─ AppHeader.vue · AppLogo.vue
│  ├─ ChatLog.vue             lista, scroll durante el streaming, paginación
│  ├─ DmMessage.vue · PlayerMessage.vue · OptionList.vue · ThinkingIndicator.vue
│  ├─ Composer.vue            entrada, banner de tirada, comandos, estado
│  ├─ DiceModal.vue · DiceRollCard.vue
│  ├─ SidePanel.vue · MemoryDialog.vue · ContextModal.vue
│  ├─ SettingsDrawer.vue      pestañas Conexión / Campaña / Lectura y voz / Datos
│  └─ ConfirmHost.vue · ToastHost.vue · EmptyState.vue
├─ composables/
│  ├─ useGame.ts              estado de la partida, turnos, dados, voz
│  ├─ usePwa.ts · useToasts.ts · useConfirm.ts · useDialogStack.ts
├─ lib/
│  ├─ api.ts                  cliente OpenAI-compatible con streaming y reintentos
│  ├─ sse.ts                  parser SSE y lectura de errores de contexto
│  ├─ dice.ts                 tiradas, modos, sugerencias y lectura de resultados
│  ├─ gameState.ts            memoria [ESTADO], secciones e instantáneas
│  ├─ messages.ts · options.ts · markdown.ts · ttsText.ts
│  ├─ prompt.ts · commands.ts · providers.ts · contextBudget.ts
│  └─ storage.ts · transfer.ts · format.ts
├─ prompts/dungeon_master.md
└─ types.ts
tests/                         Vitest: lógica, parser y contrato con el prompt
vercel.json · pwa-assets.config.ts · .vercelignore
```
