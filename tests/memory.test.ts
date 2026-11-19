import { describe, expect, it } from 'vitest'
import { isActiveCombat, memoryAfter, memoryEntries, mergeState } from '../src/lib/gameState'
import { createMessage, isJokerOption, optionLabel, streamingPreview } from '../src/lib/messages'

const estadoCompleto = `Escena: Taberna del Pony, día 2, noche, lluvia.
Combate: ronda 2, goblin 3/7 PG.
Hoja: Sabrina, humana maga nivel 1, PG 8/8
Inventario: bastón, grimorio
Dinero: 12 PO
Condiciones y efectos: ninguna
Misiones: encontrar al gato
PNJs y notas: Barliman, amistoso
Trama (solo DM): el posadero es un cambiaformas`

describe('Memoria con el formato del prompt', () => {
  it('conserva escena, combate y trama', () => {
    const merged = mergeState('', estadoCompleto)
    expect(merged).toContain('Escena: Taberna del Pony')
    expect(merged).toContain('Combate: ronda 2')
    expect(merged).toContain('Trama (solo DM): el posadero')
    expect(merged).toContain('PNJs y notas: Barliman, amistoso')
  })

  it('el combate desaparece cuando el DM lo omite', () => {
    const merged = mergeState(estadoCompleto, 'Escena: Taberna, día 2, medianoche.\nDinero: 15 PO')
    expect(merged).not.toContain('Combate')
    expect(merged).toContain('Dinero: 15 PO')
    expect(merged).toContain('Inventario: bastón, grimorio')
    expect(merged).toContain('medianoche')
  })

  it('separa las entradas y marca la trama como secreta', () => {
    const entries = memoryEntries(mergeState('', estadoCompleto))
    expect(entries.map((entry) => entry.title)).toEqual([
      'Escena',
      'Combate',
      'Hoja de personaje',
      'Inventario',
      'Dinero',
      'Condiciones y efectos',
      'Misiones',
      'PNJs y notas',
      'Trama (solo DM)',
    ])
    expect(entries.find((entry) => entry.secret)?.title).toBe('Trama (solo DM)')
    expect(memoryEntries('texto libre sin secciones')).toEqual([
      { title: 'Notas', body: 'texto libre sin secciones', secret: false, transient: false },
    ])
  })

  it('distingue combates activos', () => {
    expect(isActiveCombat('ronda 1, lobo herido')).toBe(true)
    expect(isActiveCombat('Ninguno.')).toBe(false)
  })
})

describe('Memoria al deshacer turnos', () => {
  it('usa la última instantánea y aplica los estados posteriores', () => {
    const a = { ...createMessage('assistant', 'A'), memory: 'Dinero: 10 PO' }
    const b = {
      ...createMessage('assistant', 'B\n\n[ESTADO]\nInventario: daga\n[/ESTADO]'),
    }
    expect(memoryAfter([createMessage('user', 'x'), a, createMessage('user', 'y'), b])).toBe(
      'Inventario: daga\nDinero: 10 PO',
    )
    expect(memoryAfter([createMessage('user', 'x'), a])).toBe('Dinero: 10 PO')
    expect(memoryAfter([createMessage('user', 'x')])).toBe('')
  })
})

describe('Vista previa en streaming', () => {
  it('oculta el estado y las opciones mientras se escriben', () => {
    expect(streamingPreview('La puerta cruje.\n\n[ESTADO]\nInventario: da')).toBe('La puerta cruje.')
    expect(streamingPreview('La puerta cruje.\n\n{1. Entrar}\n{2. Esp')).toBe('La puerta cruje.')
    expect(streamingPreview('La puerta cruje.\n\n[EST')).toBe('La puerta cruje.')
    expect(streamingPreview('Texto.\n\n**Opciones:**\n{1. A')).toBe('Texto.')
  })

  it('no recorta la narración normal', () => {
    expect(streamingPreview('Una **sombra** se mueve')).toBe('Una **sombra** se mueve')
  })
})

describe('Opciones', () => {
  it('detecta la opción comodín', () => {
    expect(isJokerOption('Bailo sobre la mesa 🃏')).toBe(true)
    expect(optionLabel('Bailo sobre la mesa 🃏')).toBe('Bailo sobre la mesa')
    expect(isJokerOption('Abro la puerta')).toBe(false)
  })
})
