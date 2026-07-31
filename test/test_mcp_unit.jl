@safetestset "MCP configuration, collaboration, and simulation services" begin
  using Dates
  using Genie
  using Main.WebQuantumSavory
  using Test

  function binding_request(; editor_id="editor-1", generation=1)
    Dict{String,Any}(
      "editor_id" => editor_id,
      "generation" => generation,
      "project_name" => "Project",
      "simulation_name" => "user_Project",
      "contract_version" => WebQuantumSavory.MCP_CONTRACT_VERSION,
      "snapshot" => Dict("name" => "Project", "net" => Dict()),
      "hash" => "initial-hash",
    )
  end

  @testset "strict feature configuration" begin
    disabled = WebQuantumSavory.read_mcp_configuration(
      Dict{String,String}();
      backend_host="0.0.0.0",
      backend_port=8000,
    )
    @test !disabled.enabled
    @test disabled.port == 8001

    enabled = WebQuantumSavory.read_mcp_configuration(
      Dict(
        WebQuantumSavory.MCP_ENABLE_ENV_VAR => "true",
        WebQuantumSavory.MCP_PORT_ENV_VAR => "8123",
      );
      backend_host="127.0.0.1",
      backend_port=8000,
    )
    @test enabled.enabled
    @test enabled.port == 8123
    @test WebQuantumSavory.is_loopback_host("::1")
    @test WebQuantumSavory.is_loopback_host("127.10.20.30")
    @test !WebQuantumSavory.is_loopback_host("0.0.0.0")

    @test_throws ArgumentError WebQuantumSavory.read_mcp_configuration(
      Dict(WebQuantumSavory.MCP_ENABLE_ENV_VAR => "TRUE");
      backend_host="127.0.0.1",
      backend_port=8000,
    )
    @test_throws ArgumentError WebQuantumSavory.read_mcp_configuration(
      Dict(WebQuantumSavory.MCP_PORT_ENV_VAR => "invalid");
      backend_host="127.0.0.1",
      backend_port=8000,
    )
    @test_throws ArgumentError WebQuantumSavory.read_mcp_configuration(
      Dict(WebQuantumSavory.MCP_ENABLE_ENV_VAR => "true");
      backend_host="0.0.0.0",
      backend_port=8000,
    )
    @test_throws ArgumentError WebQuantumSavory.read_mcp_configuration(
      Dict(
        WebQuantumSavory.MCP_ENABLE_ENV_VAR => "true",
        WebQuantumSavory.MCP_PORT_ENV_VAR => "8000",
      );
      backend_host="127.0.0.1",
      backend_port=8000,
    )

    endpoint_config = (server_host="127.0.0.1", server_port=8000)
    @test WebQuantumSavory.effective_genie_server_endpoint(
      endpoint_config;
      arguments=["test_mcp_unit"],
    ) == (host="127.0.0.1", port=8000)
    for arguments in (
      ["test_mcp_unit", "-l", "0.0.0.0", "-p", "8124"],
      ["-l=0.0.0.0", "test_mcp_unit", "-p=8124"],
      ["-l0.0.0.0", "-p8124", "test_mcp_unit"],
    )
      @test WebQuantumSavory.effective_genie_server_endpoint(
        endpoint_config;
        arguments,
      ) == (host="0.0.0.0", port=8124)
    end
    endpoint = WebQuantumSavory.effective_genie_server_endpoint(
      endpoint_config;
      arguments=["test_mcp_unit", "-l", "0.0.0.0", "-p", "8124"],
    )
    @test_throws ArgumentError WebQuantumSavory.read_mcp_configuration(
      Dict(WebQuantumSavory.MCP_ENABLE_ENV_VAR => "true");
      backend_host=endpoint.host,
      backend_port=endpoint.port,
    )

    @test WebQuantumSavory.verify_mcp_browser_origin!(Dict(
      "Host" => "127.0.0.1:8000",
      "Origin" => "http://127.0.0.1:8000",
      "Sec-Fetch-Site" => "same-origin",
    ))
    @test WebQuantumSavory.verify_mcp_browser_origin!(Dict(
      "Host" => "127.0.0.1:8000",
    ))
    origin_error = try
      WebQuantumSavory.verify_mcp_browser_origin!(Dict(
        "Host" => "127.0.0.1:8000",
        "Origin" => "https://attacker.example",
        "Sec-Fetch-Site" => "cross-site",
      ))
      nothing
    catch error
      error
    end
    @test origin_error isa WebQuantumSavory.APIError
    @test origin_error.status_code == 403
    @test origin_error.error_code == "MCP_ORIGIN_FORBIDDEN"
  end

  @testset "dependency and transport boundaries" begin
    root_project = read(joinpath(@__DIR__, "..", "Project.toml"), String)
    sidecar_root = joinpath(@__DIR__, "..", "mcp")
    sidecar_sources = [
      joinpath(sidecar_root, "main.jl"),
      (
        joinpath(sidecar_root, "src", file)
        for file in readdir(joinpath(sidecar_root, "src"))
        if endswith(file, ".jl")
      )...,
    ]
    @test !occursin("ModelContextProtocol", root_project)
    @test all(sidecar_sources) do source
      !occursin(
        r"(?m)^\s*(?:using|import)\s+(?:\.\s*)*WebQuantumSavory\b",
        read(source, String),
      )
    end
    @test all(
      source -> !occursin(r"\bSTATE\b", read(source, String)),
      (
        joinpath(@__DIR__, "..", "routes.jl"),
        joinpath(@__DIR__, "..", "src", "parser.jl"),
        joinpath(@__DIR__, "..", "src", "startup_warmup.jl"),
        joinpath(@__DIR__, "..", "src", "collaboration_hub.jl"),
        joinpath(@__DIR__, "..", "src", "mcp_adapters.jl"),
      ),
    )
    @test all(
      route -> !startswith(route.path, "/_mcp"),
      Genie.Router.routes(),
    )
  end

  @testset "lease and single-editor ownership" begin
    now = Ref(DateTime(2026, 7, 18))
    hub = WebQuantumSavory.CollaborationHub(clock=() -> now[])
    binding = WebQuantumSavory.bind_editor!(hub, binding_request())
    @test binding["revision"] == 0
    @test WebQuantumSavory.collaboration_status(hub)["binding"]["editor_id"] == "editor-1"

    busy = try
      WebQuantumSavory.bind_editor!(
        hub,
        binding_request(editor_id="editor-2", generation=2),
      )
      nothing
    catch error
      error
    end
    @test busy isa WebQuantumSavory.APIError
    @test busy.error_code == "EDITOR_BUSY"

    now[] += Second(WebQuantumSavory.MCP_EDITOR_LEASE_SECONDS + 1)
    @test WebQuantumSavory.expire_editor_lease!(hub)
    @test WebQuantumSavory.collaboration_status(hub)["binding"] === nothing
    replacement = WebQuantumSavory.bind_editor!(
      hub,
      binding_request(editor_id="editor-2", generation=2),
    )
    @test replacement["revision"] == 0
  end

  @testset "lease expiry cancels pending browser waits" begin
    now = Ref(DateTime(2026, 7, 18))
    hub = WebQuantumSavory.CollaborationHub(clock=() -> now[])
    WebQuantumSavory.bind_editor!(hub, binding_request())

    waiting = @async try
      WebQuantumSavory.enqueue_browser_command!(
        hub,
        Dict("type" => "design_command");
        operation_id="expires-before-delivery",
        expected_revision=0,
        mutates_design=true,
        timeout_seconds=2,
      )
    catch error
      error
    end
    @test timedwait(
      () -> lock(() -> !isempty(hub.pending), hub.lock),
      1;
      pollint=0.01,
    ) == :ok
    now[] += Second(WebQuantumSavory.MCP_EDITOR_LEASE_SECONDS + 1)
    expired = fetch(waiting)
    @test expired isa WebQuantumSavory.APIError
    @test expired.error_code == "EDITOR_LEASE_EXPIRED"
    @test hub.binding === nothing
    @test isempty(hub.pending)

    replacement = WebQuantumSavory.bind_editor!(
      hub,
      binding_request(generation=2),
    )
    owner = Dict(
      "binding_id" => replacement["binding_id"],
      "generation" => 2,
    )
    delivered_wait = @async try
      WebQuantumSavory.enqueue_browser_command!(
        hub,
        Dict("type" => "design_command");
        operation_id="expires-after-delivery",
        expected_revision=0,
        mutates_design=true,
        timeout_seconds=2,
      )
    catch error
      error
    end
    @test WebQuantumSavory.next_browser_command!(
      hub,
      owner;
      timeout_seconds=1,
    )["operation_id"] == "expires-after-delivery"
    now[] += Second(WebQuantumSavory.MCP_EDITOR_LEASE_SECONDS + 1)
    unknown = fetch(delivered_wait)
    @test unknown isa WebQuantumSavory.APIError
    @test unknown.error_code == "OUTCOME_UNKNOWN"
    @test hub.binding === nothing
  end

  @testset "a desynchronized owner can unbind and recover" begin
    hub = WebQuantumSavory.CollaborationHub()
    binding = WebQuantumSavory.bind_editor!(hub, binding_request())
    owner = Dict(
      "binding_id" => binding["binding_id"],
      "generation" => 1,
    )
    lock(hub.lock) do
      hub.binding.desynchronized = true
    end

    @test WebQuantumSavory.unbind_editor!(hub, owner)["success"]
    @test WebQuantumSavory.collaboration_status(hub)["binding"] === nothing
    rebound = WebQuantumSavory.bind_editor!(
      hub,
      binding_request(generation=2),
    )
    @test rebound["revision"] == 0
  end

  @testset "revision acknowledgement and idempotency" begin
    hub = WebQuantumSavory.CollaborationHub()
    binding = WebQuantumSavory.bind_editor!(hub, binding_request())
    owner = Dict(
      "binding_id" => binding["binding_id"],
      "generation" => 1,
    )

    waiting = @async WebQuantumSavory.enqueue_browser_command!(
      hub,
      Dict(
        "type" => "design_command",
        "tool" => "topology_edit",
        "arguments" => Dict(),
      );
      operation_id="stable-operation",
      expected_revision=0,
      mutates_design=true,
      timeout_seconds=2,
    )
    command = WebQuantumSavory.next_browser_command!(hub, owner; timeout_seconds=1)
    @test command["base_revision"] == 0
    @test command["operation_id"] == "stable-operation"

    WebQuantumSavory.commit_browser_command!(
      hub,
      Dict(
        owner...,
        "command_id" => command["command_id"],
        "operation_id" => "stable-operation",
        "base_revision" => 0,
        "success" => true,
        "document_changed" => true,
        "snapshot" => Dict("name" => "Project", "net" => Dict("nodes" => [])),
        "hash" => "updated-hash",
        "result" => Dict(
          "summary" => "Created one node",
          "affected_ids" => ["node-1"],
        ),
      ),
    )
    result = fetch(waiting)
    @test result["revision"] == 1
    @test result["operation_id"] == "stable-operation"
    @test WebQuantumSavory.design_mirror(hub)["hash"] == "updated-hash"

    concurrently_waiting = @async WebQuantumSavory.enqueue_browser_command!(
      hub,
      Dict("type" => "design_command");
      operation_id="concurrent-retry",
      expected_revision=1,
      mutates_design=true,
      timeout_seconds=2,
    )
    retry_waiting = @async WebQuantumSavory.enqueue_browser_command!(
      hub,
      Dict("type" => "design_command");
      operation_id="concurrent-retry",
      expected_revision=1,
      mutates_design=true,
      timeout_seconds=2,
    )
    retry_command = WebQuantumSavory.next_browser_command!(
      hub,
      owner;
      timeout_seconds=1,
    )
    WebQuantumSavory.commit_browser_command!(
      hub,
      Dict(
        owner...,
        "command_id" => retry_command["command_id"],
        "operation_id" => "concurrent-retry",
        "base_revision" => 1,
        "success" => true,
        "document_changed" => true,
        "snapshot" => Dict("name" => "Project", "net" => Dict("nodes" => ["node-1"])),
        "hash" => "retry-hash",
        "result" => Dict("summary" => "Applied once"),
      ),
    )
    @test fetch(concurrently_waiting) == fetch(retry_waiting)
    retry_activity = filter(
      record -> get(record, "phase", "") == "queued" &&
        get(record, "operation_id", "") == "concurrent-retry",
      WebQuantumSavory.mcp_activity(hub; limit=500)["activity"],
    )
    @test length(retry_activity) == 1

    cached = WebQuantumSavory.enqueue_browser_command!(
      hub,
      Dict("type" => "design_command");
      operation_id="stable-operation",
      expected_revision=0,
      mutates_design=true,
      timeout_seconds=0.01,
    )
    @test cached == result
    @test WebQuantumSavory.collaboration_status(hub)["pending_commands"] == 0

    conflict = try
      WebQuantumSavory.enqueue_browser_command!(
        hub,
        Dict("type" => "design_command");
        operation_id="new-operation",
        expected_revision=1,
        mutates_design=true,
        timeout_seconds=0.01,
      )
      nothing
    catch error
      error
    end
    @test conflict isa WebQuantumSavory.APIError
    @test conflict.error_code == "REVISION_CONFLICT"
    @test conflict.details["current_revision"] == 2
    @test conflict.details["retryable"] == true
  end

  @testset "browser simulation readiness records the prepared design revision" begin
    hub = WebQuantumSavory.CollaborationHub()
    binding = WebQuantumSavory.bind_editor!(hub, binding_request())
    owner = Dict(
      "binding_id" => binding["binding_id"],
      "generation" => 1,
    )

    function acknowledge_simulation(action)
      waiting = @async WebQuantumSavory.enqueue_browser_command!(
        hub,
        Dict(
          "type" => "simulation_action",
          "action" => action,
          "duration" => action == "run" ? 1 : nothing,
        );
        timeout_seconds=2,
      )
      command = WebQuantumSavory.next_browser_command!(
        hub,
        owner;
        timeout_seconds=1,
      )
      WebQuantumSavory.commit_browser_command!(
        hub,
        Dict(
          owner...,
          "command_id" => command["command_id"],
          "base_revision" => command["base_revision"],
          "success" => true,
          "document_changed" => false,
          "result" => Dict(
            "summary" => "Simulation $(action) accepted.",
            "prepared_revision" => 0,
          ),
        ),
      )
      return fetch(waiting)
    end

    prepared = acknowledge_simulation("prepare")
    played = acknowledge_simulation("run")

    @test prepared["prepared_revision"] == 0
    @test played["prepared_revision"] == 0
    @test prepared["revision"] == 0
    @test played["revision"] == 0
    @test hub.prepared_revision == 0

    waiting_reset = @async WebQuantumSavory.enqueue_browser_command!(
      hub,
      Dict("type" => "simulation_action", "action" => "reset");
      timeout_seconds=2,
    )
    reset_command = WebQuantumSavory.next_browser_command!(
      hub,
      owner;
      timeout_seconds=1,
    )
    WebQuantumSavory.commit_browser_command!(
      hub,
      Dict(
        owner...,
        "command_id" => reset_command["command_id"],
        "base_revision" => 0,
        "success" => true,
        "document_changed" => false,
        "result" => Dict("summary" => "Simulation reset accepted."),
      ),
    )
    fetch(waiting_reset)
    @test hub.prepared_revision === nothing

    for reported_revision in (nothing, 1)
      mismatch_hub = WebQuantumSavory.CollaborationHub()
      mismatch_binding = WebQuantumSavory.bind_editor!(
        mismatch_hub,
        binding_request(),
      )
      mismatch_owner = Dict(
        "binding_id" => mismatch_binding["binding_id"],
        "generation" => 1,
      )
      waiting = @async try
        WebQuantumSavory.enqueue_browser_command!(
          mismatch_hub,
          Dict("type" => "simulation_action", "action" => "run");
          timeout_seconds=2,
        )
      catch error
        error
      end
      command = WebQuantumSavory.next_browser_command!(
        mismatch_hub,
        mismatch_owner;
        timeout_seconds=1,
      )
      result = Dict{String,Any}("summary" => "Simulation run accepted.")
      reported_revision === nothing ||
        (result["prepared_revision"] = reported_revision)
      acknowledgement_error = try
        WebQuantumSavory.commit_browser_command!(
          mismatch_hub,
          Dict(
            mismatch_owner...,
            "command_id" => command["command_id"],
            "base_revision" => 0,
            "success" => true,
            "document_changed" => false,
            "result" => result,
          ),
        )
        nothing
      catch error
        error
      end
      @test acknowledgement_error isa WebQuantumSavory.APIError
      @test acknowledgement_error.error_code == "PROJECT_CHANGED"
      @test fetch(waiting).error_code == "OUTCOME_UNKNOWN"
      @test WebQuantumSavory.collaboration_status(
        mismatch_hub,
      )["binding"]["desynchronized"]
    end
  end

  @testset "browser simulation rejection preserves structured diagnostics" begin
    hub = WebQuantumSavory.CollaborationHub()
    binding = WebQuantumSavory.bind_editor!(hub, binding_request())
    owner = Dict(
      "binding_id" => binding["binding_id"],
      "generation" => 1,
    )
    waiting = @async try
      WebQuantumSavory.enqueue_browser_command!(
        hub,
        Dict("type" => "simulation_action", "action" => "run");
        timeout_seconds=2,
      )
    catch error
      error
    end
    command = WebQuantumSavory.next_browser_command!(
      hub,
      owner;
      timeout_seconds=1,
    )

    WebQuantumSavory.commit_browser_command!(
      hub,
      Dict(
        owner...,
        "command_id" => command["command_id"],
        "base_revision" => command["base_revision"],
        "success" => false,
        "error" => Dict(
          "code" => "SIMULATOR_REJECTED",
          "message" => "Simulator rejected Play.",
          "status" => 422,
          "retryable" => false,
          "details" => Dict(
            "phase" => "run",
            "diagnostic_canary" => "hub-canary",
          ),
          "method" => "POST",
          "url" => "http://api.test/run_simulation",
          "cause" => Dict(
            "name" => "TypeError",
            "message" => "simulator diagnostic",
          ),
        ),
      ),
    )

    rejection = fetch(waiting)
    @test rejection isa WebQuantumSavory.APIError
    @test rejection.error_code == "SIMULATOR_REJECTED"
    @test rejection.status_code == 422
    @test rejection.message == "Simulator rejected Play."
    @test rejection.details["phase"] == "run"
    @test rejection.details["diagnostic_canary"] == "hub-canary"
    @test rejection.details["method"] == "POST"
    @test rejection.details["url"] == "http://api.test/run_simulation"
    @test rejection.details["cause"] == Dict(
      "name" => "TypeError",
      "message" => "simulator diagnostic",
    )
    @test rejection.details["retryable"] == false
  end

  @testset "GUI preparation reports are design-neutral and revision-safe" begin
    hub = WebQuantumSavory.CollaborationHub()
    binding = WebQuantumSavory.bind_editor!(hub, binding_request())
    owner = Dict(
      "binding_id" => binding["binding_id"],
      "generation" => 1,
    )
    mirror_before = WebQuantumSavory.design_mirror(hub)

    lifecycle = WebQuantumSavory.commit_gui_snapshot!(
      hub,
      Dict(
        owner...,
        "origin" => "gui",
        "base_revision" => 0,
        "success" => true,
        "document_changed" => false,
        "result" => Dict(
          "kind" => "simulation_prepared",
          "prepared_revision" => 0,
        ),
      ),
    )

    @test lifecycle["revision"] == 0
    @test hub.prepared_revision == 0
    @test WebQuantumSavory.design_mirror(hub) == mirror_before

    design_commit = WebQuantumSavory.commit_gui_snapshot!(
      hub,
      Dict(
        owner...,
        "origin" => "gui",
        "base_revision" => 0,
        "snapshot" => Dict(
          "name" => "Project",
          "description" => "Revision one",
        ),
        "hash" => "revision-one-hash",
      ),
    )
    @test design_commit["revision"] == 1

    stale = try
      WebQuantumSavory.commit_gui_snapshot!(
        hub,
        Dict(
          owner...,
          "origin" => "gui",
          "base_revision" => 0,
          "document_changed" => false,
          "result" => Dict(
            "kind" => "simulation_prepared",
            "prepared_revision" => 0,
          ),
        ),
      )
      nothing
    catch error
      error
    end
    @test stale isa WebQuantumSavory.APIError
    @test stale.error_code == "REVISION_CONFLICT"

    mismatch = try
      WebQuantumSavory.commit_gui_snapshot!(
        hub,
        Dict(
          owner...,
          "origin" => "gui",
          "base_revision" => 1,
          "document_changed" => false,
          "result" => Dict(
            "kind" => "simulation_prepared",
            "prepared_revision" => 0,
          ),
        ),
      )
      nothing
    catch error
      error
    end
    @test mismatch isa WebQuantumSavory.APIError
    @test mismatch.error_code == "REVISION_CONFLICT"
    @test mismatch.details["current_revision"] == 1
    @test mismatch.details["prepared_revision"] == 0
    @test WebQuantumSavory.design_mirror(hub)["hash"] == "revision-one-hash"
  end

  @testset "impossible successful acknowledgements require a rebind" begin
    hub = WebQuantumSavory.CollaborationHub()
    binding = WebQuantumSavory.bind_editor!(hub, binding_request())
    owner = Dict(
      "binding_id" => binding["binding_id"],
      "generation" => 1,
    )
    waiting = @async try
      WebQuantumSavory.enqueue_browser_command!(
        hub,
        Dict("type" => "design_command");
        operation_id="stale-success",
        expected_revision=0,
        mutates_design=true,
        timeout_seconds=2,
      )
    catch error
      error
    end
    command = WebQuantumSavory.next_browser_command!(hub, owner; timeout_seconds=1)
    WebQuantumSavory.commit_gui_snapshot!(
      hub,
      Dict(
        owner...,
        "base_revision" => 0,
        "snapshot" => Dict("name" => "Project", "description" => "GUI changed"),
        "hash" => "gui-hash",
      ),
    )

    mismatch = try
      WebQuantumSavory.commit_browser_command!(
        hub,
        Dict(
          owner...,
          "command_id" => command["command_id"],
          "operation_id" => "stale-success",
          "base_revision" => 0,
          "success" => true,
          "document_changed" => true,
          "snapshot" => Dict("name" => "Project", "description" => "stale"),
          "hash" => "stale-hash",
          "result" => Dict("summary" => "Should not commit"),
        ),
      )
      nothing
    catch error
      error
    end
    @test mismatch isa WebQuantumSavory.APIError
    @test mismatch.error_code == "PROJECT_CHANGED"
    @test WebQuantumSavory.collaboration_status(hub)["binding"]["desynchronized"]
    outcome = fetch(waiting)
    @test outcome isa WebQuantumSavory.APIError
    @test outcome.error_code == "OUTCOME_UNKNOWN"
    @test isempty(hub.pending)
    @test WebQuantumSavory.unbind_editor!(hub, owner)["success"]
  end

  @testset "acknowledgement mismatches immediately cancel pending commands" begin
    function start_pending_command(; deliver::Bool)
      hub = WebQuantumSavory.CollaborationHub()
      binding = WebQuantumSavory.bind_editor!(hub, binding_request())
      owner = Dict(
        "binding_id" => binding["binding_id"],
        "generation" => 1,
      )
      waiting = @async try
        WebQuantumSavory.enqueue_browser_command!(
          hub,
          Dict("type" => "design_command");
          operation_id="mismatch-operation",
          expected_revision=0,
          mutates_design=true,
          timeout_seconds=2,
        )
      catch error
        error
      end
      @test timedwait(
        () -> lock(hub.lock) do
          !isempty(hub.pending)
        end,
        1;
        pollint=0.01,
      ) == :ok
      command = deliver ?
        WebQuantumSavory.next_browser_command!(hub, owner; timeout_seconds=1) :
        nothing
      return (; hub, owner, waiting, command)
    end

    undelivered = start_pending_command(deliver=false)
    unknown_command = try
      WebQuantumSavory.commit_browser_command!(
        undelivered.hub,
        Dict(
          undelivered.owner...,
          "command_id" => "unknown-command",
          "base_revision" => 0,
          "success" => false,
        ),
      )
      nothing
    catch error
      error
    end
    @test unknown_command isa WebQuantumSavory.APIError
    @test unknown_command.error_code == "PROJECT_CHANGED"
    undelivered_outcome = fetch(undelivered.waiting)
    @test undelivered_outcome isa WebQuantumSavory.APIError
    @test undelivered_outcome.error_code == "OPERATION_CANCELLED"
    @test isempty(undelivered.hub.pending)
    @test WebQuantumSavory.collaboration_status(
      undelivered.hub,
    )["binding"]["desynchronized"]

    for mismatch in (:base_revision, :operation_id)
      delivered = start_pending_command(deliver=true)
      acknowledgement = Dict{String,Any}(
        delivered.owner...,
        "command_id" => delivered.command["command_id"],
        "operation_id" => "mismatch-operation",
        "base_revision" => 0,
        "success" => false,
      )
      mismatch == :base_revision && (acknowledgement["base_revision"] = 1)
      mismatch == :operation_id &&
        (acknowledgement["operation_id"] = "different-operation")
      mismatch_error = try
        WebQuantumSavory.commit_browser_command!(
          delivered.hub,
          acknowledgement,
        )
        nothing
      catch error
        error
      end
      @test mismatch_error isa WebQuantumSavory.APIError
      @test mismatch_error.error_code == "PROJECT_CHANGED"
      delivered_outcome = fetch(delivered.waiting)
      @test delivered_outcome isa WebQuantumSavory.APIError
      @test delivered_outcome.error_code == "OUTCOME_UNKNOWN"
      @test isempty(delivered.hub.pending)
      @test WebQuantumSavory.collaboration_status(
        delivered.hub,
      )["binding"]["desynchronized"]
    end
  end

  @testset "activity is bounded and sanitized" begin
    hub = WebQuantumSavory.CollaborationHub()
    utc_now = Dates.now(Dates.UTC)
    @test abs(Dates.value(hub.clock() - utc_now)) < 5_000
    WebQuantumSavory.record_mcp_activity!(
      hub,
      "tool",
      "completed";
      details=Dict(
        "capability" => "secret",
        "password" => "password-canary",
        "api_key" => "api-key-canary",
        "Authorization" => "Bearer authorization-canary",
        "session_cookie" => "cookie-canary",
        "private-key" => "private-key-canary",
        "png_base64" => "binary",
        "result" => "small",
      ),
    )
    record = WebQuantumSavory.mcp_activity(hub)["activity"][1]
    @test record["details"]["capability"] == "[omitted]"
    @test record["details"]["password"] == "[omitted]"
    @test record["details"]["api_key"] == "[omitted]"
    @test record["details"]["Authorization"] == "[omitted]"
    @test record["details"]["session_cookie"] == "[omitted]"
    @test record["details"]["private-key"] == "[omitted]"
    @test record["details"]["png_base64"] == "[binary omitted]"
    @test !occursin(
      "canary",
      WebQuantumSavory.JSON.json(record["details"]),
    )

    WebQuantumSavory.record_mcp_activity!(
      hub,
      "tool",
      "completed";
      details=Dict(
        "result" => repeat("x", WebQuantumSavory.MCP_ACTIVITY_DETAIL_LIMIT + 10),
      ),
    )
    truncated = WebQuantumSavory.mcp_activity(hub)["activity"][2]["details"]
    @test get(truncated, "truncated", false)
  end

  @testset "simulation log reads can remain non-purging" begin
    state = WebQuantumSavory.State(
      name="logs",
      log_events=Any[Dict("message" => "one"), Dict("message" => "two")],
    )
    service = WebQuantumSavory.SimulationService(Dict("logs" => state))
    latest = WebQuantumSavory.simulation_logs(service, "logs"; purge=false, limit=1)
    @test latest == Any[Dict("message" => "two")]
    @test length(state.log_events) == 2
    @test WebQuantumSavory.simulation_status(service, "logs")["name"] == "logs"
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.simulation_status(
      service,
      "missing",
    )

    hub = WebQuantumSavory.CollaborationHub()
    status = WebQuantumSavory._simulation_revision_status(
      hub,
      WebQuantumSavory.simulation_status(service, "logs"),
    )
    @test status["phase"] == "unknown"
    @test status["running"] === false
    @test status["paused"] === false
    @test status["completed"] === false
  end

  @testset "simulation MCP reads preserve binding context and stable errors" begin
    hub = WebQuantumSavory.CollaborationHub()
    binding = WebQuantumSavory.bind_editor!(hub, binding_request())
    owner = Dict(
      "binding_id" => binding["binding_id"],
      "generation" => 1,
    )
    empty_service = WebQuantumSavory.SimulationService(Dict{String,WebQuantumSavory.State}())

    missing = try
      WebQuantumSavory.dispatch_mcp_tool!(
        "simulation_status",
        Dict{String,Any}();
        hub,
        simulation_service=empty_service,
      )
      nothing
    catch error
      error
    end
    @test missing isa WebQuantumSavory.APIError
    @test missing.error_code == "RESULT_NOT_FOUND"

    logs_state = WebQuantumSavory.State(name="user_Project")
    logs_service = WebQuantumSavory.SimulationService(
      Dict("user_Project" => logs_state),
    )
    invalid = try
      WebQuantumSavory.dispatch_mcp_tool!(
        "simulation_logs",
        Dict{String,Any}("limit" => 0);
        hub,
        simulation_service=logs_service,
      )
      nothing
    catch error
      error
    end
    @test invalid isa WebQuantumSavory.APIError
    @test invalid.error_code == "VALIDATION_FAILED"

    changed = try
      WebQuantumSavory._with_bound_simulation_read(hub) do simulation_name
        @test simulation_name == "user_Project"
        WebQuantumSavory.unbind_editor!(hub, owner)
        WebQuantumSavory.bind_editor!(
          hub,
          binding_request(generation=2),
        )
        Dict("name" => simulation_name)
      end
      nothing
    catch error
      error
    end
    @test changed isa WebQuantumSavory.APIError
    @test changed.error_code == "PROJECT_CHANGED"
    @test changed.details["retryable"]
  end

  @testset "failed simulation replacement preserves the existing state" begin
    existing = WebQuantumSavory.State(name="atomic-replacement")
    service = WebQuantumSavory.SimulationService(
      Dict("atomic-replacement" => existing),
    )
    validation = Dict(
      "data" => Dict("name" => "atomic-replacement"),
    )

    @test_throws ErrorException WebQuantumSavory.simulation_create!(
      service,
      Dict{String,Any}();
      validation,
      builder=_ -> error("candidate construction failed"),
    )
    @test service.states["atomic-replacement"] === existing
  end

  @testset "simulation lifecycle locks and transition checks" begin
    destroy_state = WebQuantumSavory.State(name="destroy-lock")
    destroy_service = WebQuantumSavory.SimulationService(
      Dict("destroy-lock" => destroy_state),
    )
    @test WebQuantumSavory.simulation_destroy!(destroy_service, "destroy-lock")
    @test !haskey(destroy_service.lifecycle_locks, "destroy-lock")

    running_state = WebQuantumSavory.State(
      name="running-block",
      is_running=true,
    )
    running_service = WebQuantumSavory.SimulationService(
      Dict("running-block" => running_state),
    )
    blocked = try
      WebQuantumSavory.simulation_block!(
        running_service,
        "running-block";
        reason=:autopurge,
        auto_purged=true,
      )
      nothing
    catch error
      error
    end
    @test blocked isa WebQuantumSavory.APIError
    @test !running_state.auto_purged

    release_run_task = Channel{Nothing}(1)
    active_task = @async take!(release_run_task)
    acknowledging_state = WebQuantumSavory.State(
      name="acknowledging-run",
      run_task=active_task,
    )
    acknowledging_service = WebQuantumSavory.SimulationService(
      Dict("acknowledging-run" => acknowledging_state),
    )
    acknowledgement_error = try
      WebQuantumSavory.simulation_action_is_valid!(
        acknowledging_service,
        "acknowledging-run";
        destroy=true,
      )
      nothing
    catch error
      error
    end
    @test acknowledgement_error isa WebQuantumSavory.APIError
    @test occursin("running", acknowledgement_error.message)
    @test acknowledging_service.states["acknowledging-run"] ===
      acknowledging_state
    put!(release_run_task, nothing)
    wait(active_task)

    isolated_state = WebQuantumSavory.State(
      name="isolated-service",
      execution_time_exceeded=true,
    )
    isolated_service = WebQuantumSavory.SimulationService(
      Dict("isolated-service" => isolated_state),
    )
    isolated = try
      WebQuantumSavory.action_is_valid(
        "isolated-service",
        false;
        service=isolated_service,
      )
      nothing
    catch error
      error
    end
    @test isolated isa WebQuantumSavory.APIError
    @test occursin("expired", isolated.message)

    isolated_state.simulation = WebQuantumSavory.Simulation()
    run_error = try
      WebQuantumSavory.simulation_run!(
        isolated_service,
        "isolated-service",
        1.0,
      )
      nothing
    catch error
      error
    end
    @test run_error isa WebQuantumSavory.APIError
    @test occursin("expired", run_error.message)
  end

  @testset "catalog adapters preserve placement metadata" begin
    catalog = WebQuantumSavory._catalog_snapshot()
    entries = WebQuantumSavory._catalog_entries(catalog, "protocols")
    @test !isempty(entries)
    @test all(haskey(entry, "placement") for entry in entries)
    @test WebQuantumSavory._catalog_entries(
      Dict{String,Any}("slots" => Any["Qubit"]),
      SubString("xslots", 2),
    ) == Any["Qubit"]

    first_entry = first(entries)
    result = WebQuantumSavory.dispatch_mcp_tool!(
      "catalog_get",
      Dict(
        "kind" => "protocols",
        "type" => first_entry["type"],
      );
      hub=WebQuantumSavory.CollaborationHub(),
    )
    @test result["entry"]["type"] == first_entry["type"]
    @test result["entry"]["placement"] == first_entry["placement"]
  end
end
