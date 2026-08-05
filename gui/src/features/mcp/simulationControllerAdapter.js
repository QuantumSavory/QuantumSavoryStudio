export function createSimulationControllerAdapter(controller) {
  async function invoke(name, action, ...args) {
    const accepted = await action(...args)
    if (!accepted) {
      throw controller.getLastError?.()
        ?? new Error(`Simulation action was not accepted: ${name}`)
    }
    return true
  }

  return {
    prepare: () => invoke('prepare', controller.prepareSimulation),
    invalidate: () => controller.invalidatePreparedRevision(),
    run: duration => invoke('run', controller.runSimulationWithSteps, duration),
    pause: () => invoke('pause', controller.pauseSimulation),
    resume: () => invoke('resume', controller.resumeSimulation),
    reset: () => invoke('reset', controller.stopSimulation),
  }
}
