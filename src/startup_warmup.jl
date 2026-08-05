"""Private simulation name reserved for the one-per-process startup workload."""
const STARTUP_WARMUP_STATE_NAME = "__webquantumsavory_startup_warmup__"

"""Short target that leaves generated pairs available after the consumer runs."""
const STARTUP_WARMUP_SIMULATION_TARGET = 0.2

const STARTUP_WARMUP_LOCK = ReentrantLock()
const STARTUP_WARMUP_COMPLETE = Ref(false)

_startup_warmup_demos_dir() = normpath(joinpath(@__DIR__, "..", "gui", "src", "demos"))

function _startup_warmup_demo_order(path::AbstractString)
  matched = match(r"^(\d+)\.", basename(path))
  matched === nothing && error("Bundled demo must begin with a numeric prefix: $(basename(path))")
  return (parse(Int, only(matched.captures)), lowercase(basename(path)))
end

"""Return the last bundled demo according to its leading numeric prefix."""
function _latest_startup_warmup_demo(demos_dir::AbstractString=_startup_warmup_demos_dir())
  demos = filter(
    path -> isfile(path) && endswith(lowercase(path), ".json"),
    readdir(demos_dir; join=true),
  )
  isempty(demos) && error("No bundled JSON demos found in $demos_dir")
  sort!(demos; by=_startup_warmup_demo_order)
  return last(demos)
end

"""Collect node, edge, and floating protocol definitions from a project payload."""
function _startup_warmup_protocols(payload)
  net = payload["net"]
  protocols = Any[]

  for node in get(net, "nodes", Any[])
    append!(protocols, get(node["data"], "protocols", Any[]))
  end
  for edge in get(net, "edges", Any[])
    append!(protocols, get(edge["data"], "protocols", Any[]))
  end
  append!(protocols, get(net, "protocols", Any[]))

  return protocols
end

"""Project the bundled project-v2 demo onto the strict simulation transport."""
function _startup_warmup_simulation_payload(project)
  net = deepcopy(project["net"])
  physical_config = pop!(net, "physicalConfig")
  for edge in net["edges"]
    data = edge["data"]
    if edge["isLogic"]
      edge["data"] = Dict("type" => data["type"], "protocols" => data["protocols"])
      continue
    end
    distance = 1.0
    refractive_index = Float64(physical_config["refractiveIndex"])
    loss = Float64(physical_config["lossDbPerKm"])
    edge["data"] = Dict(
      "type" => data["type"],
      "protocols" => data["protocols"],
      "distanceMeters" => distance,
      "propagationDelaySeconds" => distance * refractive_index / 299_792_458,
      "refractiveIndex" => refractive_index,
      "lossDbPerKm" => loss,
      "transmissivity" => 10^(-(loss * distance / 1000) / 10),
    )
  end
  return Dict(
    "name" => project["name"],
    "simulationConfig" => Dict(
      "qubitRepresentation" => project["simulationConfig"]["qubitRepresentation"],
      "qumodeRepresentation" => project["simulationConfig"]["qumodeRepresentation"],
    ),
    "variables" => project["variables"],
    "net" => net,
  )
end

"""
Give the latest demo a private name and make its entangler deterministic.

The last bundled demo includes an entangler and a consumer. A guaranteed first-attempt
success lets the short workload exercise both protocols and retain generated slot states
for the MIME renderers without changing the checked-in demo.
"""
function _configure_startup_warmup_demo!(payload)
  payload["name"] = STARTUP_WARMUP_STATE_NAME

  configured_entanglers = 0
  for protocol in _startup_warmup_protocols(payload)
    protocol_type = String(get(protocol, "type", ""))
    endswith(protocol_type, ".EntanglerProt") || continue

    parameter_index = findfirst(
      candidate -> get(candidate, "name", nothing) == "success_prob",
      get(protocol, "parameters", Any[]),
    )
    assignment = Dict("name" => "success_prob", "type" => "Float64", "value" => 1.0)
    if parameter_index === nothing
      push!(protocol["parameters"], assignment)
    else
      protocol["parameters"][parameter_index] = assignment
    end
    configured_entanglers += 1
  end

  configured_entanglers > 0 || error("Latest bundled demo has no EntanglerProt to warm up")
  return payload
end

function _require_startup_warmup_image(rendered, key::String, description::String)
  encoded = rendered isa NamedTuple ? get(rendered, Symbol(key), nothing) :
    get(rendered, key, nothing)
  encoded isa AbstractString && !isempty(encoded) ||
    error("$description did not produce $key")
  return nothing
end

"""Exercise every protocol's HTML and PNG representation after simulation."""
function _warmup_protocol_visualizations!(state::State)
  mapping = state.protocol_mapping
  mapping === nothing && error("Startup warmup did not create a protocol mapping")
  isempty(mapping) && error("Startup warmup demo did not launch any protocols")

  for protocol_id in sort!(collect(keys(mapping)))
    rendered = get_protocol_state(protocol_id, state)
    _require_startup_warmup_image(rendered, "html_base64", "Protocol $protocol_id")
    _require_startup_warmup_image(rendered, "png_base64", "Protocol $protocol_id")
  end
  return length(mapping)
end

"""Exercise HTML and PNG representations for all generated states still in slots."""
function _warmup_generated_state_visualizations!(state::State)
  mapping = state.slot_mapping
  mapping === nothing && error("Startup warmup did not create a slot mapping")
  assigned_ids = sort!([
    slot_id for (slot_id, slot) in mapping if QuantumSavory.isassigned(slot)
  ])
  isempty(assigned_ids) && error("Startup warmup demo did not retain a generated state")

  for slot_id in assigned_ids
    rendered = get_slot_state(slot_id, state)
    _require_startup_warmup_image(rendered, "html_base64", "State in slot $slot_id")
    _require_startup_warmup_image(rendered, "png_base64", "State in slot $slot_id")
  end
  return length(assigned_ids)
end

"""Construct and render the same default States Zoo value created by the GUI."""
function _warmup_default_states_zoo_visualization!()
  catalog = get_states_zoo_types()
  isempty(catalog) && error("States Zoo catalog is empty")
  default_type = first(catalog)
  parameters = Dict(
    String(parameter["name"]) => parameter["good"]
    for parameter in default_type["parameters"]
  )
  state = construct_states_zoo_state(default_type["id"], parameters)
  rendered = render_states_zoo_preview(default_type["id"], state)
  _require_startup_warmup_image(rendered, "png_base64", "Default States Zoo preview")
  isfinite(rendered.trace) || error("Default States Zoo preview produced a non-finite trace")
  return String(default_type["id"])
end

"""
Run the compilation-sensitive startup workload and always remove its temporary state.

This function intentionally uses the same parser, lifecycle, and visualization helpers as
normal requests. It throws when a path was not exercised so unit tests detect demo or API
drift; `start_startup_warmup!` logs such failures without preventing startup.
"""
function _run_startup_warmup!(;
  demos_dir::AbstractString=_startup_warmup_demos_dir(),
  simulation_target::Real=STARTUP_WARMUP_SIMULATION_TARGET,
)
  return Logging.with_logger(Logging.NullLogger()) do
    demo_path = _latest_startup_warmup_demo(demos_dir)
    project = JSON.parsefile(demo_path)
    payload = _configure_startup_warmup_demo!(
      _startup_warmup_simulation_payload(project),
    )
    warmup_state = nothing

    try
      simulation_exists(SIMULATION_SERVICE, STARTUP_WARMUP_STATE_NAME) && error(
        "Startup warmup state name is already in use: $STARTUP_WARMUP_STATE_NAME",
      )
      catalogs = _constructor_catalog_snapshot()
      warmup_state = simulation_prepare!(
        SIMULATION_SERVICE,
        payload;
        catalogs,
      )
      warmup_logger = Logger.make_logger(warmup_state; console=Logging.NullLogger())
      run_simulation(
        warmup_state,
        Float64(simulation_target),
        STARTUP_WARMUP_STATE_NAME;
        simulation_logger=warmup_logger,
      )

      run_task = warmup_state.run_task
      run_task === nothing && error("Startup warmup simulation did not create a run task")
      wait(run_task)
      warmup_state.error === nothing || error(
        "Startup warmup simulation failed: $(sprint(showerror, warmup_state.error))",
      )
      warmup_state.has_run || error("Startup warmup simulation stopped before completion")

      protocol_count = _warmup_protocol_visualizations!(warmup_state)
      generated_state_count = _warmup_generated_state_visualizations!(warmup_state)
      states_zoo_type = _warmup_default_states_zoo_visualization!()

      return (
        demo = basename(demo_path),
        protocol_count,
        generated_state_count,
        states_zoo_type,
      )
    finally
      stored_state = simulation_exists(SIMULATION_SERVICE, STARTUP_WARMUP_STATE_NAME) ?
        _simulation_state(SIMULATION_SERVICE, STARTUP_WARMUP_STATE_NAME) : nothing
      if warmup_state !== nothing && stored_state === warmup_state
        run_task = warmup_state.run_task
        run_task === nothing || istaskdone(run_task) || wait(run_task)
        destroy_simulation(STARTUP_WARMUP_STATE_NAME)
      end
    end
  end
end

"""
Warm compilation-sensitive server paths once before accepting non-test requests.

Test processes load the Genie application before selecting a test file, so automatic
warmup is skipped there and the workload is covered explicitly by unit tests instead.
Warmup failure never prevents the server from starting, but is logged with its backtrace.
"""
function start_startup_warmup!()
  Genie.Configuration.istest() && return nothing

  return lock(STARTUP_WARMUP_LOCK) do
    STARTUP_WARMUP_COMPLETE[] && return nothing
    started_at = time()
    @info "Running startup warmup precompilation"

    report = try
      _run_startup_warmup!()
    catch error
      @error "Server warmup failed; first requests may compile on demand" exception=(error, catch_backtrace())
      return nothing
    end

    STARTUP_WARMUP_COMPLETE[] = true
    @info "Server warmup completed" elapsed_seconds=round(time() - started_at; digits=3) report
    return report
  end
end
