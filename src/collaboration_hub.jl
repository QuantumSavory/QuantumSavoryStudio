const MCP_EDITOR_LEASE_SECONDS = 8
const MCP_COMMAND_QUEUE_SIZE = 32
const MCP_OPERATION_CACHE_SIZE = 256
const MCP_ACTIVITY_LIMIT = 500
const MCP_ACTIVITY_DETAIL_LIMIT = 16 * 1024
const MCP_SENSITIVE_DETAIL_KEY_FRAGMENTS = (
  "apikey",
  "authorization",
  "capability",
  "cookie",
  "credential",
  "password",
  "passwd",
  "passphrase",
  "privatekey",
  "secret",
  "sessionid",
  "token",
)

mutable struct EditorBinding
  id::String
  editor_id::String
  generation::Int
  project_name::String
  simulation_name::String
  contract_version::Int
  heartbeat_at::DateTime
  desynchronized::Bool
end

mutable struct PendingBrowserCommand
  command::Dict{String,Any}
  response::Channel{Any}
  operation_id::Union{Nothing,String}
  mutates_design::Bool
  delivered::Bool
  queued_at::DateTime
end

mutable struct CollaborationHub
  lock::ReentrantLock
  command_queue::Channel{Dict{String,Any}}
  pending::Dict{String,PendingBrowserCommand}
  operation_commands::Dict{String,String}
  operation_cache::Dict{String,Any}
  operation_cache_order::Vector{String}
  snapshot::Union{Nothing,Dict{String,Any}}
  snapshot_hash::Union{Nothing,String}
  revision::Int
  prepared_revision::Union{Nothing,Int}
  binding::Union{Nothing,EditorBinding}
  activity::Vector{Dict{String,Any}}
  next_activity_sequence::Int
  next_identifier::Int
  clock::Function
  id_source::Function
  accepting::Bool
end

function CollaborationHub(; clock=() -> Dates.now(Dates.UTC), id_source=nothing)
  hub = CollaborationHub(
    ReentrantLock(),
    Channel{Dict{String,Any}}(MCP_COMMAND_QUEUE_SIZE),
    Dict{String,PendingBrowserCommand}(),
    Dict{String,String}(),
    Dict{String,Any}(),
    String[],
    nothing,
    nothing,
    0,
    nothing,
    nothing,
    Dict{String,Any}[],
    1,
    1,
    clock,
    () -> "",
    true,
  )
  hub.id_source = isnothing(id_source) ? () -> lock(hub.lock) do
    identifier = hub.next_identifier
    hub.next_identifier += 1
    string("mcp-", identifier)
  end : id_source
  return hub
end

const COLLABORATION_HUB = Ref{Union{Nothing,CollaborationHub}}(nothing)

function collaboration_hub()
  hub = COLLABORATION_HUB[]
  if hub === nothing
    hub = CollaborationHub()
    COLLABORATION_HUB[] = hub
  end
  return hub
end

function _mcp_error(
  code::AbstractString,
  message::AbstractString;
  retryable::Bool=false,
  status::Int=400,
  details=Dict{String,Any}(),
)
  error_details = Dict{String,Any}(
    string(key) => value for (key, value) in pairs(details)
  )
  error_details["retryable"] = retryable
  return APIError(String(message), status, String(code), error_details)
end

function _activity_timestamp(value::DateTime)
  return Dates.format(value, dateformat"yyyy-mm-ddTHH:MM:SS.sss") * "Z"
end

function _normalized_sensitive_key(key)
  return lowercase(replace(string(key), r"[^A-Za-z0-9]" => ""))
end

function _sensitive_activity_key(key)
  normalized = _normalized_sensitive_key(key)
  return any(fragment -> occursin(fragment, normalized), MCP_SENSITIVE_DETAIL_KEY_FRAGMENTS)
end

function _truncate_utf8_bytes(
  value::AbstractString,
  budget::Integer;
  suffix::AbstractString="…",
)
  text = String(value)
  byte_budget = max(0, Int(budget))
  ncodeunits(text) <= byte_budget && return text
  ncodeunits(suffix) > byte_budget && return ""

  content_budget = byte_budget - ncodeunits(suffix)
  output = IOBuffer()
  bytes_written = 0
  for character in text
    encoded = string(character)
    character_bytes = ncodeunits(encoded)
    bytes_written + character_bytes > content_budget && break
    write(output, encoded)
    bytes_written += character_bytes
  end
  return String(take!(output)) * String(suffix)
end

function _sanitize_activity_detail(value; budget::Int=MCP_ACTIVITY_DETAIL_LIMIT)
  sanitized = if value isa AbstractDict
    Dict{String,Any}(
      string(key) => (
        _sensitive_activity_key(key) ? "[omitted]" :
        occursin(r"(base64|png|blob)"i, string(key)) ? "[binary omitted]" :
        _sanitize_activity_detail(nested; budget=budget)
      )
      for (key, nested) in value
    )
  elseif value isa AbstractVector
    [_sanitize_activity_detail(item; budget=budget) for item in value]
  elseif value isa AbstractString
    _truncate_utf8_bytes(value, budget)
  elseif value === nothing || value isa Number || value isa Bool
    value
  else
    string(value)
  end

  encoded = try
    JSON.json(sanitized)
  catch
    string(sanitized)
  end
  if ncodeunits(encoded) > budget
    return Dict(
      "truncated" => true,
      "preview" => _truncate_utf8_bytes(encoded, budget),
    )
  end
  return sanitized
end

function record_mcp_activity!(
  hub::CollaborationHub,
  category::AbstractString,
  phase::AbstractString;
  summary::AbstractString="",
  status::AbstractString="",
  details=Dict{String,Any}(),
  fields...,
)
  lock(hub.lock) do
    record = Dict{String,Any}(
      "sequence" => hub.next_activity_sequence,
      "timestamp" => _activity_timestamp(hub.clock()),
      "category" => String(category),
      "phase" => String(phase),
      "summary" => String(summary),
      "status" => String(status),
      "details" => _sanitize_activity_detail(details),
    )
    for (key, value) in fields
      record[string(key)] = _sanitize_activity_detail(value)
    end
    hub.next_activity_sequence += 1
    push!(hub.activity, record)
    length(hub.activity) > MCP_ACTIVITY_LIMIT && popfirst!(hub.activity)
    return copy(record)
  end
end

function mcp_activity(
  hub::CollaborationHub=collaboration_hub();
  cursor::Integer=0,
  limit::Integer=100,
  category=nothing,
  status=nothing,
)
  bounded_limit = clamp(Int(limit), 1, MCP_ACTIVITY_LIMIT)
  lock(hub.lock) do
    records = filter(hub.activity) do record
      record["sequence"] > cursor &&
        (category === nothing || record["category"] == category) &&
        (status === nothing || record["status"] == status)
    end
    records = first(records, min(length(records), bounded_limit))
    return Dict(
      "activity" => deepcopy(records),
      "cursor" => isempty(records) ? Int(cursor) : records[end]["sequence"],
      "has_more" => length(records) == bounded_limit &&
        records[end]["sequence"] < hub.next_activity_sequence - 1,
    )
  end
end

function clear_mcp_activity!(hub::CollaborationHub=collaboration_hub())
  lock(hub.lock) do
    empty!(hub.activity)
  end
  return true
end

function _lease_live(hub::CollaborationHub, binding::EditorBinding)
  return hub.clock() - binding.heartbeat_at <= Dates.Second(MCP_EDITOR_LEASE_SECONDS)
end

function _cancel_pending_locked!(
  hub::CollaborationHub,
  code::String,
  message::String;
  unknown_message::String=
    "The editor disappeared after command delivery; the outcome is unknown.",
)
  for pending in values(hub.pending)
    error = Dict{String,Any}(
      "code" => pending.delivered ? "OUTCOME_UNKNOWN" : code,
      "message" => pending.delivered ? unknown_message : message,
      "retryable" => false,
      "details" => Dict{String,Any}(),
    )
    isready(pending.response) || put!(pending.response, Dict("ok" => false, "error" => error))
  end
  empty!(hub.pending)
  empty!(hub.operation_commands)
  old_queue = hub.command_queue
  hub.command_queue = Channel{Dict{String,Any}}(MCP_COMMAND_QUEUE_SIZE)
  close(old_queue)
end

function _desynchronize_binding_locked!(
  hub::CollaborationHub,
  binding::EditorBinding,
  message::String,
)
  binding.desynchronized = true
  _cancel_pending_locked!(
    hub,
    "OPERATION_CANCELLED",
    message;
    unknown_message=
      "The browser acknowledgement did not match the pending command; the outcome is unknown.",
  )
  return nothing
end

function _clear_binding_cache_locked!(hub::CollaborationHub)
  empty!(hub.operation_commands)
  empty!(hub.operation_cache)
  empty!(hub.operation_cache_order)
  hub.prepared_revision = nothing
end

function _expire_binding_locked!(hub::CollaborationHub)
  binding = hub.binding
  if binding !== nothing && !_lease_live(hub, binding)
    _cancel_pending_locked!(
      hub,
      "EDITOR_LEASE_EXPIRED",
      "The editor lease expired before the command was applied.",
    )
    hub.binding = nothing
    hub.snapshot = nothing
    hub.snapshot_hash = nothing
    hub.revision = 0
    _clear_binding_cache_locked!(hub)
    return binding
  end
  return nothing
end

function expire_editor_lease!(hub::CollaborationHub=collaboration_hub())
  expired = lock(hub.lock) do
    _expire_binding_locked!(hub)
  end
  expired === nothing && return false
  record_mcp_activity!(
    hub,
    "editor",
    "expired";
    summary="Editor lease expired",
    status="error",
    editor_id=expired.editor_id,
  )
  return true
end

function bind_editor!(
  hub::CollaborationHub,
  request::AbstractDict,
)
  contract_version = Int(get(request, "contract_version", 0))
  contract_version == MCP_CONTRACT_VERSION || throw(
    _mcp_error(
      "PROJECT_CHANGED",
      "The browser and server use different collaboration contract versions.",
      status=409,
    ),
  )
  editor_id = strip(string(get(request, "editor_id", "")))
  project_name = strip(string(get(request, "project_name", "")))
  simulation_name = strip(string(get(request, "simulation_name", "")))
  snapshot = get(request, "snapshot", nothing)
  snapshot_hash = strip(string(get(request, "hash", "")))
  generation = Int(get(request, "generation", 0))
  isempty(editor_id) && throw(_mcp_error("VALIDATION_FAILED", "editor_id is required"))
  isempty(project_name) && throw(_mcp_error("VALIDATION_FAILED", "project_name is required"))
  isempty(simulation_name) && throw(
    _mcp_error("VALIDATION_FAILED", "simulation_name is required"),
  )
  snapshot isa AbstractDict || throw(
    _mcp_error("VALIDATION_FAILED", "A canonical design snapshot is required"),
  )
  isempty(snapshot_hash) && throw(_mcp_error("VALIDATION_FAILED", "hash is required"))

  binding = lock(hub.lock) do
    _expire_binding_locked!(hub)
    existing = hub.binding
    if existing !== nothing && existing.editor_id != editor_id
      throw(
        _mcp_error(
          "EDITOR_BUSY",
          "Another live browser tab owns the MCP editor binding.",
          retryable=true,
          status=409,
        ),
      )
    end
    existing !== nothing && _cancel_pending_locked!(
      hub,
      "PROJECT_CHANGED",
      "The project binding was replaced.",
    )
    existing !== nothing && _clear_binding_cache_locked!(hub)
    new_binding = EditorBinding(
      hub.id_source(),
      editor_id,
      generation,
      project_name,
      simulation_name,
      contract_version,
      hub.clock(),
      false,
    )
    hub.binding = new_binding
    hub.snapshot = Dict{String,Any}(string(k) => v for (k, v) in snapshot)
    hub.snapshot_hash = snapshot_hash
    hub.revision = 0
    hub.prepared_revision = nothing
    hub.accepting = true
    new_binding
  end
  record_mcp_activity!(
    hub,
    "editor",
    "bound";
    summary="Bound project $(binding.project_name)",
    status="success",
    revision_after=0,
    editor_id=binding.editor_id,
  )
  return Dict(
    "binding_id" => binding.id,
    "revision" => 0,
    "lease_seconds" => MCP_EDITOR_LEASE_SECONDS,
  )
end

bind_editor!(request::AbstractDict) = bind_editor!(collaboration_hub(), request)

function _require_binding_locked!(hub::CollaborationHub)
  _expire_binding_locked!(hub)
  binding = hub.binding
  binding === nothing && throw(
    _mcp_error("NO_EDITOR_BOUND", "No browser project is bound.", retryable=true, status=409),
  )
  binding.desynchronized && throw(
    _mcp_error(
      "PROJECT_CHANGED",
      "The editor binding is desynchronized; unbind and bind again.",
      status=409,
    ),
  )
  return binding
end

function _verify_binding_owner!(
  binding::EditorBinding,
  request::AbstractDict,
)
  string(get(request, "binding_id", "")) == binding.id || throw(
    _mcp_error("PROJECT_CHANGED", "The binding ID does not match.", status=409),
  )
  Int(get(request, "generation", -1)) == binding.generation || throw(
    _mcp_error("PROJECT_CHANGED", "The binding generation does not match.", status=409),
  )
end

function heartbeat_editor!(
  hub::CollaborationHub,
  request::AbstractDict,
)
  lock(hub.lock) do
    binding = _require_binding_locked!(hub)
    _verify_binding_owner!(binding, request)
    binding.heartbeat_at = hub.clock()
  end
  return Dict("success" => true, "lease_seconds" => MCP_EDITOR_LEASE_SECONDS)
end

heartbeat_editor!(request::AbstractDict) =
  heartbeat_editor!(collaboration_hub(), request)

function unbind_editor!(
  hub::CollaborationHub,
  request::AbstractDict;
  reason::AbstractString="Editor explicitly unbound",
)
  binding = lock(hub.lock) do
    _expire_binding_locked!(hub)
    current = hub.binding
    current === nothing && throw(
      _mcp_error("NO_EDITOR_BOUND", "No browser project is bound.", retryable=true, status=409),
    )
    # Explicit teardown must remain available after a protocol mismatch marks
    # the binding desynchronized. Requiring a synchronized binding here would
    # make the documented unbind/rebind recovery path impossible.
    _verify_binding_owner!(current, request)
    _cancel_pending_locked!(hub, "OPERATION_CANCELLED", String(reason))
    hub.binding = nothing
    hub.snapshot = nothing
    hub.snapshot_hash = nothing
    hub.revision = 0
    _clear_binding_cache_locked!(hub)
    current
  end
  record_mcp_activity!(
    hub,
    "editor",
    "unbound";
    summary=String(reason),
    status="success",
    editor_id=binding.editor_id,
  )
  return Dict("success" => true)
end

unbind_editor!(request::AbstractDict; kwargs...) =
  unbind_editor!(collaboration_hub(), request; kwargs...)

function _binding_status(binding::Union{Nothing,EditorBinding}, now::DateTime)
  binding === nothing && return nothing
  remaining = max(
    0.0,
    MCP_EDITOR_LEASE_SECONDS - Dates.value(now - binding.heartbeat_at) / 1000,
  )
  return Dict(
    "binding_id" => binding.id,
    "editor_id" => binding.editor_id,
    "generation" => binding.generation,
    "project_name" => binding.project_name,
    "simulation_name" => binding.simulation_name,
    "lease_remaining_seconds" => remaining,
    "desynchronized" => binding.desynchronized,
  )
end

function collaboration_status(hub::CollaborationHub=collaboration_hub())
  expired = expire_editor_lease!(hub)
  lock(hub.lock) do
    return Dict(
      "enabled" => true,
      "accepting" => hub.accepting,
      "binding" => _binding_status(hub.binding, hub.clock()),
      "revision" => hub.revision,
      "hash" => hub.snapshot_hash,
      "pending_commands" => length(hub.pending),
      "lease_expired" => expired,
    )
  end
end

function design_mirror(hub::CollaborationHub=collaboration_hub())
  lock(hub.lock) do
    binding = _require_binding_locked!(hub)
    return Dict(
      "project_name" => binding.project_name,
      "revision" => hub.revision,
      "hash" => hub.snapshot_hash,
      "document" => deepcopy(hub.snapshot),
    )
  end
end

function _remember_operation_locked!(
  hub::CollaborationHub,
  operation_id::String,
  result,
)
  hub.operation_cache[operation_id] = deepcopy(result)
  filter!(!=(operation_id), hub.operation_cache_order)
  push!(hub.operation_cache_order, operation_id)
  while length(hub.operation_cache_order) > MCP_OPERATION_CACHE_SIZE
    delete!(hub.operation_cache, popfirst!(hub.operation_cache_order))
  end
end

function enqueue_browser_command!(
  hub::CollaborationHub,
  payload::AbstractDict;
  operation_id=nothing,
  expected_revision=nothing,
  mutates_design::Bool=false,
  timeout_seconds::Real=30,
)
  enqueue_result = lock(hub.lock) do
    binding = _require_binding_locked!(hub)
    hub.accepting || throw(
      _mcp_error("SERVER_STOPPED", "The MCP listener is stopping.", retryable=true, status=409),
    )
    if operation_id !== nothing
      stable_id = strip(string(operation_id))
      isempty(stable_id) && throw(
        _mcp_error("VALIDATION_FAILED", "operation_id must be a nonempty stable string"),
      )
      haskey(hub.operation_cache, stable_id) &&
        return (:result, deepcopy(hub.operation_cache[stable_id]), nothing)
      if haskey(hub.operation_commands, stable_id)
        return (:pending, hub.pending[hub.operation_commands[stable_id]], nothing)
      end
    end
    if expected_revision !== nothing && Int(expected_revision) != hub.revision
      throw(
        _mcp_error(
          "REVISION_CONFLICT",
          "The visible project changed since revision $(Int(expected_revision)).",
          retryable=true,
          status=409,
          details=Dict("current_revision" => hub.revision),
        ),
      )
    end
    length(hub.pending) >= MCP_COMMAND_QUEUE_SIZE && throw(
      _mcp_error("EDITOR_BUSY", "The browser command queue is full.", retryable=true, status=429),
    )

    command_id = hub.id_source()
    command = Dict{String,Any}(
      "command_id" => command_id,
      "binding_id" => binding.id,
      "generation" => binding.generation,
      "base_revision" => hub.revision,
      "payload" => Dict{String,Any}(string(k) => v for (k, v) in payload),
    )
    operation_id === nothing || (command["operation_id"] = string(operation_id))
    entry = PendingBrowserCommand(
      command,
      Channel{Any}(1),
      operation_id === nothing ? nothing : string(operation_id),
      mutates_design,
      false,
      hub.clock(),
    )
    hub.pending[command_id] = entry
    operation_id === nothing || (hub.operation_commands[string(operation_id)] = command_id)
    (:enqueue, entry, hub.command_queue)
  end

  enqueue_result[1] == :result && return enqueue_result[2]
  pending = enqueue_result[2]
  if enqueue_result[1] == :enqueue
    try
      put!(enqueue_result[3], pending.command)
    catch
      lock(hub.lock) do
        command_id = pending.command["command_id"]
        get(hub.pending, command_id, nothing) === pending &&
          delete!(hub.pending, command_id)
        pending.operation_id === nothing ||
          delete!(hub.operation_commands, pending.operation_id)
      end
      throw(
        _mcp_error(
          "OPERATION_CANCELLED",
          "The browser binding changed while the command was queued.",
          status=409,
        ),
      )
    end
    record_mcp_activity!(
      hub,
      "browser_command",
      "queued";
      summary=string(get(payload, "type", "command")),
      status="pending",
      operation_id=operation_id,
      command_id=pending.command["command_id"],
    )
  end

  wait_result = timedwait(Float64(timeout_seconds); pollint=0.01) do
    isready(pending.response) && return true
    # Heartbeats stop when an editor tab disappears. Check the lease from the
    # active waiter as well as from inbound endpoints so pending calls are
    # cancelled at the lease boundary instead of lingering until their longer
    # operation timeout.
    expire_editor_lease!(hub)
    return isready(pending.response)
  end
  if wait_result == :timed_out
    throw(
      _mcp_error(
        "OPERATION_PENDING",
        "The browser is still processing this operation.",
        retryable=true,
        status=202,
      ),
    )
  end
  # A caller may retry a timed-out operation while the original request is
  # still in flight. Keep the one-shot response available so every waiter for
  # that stable operation ID observes the same outcome.
  response = fetch(pending.response)
  if get(response, "ok", false)
    return response["result"]
  end
  error = response["error"]
  throw(
    _mcp_error(
      string(error["code"]),
      string(error["message"]);
      retryable=get(error, "retryable", false),
      status=get(error, "status", 400),
      details=get(error, "details", Dict{String,Any}()),
    ),
  )
end

enqueue_browser_command!(payload::AbstractDict; kwargs...) =
  enqueue_browser_command!(collaboration_hub(), payload; kwargs...)

function next_browser_command!(
  hub::CollaborationHub,
  request::AbstractDict;
  timeout_seconds::Real=20,
)
  queue = lock(hub.lock) do
    binding = _require_binding_locked!(hub)
    _verify_binding_owner!(binding, request)
    hub.command_queue
  end
  result = timedwait(() -> isready(queue), Float64(timeout_seconds); pollint=0.02)
  result == :timed_out && return nothing
  command = try
    take!(queue)
  catch
    return nothing
  end
  lock(hub.lock) do
    pending = get(hub.pending, command["command_id"], nothing)
    pending === nothing || (pending.delivered = true)
  end
  record_mcp_activity!(
    hub,
    "browser_command",
    "delivered";
    summary=string(get(command["payload"], "type", "command")),
    status="pending",
    command_id=command["command_id"],
  )
  return deepcopy(command)
end

next_browser_command!(request::AbstractDict; kwargs...) =
  next_browser_command!(collaboration_hub(), request; kwargs...)

function commit_browser_command!(
  hub::CollaborationHub,
  request::AbstractDict,
)
  response_channel, response, activity = lock(hub.lock) do
    binding = _require_binding_locked!(hub)
    _verify_binding_owner!(binding, request)
    command_id = string(get(request, "command_id", ""))
    pending = get(hub.pending, command_id, nothing)
    if pending === nothing
      _desynchronize_binding_locked!(
        hub,
        binding,
        "The acknowledgement does not match a pending command.",
      )
      throw(
        _mcp_error(
          "PROJECT_CHANGED",
          "The acknowledgement does not match a pending command.",
          status=409,
        ),
      )
    end
    Int(get(request, "base_revision", -1)) == pending.command["base_revision"] || begin
      _desynchronize_binding_locked!(
        hub,
        binding,
        "The acknowledgement base revision does not match.",
      )
      throw(
        _mcp_error(
          "PROJECT_CHANGED",
          "The acknowledgement base revision does not match.",
          status=409,
        ),
      )
    end
    if pending.operation_id !== nothing &&
      string(get(request, "operation_id", "")) != pending.operation_id
      _desynchronize_binding_locked!(
        hub,
        binding,
        "The acknowledgement operation ID does not match.",
      )
      throw(
        _mcp_error(
          "PROJECT_CHANGED",
          "The acknowledgement operation ID does not match.",
          status=409,
        ),
      )
    end

    success = get(request, "success", false) === true
    if !success
      browser_error = get(request, "error", Dict{String,Any}())
      error = Dict{String,Any}(
        "code" => string(get(browser_error, "code", "VALIDATION_FAILED")),
        "message" => string(get(browser_error, "message", "The browser rejected the command.")),
        "retryable" => get(browser_error, "retryable", false),
        "details" => get(browser_error, "details", Dict{String,Any}()),
      )
      delete!(hub.pending, command_id)
      pending.operation_id === nothing ||
        delete!(hub.operation_commands, pending.operation_id)
      (
        pending.response,
        Dict("ok" => false, "error" => error),
        ("rejected", "error", error["message"], hub.revision, hub.revision),
      )
    else
      hub.revision == pending.command["base_revision"] || begin
        _desynchronize_binding_locked!(
          hub,
          binding,
          "The design revision changed before a successful acknowledgement.",
        )
        throw(
          _mcp_error(
            "PROJECT_CHANGED",
            "The design revision changed before a successful acknowledgement.",
            status=409,
          ),
        )
      end
      revision_before = hub.revision
      changed = pending.mutates_design || get(request, "document_changed", false)
      if changed
        snapshot = get(request, "snapshot", nothing)
        snapshot isa AbstractDict || throw(
          _mcp_error("VALIDATION_FAILED", "A successful design commit requires a snapshot"),
        )
        snapshot_hash = strip(string(get(request, "hash", "")))
        isempty(snapshot_hash) && throw(
          _mcp_error("VALIDATION_FAILED", "A successful design commit requires a hash"),
        )
        hub.snapshot = Dict{String,Any}(string(k) => v for (k, v) in snapshot)
        hub.snapshot_hash = snapshot_hash
        hub.revision += 1
      end
      command_payload = get(pending.command, "payload", Dict{String,Any}())
      if get(command_payload, "type", "") == "simulation_action"
        action = get(command_payload, "action", "")
        action == "prepare" && (hub.prepared_revision = hub.revision)
        action == "reset" && (hub.prepared_revision = nothing)
      end
      delete!(hub.pending, command_id)
      pending.operation_id === nothing ||
        delete!(hub.operation_commands, pending.operation_id)
      result = Dict{String,Any}(
        string(k) => v
        for (k, v) in get(request, "result", Dict{String,Any}())
      )
      result["revision"] = hub.revision
      pending.operation_id === nothing || begin
        result["operation_id"] = pending.operation_id
        _remember_operation_locked!(hub, pending.operation_id, result)
      end
      (
        pending.response,
        Dict("ok" => true, "result" => result),
        (
          "applied",
          "success",
          string(get(result, "summary", "Browser command applied")),
          revision_before,
          hub.revision,
        ),
      )
    end
  end

  isready(response_channel) || put!(response_channel, response)
  record_mcp_activity!(
    hub,
    "browser_command",
    activity[1];
    summary=activity[3],
    status=activity[2],
    revision_before=activity[4],
    revision_after=activity[5],
    command_id=get(request, "command_id", nothing),
    operation_id=get(request, "operation_id", nothing),
    affected_ids=get(
      get(request, "result", Dict{String,Any}()),
      "affected_ids",
      Any[],
    ),
    details=get(request, "result", get(request, "error", Dict{String,Any}())),
  )
  return Dict("success" => true, "revision" => activity[5])
end

commit_browser_command!(request::AbstractDict) =
  commit_browser_command!(collaboration_hub(), request)

function commit_gui_snapshot!(
  hub::CollaborationHub,
  request::AbstractDict,
)
  revision_before, revision_after = lock(hub.lock) do
    binding = _require_binding_locked!(hub)
    _verify_binding_owner!(binding, request)
    Int(get(request, "base_revision", -1)) == hub.revision || throw(
      _mcp_error(
        "REVISION_CONFLICT",
        "The GUI commit is based on a stale revision.",
        retryable=true,
        status=409,
        details=Dict("current_revision" => hub.revision),
      ),
    )
    snapshot = get(request, "snapshot", nothing)
    snapshot isa AbstractDict || throw(
      _mcp_error("VALIDATION_FAILED", "A canonical design snapshot is required"),
    )
    snapshot_hash = strip(string(get(request, "hash", "")))
    isempty(snapshot_hash) && throw(_mcp_error("VALIDATION_FAILED", "hash is required"))
    before = hub.revision
    hub.snapshot = Dict{String,Any}(string(k) => v for (k, v) in snapshot)
    hub.snapshot_hash = snapshot_hash
    hub.revision += 1
    (before, hub.revision)
  end
  record_mcp_activity!(
    hub,
    "browser_command",
    "gui_commit";
    summary=string(get(request, "summary", "GUI design change")),
    status="success",
    revision_before,
    revision_after,
  )
  return Dict("success" => true, "revision" => revision_after)
end

commit_gui_snapshot!(request::AbstractDict) =
  commit_gui_snapshot!(collaboration_hub(), request)

function stop_collaboration!(hub::CollaborationHub=collaboration_hub())
  lock(hub.lock) do
    hub.accepting = false
    _cancel_pending_locked!(
      hub,
      "OPERATION_CANCELLED",
      "The MCP server stopped before the command completed.",
    )
  end
  return true
end
