using Test
using Logging

include(joinpath(@__DIR__, "..", "main.jl"))

@testset "MCP transport dependency and lifecycle signal" begin
    @test pkgversion(ModelContextProtocol) == v"0.6.0"
    @test SIDECAR_VERSION == VersionNumber(
        TOML.parsefile(SIDECAR_PROJECT_FILE)["version"],
    )

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
    @test !isfile(joinpath(
        @__DIR__,
        "..",
        "..",
        "contracts",
        "mcp",
        "v1",
        "contract.json",
    ))
    @test !isfile(joinpath(
        @__DIR__,
        "..",
        "..",
        "contracts",
        "mcp",
        "v2",
        "tools.json",
    ))
    @test isfile(CONTRACT_FILE)

    @test length(MCP_RESOURCE_REGISTRY.resources) == 2
    @test length(MCP_RESOURCE_REGISTRY.resource_templates) == 5
    @test length(MCP_RESOURCE_REGISTRY.result_templates) == 4
    @test MCP_RESOURCE_REGISTRY.result_tool_kinds == Dict(
        "simulation_slot_result" => "slots",
        "simulation_protocol_result" => "protocols",
    )

    invalid_contracts = Dict{String,Any}[]
    duplicate_resource = deepcopy(MCP_CONTRACT)
    duplicate_resource["resources"][2]["id"] =
        duplicate_resource["resources"][1]["id"]
    push!(invalid_contracts, duplicate_resource)

    missing_resource_metadata = deepcopy(MCP_CONTRACT)
    pop!(missing_resource_metadata["resources"][1], "description")
    push!(invalid_contracts, missing_resource_metadata)

    wrong_resource_id = deepcopy(MCP_CONTRACT)
    wrong_resource_id["resources"][1]["id"] = "legacy_design"
    push!(invalid_contracts, wrong_resource_id)

    wrong_resource_mime = deepcopy(MCP_CONTRACT)
    wrong_resource_mime["resources"][1]["mime_type"] = "text/plain"
    push!(invalid_contracts, wrong_resource_mime)

    duplicate_template = deepcopy(MCP_CONTRACT)
    duplicate_template["resource_templates"][2]["id"] =
        duplicate_template["resource_templates"][1]["id"]
    push!(invalid_contracts, duplicate_template)

    missing_descriptor = deepcopy(MCP_CONTRACT)
    pop!(missing_descriptor["resource_templates"][2], "format")
    push!(invalid_contracts, missing_descriptor)

    wrong_mime_type = deepcopy(MCP_CONTRACT)
    wrong_mime_type["resource_templates"][2]["mime_type"] = "image/png"
    push!(invalid_contracts, wrong_mime_type)

    mismatched_variable = deepcopy(MCP_CONTRACT)
    mismatched_variable["resource_templates"][2]["identifier_variable"] =
        "protocol_id"
    push!(invalid_contracts, mismatched_variable)

    missing_template = deepcopy(MCP_CONTRACT)
    pop!(missing_template["resource_templates"])
    push!(invalid_contracts, missing_template)

    extra_top_level = deepcopy(MCP_CONTRACT)
    extra_top_level["legacy"] = true
    push!(invalid_contracts, extra_top_level)

    missing_top_level = deepcopy(MCP_CONTRACT)
    pop!(missing_top_level, "default_output_schema")
    push!(invalid_contracts, missing_top_level)

    wrong_catalog_variable = deepcopy(MCP_CONTRACT)
    wrong_catalog_variable["resource_templates"][1]["uri_template"] =
        "wqs://catalog/{catalog_kind}"
    push!(invalid_contracts, wrong_catalog_variable)

    wrong_catalog_mime = deepcopy(MCP_CONTRACT)
    wrong_catalog_mime["resource_templates"][1]["mime_type"] = "text/plain"
    push!(invalid_contracts, wrong_catalog_mime)

    for invalid_contract in invalid_contracts
        @test_throws ArgumentError load_mcp_contract_registry(invalid_contract)
    end
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
    @test mcp_decode_resource_identifier(
        "protocol%20%2F%3F%23%25%2B%CE%BB%252F",
    ) == structured["protocol_id"]
    for alias in ("%70rotocol", "x%2fy", "%7E")
        @test_throws ArgumentError mcp_decode_resource_identifier(alias)
    end

    invalid_results = [
        (
            "simulation_protocol_result",
            Dict{String,Any}(
                "protocol_id" => structured["protocol_id"],
                "resources" =>
                    Dict("html" => structured["resources"]["html"]),
            ),
        ),
        (
            "simulation_protocol_result",
            Dict{String,Any}(
                "protocol_id" => structured["protocol_id"],
                "resources" => Dict(
                    "html" => structured["resources"]["png"],
                    "png" => structured["resources"]["html"],
                ),
            ),
        ),
        (
            "simulation_protocol_result",
            Dict{String,Any}(
                "protocol_id" => structured["protocol_id"],
                "resources" => Dict(
                    "html" => "wqs://simulation/protocols/protocol /?#%+λ%2F/html",
                    "png" => structured["resources"]["png"],
                ),
            ),
        ),
        (
            "simulation_protocol_result",
            Dict{String,Any}(
                "protocol_id" => structured["protocol_id"],
                "resources" => Dict(
                    "html" => "wqs://simulation/protocols/other/html",
                    "png" => "wqs://simulation/protocols/other/png",
                ),
            ),
        ),
        (
            "simulation_protocol_result",
            Dict{String,Any}(
                "protocol_id" => structured["protocol_id"],
                "resources" => Dict(
                    "html" => "wqs://simulation/slots/other/html",
                    "png" => "wqs://simulation/slots/other/png",
                ),
            ),
        ),
        (
            "simulation_protocol_result",
            Dict{String,Any}(
                "resources" => structured["resources"],
            ),
        ),
        (
            "design_get",
            Dict{String,Any}(
                "resources" => structured["resources"],
            ),
        ),
    ]
    for (tool_name, invalid_structured) in invalid_results
        invalid = call_tool_result(true, invalid_structured, tool_name)
        @test invalid.is_error
        @test invalid.structured_content["code"] ==
            "MALFORMED_SUCCESS_RESPONSE"
        @test getindex.(invalid.content, "type") == ["text"]
    end

    static_resources, templates = resources(Dict{String,Any}())
    @test [
        (string(resource.uri), resource.name, resource.mime_type)
        for resource in static_resources
    ] == [
        (resource.uri, resource.name, resource.mime_type)
        for resource in MCP_RESOURCE_REGISTRY.resources
    ]
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

@testset "MCP resources validate the exact sidecar boundary" begin
    png_bytes = vcat(RESOURCE_PNG_SIGNATURE, UInt8[0x01])
    design_uri = "wqs://design/current"
    html_uri = "wqs://simulation/slots/slot/html"
    png_uri = "wqs://simulation/slots/slot/png"
    design_value = Dict{String,Any}("name" => "Project")
    design = structured_resource_contents(
        design_uri,
        Dict(
            "mime_type" => "application/json",
            "value" => design_value,
        ),
        "application/json",
    )
    @test design isa TextResourceContents
    @test string(design.uri) == design_uri
    @test design.mime_type == "application/json"
    @test JSON3.read(design.text, Dict{String,Any}) == design_value
    string_value = structured_resource_contents(
        design_uri,
        Dict(
            "mime_type" => "application/json",
            "value" => "Project",
        ),
        "application/json",
    )
    @test string_value.text == "\"Project\""

    structured_invalid_cases = (
        (
            Dict("mime_type" => "application/json"),
            "MALFORMED_SUCCESS_RESPONSE",
        ),
        (
            Dict(
                "mime_type" => "application/json",
                "value" => design_value,
                "legacy" => true,
            ),
            "MALFORMED_SUCCESS_RESPONSE",
        ),
        (
            Dict(
                "mime_type" => "application/json",
                "base64" => base64encode("{}"),
            ),
            "MALFORMED_SUCCESS_RESPONSE",
        ),
        (
            Dict("mime_type" => "text/plain", "value" => design_value),
            "VALIDATION_FAILED",
        ),
    )
    for (payload, expected_code) in structured_invalid_cases
        error = try
            structured_resource_contents(
                design_uri,
                payload,
                "application/json",
            )
            nothing
        catch caught
            caught
        end
        @test error isa BackendRequestError
        @test error.payload["code"] == expected_code
    end

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
            "MALFORMED_SUCCESS_RESPONSE",
        ),
        (
            Dict(
                "mime_type" => "text/html",
                "base64" => base64encode("<p>x</p>"),
                "value" => "<p>x</p>",
            ),
            "text/html",
            "MALFORMED_SUCCESS_RESPONSE",
        ),
        (
            Dict("mime_type" => "text/html", "value" => "<p>x</p>"),
            "text/html",
            "MALFORMED_SUCCESS_RESPONSE",
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
