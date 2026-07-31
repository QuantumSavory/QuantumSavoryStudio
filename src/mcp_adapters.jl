const MCP_DESIGN_MUTATION_TOOLS = Set([
  "design_update",
  "topology_edit",
  "slots_edit",
  "protocols_edit",
  "variables_edit",
  "states_edit",
  "annotations_edit",
  "network_generate",
  "design_transaction",
])

const MCP_SIMULATION_LIFECYCLE_TOOLS = Dict(
  "simulation_prepare" => "prepare",
  "simulation_run" => "run",
  "simulation_pause" => "pause",
  "simulation_resume" => "resume",
  "simulation_reset" => "reset",
)

function _bound_simulation_context(
  hub::CollaborationHub;
  require_quiescent::Bool=false,
)
  lock(hub.lock) do
    binding = _require_binding_locked!(hub)
    require_quiescent && _require_simulation_quiescent_locked!(hub)
    return (
      binding_id=binding.id,
      generation=binding.generation,
      simulation_name=binding.simulation_name,
      revision=hub.revision,
      prepared_revision=hub.prepared_revision,
    )
  end
end

function _verify_bound_simulation_context!(
  hub::CollaborationHub,
  context,
  ;
  require_quiescent::Bool=false,
)
  lock(hub.lock) do
    binding = _require_binding_locked!(hub)
    require_quiescent && _require_simulation_quiescent_locked!(hub)
    if binding.id != context.binding_id ||
      binding.generation != context.generation ||
      binding.simulation_name != context.simulation_name ||
      hub.revision != context.revision ||
      hub.prepared_revision != context.prepared_revision
      throw(
        _mcp_error(
          "PROJECT_CHANGED",
          "The bound project changed while the simulation result was read.",
          retryable=true,
          status=409,
        ),
      )
    end
  end
  return true
end

function _adapt_simulation_mcp_error(error)
  error isa APIError || return error
  if error.error_code == "NOT_FOUND"
    return _mcp_error(
      "RESULT_NOT_FOUND",
      error.message;
      status=error.status_code,
      details=error.details === nothing ? Dict{String,Any}() : error.details,
    )
  elseif error.error_code in ("VALIDATION_ERROR", "BAD_REQUEST")
    return _mcp_error(
      "VALIDATION_FAILED",
      error.message;
      status=error.status_code,
      details=error.details === nothing ? Dict{String,Any}() : error.details,
    )
  end
  return error
end

function _with_bound_simulation_read(
  operation::Function,
  hub::CollaborationHub,
  ;
  require_quiescent::Bool=false,
)
  context = _bound_simulation_context(hub; require_quiescent)
  result = try
    operation(context.simulation_name)
  catch error
    adapted = _adapt_simulation_mcp_error(error)
    adapted === error ? rethrow() : throw(adapted)
  end
  _verify_bound_simulation_context!(hub, context; require_quiescent)
  return result, context
end

function _simulation_revision_status(
  status;
  prepared_revision,
  current_design_revision,
)
  result = Dict{String,Any}(string(key) => value for (key, value) in status)
  simulation = get(result, "simulation", Dict{String,Any}())
  running = get(simulation, "simulation_running", false) === true
  paused = get(simulation, "simulation_paused", false) === true
  runtime_error = get(simulation, "simulation_error", nothing)
  panic = get(simulation, "simulation_panic", nothing)
  serialized_status = string(get(result, "status", "unknown"))
  phase = if runtime_error !== nothing || panic !== nothing
    "error"
  elseif paused
    "paused"
  elseif running
    "running"
  elseif serialized_status == STATUS_COMPLETE
    "completed"
  else
    serialized_status
  end
  result["phase"] = phase
  result["progress"] = get(simulation, "simulation_progress", nothing)
  result["target"] = get(simulation, "simulation_time", nothing)
  result["running"] = running
  result["paused"] = paused
  result["completed"] = phase == "completed"
  result["error"] = runtime_error
  result["prepared_source_revision"] = prepared_revision
  result["current_design_revision"] = current_design_revision
  return result
end

function _simulation_revision_status(hub::CollaborationHub, status)
  prepared_revision, current_design_revision = lock(hub.lock) do
    (hub.prepared_revision, hub.revision)
  end
  return _simulation_revision_status(
    status;
    prepared_revision,
    current_design_revision,
  )
end

function _catalog_snapshot()
  return Dict{String,Any}(
    "background_noise" => get_background_types(),
    "slots" => get_slot_types(),
    "protocols" => get_protocol_types(),
    "states" => get_states_zoo_types(),
    "known_functions" => known_functions(),
    "annotations" => [
      Dict("type" => "markdown", "description" => "Markdown map annotation"),
    ],
    "generators" => [
      Dict("type" => "repeater_chain"),
      Dict("type" => "star"),
      Dict("type" => "grid"),
      Dict("type" => "all_to_all"),
    ],
  )
end

function _catalog_entries(catalog, kind::AbstractString)
  catalog_kind = String(kind)
  entries = get(catalog, catalog_kind, Any[])
  if entries isa AbstractVector
    return [
      if catalog_kind == "protocols" && entry isa AbstractDict
        normalized = Dict{String,Any}(string(key) => value for (key, value) in entry)
        normalized["placement"] = get(normalized, "placement", get(normalized, "group", ""))
        normalized
      else
        entry
      end
      for entry in entries
    ]
  end
  entries isa AbstractDict || return entries
  flattened = Any[]
  for (placement, placement_entries) in entries
    if placement_entries isa AbstractVector
      append!(
        flattened,
        [
          entry isa AbstractDict ?
            Dict{String,Any}(
              "placement" => string(placement),
              (string(key) => value for (key, value) in entry)...,
            ) :
            Dict("placement" => string(placement), "type" => string(entry))
          for entry in placement_entries
        ],
      )
    end
  end
  return flattened
end

function dispatch_mcp_tool!(
  tool_name::AbstractString,
  arguments::AbstractDict;
  hub::CollaborationHub=collaboration_hub(),
  simulation_service::SimulationService=SIMULATION_SERVICE,
)
  tool = String(tool_name)
  started_at = time()
  record_mcp_activity!(
    hub,
    "tool",
    "started";
    summary=tool,
    status="pending",
    tool=tool,
    details=arguments,
  )
  try
    result = if tool == "design_get"
      enqueue_browser_command!(
        hub,
        Dict(
          "type" => "design_get",
          "sections" => get(arguments, "sections", nothing),
        );
        timeout_seconds=20,
      )
    elseif tool == "design_validate"
      enqueue_browser_command!(
        hub,
        Dict("type" => "validate");
        timeout_seconds=30,
      )
    elseif tool == "catalog_list"
      catalog = _catalog_snapshot()
      kind = get(arguments, "kind", nothing)
      if kind === nothing
        Dict(
          catalog_kind => _catalog_entries(catalog, catalog_kind)
          for catalog_kind in keys(catalog)
        )
      else
        catalog_kind = string(kind)
        Dict(catalog_kind => _catalog_entries(catalog, catalog_kind))
      end
    elseif tool == "catalog_get"
      catalog = _catalog_snapshot()
      kind = string(get(arguments, "kind", ""))
      type_id = string(get(arguments, "type", ""))
      entries = _catalog_entries(catalog, kind)
      entry = findfirst(entries) do candidate
        candidate isa AbstractDict ?
          string(get(candidate, "type", get(candidate, "type_id", get(candidate, "id", "")))) ==
            type_id :
          string(candidate) == type_id
      end
      entry === nothing && throw(
        _mcp_error("RESULT_NOT_FOUND", "Catalog entry not found.", status=404),
      )
      Dict("kind" => kind, "type" => type_id, "entry" => entries[entry])
    elseif tool in MCP_DESIGN_MUTATION_TOOLS
      expected_revision = get(arguments, "expected_revision", nothing)
      expected_revision === nothing && throw(
        _mcp_error("VALIDATION_FAILED", "expected_revision is required"),
      )
      authoring_arguments = Dict{String,Any}(
        string(key) => value
        for (key, value) in arguments
        if string(key) != "expected_revision"
      )
      enqueue_browser_command!(
        hub,
        Dict(
          "type" => "design_command",
          "tool" => tool,
          "arguments" => authoring_arguments,
        );
        expected_revision,
        mutates_design=true,
        timeout_seconds=30,
      )
    elseif haskey(MCP_SIMULATION_LIFECYCLE_TOOLS, tool)
      enqueue_browser_command!(
        hub,
        Dict(
          "type" => "simulation_action",
          "action" => MCP_SIMULATION_LIFECYCLE_TOOLS[tool],
          "duration" => get(arguments, "duration", nothing),
        );
        timeout_seconds=30,
      )
    elseif tool == "simulation_status"
      status, context = _with_bound_simulation_read(
        hub;
        require_quiescent=true,
      ) do simulation_name
        simulation_status(simulation_service, simulation_name)
      end
      _simulation_revision_status(
        status;
        prepared_revision=context.prepared_revision,
        current_design_revision=context.revision,
      )
    elseif tool == "simulation_results"
      results, _ = _with_bound_simulation_read(hub) do simulation_name
        simulation_results(simulation_service, simulation_name)
      end
      results
    elseif tool == "simulation_slot_result"
      slot_id = string(get(arguments, "slot_id", ""))
      slot_result, _ = _with_bound_simulation_read(hub) do simulation_name
        simulation_slot_result(
          simulation_service,
          simulation_name,
          slot_id,
        )
      end
      _result_with_resource_links(
        slot_result,
        "slots",
        slot_id,
      )
    elseif tool == "simulation_protocol_result"
      protocol_id = string(get(arguments, "protocol_id", ""))
      protocol_result, _ = _with_bound_simulation_read(hub) do simulation_name
        simulation_protocol_result(
          simulation_service,
          simulation_name,
          protocol_id,
        )
      end
      _result_with_resource_links(
        protocol_result,
        "protocols",
        protocol_id,
      )
    elseif tool == "simulation_logs"
      logs, _ = _with_bound_simulation_read(hub) do simulation_name
        simulation_logs(
          simulation_service,
          simulation_name;
          purge=false,
          limit=Int(get(arguments, "limit", 100)),
        )
      end
      Dict("logs" => logs, "count" => length(logs))
    else
      throw(_mcp_error("RESULT_NOT_FOUND", "Unknown MCP tool: $tool", status=404))
    end
    record_mcp_activity!(
      hub,
      "tool",
      "completed";
      summary=tool,
      status="success",
      tool=tool,
      duration_ms=round(Int, (time() - started_at) * 1000),
      revision_after=result isa AbstractDict ? get(result, "revision", nothing) : nothing,
      affected_ids=result isa AbstractDict ? get(result, "affected_ids", Any[]) : Any[],
      details=result,
    )
    return result
  catch error
    record_mcp_activity!(
      hub,
      "tool",
      "failed";
      summary=tool,
      status="error",
      tool=tool,
      duration_ms=round(Int, (time() - started_at) * 1000),
      details=Dict(
        "code" => error isa APIError ? error.error_code : "INTERNAL_ERROR",
        "message" => error isa APIError ? error.message : "Internal server error",
      ),
    )
    rethrow()
  end
end

function _resolve_mcp_resource(
  resource_uri::String,
  hub::CollaborationHub,
  simulation_service::SimulationService,
)
  if resource_uri == "wqs://design/current"
    design = enqueue_browser_command!(
      hub,
      Dict("type" => "design_get", "sections" => nothing);
      timeout_seconds=20,
    )
    return Dict(
      "mime_type" => "application/json",
      "value" => design,
    )
  end
  if resource_uri == "wqs://simulation/state"
    status, context = _with_bound_simulation_read(
      hub;
      require_quiescent=true,
    ) do simulation_name
      simulation_status(simulation_service, simulation_name)
    end
    return Dict(
      "mime_type" => "application/json",
      "value" => _simulation_revision_status(
        status;
        prepared_revision=context.prepared_revision,
        current_design_revision=context.revision,
      ),
    )
  end

  catalog_match = match(r"^wqs://catalog/([^/]+)$", resource_uri)
  if catalog_match !== nothing
    catalog = _catalog_snapshot()
    kind = catalog_match.captures[1]
    haskey(catalog, kind) || throw(
      _mcp_error("RESULT_NOT_FOUND", "Catalog resource not found.", status=404),
    )
    return Dict(
      "mime_type" => "application/json",
      "value" => Dict(kind => _catalog_entries(catalog, kind)),
    )
  end

  result_resource = _parse_mcp_result_resource_uri(resource_uri)
  if result_resource !== nothing
    rendered_result, _ = _with_bound_simulation_read(hub) do simulation_name
      if result_resource.kind == "slots"
        simulation_slot_result(
          simulation_service,
          simulation_name,
          result_resource.identifier,
        )
      else
        simulation_protocol_result(
          simulation_service,
          simulation_name,
          result_resource.identifier,
        )
      end
    end
    bytes = _decode_mcp_representation(
      rendered_result,
      result_resource.kind,
      result_resource.identifier,
      result_resource.format,
    )
    return Dict(
      "mime_type" => result_resource.format == "html" ? "text/html" : "image/png",
      "base64" => base64encode(bytes),
    )
  end
  throw(_mcp_error("RESULT_NOT_FOUND", "Resource not found.", status=404))
end

function read_mcp_resource(
  uri::AbstractString;
  hub::CollaborationHub=collaboration_hub(),
  simulation_service::SimulationService=SIMULATION_SERVICE,
)
  resource_uri = String(uri)
  started_at = time()
  record_mcp_activity!(
    hub,
    "resource",
    "started";
    summary=resource_uri,
    status="pending",
    uri=resource_uri,
  )
  try
    result = _resolve_mcp_resource(resource_uri, hub, simulation_service)
    record_mcp_activity!(
      hub,
      "resource",
      "completed";
      summary=resource_uri,
      status="success",
      uri=resource_uri,
      duration_ms=round(Int, (time() - started_at) * 1000),
      details=result,
    )
    return result
  catch error
    record_mcp_activity!(
      hub,
      "resource",
      "failed";
      summary=resource_uri,
      status="error",
      uri=resource_uri,
      duration_ms=round(Int, (time() - started_at) * 1000),
      details=Dict(
        "code" => error isa APIError ? error.error_code : "INTERNAL_ERROR",
        "message" => error isa APIError ? error.message : "Internal server error",
      ),
    )
    rethrow()
  end
end
