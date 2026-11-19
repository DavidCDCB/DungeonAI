<script setup lang="ts">
import { useId } from 'vue'

withDefaults(defineProps<{ size?: number; glow?: boolean }>(), { size: 36, glow: false })
const gradient = useId()
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    aria-hidden="true"
    :class="glow ? 'drop-shadow-[0_0_18px_rgb(214_179_106/0.45)]' : ''"
  >
    <defs>
      <linearGradient :id="gradient" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f7e4b0" />
        <stop offset="1" stop-color="#b0863f" />
      </linearGradient>
    </defs>
    <path
      d="M32 5 55 18.5v27L32 59 9 45.5v-27Z"
      :fill="`url(#${gradient})`"
      fill-opacity=".1"
      :stroke="`url(#${gradient})`"
      stroke-width="2.6"
      stroke-linejoin="round"
    />
    <path
      d="M32 20 19 42h26Z"
      :fill="`url(#${gradient})`"
      fill-opacity=".18"
      :stroke="`url(#${gradient})`"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <path
      d="M32 5v15M9 18.5 32 20l23-1.5M9 18.5 19 42M55 18.5 45 42M9 45.5 19 42M55 45.5 45 42M32 59 19 42M32 59l13-17"
      fill="none"
      :stroke="`url(#${gradient})`"
      stroke-width="1.6"
      stroke-linejoin="round"
      stroke-linecap="round"
      opacity=".7"
    />
  </svg>
</template>
