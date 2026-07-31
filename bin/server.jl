using WebQuantumSavory

const APP_ROOT = normpath(joinpath(@__DIR__, ".."))
const SUPERVISED_SHUTDOWN_FILE_ENV_VAR = "WQS_SERVER_SHUTDOWN_FILE"

function run_in_app(command::Cmd)
    run(Cmd(command; dir=APP_ROOT))
end

function build_frontend()
    npm = Sys.iswindows() ? "npm.cmd" : "npm"
    run_in_app(`$npm --prefix $(joinpath(APP_ROOT, "gui")) ci --include=dev`)
    run_in_app(`$npm --prefix $(joinpath(APP_ROOT, "gui")) run build`)
end

function instantiate_mcp(environment=ENV)
    WebQuantumSavory._read_mcp_environment_settings(environment).enabled || return
    run_in_app(
        `$(Base.julia_cmd()) --startup-file=no --project=$(joinpath(APP_ROOT, "mcp")) -e
          "using Pkg; Pkg.instantiate()"`,
    )
end

function prepare_server(
    ;
    environment=ENV,
    instantiate_mcp_fn=instantiate_mcp,
    build_frontend_fn=build_frontend,
)
    WebQuantumSavory.validate_deployment_configuration(environment)
    instantiate_mcp_fn(environment)
    build_frontend_fn()
    return nothing
end

function supervised_shutdown_file(environment)
    path = get(environment, SUPERVISED_SHUTDOWN_FILE_ENV_VAR, nothing)
    path === nothing && return nothing
    isempty(strip(path)) && throw(
        ArgumentError("$SUPERVISED_SHUTDOWN_FILE_ENV_VAR must be a non-empty path"),
    )
    ispath(path) && throw(
        ArgumentError("$SUPERVISED_SHUTDOWN_FILE_ENV_VAR must not exist at startup"),
    )
    return path
end

function run_foreground_server(early_binding; environment=ENV)
    genie = WebQuantumSavory.Genie
    shutdown_file = supervised_shutdown_file(environment)
    Base.exit_on_sigint(false)
    interrupted = false
    supervised_shutdown = Ref(false)
    shutdown_watcher = nothing
    try
        servers = genie.up(
            genie.config.server_port,
            genie.config.server_host;
            server=early_binding,
            async=true,
        )
        webserver = servers.webserver
        webserver === nothing && error("Genie did not start a web server")
        if shutdown_file !== nothing
            shutdown_watcher = @async begin
                while isopen(webserver)
                    if isfile(shutdown_file)
                        supervised_shutdown[] = true
                        genie.down!()
                        break
                    end
                    sleep(0.25)
                end
            end
        end
        wait(webserver)
    catch error
        error isa InterruptException || rethrow()
        interrupted = true
    finally
        genie.down!()
        shutdown_watcher === nothing || wait(shutdown_watcher)
        Base.exit_on_sigint(true)
    end
    (interrupted || supervised_shutdown[]) ||
        error("Genie web server stopped unexpectedly")
    return nothing
end

if abspath(PROGRAM_FILE) == @__FILE__
    prepare_server()
    early_binding = Base.include(Main, joinpath(APP_ROOT, "bootstrap.jl"))
    run_foreground_server(early_binding)
end
