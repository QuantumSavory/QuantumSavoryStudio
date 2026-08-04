# The MCP listener runs in a supervised child process because
# ModelContextProtocol 0.6.0 installs a process-global logger and carries an
# optional dependency graph that must never affect the main Genie process when
# MCP is disabled. `epoch` and `current` identify the only generation allowed
# to report ready; each generation owns its pipes, drain tasks, and one-shot
# cleanup. Process waits, cleanup, and injected test seams must run outside the
# supervisor lock so start, stop, ready callbacks, and child exit can race
# without deadlocking or promoting a stale generation.

const SIDECAR_START_TIMEOUT_SECONDS = 15
const SIDECAR_STOP_TIMEOUT_SECONDS = 5
const SIDECAR_DIAGNOSTIC_LIMIT = 200
const SIDECAR_DIAGNOSTIC_BYTE_LIMIT = 16 * 1024

mutable struct SidecarGeneration
  id::UInt64
  capability::String
  port::Int
  process::Any
  input::Any
  output::Any
  error_output::Any
  drain_tasks::Vector{Task}
  resources_ready::Base.Event
  start_complete::Base.Event
  cleanup_lock::ReentrantLock
  cleanup_started::Bool
  cleanup_complete::Base.Event
  cleanup_resources::Function
end

function SidecarGeneration(
  id::UInt64,
  capability::String,
  port::Int,
  cleanup_resources::Function,
)
  return SidecarGeneration(
    id,
    capability,
    port,
    nothing,
    nothing,
    nothing,
    nothing,
    Task[],
    Base.Event(),
    Base.Event(),
    ReentrantLock(),
    false,
    Base.Event(),
    cleanup_resources,
  )
end

mutable struct SidecarSupervisor
  lock::ReentrantLock
  state::Symbol
  epoch::UInt64
  current::Union{Nothing,SidecarGeneration}
  stop_complete::Base.Event
  cleanup_pending::Bool
  cleanup_complete::Base.Event
  diagnostics::Vector{Dict{String,String}}
  ready::Bool
  port::Int
  last_error::Union{Nothing,String}
  session_initialized::Bool
  last_request_at::Union{Nothing,String}
end

function SidecarSupervisor()
  stop_complete = Base.Event()
  cleanup_complete = Base.Event()
  notify(stop_complete)
  notify(cleanup_complete)
  return SidecarSupervisor(
    ReentrantLock(),
    :stopped,
    UInt64(0),
    nothing,
    stop_complete,
    false,
    cleanup_complete,
    Dict{String,String}[],
    false,
    DEFAULT_MCP_PORT,
    nothing,
    false,
    nothing,
  )
end

const SIDECAR_SUPERVISOR = SidecarSupervisor()

function _sidecar_state_name(state::Symbol)
  state in (:stopped, :starting, :running, :stopping, :failed) || return "failed"
  return string(state)
end

function _sidecar_status_locked(supervisor::SidecarSupervisor)
  return Dict(
    "state" => _sidecar_state_name(supervisor.state),
    "endpoint" => supervisor.state == :running ?
      "http://127.0.0.1:$(supervisor.port)/mcp" : nothing,
    "port" => supervisor.port,
    "last_error" => supervisor.last_error,
    "session_initialized" => supervisor.session_initialized,
    "last_request_at" => supervisor.last_request_at,
    "diagnostics" => deepcopy(supervisor.diagnostics),
  )
end

function _sensitive_diagnostic_key(key)
  normalized = _normalized_sensitive_key(key)
  return _sensitive_activity_key(key) ||
    any(
      fragment -> occursin(fragment, normalized),
      (
        "rawbody",
        "rawmessage",
        "rawpayload",
        "rawrequest",
        "rawresponse",
        "requestbody",
        "requestpayload",
        "responsebody",
        "responsepayload",
      ),
    )
end

const SENSITIVE_DIAGNOSTIC_ASSIGNMENT = r"(?i)\b(?:api[_ -]?key|authorization|capability|cookie|credential|password|passwd|passphrase|private[_ -]?key|secret|session[_ -]?id|token)\s*(?:\\+)?\"?\s*[:=]\s*"
const DIAGNOSTIC_RAW_ASSIGNMENT = r"(?i)\b(?:raw(?:[_ -]?(?:body|message|payload|request|response))?|request[_ -]?(?:body|payload)|response[_ -]?(?:body|payload))\s*[:=]\s*"
const DIAGNOSTIC_BODY_ASSIGNMENT = r"(?i)\b(?:body|payload)\s*[:=]\s*"
const PRIVATE_KEY_BEGIN = r"(?i)-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----"
const PRIVATE_KEY_END = r"(?i)-----END(?: [A-Z0-9]+)* PRIVATE KEY-----"

function _omit_diagnostic_assignment(text::String, range::UnitRange{Int})
  return text[firstindex(text):last(range)] * "[omitted]"
end

function _diagnostic_scalar_end(text::String, start::Int)
  start > lastindex(text) && return nothing
  if text[start] == '"'
    index = nextind(text, start)
    escaped = false
    while index <= lastindex(text)
      character = text[index]
      if character == '"' && !escaped
        return index
      end
      if character == '\\'
        escaped = !escaped
      else
        escaped = false
      end
      index = nextind(text, index)
    end
    return nothing
  elseif text[start] == '\\'
    opening_quote = nextind(text, start)
    if opening_quote <= lastindex(text) && text[opening_quote] == '"'
      index = nextind(text, opening_quote)
      while index <= lastindex(text)
        if text[index] == '\\'
          quote_index = nextind(text, index)
          quote_index <= lastindex(text) &&
            text[quote_index] == '"' &&
            return quote_index
        end
        index = nextind(text, index)
      end
      return nothing
    end
  end

  index = start
  last_value_index = nothing
  while index <= lastindex(text)
    character = text[index]
    (isspace(character) || character in (',', ';')) && break
    last_value_index = index
    index = nextind(text, index)
  end
  return last_value_index
end

function _redact_diagnostic_scalar(text::String, range::UnitRange{Int})
  value_start = nextind(text, last(range))
  value_start > lastindex(text) && return _omit_diagnostic_assignment(text, range)

  value_end = _diagnostic_scalar_end(text, value_start)
  value_end === nothing && return _omit_diagnostic_assignment(text, range)

  # Authorization values commonly consist of a scheme and a token. Consume the
  # second token as well while retaining any following exception or stack text.
  value = lowercase(text[value_start:value_end])
  if value in ("bearer", "basic")
    token_start = nextind(text, value_end)
    while token_start <= lastindex(text) && isspace(text[token_start])
      token_start = nextind(text, token_start)
    end
    token_end = _diagnostic_scalar_end(text, token_start)
    token_end === nothing || (value_end = token_end)
  end

  prefix = text[firstindex(text):last(range)]
  suffix_start = nextind(text, value_end)
  suffix = suffix_start <= lastindex(text) ? text[suffix_start:lastindex(text)] : ""
  return prefix * "[omitted]" * suffix
end

function _sanitize_diagnostic_text(value::AbstractString)
  text = String(value)
  if occursin(PRIVATE_KEY_BEGIN, text)
    return "[omitted private key diagnostic]"
  end
  sanitized = replace(text, r"(?i)\bbearer\s+\S+" => "Bearer [omitted]")
  assignment = findfirst(SENSITIVE_DIAGNOSTIC_ASSIGNMENT, sanitized)
  if assignment !== nothing
    next_assignment = findnext(
      SENSITIVE_DIAGNOSTIC_ASSIGNMENT,
      sanitized,
      nextind(sanitized, last(assignment)),
    )
    # Preserving arbitrary text between multiple sensitive values would require
    # parsing the unstructured diagnostic. Keep its safe prefix instead.
    next_assignment === nothing ||
      return _omit_diagnostic_assignment(sanitized, assignment)
    sanitized = _redact_diagnostic_scalar(sanitized, assignment)
  end

  # Redact scalar credentials before omitting a later body so the retained
  # diagnostic prefix cannot leak a capability, token, or authorization value.
  raw_assignment = findfirst(DIAGNOSTIC_RAW_ASSIGNMENT, sanitized)
  raw_assignment === nothing ||
    return _omit_diagnostic_assignment(sanitized, raw_assignment)

  # Generic body labels are omitted when their value contains a sensitive key.
  # Request/response/raw body labels above are always omitted.
  normalized = _normalized_sensitive_key(sanitized)
  contains_sensitive_key = any(
    fragment -> occursin(fragment, normalized),
    MCP_SENSITIVE_DETAIL_KEY_FRAGMENTS,
  )
  if contains_sensitive_key
    body_assignment = findfirst(DIAGNOSTIC_BODY_ASSIGNMENT, sanitized)
    body_assignment === nothing ||
      return _omit_diagnostic_assignment(sanitized, body_assignment)
  end
  return sanitized
end

function _sanitize_diagnostic_value(value)
  if value isa AbstractDict
    return Dict{String,Any}(
      string(key) => (
        _sensitive_diagnostic_key(key) ? "[omitted]" :
        _sanitize_diagnostic_value(nested)
      )
      for (key, nested) in value
    )
  elseif value isa AbstractVector
    return [_sanitize_diagnostic_value(item) for item in value]
  elseif value isa AbstractString
    return _sanitize_diagnostic_text(value)
  elseif value === nothing || value isa Number || value isa Bool
    return value
  end
  return _sanitize_diagnostic_text(string(value))
end

function _sanitize_sidecar_diagnostic_line(message::AbstractString)
  text = String(message)
  parsed = try
    JSON.parse(text)
  catch
    nothing
  end
  sanitized = parsed === nothing ?
    _sanitize_diagnostic_text(text) :
    JSON.json(_sanitize_diagnostic_value(parsed))
  return _truncate_utf8_bytes(sanitized, SIDECAR_DIAGNOSTIC_BYTE_LIMIT)
end

function _append_sidecar_diagnostic!(
  supervisor::SidecarSupervisor,
  stream::AbstractString,
  message::AbstractString,
)
  sanitized_message = _sanitize_sidecar_diagnostic_line(message)
  lock(supervisor.lock) do
    push!(
      supervisor.diagnostics,
      Dict(
        "timestamp" => _activity_timestamp(Dates.now(Dates.UTC)),
        "stream" => String(stream),
        "message" => sanitized_message,
      ),
    )
    length(supervisor.diagnostics) > SIDECAR_DIAGNOSTIC_LIMIT &&
      popfirst!(supervisor.diagnostics)
  end
end

function _sanitize_private_key_stream_line(
  line::AbstractString,
  private_key_open::Bool,
)
  if private_key_open
    return nothing, !occursin(PRIVATE_KEY_END, line)
  elseif occursin(PRIVATE_KEY_BEGIN, line)
    return (
      "[omitted private key diagnostic]",
      !occursin(PRIVATE_KEY_END, line),
    )
  end
  return String(line), false
end

function _drain_sidecar_pipe!(
  supervisor::SidecarSupervisor,
  generation::SidecarGeneration,
  pipe::Pipe,
  stream::String,
)
  try
    private_key_open = false
    for line in eachline(pipe)
      sanitized_line, private_key_open =
        _sanitize_private_key_stream_line(line, private_key_open)
      sanitized_line === nothing ||
        _append_sidecar_diagnostic!(supervisor, stream, sanitized_line)
    end
  catch error
    process = generation.process
    if process !== nothing && !process_exited(process)
      _append_sidecar_diagnostic!(
        supervisor,
        stream,
        "Diagnostic pipe failed: $(sprint(showerror, error))",
      )
    end
  end
end

function _sidecar_project_path()
  return normpath(joinpath(@__DIR__, "..", "mcp"))
end

function _sidecar_command()
  return `$(Base.julia_cmd()) --startup-file=no --project=$(_sidecar_project_path()) $(_sidecar_project_path())/main.jl`
end

function _sidecar_capability()
  entropy = Vector{UInt8}(undef, 32)
  Base.Libc.getrandom!(entropy)
  return bytes2hex(entropy)
end

function _backend_bridge_url(configuration::MCPConfiguration)
  host = configuration.backend_host in ("::1", "0:0:0:0:0:0:0:1") ?
    "[$(configuration.backend_host)]" : configuration.backend_host
  return "http://$host:$(configuration.backend_port)/_mcp/internal"
end

function _spawn_sidecar_process()
  input = Pipe()
  output = Pipe()
  error_output = Pipe()
  process = run(
    pipeline(
      _sidecar_command();
      stdin=input,
      stdout=output,
      stderr=error_output,
    );
    wait=false,
  )
  close(input.out)
  close(output.in)
  close(error_output.in)
  return process, input, output, error_output
end

function sidecar_ready!(
  supervisor::SidecarSupervisor,
  capability::AbstractString,
  port::Integer,
)
  lock(supervisor.lock) do
    supervisor.state == :starting || return false
    generation = supervisor.current
    generation === nothing && return false
    capability == generation.capability || return false
    Int(port) == generation.port || return false
    supervisor.ready = true
    return true
  end
end

sidecar_ready!(capability::AbstractString, port::Integer) =
  sidecar_ready!(SIDECAR_SUPERVISOR, capability, port)

function _close_sidecar_pipes!(generation::SidecarGeneration)
  for pipe in (generation.input, generation.output, generation.error_output)
    pipe === nothing && continue
    try
      close(pipe)
    catch
    end
  end
end

function _await_sidecar_drains!(generation::SidecarGeneration)
  for task in copy(generation.drain_tasks)
    task === current_task() && continue
    timedwait(() -> istaskdone(task), 1; pollint=0.02)
  end
end

function _cleanup_sidecar_resources!(
  generation::SidecarGeneration;
  terminate::Bool=false,
)
  input = generation.input
  if input !== nothing
    try
      close(input)
    catch
    end
  end

  process = generation.process
  process === nothing && return _close_sidecar_pipes!(generation)
  if terminate && !process_exited(process)
    try
      kill(process)
    catch
    end
  end
  timedwait(() -> process_exited(process), SIDECAR_STOP_TIMEOUT_SECONDS; pollint=0.05)
  if !process_exited(process)
    try
      kill(process)
    catch
    end
    timedwait(() -> process_exited(process), 1; pollint=0.05)
  end
  if !process_exited(process)
    try
      kill(process, Base.SIGKILL)
    catch
    end
  end
  try
    wait(process)
  catch
  end
  _close_sidecar_pipes!(generation)
  _await_sidecar_drains!(generation)
  return nothing
end

function _cleanup_sidecar_generation!(
  generation::SidecarGeneration;
  terminate::Bool=false,
)
  owns_cleanup = lock(generation.cleanup_lock) do
    generation.cleanup_started && return false
    generation.cleanup_started = true
    return true
  end
  if !owns_cleanup
    wait(generation.cleanup_complete)
    return nothing
  end

  try
    generation.cleanup_resources(generation; terminate)
  finally
    notify(generation.cleanup_complete)
  end
  return nothing
end

function _begin_sidecar_failure!(
  supervisor::SidecarSupervisor,
  generation::SidecarGeneration,
  expected_state::Symbol,
  message::String,
)
  return lock(supervisor.lock) do
    supervisor.current === generation || return nothing
    supervisor.state == expected_state || return nothing
    supervisor.epoch += UInt64(1)
    cleanup_token = supervisor.epoch
    cleanup_complete = Base.Event()
    supervisor.state = :failed
    supervisor.current = nothing
    supervisor.cleanup_pending = true
    supervisor.cleanup_complete = cleanup_complete
    supervisor.last_error = message
    supervisor.ready = false
    supervisor.session_initialized = false
    supervisor.last_request_at = nothing
    return cleanup_token, cleanup_complete
  end
end

function _complete_sidecar_failure!(
  supervisor::SidecarSupervisor,
  cleanup_token::UInt64,
  cleanup_complete::Base.Event,
)
  lock(supervisor.lock) do
    if supervisor.epoch == cleanup_token && supervisor.state == :failed
      supervisor.cleanup_pending = false
    end
  end
  notify(cleanup_complete)
  return nothing
end

function _monitor_sidecar_exit!(
  supervisor::SidecarSupervisor,
  generation::SidecarGeneration,
)
  process = generation.process
  try
    wait(process)
  catch
  end
  message = "The MCP sidecar exited unexpectedly (code $(process.exitcode))."
  failure = _begin_sidecar_failure!(supervisor, generation, :running, message)
  failure === nothing && return

  cleanup_token, cleanup_complete = failure
  try
    stop_collaboration!()
    _cleanup_sidecar_generation!(generation)
    record_mcp_activity!(
      collaboration_hub(),
      "server",
      "failed";
      summary="The MCP sidecar exited unexpectedly",
      status="error",
      details=Dict("exit_code" => process.exitcode),
    )
  finally
    _complete_sidecar_failure!(supervisor, cleanup_token, cleanup_complete)
  end
end

function _start_sidecar_tasks!(
  supervisor::SidecarSupervisor,
  generation::SidecarGeneration,
)
  return Task[
    (@async _drain_sidecar_pipe!(
      supervisor,
      generation,
      generation.output,
      "stdout",
    )),
    (@async _drain_sidecar_pipe!(
      supervisor,
      generation,
      generation.error_output,
      "stderr",
    )),
    (@async _monitor_sidecar_exit!(supervisor, generation)),
  ]
end

function _write_sidecar_startup!(
  generation::SidecarGeneration,
  startup::AbstractDict,
)
  write(generation.input, JSON.json(startup), '\n')
  flush(generation.input)
  return nothing
end

function _wait_for_sidecar_ready(
  supervisor::SidecarSupervisor,
  generation::SidecarGeneration,
)
  ready_result = timedwait(
    () -> lock(supervisor.lock) do
      supervisor.current === generation || return true
      supervisor.state == :starting || return true
      supervisor.ready || process_exited(generation.process)
    end,
    SIDECAR_START_TIMEOUT_SECONDS;
    pollint=0.05,
  )
  state = lock(supervisor.lock) do
    (
      active=supervisor.current === generation && supervisor.state == :starting,
      ready=supervisor.ready,
    )
  end
  state.active || return :cancelled
  ready_result == :timed_out && throw(
    ErrorException("Timed out waiting for the MCP listener to become ready"),
  )
  state.ready || throw(
    ErrorException("The MCP listener exited before reporting ready"),
  )
  return :ready
end

function start_sidecar!(
  supervisor::SidecarSupervisor=SIDECAR_SUPERVISOR;
  configuration::MCPConfiguration=mcp_configuration(),
  spawn_process::Function=_spawn_sidecar_process,
  start_tasks::Function=_start_sidecar_tasks!,
  write_startup::Function=_write_sidecar_startup!,
  wait_for_ready::Function=_wait_for_sidecar_ready,
  process_has_exited::Function=process_exited,
  cleanup_resources::Function=_cleanup_sidecar_resources!,
  capability_source::Function=_sidecar_capability,
)
  configuration.enabled || throw(
    _mcp_error("MCP_DISABLED", "The local MCP feature is disabled.", status=404),
  )

  generation = nothing
  while true
    decision = lock(supervisor.lock) do
      if supervisor.cleanup_pending
        return (:wait_then_start, supervisor.cleanup_complete)
      elseif supervisor.state == :stopping
        return (:wait_then_start, supervisor.stop_complete)
      elseif supervisor.state == :starting
        current = supervisor.current
        current === nothing && error("A starting sidecar has no generation")
        return (:wait_then_return, current.start_complete)
      elseif supervisor.state == :running
        return (:return, _sidecar_status_locked(supervisor))
      end

      supervisor.epoch += UInt64(1)
      current = SidecarGeneration(
        supervisor.epoch,
        capability_source(),
        configuration.port,
        cleanup_resources,
      )
      supervisor.state = :starting
      supervisor.current = current
      supervisor.port = configuration.port
      supervisor.ready = false
      supervisor.last_error = nothing
      supervisor.session_initialized = false
      supervisor.last_request_at = nothing
      return (:start, current)
    end

    action, value = decision
    action == :return && return value
    if action == :wait_then_return
      wait(value)
      return sidecar_status(supervisor)
    elseif action == :wait_then_start
      wait(value)
      continue
    end
    generation = value
    break
  end

  try
    record_mcp_activity!(
      collaboration_hub(),
      "server",
      "starting";
      summary="Starting local MCP listener",
      status="pending",
    )

    try
      process, input, output, error_output = spawn_process()
      generation.process = process
      generation.input = input
      generation.output = output
      generation.error_output = error_output
      append!(generation.drain_tasks, start_tasks(supervisor, generation))
    finally
      notify(generation.resources_ready)
    end

    active = lock(supervisor.lock) do
      supervisor.current === generation && supervisor.state == :starting
    end
    if !active
      _cleanup_sidecar_generation!(generation; terminate=true)
      return sidecar_status(supervisor)
    end

    startup = Dict(
      "port" => configuration.port,
      "bridge_url" => _backend_bridge_url(configuration),
      "capability" => generation.capability,
    )
    write_startup(generation, startup)
    wait_for_ready(supervisor, generation) == :cancelled && begin
      _cleanup_sidecar_generation!(generation; terminate=true)
      return sidecar_status(supervisor)
    end

    promotion = lock(supervisor.lock) do
      if supervisor.current !== generation || supervisor.state != :starting
        :cancelled
      elseif process_has_exited(generation.process)
        :exited
      else
        supervisor.state = :running
        :promoted
      end
    end
    if promotion == :exited
      throw(ErrorException("The MCP listener exited before startup completed"))
    elseif promotion == :cancelled
      _cleanup_sidecar_generation!(generation; terminate=true)
      return sidecar_status(supervisor)
    end

    lock(collaboration_hub().lock) do
      collaboration_hub().accepting = true
    end
    still_running = lock(supervisor.lock) do
      supervisor.current === generation && supervisor.state == :running
    end
    if !still_running
      lock(collaboration_hub().lock) do
        collaboration_hub().accepting = false
      end
      return sidecar_status(supervisor)
    end

    record_mcp_activity!(
      collaboration_hub(),
      "server",
      "running";
      summary="MCP listener available at http://127.0.0.1:$(configuration.port)/mcp",
      status="success",
    )
    return sidecar_status(supervisor)
  catch error
    notify(generation.resources_ready)
    try
      _cleanup_sidecar_generation!(generation; terminate=true)
    catch cleanup_error
      _append_sidecar_diagnostic!(
        supervisor,
        "supervisor",
        "Sidecar cleanup failed: $(sprint(showerror, cleanup_error))",
      )
    end

    message = sprint(showerror, error)
    failure = _begin_sidecar_failure!(
      supervisor,
      generation,
      :starting,
      message,
    )
    if failure === nothing
      return sidecar_status(supervisor)
    end

    cleanup_token, cleanup_complete = failure
    try
      stop_collaboration!()
      record_mcp_activity!(
        collaboration_hub(),
        "server",
        "failed";
        summary="MCP listener failed to start",
        status="error",
        details=Dict("error" => message),
      )
    finally
      _complete_sidecar_failure!(supervisor, cleanup_token, cleanup_complete)
    end
    throw(_mcp_error("INTERNAL_ERROR", "The MCP listener failed to start.", status=500))
  finally
    notify(generation.resources_ready)
    notify(generation.start_complete)
  end
end

function stop_sidecar!(supervisor::SidecarSupervisor=SIDECAR_SUPERVISOR)
  stop_claim = nothing
  while true
    decision = lock(supervisor.lock) do
      if supervisor.cleanup_pending
        return (:wait_then_stop, supervisor.cleanup_complete)
      elseif supervisor.state == :stopping
        return (:wait_then_return, supervisor.stop_complete)
      elseif supervisor.state == :stopped
        return (:return, _sidecar_status_locked(supervisor))
      end

      previous_state = supervisor.state
      generation = supervisor.current
      supervisor.epoch += UInt64(1)
      stop_token = supervisor.epoch
      stop_complete = Base.Event()
      supervisor.state = :stopping
      supervisor.current = nothing
      supervisor.stop_complete = stop_complete
      supervisor.ready = false
      supervisor.session_initialized = false
      supervisor.last_request_at = nothing
      return (
        :stop,
        (previous_state, generation, stop_token, stop_complete),
      )
    end

    action, value = decision
    action == :return && return value
    if action == :wait_then_return
      wait(value)
      return sidecar_status(supervisor)
    elseif action == :wait_then_stop
      wait(value)
      continue
    end
    stop_claim = value
    break
  end
  previous_state, generation, stop_token, stop_complete = stop_claim

  try
    stop_collaboration!()
    record_mcp_activity!(
      collaboration_hub(),
      "server",
      "stopping";
      summary="Stopping local MCP listener",
      status="pending",
    )
    if generation !== nothing
      wait(generation.resources_ready)
      _cleanup_sidecar_generation!(
        generation;
        terminate=previous_state == :starting,
      )
      wait(generation.start_complete)
    end
    record_mcp_activity!(
      collaboration_hub(),
      "server",
      "stopped";
      summary="Local MCP listener stopped",
      status="success",
    )
  finally
    lock(supervisor.lock) do
      if supervisor.epoch == stop_token && supervisor.state == :stopping
        supervisor.state = :stopped
        supervisor.current = nothing
        supervisor.ready = false
        supervisor.session_initialized = false
        supervisor.last_request_at = nothing
      end
    end
    notify(stop_complete)
  end
  return sidecar_status(supervisor)
end

function sidecar_status(supervisor::SidecarSupervisor=SIDECAR_SUPERVISOR)
  lock(supervisor.lock) do
    return _sidecar_status_locked(supervisor)
  end
end

function note_sidecar_session_initialized!(
  supervisor::SidecarSupervisor=SIDECAR_SUPERVISOR,
)
  lock(supervisor.lock) do
    supervisor.state == :running || return false
    supervisor.session_initialized = true
    return true
  end
end

function note_sidecar_request!(supervisor::SidecarSupervisor=SIDECAR_SUPERVISOR)
  lock(supervisor.lock) do
    supervisor.state == :running || return false
    supervisor.last_request_at = _activity_timestamp(Dates.now(Dates.UTC))
    return true
  end
end

function verify_sidecar_capability!(
  supervisor::SidecarSupervisor,
  provided::AbstractString,
)
  valid = lock(supervisor.lock) do
    generation = supervisor.current
    supervisor.state == :running &&
      generation !== nothing &&
      provided == generation.capability
  end
  valid || throw(_mcp_error("INTERNAL_ERROR", "Invalid sidecar capability.", status=403))
  return true
end

verify_sidecar_capability!(provided::AbstractString) =
  verify_sidecar_capability!(SIDECAR_SUPERVISOR, provided)

atexit() do
  try
    stop_sidecar!()
  catch
  end
end
