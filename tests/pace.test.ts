import { describe, expect, it } from 'vitest'
import { PACE_MAX, PACE_MIN, createPaceMeter, paceBars, paceIntensity, paceTier } from '../src/lib/pace'

describe('Ritmo del razonamiento', () => {
  it('sin datos no hay velocidad', () => {
    const meter = createPaceMeter()
    expect(meter.rate(1000)).toBeNull()
    meter.push(1000, 10)
    expect(meter.rate(1100)).toBeNull() // muy pronto para medir
  })

  it('mide la velocidad con una ventana deslizante', () => {
    const meter = createPaceMeter(2000)
    for (let t = 0; t <= 4000; t += 500) meter.push(t, (t / 1000) * 40) // 40 tok/s
    expect(meter.rate(4000)).toBeCloseTo(40, 0)
  })

  it('reacciona a un cambio de ritmo (no es una media desde el inicio)', () => {
    const meter = createPaceMeter(2000)
    // 4 s a 20 tok/s y luego 3 s a 100 tok/s
    for (let t = 0; t <= 4000; t += 250) meter.push(t, (t / 1000) * 20)
    expect(meter.rate(4000)).toBeCloseTo(20, 0)
    for (let t = 4250; t <= 7000; t += 250) meter.push(t, 80 + ((t - 4000) / 1000) * 100)
    const fast = meter.rate(7000)!
    expect(fast).toBeGreaterThan(90)
    const average = (80 + 300) / 7 // media desde el inicio ≈ 54
    expect(fast).toBeGreaterThan(average * 1.5)
  })

  it('cae a 0 cuando el modelo se detiene', () => {
    const meter = createPaceMeter(2000)
    for (let t = 0; t <= 2000; t += 250) meter.push(t, (t / 1000) * 50)
    expect(meter.rate(2000)).toBeGreaterThan(40)
    expect(meter.rate(3000)).toBeLessThan(meter.rate(2000)!)
    expect(meter.rate(6000)).toBe(0)
  })

  it('un reinicio del contador (nuevo intento) no da velocidades negativas', () => {
    const meter = createPaceMeter(2000)
    meter.push(0, 0)
    meter.push(1000, 100)
    meter.push(1500, 5)
    meter.push(2500, 55)
    expect(meter.rate(2500)).toBeGreaterThanOrEqual(0)
  })

  it('reset vacía el medidor', () => {
    const meter = createPaceMeter()
    meter.push(0, 0)
    meter.push(1000, 50)
    meter.reset()
    expect(meter.rate(2000)).toBeNull()
  })

  it('intensidad: 0 parado, creciente y limitada a 1', () => {
    expect(paceIntensity(null)).toBe(0)
    expect(paceIntensity(0)).toBe(0)
    expect(PACE_MIN).toBe(10)
    expect(PACE_MAX).toBe(200)
    expect(paceIntensity(PACE_MIN)).toBeCloseTo(0.1, 5) // el mínimo del rango: se nota, con calma
    expect(paceIntensity(5)).toBeLessThan(paceIntensity(PACE_MIN))
    expect(paceIntensity(PACE_MIN)).toBeLessThan(paceIntensity(50))
    expect(paceIntensity(50)).toBeLessThan(paceIntensity(100))
    expect(paceIntensity(100)).toBeLessThan(paceIntensity(150))
    expect(paceIntensity(150)).toBeLessThan(1)
    expect(paceIntensity(PACE_MAX)).toBeCloseTo(1, 5)
    expect(paceIntensity(300)).toBe(1)
    expect(paceIntensity(5000)).toBe(1)
  })

  it('niveles y segmentos del medidor', () => {
    expect(paceTier(null)).toBe('warming')
    expect(paceTier(0)).toBe('paused')
    expect(paceTier(5)).toBe('slow')
    expect(paceTier(10)).toBe('steady')
    expect(paceTier(39)).toBe('steady')
    expect(paceTier(40)).toBe('fast')
    expect(paceTier(149)).toBe('fast')
    expect(paceTier(150)).toBe('blazing')
    expect(paceTier(200)).toBe('blazing')
    expect(paceBars(null)).toBe(0)
    expect(paceBars(0.5)).toBe(0)
    expect(paceBars(3)).toBe(1)
    expect(paceBars(PACE_MIN)).toBe(1)
    expect(paceBars(PACE_MAX)).toBe(5)
    expect(paceBars(1000)).toBe(5)
  })
})
