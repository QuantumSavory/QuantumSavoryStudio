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

    for code in AMBIGUOUS_BRIDGE_ERROR_CODES
        bridge_failure = deepcopy(unreachable[2])
        bridge_failure["code"] = code

        design_uncertain = normalize_tool_error(
            "topology_edit",
            bridge_failure,
        )
        @test design_uncertain["retryable"] === false
        @test design_uncertain["details"]["readback_required"] === true
        @test design_uncertain["details"]["readback_tool"] == "design_get"

        lifecycle_uncertain = normalize_tool_error(
            "simulation_run",
            bridge_failure,
        )
        @test lifecycle_uncertain["retryable"] === false
        @test lifecycle_uncertain["details"]["readback_required"] === true
        @test lifecycle_uncertain["details"]["readback_tool"] == "simulation_status"

        read_failure = normalize_tool_error("design_get", bridge_failure)
        @test read_failure["retryable"] === true
        @test !haskey(read_failure["details"], "readback_required")
    end

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
        Dict{String,Any}("contract_version" => 2);
        result_handler=handler,
    )

    @test length(tools) == 23
    @test getfield(first(tools), :name) == "design_get"
    @test getfield(last(tools), :name) == "simulation_logs"
    @test getfield(tools[3], :handler)(Dict{String,Any}()) == "catalog_list"
    @test getfield(tools[end], :handler)(Dict{String,Any}()) == "simulation_logs"
    @test dispatched == ["catalog_list", "simulation_logs"]
    @test !isfile(joinpath(@__DIR__, "..", "..", "contracts", "mcp", "v1", "tools.json"))
    @test isfile(joinpath(@__DIR__, "..", "..", "contracts", "mcp", "v2", "tools.json"))
end

@testset "MCP result links and exact resource templates" begin
    structured = Dict{String,Any}(
        "protocol_id" => "protocol /?#%+λ%2F",
        "resources" => Dict(
            "html" => "wqs://simulation/protocols/protocol%20%2F%3F%23%25%2B%CE%BB%252F/html",
            "png" => "wqs://simulation/protocols/protocol%20%2F%3F%23%25%2B%CE%BB%252F/png",
        ),
    )
    result = call_tool_result(true, structured, "simulation_protocol_result")
    @test !result.is_error
    @test result.structured_content == structured
    @test getindex.(result.content, "type") ==
        ["text", "resource_link", "resource_link"]
    @test result.content[2]["uri"] == structured["resources"]["html"]
    @test result.content[2]["mimeType"] == "text/html"
    @test result.content[3]["uri"] == structured["resources"]["png"]
    @test result.content[3]["mimeType"] == "image/png"

    incomplete = call_tool_result(
        true,
        Dict{String,Any}(
            "resources" => Dict("html" => structured["resources"]["html"]),
        ),
        "simulation_protocol_result",
    )
    @test incomplete.is_error
    @test incomplete.structured_content["code"] == "MALFORMED_SUCCESS_RESPONSE"
    @test getindex.(incomplete.content, "type") == ["text"]

    _, templates = resources(Dict{String,Any}())
    result_templates = templates[2:end]
    @test [
        (template.uri_template, template.mime_type)
        for template in result_templates
    ] == [
        ("wqs://simulation/slots/{slot_id}/html", "text/html"),
        ("wqs://simulation/slots/{slot_id}/png", "image/png"),
        ("wqs://simulation/protocols/{protocol_id}/html", "text/html"),
        ("wqs://simulation/protocols/{protocol_id}/png", "image/png"),
    ]
end

@testset "MCP rendered resources validate both trust boundaries" begin
    png_bytes = vcat(RESOURCE_PNG_SIGNATURE, UInt8[0x01])
    html_uri = "wqs://simulation/slots/slot/html"
    png_uri = "wqs://simulation/slots/slot/png"
    html = rendered_resource_contents(
        html_uri,
        Dict(
            "mime_type" => "text/html",
            "base64" => base64encode("<p>rendered</p>"),
        ),
        "text/html",
    )
    @test html isa TextResourceContents
    @test string(html.uri) == html_uri
    @test html.mime_type == "text/html"
    @test html.text == "<p>rendered</p>"

    png = rendered_resource_contents(
        png_uri,
        Dict(
            "mime_type" => "image/png",
            "base64" => base64encode(png_bytes),
        ),
        "image/png",
    )
    @test png isa BlobResourceContents
    @test string(png.uri) == png_uri
    @test png.mime_type == "image/png"
    @test png.blob == png_bytes

    invalid_cases = (
        (
            Dict("mime_type" => "image/png", "base64" => base64encode("<p>x</p>")),
            "text/html",
            "VALIDATION_FAILED",
        ),
        (
            Dict("mime_type" => "text/html"),
            "text/html",
            "RESULT_NOT_FOUND",
        ),
        (
            Dict("mime_type" => "text/html", "base64" => ""),
            "text/html",
            "RESULT_NOT_FOUND",
        ),
        (
            Dict("mime_type" => "text/html", "base64" => "%%%"),
            "text/html",
            "VALIDATION_FAILED",
        ),
        (
            Dict("mime_type" => "text/html", "base64" => base64encode(UInt8[0xff])),
            "text/html",
            "VALIDATION_FAILED",
        ),
        (
            Dict("mime_type" => "image/png", "base64" => base64encode("not png")),
            "image/png",
            "VALIDATION_FAILED",
        ),
    )
    for (payload, expected_mime_type, expected_code) in invalid_cases
        error = try
            rendered_resource_contents(
                "wqs://simulation/slots/slot/html",
                payload,
                expected_mime_type,
            )
            nothing
        catch caught
            caught
        end
        @test error isa BackendRequestError
        @test error.payload["code"] == expected_code
    end
end
