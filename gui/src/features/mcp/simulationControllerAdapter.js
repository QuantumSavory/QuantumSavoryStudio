export function createSimulationControllerAdapter(controller) {
  return {
    prepare: (_duration, options) => controller.prepareSimulation(options),
    run: (duration, options) => controller.runSimulationWithSteps(duration, options),
    pause: () => controller.pauseSimulation(),
    resume: () => controller.resumeSimulation(),
    reset: () => controller.stopSimulation(),
  }
}
