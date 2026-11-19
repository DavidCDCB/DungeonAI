import promptBase from '../prompts/dungeon_master.md?raw'
import type { Settings } from '../types'
import { loreBlock } from './lore'

export const RECORDATORIO_CIERRE = `=====================
CIERRE OBLIGATORIO (VERIFICA ANTES DE RESPONDER)
=====================
- Orden: narración → bloque [ESTADO] … [/ESTADO] → cierre. Tus respuestas anteriores aparecen recortadas en el historial; esta debe ir completa.
- Si pides una tirada: la petición va al final de la narración, antes de [ESTADO], empieza con [TIRADA] y usa notación completa (p. ej. 1d20 + 5). Después de [/ESTADO] no escribas nada: ni opciones ni líneas {n. ...}.
- En cualquier otro caso, después de [/ESTADO] escribe exactamente 5 opciones, una por línea:
  {1. ...}
  {2. ...}
  {3. ...}
  {4. ...}
  {5. ...}
- Cada opción es una acción concreta del PERSONAJE en primera persona (o sus palabras entre comillas), sin Markdown; exactamente una lleva 🃏. Nada después de la quinta.
- Cada sección de [ESTADO] que escribas reemplaza a la guardada: escríbela completa. Omite «Combate:» si no hay combate.
- Una respuesta sin [ESTADO], o sin petición de tirada ni 5 opciones, es inválida.`

export const INSTRUCCION_REPARACION =
  '<No incluiste las 5 opciones en tu respuesta anterior. Si estabas pidiendo una tirada de dados, responde únicamente [TIRADA]. Si no, devuelve únicamente las 5 opciones de acción que correspondan, una por línea, con el formato {1. ...} a {5. ...}. No narres de nuevo ni incluyas [ESTADO].>'

function replaceAllLiteral(text: string, needle: string, value: string): string {
  return text.split(needle).join(value)
}

export function buildSystemPrompt(settings: Settings, gameState: string): string {
  // Un prompt personalizado reemplaza al original; vacío o solo espacios = original.
  let prompt = settings.customPrompt.trim() ? settings.customPrompt : promptBase
  prompt = replaceAllLiteral(prompt, '{{tema}}', settings.theme)
  prompt = replaceAllLiteral(prompt, '{{mundo}}', settings.world)
  prompt = replaceAllLiteral(prompt, '{{personaje}}', settings.character)
  prompt = replaceAllLiteral(prompt, '{{nombre}}', settings.character)
  prompt = replaceAllLiteral(prompt, '{{clase}}', settings.characterClass)
  prompt = replaceAllLiteral(prompt, '{{raza}}', settings.race)

  let result = prompt.trimEnd()
  // El lore va antes de la memoria: así el prefijo estable del prompt se puede cachear.
  const lore = loreBlock(settings.lore ?? '')
  if (lore) result += `\n\n${lore}`
  if (gameState.trim()) {
    result +=
      '\n\n=====================\n' +
      'MEMORIA GUARDADA DE LA PARTIDA\n' +
      '=====================\n\n' +
      gameState.trim() +
      '\n\n' +
      'Esta memoria es la fuente de verdad de la partida y prevalece ' +
      'sobre cualquier dato contradictorio del historial. Úsala para ' +
      'la hoja de personaje, el inventario, el dinero, las condiciones, ' +
      'las misiones y los PNJs; el jugador puede haberla corregido a mano. ' +
      'En tu respuesta, dentro del bloque [ESTADO], actualízala con los ' +
      'cambios de este turno y conserva todo lo que siga siendo válido: ' +
      'cada sección que escribas reemplaza a la guardada, así que escríbela completa.'
  }
  return `${result}\n\n${RECORDATORIO_CIERRE}`
}

export { promptBase }
