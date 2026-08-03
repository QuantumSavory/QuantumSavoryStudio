<template>
  <ConstructorForm
    class="protocol-constructor-form"
    :constructor="protocol"
    :get-parameter-definition="parameterDefinition"
    :category="category"
    :variables="variables"
    :editing-locked="editingLocked"
    :disabled="disabled"
    :controlled-parameters="controlledParameters"
    :empty-text="emptyText"
    :numeric-expression-context="numericExpressionContext"
    :template="template"
    subject="protocol"
    test-id="protocol-constructor"
    template-test-id="template-protocol-constructor"
    @commit="emit('commit')"
  />
</template>

<script setup>
import { api } from '../../utils/ApiConnector.js'
import ConstructorForm from './ConstructorForm.vue'

const props = defineProps({
  protocol: { type: Object, required: true },
  category: { type: String, default: 'floating' },
  variables: { type: Array, default: () => [] },
  editingLocked: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  controlledParameters: { type: Object, default: () => ({}) },
  emptyText: { type: String, default: 'No configurable parameters.' },
  numericExpressionContext: { type: Object, default: undefined },
  template: { type: Boolean, default: false },
})
const emit = defineEmits(['commit'])

function parameterDefinition(parameter) {
  return api.getProtocolParameterDefinition(
    props.category,
    props.protocol.type,
    parameter.name,
  )
}
</script>
