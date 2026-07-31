module Logger

using Logging
using LoggingExtras
using Dates
using QuantumSavory

export make_logger, MIN_LEVEL, MAX_LEVEL, log_event, @log_event, simulation_log_groups
export event_timestamp, next_event_id, severity_name, json_safe, format_exception_stacktrace

const MIN_LEVEL = Logging.Debug
const MAX_LEVEL = Logging.Error
const EVENT_SEQUENCE = Base.Threads.Atomic{UInt64}(0)
const DEFAULT_SOURCE = "Simulator"
const RESERVED_LOG_GROUP_KEY = r"^_group(?:_\d+)?$"
const JS_MAX_SAFE_INTEGER = 9_007_199_254_740_991
const STABLE_LOG_GROUPS = Set(values(QuantumSavory.LOG_GROUPS))
const RESUMABLE_LOG_FIELDS = Set([
  "_group",
  "assigned",
  "attempts",
  "client_nodes",
  "client_slot",
  "component",
  "correction",
  "dims",
  "dst_node",
  "dst_slot",
  "event",
  "flow_id",
  "local_chief_idx",
  "locked",
  "measurement_xx",
  "measurement_zz",
  "message_type",
  "node",
  "nqubits",
  "observed_subsystems",
  "pair_id",
  "permit_forward",
  "remote_nodes",
  "retry_after_s",
  "round",
  "rounds",
  "sequence_number",
  "slot",
  "slots",
  "src",
  "src_node",
  "src_slot",
  "switch_slot",
  "syndrome",
  "wait_mode",
])

ultimateparent(mod) = mod === parentmodule(mod) ? mod : ultimateparent(parentmodule(mod))

"""Return the stable QuantumSavory log groups as public JSON-ready identifiers."""
simulation_log_groups() = String[string(group) for group in values(QuantumSavory.LOG_GROUPS)]

"""
Resolve the stable QuantumSavory group carried by a Julia log record.

`ResumableFunctions.@resumable` can hygienically rename the reserved `_group`
logging keyword before the nested logging macro expands, leaving `_group_N` in
the metadata and a file-derived positional group. Recover only that exact shape
when its value belongs to the authoritative `QuantumSavory.LOG_GROUPS` catalog.
"""
function _canonical_log_group(group, fields)
  canonical_groups = values(QuantumSavory.LOG_GROUPS)
  group in canonical_groups && return group

  for (key, value) in fields
    occursin(RESERVED_LOG_GROUP_KEY, string(key)) || continue
    value in canonical_groups && return value
  end

  return group
end

"""Return the UTC timestamp format used by all public log and panic records."""
event_timestamp() = Dates.format(Dates.now(Dates.UTC), dateformat"yyyy-mm-ddTHH:MM:SS.sssZ")

"""Return a unique ID that remains attached to a record for its lifetime."""
function next_event_id(prefix::AbstractString="log")
  sequence = Base.Threads.atomic_add!(EVENT_SEQUENCE, UInt64(1)) + UInt64(1)
  "$(prefix)-$(string(Base.time_ns(), base=16))-$(string(sequence, base=16))"
end

"""Normalize Julia logging levels to the public severity vocabulary."""
function severity_name(level)
  level == Logging.Debug && return "debug"
  level == Logging.Info && return "info"
  level == Logging.Warn && return "warning"
  level == Logging.Error && return "error"

  normalized = lowercase(strip(string(level)))
  normalized == "warn" && return "warning"
  normalized in ("debug", "info", "success", "warning", "error", "panic") && return normalized
  return "info"
end

"""Format an exception and its captured backtrace as one complete stacktrace."""
function format_exception_stacktrace(exception::Exception, backtrace)
  try
    return sprint(io -> showerror(io, exception, backtrace))
  catch
    message = try
      sprint(showerror, exception)
    catch
      string(exception)
    end
    frames = try
      sprint(Base.show_backtrace, backtrace)
    catch
      ""
    end
    return isempty(frames) ? message : "$message\n$frames"
  end
end

function _exception_json(exception::Exception, backtrace=nothing)
  result = Dict{String,Any}(
    "exception_type" => string(typeof(exception)),
    "message" => sprint(showerror, exception),
  )
  backtrace === nothing || (result["stacktrace"] = format_exception_stacktrace(exception, backtrace))
  return result
end

"""
Convert arbitrary logger metadata into values that JSON encoders can safely
serialize. Unknown runtime objects are represented by strings instead of being
allowed to break the entire `/logs` response.
"""
function json_safe(value, depth::Int=0)
  depth >= 12 && return "<$(typeof(value))>"

  value === nothing && return nothing
  value isa Bool && return value
  value isa AbstractString && return String(value)
  value isa Char && return string(value)
  value isa Symbol && return string(value)
  value isa Dates.TimeType && return string(value)
  value isa Logging.LogLevel && return severity_name(value)
  if value isa Integer
    return -JS_MAX_SAFE_INTEGER <= value <= JS_MAX_SAFE_INTEGER ? value : string(value)
  end
  if value isa AbstractFloat
    return isfinite(value) ? value : string(value)
  end
  if value isa Real
    converted = try
      Float64(value)
    catch
      nothing
    end
    return converted !== nothing && isfinite(converted) ? converted : string(value)
  end
  value isa Exception && return _exception_json(value)
  value isa Type && return string(value)
  value isa Module && return string(value)

  if value isa Tuple && length(value) == 2 && value[1] isa Exception
    return _exception_json(value[1], value[2])
  elseif value isa NamedTuple
    return Dict{String,Any}(
      string(key) => json_safe(item, depth + 1) for (key, item) in pairs(value)
    )
  elseif value isa AbstractDict
    return Dict{String,Any}(
      string(key) => json_safe(item, depth + 1) for (key, item) in pairs(value)
    )
  elseif value isa Pair
    return Dict{String,Any}(
      "first" => json_safe(first(value), depth + 1),
      "second" => json_safe(last(value), depth + 1),
    )
  elseif value isa AbstractArray || value isa Tuple || value isa AbstractSet
    return Any[json_safe(item, depth + 1) for item in value]
  end

  return try
    string(value)
  catch
    "<$(typeof(value))>"
  end
end

function _base_event(level, message; source::AbstractString=DEFAULT_SOURCE, prefix::AbstractString="log")
  severity = severity_name(level)
  severity == "panic" && throw(ArgumentError(
    "Panic events must use the dedicated panic record constructor",
  ))
  isempty(source) && throw(ArgumentError("Log event source must not be empty"))
  Dict{String,Any}(
    "id" => next_event_id(prefix),
    "timestamp" => event_timestamp(),
    "source" => String(source),
    "severity" => severity,
    "message" => string(message),
    "details" => Dict{String,Any}(),
  )
end

function _add_extra_fields!(event::Dict{String,Any}, fields)
  details = event["details"]
  for (raw_key, value) in fields
    key = string(raw_key)
    haskey(details, key) && (key = "logging_$(key)")
    details[key] = json_safe(value)
  end
  return event
end

function _canonical_captured_key(raw_key)
  key = string(raw_key)
  startswith(key, "_fsmi.") && (key = key[7:end])
  matched = match(r"^(.*)_\d+$", key)
  if matched !== nothing && matched.captures[1] in RESUMABLE_LOG_FIELDS
    return matched.captures[1]
  end
  return key
end

function _canonical_captured_fields(fields)
  canonical = Pair{String,Any}[]
  group_override = nothing
  for (raw_key, value) in fields
    key = _canonical_captured_key(raw_key)
    if key == "_group" && value in STABLE_LOG_GROUPS
      group_override = value
    else
      push!(canonical, key => value)
    end
  end
  return canonical, group_override
end

# Custom logger that captures logs into state while also displaying them.
struct CapturingLogger{L<:Logging.AbstractLogger} <: Logging.AbstractLogger
  console::L
  state::Any
end

Logging.min_enabled_level(logger::CapturingLogger) = MIN_LEVEL

function Logging.shouldlog(logger::CapturingLogger, level, _module, group, id)
  # QuantumSavory-owned records may lack an exported group. External protocol
  # modules opt in by using one of the stable simulator groups.
  trusted_origin = ultimateparent(_module) === QuantumSavory || group in STABLE_LOG_GROUPS
  return MIN_LEVEL <= level <= MAX_LEVEL && trusted_origin
end

Logging.catch_exceptions(logger::CapturingLogger) = false

function Logging.handle_message(logger::CapturingLogger, level, message, _module, group, id, filepath, line; kwargs...)
  try
    fields, group_override = _canonical_captured_fields(kwargs)
    event = _base_event(level, message)
    details = event["details"]
    details["module"] = string(_module)
    details["group"] = json_safe(something(group_override, _canonical_log_group(group, kwargs)))
    details["logging_id"] = json_safe(id)
    details["file"] = string(filepath)
    details["line"] = line
    _add_extra_fields!(event, fields)
    push!(logger.state.log_events, event)
  catch error
    # Log capture is best effort and must never interrupt the simulation.
    println(stderr, "LOGGER ERROR: Failed to capture log event: ", error)
  end

  if level >= Logging.min_enabled_level(logger.console) &&
     Logging.shouldlog(logger.console, level, _module, group, id)
    Logging.handle_message(
      logger.console,
      level,
      message,
      _module,
      group,
      id,
      filepath,
      line;
      kwargs...,
    )
  end
end

function make_logger(
  state;
  console::Logging.AbstractLogger=Logging.ConsoleLogger(stderr, MIN_LEVEL),
)
  return CapturingLogger(console, state)
end

"""Append one JSON-safe structured Simulator record to `state.log_events`."""
function log_event(state, level, message; module_name=nothing, source=DEFAULT_SOURCE, kwargs...)
  try
    event = _base_event(level, message; source=string(source))
    module_name === nothing || (event["details"]["module"] = string(module_name))
    _add_extra_fields!(event, kwargs)
    push!(state.log_events, event)
  catch error
    println(stderr, "LOGGER ERROR: Failed to append log event: ", error)
  end
  return state
end

"""Macro form of [`log_event`](@ref) that records the caller's module."""
macro log_event(state, level, message, args...)
  local escaped_args = map(arg -> esc(arg), Tuple(args))
  return :(Logger.log_event(
    $(esc(state)),
    $(esc(level)),
    $(esc(message));
    module_name=string($__module__),
    $(escaped_args...),
  ))
end

end
