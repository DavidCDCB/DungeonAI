/**
 * Ritmo del razonamiento: velocidad *actual* (ventana deslizante) y su traducción a
 * una intensidad 0–1 que mueve el indicador. La media desde el inicio reaccionaba
 * muy poco: aquí un ritmo que cae o sube se nota en un par de segundos.
 */

/** Rango de velocidad que recorre el indicador: de 10 tok/s (mínimo) a 200 tok/s (máximo). */
export const PACE_MIN = 10
export const PACE_MAX = 200
/** Intensidad con la que arranca el rango (10 tok/s): se nota que trabaja, pero con calma. */
const BASE_INTENSITY = 0.1

export interface PaceMeter {
  /** Registra el total acumulado de tokens en el instante `at` (ms). */
  push(at: number, tokens: number): void
  /** tok/s en la ventana más reciente; 0 si se detuvo; null si aún no hay datos. */
  rate(at: number): number | null
  reset(): void
}

export function createPaceMeter(windowMs = 2500, minSpanMs = 400): PaceMeter {
  let samples: Array<{ at: number; tokens: number }> = []
  return {
    push(at, tokens) {
      const last = samples[samples.length - 1]
      if (last && tokens < last.tokens) samples = [] // reinicio de intento
      if (last && last.at === at) last.tokens = tokens
      else samples.push({ at, tokens })
      // Conserva una muestra anterior a la ventana como referencia.
      const limit = at - windowMs
      while (samples.length > 2 && samples[1].at <= limit) samples.shift()
    },
    rate(at) {
      if (!samples.length) return null
      const last = samples[samples.length - 1]
      const limit = at - windowMs
      // Referencia: la última muestra que no es posterior al inicio de la ventana.
      let base = samples[0]
      for (const sample of samples) {
        if (sample.at <= limit) base = sample
        else break
      }
      if (base === last) return at - last.at >= minSpanMs ? 0 : null
      const span = at - base.at
      if (span < minSpanMs) return null
      return Math.max(0, (last.tokens - base.tokens) / (span / 1000))
    },
    reset() {
      samples = []
    },
  }
}

/**
 * 0 = parado, 1 = PACE_MAX o más. Entre PACE_MIN y PACE_MAX la escala es logarítmica
 * (10 → 0,1 · 20 → 0,31 · 45 → 0,55 · 100 → 0,79 · 200 → 1), que distingue mejor los
 * ritmos habituales; por debajo de PACE_MIN sube de 0 a 0,1.
 */
export function paceIntensity(rate: number | null): number {
  if (rate === null || rate <= 0) return 0
  if (rate < PACE_MIN) return (BASE_INTENSITY * rate) / PACE_MIN
  const position = Math.log(rate / PACE_MIN) / Math.log(PACE_MAX / PACE_MIN)
  return BASE_INTENSITY + (1 - BASE_INTENSITY) * Math.min(1, position)
}

export type PaceTier = 'warming' | 'paused' | 'slow' | 'steady' | 'fast' | 'blazing'

export function paceTier(rate: number | null): PaceTier {
  if (rate === null) return 'warming'
  if (rate < 2) return 'paused'
  if (rate < PACE_MIN) return 'slow'
  if (rate < 40) return 'steady'
  if (rate < 150) return 'fast'
  return 'blazing'
}

export const PACE_LABELS: Record<PaceTier, string> = {
  warming: 'calentando',
  paused: 'en pausa',
  slow: 'despacio',
  steady: 'constante',
  fast: 'ágil',
  blazing: 'a toda marcha',
}

/** Segmentos encendidos (0–5) del medidor de tempo. */
export function paceBars(rate: number | null, bars = 5): number {
  if (rate === null || rate < 1) return 0
  return Math.max(1, Math.ceil(paceIntensity(rate) * bars))
}
