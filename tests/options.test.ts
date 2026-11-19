import { describe, expect, it } from 'vitest'
import { parseOptions } from '../src/lib/options'

describe('OptionParser', () => {
  it('separa cinco opciones con llaves', () => {
    const parsed = parseOptions(
      'La puerta cruje.\n\n{1. Entrar}\n{2. Esperar}\n{3. Huir}\n{4. Gritar}\n{5. Correr}',
    )
    expect(parsed.display).toContain('La puerta cruje')
    expect(parsed.options).toEqual(['Entrar', 'Esperar', 'Huir', 'Gritar', 'Correr'])
  })

  it('acepta listas numeradas al final', () => {
    const parsed = parseOptions('Una escena.\n\n1. Entrar\n2. Esperar\n3. Huir')
    expect(parsed.options).toEqual(['Entrar', 'Esperar', 'Huir'])
    expect(parsed.display).toBe('Una escena.')
  })

  it('no inventa opciones en una narración', () => {
    const parsed = parseOptions('El viento sopla entre los árboles.')
    expect(parsed.options).toEqual([])
    expect(parsed.display).toBe('El viento sopla entre los árboles.')
  })
})
