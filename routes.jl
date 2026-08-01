using Genie.Router
using SwagUI
using Genie.Renderer.Json

"""Register a Genie route whose handler always uses the canonical error boundary."""
function _derive_route_name(args...; kwargs...)
  if !isempty(args) && isa(args[1], AbstractString)
    return String(args[1])
  elseif haskey(kwargs, :path)
    return String(get(kwargs, :path, ""))
  else
    return "route"
  end
end

function route(f::Function, args...; name=nothing, kwargs...)
  Genie.Router.route(args...; kwargs...) do
    route_name = isnothing(name) ? _derive_route_name(args...; kwargs...) : name
    safe_route_handler(() -> f(), route_name)
  end
end

"""Register one contract-owned route from its stable OpenAPI operationId."""
function operation_route(f::Function, operation_id::AbstractString)
  operation = WebQuantumSavory.register_http_operation!(operation_id)
  route(
    operation.route_path;
    method=operation.method,
    name=operation.operation_id,
  ) do
    f()
  end
end

function bootstrap()
# don't indent everything 
unsafe_code_evaluation_enabled() # validate the operator override during startup
WebQuantumSavory.reset_registered_http_operations!()

route("/") do
  Genie.Router.serve_static_file("index.html")
end

########################################################


operation_route("listSimulations") do
  json(Dict(
    :success => true,
    :simulations => WebQuantumSavory.simulation_list(),
  ))
end

########################################################

operation_route("listBackgroundTypes") do
  Dict(:background_types => get_background_types()) |> json
end

########################################################

operation_route("listSlotTypes") do
  Dict(:slot_types => get_slot_types()) |> json
end

########################################################

operation_route("listProtocolTypes") do
  Dict(:protocol_types => get_protocol_types()) |> json
end

########################################################

operation_route("listTagTypes") do
  json(tag_type_catalog())
end

########################################################

operation_route("previewTag") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  preview = preview_tag_payload(payload)
  json(Dict(:success => true, preview...))
end

########################################################

function _tag_target_query_payload()
  target = Dict{String,Any}()
  for key in ("target", "node_id", "slot_id", "destination_slot_id")
    value = Genie.Requests.getpayload(Symbol(key), nothing)
    value === nothing || (target[key] = string(value))
  end
  target
end

operation_route("listTags") do
  simulation_name = string(params(:name))
  state = require_live_tag_state(simulation_name)
  entries = list_tags(state, _tag_target_query_payload())
  json(Dict(:success => true, :entries => entries))
end

operation_route("attachTag") do
  simulation_name = string(params(:name))
  state = require_live_tag_state(simulation_name)
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  entry = attach_tag!(state, payload)
  json(Dict(:success => true, :entry => entry))
end

########################################################

operation_route("deleteTag") do
  simulation_name = string(params(:name))
  tag_id = string(params(:tag_id))
  state = require_live_tag_state(simulation_name)
  entry = delete_tag!(state, tag_id, _tag_target_query_payload())
  json(Dict(:success => true, :entry => entry))
end

########################################################

operation_route("queryTags") do
  simulation_name = string(params(:name))
  state = require_live_tag_state(simulation_name)
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  entries = query_tags(state, payload)
  json(Dict(:success => true, :entries => entries))
end

########################################################

operation_route("listStatesZooTypes") do
  json(Dict(:states_zoo_types => get_states_zoo_types()))
end

########################################################

operation_route("previewStatesZoo") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  state_type, state = parse_states_zoo_preview_payload(payload)
  preview = render_states_zoo_preview(state_type, state)
  json(Dict(
    :success => true,
    :png_base64 => preview.png_base64,
    :trace => preview.trace,
  ))
end

########################################################

operation_route("exportSimulationScript") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  json(generate_julia_script_export(payload))
end

########################################################

operation_route("parseNetworkGraph") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  state = try
    WebQuantumSavory.simulation_create!(payload)
  catch ex
    isa(ex, APIError) && rethrow(ex)
    throw(validation_error("Invalid graph - data can not be correctly parsed. Details: $ex"))
  end

  json(WebQuantumSavory.serialize_state(state))
end

########################################################

operation_route("prepareSimulation") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  _require_exact_object_fields(
    payload,
    ("name",);
    context="Prepare simulation request",
  )
  simulation_name = _required_nonempty_string(
    payload,
    "name",
    "Prepare simulation request",
  )

  # Prepare the simulation, logging unexpected errors to the simulation's log stream
  simulation_state = try
    WebQuantumSavory.simulation_prepare!(simulation_name)
  catch e
    isa(e, APIError) && rethrow(e)

    # Log a human-readable message into the simulation logs for frontend display
    try
      recovered_state = WebQuantumSavory._simulation_state(
        WebQuantumSavory.SIMULATION_SERVICE,
        simulation_name,
      )
      @log_event recovered_state Logging.Error "Error preparing simulation $simulation_name: $(e)" error_type=string(typeof(e))
    catch
    end

    # Rethrow so that safe_route_handler can still produce a proper HTTP error response
    throw(validation_error("Error preparing simulation $simulation_name: $(e)", Dict("error" => string(e))))
  end

  json(WebQuantumSavory.serialize_state(simulation_state))
end

########################################################

function _parse_time_input(time_units_raw)
  time_units_raw isa Real && !(time_units_raw isa Bool) ||
    throw(validation_error(
      "time_units must be a number",
      Dict("received_type" => string(typeof(time_units_raw))),
    ))
  time_units = Float64(time_units_raw)
  isfinite(time_units) || throw(validation_error("time_units must be finite"))
  return time_units
end

operation_route("runSimulation") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  _require_exact_object_fields(
    payload,
    ("name", "time_units");
    context="Run simulation request",
  )
  simulation_name = _required_nonempty_string(
    payload,
    "name",
    "Run simulation request",
  )
  time_units = _parse_time_input(payload["time_units"])

  simulation_state = try
    WebQuantumSavory.simulation_run!(simulation_name, time_units)
  catch e
    if isa(e, APIError)
      rethrow(e)
    else
      @error stacktrace(catch_backtrace())
      @show e
      throw(server_error("Error running simulation: $e", Dict("error" => string(e))))
    end
  end

  json(
    Dict(
      :success => true,
      :status => "started",
      :state => WebQuantumSavory.serialize_state(simulation_state),
    );
    status=202,
  )
end

########################################################

operation_route("getSimulationState") do
  simulation_name = Genie.Requests.getpayload()[:name]
  json(Dict(
    :success => true,
    :state => WebQuantumSavory.simulation_status(simulation_name),
  ))
end

########################################################

operation_route("getSlotState") do
  slot_id = string(params(:slot_id))
  simulation_name = string(params(:name))

  result = WebQuantumSavory.simulation_slot_result(simulation_name, slot_id)

  json(Dict(:success => true, result...))
end

########################################################

operation_route("pauseSimulation") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  _require_exact_object_fields(
    payload,
    ("name",);
    context="Pause simulation request",
  )
  simulation_name = _required_nonempty_string(
    payload,
    "name",
    "Pause simulation request",
  )

  try
    state = WebQuantumSavory.simulation_pause!(simulation_name)

    json(Dict(
      :success => true,
      :message => "Simulation paused",
      :state => WebQuantumSavory.serialize_state(state),
    ))
  catch e
    if isa(e, APIError)
      rethrow(e)
    else
      @error stacktrace(catch_backtrace())
      @show e
      throw(server_error("Error pausing simulation: $e", Dict("error" => string(e))))
    end
  end
end

########################################################

operation_route("destroySimulation") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  _require_exact_object_fields(
    payload,
    ("name",);
    context="Destroy simulation request",
  )
  simulation_name = _required_nonempty_string(
    payload,
    "name",
    "Destroy simulation request",
  )

  WebQuantumSavory.simulation_destroy!(simulation_name)
  json(Dict(:success => true, :message => "Simulation destroyed and resources cleaned up"))
end

########################################################

operation_route("getProtocolState") do
  protocol_id = string(params(:protocol_id))
  simulation_name = string(params(:name))

  result = WebQuantumSavory.simulation_protocol_result(simulation_name, protocol_id)

  json(Dict(:success => true, result...))
end

########################################################

operation_route("getStatus") do
  Dict(:status => "OK") |> json
end

########################################################

operation_route("listKnownFunctions") do
  Dict(:known_functions => WebQuantumSavory.known_functions()) |> json
end

########################################################

operation_route("validateCode") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())

  code_string = _required_nonempty_string(payload, "code", "Code test request")
  _require_exact_object_fields(
    payload,
    ("code",),
    ("placement",);
    context="Code test request",
  )
  placement = get(payload, "placement", nothing)
  if placement !== nothing && !(
    placement isa AbstractString &&
      placement in ("node", "edge", "floating", "variable", "query")
  )
    throw(validation_error(
      "Field 'placement' must be 'node', 'edge', 'floating', 'variable', or 'query'",
      Dict("field" => "placement"),
    ))
  end
  require_unsafe_code_evaluation()

  # Evaluate in a fresh namespace; Sandbox also enforces the policy for direct callers.
  success, results, error = Sandbox.test_code(
    code_string;
    placement=placement === nothing ? nothing : String(placement),
  )

  if success
    json(Dict(
      :success => true,
      :message => "Code executed successfully",
      :results => results
    ))
  else
    json(evaluation_failure_response(error))
  end
end

########################################################

operation_route("validateNumericExpression") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  request = _parse_numeric_expression_test_request(payload)

  success, results, error = Sandbox.test_numeric_expression(
    request.expression,
    request.target_type,
    request.placement;
    context=request.context,
  )
  if success
    json(Dict(:success => true, :results => results))
  else
    json(evaluation_failure_response(error))
  end
end

########################################################

operation_route("validateSymbolicExpression") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())

  expr = _required_nonempty_string(
    payload,
    "expr",
    "Symbolic expression request",
  )
  _require_exact_object_fields(
    payload,
    ("expr",);
    context="Symbolic expression request",
  )
  require_unsafe_code_evaluation()

  success, results, error = Sandbox.test_symbolic_expression(expr)

  if success
    json(Dict(:success => true, :results => results, :message => "Expression evaluated successfully"))
  else
    json(evaluation_failure_response(error))
  end
end

########################################################

operation_route("getPlatformInfo") do
  json(WebQuantumSavory.get_platform_info())
end

########################################################

operation_route("listSimulationLogGroups") do
  json(Dict(
    :simulation_log_groups => WebQuantumSavory.Logger.simulation_log_groups(),
  ))
end

########################################################

operation_route("getSimulationLogs") do
  simulation_name = string(params(:name))

  purge_raw = Genie.Requests.getpayload(:purge, "true")
  purge = if purge_raw isa Bool
    purge_raw
  elseif purge_raw == "true"
    true
  elseif purge_raw == "false"
    false
  else
    throw(validation_error("purge must be 'true' or 'false'"))
  end

  logs = WebQuantumSavory.simulation_logs(simulation_name; purge, limit=nothing)

  json(Dict(
    :success => true,
    :logs => logs,
    :count => length(logs)
  ))
end

########################################################

if WebQuantumSavory.mcp_enabled()
  function _mcp_request_payload()
    payload = Genie.Requests.jsonpayload()
    payload === nothing && return Dict{String,Any}()
    return Dict{String,Any}(string(key) => value for (key, value) in payload)
  end

  operation_route("getMcpStatus") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    json(Dict(
      :success => true,
      :server => WebQuantumSavory.sidecar_status(),
      :collaboration => WebQuantumSavory.collaboration_status(),
      :local_only => true,
      :start_mode => "manual",
    ))
  end

  operation_route("startMcp") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    json(Dict(
      :success => true,
      :server => WebQuantumSavory.start_sidecar!(),
    ))
  end

  operation_route("stopMcp") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    payload = _mcp_request_payload()
    hub = WebQuantumSavory.collaboration_hub()
    lock(hub.lock) do
      binding = hub.binding
      if binding !== nothing &&
        string(get(payload, "binding_id", "")) != binding.id
        throw(WebQuantumSavory._mcp_error(
          "EDITOR_BUSY",
          "Only the tab which owns the live editor binding can stop MCP.",
          status=409,
        ))
      end
    end
    json(Dict(
      :success => true,
      :server => WebQuantumSavory.stop_sidecar!(),
    ))
  end

  operation_route("bindMcpEditor") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    json(Dict(
      :success => true,
      :binding => WebQuantumSavory.bind_editor!(_mcp_request_payload()),
    ))
  end

  operation_route("unbindMcpEditor") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    json(WebQuantumSavory.unbind_editor!(_mcp_request_payload()))
  end

  operation_route("heartbeatMcpEditor") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    json(WebQuantumSavory.heartbeat_editor!(_mcp_request_payload()))
  end

  operation_route("pollMcpEditorCommands") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    request = Dict{String,Any}(
      "binding_id" => string(Genie.Requests.getpayload(:binding_id, "")),
      "generation" => something(
        tryparse(Int, string(Genie.Requests.getpayload(:generation, "-1"))),
        -1,
      ),
    )
    command = WebQuantumSavory.next_browser_command!(request; timeout_seconds=20)
    json(Dict(:success => true, :command => command))
  end

  operation_route("commitMcpEditorCommand") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    payload = _mcp_request_payload()
    origin = string(get(payload, "origin", "mcp"))
    result = origin == "gui" ?
      WebQuantumSavory.commit_gui_snapshot!(payload) :
      WebQuantumSavory.commit_browser_command!(payload)
    json(result)
  end

  operation_route("getMcpActivity") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    cursor = something(
      tryparse(Int, string(Genie.Requests.getpayload(:cursor, "0"))),
      0,
    )
    limit = something(
      tryparse(Int, string(Genie.Requests.getpayload(:limit, "100"))),
      100,
    )
    category = Genie.Requests.getpayload(:category, nothing)
    activity_status = Genie.Requests.getpayload(:status, nothing)
    json(Dict(
      :success => true,
      WebQuantumSavory.mcp_activity(
        ;
        cursor,
        limit,
        category,
        status=activity_status,
      )...,
    ))
  end

  operation_route("clearMcpActivity") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    WebQuantumSavory.clear_mcp_activity!()
    json(Dict(:success => true))
  end

  operation_route("reportMcpSidecarReady") do
    payload = _mcp_request_payload()
    accepted = WebQuantumSavory.sidecar_ready!(
      string(get(payload, "capability", "")),
      Int(get(payload, "port", 0)),
    )
    accepted || throw(WebQuantumSavory._mcp_error(
      "INTERNAL_ERROR",
      "Unexpected sidecar ready callback.",
      status=409,
    ))
    json(Dict(:success => true))
  end

  operation_route("invokeMcpTool") do
    payload = _mcp_request_payload()
    WebQuantumSavory.verify_sidecar_capability!(
      string(get(payload, "capability", "")),
    )
    WebQuantumSavory.note_sidecar_request!()
    result = WebQuantumSavory.dispatch_mcp_tool!(
      string(get(payload, "tool", "")),
      get(payload, "arguments", Dict{String,Any}()),
    )
    json(Dict(:success => true, :result => result))
  end

  operation_route("readMcpResource") do
    payload = _mcp_request_payload()
    WebQuantumSavory.verify_sidecar_capability!(
      string(get(payload, "capability", "")),
    )
    WebQuantumSavory.note_sidecar_request!()
    result = WebQuantumSavory.read_mcp_resource(string(get(payload, "uri", "")))
    json(Dict(:success => true, :result => result))
  end

  operation_route("recordMcpActivity") do
    payload = _mcp_request_payload()
    WebQuantumSavory.verify_sidecar_capability!(
      string(get(payload, "capability", "")),
    )
    if string(get(payload, "category", "")) == "session" &&
      string(get(payload, "phase", "")) == "initialized"
      WebQuantumSavory.note_sidecar_session_initialized!()
    end
    WebQuantumSavory.record_mcp_activity!(
      WebQuantumSavory.collaboration_hub(),
      string(get(payload, "category", "mcp")),
      string(get(payload, "phase", "event"));
      summary=string(get(payload, "summary", "")),
      status=string(get(payload, "status", "")),
      details=get(payload, "details", Dict{String,Any}()),
    )
    json(Dict(:success => true))
  end
end

########################################################

# Test-only endpoint for lifecycle integration support.
if Genie.Configuration.isdev() || Genie.Configuration.istest()
  operation_route("manipulateSimulationState") do
    payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())

    if !haskey(payload, "name")
      throw(validation_error("Missing required field: 'name'"))
    end

    simulation_name = payload["name"]
    WebQuantumSavory.simulation_update_for_test!(simulation_name, payload)

    json(Dict(:success => true, :message => "State updated", :name => simulation_name))
  end
end

########################################################

operation_route("serveOpenApi") do
  json(WebQuantumSavory.active_http_contract_document())
end

operation_route("serveApiDocs") do
  render_swagger(
    WebQuantumSavory.active_http_contract_document();
    custom_site_title="WebQuantumSavory API",
  )
end

########################################################

WebQuantumSavory.assert_http_route_parity!()

########################################################

WebQuantumSavory.start_startup_warmup!()

########################################################

try 
  @async WebQuantumSavory.cleanup_stale_simulations() |> errormonitor
catch e
  @error "Error starting cleanup_stale_simulations" error=e
end

########################################################

end # bootstrap()

bootstrap()
