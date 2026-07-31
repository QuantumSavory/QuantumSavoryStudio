using Test
using Logging

include(joinpath(@__DIR__, "..", "main.jl"))

@testset "MCP transport dependency and lifecycle signal" begin
    @test pkgversion(ModelContextProtocol) == v"0.6.0"

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
        "error" => Dict{String,Any}(
            "code" => "REVISION_CONFLICT",
            "message" => "The visible project changed.",
            "details" => Dict{String,Any}(
                "retryable" => true,
                "current_revision" => 7,
                "field" => "expected_revision",
            ),
        ),
    ); status=409)

    @test error_payload == Dict{String,Any}(
        "code" => "REVISION_CONFLICT",
        "message" => "The visible project changed.",
        "status" => 409,
        "retryable" => true,
        "current_revision" => 7,
        "details" => Dict{String,Any}("field" => "expected_revision"),
    )
end

@testset "MCP backend response contract is strict" begin
    @test SIDECAR_BRIDGE_OPERATIONS == Dict(
        "invokeMcpTool" => "tool",
        "readMcpResource" => "resource",
        "recordMcpActivity" => "activity",
        "reportMcpSidecarReady" => "ready",
    )
    @test SIDECAR_BRIDGE_SUCCESS_KEYS == Dict(
        "invokeMcpTool" => Set(["success", "result"]),
        "readMcpResource" => Set(["success", "result"]),
        "recordMcpActivity" => Set(["success"]),
        "reportMcpSidecarReady" => Set(["success"]),
    )

    malformed = backend_error_payload(
        Dict{String,Any}("error" => "legacy");
        status=404,
    )
    @test malformed["code"] == "MALFORMED_ERROR_RESPONSE"
    @test malformed["status"] == 404
    @test malformed["details"]["body"] == Dict{String,Any}("error" => "legacy")

    extra_field = backend_error_payload(
        Dict{String,Any}(
            "error" => Dict{String,Any}(
                "code" => "NOT_FOUND",
                "message" => "Missing",
                "details" => Dict{String,Any}(),
                "legacy" => true,
            ),
        );
        status=404,
    )
    @test extra_field["code"] == "MALFORMED_ERROR_RESPONSE"

    invalid_json = backend_response(
        HTTP.Response(502, "not JSON"),
        "invokeMcpTool",
    )
    @test invalid_json[1] === false
    @test invalid_json[2]["code"] == "INVALID_JSON_RESPONSE"
    @test invalid_json[2]["status"] == 502

    malformed_success = backend_response(
        HTTP.Response(
            200,
            JSON3.write(Dict("result" => Dict("value" => 1))),
        ),
        "invokeMcpTool",
    )
    @test malformed_success[1] === false
    @test malformed_success[2]["code"] == "MALFORMED_SUCCESS_RESPONSE"
    @test malformed_success[2]["details"]["body"] ==
        Dict{String,Any}("result" => Dict{String,Any}("value" => 1))

    missing_result = backend_response(
        HTTP.Response(200, JSON3.write(Dict("success" => true))),
        "invokeMcpTool",
    )
    @test missing_result[1] === false
    @test missing_result[2]["code"] == "MALFORMED_SUCCESS_RESPONSE"

    extra_field_success = backend_response(
        HTTP.Response(
            200,
            JSON3.write(Dict("success" => true, "legacy" => true)),
        ),
        "recordMcpActivity",
    )
    @test extra_field_success[1] === false
    @test extra_field_success[2]["code"] == "MALFORMED_SUCCESS_RESPONSE"

    valid_result = Dict{String,Any}("value" => 1)
    valid_success = backend_response(
        HTTP.Response(
            200,
            JSON3.write(Dict("success" => true, "result" => valid_result)),
        ),
        "readMcpResource",
    )
    @test valid_success[1] === true
    @test plain_dictionary(valid_success[2]) == valid_result

    valid_success_only = backend_response(
        HTTP.Response(200, JSON3.write(Dict("success" => true))),
        "reportMcpSidecarReady",
    )
    @test valid_success_only[1] === true
    @test plain_dictionary(valid_success_only[2]) ==
        Dict{String,Any}("success" => true)

    configuration = Dict{String,Any}(
        "bridge_url" => "http://127.0.0.1:1",
        "capability" => "secret",
    )
    unreachable = backend_request(
        configuration,
        "invokeMcpTool",
        Dict{String,Any}();
        post=(_args...; _kwargs...) -> error("connection refused"),
    )
    @test unreachable[1] === false
    @test unreachable[2]["code"] == "NETWORK_ERROR"
    @test unreachable[2]["retryable"] === true
    @test occursin("connection refused", unreachable[2]["details"]["exception_message"])

    structured = BackendRequestError(Dict{String,Any}(
        "code" => "NOT_FOUND",
        "message" => "Missing resource",
        "status" => 404,
        "retryable" => false,
        "details" => Dict{String,Any}("uri" => "wqs://missing"),
    ))
    rendered = sprint(showerror, structured)
    @test occursin("\"code\":\"NOT_FOUND\"", rendered)
    @test occursin("\"uri\":\"wqs://missing\"", rendered)
end

@testset "MCP contract registry" begin
    dispatched = String[]
    handler = (_configuration, tool_name, _arguments) -> begin
        push!(dispatched, tool_name)
        tool_name
    end
    tools = load_tools(
        Dict{String,Any}("contract_version" => 1);
        result_handler=handler,
    )

    @test length(tools) == 23
    @test getfield(first(tools), :name) == "design_get"
    @test getfield(last(tools), :name) == "simulation_logs"
    @test getfield(tools[3], :handler)(Dict{String,Any}()) == "catalog_list"
    @test getfield(tools[end], :handler)(Dict{String,Any}()) == "simulation_logs"
    @test dispatched == ["catalog_list", "simulation_logs"]
end
