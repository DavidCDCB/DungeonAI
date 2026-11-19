import { describe, expect, it } from 'vitest'
import { selectHistory } from '../src/lib/contextBudget'
import { createMessage } from '../src/lib/messages'

describe('ContextBudget', () => {
  it('envía todo cuando cabe', () => {
    const messages = Array.from({ length: 5 }, (_, index) =>
      createMessage('user', `Acción ${index}: ${'texto '.repeat(50)}`),
    )
    const selection = selectHistory('Sistema', messages)
    expect(selection.messages).toHaveLength(5)
  })

  it('descarta los mensajes más antiguos', () => {
    const messages = Array.from({ length: 8 }, (_, index) =>
      createMessage('user', `Mensaje ${index} ${'x'.repeat(800)}`),
    )
    const selection = selectHistory('Sistema', messages, 1200, 0)
    expect(selection.messages.length).toBeLessThan(messages.length)
    expect(selection.messages.length).toBeGreaterThan(0)
    expect(selection.messages[selection.messages.length - 1].id).toBe(messages[messages.length - 1].id)
  })

  it('recorta un mensaje gigante', () => {
    const message = createMessage('user', 'x'.repeat(20_000))
    const selection = selectHistory('Sistema', [message], 1200, 0)
    expect(selection.messages).toHaveLength(1)
    expect(selection.truncatedLast).toBe(true)
    expect(selection.messages[0].content.length).toBeLessThan(message.content.length)
  })
})
