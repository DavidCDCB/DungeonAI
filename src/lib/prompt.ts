import promptBase from '../prompts/dungeon_master.md?raw'
import type { Settings } from '../types'

export const RECORDATORIO_CIERRE = `=====================
CIERRE OBLIGATORIO (VERIFICA ANTES DE RESPONDER)
=====================
- Si pides una tirada de dados: empieza la solicitud con [TIRADA] y NO escribas opciones ni líneas {n. ...}.
- En cualquier otro caso: escribe exactamente 5 opciones, una por línea:
  {1. ...}
  {2. ...}
  {3. ...}
  {4. ...}
  {5. ...}
- Nada de viñetas, listas numeradas, negritas ni texto después de la quinta.
- El bloque [ESTADO] va antes de las opciones.
- Cada opción es una acción concreta del PERSONAJE, no una pregunta ni un resumen.
- Si faltan opciones, agrégalas antes de enviar: una respuesta sin las 5 es inválida.`

export const INSTRUCCION_REPARACION =
  '<No incluiste las 5 opciones en tu respuesta anterior. Si estabas pidiendo una tirada de dados, responde únicamente [TIRADA]. Si no, devuelve únicamente las 5 opciones de acción que correspondan, una por línea, con el formato {1. ...} a {5. ...}. No narres de nuevo ni incluyas [ESTADO].>'

function replaceAllLiteral(text: string, needle: string, value: string): string {
  return text.split(needle).join(value)
}

export function buildSystemPrompt(settings: Settings, gameState: string): string {
  let prompt = promptBase
  prompt = replaceAllLiteral(prompt, '{{tema}}', settings.theme)
  prompt = replaceAllLiteral(prompt, '{{mundo}}', settings.world)
  prompt = replaceAllLiteral(prompt, '{{personaje}}', settings.character)
  prompt = replaceAllLiteral(prompt, '{{nombre}}', settings.character)
  prompt = replaceAllLiteral(prompt, '{{clase}}', settings.characterClass)
  prompt = replaceAllLiteral(prompt, '{{raza}}', settings.race)

  let result = prompt.trimEnd()
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
      'las misiones y los PNJs. Al final de tu respuesta, dentro del ' +
      'bloque [ESTADO], actualízala con los cambios de este turno y ' +
      'conserva todo lo que siga siendo válido.'
  }
  return `${result}\n\n${RECORDATORIO_CIERRE}`
}

export { promptBase }
