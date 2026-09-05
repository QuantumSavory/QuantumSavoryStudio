<template>
<div 
    class="slot-icon"
    :data-slot-id="registerSlot.id"
    >
    <component
      :is="registerSlot.isLocked ? CircleSlash2 : Circle"
      class="slot-status-icon"
      :class="{ 'slot-status-icon--assigned': registerSlot.assignment }"
      :size="12"
      :color="getSlotColor()"
      :fill="registerSlot.assignment ? getSlotColor() : 'none'"
      :stroke-width="registerSlot.assignment ? 1.5 : 2"
      aria-hidden="true"
    />
</div>
   
</template>

<script setup>
import { Circle, CircleSlash2 } from '@lucide/vue'

const props = defineProps({
  registerSlot: { type: Object, required: true }
});

function getSlotColor(){
  if(props.registerSlot.type == "Qubit"){
    return "var(--app-color-qubit)"
  }
  if(props.registerSlot.type == "Qumode"){
    return "var(--app-color-qmode)"
  }
}
</script>

<style scoped>
.slot-icon {
  position: relative;
}

.slot-status-icon {
  pointer-events: none;
  margin: 0px 0px 0px;
  margin-bottom: -1.5px;
  transform: scale(0.8);
}

.slot-status-icon--assigned path {
  stroke: #fff;
}
</style>
