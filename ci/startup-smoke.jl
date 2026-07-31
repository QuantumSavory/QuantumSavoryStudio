using Sockets

const APP_ROOT = normpath(joinpath(@__DIR__, ".."))
const STARTUP_TIMEOUT_SECONDS = 600

function http_response(port::Int, request::AbstractString)
    socket = try
        connect(ip"127.0.0.1", port)
    catch
        return nothing
    end

    try
        write(socket, request)
        return read(socket, String)
    finally
        close(socket)
    end
end

function successful_response(response)
    response === nothing && return false
    return startswith(response, "HTTP/1.1 200") ||
           startswith(response, "HTTP/1.0 200")
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

function startup_smoke()
    port = parse(Int, get(ENV, "WEBQUANTUMSAVORY_CI_SERVER_PORT", "8123"))
    1 <= port <= 65535 || throw(ArgumentError("invalid smoke-test port"))

    run(`$(Base.julia_cmd()) --project=$APP_ROOT -e "using Pkg; Pkg.instantiate()"`)
    command = `$(Base.julia_cmd()) --startup-file=no --project=$APP_ROOT
        $(joinpath(APP_ROOT, "bin", "server.jl")) -p$port`
    configured_command = addenv(
        Cmd(command; dir=APP_ROOT),
        "GENIE_ENV" => "prod",
        "WQS_DEPLOYMENT_PROFILE" => "public",
        "WQS_ENABLE_SOURCE_EVALUATION" => "true",
        "WEBQUANTUMSAVORY_ENABLE_MCP" => "false",
    )
    process = run(
        pipeline(configured_command; stdout=stdout, stderr=stderr);
        wait=false,
    )

    deadline = time() + STARTUP_TIMEOUT_SECONDS
    try
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
                return
            end
            sleep(0.25)
        end
        error("server did not become ready within $STARTUP_TIMEOUT_SECONDS seconds")
    finally
        if process_running(process)
            Sys.iswindows() ? kill(process) : kill(process, Base.SIGINT)
        end
        wait(process)
    end
end

startup_smoke()
