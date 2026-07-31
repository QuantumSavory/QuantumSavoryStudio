using Sockets

const APP_ROOT = normpath(joinpath(@__DIR__, ".."))
const STARTUP_TIMEOUT_SECONDS = 600
const SHUTDOWN_TIMEOUT_SECONDS = 30
const SUPERVISED_SHUTDOWN_FILE_ENV_VAR = "WQS_SERVER_SHUTDOWN_FILE"

function http_response(port::Int, request::AbstractString)
    socket = nothing
    try
        socket = connect(ip"127.0.0.1", port)
        write(socket, request)
        return read(socket, String)
    catch
        return nothing
    finally
        socket === nothing || close(socket)
    end
end

function successful_response(response)
    response === nothing && return false
    return startswith(response, "HTTP/1.1 200") ||
           startswith(response, "HTTP/1.0 200")
end

function missing_response(response)
    response === nothing && return false
    return startswith(response, "HTTP/1.1 404") ||
           startswith(response, "HTTP/1.0 404")
end

function status_ready(port::Int)
    response = http_response(
        port,
        "GET /status HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
    )
    return successful_response(response)
end

function source_evaluation_disabled(port::Int)
    response = http_response(
        port,
        "GET /platform_info HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
    )
    return successful_response(response) &&
           occursin(r"\"unsafe_code_evaluation\"\s*:\s*false", response)
end

function source_evaluation_request_denied(port::Int)
    body = """{"code":"x -> x + 1","placement":"query"}"""
    request = "POST /test_code HTTP/1.1\r\n" *
              "Host: 127.0.0.1\r\n" *
              "Content-Type: application/json\r\n" *
              "Content-Length: $(ncodeunits(body))\r\n" *
              "Connection: close\r\n\r\n" *
              body
    response = http_response(port, request)
    response === nothing && return false
    denied = startswith(response, "HTTP/1.1 403") ||
             startswith(response, "HTTP/1.0 403")
    return denied && occursin("\"UNSAFE_EVALUATION_DISABLED\"", response)
end

function local_only_routes_absent(port::Int)
    mcp_response = http_response(
        port,
        "GET /_mcp/status HTTP/1.1\r\n" *
        "Host: 127.0.0.1\r\n" *
        "Connection: close\r\n\r\n",
    )
    missing_response(mcp_response) || return false

    # Use the route's registered method and a payload that would produce 400 if
    # the development handler were present. A GET probe cannot distinguish an
    # omitted POST-only route from a registered one.
    body = "{}"
    development_response = http_response(
        port,
        "POST /dev/manipulate_state HTTP/1.1\r\n" *
        "Host: 127.0.0.1\r\n" *
        "Content-Type: application/json\r\n" *
        "Content-Length: $(ncodeunits(body))\r\n" *
        "Connection: close\r\n\r\n" *
        body,
    )
    return missing_response(development_response)
end

function diagnostic_protocol_absent(port::Int)
    response = http_response(
        port,
        "GET /protocol_types HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
    )
    return successful_response(response) &&
           !occursin("WebQuantumSavory.MockBrokenProtocol", response)
end

function startup_smoke()
    port = parse(Int, get(ENV, "WEBQUANTUMSAVORY_CI_SERVER_PORT", "8123"))
    1 <= port <= 65535 || throw(ArgumentError("invalid smoke-test port"))

    run(`$(Base.julia_cmd()) --project=$APP_ROOT -e "using Pkg; Pkg.instantiate()"`)
    command = `$(Base.julia_cmd()) --startup-file=no --project=$APP_ROOT
        $(joinpath(APP_ROOT, "bin", "server.jl")) -p$port`
    mktempdir() do runtime_directory
        shutdown_file = joinpath(runtime_directory, "shutdown")
        configured_command = addenv(
            Cmd(command; dir=APP_ROOT),
            "GENIE_ENV" => "prod",
            "WQS_DEPLOYMENT_PROFILE" => "public",
            "WQS_ENABLE_SOURCE_EVALUATION" => "true",
            "WEBQUANTUMSAVORY_ENABLE_MCP" => "false",
            SUPERVISED_SHUTDOWN_FILE_ENV_VAR => shutdown_file,
        )
        log_path, log_stream = mktemp()
        process = run(
            pipeline(configured_command; stdout=log_stream, stderr=log_stream);
            wait=false,
        )

        logs = ""
        try
            deadline = time() + STARTUP_TIMEOUT_SECONDS
            ready = false
            while time() < deadline
                process_running(process) || error(
                    "server exited with code $(process.exitcode) before its status endpoint became ready",
                )
                if status_ready(port)
                    source_evaluation_disabled(port) || error(
                        "public profile exposed unsafe source evaluation",
                    )
                    source_evaluation_request_denied(port) || error(
                        "public profile accepted a source-evaluation request",
                    )
                    local_only_routes_absent(port) || error(
                        "public profile exposed a local-only route",
                    )
                    diagnostic_protocol_absent(port) || error(
                        "public profile exposed the diagnostic protocol",
                    )
                    process_running(process) || error(
                        "foreground launcher exited after becoming ready",
                    )
                    ready = true
                    break
                end
                sleep(0.25)
            end
            ready || error(
                "server did not become ready within $STARTUP_TIMEOUT_SECONDS seconds",
            )

            touch(shutdown_file)
            shutdown_deadline = time() + SHUTDOWN_TIMEOUT_SECONDS
            while process_running(process) && time() < shutdown_deadline
                sleep(0.25)
            end
            process_running(process) && error(
                "server did not stop within $SHUTDOWN_TIMEOUT_SECONDS seconds",
            )
        finally
            process_running(process) && kill(process)
            wait(process)
            close(log_stream)
            logs = read(log_path, String)
            print(logs)
            rm(log_path; force=true)
        end

        success(process) || error(
            "server did not terminate cleanly (exit code $(process.exitcode))",
        )
        occursin("fatal: error thrown and no exception handler available", logs) &&
            error("server emitted a fatal error while terminating")
        occursin(r"signal \(\d+\):", logs) &&
            error("server emitted a signal backtrace while terminating")
    end
end

startup_smoke()
