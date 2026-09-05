<template>
  <dialog
    ref="warningDialog"
    class="small-screen-warning"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="small-screen-warning-title"
    aria-describedby="small-screen-warning-description"
    @cancel.prevent="dismissWarning"
  >
    <div class="small-screen-warning-content">
      <MonitorX :size="56" :stroke-width="1.75" aria-hidden="true" />
      <h1 id="small-screen-warning-title">
        QuantumSavory Studio works best on a larger screen
      </h1>
      <p id="small-screen-warning-description">
        This simulator is designed for desktop-sized displays and may be difficult to use on a
        phone or other small screen. For the full editing experience, open it on a laptop or
        desktop computer.
      </p>
      <button ref="dismissButton" type="button" class="continue-button" @click="dismissWarning">
        Continue anyway
      </button>
    </div>
  </dialog>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { MonitorX } from '@lucide/vue'

const SMALL_SCREEN_QUERY = '(max-width: 900px), (max-height: 600px)'

const warningDialog = ref(null)
const dismissButton = ref(null)
const dismissed = ref(false)
let compactViewport = null

function openWarning() {
  if (dismissed.value || warningDialog.value?.open) return

  warningDialog.value?.showModal()
  dismissButton.value?.focus()
}

function closeWarning() {
  if (warningDialog.value?.open) {
    warningDialog.value.close()
  }
}

function syncWarningVisibility() {
  if (compactViewport?.matches && !dismissed.value) {
    openWarning()
  } else {
    closeWarning()
  }
}

function dismissWarning() {
  dismissed.value = true
  closeWarning()
}

onMounted(() => {
  compactViewport = window.matchMedia(SMALL_SCREEN_QUERY)
  compactViewport.addEventListener('change', syncWarningVisibility)
  syncWarningVisibility()
})

onUnmounted(() => {
  compactViewport?.removeEventListener('change', syncWarningVisibility)
  closeWarning()
  compactViewport = null
})
</script>

<style scoped>
.small-screen-warning {
  position: fixed;
  inset: 0;
  width: 100vw;
  max-width: none;
  height: 100dvh;
  max-height: none;
  margin: 0;
  padding:
    max(24px, env(safe-area-inset-top))
    max(24px, env(safe-area-inset-right))
    max(24px, env(safe-area-inset-bottom))
    max(24px, env(safe-area-inset-left));
  overflow: auto;
  border: 0;
  background: linear-gradient(145deg, #f4f4ff 0%, #fff 58%, #f7f7fc 100%);
  color: #222;
}

.small-screen-warning[open] {
  display: grid;
  place-items: center;
}

.small-screen-warning::backdrop {
  background: #fff;
}

.small-screen-warning-content {
  display: flex;
  width: min(100%, 620px);
  flex-direction: column;
  align-items: center;
  gap: 18px;
  text-align: center;
}

.small-screen-warning-content > .lucide {
  color: #4345ac;
}

h1 {
  margin: 0;
  font-size: clamp(1.6rem, 5vw, 2.4rem);
  line-height: 1.2;
}

p {
  margin: 0;
  color: #555;
  font-size: clamp(1rem, 3.4vw, 1.15rem);
  line-height: 1.6;
}

button {
  min-height: 42px;
  margin-top: 6px;
  padding: 9px 20px;
  font-size: 1rem;
}

.continue-button {
  border-color: #4345ac;
  background: #4345ac;
  color: #fff;
}

.continue-button:hover {
  background: #3637a0;
}

button:focus-visible {
  outline: 3px solid #7b7dcc;
  outline-offset: 3px;
}
</style>
