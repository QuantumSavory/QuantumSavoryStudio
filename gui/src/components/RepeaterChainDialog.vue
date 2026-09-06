<template>
  <LayoutGeneratorDialog
    :show="show"
    title="Repeater Chain Generator"
    form-id="repeater-chain-form"
    description="Generate an evenly spaced chain, with either copied template data or configured protocols."
    :valid="validation.valid"
    :validation-message="validationMessage"
    submit-label="Generate Chain"
    width="min(920px, calc(100vw - 32px))"
    @submit="handleConfirm"
    @cancel="handleCancel"
  >
    <section class="generator-section" aria-labelledby="chain-template-heading">
      <h3 id="chain-template-heading">Chain template</h3>

      <div class="option-card no-template-option">
        <label class="checkbox-field" for="chain-no-repeater-template">
          <input
            id="chain-no-repeater-template"
            v-model="form.noRepeaterTemplate"
            type="checkbox"
            aria-describedby="chain-no-repeater-template-description"
          >
          <span>No repeater template</span>
        </label>
        <p id="chain-no-repeater-template-description" class="option-description">
          Create new repeaters from the global node slot template and configure their protocols below.
        </p>
      </div>

      <div class="form-grid">
        <label for="chain-start-node">Start node</label>
        <select id="chain-start-node" v-model="form.startNodeId" autofocus>
          <option value="" disabled>Select a node</option>
          <option v-for="node in nodes" :key="node.id" :value="node.id">
            {{ node.name }}
          </option>
        </select>

        <label for="chain-end-node">End node</label>
        <select id="chain-end-node" v-model="form.endNodeId">
          <option value="" disabled>Select a node</option>
          <option v-for="node in nodes" :key="node.id" :value="node.id">
            {{ node.name }}
          </option>
        </select>

        <label for="chain-template-node">Repeater template</label>
        <select
          id="chain-template-node"
          v-model="form.templateNodeId"
          :disabled="form.noRepeaterTemplate"
        >
          <option value="" disabled>Select a template node</option>
          <option v-for="node in nodes" :key="node.id" :value="node.id">
            {{ node.name }}
          </option>
        </select>

        <label for="chain-repeater-count">Number of repeaters</label>
        <input
          id="chain-repeater-count"
          v-model.number="form.repeaterCount"
          type="number"
          min="1"
          max="100"
          step="1"
        >
      </div>

      <p class="section-description template-status" role="status">
        {{ templateStatus }}
      </p>

      <div class="option-card compact-option">
        <div class="option-control-line">
          <label class="checkbox-field" for="chain-create-virtual-edge">
            <input
              id="chain-create-virtual-edge"
              v-model="form.createVirtualEdge"
              type="checkbox"
              aria-describedby="chain-create-virtual-edge-description"
            >
            <span>End-to-end virtual edge</span>
          </label>
          <OptionHelpTooltip
            label="About the end-to-end virtual edge"
            :text="virtualEdgeDescription"
          />
        </div>
        <p id="chain-create-virtual-edge-description" class="option-description">
          {{ virtualEdgeDescription }}
        </p>
      </div>
    </section>

    <section class="generator-section" aria-labelledby="chain-automation-heading">
      <h3 id="chain-automation-heading">Protocol configuration</h3>
      <p class="section-description automation-introduction" role="status">
        {{ protocolCustomizationStatus }}
      </p>

      <div class="automation-options">
        <div class="option-card" :class="{ 'option-unavailable': !protocolCustomizationAllowed || !entanglerAvailable }">
          <div class="option-control-line">
            <label class="checkbox-field" for="chain-configure-entangler">
              <input
                id="chain-configure-entangler"
                v-model="form.configureEntangler"
                type="checkbox"
                :disabled="!protocolCustomizationAllowed || !entanglerAvailable"
                aria-describedby="chain-configure-entangler-description"
              >
              <span>Add EntanglerProt to every chain edge</span>
            </label>
            <OptionHelpTooltip
              label="About EntanglerProt configuration"
              :text="entanglerDescription"
            />
          </div>
          <p id="chain-configure-entangler-description" class="option-description">
            {{ entanglerDescription }}
          </p>

          <div v-if="form.configureEntangler && entanglerProtocol" class="constructor-panel">
            <h4>EntanglerProt constructor</h4>
            <ProtocolConstructorForm
              :protocol="entanglerProtocol"
              category="edge"
              :variables="variables"
              template
            />
          </div>
        </div>

        <div class="option-card" :class="{ 'option-unavailable': !protocolCustomizationAllowed || !swapperAvailable }">
          <div class="option-control-line">
            <label class="checkbox-field" for="chain-configure-swapper">
              <input
                id="chain-configure-swapper"
                v-model="form.configureSwapper"
                type="checkbox"
                :disabled="!protocolCustomizationAllowed || !swapperAvailable"
                aria-describedby="chain-configure-swapper-description"
              >
              <span>Add SwapperProt to every repeater</span>
            </label>
            <OptionHelpTooltip
              label="About SwapperProt configuration"
              :text="swapperDescription"
            />
          </div>
          <p id="chain-configure-swapper-description" class="option-description">
            {{ swapperDescription }}
          </p>

          <template v-if="form.configureSwapper && swapperProtocol">
            <fieldset class="strategy-fieldset">
              <legend>Swapper predicate strategy</legend>
              <div
                v-for="strategy in predicateStrategies"
                :key="strategy.value"
                class="strategy-option"
              >
                <div class="option-control-line">
                  <label :for="`chain-swapper-strategy-${strategy.value}`" class="radio-field">
                    <input
                      :id="`chain-swapper-strategy-${strategy.value}`"
                      v-model="form.predicateStrategy"
                      type="radio"
                      name="chain-swapper-strategy"
                      :value="strategy.value"
                      :aria-describedby="`chain-swapper-strategy-${strategy.value}-description`"
                    >
                    <span>{{ strategy.label }}</span>
                  </label>
                  <OptionHelpTooltip
                    :label="`About the ${strategy.label} strategy`"
                    :text="strategy.description"
                  />
                </div>
                <p
                  :id="`chain-swapper-strategy-${strategy.value}-description`"
                  class="option-description"
                >
                  {{ strategy.description }}
                </p>
              </div>
            </fieldset>

            <div class="constructor-panel">
              <h4>SwapperProt constructor</h4>
              <p v-if="generatedPredicateStrategy" class="controlled-fields-note">
                The disabled Custom Function fields show examples for {{ exampleRepeaterName }}. The strategy sets distinct values for each repeater.
              </p>
              <ProtocolConstructorForm
                :protocol="swapperProtocol"
                category="node"
                :variables="variables"
                :controlled-parameters="controlledSwapperParameters"
                template
              />
            </div>
          </template>
        </div>

        <div class="option-card" :class="{ 'option-unavailable': !protocolCustomizationAllowed || !trackerAvailable }">
          <div class="option-control-line">
            <label class="checkbox-field" for="chain-configure-tracker">
              <input
                id="chain-configure-tracker"
                v-model="form.configureTracker"
                type="checkbox"
                :disabled="!protocolCustomizationAllowed || !trackerAvailable"
                aria-describedby="chain-configure-tracker-description"
              >
              <span>Set EntanglementTracker on repeaters and endpoints</span>
            </label>
            <OptionHelpTooltip
              label="About EntanglementTracker configuration"
              :text="trackerDescription"
            />
          </div>
          <p id="chain-configure-tracker-description" class="option-description">
            {{ trackerDescription }}
          </p>

          <div v-if="form.configureTracker && trackerProtocol" class="constructor-panel">
            <h4>EntanglementTracker constructor</h4>
            <ProtocolConstructorForm
              :protocol="trackerProtocol"
              category="node"
              :variables="variables"
              template
              empty-text="This protocol currently has no configurable constructor parameters."
            />
          </div>
        </div>
      </div>
    </section>

    <template #help>
      <HelpCallout title="Repeater protocol guidance" variant="detailed">
        <p>
          Protocol configuration is available when the chain does not copy a repeater template.
          Existing endpoint protocols are retained, except for a configured tracker of the same type.
        </p>
        <ul>
          <li><strong>Custom predicates</strong> use the constructor's nodeL and nodeH values.</li>
          <li><strong>Eager swaps</strong> accepts entanglement from either endpoint and any repeater on the appropriate side.</li>
          <li><strong>Sequential forward/backwards</strong> advances one adjacent swap at a time from the named endpoint.</li>
          <li><strong>Binary tree</strong> swaps recursive midpoints and requires 2<sup>n</sup> - 1 repeaters.</li>
        </ul>
        <p>
          Aggressive or mismatched predicates can leave protocols waiting on one another.
          Use unique node names, review the generated directions, and add CutoffProt where
          stale entanglement should be discarded to avoid persistent deadlock-like waits.
        </p>
      </HelpCallout>
    </template>
  </LayoutGeneratorDialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import {
  buildSwapperPredicateSources,
  inspectRepeaterTemplate,
  planRepeaterNames,
  SWAPPER_PREDICATE_STRATEGIES,
  validateRepeaterChain
} from '../utils/repeaterChain.js'
import {
  deepClone,
  protocolSimpleName,
  seedProtocolConstructor
} from '../utils/protocolConstructors.js'
import ProtocolConstructorForm from './panels/ProtocolConstructorForm.vue'
import HelpCallout from './ui/HelpCallout.vue'
import LayoutGeneratorDialog from './ui/LayoutGeneratorDialog.vue'
import OptionHelpTooltip from './ui/OptionHelpTooltip.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  nodes: { type: Array, default: () => [] },
  edges: { type: Array, default: () => [] },
  protocolTypes: { type: Object, default: () => ({}) },
  variables: { type: Array, default: () => [] }
})

const emit = defineEmits(['confirm', 'cancel'])

const customStrategy = SWAPPER_PREDICATE_STRATEGIES.CUSTOM

const form = reactive({
  startNodeId: '',
  endNodeId: '',
  templateNodeId: '',
  noRepeaterTemplate: false,
  repeaterCount: 1,
  createVirtualEdge: true,
  configureEntangler: false,
  configureSwapper: false,
  configureTracker: false,
  predicateStrategy: customStrategy
})

const entanglerProtocol = ref(null)
const swapperProtocol = ref(null)
const trackerProtocol = ref(null)
const customPredicateValues = ref({})

const net = computed(() => ({ nodes: props.nodes, edges: props.edges }))
const templateInspection = computed(() => inspectRepeaterTemplate(
  net.value,
  form.startNodeId,
  form.templateNodeId
))

function findProtocolDefinition(category, simpleName) {
  const definitions = props.protocolTypes?.[category]
  if (!Array.isArray(definitions)) return null
  return definitions.find(definition => protocolSimpleName(definition?.type) === simpleName) || null
}

const entanglerDefinition = computed(() => findProtocolDefinition('edge', 'EntanglerProt'))
const swapperDefinition = computed(() => findProtocolDefinition('node', 'SwapperProt'))
const trackerDefinition = computed(() => findProtocolDefinition('node', 'EntanglementTracker'))
const entanglerAvailable = computed(() => !!entanglerDefinition.value)
const swapperAvailable = computed(() => !!swapperDefinition.value)
const trackerAvailable = computed(() => !!trackerDefinition.value)
const protocolCustomizationAllowed = computed(() => form.noRepeaterTemplate)
const generatedPredicateStrategy = computed(() => form.predicateStrategy !== customStrategy)
const plannedRepeaterNames = computed(() => (
  Number.isInteger(form.repeaterCount) && form.repeaterCount >= 1 && form.repeaterCount <= 100
    ? planRepeaterNames(props.nodes, form.repeaterCount)
    : []
))
const exampleRepeaterName = computed(() => plannedRepeaterNames.value[0] || 'the first repeater')
const controlledSwapperParameters = computed(() => {
  if (!generatedPredicateStrategy.value) return {}
  const reason = `Example for ${exampleRepeaterName.value}; set separately for each repeater by the selected strategy.`
  return { nodeL: reason, nodeH: reason }
})

const virtualEdgeDescription = 'Create one direct logical edge between the named endpoints. It receives no copied or automatic protocols.'
const templateStatus = computed(() => {
  if (form.noRepeaterTemplate) {
    return 'No repeater template will be removed. New repeaters use the global node slot template, and new chain edges use physical-edge defaults.'
  }
  if (!templateInspection.value.templateNode) return 'Select a repeater template node.'
  if (!form.startNodeId) return 'Select a start node to determine the optional template edge.'
  if (!templateInspection.value.valid) return templateInspection.value.error
  if (templateInspection.value.templateEdge) {
    return `Chain edges will copy ${edgeLabel(templateInspection.value.templateEdge)}.`
  }
  return 'No start-to-template edge exists. The repeater node will be copied, and chain edges will use physical-edge defaults.'
})
const protocolCustomizationStatus = computed(() => (
  protocolCustomizationAllowed.value
    ? 'Configure the protocols to add to the generated chain. Leave an option off to omit that protocol.'
    : 'Select No repeater template to enable protocol customization. Template-backed chains copy protocols from the template node and its optional edge.'
))
const entanglerDescription = computed(() => {
  if (!protocolCustomizationAllowed.value) return protocolCustomizationStatus.value
  if (!entanglerDefinition.value) {
    return 'EntanglerProt is unavailable in runtime protocol metadata, so configuration is disabled.'
  }
  return 'Add one fresh EntanglerProt constructor to every generated physical chain edge.'
})
const swapperDescription = computed(() => (
  !protocolCustomizationAllowed.value
    ? protocolCustomizationStatus.value
    : swapperDefinition.value
      ? 'Add one fresh SwapperProt constructor to every generated repeater.'
      : 'SwapperProt is unavailable in runtime protocol metadata, so configuration is disabled.'
))
const trackerDescription = computed(() => (
  !protocolCustomizationAllowed.value
    ? protocolCustomizationStatus.value
    : trackerDefinition.value
      ? 'Set one fresh tracker on every generated repeater and both endpoints while preserving other endpoint protocols.'
      : 'EntanglementTracker is unavailable in runtime protocol metadata, so configuration is disabled.'
))

const predicateStrategies = [
  {
    value: customStrategy,
    label: 'Custom predicates',
    description: 'Configure nodeL and nodeH directly in the constructor below.'
  },
  {
    value: SWAPPER_PREDICATE_STRATEGIES.EAGER,
    label: 'Eager swaps',
    description: 'Accept any generated repeater on the appropriate side plus the named endpoint.'
  },
  {
    value: SWAPPER_PREDICATE_STRATEGIES.SEQUENTIAL_FORWARD,
    label: 'Sequential forward',
    description: 'Use the eager low-side predicate, but accept only the next repeater toward the end node.'
  },
  {
    value: SWAPPER_PREDICATE_STRATEGIES.SEQUENTIAL_BACKWARD,
    label: 'Sequential backwards',
    description: 'Use the eager high-side predicate, but accept only the previous repeater toward the start node.'
  },
  {
    value: SWAPPER_PREDICATE_STRATEGIES.BINARY_TREE,
    label: 'Binary tree',
    description: 'Recursively swap each subchain midpoint between its two named boundary nodes.'
  }
]

function currentOptions() {
  const options = {
    startNodeId: form.startNodeId,
    endNodeId: form.endNodeId,
    templateNodeId: form.noRepeaterTemplate ? null : form.templateNodeId,
    repeaterCount: form.repeaterCount,
    createVirtualEdge: form.createVirtualEdge
  }
  if (!form.noRepeaterTemplate) return options
  return {
    ...options,
    automation: {
      entangler: {
        enabled: form.configureEntangler,
        definition: entanglerDefinition.value,
        protocol: entanglerProtocol.value
      },
      swapper: {
        enabled: form.configureSwapper,
        definition: swapperDefinition.value,
        protocol: swapperProtocol.value,
        predicateStrategy: form.predicateStrategy
      },
      tracker: {
        enabled: form.configureTracker,
        definition: trackerDefinition.value,
        protocol: trackerProtocol.value
      }
    }
  }
}

const generatorValidation = computed(() => validateRepeaterChain(net.value, currentOptions()))
const validation = computed(() => generatorValidation.value)
const validationMessage = computed(() => {
  const started = form.startNodeId
    || form.endNodeId
    || form.templateNodeId
    || form.noRepeaterTemplate
    || form.configureEntangler
    || form.configureSwapper
    || form.configureTracker
  return started && !validation.value.valid ? validation.value.error : ''
})

watch(entanglerDefinition, resetEntanglerConstructor)
watch(swapperDefinition, resetSwapperConstructor)
watch(trackerDefinition, resetTrackerConstructor)

watch(entanglerAvailable, available => {
  if (!available) form.configureEntangler = false
})
watch(swapperAvailable, available => {
  if (!available) form.configureSwapper = false
})
watch(trackerAvailable, available => {
  if (!available) form.configureTracker = false
})

watch(() => form.noRepeaterTemplate, enabled => {
  if (!enabled) {
    form.configureEntangler = false
    form.configureSwapper = false
    form.configureTracker = false
  }
})

watch(() => form.configureSwapper, enabled => {
  if (!enabled && form.predicateStrategy !== customStrategy) {
    form.predicateStrategy = customStrategy
  }
})

watch(() => form.predicateStrategy, (strategy, previousStrategy) => {
  if (previousStrategy === customStrategy && strategy !== customStrategy) {
    captureCustomPredicates()
  }
  if (strategy === customStrategy) {
    restoreCustomPredicates()
  } else {
    applyGeneratedPredicatePreview()
  }
})

watch(
  () => [
    form.repeaterCount,
    form.startNodeId,
    form.endNodeId,
    ...plannedRepeaterNames.value
  ],
  () => {
    if (generatedPredicateStrategy.value) applyGeneratedPredicatePreview()
  }
)

watch(() => props.show, isShown => {
  if (isShown) resetForm()
}, { immediate: true })

function resetForm() {
  form.startNodeId = ''
  form.endNodeId = ''
  form.templateNodeId = ''
  form.noRepeaterTemplate = false
  form.repeaterCount = 1
  form.createVirtualEdge = true
  form.configureEntangler = false
  form.configureSwapper = false
  form.configureTracker = false
  form.predicateStrategy = customStrategy
  resetEntanglerConstructor()
  resetSwapperConstructor()
  resetTrackerConstructor()
}

function resetEntanglerConstructor() {
  const definition = entanglerDefinition.value
  if (!definition) {
    entanglerProtocol.value = null
    return
  }
  entanglerProtocol.value = seedProtocolConstructor(definition)
}

function resetSwapperConstructor() {
  const definition = swapperDefinition.value
  if (!definition) {
    swapperProtocol.value = null
    customPredicateValues.value = {}
    return
  }
  swapperProtocol.value = seedProtocolConstructor(definition)
  captureCustomPredicates()
  if (generatedPredicateStrategy.value) applyGeneratedPredicatePreview()
}

function resetTrackerConstructor() {
  trackerProtocol.value = trackerDefinition.value
    ? seedProtocolConstructor(trackerDefinition.value)
    : null
}

function predicateParameter(name) {
  return swapperProtocol.value?.parameters?.find(parameter => parameter.name === name) || null
}

function captureCustomPredicates() {
  customPredicateValues.value = Object.fromEntries(
    ['nodeL', 'nodeH'].map(name => [name, deepClone(predicateParameter(name))])
  )
}

function restoreCustomPredicates() {
  if (!swapperProtocol.value) return
  for (const name of ['nodeL', 'nodeH']) {
    const saved = customPredicateValues.value[name]
    const index = swapperProtocol.value.parameters?.findIndex(parameter => parameter.name === name)
    if (saved && index >= 0) swapperProtocol.value.parameters.splice(index, 1, deepClone(saved))
  }
}

function setGeneratedPredicatePreview(preview = null) {
  for (const name of ['nodeL', 'nodeH']) {
    const parameter = predicateParameter(name)
    if (!parameter) continue
    parameter.selectedType = 'Lambda'
    parameter.value = preview?.[name] ?? ''
    delete parameter.error
    delete parameter.latex
  }
}

function applyGeneratedPredicatePreview() {
  if (!swapperProtocol.value || !generatedPredicateStrategy.value) return
  const startNode = props.nodes.find(node => node.id === form.startNodeId)
  const endNode = props.nodes.find(node => node.id === form.endNodeId)
  if (!startNode || !endNode || !Number.isInteger(form.repeaterCount)) {
    setGeneratedPredicatePreview()
    return
  }

  let sources
  try {
    sources = buildSwapperPredicateSources({
      strategy: form.predicateStrategy,
      repeaterCount: form.repeaterCount,
      startNodeName: startNode.name,
      endNodeName: endNode.name,
      repeaterNameAt: index => plannedRepeaterNames.value[index]
    })
  } catch {
    setGeneratedPredicatePreview()
    return
  }
  const preview = sources[0]
  setGeneratedPredicatePreview(preview)
}

function edgeLabel(edge) {
  return `${edge.source?.name || edge.source?.id || edge.source} to ${edge.target?.name || edge.target?.id || edge.target}`
}

function handleConfirm() {
  if (!validation.value.valid) return
  emit('confirm', deepClone(currentOptions()))
}

function handleCancel() {
  emit('cancel')
}
</script>

<style scoped>
.generator-section + .generator-section {
  margin-top: var(--app-space-6);
}

.generator-section > h3 {
  margin: 0 0 var(--app-space-4);
  color: var(--app-color-text);
  font-size: 1rem;
}

.section-description,
.option-description,
.controlled-fields-note {
  color: var(--app-color-text-muted);
  line-height: 1.4;
}

.section-description {
  margin: var(--app-space-3) 0 0;
  font-size: 0.86rem;
}

.automation-introduction {
  margin: calc(-1 * var(--app-space-2)) 0 var(--app-space-4);
}

.automation-options {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}

.option-card {
  padding: var(--app-space-4);
  border: solid 1px var(--app-color-border);
  border-radius: var(--app-radius-surface);
  background: var(--app-color-surface);
}

.compact-option {
  margin-top: var(--app-space-4);
}

.no-template-option {
  margin-bottom: var(--app-space-4);
}

.option-unavailable {
  background: var(--app-color-surface-subtle);
}

.option-control-line,
.checkbox-field,
.radio-field {
  display: flex;
  align-items: center;
}

.option-control-line {
  justify-content: space-between;
  gap: var(--app-space-3);
}

.checkbox-field,
.radio-field {
  gap: var(--app-space-2);
  color: var(--app-color-text);
  font-weight: 600;
}

.checkbox-field input,
.radio-field input {
  flex: 0 0 auto;
  width: auto;
  margin: 0;
}

.option-description {
  margin: var(--app-space-2) 0 0 calc(1rem + var(--app-space-2));
  font-size: 0.82rem;
}

.strategy-fieldset {
  margin: var(--app-space-4) 0 0;
  padding: var(--app-space-3);
  border: solid 1px var(--app-color-border);
  border-radius: var(--app-radius-control);
}

.strategy-fieldset legend {
  padding: 0 var(--app-space-2);
  color: var(--app-color-text);
  font-weight: 600;
}

.strategy-option + .strategy-option {
  margin-top: var(--app-space-3);
}

.constructor-panel {
  margin-top: var(--app-space-4);
  padding: var(--app-space-4);
  border-left: 3px solid var(--app-color-primary);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface-subtle);
}

.constructor-panel h4 {
  margin: 0 0 var(--app-space-3);
  color: var(--app-color-text);
  font-size: 0.92rem;
}

.controlled-fields-note {
  margin: 0 0 var(--app-space-3);
  font-size: 0.82rem;
}

@media (max-width: 640px) {
  .option-card,
  .constructor-panel {
    padding: var(--app-space-3);
  }

  .option-description {
    margin-left: 0;
  }
}
</style>
