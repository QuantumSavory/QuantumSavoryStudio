using Sockets

const APP_ROOT = normpath(joinpath(@__DIR__, ".."))
const STARTUP_TIMEOUT_SECONDS = 600

function status_ready(port::Int)
    socket = try
        connect(ip"127.0.0.1", port)
    catch
        return false
    end

    try
        write(
            socket,
            "GET /status HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
        )
        response = read(socket, String)
        return startswith(response, "HTTP/1.1 200") ||
               startswith(response, "HTTP/1.0 200")
    finally
        close(socket)
    end
end

function source_evaluation_disabled(port::Int)
    socket = try
        connect(ip"127.0.0.1", port)
    catch
        return false
    end

    try
        write(
            socket,
            "GET /platform_info HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
        )
        response = read(socket, String)
        successful = startswith(response, "HTTP/1.1 200") ||
                     startswith(response, "HTTP/1.0 200")
        return successful &&
               occursin(r"\"unsafe_code_evaluation\"\s*:\s*false", response)
    finally
        close(socket)
    end
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
