using Test
using Logging

include(joinpath(@__DIR__, "..", "main.jl"))

@testset "MCP transport dependency and lifecycle signal" begin
    @test pkgversion(ModelContextProtocol) == v"0.6.0"
    @test pkgversion(JSONSchema) == v"1.5.0"

    transport = SingleSessionHttpTransport(HttpTransport())
    waiter = @async wait_for_session_initialization(transport)
    yield()
    ModelContextProtocol.close(transport)

    @test timedwait(() -> istaskdone(waiter), 1) == :ok
    @test fetch(waiter) === false
end

@testset "MCP logging cannot be lowered to raw debug output" begin
    previous_logger = Logging.global_logger()
    output = IOBuffer()
    logger = Logging.ConsoleLogger(output, Logging.Info)
    try
        install_safe_sidecar_logger!(logger)
        server = mcp_server(name="logging-test", version="1.0.0")
        context = ModelContextProtocol.RequestContext(server=server, request_id=1)
        result = ModelContextProtocol.handle_set_level(
            context,
            ModelContextProtocol.SetLevelParams(level="debug"),
        )
        @debug "Processing message" raw="raw-transcript-canary"
        @info "Safe sidecar logging"
        @test isnothing(result.error)
        @test Logging.global_logger() === logger
        @test !(logger isa ModelContextProtocol.MCPLogger)
    finally
        Logging.global_logger(previous_logger)
    end
    rendered = String(take!(output))
    @test occursin("Safe sidecar logging", rendered)
    @test !occursin("raw-transcript-canary", rendered)
end

@testset "MCP errors expose revision conflicts in the stable shape" begin
    error_payload = backend_error_payload(Dict{String,Any}(
        "error_code" => "REVISION_CONFLICT",
        "error" => "The visible project changed.",
        "details" => Dict{String,Any}(
            "retryable" => true,
            "details" => Dict{String,Any}(
                "current_revision" => 7,
                "field" => "expected_revision",
            ),
        ),
    ))

    @test error_payload == Dict{String,Any}(
        "code" => "REVISION_CONFLICT",
        "message" => "The visible project changed.",
        "retryable" => true,
        "current_revision" => 7,
        "details" => Dict{String,Any}("field" => "expected_revision"),
    )
end

@testset "MCP contract registry" begin
    dispatched = String[]
    handler = (_configuration, tool_name, _arguments) -> begin
        push!(dispatched, tool_name)
        tool_name
    end
    contract = load_contract()
    validators = compile_input_schemas(contract)
    tools = load_tools(Dict{String,Any}(); result_handler=handler)

    @test contract["contract_version"] == 1
    @test length(validators) == length(contract["tools"])
    @test length(tools) == 23
    @test getfield(first(tools), :name) == "design_get"
    @test getfield(last(tools), :name) == "simulation_logs"
    @test getfield(tools[3], :handler)(Dict{String,Any}()) == "catalog_list"
    @test getfield(tools[end], :handler)(Dict{String,Any}()) == "simulation_logs"
    @test dispatched == ["catalog_list", "simulation_logs"]

    nested_schema = JSONSchema.Schema(Dict(
        "type" => "object",
        "required" => Any["operations"],
        "properties" => Dict(
            "operations" => Dict(
                "type" => "array",
                "items" => Dict(
                    "type" => "object",
                    "required" => Any["id"],
                ),
            ),
        ),
    ))
    nested_issue = JSONSchema.validate(
        nested_schema,
        Dict("operations" => Any[Dict{String,Any}()]),
    )
    @test json_pointer_path(nested_issue) == "/operations/0/id"
    catalog_get = only(filter(tool -> getfield(tool, :name) == "catalog_get", tools))
    invalid = getfield(catalog_get, :handler)(Dict{String,Any}("kind" => "protocols"))
    @test getfield(invalid, :is_error)
    @test getfield(invalid, :structured_content) == Dict{String,Any}(
        "code" => "VALIDATION_FAILED",
        "message" => "Tool arguments do not match the MCP contract at /type.",
        "retryable" => false,
        "details" => Dict{String,Any}("contract_path" => "/type"),
    )
    @test dispatched == ["catalog_list", "simulation_logs"]

    @test_throws ErrorException validate_schema_keywords!(
        Dict{String,Any}("prefixItems" => Any[]),
    )
    @test !occursin("prefixItems", read(CONTRACT_FILE, String))
end
