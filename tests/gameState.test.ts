import { describe, expect, it } from 'vitest'
import { extractState, mergeState, sections } from '../src/lib/gameState'

describe('GameState', () => {
  it('extrae el bloque y lo quita de la narración', () => {
    const { display, state } = extractState(
      'La puerta se abre.\n\n[ESTADO]\nInventario: daga\n[/ESTADO]',
    )
    expect(display).toBe('La puerta se abre.')
    expect(state).toContain('daga')
  })

  it('conserva las secciones que el modelo omite', () => {
    const merged = mergeState(
      'Hoja de personaje: Sabrina, nivel 2\nInventario: vara\nDinero: 12 PO',
      'Hoja de personaje: Sabrina, nivel 3\nInventario: vara, daga',
    )
    expect(merged).toContain('nivel 3')
    expect(merged).toContain('daga')
    expect(merged).toContain('12 PO')
  })

  it('reconoce alias de secciones', () => {
    const result = sections('Equipo: espada\nOro: 30\nEstados: herido\nPistas: una carta del alcalde')
    expect(result.get('Inventario')).toBe('espada')
    expect(result.get('Dinero')).toBe('30')
    expect(result.get('Condiciones y efectos')).toBe('herido')
    expect(result.get('Pistas y documentos')).toBe('una carta del alcalde')
  })

  it('admite varias líneas dentro de Pistas y documentos', () => {
    const result = sections(
      'Pistas y documentos: nota de Beverly (leída)\n- llave de latón\n- sedán gris\nMisiones: taquilla 17',
    )
    expect(result.get('Pistas y documentos')).toBe(
      'nota de Beverly (leída)\n- llave de latón\n- sedán gris',
    )
    expect(result.get('Misiones')).toBe('taquilla 17')
  })
})
