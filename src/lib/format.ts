export function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('es', { maximumFractionDigits: 1 })}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toLocaleString('es', { maximumFractionDigits: 1 })}k`
  }
  return value.toLocaleString('es')
}

export function formatNumber(value: number): string {
  return value.toLocaleString('es')
}

/** 0:07, 1:42, 12:05 */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

/** 45,2 tok/s */
export function formatRate(tokensPerSecond: number): string {
  const value = tokensPerSecond.toLocaleString('es', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  return `${value} tok/s`
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toLocaleString('es', { maximumFractionDigits: 1 })} MB`
  }
  if (bytes >= 1024) return `${Math.round(bytes / 1024).toLocaleString('es')} KB`
  return `${bytes} B`
}
