import promptBase from '../prompts/dungeon_master.md?raw'
import optionsPromptBase from '../prompts/dungeon_master_opciones.md?raw'
import statePromptBase from '../prompts/dungeon_master_estado.md?raw'
import compactionPromptBase from '../prompts/dungeon_master_compactar.md?raw'
import type { Settings } from '../types'
import { hasFullState } from './gameState'
import { loreBlock } from './lore'

export const RECORDATORIO_CIERRE = `=====================
CIERRE OBLIGATORIO (VERIFICA ANTES DE RESPONDER)
=====================
- Orden: narración → (si la pides) petición [TIRADA] al final → (solo si cambió tu cuaderno secreto) bloque [TRAMA] … [/TRAMA]. Tus respuestas anteriores aparecen recortadas en el historial; esta debe ir completa.
- No escribas [ESTADO] ni opciones {n. ...}: la memoria la actualiza un cronista a partir de tu narración y las opciones se piden aparte.
- Deja explícitos en la narración los cambios mecánicos (cifras de PG, objetos, dinero, espacios de conjuro, PX, lugar, aliados y misiones): lo que no narres no quedará en la memoria.
- Si pides una tirada: la petición va al final de la narración (antes de [TRAMA] si lo hay), empieza con [TIRADA] y usa notación completa (p. ej. 1d20 + 5). No resuelvas su efecto hasta recibir el resultado.
- Español claro y correcto: cada frase se entiende a la primera, sin referentes ambiguos, con la misma grafía para cada nombre y sin frases cortadas ni imágenes contradictorias.
- Una respuesta con [ESTADO] u opciones {n. ...} escritas por ti es inválida.`

/**
 * Orden con la que termina el historial de la segunda llamada de cada turno (sin tirada
 * pendiente). Las reglas están en `dungeon_master_opciones.md`, que es su prompt de sistema.
 */
export const INSTRUCCION_OPCIONES =
  '<Genera ahora las 5 opciones de acción para este momento de la partida, siguiendo tus instrucciones. Responde solo con las 5 líneas {1. ...} a {5. ...}.>'

/**
 * Orden con la que termina el historial de la llamada del Cronista de estado (cada turno).
 * Las reglas están en `dungeon_master_estado.md`, que es su prompt de sistema.
 */
export const INSTRUCCION_ESTADO =
  '<Actualiza la memoria con lo ocurrido en el último turno (la acción del jugador y la narración del DM), siguiendo tus instrucciones. Responde solo con el bloque [ESTADO] … [/ESTADO] con las secciones que cambiaron.>'

/**
 * Prompt del botón «Compactar» del editor de memoria. Es una acción manual del jugador,
 * nunca se ejecuta dentro del turno.
 */
export const COMPACTION_SYSTEM_PROMPT = compactionPromptBase

function replaceAllLiteral(text: string, needle: string, value: string): string {
  return text.split(needle).join(value)
}

function fillPlaceholders(prompt: string, settings: Settings): string {
  let result = prompt
  result = replaceAllLiteral(result, '{{tema}}', settings.theme)
  result = replaceAllLiteral(result, '{{mundo}}', settings.world)
  result = replaceAllLiteral(result, '{{personaje}}', settings.character)
  result = replaceAllLiteral(result, '{{nombre}}', settings.character)
  result = replaceAllLiteral(result, '{{clase}}', settings.characterClass)
  result = replaceAllLiteral(result, '{{raza}}', settings.race)
  return result
}

/**
 * Prompt de sistema de la segunda llamada: el Arquitecto de Opciones, con el canon del mundo
 * y la memoria vigente al empezar el turno (no espera al Cronista).
 */
export function buildOptionsPrompt(settings: Settings, gameState: string): string {
  let result = fillPlaceholders(optionsPromptBase, settings).trimEnd()
  const lore = loreBlock(settings.lore ?? '')
  if (lore) result += `\n\n${lore}`
  if (gameState.trim()) {
    result +=
      '\n\n=====================\n' +
      'MEMORIA GUARDADA DE LA PARTIDA\n' +
      '=====================\n\n' +
      gameState.trim() +
      '\n\n' +
      'Esta memoria es la fuente de verdad del estado actual del PERSONAJE y del mundo: ' +
      'las opciones deben ser posibles con esta hoja, este inventario y estos espacios.'
  }
  return result
}

/** Memoria que ve el Cronista; sin secciones de estado (solo, a lo sumo, la Trama) es el inicio de la campaña. */
function memoryForState(gameState: string): string {
  const memory = gameState.trim()
  if (hasFullState(memory)) return memory
  const note = '(aún sin secciones de estado: es el inicio de la campaña)'
  return memory ? `${memory}\n\n${note}` : note
}

/**
 * Prompt de sistema del Cronista de estado: el canon del mundo y la memoria *anterior* al
 * turno que debe registrar.
 */
export function buildStatePrompt(settings: Settings, gameState: string): string {
  let result = fillPlaceholders(statePromptBase, settings).trimEnd()
  const lore = loreBlock(settings.lore ?? '')
  if (lore) result += `\n\n${lore}`
  result +=
    '\n\n=====================\n' +
    'MEMORIA ANTERIOR A ESTE TURNO\n' +
    '=====================\n\n' +
    memoryForState(gameState) +
    '\n\n' +
    'Actualiza solo las secciones que cambiaron con lo que ocurre en la narración de este turno.'
  return result
}

export function buildSystemPrompt(settings: Settings, gameState: string): string {
  // Un prompt personalizado reemplaza al original; vacío o solo espacios = original.
  const prompt = fillPlaceholders(settings.customPrompt.trim() ? settings.customPrompt : promptBase, settings)

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
      'No la escribas ni la repitas: un cronista la actualizará después de ' +
      'tu respuesta a partir de lo que narres, así que deja claros los cambios. ' +
      'Solo «Trama (solo DM)» es tuya: anótala con un bloque [TRAMA] cuando cambie.'
  }
  return `${result}\n\n${RECORDATORIO_CIERRE}`
}

export { promptBase, optionsPromptBase, statePromptBase }
