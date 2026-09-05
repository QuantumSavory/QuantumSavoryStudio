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

    @test contract["contract_version"] == 2
    @test length(validators) == length(contract["tools"])
    @test length(tools) == 15
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

    design_edit = only(filter(tool -> getfield(tool, :name) == "design_edit", tools))
    unsafe_integer = getfield(design_edit, :handler)(Dict{String,Any}(
        "operation_id" => "unsafe-variable",
        "expected_revision" => 0,
        "operations" => Any[Dict{String,Any}(
            "kind" => "variables.create",
            "id" => "unsafe-variable",
            "value" => Dict(
                "name" => "unsafe",
                "type" => "Int64",
                "value" => 9_007_199_254_740_992,
            ),
        )],
    ))
    @test getfield(unsafe_integer, :is_error)
    @test getfield(unsafe_integer, :structured_content)["code"] ==
        "VALIDATION_FAILED"
    @test dispatched == ["catalog_list", "simulation_logs"]

    valid_edit = getfield(design_edit, :handler)(Dict{String,Any}(
        "operation_id" => "direct-create",
        "expected_revision" => 0,
        "operations" => Any[
            Dict{String,Any}(
                "kind" => "topology.create_node",
                "id" => "node-direct",
                "value" => Dict("position" => Any[0, 0]),
            ),
            Dict{String,Any}(
                "kind" => "slots.create",
                "id" => "slot-direct",
                "node_id" => "node-direct",
                "value" => Dict(
                    "backgroundNoise" => Dict(
                        "type" => "default",
                        "parameters" => Any[],
                    ),
                ),
            ),
        ],
    ))
    @test valid_edit == "design_edit"
    @test dispatched == ["catalog_list", "simulation_logs", "design_edit"]

    state_reference_edit = Dict{String,Any}(
        "operation_id" => "state-variable-reference",
        "expected_revision" => 0,
        "operations" => Any[
            Dict(
                "kind" => "variables.create",
                "id" => "probability",
                "value" => Dict(
                    "name" => "probability",
                    "type" => "Float64",
                    "value" => 0.8,
                ),
            ),
            Dict(
                "kind" => "states.create",
                "id" => "state",
                "value" => Dict(
                    "name" => "state",
                    "state_type" => "DepolarizedBellPair",
                    "parameters" => Dict(
                        "p" => Dict("kind" => "variable", "id" => "probability"),
                    ),
                ),
            ),
        ],
    )
    @test isnothing(JSONSchema.validate(validators["design_edit"], state_reference_edit))

    contextual_state_edit = deepcopy(state_reference_edit)
    contextual_state_edit["operations"][2]["value"]["parameters"]["p"] = Dict(
        "kind" => "numeric_expression",
        "source" => "delay",
    )
    @test !isnothing(JSONSchema.validate(validators["design_edit"], contextual_state_edit))

    malformed_edit = getfield(design_edit, :handler)(Dict{String,Any}(
        "operation_id" => "create-node",
        "expected_revision" => 0,
        "operations" => Any[Dict{String,Any}(
            "kind" => "topology.create_node",
            "value" => Dict("position" => Any[0, 0]),
        )],
    ))
    @test getfield(malformed_edit, :is_error)
    @test getfield(malformed_edit, :structured_content)["code"] ==
        "VALIDATION_FAILED"
    @test getfield(malformed_edit, :structured_content)["details"]["contract_path"] ==
        "/operations/0"
    @test dispatched == ["catalog_list", "simulation_logs", "design_edit"]

    catalog_get = only(filter(tool -> getfield(tool, :name) == "catalog_get", tools))
    invalid = getfield(catalog_get, :handler)(Dict{String,Any}("kind" => "protocols"))
    @test getfield(invalid, :is_error)
    @test getfield(invalid, :structured_content) == Dict{String,Any}(
        "code" => "VALIDATION_FAILED",
        "message" => "Tool arguments do not match the MCP contract at /type.",
        "retryable" => false,
        "details" => Dict{String,Any}("contract_path" => "/type"),
    )
    @test dispatched == ["catalog_list", "simulation_logs", "design_edit"]

    @test_throws ErrorException validate_schema_keywords!(
        Dict{String,Any}("prefixItems" => Any[]),
    )
    @test !occursin("prefixItems", read(CONTRACT_FILE, String))
end
