"""
Transport-neutral access to the process-local simulation runtime.

HTTP routes and the collaboration feature both use this service. The service
owns named-state lookup and transition serialization; the underlying simulation
algorithms remain the established WebQuantumSavory functions.
"""
mutable struct SimulationLifecycleLock
  lock::ReentrantLock
  users::Int
end

mutable struct SimulationService
  states::Dict{String,State}
  lock::ReentrantLock
  lifecycle_locks::Dict{String,SimulationLifecycleLock}
end

SimulationService(states::Dict{String,State}=STATE) =
  SimulationService(
    states,
    ReentrantLock(),
    Dict{String,SimulationLifecycleLock}(),
  )

const SIMULATION_SERVICE = SimulationService()

function simulation_names(service::SimulationService=SIMULATION_SERVICE)
  lock(service.lock) do
    return collect(keys(service.states))
  end
end

function _acquire_simulation_lifecycle_lock(
  service::SimulationService,
  name::String,
)
  lock(service.lock) do
    lifecycle = get!(service.lifecycle_locks, name) do
      SimulationLifecycleLock(ReentrantLock(), 0)
    end
    lifecycle.users += 1
    return lifecycle
  end
end

function _release_simulation_lifecycle_lock!(
  service::SimulationService,
  name::String,
  lifecycle::SimulationLifecycleLock,
)
  lock(service.lock) do
    lifecycle.users -= 1
    if lifecycle.users == 0 &&
      !haskey(service.states, name) &&
      get(service.lifecycle_locks, name, nothing) === lifecycle
      delete!(service.lifecycle_locks, name)
    end
  end
end

function _with_simulation_lifecycle_lock(
  operation::Function,
  service::SimulationService,
  name::AbstractString,
)
  simulation_name = String(name)
  lifecycle = _acquire_simulation_lifecycle_lock(service, simulation_name)
  try
    return lock(operation, lifecycle.lock)
  finally
    _release_simulation_lifecycle_lock!(service, simulation_name, lifecycle)
  end
end

function _simulation_state(service::SimulationService, name::AbstractString)
  lock(service.lock) do
    state = get(service.states, String(name), nothing)
    state === nothing && throw(not_found_error("Simulation", String(name)))
    return state
  end
end

function simulation_exists(
  service::SimulationService,
  name::AbstractString,
)
  lock(service.lock) do
    return haskey(service.states, String(name))
  end
end

simulation_exists(name::AbstractString) = simulation_exists(SIMULATION_SERVICE, name)

function simulation_list(service::SimulationService=SIMULATION_SERVICE)
  lock(service.lock) do
    return [
      Dict(:name => state.name, :status => _determine_status(state))
      for state in values(service.states)
    ]
  end
end

function simulation_create!(
  service::SimulationService,
  payload::AbstractDict;
  validation=validate_payload(payload),
  builder=build_simulation_state,
)
  name = string(validation["data"]["name"])
  # Construct the replacement before touching a healthy existing simulation.
  # Parsing may fail after structural validation (for example while materializing
  # a runtime protocol), and such a failure must leave the prior state intact.
  state = builder(validation)
  _with_simulation_lifecycle_lock(service, name) do
    simulation_action_is_valid!(service, name; destroy=true, lifecycle_locked=true)
    lock(service.lock) do
      service.states[name] = state
    end
    return state
  end
end

simulation_create!(payload::AbstractDict; kwargs...) =
  simulation_create!(SIMULATION_SERVICE, payload; kwargs...)

function simulation_prepare!(service::SimulationService, name::AbstractString)
  _with_simulation_lifecycle_lock(service, name) do
    state = _simulation_state(service, name)
    state.network === nothing && throw(
      validation_error("Network not found in simulation $(String(name))"),
    )
    return prepare_simulation(state, String(name); service)
  end
end

simulation_prepare!(name::AbstractString) = simulation_prepare!(SIMULATION_SERVICE, name)

function simulation_run!(
  service::SimulationService,
  name::AbstractString,
  absolute_target::Real,
)
  _with_simulation_lifecycle_lock(service, name) do
    state = _simulation_state(service, name)
    state.simulation === nothing && throw(validation_error("Simulation not prepared"))
    return run_simulation(
      state,
      Float64(absolute_target),
      String(name);
      service,
    )
  end
end

simulation_run!(name::AbstractString, target::Real) =
  simulation_run!(SIMULATION_SERVICE, name, target)

function simulation_pause!(service::SimulationService, name::AbstractString)
  # pause_simulation waits for the cooperative runner acknowledgement. Do not
  # retain the lifecycle lock across that wait.
  state = _with_simulation_lifecycle_lock(service, name) do
    _simulation_state(service, name)
  end
  pause_simulation(state)
  return state
end

simulation_pause!(name::AbstractString) = simulation_pause!(SIMULATION_SERVICE, name)

_simulation_execution_active(state::State) =
  state.is_running ||
  (state.run_task !== nothing && !istaskdone(state.run_task))

function simulation_block!(
  service::SimulationService,
  name::AbstractString;
  kwargs...,
)
  _with_simulation_lifecycle_lock(service, name) do
    state = _simulation_state(service, name)
    if _simulation_execution_active(state)
      throw(simulation_is_running_exception(String(name)))
    end
    report = block_simulation(state; kwargs...)
    if !cleanup_succeeded(report)
      _discard_simulation_record!(service, name, state)
      throw(_cleanup_failure_error(name, report))
    end
    return state
  end
end

simulation_block!(name::AbstractString; kwargs...) =
  simulation_block!(SIMULATION_SERVICE, name; kwargs...)

function _cleanup_failure_error(
  simulation_name::AbstractString,
  report::CleanupReport,
)
  APIError(
    "Simulation was discarded after resource cleanup failed",
    500,
    "SIMULATION_CLEANUP_FAILED",
    Dict{String,Any}(
      "simulation" => String(simulation_name),
      "failure_count" => length(report.failures),
      "failures" => deepcopy(report.failures),
      "degradation_event" => deepcopy(report.degradation_event),
    ),
  )
end

function _discard_simulation_record!(
  service::SimulationService,
  name::AbstractString,
  state::State,
)
  lock(service.lock) do
    simulation_name = String(name)
    get(service.states, simulation_name, nothing) === state ||
      return nothing
    delete!(service.states, simulation_name)
    lifecycle = get(service.lifecycle_locks, simulation_name, nothing)
    if lifecycle !== nothing && lifecycle.users == 0
      delete!(service.lifecycle_locks, simulation_name)
    end
  end
  return nothing
end

function _cleanup_and_discard!(
  service::SimulationService,
  name::AbstractString,
  state::State;
  release_slot!::Function=QuantumSavory.traceout!,
)
  report = try
    cleanup_state!(state; release_slot!)
  catch error
    _discard_heavy_state_references!(state)
    _cleanup_degradation_report(
      state,
      Dict{String,Any}[_cleanup_failure("cleanup_boundary", error)],
    )
  finally
    _discard_simulation_record!(service, name, state)
  end
  cleanup_succeeded(report) ||
    throw(_cleanup_failure_error(name, report))
  return true
end

function simulation_destroy!(
  service::SimulationService,
  name::AbstractString;
  missing_ok::Bool=false,
  release_slot!::Function=QuantumSavory.traceout!,
)
  _with_simulation_lifecycle_lock(service, name) do
    state = lock(service.lock) do
      get(service.states, String(name), nothing)
    end
    state === nothing && return missing_ok ? true :
      throw(not_found_error("Simulation", String(name)))
    if _simulation_execution_active(state)
      throw(simulation_is_running_exception(String(name)))
    end
    return _cleanup_and_discard!(
      service,
      name,
      state;
      release_slot!,
    )
  end
end

simulation_destroy!(name::AbstractString; kwargs...) =
  simulation_destroy!(SIMULATION_SERVICE, name; kwargs...)

function simulation_action_is_valid!(
  service::SimulationService,
  name::AbstractString;
  destroy::Bool=true,
  lifecycle_locked::Bool=false,
)
  check = function ()
    state = lock(service.lock) do
      get(service.states, String(name), nothing)
    end
    state === nothing && return true
    _simulation_execution_active(state) &&
      throw(simulation_is_running_exception(String(name)))
    if (state.execution_time_exceeded || state.auto_purged) && !destroy
      throw(simulation_blocked_exception(String(name)))
    end
    destroy || return true

    @warn "Simulation $(String(name)) already exists, destroying it" simulation_name=String(name)
    @log_event state Logging.Warn "Simulation $(String(name)) already exists, destroying it" simulation_name=String(name)
    return _cleanup_and_discard!(service, name, state)
  end
  lifecycle_locked && return check()
  return _with_simulation_lifecycle_lock(check, service, name)
end

simulation_action_is_valid!(name::AbstractString; kwargs...) =
  simulation_action_is_valid!(SIMULATION_SERVICE, name; kwargs...)

function simulation_status(service::SimulationService, name::AbstractString)
  return serialize_state(_simulation_state(service, name))
end

simulation_status(name::AbstractString) = simulation_status(SIMULATION_SERVICE, name)

function simulation_results(service::SimulationService, name::AbstractString)
  return serialize_state(_simulation_state(service, name))
end

simulation_results(name::AbstractString) = simulation_results(SIMULATION_SERVICE, name)

function simulation_slot_result(
  service::SimulationService,
  name::AbstractString,
  slot_id::AbstractString,
)
  return get_slot_state(String(slot_id), _simulation_state(service, name))
end

simulation_slot_result(name::AbstractString, slot_id::AbstractString) =
  simulation_slot_result(SIMULATION_SERVICE, name, slot_id)

function simulation_protocol_result(
  service::SimulationService,
  name::AbstractString,
  protocol_id::AbstractString,
)
  return get_protocol_state(String(protocol_id), _simulation_state(service, name))
end

simulation_protocol_result(name::AbstractString, protocol_id::AbstractString) =
  simulation_protocol_result(SIMULATION_SERVICE, name, protocol_id)

function simulation_logs(
  service::SimulationService,
  name::AbstractString;
  purge::Bool=false,
  limit::Union{Nothing,Integer}=100,
)
  limit === nothing || 1 <= limit <= 500 ||
    throw(validation_error("Log limit must be between 1 and 500"))
  state = _simulation_state(service, name)
  logs = get_logs(state, purge)
  limit === nothing && return logs
  return logs[max(1, length(logs) - Int(limit) + 1):end]
end

simulation_logs(name::AbstractString; kwargs...) =
  simulation_logs(SIMULATION_SERVICE, name; kwargs...)

function simulation_update_for_test!(
  service::SimulationService,
  name::AbstractString,
  payload::AbstractDict,
)
  _with_simulation_lifecycle_lock(service, name) do
    state = _simulation_state(service, name)
    for field in (
      "is_running",
      "simulation_paused",
      "has_run",
      "simulation_progress",
      "simulation_started_at",
      "simulation_last_active_time",
    )
      haskey(payload, field) || continue
      setproperty!(state, Symbol(field), payload[field])
    end
    if haskey(payload, "block_reason")
      block_reason = string(payload["block_reason"])
      block_reason in ("timeout", "autopurge") || throw(
        validation_error("block_reason must be 'timeout' or 'autopurge'"),
      )
      reason = Symbol(block_reason)
      report = block_simulation(
        state;
        reason,
        max_minutes=reason == :timeout ? MAX_SIM_RUNTIME_MINUTES : 30,
        auto_purged=reason == :autopurge,
      )
      if !cleanup_succeeded(report)
        _discard_simulation_record!(service, name, state)
        throw(_cleanup_failure_error(name, report))
      end
    end
    return state
  end
end

simulation_update_for_test!(name::AbstractString, payload::AbstractDict) =
  simulation_update_for_test!(SIMULATION_SERVICE, name, payload)
