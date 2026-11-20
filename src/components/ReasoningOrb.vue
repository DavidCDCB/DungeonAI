<script setup lang="ts">
/**
 * Orbe de razonamiento: gira, late y se enciende según la velocidad (0–1).
 * El movimiento se calcula con requestAnimationFrame integrando la velocidad angular,
 * así acelerar o frenar es continuo (cambiar la duración de una animación CSS
 * produciría saltos). Con «reducir movimiento» queda quieto y solo cambia de brillo.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ intensity: number }>(), { intensity: 0 })

const root = ref<SVGSVGElement | null>(null)
const gradientId = `orb-halo-${Math.random().toString(36).slice(2, 8)}`
const outer = ref<SVGGElement | null>(null)
const inner = ref<SVGGElement | null>(null)
const core = ref<SVGCircleElement | null>(null)
const halo = ref<SVGCircleElement | null>(null)
const outerRing = ref<SVGCircleElement | null>(null)
const innerRing = ref<SVGCircleElement | null>(null)
const sparks: SVGCircleElement[] = [] // no reactivo: se actualiza en cada fotograma

type Rgb = [number, number, number]
const GOLD_DIM: Rgb = [138, 110, 60]
const GOLD_BRIGHT: Rgb = [240, 214, 154]
const ARCANE: Rgb = [183, 156, 255]
const CORE_LOW: Rgb = [196, 160, 92]
const CORE_HIGH: Rgb = [255, 238, 188]

const mix = (a: Rgb, b: Rgb, t: number) =>
  `rgb(${a.map((value, i) => Math.round(value + (b[i] - value) * t)).join(' ')})`
const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

let level = 0 // intensidad suavizada
let angle = 0
let phase = 0
let frame = 0
let last = 0
let reduced = false

function render() {
  const k = level
  const boost = k ** 1.2
  outer.value?.setAttribute('transform', `rotate(${angle.toFixed(2)})`)
  inner.value?.setAttribute('transform', `rotate(${(-angle * 1.55).toFixed(2)})`)
  const pulse = reduced ? 0 : Math.sin(phase)
  core.value?.setAttribute('transform', `scale(${(1 + (0.06 + 0.2 * k) * pulse).toFixed(3)})`)
  core.value?.setAttribute('fill', mix(CORE_LOW, CORE_HIGH, k))
  if (halo.value) {
    halo.value.setAttribute('r', (14 + 8 * k + 3 * k * pulse).toFixed(2))
    halo.value.setAttribute('opacity', (0.28 + 0.62 * boost).toFixed(3))
  }
  // El degradado del halo toma este color (currentColor).
  if (root.value) root.value.style.color = mix(GOLD_DIM, GOLD_BRIGHT, k)
  outerRing.value?.setAttribute('stroke', mix(GOLD_DIM, GOLD_BRIGHT, k))
  innerRing.value?.setAttribute('stroke', mix(GOLD_DIM, ARCANE, clamp01(k * 1.15)))
  sparks.forEach((spark, index) => {
    spark.setAttribute('opacity', (0.25 + 0.75 * clamp01(k * 4.2 - index)).toFixed(3))
    spark.setAttribute('fill', mix(GOLD_BRIGHT, ARCANE, index % 2 ? clamp01(k) : 0))
  })
}

function tick(time: number) {
  const dt = Math.min(0.1, last ? (time - last) / 1000 : 0.016)
  last = time
  // La intensidad sigue al objetivo con inercia (~0,5 s): frena y acelera sin saltos.
  level += (clamp01(props.intensity) - level) * (1 - Math.exp(-dt / 0.5))
  // Curva convexa: 10 tok/s gira con calma (~23°/s) y 200 tok/s a ~500°/s.
  angle = (angle + (18 + 480 * level ** 2) * dt) % 360
  phase += dt * (1.4 + 7.5 * level)
  render()
  frame = requestAnimationFrame(tick)
}

function start() {
  reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  level = clamp01(props.intensity)
  if (reduced || typeof requestAnimationFrame !== 'function') {
    render()
    return
  }
  frame = requestAnimationFrame(tick)
}

onMounted(start)
onBeforeUnmount(() => cancelAnimationFrame(frame))

watch(
  () => props.intensity,
  (value) => {
    if (reduced) {
      level = clamp01(value)
      render()
    }
  },
)

const setSpark = (el: unknown, index: number) => {
  if (el) sparks[index] = el as SVGCircleElement
}
</script>

<template>
  <svg ref="root" viewBox="-24 -24 48 48" class="h-[60px] w-[60px] shrink-0 overflow-visible sm:h-20 sm:w-20" aria-hidden="true">
    <defs>
      <radialGradient :id="gradientId">
        <stop offset="0" stop-color="currentColor" stop-opacity="0.8" />
        <stop offset="0.55" stop-color="currentColor" stop-opacity="0.3" />
        <stop offset="1" stop-color="currentColor" stop-opacity="0" />
      </radialGradient>
    </defs>
    <circle ref="halo" r="14" :fill="`url(#${gradientId})`" opacity="0.3" />
    <g ref="outer">
      <circle ref="outerRing" r="19" fill="none" stroke-width="1.2" stroke-dasharray="3 4.4" stroke-linecap="round" />
      <circle v-for="(_, i) in 4" :key="`o${i}`" :ref="(el) => setSpark(el, i)" :cx="19 * Math.cos((i * Math.PI) / 2)" :cy="19 * Math.sin((i * Math.PI) / 2)" r="1.7" />
    </g>
    <g ref="inner">
      <circle ref="innerRing" r="12.5" fill="none" stroke-width="1" stroke-dasharray="1.2 3.2" stroke-linecap="round" />
    </g>
    <circle ref="core" r="5.4" fill="currentColor" />
  </svg>
</template>
