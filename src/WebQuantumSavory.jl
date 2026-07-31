module WebQuantumSavory

using Genie

using QuantumSavory
using QuantumSavory.ProtocolZoo
using InteractiveUtils
using REPL
import JSON
using Graphs
using ConcurrentSim
using Logging
using Base64
import CairoMakie
using Genie
using Dates
import ResumableFunctions
using ResumableFunctions: @resumable

struct APIError <: Exception
  message::String
  status_code::Int
  error_code::String
  details::Union{Nothing,Dict{String,Any}}
end

APIError(message::String, status_code::Int) = APIError(message, status_code, "", nothing)
APIError(message::String, status_code::Int, error_code::String) = APIError(message, status_code, error_code, nothing)

Base.showerror(io::IO, e::APIError) = print(io, "APIError: $(e.message) (status: $(e.status_code))")


# include("constructors.jl")
include("errors.jl")
include("evaluation_policy.jl")
include("mcp_config.jl")
include("platform_info.jl")
include("types.jl")
# After types.jl so the guard can derive its context-name allowlist from the
# authoritative EDGE_CONTEXT_DESCRIPTORS-based binding catalog. types.jl only
# calls the guard from function bodies, which resolve at runtime.
include("source_allowlist.jl")
include("restricted_evaluation.jl")
include("Sandbox.jl")
include("Logger.jl")
include("states_zoo.jl")
include("representations.jl")
include("parser.jl")
include("diagnostics.jl")
include("script_export.jl")
using .Logger: @log_event

const up = Genie.up
export up

# Configuration constants
const MAX_SIM_RUNTIME_MINUTES = 10

@kwdef mutable struct State
  name::String
  payload::Union{Nothing, Dict} = nothing
  graph::Union{Nothing, SimpleGraph} = nothing
  network::Union{Nothing, RegisterNet} = nothing
  protocols_launched::Union{Nothing, Dict{String, Int}} = nothing
  simulation::Union{Nothing, Simulation} = nothing
  has_run::Bool = false
  is_running::Bool = false
  simulation_paused::Bool = false
  pause_requested::Bool = false
  run_task::Union{Nothing, Task} = nothing
  slot_mapping::Union{Nothing, Dict{String, Any}} = nothing
  slot_reverse_mapping::Union{Nothing, IdDict{Any, String}} = nothing
  protocol_mapping::Union{Nothing, Dict{String, Any}} = nothing
  simulation_time::Union{Nothing, Float64} = nothing
  simulation_progress::Union{Nothing, Float64} = nothing
  log_events::Vector{Any} = Any[]
  error::Union{Nothing, Exception} = nothing
  simulation_panic::Union{Nothing, Dict} = nothing
  simulation_last_active_time::Union{Nothing, DateTime} = nothing
  simulation_started_at::Union{Nothing, DateTime} = nothing
  execution_time_exceeded::Bool = false
  auto_purged::Bool = false
end

const STATE = Dict{String, State}()

"""Build and retain the slot-object-to-external-ID mapping when it is available."""
function ensure_slot_reverse_mapping!(state::State)
  reverse_mapping = if state.slot_reverse_mapping === nothing
    IdDict{Any,String}()
  else
    state.slot_reverse_mapping
  end

  if state.slot_mapping !== nothing && length(reverse_mapping) != length(state.slot_mapping)
    empty!(reverse_mapping)
    for (slot_id, slot) in state.slot_mapping
      reverse_mapping[slot] = slot_id
    end
  end
  state.slot_reverse_mapping = reverse_mapping
  return reverse_mapping
end

include("tag_metadata.jl")

function main()
  # Validate an explicit override before Genie starts and handles route-loading
  # errors internally. Environment-specific defaults are resolved at use time.
  unsafe_code_evaluation_enabled()
  # Fail before Genie starts if the diagnostic-protocol flag is malformed.
  mock_broken_protocol_enabled()
  mcp_settings = _read_mcp_environment_settings(ENV)
  if !mcp_settings.enabled
    _configure_mcp!(
      mcp_settings;
      backend_host=string(Genie.config.server_host),
      backend_port=Genie.config.server_port,
    )
    return Genie.genie(context=@__MODULE__)
  end

  # MCP needs a validation point after `Loader.loadenv` selects the environment
  # but before routes load. Genie 5.35.15 does not expose that hook and applies
  # CLI `-l`/`-p` overrides later in `Commands.execute`, so the enabled path
  # mirrors `Genie.genie` from Genie.jl and the endpoint parsing in Commands.jl.
  server = Genie.Loader.loadenv(context=@__MODULE__)
  endpoint = effective_genie_server_endpoint()
  Genie.config.server_host = endpoint.host
  Genie.config.server_port = endpoint.port
  _configure_mcp!(
    mcp_settings;
    backend_host=endpoint.host,
    backend_port=endpoint.port,
  )
  Genie.Secrets.load(context=@__MODULE__)
  Genie.Loader.load(context=@__MODULE__)
  Genie.config.watch && @async Genie.Watch.watch(pwd())
  Genie.run(server=server)
  return server
end

















function get_protocol_state(protocol_id::String, state::State)
  # Check if protocol exists in mapping
  if state.protocol_mapping === nothing || !haskey(state.protocol_mapping, protocol_id)
    throw(not_found_error("Protocol", protocol_id))
  end

  protocol = state.protocol_mapping[protocol_id]

  # Get HTML and PNG representations as base64
  html_base64 = nothing
  png_base64 = nothing

  # Generate HTML representation
  try
    html_buffer = IOBuffer()
    show(html_buffer, MIME"text/html"(), protocol)
    html_content = String(take!(html_buffer))
    html_base64 = base64encode(html_content)
  catch e
    @warn "Failed to render HTML for protocol $protocol_id: $e"
  end

  # Generate PNG representation
  try
    png_buffer = IOBuffer()
    show(png_buffer, MIME"image/png"(), protocol)
    png_content = take!(png_buffer)
    png_base64 = base64encode(png_content)
  catch e
    @warn "Failed to render PNG for protocol $protocol_id: $e"
  end

  Dict(
    "protocol_id" => protocol_id,
    "protocol_type" => string(typeof(protocol)),
    "html_base64" => html_base64,
    "png_base64" => png_base64
  )
end

function get_slot_state(slot_id::String, state::State)
  # Check if slot exists in mapping
  if state.slot_mapping === nothing || !haskey(state.slot_mapping, slot_id)
    throw(not_found_error("Slot", slot_id))
  end

  slot = state.slot_mapping[slot_id]

  # Get the state of the slot
  slot_state = QuantumSavory.stateof(slot)

  # Get entangled slots with detailed information
  entangled_slots = []
  entangled_slot_details = []

  if !isnothing(slot_state)
    entangled_slot_refs = QuantumSavory.slots(slot_state)
    local_reverse = ensure_slot_reverse_mapping!(state)

    for slot_ref in entangled_slot_refs
      # Find the slot ID via reverse mapping
      slot_id_found = get(local_reverse, slot_ref, nothing)
      if slot_id_found !== nothing
        push!(entangled_slots, slot_id_found)
      end

      # Add detailed information about the entangled slot
      parent_reg = QuantumSavory.parent(slot_ref)
      slot_idx = QuantumSavory.parentindex(slot_ref)
      push!(entangled_slot_details, Dict(
        "slot_id" => slot_id_found,
        "parent_reg_index" => QuantumSavory.parentindex(parent_reg),
        "slot_index" => slot_idx,
        "parent_reg" => string(typeof(parent_reg))
      ))
    end
  end

  # Get HTML and PNG representations as base64
  html_base64 = nothing
  png_base64 = nothing

  if !isnothing(slot_state)
    # Generate HTML representation
    try
      html_buffer = IOBuffer()
      show(html_buffer, MIME"text/html"(), slot_state)
      html_content = String(take!(html_buffer))
      html_base64 = base64encode(html_content)
    catch e
      @warn "Failed to render HTML state for slot $slot_id: $e"
    end

    # Generate PNG representation
    try
      png_buffer = IOBuffer()
      show(png_buffer, MIME"image/png"(), slot_state)
      png_content = take!(png_buffer)
      png_base64 = base64encode(png_content)
    catch e
      @warn "Failed to render PNG state for slot $slot_id: $e"
    end
  end

  # Get access times if available
  access_time = nothing
  if state.network !== nothing
    # Find the register and slot index for this slot
    for (reg_idx, reg) in enumerate(state.network.registers)
      for slot_idx in 1:nsubsystems(reg)
        reg_slot = reg[slot_idx]
        if reg_slot === slot
          access_time = reg.accesstimes[slot_idx]
          break
        end
      end
    end
  end

  Dict(
    "slot_id" => slot_id,
    "state_type" => slot_state !== nothing ? string(typeof(slot_state)) : nothing,
    "is_locked" => QuantumSavory.islocked(slot),
    "is_assigned" => QuantumSavory.isassigned(slot),
    "access_time" => access_time,
    "entangled_slots" => entangled_slots,
    "entangled_slot_details" => entangled_slot_details,
    "html_base64" => html_base64,
    "png_base64" => png_base64
  )
end

function serialize_state(state::State)
  Dict(
    "name" => state.name,
    "status" => _determine_status(state),
    "node_count" => state.graph !== nothing ? nv(state.graph) : 0,
    "edge_count" => state.graph !== nothing ? ne(state.graph) : 0,
    "protocols_launched" => state.protocols_launched,
    "slots" => _serialize_slots(state),
    "protocols" => _serialize_protocols(state),
    "message" => _get_status_message(state),
    "simulation" => Dict(
      "simulation_time" => state.simulation_time,
      "simulation_progress" => state.simulation_progress,
      "simulation_running" => state.is_running,
      "simulation_paused" => state.simulation_paused,
      "simulation_error" => state.error !== nothing ? string(state.error) : nothing,
      "simulation_panic" => state.simulation_panic,
      "simulation_last_active_time" => state.simulation_last_active_time,
      "simulation_started_at" => state.simulation_started_at,
      "simulation_execution_time_exceeded" => state.execution_time_exceeded,
      "simulation_auto_purged" => state.auto_purged
    )
  )
end

function _serialize_slots(state::State)
  if state.slot_mapping === nothing
    return Dict("slots" => [], "entanglements" => [])
  end

  slots_info = []
  entanglements = []

  local_reverse = ensure_slot_reverse_mapping!(state)

  for (slot_id, slot) in state.slot_mapping
    # Get slot state and entangled slots
    slot_state = QuantumSavory.stateof(slot)
    entangled_slot_ids = []

    if !isnothing(slot_state)
      entangled_slot_refs = QuantumSavory.slots(slot_state)
      for slot_ref in entangled_slot_refs
        id_found = get(local_reverse, slot_ref, nothing)
        id_found === nothing || push!(entangled_slot_ids, id_found)
      end
    end

    # Add slot information (avoid serializing complex quantum objects)
    push!(slots_info, Dict(
      "slot_id" => slot_id,
      "state_type" => slot_state !== nothing ? string(typeof(slot_state)) : nothing,
      "is_locked" => QuantumSavory.islocked(slot),
      "is_assigned" => QuantumSavory.isassigned(slot),
      "entangled_slots" => entangled_slot_ids
    ))

    # Add entanglement information (only add each entanglement once)
    for entangled_id in entangled_slot_ids
      entanglement_pair = sort([slot_id, entangled_id])
      if entanglement_pair ∉ entanglements
        push!(entanglements, entanglement_pair)
      end
    end
  end

  Dict(
    "slots" => slots_info,
    "entanglements" => entanglements
  )
end

function _serialize_protocols(state::State)
  if state.protocol_mapping === nothing
    return Dict("protocols" => [])
  end

  protocols_info = []

  for (protocol_id, protocol) in state.protocol_mapping
    # Add protocol information (avoid serializing complex quantum objects)
    push!(protocols_info, Dict(
      "protocol_id" => protocol_id,
      "protocol_type" => string(typeof(protocol))
    ))
  end

  Dict(
    "protocols" => protocols_info
  )
end

const STATUS_COMPLETE = "complete"
const STATUS_PREPARED = "prepared"
const STATUS_CREATED = "created"
const STATUS_UNKNOWN = "unknown"
const STATUS_RUNNING = "running"
const STATUS_NOT_STARTED = "not_started"

function _determine_status(state::State)
  if state.simulation !== nothing
    # Check if simulation has been run
    if state.has_run
      return STATUS_COMPLETE
    else
      return STATUS_PREPARED
    end
  elseif state.graph !== nothing || state.network !== nothing
    # Graph (and possibly network) exist, but no simulation yet
    return STATUS_CREATED
  else
    return STATUS_UNKNOWN
  end
end

const STATUS_MESSAGE_COMPLETE = "Simulation has run"
const STATUS_MESSAGE_PREPARED = "Simulation is prepared and ready to run"
const STATUS_MESSAGE_CREATED = "Network has been created"
const STATUS_MESSAGE_UNKNOWN = "No network data available"

# Single source of truth for status -> message mapping
const STATUS_TO_MESSAGE = Dict(
  STATUS_COMPLETE => STATUS_MESSAGE_COMPLETE,
  STATUS_PREPARED => STATUS_MESSAGE_PREPARED,
  STATUS_CREATED => STATUS_MESSAGE_CREATED,
  STATUS_UNKNOWN => STATUS_MESSAGE_UNKNOWN,
)

function _get_status_message(state::State)
  status = _determine_status(state)
  return get(STATUS_TO_MESSAGE, status, STATUS_MESSAGE_UNKNOWN)
end

function cleanup_state!(state::State)
  """Clean up quantum resources associated with a simulation state"""
  try
    # Clean up quantum objects in the network
    if state.network !== nothing
      @info "Cleaning up quantum network" state_name=state.name

      # Clear quantum states in all slots
      for (reg_idx, reg) in enumerate(state.network.registers)
        for slot_idx in 1:nsubsystems(reg)
          slot = reg[slot_idx]
          try
            if QuantumSavory.isassigned(slot)
              # Trace out the subsystem and remove its register back-reference.
              QuantumSavory.traceout!(slot)
            end
          catch e
            @warn "Failed to cleanup slot" reg_idx=reg_idx slot_idx=slot_idx error=e
          end
        end
      end

      # Clear the network reference
      state.network = nothing
    end

    # Clean up simulation
    if state.simulation !== nothing
      @info "Cleaning up simulation" state_name=state.name
      # Note: ConcurrentSim doesn't have explicit cleanup, but we clear the reference
      state.simulation = nothing
    end

    # Clear mappings
    if state.slot_mapping !== nothing
      @info "Clearing slot mapping" state_name=state.name slot_count=length(state.slot_mapping)
      state.slot_mapping = nothing
    end

    if state.slot_reverse_mapping !== nothing
      @info "Clearing slot reverse mapping" state_name=state.name slot_count=length(state.slot_reverse_mapping)
      state.slot_reverse_mapping = nothing
    end

    if state.protocol_mapping !== nothing
      @info "Clearing protocol mapping" state_name=state.name protocol_count=length(state.protocol_mapping)
      state.protocol_mapping = nothing
    end

    # Clear graph
    if state.graph !== nothing
      @info "Clearing graph" state_name=state.name
      state.graph = nothing
    end

    # Clear payload (it can be large)
    if state.payload !== nothing
      @info "Clearing payload" state_name=state.name
      state.payload = nothing
    end

    @info "Successfully cleaned up state" state_name=state.name
    return true

  catch e
    @error "Failed to cleanup state" state_name=state.name error=e
    return false
  end
end

function launch_protocols(data, net, sim, protocol_mapping = Dict{String, Any}(), state = nothing)
  launched = Dict("nodes" => 0, "edges" => 0, "floating" => 0)
  # Parse once for the full launch. Variable values remain raw until each
  # assignment is resolved in its node/edge/floating protocol context.
  variables = _parse_variables(data["data"])

  # Node-attached protocols: per-node under node["data"]["protocols"]
  nodes = data["graph_info"]["nodes"]
  # The validated node order is the simulator's one-based register order.
  # Construct this once per launch and share the same lookup with every
  # node-, edge-, and net-attached protocol conversion.
  node_name_to_index = _node_name_to_index(nodes)
  for (idx, node) in enumerate(nodes)
    node_data = get(node, "data", Dict{String,Any}())
    node_prots = Vector{Any}(get(node_data, "protocols", Any[]))
    @info "Processing node protocols" node_idx=idx node_name=node["name"] protocol_count=length(node_prots)

    for prot_def in node_prots
      ctx = Dict{Symbol,Any}(
        :sim => sim,
        :net => net,
        :node => idx,
        NODE_NAME_TO_INDEX_CONTEXT_KEY => node_name_to_index,
      )
      prot = _instantiate_protocol(prot_def, ctx, state; variables=variables)
      prot === nothing && continue
      @process prot()
      launched["nodes"] += 1

      # Store protocol instance in mapping if it has an ID
      if haskey(prot_def, "id")
        protocol_id = string(prot_def["id"])
        protocol_mapping[protocol_id] = prot
      end

      @info "Successfully launched node protocol" node_idx=idx protocol_type=typeof(prot)
    end
  end

  # Edge-attached protocols: per-edge under edge["data"]["protocols"]
  # Build id->index mapping once
  id_to_idx = Dict(String(n["id"]) => i for (i, n) in enumerate(nodes))
  edges = data["graph_info"]["edges"]
  @info "Processing edge protocols" edge_count=length(edges)
  for edge in edges
    edge_data = get(edge, "data", Dict{String,Any}())
    edge_prots = Vector{Any}(get(edge_data, "protocols", Any[]))
    @info "Edge protocols found" edge_id=edge["id"] protocol_count=length(edge_prots)
    isempty(edge_prots) && continue

    # Resolve node indices from edge endpoints
    src_id = String(edge["source"])
    dst_id = String(edge["target"])
    nodeA_idx = get(id_to_idx, src_id, 0)
    nodeB_idx = get(id_to_idx, dst_id, 0)
    (nodeA_idx > 0 && nodeB_idx > 0) || continue
    edge_function_context = _edge_function_context(edge, nodeA_idx, nodeB_idx)

    for prot_def in edge_prots
      ctx = Dict{Symbol,Any}(
        :sim => sim,
        :net => net,
        :nodeA => nodeA_idx,
        :nodeB => nodeB_idx,
        NODE_NAME_TO_INDEX_CONTEXT_KEY => node_name_to_index,
        EDGE_FUNCTION_CONTEXT_KEY => edge_function_context,
      )
      prot = _instantiate_protocol(prot_def, ctx, state; variables=variables)
      prot === nothing && continue
      @process prot()
      launched["edges"] += 1

      # Store protocol instance in mapping if it has an ID
      if haskey(prot_def, "id")
        protocol_id = string(prot_def["id"])
        protocol_mapping[protocol_id] = prot
      end

      @info "Successfully launched edge protocol" edge_id=edge["id"] protocol_type=typeof(prot)
    end
  end

  # Floating protocols: net-level under payload["net"]["protocols"] as array
  net_payload = data["data"]["net"]
  floating_prots = Any[]
  if haskey(net_payload, "protocols") && isa(net_payload["protocols"], Vector)
    floating_prots = Vector{Any}(net_payload["protocols"])
  end

  @info "Processing floating protocols" protocol_count=length(floating_prots)

  for prot_def in floating_prots
    ctx = Dict{Symbol,Any}(
      :sim => sim,
      :net => net,
      NODE_NAME_TO_INDEX_CONTEXT_KEY => node_name_to_index,
    )
    prot = _instantiate_protocol(prot_def, ctx, state; variables=variables)
    prot === nothing && continue
    @info "Launching floating protocol" protocol_type=typeof(prot)
    @process prot()
    launched["floating"] += 1

    # Store protocol instance in mapping if it has an ID (consistent with nodes/edges)
    if haskey(prot_def, "id")
      protocol_id = string(prot_def["id"])
      protocol_mapping[protocol_id] = prot
    end

    @info "Successfully launched floating protocol" protocol_type=typeof(prot)
  end

  @info "Protocol launch summary" launched=launched
  return launched
end

function pause_simulation(state::State)
  if !state.is_running
    throw(validation_error("Simulation is not running"))
  end

  if state.simulation === nothing
    throw(validation_error("Simulation not prepared"))
  end

  if state.simulation_paused
    throw(validation_error("Simulation already paused"))
  end

  run_task = state.run_task
  if run_task === nothing
    throw(validation_error("Simulation has no active execution task"))
  end

  state.pause_requested = true
  state.simulation_last_active_time = Dates.now()
  @log_event state Logging.Info "Simulation pause requested"

  # A pause is acknowledged only after the cooperative run task has stopped.
  wait(run_task)

  if !state.simulation_paused
    if state.error !== nothing
      throw(validation_error("Simulation stopped with an error before it could be paused"))
    end
    throw(validation_error("Simulation completed before it could be paused"))
  end

  return true
end

function destroy_simulation(simulation_name)
  return simulation_destroy!(SIMULATION_SERVICE, String(simulation_name))
end

function block_simulation(state::State; reason::Symbol = :timeout, max_minutes::Int = 10, auto_purged::Bool = false)
  # Log the reason and duration
  msg = reason == :autopurge ?
    "Simulation auto-stopped due to inactivity after $(max_minutes) minutes" :
    "Simulation auto-stopped due to exceeding max execution time of $(max_minutes) minutes"
  @log_event state Logging.Warn msg

  # Stop running flags
  state.is_running = false
  state.simulation_paused = false
  state.pause_requested = false

  # Cleanup heavy resources but keep lightweight status for UI
  try
    # Clear network and quantum resources if present
    if state.network !== nothing || state.simulation !== nothing
      cleanup_state!(state)
    end
  catch e
    @warn "Error during cleanup while blocking simulation" error=e
  end

  # Ensure all expensive fields are nilled regardless
  state.payload = nothing
  state.graph = nothing
  state.network = nothing
  state.protocols_launched = nothing
  state.simulation = nothing
  state.slot_mapping = nothing
  state.slot_reverse_mapping = nothing
  state.protocol_mapping = nothing

  # Set flags and timestamps
  # execution_time_exceeded: true for timeout (10 min running), false for auto-purge (30 min idle)
  # auto_purged: true only when purged due to inactivity
  state.execution_time_exceeded = reason == :timeout ? true : false
  state.auto_purged = auto_purged
  state.simulation_started_at = nothing
  state.simulation_last_active_time = Dates.now()

  return true
end


function known_functions()
  [
    first(reference)
    for reference in (SAFE_FUNCTION_REFERENCES..., SELF_COMPARISON_OPERATORS...)
  ]
end


function prepare_simulation(
  state::State,
  simulation_name::String;
  service=SIMULATION_SERVICE,
)
  action_is_valid(
    simulation_name,
    false;
    service,
  ) # just check if running, don't destroy

  # Get the time tracker from the network
  sim = get_network_time_tracker(state.network)

  # Initialize protocol mapping
  protocol_mapping = Dict{String, Any}()

  # Launch protocols from payload over nodes, edges, and floating
  # Pass state so parser warnings get logged
  launch_counts = launch_protocols(state.payload, state.network, sim, protocol_mapping, state)

  state.simulation = sim
  state.protocols_launched = launch_counts
  state.protocol_mapping = protocol_mapping
  state.simulation_last_active_time = Dates.now()

  return state
end

function _panic_record(error::Exception, backtrace)
  exception_type = string(typeof(error))
  Dict{String,Any}(
    "id" => Logger.next_event_id("panic"),
    "timestamp" => Logger.event_timestamp(),
    "source" => "Simulator",
    "severity" => "panic",
    "summary" => "Simulation crashed with $exception_type",
    "exception_type" => exception_type,
    "message" => sprint(showerror, error),
    "stacktrace" => Logger.format_exception_stacktrace(error, backtrace),
  )
end

function _record_run_error!(state::State, error, backtrace=catch_backtrace())
  exception = error isa Exception ? error : ErrorException(string(error))
  @error "Error running simulation" exception=(exception, backtrace)

  panic = _panic_record(exception, backtrace)
  state.simulation_panic = copy(panic)
  push!(state.log_events, panic)

  state.is_running = false
  state.simulation_paused = false
  state.pause_requested = false
  state.has_run = false
  state.error = exception
  state.simulation_last_active_time = Dates.now()
  state.simulation_started_at = nothing

  return state
end

function _run_simulation(
  state::State,
  simulation_logger::Logging.AbstractLogger=Logger.make_logger(state),
)
  Logging.with_logger(simulation_logger) do
    while state.simulation_progress < state.simulation_time
      if state.pause_requested
        @log_event state Logging.Info "Simulation paused by user request"
        state.is_running = false
        state.simulation_paused = true
        state.pause_requested = false
        state.simulation_last_active_time = Dates.now()
        state.simulation_started_at = nothing
        return state
      end

      # Enforce max wall-clock execution time for this active run segment.
      if state.simulation_started_at !== nothing && (Dates.now() - state.simulation_started_at > Dates.Minute(MAX_SIM_RUNTIME_MINUTES))
        block_simulation(state; reason=:timeout, max_minutes=MAX_SIM_RUNTIME_MINUTES)
        return state
      end

      ConcurrentSim.step(state.simulation)
      state.simulation_progress = QuantumSavory.now(state.simulation)

      # Give libuv a zero-delay scheduling point so pending HTTP I/O is serviced.
      sleep(0)
    end

    @log_event state Logging.Info "Simulation completed" simulation_progress=state.simulation_progress simulation_time=state.simulation_time

    state.has_run = true
    state.is_running = false
    state.simulation_paused = false
    state.pause_requested = false
    state.error = nothing
    state.simulation_last_active_time = Dates.now()
    state.simulation_started_at = nothing
  end

  return state
end

function run_simulation(
  state::State,
  time_units::Float64,
  simulation_name::String;
  simulation_logger::Logging.AbstractLogger=Logger.make_logger(state),
  service=SIMULATION_SERVICE,
)
  action_is_valid(
    simulation_name,
    false;
    service,
  )  # This already checks if blocked

  if state.simulation === nothing
    throw(validation_error("Simulation not prepared"))
  end

  if state.run_task !== nothing
    if !istaskdone(state.run_task)
      throw(simulation_is_running_exception(simulation_name))
    end
    state.run_task = nothing
  end

  current_time = Float64(QuantumSavory.now(state.simulation))
  resuming = state.simulation_paused

  if !isfinite(time_units)
    throw(validation_error("time_units must be finite"))
  elseif resuming
    if state.simulation_time === nothing || time_units != state.simulation_time
      throw(validation_error("A paused simulation must resume to its existing target time"))
    end
  elseif time_units <= current_time
    throw(validation_error("time_units must be greater than the current simulation time"))
  end

  if !resuming
    state.log_events = []
    state.simulation_panic = nothing
    state.simulation_time = time_units
  end

  state.error = nothing
  state.simulation_progress = current_time
  state.has_run = false
  state.is_running = true
  state.simulation_paused = false
  state.pause_requested = false
  state.simulation_last_active_time = Dates.now()
  state.simulation_started_at = Dates.now()

  state.run_task = @async begin
    try
      # Let the request task hand its accepted response back to the HTTP server.
      sleep(0)
      _run_simulation(state, simulation_logger)
    catch e
      _record_run_error!(state, e, catch_backtrace())
    finally
      state.is_running = false
      state.run_task = nothing
    end
  end

  return state
end

function get_logs(state::State, purge::Bool = true)
  logs = copy(state.log_events)
  
  if purge
    # Rebind to the tail to drop only the copied prefix; preserves concurrently appended logs
    local n = length(logs)
    if n > 0
      state.log_events = state.log_events[(n+1):end]
    end
  end
  
  return logs
end

get_logs(simulation_name::String, purge::Bool=true) =
  simulation_logs(
    SIMULATION_SERVICE,
    simulation_name;
    purge,
    limit=nothing,
  )

include("mocks.jl")
include("simulation_service.jl")
include("collaboration_hub.jl")
include("sidecar_supervisor.jl")
include("mcp_adapters.jl")
include("services.jl")
include("startup_warmup.jl")

end
