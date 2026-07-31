using WebQuantumSavory

const APP_ROOT = normpath(joinpath(@__DIR__, ".."))

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
    arguments::Vector{String}=ARGS;
    environment=ENV,
    instantiate_mcp_fn=instantiate_mcp,
    build_frontend_fn=build_frontend,
)
    WebQuantumSavory.validate_deployment_configuration(environment)
    instantiate_mcp_fn(environment)
    build_frontend_fn()
    effective_arguments = ["-s=true"; arguments]
    empty!(ARGS)
    append!(ARGS, effective_arguments)
    return nothing
end

function wait_for_server(app_module::Module)
    genie_module = getfield(app_module, :Genie)
    servers = getfield(getfield(genie_module, :Server), :SERVERS)
    isempty(servers) && error("Genie did not start a web server")
    webserver = last(servers).webserver
    webserver === nothing && error("Genie started without an HTTP server")
    wait(webserver)
    return nothing
end

if abspath(PROGRAM_FILE) == @__FILE__
    prepare_server()
    Base.include(Main, joinpath(APP_ROOT, "bootstrap.jl"))
    wait_for_server(WebQuantumSavory)
end
