using HTTP
using JSON3
using Test

const BACKEND_URL = get(
    ENV,
    "WEBQUANTUMSAVORY_TEST_BASE_URL",
    "http://127.0.0.1:8000",
)
const SIDECAR_PORT = parse(
    Int,
    get(ENV, "WEBQUANTUMSAVORY_MCP_PORT", "8001"),
)
const MCP_URL = "http://127.0.0.1:$SIDECAR_PORT/mcp"
const PROTOCOL_VERSION = "2025-06-18"

function parse_body(response)
    isempty(response.body) && return nothing
    return JSON3.read(String(response.body), Dict{String,Any})
end

function control_post(path)
    return HTTP.post(
        "$BACKEND_URL$path",
        [
            "Accept" => "application/json",
            "Content-Type" => "application/json",
            "Origin" => BACKEND_URL,
            "Sec-Fetch-Site" => "same-origin",
        ],
        "{}";
        status_exception=false,
        readtimeout=30,
    )
end

function control_status()
    response = HTTP.get(
        "$BACKEND_URL/_mcp/status",
        [
            "Accept" => "application/json",
            "Origin" => BACKEND_URL,
            "Sec-Fetch-Site" => "same-origin",
        ];
        status_exception=false,
        readtimeout=10,
    )
    return response, parse_body(response)
end

function control_activity()
    response = HTTP.get(
        "$BACKEND_URL/_mcp/activity?cursor=0&limit=500",
        [
            "Accept" => "application/json",
            "Origin" => BACKEND_URL,
            "Sec-Fetch-Site" => "same-origin",
        ];
        status_exception=false,
        readtimeout=10,
    )
    return response, parse_body(response)
end

function initialized_session_activity_count()
    response, body = control_activity()
    response.status == 200 || return -1
    return count(body["activity"]) do record
        record["category"] == "session" &&
            record["phase"] == "initialized"
    end
end

function rpc_request(message; session_id=nothing)
    headers = [
        "Accept" => "application/json, text/event-stream",
        "Connection" => "close",
        "Content-Type" => "application/json",
        "Origin" => "http://127.0.0.1:$SIDECAR_PORT",
    ]
    if session_id !== nothing
        push!(headers, "Mcp-Session-Id" => session_id)
        push!(headers, "MCP-Protocol-Version" => PROTOCOL_VERSION)
    end
    return HTTP.post(
        MCP_URL,
        headers,
        JSON3.write(message);
        status_exception=false,
        readtimeout=30,
    )
end

function initialize_session(request_id)
    response = rpc_request(Dict(
        "jsonrpc" => "2.0",
        "id" => request_id,
        "method" => "initialize",
        "params" => Dict(
            "protocolVersion" => PROTOCOL_VERSION,
            "capabilities" => Dict{String,Any}(),
            "clientInfo" => Dict(
                "name" => "webquantumsavory-ci",
                "version" => "1.0.0",
            ),
        ),
    ))
    body = parse_body(response)
    session_id = HTTP.header(response, "Mcp-Session-Id", "")
    return response, body, session_id
end

function send_initialized(session_id)
    return rpc_request(
        Dict(
            "jsonrpc" => "2.0",
            "method" => "notifications/initialized",
            "params" => Dict{String,Any}(),
        );
        session_id,
    )
end

function session_request(session_id, request_id, method, params=Dict{String,Any}())
    response = rpc_request(
        Dict(
            "jsonrpc" => "2.0",
            "id" => request_id,
            "method" => method,
            "params" => params,
        );
        session_id,
    )
    return response, parse_body(response)
end

function sidecar_is_unavailable()
    try
        response = HTTP.get(MCP_URL; status_exception=false, readtimeout=1)
        return response.status == 0
    catch
        return true
    end
end

function assert_running_control_status()
    response, body = control_status()
    @test response.status == 200
    @test body["success"] === true
    @test body["server"]["state"] == "running"
    @test body["server"]["endpoint"] == MCP_URL
end

function assert_stopped_control_status()
    response, body = control_status()
    @test response.status == 200
    @test body["success"] === true
    @test body["server"]["state"] == "stopped"
    @test body["server"]["endpoint"] === nothing
end

@testset "Real Streamable HTTP sidecar lifecycle" begin
    initial_status, initial_body = control_status()
    @test initial_status.status == 200
    @test initial_body["success"] === true
    @test initial_body["server"]["state"] == "stopped"

    cleared = control_post("/_mcp/activity/clear")
    @test cleared.status == 200
    @test parse_body(cleared)["success"] === true

    first_session = nothing
    try
        started = control_post("/_mcp/start")
        @test started.status == 200
        @test parse_body(started)["server"]["state"] == "running"
        assert_running_control_status()

        stopped_without_session = control_post("/_mcp/stop")
        @test stopped_without_session.status == 200
        @test parse_body(stopped_without_session)["server"]["state"] == "stopped"
        assert_stopped_control_status()
        @test timedwait(sidecar_is_unavailable, 5; pollint=0.05) == :ok
        @test initialized_session_activity_count() == 0

        restarted_without_session = control_post("/_mcp/start")
        @test restarted_without_session.status == 200
        @test parse_body(restarted_without_session)["server"]["state"] == "running"
        assert_running_control_status()

        initialize, initialize_body, first_session = initialize_session(1)
        @test initialize.status == 200
        @test !isempty(first_session)
        @test initialize_body["id"] == 1
        @test initialize_body["result"]["protocolVersion"] == PROTOCOL_VERSION
        @test initialize_body["result"]["serverInfo"]["name"] == "webquantumsavory"
        @test timedwait(
            () -> initialized_session_activity_count() == 1,
            5;
            pollint=0.05,
        ) == :ok

        initialized = send_initialized(first_session)
        @test initialized.status == 202
        @test isempty(initialized.body)

        tools_response, tools_body = session_request(
            first_session,
            2,
            "tools/list",
        )
        @test tools_response.status == 200
        tool_names = Set(tool["name"] for tool in tools_body["result"]["tools"])
        @test "design_get" in tool_names
        @test "simulation_status" in tool_names

        resources_response, resources_body = session_request(
            first_session,
            3,
            "resources/list",
        )
        @test resources_response.status == 200
        resource_uris = Set(
            resource["uri"]
            for resource in resources_body["result"]["resources"]
        )
        @test "wqs://design/current" in resource_uris
        @test "wqs://simulation/state" in resource_uris

        templates_response, templates_body = session_request(
            first_session,
            4,
            "resources/templates/list",
        )
        @test templates_response.status == 200
        result_templates = Set(
            (
                template["uriTemplate"],
                template["mimeType"],
            )
            for template in templates_body["result"]["resourceTemplates"]
            if startswith(template["uriTemplate"], "wqs://simulation/")
        )
        @test result_templates == Set([
            ("wqs://simulation/slots/{slot_id}/html", "text/html"),
            ("wqs://simulation/slots/{slot_id}/png", "image/png"),
            ("wqs://simulation/protocols/{protocol_id}/html", "text/html"),
            ("wqs://simulation/protocols/{protocol_id}/png", "image/png"),
        ])

        missing_resource_response, missing_resource_body = session_request(
            first_session,
            5,
            "resources/read",
            Dict("uri" => "wqs://simulation/slots/missing/html"),
        )
        @test missing_resource_response.status == 200
        @test occursin(
            "\"code\":\"NO_EDITOR_BOUND\"",
            missing_resource_body["error"]["message"],
        )

        tool_response, tool_body = session_request(
            first_session,
            6,
            "tools/call",
            Dict(
                "name" => "design_get",
                "arguments" => Dict{String,Any}(),
            ),
        )
        @test tool_response.status == 200
        @test tool_body["result"]["isError"] === true
        @test tool_body["result"]["structuredContent"]["code"] ==
            "NO_EDITOR_BOUND"
        @test tool_body["result"]["structuredContent"]["retryable"] === true

        rejected, rejected_body, rejected_session = initialize_session(7)
        @test rejected.status == 409
        @test isempty(rejected_session)
        @test rejected_body["error"]["code"] == -32000
        @test occursin(
            "Only one MCP client session",
            rejected_body["error"]["message"],
        )
        @test initialized_session_activity_count() == 1

        stopped = control_post("/_mcp/stop")
        @test stopped.status == 200
        @test parse_body(stopped)["server"]["state"] == "stopped"
        assert_stopped_control_status()
        @test timedwait(sidecar_is_unavailable, 5; pollint=0.05) == :ok

        restarted = control_post("/_mcp/start")
        @test restarted.status == 200
        @test parse_body(restarted)["server"]["state"] == "running"
        assert_running_control_status()

        fresh_initialize, fresh_body, fresh_session = initialize_session(8)
        @test fresh_initialize.status == 200
        @test !isempty(fresh_session)
        @test fresh_session != first_session
        @test fresh_body["result"]["protocolVersion"] == PROTOCOL_VERSION
        @test timedwait(
            () -> initialized_session_activity_count() == 2,
            5;
            pollint=0.05,
        ) == :ok

        fresh_initialized = send_initialized(fresh_session)
        @test fresh_initialized.status == 202

        final_stop = control_post("/_mcp/stop")
        @test final_stop.status == 200
        @test parse_body(final_stop)["server"]["state"] == "stopped"
        assert_stopped_control_status()
        @test timedwait(sidecar_is_unavailable, 5; pollint=0.05) == :ok
    finally
        try
            control_post("/_mcp/stop")
        catch
        end
    end
end
