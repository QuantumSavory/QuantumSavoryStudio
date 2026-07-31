@safetestset "MCP configuration, collaboration, and simulation services" begin
  using Dates
  using Genie
  using Main.WebQuantumSavory
  import QuantumSavory
  using Test

  struct MCPTestRepresentation end
  struct MCPTestSlot end

  Base.show(io::IO, ::MIME"text/html", ::MCPTestRepresentation) =
    print(io, "<p>rendered result</p>")
  Base.show(io::IO, ::MIME"image/png", ::MCPTestRepresentation) =
    write(io, WebQuantumSavory.MCP_RESOURCE_PNG_SIGNATURE, UInt8[0x01])
  QuantumSavory.stateof(::MCPTestSlot) = MCPTestRepresentation()
  QuantumSavory.slots(::MCPTestRepresentation) = Any[]
  QuantumSavory.islocked(::MCPTestSlot) = false
  QuantumSavory.isassigned(::MCPTestSlot) = true

  function binding_request(; editor_id="editor-1", generation=1, hash="initial-hash")
    Dict{String,Any}(
      "editor_id" => editor_id,
      "generation" => generation,
      "project_name" => "Project",
      "simulation_name" => "user_Project",
      "contract_version" => WebQuantumSavory.MCP_CONTRACT_VERSION,
      "snapshot" => Dict("name" => "Project", "net" => Dict()),
      "hash" => hash,
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

  @testset "resource registry is the backend authority" begin
    registry = WebQuantumSavory.MCP_RESOURCE_REGISTRY
    @test registry.version == WebQuantumSavory.MCP_CONTRACT_VERSION == 2
    @test Set(keys(registry.resources_by_id)) ==
      Set(["design_current", "simulation_state"])
    @test Set(keys(registry.result_templates_by_kind)) ==
      Set(["slots", "protocols"])
    @test length(registry.resource_templates) == 5
    catalog = registry.templates_by_id["catalog"]
    @test catalog.result_kind === nothing
    @test catalog.variable == "kind"
    @test catalog.mime_type == "application/json"
    @test !isfile(joinpath(
      @__DIR__,
      "..",
      "contracts",
      "mcp",
      "v2",
      "tools.json",
    ))
    @test basename(WebQuantumSavory.MCP_CONTRACT_FILE) == "contract.json"

    contract = deepcopy(WebQuantumSavory.MCP_CONTRACT.contract)
    contract["resource_templates"][2]["mime_type"] = "image/png"
    @test_throws ArgumentError WebQuantumSavory.load_mcp_contract_registry(
      contract,
    )
    catalog_contract = deepcopy(WebQuantumSavory.MCP_CONTRACT.contract)
    catalog_contract["resource_templates"][1]["uri_template"] =
      "wqs://catalog/{catalog_kind}"
    @test_throws ArgumentError WebQuantumSavory.load_mcp_contract_registry(
      catalog_contract,
    )
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
    @test replacement["revision"] == 1
  end

  @testset "lease expiry cancels pending browser waits" begin
    now = Ref(DateTime(2026, 7, 18))
    hub = WebQuantumSavory.CollaborationHub(clock=() -> now[])
    WebQuantumSavory.bind_editor!(hub, binding_request())

    waiting = @async try
      WebQuantumSavory.enqueue_browser_command!(
        hub,
        Dict("type" => "design_command");
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
    @test expired.status_code == 409
    @test expired.details["retryable"] == true
    @test !haskey(expired.details, "readback_required")
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
        expected_revision=replacement["revision"],
        mutates_design=true,
        timeout_seconds=2,
      )
    catch error
      error
    end
    delivered = WebQuantumSavory.next_browser_command!(
      hub,
      owner;
      timeout_seconds=1,
    )
    @test delivered["base_revision"] == replacement["revision"]
    @test !haskey(delivered, "operation_id")
    now[] += Second(WebQuantumSavory.MCP_EDITOR_LEASE_SECONDS + 1)
    unknown = fetch(delivered_wait)
    @test unknown isa WebQuantumSavory.APIError
    @test unknown.error_code == "OUTCOME_UNKNOWN"
    @test unknown.details["retryable"] == false
    @test unknown.details["readback_required"] == true
    @test unknown.details["readback_tool"] == "design_get"
    @test hub.binding === nothing

    lifecycle_hub = WebQuantumSavory.CollaborationHub(clock=() -> now[])
    lifecycle_binding = WebQuantumSavory.bind_editor!(
      lifecycle_hub,
      binding_request(generation=3),
    )
    lifecycle_owner = Dict(
      "binding_id" => lifecycle_binding["binding_id"],
      "generation" => 3,
    )
    lifecycle_wait = @async try
      WebQuantumSavory.enqueue_browser_command!(
        lifecycle_hub,
        Dict("type" => "simulation_action", "action" => "run");
        timeout_seconds=2,
      )
    catch error
      error
    end
    WebQuantumSavory.next_browser_command!(
      lifecycle_hub,
      lifecycle_owner;
      timeout_seconds=1,
    )
    now[] += Second(WebQuantumSavory.MCP_EDITOR_LEASE_SECONDS + 1)
    lifecycle_unknown = fetch(lifecycle_wait)
    @test lifecycle_unknown.error_code == "OUTCOME_UNKNOWN"
    @test lifecycle_unknown.details["retryable"] == false
    @test lifecycle_unknown.details["readback_required"] == true
    @test lifecycle_unknown.details["readback_tool"] == "simulation_status"
  end

  @testset "cancellation classification follows the delivery boundary" begin
    triggers = (:lease, :unbind, :stop, :replacement, :desynchronize)
    phases = (
      :queued,
      :delivered_design,
      :delivered_lifecycle,
      :delivered_read,
    )

    function cancellation_case(trigger, phase)
      now = Ref(DateTime(2026, 7, 18))
      hub = WebQuantumSavory.CollaborationHub(clock=() -> now[])
      binding = WebQuantumSavory.bind_editor!(hub, binding_request())
      owner = Dict(
        "binding_id" => binding["binding_id"],
        "generation" => 1,
      )
      lifecycle = phase == :delivered_lifecycle
      pure_read = phase == :delivered_read
      payload = lifecycle ?
        Dict("type" => "simulation_action", "action" => "run") :
        Dict("type" => pure_read ? "design_get" : "design_command")
      mutates_design = !lifecycle && !pure_read
      waiting = @async try
        WebQuantumSavory.enqueue_browser_command!(
          hub,
          payload;
          expected_revision=mutates_design ? 0 : nothing,
          mutates_design,
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

      delivered = startswith(string(phase), "delivered_")
      if delivered
        @test WebQuantumSavory.next_browser_command!(
          hub,
          owner;
          timeout_seconds=1,
        ) !== nothing
      end

      if trigger == :lease
        now[] += Second(WebQuantumSavory.MCP_EDITOR_LEASE_SECONDS + 1)
        WebQuantumSavory.expire_editor_lease!(hub)
      elseif trigger == :unbind
        WebQuantumSavory.unbind_editor!(hub, owner)
      elseif trigger == :stop
        WebQuantumSavory.stop_collaboration!(hub)
      elseif trigger == :replacement
        WebQuantumSavory.bind_editor!(
          hub,
          binding_request(generation=2, hash="replacement"),
        )
      else
        mismatch = try
          WebQuantumSavory.commit_browser_command!(
            hub,
            Dict(
              owner...,
              "command_id" => "unknown-command",
              "base_revision" => 0,
              "success" => false,
            ),
          )
          nothing
        catch error
          error
        end
        @test mismatch isa WebQuantumSavory.APIError
        @test mismatch.error_code == "PROJECT_CHANGED"
      end

      outcome = fetch(waiting)
      @test outcome isa WebQuantumSavory.APIError
      @test outcome.status_code == 409
      state_changing_delivery =
        phase in (:delivered_design, :delivered_lifecycle)
      if state_changing_delivery
        @test outcome.error_code == "OUTCOME_UNKNOWN"
        @test outcome.details["retryable"] == false
        @test outcome.details["readback_required"] == true
        @test outcome.details["readback_tool"] == (
          lifecycle ? "simulation_status" : "design_get"
        )
      else
        expected_code = trigger == :lease ?
          "EDITOR_LEASE_EXPIRED" :
          trigger == :replacement ? "PROJECT_CHANGED" : "OPERATION_CANCELLED"
        @test outcome.error_code == expected_code
        @test outcome.details["retryable"] == true
        @test !haskey(outcome.details, "readback_required")
      end
      @test isempty(hub.pending)
    end

    for trigger in triggers, phase in phases
      cancellation_case(trigger, phase)
    end
  end

  @testset "browser queue admission is bounded and timeout-safe" begin
    timeout_hub = WebQuantumSavory.CollaborationHub()
    WebQuantumSavory.bind_editor!(timeout_hub, binding_request())
    timeout_wait = @async try
      WebQuantumSavory.enqueue_browser_command!(
        timeout_hub,
        Dict("type" => "design_command");
        expected_revision=0,
        mutates_design=true,
        timeout_seconds=0.03,
      )
    catch error
      error
    end
    timeout_outcome = fetch(timeout_wait)
    @test timeout_outcome isa WebQuantumSavory.APIError
    @test timeout_outcome.error_code == "OPERATION_CANCELLED"
    @test timeout_outcome.status_code == 409
    @test timeout_outcome.details["retryable"] == true
    @test lock(timeout_hub.lock) do
      isempty(timeout_hub.pending) && isempty(timeout_hub.command_queue)
    end

    saturated_hub = WebQuantumSavory.CollaborationHub()
    WebQuantumSavory.bind_editor!(saturated_hub, binding_request())
    waiters = Task[]
    for _ in 1:WebQuantumSavory.MCP_COMMAND_QUEUE_SIZE
      push!(
        waiters,
        @async try
          WebQuantumSavory.enqueue_browser_command!(
            saturated_hub,
            Dict("type" => "design_get");
            timeout_seconds=2,
          )
        catch error
          error
        end,
      )
    end
    @test timedwait(
      () -> lock(saturated_hub.lock) do
        length(saturated_hub.pending) ==
          WebQuantumSavory.MCP_COMMAND_QUEUE_SIZE &&
          length(saturated_hub.command_queue) ==
            WebQuantumSavory.MCP_COMMAND_QUEUE_SIZE
      end,
      1;
      pollint=0.01,
    ) == :ok
    overflow = try
      WebQuantumSavory.enqueue_browser_command!(
        saturated_hub,
        Dict("type" => "design_get");
        timeout_seconds=2,
      )
      nothing
    catch error
      error
    end
    @test overflow isa WebQuantumSavory.APIError
    @test overflow.error_code == "EDITOR_BUSY"
    @test overflow.status_code == 429
    @test overflow.details["retryable"] == true

    WebQuantumSavory.stop_collaboration!(saturated_hub)
    for waiter in waiters
      outcome = fetch(waiter)
      @test outcome isa WebQuantumSavory.APIError
      @test outcome.error_code == "OPERATION_CANCELLED"
      @test outcome.status_code == 409
      @test outcome.details["retryable"] == true
    end
    @test isempty(saturated_hub.pending)
    @test isempty(saturated_hub.command_queue)
  end

  @testset "browser long polls stop with their binding generation" begin
    for teardown in (:stop, :unbind, :replacement)
      hub = WebQuantumSavory.CollaborationHub()
      binding = WebQuantumSavory.bind_editor!(hub, binding_request())
      owner = Dict(
        "binding_id" => binding["binding_id"],
        "generation" => 1,
      )
      long_poll = @async WebQuantumSavory.next_browser_command!(
        hub,
        owner;
        timeout_seconds=2,
      )
      yield()

      if teardown == :stop
        WebQuantumSavory.stop_collaboration!(hub)
      elseif teardown == :unbind
        WebQuantumSavory.unbind_editor!(hub, owner)
      else
        WebQuantumSavory.bind_editor!(
          hub,
          binding_request(generation=2, hash="replacement"),
        )
      end
      @test timedwait(() -> istaskdone(long_poll), 1; pollint=0.01) == :ok
      @test fetch(long_poll) === nothing
    end
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
    @test rebound["revision"] == 1
  end

  @testset "revision acknowledgement and readback recovery" begin
    hub = WebQuantumSavory.CollaborationHub()
    @test :operation_commands ∉ fieldnames(typeof(hub))
    @test :operation_cache ∉ fieldnames(typeof(hub))
    @test :operation_cache_order ∉ fieldnames(typeof(hub))
    binding = WebQuantumSavory.bind_editor!(hub, binding_request())
    owner = Dict(
      "binding_id" => binding["binding_id"],
      "generation" => 1,
    )

    cancelled = @async try
      WebQuantumSavory.enqueue_browser_command!(
        hub,
        Dict("type" => "design_command");
        expected_revision=0,
        mutates_design=true,
        timeout_seconds=0.02,
      )
    catch error
      error
    end
    pre_delivery = fetch(cancelled)
    @test pre_delivery isa WebQuantumSavory.APIError
    @test pre_delivery.error_code == "OPERATION_CANCELLED"
    @test pre_delivery.details["retryable"] == true
    @test !haskey(pre_delivery.details, "readback_required")
    @test WebQuantumSavory.next_browser_command!(
      hub,
      owner;
      timeout_seconds=0.05,
    ) === nothing
    @test WebQuantumSavory.design_mirror(hub)["revision"] == 0

    for invalid_revision in (true, false, "0", -1, 0.0)
      invalid = try
        WebQuantumSavory.enqueue_browser_command!(
          hub,
          Dict("type" => "design_command");
          expected_revision=invalid_revision,
          mutates_design=true,
          timeout_seconds=0.02,
        )
        nothing
      catch error
        error
      end
      @test invalid isa WebQuantumSavory.APIError
      @test invalid.error_code == "VALIDATION_FAILED"
      @test invalid.details["field"] == "expected_revision"
      @test isempty(hub.pending)
    end

    waiting = @async WebQuantumSavory.enqueue_browser_command!(
      hub,
      Dict(
        "type" => "design_command",
        "tool" => "topology_edit",
        "arguments" => Dict(),
      );
      expected_revision=0,
      mutates_design=true,
      timeout_seconds=2,
    )
    command = WebQuantumSavory.next_browser_command!(hub, owner; timeout_seconds=1)
    @test command["base_revision"] == 0
    @test !haskey(command, "operation_id")

    WebQuantumSavory.commit_browser_command!(
      hub,
      Dict(
        owner...,
        "command_id" => command["command_id"],
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
    @test !haskey(result, "operation_id")
    @test WebQuantumSavory.design_mirror(hub)["hash"] == "updated-hash"

    reply_lost = @async try
      WebQuantumSavory.enqueue_browser_command!(
        hub,
        Dict("type" => "design_command");
        expected_revision=1,
        mutates_design=true,
        timeout_seconds=0.05,
      )
    catch error
      error
    end
    uncertain_command = WebQuantumSavory.next_browser_command!(
      hub,
      owner;
      timeout_seconds=1,
    )
    uncertain = fetch(reply_lost)
    @test uncertain isa WebQuantumSavory.APIError
    @test uncertain.error_code == "OUTCOME_UNKNOWN"
    @test uncertain.details["retryable"] == false
    @test uncertain.details["readback_required"] == true
    @test uncertain.details["readback_tool"] == "design_get"
    WebQuantumSavory.commit_browser_command!(
      hub,
      Dict(
        owner...,
        "command_id" => uncertain_command["command_id"],
        "base_revision" => 1,
        "success" => true,
        "document_changed" => true,
        "snapshot" => Dict("name" => "Project", "net" => Dict("nodes" => ["node-1"])),
        "hash" => "reply-lost-hash",
        "result" => Dict("summary" => "Applied once"),
      ),
    )
    readback = WebQuantumSavory.design_mirror(hub)
    @test readback["revision"] == 2
    @test readback["hash"] == "reply-lost-hash"
    @test WebQuantumSavory.collaboration_status(hub)["pending_commands"] == 0

    conflict = try
      WebQuantumSavory.enqueue_browser_command!(
        hub,
        Dict("type" => "design_command");
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

    WebQuantumSavory.unbind_editor!(hub, owner)
    rebound = WebQuantumSavory.bind_editor!(
      hub,
      binding_request(generation=2, hash="rebound-hash"),
    )
    rebound_readback = WebQuantumSavory.design_mirror(hub)
    @test rebound["revision"] == 3
    @test rebound_readback["revision"] == 3
    @test rebound_readback["hash"] == "rebound-hash"

    delayed = try
      WebQuantumSavory.enqueue_browser_command!(
        hub,
        Dict("type" => "design_command");
        expected_revision=2,
        mutates_design=true,
        timeout_seconds=0.01,
      )
      nothing
    catch error
      error
    end
    @test delayed isa WebQuantumSavory.APIError
    @test delayed.error_code == "REVISION_CONFLICT"
    @test delayed.details["current_revision"] == 3
    @test isempty(hub.pending)

    fresh = @async WebQuantumSavory.enqueue_browser_command!(
      hub,
      Dict("type" => "design_command");
      expected_revision=3,
      mutates_design=true,
      timeout_seconds=2,
    )
    fresh_command = WebQuantumSavory.next_browser_command!(
      hub,
      Dict(
        "binding_id" => rebound["binding_id"],
        "generation" => 2,
      );
      timeout_seconds=1,
    )
    @test fresh_command["base_revision"] == 3
    WebQuantumSavory.commit_browser_command!(
      hub,
      Dict(
        "binding_id" => rebound["binding_id"],
        "generation" => 2,
        "command_id" => fresh_command["command_id"],
        "base_revision" => 3,
        "success" => true,
        "document_changed" => true,
        "snapshot" => Dict("name" => "Project", "net" => Dict("nodes" => ["fresh"])),
        "hash" => "fresh-hash",
        "result" => Dict("summary" => "Applied fresh work"),
      ),
    )
    @test fetch(fresh)["revision"] == 4

    restarted = WebQuantumSavory.CollaborationHub()
    WebQuantumSavory.bind_editor!(
      restarted,
      binding_request(generation=3, hash="restart-hash"),
    )
    restart_readback = WebQuantumSavory.design_mirror(restarted)
    @test restart_readback["revision"] == 0
    @test restart_readback["hash"] == "restart-hash"
  end

  @testset "lifecycle uncertainty blocks stale status and duplicate actions" begin
    hub = WebQuantumSavory.CollaborationHub()
    binding = WebQuantumSavory.bind_editor!(hub, binding_request())
    owner = Dict(
      "binding_id" => binding["binding_id"],
      "generation" => 1,
    )
    service = WebQuantumSavory.SimulationService(
      Dict("user_Project" => WebQuantumSavory.State(name="user_Project")),
    )

    function delivered_timeout(action)
      waiting = @async try
        WebQuantumSavory.enqueue_browser_command!(
          hub,
          Dict("type" => "simulation_action", "action" => action);
          timeout_seconds=0.03,
        )
      catch error
        error
      end
      command = WebQuantumSavory.next_browser_command!(
        hub,
        owner;
        timeout_seconds=1,
      )
      outcome = fetch(waiting)
      @test outcome isa WebQuantumSavory.APIError
      @test outcome.error_code == "OUTCOME_UNKNOWN"
      @test outcome.details["retryable"] == false
      @test outcome.details["readback_required"] == true
      @test outcome.details["readback_tool"] == "simulation_status"
      return command
    end

    command = delivered_timeout("pause")
    @test length(hub.pending) == 1

    duplicate = try
      WebQuantumSavory.dispatch_mcp_tool!(
        "simulation_resume",
        Dict{String,Any}();
        hub,
        simulation_service=service,
      )
      nothing
    catch error
      error
    end
    @test duplicate isa WebQuantumSavory.APIError
    @test duplicate.error_code == "OPERATION_PENDING"
    @test duplicate.details["retryable"] == true
    @test duplicate.details["readback_required"] == true
    @test duplicate.details["readback_tool"] == "simulation_status"
    @test length(hub.pending) == 1
    @test WebQuantumSavory.next_browser_command!(
      hub,
      owner;
      timeout_seconds=0.03,
    ) === nothing

    for read_status in (
      () -> WebQuantumSavory.dispatch_mcp_tool!(
        "simulation_status",
        Dict{String,Any}();
        hub,
        simulation_service=service,
      ),
      () -> WebQuantumSavory.read_mcp_resource(
        "wqs://simulation/state";
        hub,
        simulation_service=service,
      ),
    )
      pending_status = try
        read_status()
        nothing
      catch error
        error
      end
      @test pending_status isa WebQuantumSavory.APIError
      @test pending_status.error_code == "OPERATION_PENDING"
      @test pending_status.details["retryable"] == true
      @test pending_status.details["readback_required"] == true
      @test pending_status.details["readback_tool"] == "simulation_status"
    end

    WebQuantumSavory.commit_browser_command!(
      hub,
      Dict(
        owner...,
        "command_id" => command["command_id"],
        "base_revision" => command["base_revision"],
        "success" => true,
        "document_changed" => false,
        "result" => Dict("summary" => "Late pause acknowledgement"),
      ),
    )
    @test isempty(hub.pending)
    status = WebQuantumSavory.dispatch_mcp_tool!(
      "simulation_status",
      Dict{String,Any}();
      hub,
      simulation_service=service,
    )
    @test status["phase"] == "unknown"

    rejected_command = delivered_timeout("reset")
    WebQuantumSavory.commit_browser_command!(
      hub,
      Dict(
        owner...,
        "command_id" => rejected_command["command_id"],
        "base_revision" => rejected_command["base_revision"],
        "success" => false,
        "error" => Dict(
          "code" => "VALIDATION_FAILED",
          "message" => "Late lifecycle rejection",
        ),
      ),
    )
    @test isempty(hub.pending)
    @test WebQuantumSavory.dispatch_mcp_tool!(
      "simulation_status",
      Dict{String,Any}();
      hub,
      simulation_service=service,
    )["phase"] == "unknown"

    fresh = @async try
      WebQuantumSavory.enqueue_browser_command!(
        hub,
        Dict("type" => "simulation_action", "action" => "resume");
        timeout_seconds=2,
      )
    catch error
      error
    end
    fresh_command = WebQuantumSavory.next_browser_command!(
      hub,
      owner;
      timeout_seconds=1,
    )
    @test fresh_command["payload"]["action"] == "resume"
    WebQuantumSavory.commit_browser_command!(
      hub,
      Dict(
        owner...,
        "command_id" => fresh_command["command_id"],
        "base_revision" => fresh_command["base_revision"],
        "success" => false,
        "error" => Dict(
          "code" => "VALIDATION_FAILED",
          "message" => "Expected fresh rejection",
        ),
      ),
    )
    @test fetch(fresh).error_code == "VALIDATION_FAILED"
  end

  @testset "lifecycle teardown clears the quiescence barrier" begin
    for teardown in (:unbind, :lease_expiry)
      now = Ref(DateTime(2026, 7, 18))
      hub = WebQuantumSavory.CollaborationHub(clock=() -> now[])
      binding = WebQuantumSavory.bind_editor!(hub, binding_request())
      owner = Dict(
        "binding_id" => binding["binding_id"],
        "generation" => 1,
      )
      waiting = @async try
        WebQuantumSavory.enqueue_browser_command!(
          hub,
          Dict("type" => "simulation_action", "action" => "pause");
          timeout_seconds=0.03,
        )
      catch error
        error
      end
      WebQuantumSavory.next_browser_command!(
        hub,
        owner;
        timeout_seconds=1,
      )
      @test fetch(waiting).error_code == "OUTCOME_UNKNOWN"
      @test length(hub.pending) == 1

      if teardown == :unbind
        @test WebQuantumSavory.unbind_editor!(hub, owner)["success"]
      else
        now[] += Second(WebQuantumSavory.MCP_EDITOR_LEASE_SECONDS + 1)
        @test WebQuantumSavory.expire_editor_lease!(hub)
      end
      @test isempty(hub.pending)

      rebound = WebQuantumSavory.bind_editor!(
        hub,
        binding_request(generation=2, hash=string(teardown)),
      )
      rebound_owner = Dict(
        "binding_id" => rebound["binding_id"],
        "generation" => 2,
      )
      service = WebQuantumSavory.SimulationService(
        Dict("user_Project" => WebQuantumSavory.State(name="user_Project")),
      )
      @test WebQuantumSavory.dispatch_mcp_tool!(
        "simulation_status",
        Dict{String,Any}();
        hub,
        simulation_service=service,
      )["phase"] == "unknown"
      @test WebQuantumSavory.next_browser_command!(
        hub,
        rebound_owner;
        timeout_seconds=0.03,
      ) === nothing
    end
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

    for reported_revision in (nothing, false, 1)
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

    boolean_revision = try
      WebQuantumSavory.commit_gui_snapshot!(
        hub,
        Dict(
          owner...,
          "origin" => "gui",
          "base_revision" => 1,
          "document_changed" => false,
          "result" => Dict(
            "kind" => "simulation_prepared",
            "prepared_revision" => true,
          ),
        ),
      )
      nothing
    catch error
      error
    end
    @test boolean_revision isa WebQuantumSavory.APIError
    @test boolean_revision.error_code == "VALIDATION_FAILED"
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
    @test undelivered_outcome.details["retryable"] == true
    @test !haskey(undelivered_outcome.details, "readback_required")
    @test isempty(undelivered.hub.pending)
    @test WebQuantumSavory.collaboration_status(
      undelivered.hub,
    )["binding"]["desynchronized"]

    delivered = start_pending_command(deliver=true)
    mismatch_error = try
      WebQuantumSavory.commit_browser_command!(
        delivered.hub,
        Dict{String,Any}(
          delivered.owner...,
          "command_id" => delivered.command["command_id"],
          "base_revision" => 1,
          "success" => false,
        ),
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
    @test delivered_outcome.details["retryable"] == false
    @test delivered_outcome.details["readback_required"] == true
    @test delivered_outcome.details["readback_tool"] == "design_get"
    @test isempty(delivered.hub.pending)
    @test WebQuantumSavory.collaboration_status(
      delivered.hub,
    )["binding"]["desynchronized"]
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

  @testset "result resources round-trip opaque identifiers" begin
    identifiers = (
      "simple",
      "x/y",
      "x%2Fy",
      "percent%",
      "query?",
      "fragment#",
      "plus+",
      "unicode-λ",
    )
    for identifier in identifiers
      encoded = WebQuantumSavory._encode_mcp_resource_segment(identifier)
      parsed = WebQuantumSavory._parse_mcp_result_resource_uri(
        "wqs://simulation/slots/$encoded/html",
      )
      @test parsed == (
        kind="slots",
        identifier,
        format="html",
        mime_type="text/html",
      )
    end
    @test WebQuantumSavory._encode_mcp_resource_segment("x/y") == "x%2Fy"
    @test WebQuantumSavory._encode_mcp_resource_segment("x%2Fy") == "x%252Fy"

    malformed_uris = (
      "wqs://simulation/slots//html",
      "wqs://simulation/slots/%/html",
      "wqs://simulation/slots/%2/html",
      "wqs://simulation/slots/%GG/html",
      "wqs://simulation/slots/%FF/html",
      "wqs://simulation/slots/raw+plus/html",
      "wqs://simulation/slots/raw?query/html",
      "wqs://simulation/slots/raw#fragment/html",
      "wqs://simulation/slots/extra/path/html",
      "wqs://simulation/slots/id/jpeg",
      "wqs://simulation/slots/id/html/extra",
    )
    for uri in malformed_uris
      error = try
        WebQuantumSavory._parse_mcp_result_resource_uri(uri)
        nothing
      catch caught
        caught
      end
      @test error isa WebQuantumSavory.APIError
      @test error.error_code == "VALIDATION_FAILED"
    end

    png_bytes = vcat(
      WebQuantumSavory.MCP_RESOURCE_PNG_SIGNATURE,
      UInt8[0x01],
    )
    valid = Dict{String,Any}(
      "html_base64" => WebQuantumSavory.base64encode("<p>ok</p>"),
      "png_base64" => WebQuantumSavory.base64encode(png_bytes),
    )
    summary = WebQuantumSavory._result_with_resource_links(
      valid,
      "slots",
      "x/y",
    )
    @test summary["resources"] == Dict(
      "html" => "wqs://simulation/slots/x%2Fy/html",
      "png" => "wqs://simulation/slots/x%2Fy/png",
    )
    for (key, value, expected_code) in (
      ("html_base64", nothing, "RESULT_NOT_FOUND"),
      ("html_base64", "", "RESULT_NOT_FOUND"),
      ("html_base64", "%%%", "VALIDATION_FAILED"),
      (
        "html_base64",
        WebQuantumSavory.base64encode(UInt8[0xff]),
        "VALIDATION_FAILED",
      ),
      (
        "png_base64",
        WebQuantumSavory.base64encode("not a png"),
        "VALIDATION_FAILED",
      ),
    )
      invalid = copy(valid)
      invalid[key] = value
      error = try
        WebQuantumSavory._result_with_resource_links(
          invalid,
          "slots",
          "slot",
        )
        nothing
      catch caught
        caught
      end
      @test error isa WebQuantumSavory.APIError
      @test error.error_code == expected_code
    end

    opaque_id = "result /?#%+λ%2F"
    state = WebQuantumSavory.State(
      name="user_Project",
      slot_mapping=Dict{String,Any}(opaque_id => MCPTestSlot()),
      protocol_mapping=Dict{String,Any}(
        opaque_id => MCPTestRepresentation(),
      ),
    )
    service = WebQuantumSavory.SimulationService(
      Dict("user_Project" => state),
    )
    hub = WebQuantumSavory.CollaborationHub()
    WebQuantumSavory.bind_editor!(hub, binding_request())
    for (tool, argument, kind) in (
      ("simulation_slot_result", "slot_id", "slots"),
      ("simulation_protocol_result", "protocol_id", "protocols"),
    )
      result = WebQuantumSavory.dispatch_mcp_tool!(
        tool,
        Dict{String,Any}(argument => opaque_id);
        hub,
        simulation_service=service,
      )
      @test !haskey(result, "html_base64")
      @test !haskey(result, "png_base64")
      encoded_id = WebQuantumSavory._encode_mcp_resource_segment(opaque_id)
      @test result["resources"]["html"] ==
        "wqs://simulation/$kind/$encoded_id/html"
      @test result["resources"]["png"] ==
        "wqs://simulation/$kind/$encoded_id/png"

      html = WebQuantumSavory.read_mcp_resource(
        result["resources"]["html"];
        hub,
        simulation_service=service,
      )
      @test html["mime_type"] == "text/html"
      @test !isempty(String(WebQuantumSavory.base64decode(html["base64"])))
      png = WebQuantumSavory.read_mcp_resource(
        result["resources"]["png"];
        hub,
        simulation_service=service,
      )
      @test png["mime_type"] == "image/png"
      decoded_png = WebQuantumSavory.base64decode(png["base64"])
      @test decoded_png[1:length(WebQuantumSavory.MCP_RESOURCE_PNG_SIGNATURE)] ==
        WebQuantumSavory.MCP_RESOURCE_PNG_SIGNATURE
    end

    delete!(state.protocol_mapping, opaque_id)
    missing = try
      WebQuantumSavory.read_mcp_resource(
        "wqs://simulation/protocols/" *
          WebQuantumSavory._encode_mcp_resource_segment(opaque_id) *
          "/html";
        hub,
        simulation_service=service,
      )
      nothing
    catch error
      error
    end
    @test missing isa WebQuantumSavory.APIError
    @test missing.error_code == "RESULT_NOT_FOUND"
  end

  @testset "authoring revision metadata stops at the hub boundary" begin
    hub = WebQuantumSavory.CollaborationHub()
    binding = WebQuantumSavory.bind_editor!(hub, binding_request())
    owner = Dict(
      "binding_id" => binding["binding_id"],
      "generation" => 1,
    )
    waiting = @async try
      WebQuantumSavory.dispatch_mcp_tool!(
        "topology_edit",
        Dict{String,Any}(
          "expected_revision" => binding["revision"],
          "actions" => Any[],
        );
        hub,
      )
    catch error
      error
    end
    command = WebQuantumSavory.next_browser_command!(
      hub,
      owner;
      timeout_seconds=1,
    )
    arguments = command["payload"]["arguments"]
    @test arguments == Dict{String,Any}("actions" => Any[])
    @test !haskey(arguments, "expected_revision")
    WebQuantumSavory.commit_browser_command!(
      hub,
      Dict(
        owner...,
        "command_id" => command["command_id"],
        "base_revision" => binding["revision"],
        "success" => false,
        "error" => Dict(
          "code" => "VALIDATION_FAILED",
          "message" => "Expected test rejection.",
        ),
      ),
    )
    @test fetch(waiting).error_code == "VALIDATION_FAILED"
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
