using Genie.Router
using Genie.Renderer.Json

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

function bootstrap()
# don't indent everything 
unsafe_code_evaluation_enabled() # validate the operator override during startup

route("/") do
  Genie.Router.serve_static_file("index.html")
end

########################################################


route("/simulations", method="GET") do
  json(Dict(
    :success => true,
    :simulations => WebQuantumSavory.simulation_list(),
  ))
end

########################################################

route("/background_types") do
  Dict(:background_types => get_background_types()) |> json
end

########################################################

route("/slot_types") do
  Dict(:slot_types => get_slot_types()) |> json
end

########################################################

route("/protocol_types") do
  Dict(:protocol_types => get_protocol_types()) |> json
end

########################################################

route("/tag_types", method="GET") do
  json(tag_type_catalog())
end

########################################################

route("/tag_preview", method="POST") do
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

route("/tags/:name", method="GET") do
  simulation_name = string(params(:name))
  state = require_live_tag_state(simulation_name)
  entries = list_tags(state, _tag_target_query_payload())
  json(Dict(:success => true, :entries => entries))
end

route("/tags/:name", method="POST") do
  simulation_name = string(params(:name))
  state = require_live_tag_state(simulation_name)
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  entry = attach_tag!(state, payload)
  json(Dict(:success => true, :entry => entry))
end

########################################################

route("/tags/:name/:tag_id", method="DELETE") do
  simulation_name = string(params(:name))
  tag_id = string(params(:tag_id))
  state = require_live_tag_state(simulation_name)
  entry = delete_tag!(state, tag_id, _tag_target_query_payload())
  json(Dict(:success => true, :entry => entry))
end

########################################################

route("/tag_queries/:name", method="POST") do
  simulation_name = string(params(:name))
  state = require_live_tag_state(simulation_name)
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  entries = query_tags(state, payload)
  json(Dict(:success => true, :entries => entries))
end

########################################################

route("/states_zoo_types", method="GET") do
  json(Dict(:states_zoo_types => get_states_zoo_types()))
end

########################################################

route("/states_zoo_preview", method="POST") do
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

route("/export_script", method="POST") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  json(generate_julia_script_export(payload))
end

########################################################


route("/prepare_simulation", method="POST") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  simulation_state = WebQuantumSavory.simulation_prepare!(payload)
  json(WebQuantumSavory.serialize_state(simulation_state))
end

########################################################

function _parse_time_input(time_units_raw)
  # Handle time_units parameter with proper type conversion
  time_units = 10.0  # default value
  if time_units_raw !== nothing
    try
      if isa(time_units_raw, String)
        time_units = parse(Float64, time_units_raw)
      elseif isa(time_units_raw, Number)
        time_units = Float64(time_units_raw)
      else
        throw(validation_error("time_units must be a number or string", Dict("received_type" => string(typeof(time_units_raw)))))
      end
    catch e
      if isa(e, APIError)
        rethrow(e)
      else
        throw(validation_error("Invalid time_units value: $(time_units_raw)", Dict("error" => string(e))))
      end
    end
  end

  time_units
end

route("/run_simulation", method="POST") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  simulation_name = payload["name"]
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

route("/get_state", method="GET") do
  simulation_name = Genie.Requests.getpayload()[:name]
  json(Dict(
    :success => true,
    :state => WebQuantumSavory.simulation_status(simulation_name),
  ))
end

########################################################

route("/slots/:name/:slot_id", method="GET") do
  slot_id = string(params(:slot_id))
  simulation_name = string(params(:name))

  result = WebQuantumSavory.simulation_slot_result(simulation_name, slot_id)

  json(Dict(:success => true, result...))
end

########################################################

route("/pause_simulation", method="POST") do
  simulation_name = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())["name"]

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

route("/destroy_simulation", method="POST") do
  simulation_name = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())["name"]

  if WebQuantumSavory.simulation_destroy!(simulation_name)
    json(Dict(:success => true, :message => "Simulation destroyed and resources cleaned up"))
  else
    json(Dict(:success => true, :message => "Simulation destroyed (cleanup had warnings)", :warning => "Some resources may not have been fully cleaned up"))
  end
end

########################################################

route("/protocols/:name/:protocol_id", method="GET") do
  protocol_id = string(params(:protocol_id))
  simulation_name = string(params(:name))

  result = WebQuantumSavory.simulation_protocol_result(simulation_name, protocol_id)

  json(Dict(:success => true, result...))
end

########################################################

route("/status") do
  Dict(:status => "OK") |> json
end

########################################################

route("/known_functions") do
  Dict(:known_functions => WebQuantumSavory.known_functions()) |> json
end

########################################################

route("/test_code", method="POST") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())

  if !haskey(payload, "code")
    throw(validation_error("Missing required field 'code'", Dict("required_field" => "code")))
  end

  code_string = payload["code"]
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
    json(Dict(
      :success => false,
      :error => sprint(showerror, error),
      :error_type => string(typeof(error)),
      :error_code => EVALUATION_FAILED_CODE,
    ))
  end
end

########################################################

route("/platform_info") do
  json(WebQuantumSavory.get_platform_info())
end

########################################################

route("/simulation_log_groups", method="GET") do
  json(Dict(
    :simulation_log_groups => WebQuantumSavory.Logger.simulation_log_groups(),
  ))
end

########################################################

route("/logs/:name", method="GET") do
  simulation_name = string(params(:name))

  purge_raw = Genie.Requests.getpayload(:purge, "true")
  purge = purge_raw isa Bool ? purge_raw : (lowercase(string(purge_raw)) in ("true", "1", "yes", "on"))

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

  route("/_mcp/status", method="GET") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    json(Dict(
      :success => true,
      :server => WebQuantumSavory.sidecar_status(),
      :collaboration => WebQuantumSavory.collaboration_status(),
      :local_only => true,
      :start_mode => "manual",
    ))
  end

  route("/_mcp/start", method="POST") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    json(Dict(
      :success => true,
      :server => WebQuantumSavory.start_sidecar!(),
    ))
  end

  route("/_mcp/stop", method="POST") do
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

  route("/_mcp/editor/bind", method="POST") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    json(Dict(
      :success => true,
      :binding => WebQuantumSavory.bind_editor!(_mcp_request_payload()),
    ))
  end

  route("/_mcp/editor/unbind", method="POST") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    json(WebQuantumSavory.unbind_editor!(_mcp_request_payload()))
  end

  route("/_mcp/editor/heartbeat", method="POST") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    json(WebQuantumSavory.heartbeat_editor!(_mcp_request_payload()))
  end

  route("/_mcp/editor/commands", method="GET") do
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

  route("/_mcp/editor/commit", method="POST") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    payload = _mcp_request_payload()
    origin = string(get(payload, "origin", "mcp"))
    result = origin == "gui" ?
      WebQuantumSavory.commit_gui_snapshot!(payload) :
      WebQuantumSavory.commit_browser_command!(payload)
    json(result)
  end

  route("/_mcp/activity", method="GET") do
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

  route("/_mcp/activity/clear", method="POST") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    WebQuantumSavory.clear_mcp_activity!()
    json(Dict(:success => true))
  end

  route("/_mcp/internal/ready", method="POST") do
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

  route("/_mcp/internal/tool", method="POST") do
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

  route("/_mcp/internal/resource", method="POST") do
    payload = _mcp_request_payload()
    WebQuantumSavory.verify_sidecar_capability!(
      string(get(payload, "capability", "")),
    )
    WebQuantumSavory.note_sidecar_request!()
    result = WebQuantumSavory.read_mcp_resource(string(get(payload, "uri", "")))
    json(Dict(:success => true, :result => result))
  end

  route("/_mcp/internal/activity", method="POST") do
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

# Dev/test-only endpoint for test support
route("/dev/manipulate_state", method="POST") do
  if !(Genie.Configuration.isdev() || Genie.Configuration.istest())
    throw(server_error("This endpoint is only available in dev or test environment"))
  end

  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  
  if !haskey(payload, "name")
    throw(validation_error("Missing required field: 'name'"))
  end

  simulation_name = payload["name"]
  WebQuantumSavory.simulation_update_for_test!(simulation_name, payload)

  json(Dict(:success => true, :message => "State updated", :name => simulation_name))
end

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
