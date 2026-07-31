<template>
  <AppDialog
    :show="show"
    title="About WebQuantumSavory Simulation Builder"
    width="min(700px, calc(100vw - 32px))"
    class="about-modal"
    closable
    dismissable-mask
    @close="emit('close')"
  >
    <div class="modal-content">
        <section class="quantumsavory-feature" aria-labelledby="quantumsavory-title">
          <span class="feature-label">Powered by</span>
          <h4 id="quantumsavory-title">
            <a href="https://quantumsavory.org/" target="_blank" rel="noopener noreferrer">
              QuantumSavory
            </a>
          </h4>
          <p>
            WebQuantumSavory is an interactive builder for designing and running quantum-network
            simulations. Its simulation engine and reusable network protocols come from the
            QuantumSavory ecosystem for realistic quantum-network modeling.
          </p>
          <a
            class="feature-link"
            href="https://quantumsavory.org/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Explore QuantumSavory <ArrowRight :size="15" aria-hidden="true" />
          </a>
        </section>

        <section class="about-section">
          <h4>Built with open-source tools</h4>
          <p>
            The
            <a href="https://julialang.org/" target="_blank" rel="noopener noreferrer">Julia</a>
            web service uses
            <a href="https://genieframework.com/" target="_blank" rel="noopener noreferrer">Genie</a>.
            The browser interface is built with
            <a href="https://vuejs.org/" target="_blank" rel="noopener noreferrer">Vue</a> and
            <a href="https://vite.dev/" target="_blank" rel="noopener noreferrer">Vite</a>, with
            <a href="https://primevue.org/" target="_blank" rel="noopener noreferrer">PrimeVue</a>
            components. The interactive map is rendered with
            <a
              href="https://maplibre.org/maplibre-gl-js/docs/"
              target="_blank"
              rel="noopener noreferrer"
            >MapLibre GL JS</a>.
          </p>
        </section>

        <section class="about-section" aria-labelledby="local-run-title">
          <h4 id="local-run-title">Run WebQuantumSavory locally</h4>
          <p>
            After cloning the repository, run the remaining commands from its
            <code>WebQuantumSavory</code> directory.
          </p>
          <ol class="local-run-steps">
            <li>
              Install Juliaup through the
              <a href="https://julialang.org/install/" target="_blank" rel="noopener noreferrer">
                Julia installation page</a>.
            </li>
            <li><code>git clone https://github.com/QuantumSavory/WebQuantumSavory.git</code></li>
            <li><code>julia --project=. -e 'using Pkg; Pkg.instantiate(); Pkg.precompile()'</code></li>
            <li><code>WQS_DEPLOYMENT_PROFILE=local WQS_ENABLE_SOURCE_EVALUATION=true ./bin/server</code></li>
          </ol>
          <p class="unsafe-evaluation-note">
            The final command enables unsafe evaluation. Use it only with projects and code you trust.
          </p>
        </section>

        <section class="about-section">
          <h4>Created and supported by</h4>
          <p>
            The broader QuantumSavory project was created and is managed by the
            <a href="https://lab.krastanov.org/" target="_blank" rel="noopener noreferrer">
              Krastanov Lab
            </a>
            at the University of Massachusetts Amherst's
            <a href="https://www.cics.umass.edu/" target="_blank" rel="noopener noreferrer">
              Manning College of Information and Computer Sciences (CICS)</a>.
            It is developed with contributions from many volunteers.
          </p>
          <p>
            The development effort is supported by the
            <a href="https://cqn-erc.arizona.edu/" target="_blank" rel="noopener noreferrer">
              NSF Engineering and Research Center for Quantum Networks
            </a>
            and
            <a
              href="https://www.nsf.gov/awardsearch/show-award/?AWD_ID=2346089"
              target="_blank"
              rel="noopener noreferrer"
            >NSF Grant 2346089</a>,
            “Research Infrastructure: CIRC: New: Full-stack Codesign Tools for Quantum Hardware.”
          </p>
        </section>

        <section class="about-section community-section">
          <h4>Join the community</h4>
          <div class="community-links">
            <a
              class="community-link"
              href="https://quantumsavory.org/community/office-hours/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle :size="18" aria-hidden="true" />
              <span>
                <strong>Office hours</strong>
                <small>Ask questions and find current scheduling and joining details.</small>
              </span>
            </a>
            <a
              class="community-link"
              href="https://quantumsavory.org/community/bounties/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <CodeXml :size="18" aria-hidden="true" />
              <span>
                <strong>Bounty program</strong>
                <small>Contribute fixes and enhancements across the open-source ecosystem.</small>
              </span>
            </a>
          </div>
        </section>
    </div>

    <template #footer>
      <AppButton variant="primary" @click="emit('close')">Close</AppButton>
    </template>
  </AppDialog>
</template>

<script setup>
import { ArrowRight, CodeXml, MessageCircle } from '@lucide/vue'
import AppButton from './ui/AppButton.vue'
import AppDialog from './ui/AppDialog.vue'

defineProps({
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])
</script>

<style scoped>
.about-modal {
  max-height: 86vh;
}

.modal-content {
  min-height: 0;
  padding-right: 5px;
}

.quantumsavory-feature {
  margin-bottom: 28px;
  padding: 24px;
  border: 1px solid #d9daf7;
  border-left: 5px solid #4345ac;
  border-radius: 8px;
  background: linear-gradient(135deg, #f6f6ff 0%, #fff 100%);
}

.feature-label {
  display: block;
  margin-bottom: 4px;
  color: #656791;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.quantumsavory-feature h4 {
  margin: 0 0 10px;
  font-size: 1.8rem;
  line-height: 1.2;
}

.quantumsavory-feature h4 a {
  color: #35379b;
  text-decoration: none;
}

.quantumsavory-feature h4 a:hover,
.quantumsavory-feature h4 a:focus-visible {
  text-decoration: underline;
}

.quantumsavory-feature p {
  margin: 0 0 14px;
  color: #464646;
  line-height: 1.6;
}

.feature-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #35379b;
  font-weight: 600;
  text-decoration: none;
}

.feature-link:hover,
.feature-link:focus-visible {
  text-decoration: underline;
}

.about-section {
  margin-bottom: 25px;
}

.about-section h4 {
  margin: 0 0 10px;
  font-size: 1.1rem;
  font-weight: 600;
  color: #4345ac;
}

.about-section p {
  margin: 0;
  line-height: 1.65;
  color: #555;
}

.about-section p + p {
  margin-top: 10px;
}

.local-run-steps {
  display: grid;
  gap: 10px;
  margin: 14px 0 0;
  padding-left: 24px;
  color: #555;
}

.local-run-steps code {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  padding: 8px 10px;
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface-subtle);
  color: var(--app-color-text);
  font: 0.82rem/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  white-space: nowrap;
}

.about-section p code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.about-section .unsafe-evaluation-note {
  margin-top: 12px;
  font-size: 0.9rem;
}

.about-section p a {
  color: #35379b;
  font-weight: 500;
  text-underline-offset: 2px;
}

.community-section {
  margin-bottom: 0;
}

.community-links {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.community-link {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border: 1px solid #dedff0;
  border-radius: 7px;
  color: #35379b;
  text-decoration: none;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.community-link:hover,
.community-link:focus-visible {
  border-color: #7b7dcc;
  background: #f7f7ff;
}

.community-link .lucide {
  margin-top: 2px;
}

.community-link span {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.community-link small {
  color: #5c5c65;
  font-size: 0.86rem;
  line-height: 1.4;
}

@media (max-width: 600px) {
  .about-modal {
    min-width: 0;
  }

  .quantumsavory-feature {
    padding: 18px;
  }

  .community-links {
    grid-template-columns: 1fr;
  }
}
</style>
