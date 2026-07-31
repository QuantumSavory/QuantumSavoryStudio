@safetestset "Integration Tests" begin
  using HTTP
  using JSON
  using QuantumSavory
  using Test

  include("../src/WebQuantumSavory.jl")
  using .WebQuantumSavory

  # Test server configuration
  TEST_BASE_URL = get(
    ENV,
    "WEBQUANTUMSAVORY_TEST_BASE_URL",
    "http://localhost:8000",
  )
  TEST_SIMULATION_NAME = "test_integration_sim"

  # Check if server is available
  function is_server_available()
    try
      # Avoid exceptions on non-200 and rely on status code
      response = HTTP.get("$TEST_BASE_URL/status"; status_exception=false)
      return response.status == 200
    catch
      return false
    end
  end

  # Fail fast if server is not available
  if !is_server_available()
    @error "Server not available at $TEST_BASE_URL. Integration tests require a running server."
    @test false
    return
  end

  # Load test data - use payload3.json
  test_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))

  # Helper function to make HTTP requests
  function make_request(method, endpoint; body=nothing, query=nothing)
    url = "$TEST_BASE_URL$endpoint"
    headers = ["Content-Type" => "application/json"]

    if query !== nothing
      query_str = HTTP.escapeuri(query)
      url = "$url?$query_str"
    end

    if method == "GET"
      response = HTTP.get(url, headers; status_exception=false)
    elseif method == "POST"
      if body !== nothing
        response = HTTP.post(url, headers, JSON.json(body); status_exception=false)
      else
        response = HTTP.post(url, headers; status_exception=false)
      end
    elseif method == "DELETE"
      response = HTTP.delete(url, headers; status_exception=false)
    else
      error("Unsupported HTTP method: $method")
    end

    return response
  end

  # Helper function to parse JSON response
  function parse_response(response)
    try
      return JSON.parse(String(response.body))
    catch e
      return Dict("error" => "Failed to parse response", "status" => response.status, "parse_error" => string(e))
    end
  end

  function wait_for_state(predicate, simulation_name; timeout=15.0, poll_interval=0.05)
    deadline = time() + timeout
    last_state = nothing

    while time() < deadline
      response = make_request("GET", "/get_state", query=Dict("name" => simulation_name))
      if response.status == 200
        data = parse_response(response)
        last_state = data["state"]
        predicate(last_state) && return last_state
      end
      sleep(poll_interval)
    end

    error("Timed out waiting for simulation $simulation_name; last state: $last_state")
  end

  platform_info_response = make_request("GET", "/platform_info")
  platform_info = parse_response(platform_info_response)
  unsafe_evaluation_enabled = get(
    get(platform_info, "capabilities", Dict{String,Any}()),
    "unsafe_code_evaluation",
    false,
  )

  @testset "Server Status" begin
      response = make_request("GET", "/status")
      @test response.status == 200
      data = parse_response(response)
      @test data["status"] == "OK"
  end

  @testset "Root Endpoint" begin
      response = make_request("GET", "/")
      @test response.status == 200
      body = String(response.body)
      # Root now serves the app UI (public/index.html). Check for HTML markers.
      @test contains(lowercase(body), "<!doctype") || contains(lowercase(body), "<html") || contains(lowercase(body), "<head")
  end

  @testset "Platform Info" begin
      @test platform_info_response.status == 200
      @test haskey(platform_info, "versions")
      @test haskey(platform_info, "quantumsavory")
      @test haskey(platform_info, "capabilities")
      versions = platform_info["versions"]
      @test all(haskey(versions, key) for key in ("julia", "genie", "quantumsavory", "app"))
      @test all(versions[key] isa String && !isempty(versions[key]) for key in (
        "julia",
        "genie",
        "quantumsavory",
        "app",
      ))

      quantumsavory = platform_info["quantumsavory"]
      @test quantumsavory["version"] == versions["quantumsavory"]
      @test quantumsavory["tracked_revision"] isa String
      @test !isempty(quantumsavory["tracked_revision"])
      @test quantumsavory["tracked_source"] isa String
      @test !isempty(quantumsavory["tracked_source"])
      @test quantumsavory["tree_hash"] isa String
      @test !isempty(quantumsavory["tree_hash"])
      revision = quantumsavory["tracked_revision"]
      if occursin(r"^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$", revision)
        @test quantumsavory["commit"] == lowercase(revision)
      else
        @test quantumsavory["commit"] === nothing
      end
      @test unsafe_evaluation_enabled isa Bool
      @test platform_info["capabilities"]["mcp"] == Dict(
        "available" => false,
        "local_only" => true,
        "start_mode" => "manual",
      )
      @test make_request("GET", "/_mcp/status").status == 404
  end

  @testset "Background Types Endpoint" begin
      response = make_request("GET", "/background_types")
      @test response.status == 200
      data = parse_response(response)
      @test haskey(data, "background_types")
      @test isa(data["background_types"], Vector)
      @test !isempty(data["background_types"])
      @test all(haskey(bt, "type") for bt in data["background_types"])
      @test all(haskey(bt, "doc") for bt in data["background_types"])
      @test all(haskey(bt, "parameters") for bt in data["background_types"])
      parameters = [parameter for bt in data["background_types"] for parameter in bt["parameters"]]
      @test !isempty(parameters)
      @test all(haskey(parameter, "field") for parameter in parameters)
      @test all(haskey(parameter, "type") for parameter in parameters)
      @test all(
        parameter["type"] isa String || (
          parameter["type"] isa Vector &&
          all(member -> member isa String, parameter["type"])
        )
        for parameter in parameters
      )
  end

  @testset "Slot Types Endpoint" begin
      response = make_request("GET", "/slot_types")
      @test response.status == 200
      data = parse_response(response)
      @test haskey(data, "slot_types")
      @test isa(data["slot_types"], Vector)
      @test !isempty(data["slot_types"])
      @test all(haskey(st, "type") for st in data["slot_types"])
      @test all(haskey(st, "doc") for st in data["slot_types"])
  end

  @testset "Known Functions Endpoint" begin
      response = make_request("GET", "/known_functions")
      @test response.status == 200
      data = parse_response(response)
      @test haskey(data, "known_functions")
      @test data["known_functions"] == WebQuantumSavory.known_functions()
  end

  @testset "Export Script Endpoint" begin
      export_payload = Dict(
        "name" => "Integration Export",
        "variables" => Any[],
        "simulationConfig" => Dict(
          "time" => 1.5,
          "timeStep" => 0.25,
          "qubitRepresentation" => "CliffordRepr",
          "qumodeRepresentation" => "GabsRepr",
        ),
        "net" => Dict(
          "nodes" => [
            Dict(
              "id" => "left-node",
              "name" => "Left",
              "position" => [0.0, 0.0],
              "data" => Dict(
                "slots" => [Dict("id" => "left-slot", "type" => "Qubit", "backgroundNoise" => nothing)],
                "protocols" => Any[],
              ),
            ),
            Dict(
              "id" => "right-node",
              "name" => "Right",
              "position" => [1.0, 1.0],
              "data" => Dict(
                "slots" => [Dict("id" => "right-slot", "type" => "Qubit", "backgroundNoise" => nothing)],
                "protocols" => Any[],
              ),
            ),
          ],
          "edges" => [
            Dict(
              "id" => "connection",
              "source" => "left-node",
              "target" => "right-node",
              "data" => Dict("protocols" => Any[]),
            ),
          ],
          "protocols" => Any[],
        ),
      )

      response = make_request("POST", "/export_script"; body=export_payload)
      @test response.status == 200
      data = parse_response(response)
      @test data["success"] == true
      @test data["filename"] == "integration-export.jl"
      @test occursin("simulation_duration = 1.5", data["script"])
      @test occursin("CliffordRepr()", data["script"])
      @test occursin("add_edge!(graph, 1, 2)", data["script"])
      @test occursin("record(", data["script"])
      @test occursin("MIME\"image/png\"", data["script"])

      simulations_response = make_request("GET", "/simulations")
      simulations = parse_response(simulations_response)["simulations"]
      @test all(simulation["name"] != "Integration Export" for simulation in simulations)

      invalid_payload = deepcopy(export_payload)
      invalid_payload["simulationConfig"]["timeStep"] = 0
      invalid_response = make_request("POST", "/export_script"; body=invalid_payload)
      @test invalid_response.status == 400
      invalid_data = parse_response(invalid_response)
      @test invalid_data["error"]["code"] == "VALIDATION_ERROR"
      @test occursin("positive finite", invalid_data["error"]["message"])

      incompatible_payload = deepcopy(export_payload)
      incompatible_payload["simulationConfig"]["qubitRepresentation"] = "GabsRepr"
      incompatible_response =
        make_request("POST", "/export_script"; body=incompatible_payload)
      @test incompatible_response.status == 400
      incompatible_data = parse_response(incompatible_response)
      @test incompatible_data["error"]["code"] == "VALIDATION_ERROR"
      @test occursin("does not support Qubit slots", incompatible_data["error"]["message"])
  end

  @testset "Protocol Types Endpoint" begin
      response = make_request("GET", "/protocol_types")
      @test response.status == 200
      data = parse_response(response)
      @test haskey(data, "protocol_types")
      @test isa(data["protocol_types"], Vector)
      @test !isempty(data["protocol_types"])
      @test all(haskey(pt, "type") for pt in data["protocol_types"])
      @test all(haskey(pt, "doc") for pt in data["protocol_types"])
      @test all(haskey(pt, "group") for pt in data["protocol_types"])
      @test all(haskey(pt, "parameters") for pt in data["protocol_types"])
      @test all(haskey(pt, "virtual") for pt in data["protocol_types"])
      @test all(pt["group"] in ["node", "edge", "floating"] for pt in data["protocol_types"])

      protocol_types_by_name = Dict(pt["type"] => pt for pt in data["protocol_types"])
      virtual_protocol = protocol_types_by_name[string(QuantumSavory.ProtocolZoo.EntanglementConsumer)]
      physical_protocols = [
        protocol_types_by_name[string(QuantumSavory.ProtocolZoo.EntanglerProt)],
        protocol_types_by_name[string(QuantumSavory.ProtocolZoo.LinkController)],
      ]

      @test virtual_protocol["group"] == "edge"
      @test virtual_protocol["virtual"] === true
      @test all(pt["group"] == "edge" for pt in physical_protocols)
      @test all(pt["virtual"] === false for pt in physical_protocols)

      entangler_tag = only(filter(
        parameter -> parameter["field"] == "tag",
        protocol_types_by_name[string(QuantumSavory.ProtocolZoo.EntanglerProt)]["parameters"],
      ))
      @test entangler_tag["type"] == ["Nothing", "Type{<:AbstractTag}"]
      @test entangler_tag["kind"] == "named_tag_type"
      @test entangler_tag["nullable"] === true

      consumer_tag = only(filter(
        parameter -> parameter["field"] == "tag",
        virtual_protocol["parameters"],
      ))
      @test consumer_tag["type"] == "Type{<:AbstractTag}"
      @test consumer_tag["kind"] == "named_tag_type"
      @test consumer_tag["nullable"] === false
  end

  @testset "Named AbstractTag Protocol Boundaries" begin
      counterpart_id = "QuantumSavory.ProtocolZoo.EntanglementCounterpart"

      function tagged_protocol_payload(
        name;
        entangler_tag=counterpart_id,
        consumer_tag=counterpart_id,
        client_type="Float64",
      )
        payload = deepcopy(test_payload)
        payload["name"] = name
        payload["variables"] = Any[]
        payload["simulationConfig"] = Dict("time" => 0.01, "timeStep" => 0.01)
        protocols = payload["net"]["edges"][1]["data"]["protocols"]
        entangler = only(filter(
          protocol -> protocol["type"] == string(QuantumSavory.ProtocolZoo.EntanglerProt),
          protocols,
        ))
        consumer = only(filter(
          protocol -> protocol["type"] == string(QuantumSavory.ProtocolZoo.EntanglementConsumer),
          protocols,
        ))
        entangler_parameter = only(filter(
          parameter -> parameter["name"] == "tag",
          entangler["parameters"],
        ))
        consumer_parameter = only(filter(
          parameter -> parameter["name"] == "tag",
          consumer["parameters"],
        ))
        # Deliberately stale/forged snapshots: authoritative constructor
        # metadata must identify the semantic field on the running server.
        entangler_parameter["type"] = client_type
        entangler_parameter["value"] = entangler_tag
        consumer_parameter["type"] = client_type
        consumer_parameter["value"] = consumer_tag
        return payload
      end

      valid_cases = [
        (
          "named-tag-http-valid",
          tagged_protocol_payload("named-tag-http-valid"),
        ),
        (
          "named-tag-http-entangler-nothing",
          tagged_protocol_payload(
            "named-tag-http-entangler-nothing";
            entangler_tag="nothing",
          ),
        ),
      ]
      for (simulation_name, payload) in valid_cases
        try
          parse_response_http = make_request("POST", "/parse_network_graph"; body=payload)
          @test parse_response_http.status == 200
          prepare_response = make_request(
            "POST",
            "/prepare_simulation";
            body=Dict("name" => simulation_name),
          )
          @test prepare_response.status == 200
          prepare_data = parse_response(prepare_response)
          @test prepare_data["status"] == WebQuantumSavory.STATUS_PREPARED
          @test get(prepare_data, "error_code", nothing) != "UNSAFE_EVALUATION_DISABLED"
        finally
          make_request(
            "POST",
            "/destroy_simulation";
            body=Dict("name" => simulation_name),
          )
        end
      end

      invalid_cases = [
        (
          "named-tag-http-consumer-nothing",
          tagged_protocol_payload(
            "named-tag-http-consumer-nothing";
            consumer_tag="nothing",
          ),
        ),
        (
          "named-tag-http-short",
          tagged_protocol_payload(
            "named-tag-http-short";
            entangler_tag="EntanglementCounterpart",
          ),
        ),
        (
          "named-tag-http-unknown",
          tagged_protocol_payload(
            "named-tag-http-unknown";
            entangler_tag="Main.UnknownTag",
          ),
        ),
        (
          "named-tag-http-general-datatype",
          tagged_protocol_payload(
            "named-tag-http-general-datatype";
            entangler_tag="Core.Int64",
          ),
        ),
      ]
      for (simulation_name, payload) in invalid_cases
        try
          parse_response_http = make_request("POST", "/parse_network_graph"; body=payload)
          @test parse_response_http.status == 200
          prepare_response = make_request(
            "POST",
            "/prepare_simulation";
            body=Dict("name" => simulation_name),
          )
          @test prepare_response.status == 400
          prepare_data = parse_response(prepare_response)
          @test prepare_data["error"]["code"] == "VALIDATION_ERROR"
        finally
          make_request(
            "POST",
            "/destroy_simulation";
            body=Dict("name" => simulation_name),
          )
        end
      end

      simulations_before = make_request("GET", "/simulations")
      names_before = Set(
        simulation["name"]
        for simulation in parse_response(simulations_before)["simulations"]
      )
      export_payload = tagged_protocol_payload("named-tag-http-export")
      export_response_one = make_request("POST", "/export_script"; body=export_payload)
      export_response_two = make_request("POST", "/export_script"; body=export_payload)
      @test export_response_one.status == 200
      @test export_response_two.status == 200
      export_one = parse_response(export_response_one)
      export_two = parse_response(export_response_two)
      @test export_one["script"] == export_two["script"]
      @test length(findall("tag = EntanglementCounterpart", export_one["script"])) == 2
      @test Meta.parseall(export_one["script"]) isa Expr

      nothing_export_payload = tagged_protocol_payload(
        "named-tag-http-export-nothing";
        entangler_tag="nothing",
      )
      nothing_export_response = make_request(
        "POST",
        "/export_script";
        body=nothing_export_payload,
      )
      @test nothing_export_response.status == 200
      @test occursin("tag = nothing", parse_response(nothing_export_response)["script"])

      invalid_export_payloads = [
        tagged_protocol_payload(
          "named-tag-http-export-consumer-nothing";
          consumer_tag="nothing",
        ),
        tagged_protocol_payload(
          "named-tag-http-export-short";
          entangler_tag="EntanglementCounterpart",
        ),
        tagged_protocol_payload(
          "named-tag-http-export-unknown";
          entangler_tag="Main.UnknownTag",
        ),
        tagged_protocol_payload(
          "named-tag-http-export-general-datatype";
          entangler_tag="Core.Int64",
        ),
      ]
      for invalid_payload in invalid_export_payloads
        invalid_response = make_request("POST", "/export_script"; body=invalid_payload)
        @test invalid_response.status == 400
        invalid_data = parse_response(invalid_response)
        @test invalid_data["error"]["code"] == "VALIDATION_ERROR"
      end

      simulations_after = make_request("GET", "/simulations")
      names_after = Set(
        simulation["name"]
        for simulation in parse_response(simulations_after)["simulations"]
      )
      @test names_after == names_before
  end

  @testset "States Zoo Endpoints" begin
      types_response = make_request("GET", "/states_zoo_types")
      @test types_response.status == 200
      types_data = parse_response(types_response)
      @test haskey(types_data, "states_zoo_types")
      @test [entry["id"] for entry in types_data["states_zoo_types"]] == [
        "BarrettKokBellPair",
        "BarrettKokBellPairW",
        "DepolarizedBellPair",
        "GenqoMultiplexedCascadedBellPairW",
        "GenqoUnheraldedSPDCBellPairW",
      ]
      @test all(haskey(entry, "display_name") for entry in types_data["states_zoo_types"])
      @test [entry["display_name"] for entry in types_data["states_zoo_types"]] == [
        "Barrett-Kok Bell Pair",
        "Barrett-Kok Bell Pair (weighted)",
        "Depolarized Bell Pair",
        "Genqo Multiplexed Cascaded Bell Pair (weighted)",
        "Genqo Unheralded SPDC Bell Pair (weighted)",
      ]
      @test [entry["weighted"] for entry in types_data["states_zoo_types"]] ==
        [false, true, false, true, true]
      @test all(haskey(entry, "parameters") for entry in types_data["states_zoo_types"])

      depolarized = only(filter(
        entry -> entry["id"] == "DepolarizedBellPair",
        types_data["states_zoo_types"],
      ))
      @test depolarized["parameters"] == [Dict(
        "name" => "p",
        "min" => 0,
        "max" => 1,
        "good" => 1,
      )]

      preview_response = make_request(
        "POST",
        "/states_zoo_preview";
        body=Dict(
          "state_type" => "DepolarizedBellPair",
          "parameters" => Dict("p" => 0.8),
        ),
      )
      @test preview_response.status == 200
      preview_data = parse_response(preview_response)
      @test preview_data["success"] == true
      @test haskey(preview_data, "png_base64")
      @test preview_data["trace"] ≈ 1
      png = WebQuantumSavory.base64decode(preview_data["png_base64"])
      @test length(png) > 8
      @test png[1:8] == UInt8[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

      weighted_preview_response = make_request(
        "POST",
        "/states_zoo_preview";
        body=Dict(
          "state_type" => "BarrettKokBellPairW",
          "parameters" => Dict("ηᴬ" => 1, "ηᴮ" => 1, "Pᵈ" => 0, "ηᵈ" => 1, "𝒱" => 1),
        ),
      )
      @test weighted_preview_response.status == 200
      weighted_preview_data = parse_response(weighted_preview_response)
      @test weighted_preview_data["trace"] ≈ 0.5

      zero_trace_response = make_request(
        "POST",
        "/states_zoo_preview";
        body=Dict(
          "state_type" => "BarrettKokBellPairW",
          "parameters" => Dict("ηᴬ" => 0, "ηᴮ" => 0, "Pᵈ" => 0, "ηᵈ" => 1, "𝒱" => 1),
        ),
      )
      @test zero_trace_response.status == 400
      zero_trace_data = parse_response(zero_trace_response)
      @test zero_trace_data["error"]["code"] == "VALIDATION_ERROR"
      @test occursin("finite, positive", zero_trace_data["error"]["message"])

      unknown_response = make_request(
        "POST",
        "/states_zoo_preview";
        body=Dict("state_type" => "NotAState", "parameters" => Dict()),
      )
      @test unknown_response.status == 400
      unknown_data = parse_response(unknown_response)
      @test unknown_data["error"]["code"] == "VALIDATION_ERROR"

      invalid_response = make_request(
        "POST",
        "/states_zoo_preview";
        body=Dict(
          "state_type" => "DepolarizedBellPair",
          "parameters" => Dict("p" => 2),
        ),
      )
      @test invalid_response.status == 400
      invalid_data = parse_response(invalid_response)
      @test invalid_data["error"]["code"] == "VALIDATION_ERROR"
  end

  @testset "Parse Network Graph - Success" begin
      # Use the test payload from the mock file
      payload = deepcopy(test_payload)
      payload["name"] = TEST_SIMULATION_NAME

      response = make_request("POST", "/parse_network_graph", body=payload)

      @test response.status == 200
      data = parse_response(response)

      # Check response structure
      @test haskey(data, "name")
      @test haskey(data, "status")
      @test haskey(data, "node_count")
      @test haskey(data, "edge_count")
      @test haskey(data, "protocols_launched")
      @test haskey(data, "message")

      # Check values
      @test data["name"] == TEST_SIMULATION_NAME
      @test data["status"] == WebQuantumSavory.STATUS_CREATED
      @test data["node_count"] == 2
      @test data["edge_count"] == 1
      @test data["protocols_launched"] === nothing
      @test data["message"] == WebQuantumSavory.STATUS_MESSAGE_CREATED
  end

  @testset "States Zoo Variable Protocol Resolution" begin
      simulation_name = "states_zoo_variable_integration"
      payload = deepcopy(test_payload)
      payload["name"] = simulation_name
      payload["variables"] = [Dict(
        "id" => "zoo_pair_state",
        "name" => "zoo pair state",
        "type" => "Symbolic",
        "value" => Dict(
          "kind" => "states_zoo",
          "state_type" => "BarrettKokBellPairW",
          "parameters" => Dict("ηᴬ" => 1, "ηᴮ" => 1, "Pᵈ" => 0, "ηᵈ" => 1, "𝒱" => 1),
        ),
      )]

      entangler = payload["net"]["edges"][1]["data"]["protocols"][1]
      pairstate = only(filter(parameter -> parameter["name"] == "pairstate", entangler["parameters"]))
      pairstate["value"] = Dict("kind" => "variable", "id" => "zoo_pair_state")

      try
        create_response = make_request("POST", "/parse_network_graph"; body=payload)
        @test create_response.status == 200

        prepare_response = make_request(
          "POST",
          "/prepare_simulation";
          body=Dict("name" => simulation_name),
        )
        @test prepare_response.status == 200
        prepare_data = parse_response(prepare_response)
        @test prepare_data["status"] == WebQuantumSavory.STATUS_PREPARED
      finally
        make_request("POST", "/destroy_simulation"; body=Dict("name" => simulation_name))
      end
  end

  @testset "Parse Network Graph - Validation Errors" begin
      # Test missing name field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload, "name")

      response = make_request("POST", "/parse_network_graph", body=invalid_payload)
      @test response.status == 400
      data = parse_response(response)
      @test data["error"]["message"] == "Missing required field: 'name' must be present"

      # Test missing net field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload, "net")

      response = make_request("POST", "/parse_network_graph", body=invalid_payload)
      @test response.status == 400
      data = parse_response(response)
      @test data["error"]["message"] == "Missing required field: 'net' must be present"

      # Test missing nodes field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload["net"], "nodes")

      response = make_request("POST", "/parse_network_graph", body=invalid_payload)
      @test response.status == 400
      data = parse_response(response)
      @test data["error"]["message"] ==
        "Missing required fields in 'net': 'nodes' and 'edges' must be present"

      # Test missing edges field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload["net"], "edges")

      response = make_request("POST", "/parse_network_graph", body=invalid_payload)
      @test response.status == 400
      data = parse_response(response)
      @test data["error"]["message"] ==
        "Missing required fields in 'net': 'nodes' and 'edges' must be present"
  end

  @testset "Prepare Simulation - Success" begin
            # First create a network
      payload = deepcopy(test_payload)
      payload["name"] = TEST_SIMULATION_NAME

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200

      # Then prepare the simulation
      prepare_response = make_request("POST", "/prepare_simulation", body=Dict("name" => TEST_SIMULATION_NAME))
      @test prepare_response.status == 200

      data = parse_response(prepare_response)
      @test haskey(data, "name")
      @test haskey(data, "status")
      @test haskey(data, "node_count")
      @test haskey(data, "edge_count")
      @test haskey(data, "protocols_launched")
      @test haskey(data, "message")

      @test data["name"] == TEST_SIMULATION_NAME
      @test data["status"] == WebQuantumSavory.STATUS_PREPARED
      @test data["node_count"] == 2
      @test data["edge_count"] == 1
      @test data["protocols_launched"] !== nothing
      @test data["message"] == WebQuantumSavory.STATUS_MESSAGE_PREPARED
  end

  @testset "Prepare Simulation - Error Cases" begin
      # Test preparing non-existent simulation
      response = make_request("POST", "/prepare_simulation", body=Dict("name" => "nonexistent_sim"))
      @test response.status == 404
      data = parse_response(response)
      @test data["error"]["message"] == "Simulation not found"
  end

  @testset "Run Simulation - Success" begin
            # First create and prepare a network
      payload = deepcopy(test_payload)
      payload["name"] = TEST_SIMULATION_NAME

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200

      prepare_response = make_request("POST", "/prepare_simulation", body=Dict("name" => TEST_SIMULATION_NAME))
      @test prepare_response.status == 200

      # Then run the simulation
      run_response = make_request("POST", "/run_simulation", body=Dict("name" => TEST_SIMULATION_NAME, "time_units" => 5))
      @test run_response.status == 202

      data = parse_response(run_response)
      @test data["success"] == true
      @test data["status"] == "started"
      @test data["state"]["simulation"]["simulation_running"] == true

      final_state = wait_for_state(TEST_SIMULATION_NAME, timeout=10.0) do state
        state["simulation"]["simulation_running"] == false
      end
      @test final_state["simulation"]["simulation_error"] === nothing
      @test final_state["simulation"]["simulation_progress"] >= 5
  end

  @testset "Run Simulation - Error Cases" begin
      # Test running non-existent simulation
      response = make_request("POST", "/run_simulation", body=Dict("name" => "nonexistent_sim", "time_units" => 5))
      @test response.status == 404
      data = parse_response(response)
      @test data["error"]["message"] == "Simulation not found"

            # Test running unprepared simulation
      payload = deepcopy(test_payload)
      payload["name"] = "unprepared_sim"

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200

      run_response = make_request("POST", "/run_simulation", body=Dict("name" => "unprepared_sim", "time_units" => 5))
      @test run_response.status == 400
      data = parse_response(run_response)
      @test data["error"]["message"] == "Simulation not prepared"
  end

  @testset "Get State - Success" begin
            # First create a network
      payload = deepcopy(test_payload)
      payload["name"] = TEST_SIMULATION_NAME

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200

      # Then get the state
      state_response = make_request("GET", "/get_state", query=Dict("name" => TEST_SIMULATION_NAME))
      @test state_response.status == 200

      data = parse_response(state_response)
      @test data["success"] == true
      @test haskey(data, "state")

      state = data["state"]
      @test haskey(state, "name")
      @test haskey(state, "status")
      @test haskey(state, "node_count")
      @test haskey(state, "edge_count")
      @test haskey(state, "protocols_launched")
      @test haskey(state, "message")

      @test state["name"] == TEST_SIMULATION_NAME
      @test state["status"] == WebQuantumSavory.STATUS_CREATED
      @test state["node_count"] == 2
      @test state["edge_count"] == 1
      @test state["protocols_launched"] === nothing
      @test state["message"] == WebQuantumSavory.STATUS_MESSAGE_CREATED
  end

  @testset "Get State - Error Cases" begin
      # Test getting non-existent simulation state
      response = make_request("GET", "/get_state", query=Dict("name" => "nonexistent_sim"))
      @test response.status == 404
      data = parse_response(response)
      @test Set(keys(data)) == Set(["error"])
      @test data["error"]["code"] == "NOT_FOUND"
      @test data["error"]["message"] == "Simulation not found"
      @test data["error"]["details"]["resource"] == "Simulation"
      @test data["error"]["details"]["identifier"] == "nonexistent_sim"
  end

  @testset "Destroy Simulation - Success" begin
    # First create a network
      payload = deepcopy(test_payload)
      payload["name"] = TEST_SIMULATION_NAME

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200

      # Then destroy the simulation
      destroy_response = make_request("POST", "/destroy_simulation", body=Dict("name" => TEST_SIMULATION_NAME))
      @test destroy_response.status == 200
      data = parse_response(destroy_response)
      @test data["success"] == true
      @test contains(data["message"], "Simulation destroyed")

      # Verify it's actually destroyed by trying to get its state
      state_response = make_request("GET", "/get_state", query=Dict("name" => TEST_SIMULATION_NAME))
      @test state_response.status == 404
      state_data = parse_response(state_response)
      @test state_data["error"]["message"] == "Simulation not found"
  end

  @testset "Destroy Simulation - Error Cases" begin
      # Test destroying non-existent simulation
      response = make_request("POST", "/destroy_simulation", body=Dict("name" => "nonexistent_sim"))
      @test response.status == 404
      data = parse_response(response)
      @test data["error"]["message"] == "Simulation not found"
  end

  @testset "Complete Workflow" begin
      workflow_name = "workflow_test_sim"

        # 1. Create network
      payload = deepcopy(test_payload)
      payload["name"] = workflow_name

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200
      create_data = parse_response(create_response)
      @test create_data["status"] == WebQuantumSavory.STATUS_CREATED

      # 2. Prepare simulation
      prepare_response = make_request("POST", "/prepare_simulation", body=Dict("name" => workflow_name))
      @test prepare_response.status == 200
      prepare_data = parse_response(prepare_response)
      @test prepare_data["status"] == WebQuantumSavory.STATUS_PREPARED

      # 3. Run simulation
      run_response = make_request("POST", "/run_simulation", body=Dict("name" => workflow_name, "time_units" => 10))
      @test run_response.status == 202
      run_data = parse_response(run_response)
      @test run_data["success"] == true

      # 4. Wait for the real run transition and get final state
      final_state = wait_for_state(workflow_name, timeout=10.0) do state
        state["simulation"]["simulation_running"] == false
      end
      @test final_state["simulation"]["simulation_error"] === nothing
      @test final_state["simulation"]["simulation_progress"] >= 10

      # 5. Retrieve a real structured Simulator record through the public route.
      logs_response = make_request(
        "GET",
        "/logs/$workflow_name",
        query=Dict("purge" => "false"),
      )
      @test logs_response.status == 200
      logs_data = parse_response(logs_response)
      structured_record = findfirst(logs_data["logs"]) do record
        get(record, "source", nothing) == "Simulator" &&
          get(record, "group", nothing) == "protocol" &&
          haskey(record, "event") &&
          haskey(record, "sim_time") &&
          haskey(record, "sim_process_id") &&
          haskey(record, "protocol") &&
          haskey(record, "nodes")
      end
      @test structured_record !== nothing
      if structured_record !== nothing
        record = logs_data["logs"][structured_record]
        @test record["event"] isa String
        @test record["sim_time"] isa Number
        @test record["protocol"] isa String
        @test record["nodes"] isa Vector
      end

      # 6. Clean up
      destroy_response = make_request("POST", "/destroy_simulation", body=Dict("name" => workflow_name))
      @test destroy_response.status == 200
      destroy_data = parse_response(destroy_response)
      @test destroy_data["success"] == true

      # Verify cleanup
      verify_response = make_request("GET", "/get_state", query=Dict("name" => workflow_name))
      @test verify_response.status == 404
  end

  @testset "API Documentation" begin
      # Test that the Swagger docs endpoint is accessible
      response = make_request("GET", "/docs")
      @test response.status == 200
      # The response should contain HTML content
      body = String(response.body)
      @test contains(body, "html") || contains(body, "swagger") || contains(body, "api")
      @test contains(body, "\"version\":\"$(platform_info["versions"]["app"])\"")

      options_match = match(r"const options = (\{.*\})", body)
      @test options_match !== nothing
      if options_match !== nothing
        swagger = JSON.parse(only(options_match.captures))["swaggerDoc"]
        edge_data_schema =
          swagger["paths"]["/parse_network_graph"]["post"]["requestBody"]["content"][
            "application/json"
          ]["schema"]["properties"]["net"]["properties"]["edges"]["items"]["properties"][
            "data"
          ]
        edge_properties = edge_data_schema["properties"]
        required_edge_data = Set(get(edge_data_schema, "required", Any[]))

        for field in (
          "distanceMeters",
          "propagationDelaySeconds",
          "refractiveIndex",
          "lossDbPerKm",
          "transmissivity",
        )
          @test haskey(edge_properties, field)
          @test edge_properties[field]["type"] == "number"
          @test !(field in required_edge_data)
          @test contains(edge_properties[field]["description"], "finite")
        end
        @test edge_properties["distanceMeters"]["minimum"] == 0
        @test edge_properties["distanceMeters"]["nullable"] == true
        @test contains(edge_properties["distanceMeters"]["description"], "meters")
        @test contains(edge_properties["distanceMeters"]["description"], "omission or null")
        @test edge_properties["propagationDelaySeconds"]["minimum"] == 0
        @test get(edge_properties["propagationDelaySeconds"], "nullable", false) == false
        @test contains(edge_properties["propagationDelaySeconds"]["description"], "seconds")
        @test contains(edge_properties["propagationDelaySeconds"]["description"], "defaults to zero")
        @test edge_properties["refractiveIndex"]["minimum"] == 0
        @test edge_properties["refractiveIndex"]["exclusiveMinimum"] == true
        @test edge_properties["refractiveIndex"]["nullable"] == true
        @test contains(edge_properties["refractiveIndex"]["description"], "dimensionless")
        @test contains(edge_properties["refractiveIndex"]["description"], "omission or null")
        @test edge_properties["lossDbPerKm"]["minimum"] == 0
        @test edge_properties["lossDbPerKm"]["nullable"] == true
        @test contains(edge_properties["lossDbPerKm"]["description"], "dB/km")
        @test edge_properties["transmissivity"]["minimum"] == 0
        @test edge_properties["transmissivity"]["maximum"] == 1
        @test edge_properties["transmissivity"]["nullable"] == true
        @test contains(edge_properties["transmissivity"]["description"], "dimensionless")

        numeric_operation = swagger["paths"]["/test_numeric_expression"]["post"]
        numeric_schema = numeric_operation["requestBody"]["content"]["application/json"]["schema"]
        @test Set(numeric_schema["required"]) ==
          Set(["expression", "target_type", "placement"])
        @test numeric_schema["additionalProperties"] == false
        @test numeric_schema["properties"]["target_type"]["enum"] ==
          ["Float64", "Int64"]
        @test numeric_schema["properties"]["placement"]["enum"] ==
          ["node", "edge", "floating", "variable"]
        context_schemas = numeric_schema["properties"]["context"]["oneOf"]
        @test length(context_schemas) == 3
        @test all(schema -> schema["additionalProperties"] == false, context_schemas)
        @test Set(context_schemas[1]["required"]) == Set(["node_names"])
        @test Set(context_schemas[2]["required"]) == Set(["node_names", "self"])
        @test Set(context_schemas[3]["required"]) == Set([
          "node_names",
          "distance",
          "delay",
          "refractive_index",
          "loss",
          "transmissivity",
          "node_a",
          "node_b",
        ])
        @test context_schemas[3]["properties"]["distance"]["nullable"] == true
        @test context_schemas[3]["properties"]["delay"]["nullable"] == true
        @test context_schemas[3]["properties"]["refractive_index"]["nullable"] == true
        @test context_schemas[3]["properties"]["loss"]["nullable"] == true
        @test context_schemas[3]["properties"]["transmissivity"]["nullable"] == true
        @test context_schemas[3]["properties"]["transmissivity"]["maximum"] == 1
        @test haskey(numeric_operation["responses"], "403")
      end
  end

  @testset "Test Code Endpoint" begin
      # The same contract supports default-enabled test servers and explicit
      # disabled-policy integration runs.
      accepted_sources = (
        "<(1)",
        "f(x) = x + 1",
        "f(x) = x + 1\nf\n# trailing comment",
      )
      for source in accepted_sources
        response = make_request(
          "POST",
          "/test_code",
          body=Dict("code" => source, "placement" => "node"),
        )
        data = parse_response(response)
        if unsafe_evaluation_enabled
          @test response.status == 200
          @test data["success"] == true
          @test haskey(data, "results")
        else
          @test response.status == 403
          @test data["error"]["message"] == "Unsafe Julia code evaluation is disabled"
          @test data["error"]["code"] == "UNSAFE_EVALUATION_DISABLED"
        end
      end

      # Validation error (missing field)
      response2 = make_request("POST", "/test_code", body=Dict("wrong" => "x=1"))
      @test response2.status == 400
      data2 = parse_response(response2)
      @test data2["error"]["code"] == "VALIDATION_ERROR"
      @test occursin("missing required field: 'code'", data2["error"]["message"])

      for invalid_code in (
        nothing,
        Dict("nested" => "x -> x"),
        Any["x -> x"],
      )
        invalid_code_response = make_request(
          "POST",
          "/test_code";
          body=Dict("code" => invalid_code),
        )
        @test invalid_code_response.status == 400
        invalid_code_data = parse_response(invalid_code_response)
        @test invalid_code_data["error"]["code"] == "VALIDATION_ERROR"
        @test occursin(
          "field 'code' must be a string",
          invalid_code_data["error"]["message"],
        )
        @test invalid_code_data["error"]["details"]["field"] == "code"
        @test haskey(
          invalid_code_data["error"]["details"],
          "received_type",
        )
      end

      for invalid_payload in (nothing, Any["x -> x"], "x -> x", 1)
        invalid_payload_response = HTTP.post(
          "$TEST_BASE_URL/test_code",
          ["Content-Type" => "application/json"],
          JSON.json(invalid_payload);
          status_exception=false,
        )
        @test invalid_payload_response.status == 400
        invalid_payload_data = parse_response(invalid_payload_response)
        @test invalid_payload_data["error"]["code"] == "VALIDATION_ERROR"
        @test occursin(
          "must be an object",
          invalid_payload_data["error"]["message"],
        )
      end

      extra_field_response = make_request(
        "POST",
        "/test_code";
        body=Dict("code" => "x -> x", "unexpected" => true),
      )
      @test extra_field_response.status == 400
      extra_field_data = parse_response(extra_field_response)
      @test extra_field_data["error"]["code"] == "VALIDATION_ERROR"
      @test occursin(
        "fields do not match the request schema",
        extra_field_data["error"]["message"],
      )

      invalid_placement_response = make_request(
        "POST",
        "/test_code",
        body=Dict("code" => "x -> x", "placement" => "invalid"),
      )
      @test invalid_placement_response.status == 400
      invalid_placement_data = parse_response(invalid_placement_response)
      @test occursin("Field 'placement'", invalid_placement_data["error"]["message"])

      if unsafe_evaluation_enabled
        for (source, placement, expected_success) in (
          ("<(self)", "node", true),
          ("==(nodeid(\"Amherst\"))", "edge", true),
          (
            # The edge-distance binding is `distance`, so `length` is not
            # shadowed and may be called directly.
            "values -> distance > 0 && delay >= 0 && refractive_index > 0 && " *
            "loss >= 0 && 0 <= transmissivity <= 1 && " *
            "node_a == 1 && node_b == 2 && length(values) > 0",
            "edge",
            true,
          ),
          ("<(self)", "edge", false),
          ("value -> value == self && node_a < node_b", "variable", true),
          ("x -> x > 1", "query", true),
          (
            "candidate -> let nodeid = _ -> 1; candidate == nodeid(\"Amherst\"); end",
            "query",
            true,
          ),
          ("==(nodeid(\"Amherst\"))", "query", false),
          ("candidate -> candidate == nodeid(\"Amherst\")", "query", false),
          ("<(self)", "query", false),
        )
          contextual_response = make_request(
            "POST",
            "/test_code",
            body=Dict("code" => source, "placement" => placement),
          )
          @test contextual_response.status == 200
          contextual_data = parse_response(contextual_response)
          @test contextual_data["success"] == expected_success
        end

        invalid_response = make_request(
          "POST",
          "/test_code",
          body=Dict("code" => "invalid("),
        )
        @test invalid_response.status == 200
        invalid_data = parse_response(invalid_response)
        @test invalid_data["success"] == false
        @test invalid_data["error_code"] == "EVALUATION_FAILED"
        @test startswith(invalid_data["error"], "ParseError:")
        @test occursin("Expected `)` or `,`", invalid_data["error"])
        @test !occursin("Base.Meta.ParseError(", invalid_data["error"])
      end
  end

  @testset "Test Numeric Expression Endpoint" begin
      edge_request = Dict(
        "expression" => "delay / 2",
        "target_type" => "Float64",
        "placement" => "edge",
        "context" => Dict(
          "node_names" => ["Alice", "Bob"],
          "distance" => 100.0,
          "delay" => 5.0e-7,
          "refractive_index" => 1.5,
          "loss" => 0.2,
          "transmissivity" => 0.95,
          "node_a" => 1,
          "node_b" => 2,
        ),
      )
      response = make_request(
        "POST",
        "/test_numeric_expression";
        body=edge_request,
      )
      data = parse_response(response)
      if unsafe_evaluation_enabled
        @test response.status == 200
        @test data == Dict(
          "success" => true,
          "results" => Dict(
            "deferred" => false,
            "target_type" => "Float64",
            "value" => "2.5e-7",
          ),
        )

        template_response = make_request(
          "POST",
          "/test_numeric_expression";
          body=Dict(
            "expression" => "1 / 2",
            "target_type" => "Float64",
            "placement" => "floating",
          ),
        )
        @test template_response.status == 200
        @test parse_response(template_response)["results"] == Dict(
          "deferred" => true,
          "target_type" => "Float64",
          "value" => "0.5",
        )

        variable_response = make_request(
          "POST",
          "/test_numeric_expression";
          body=Dict(
            # Rationals (`//`) are not allowlisted; use plain arithmetic to
            # exercise immediate (non-deferred) variable evaluation.
            "expression" => "x = 3\nx + 0",
            "target_type" => "Int64",
            "placement" => "variable",
          ),
        )
        @test variable_response.status == 200
        @test parse_response(variable_response)["results"] == Dict(
          "deferred" => false,
          "target_type" => "Int64",
          "value" => "3",
        )

        contextual_variable_response = make_request(
          "POST",
          "/test_numeric_expression";
          body=Dict(
            "expression" => "self + nodeid(\"Alice\")",
            "target_type" => "Int64",
            "placement" => "variable",
          ),
        )
        @test contextual_variable_response.status == 200
        @test parse_response(contextual_variable_response)["results"] == Dict(
          "deferred" => true,
          "target_type" => "Int64",
        )

        for failing_request in (
          merge(edge_request, Dict("expression" => "1 / 2", "target_type" => "Int64")),
          merge(edge_request, Dict("expression" => "Inf")),
          merge(edge_request, Dict("expression" => "invalid(")),
          merge(edge_request, Dict("expression" => "self")),
          # Rejected by the restricted allowlist before evaluation.
          merge(edge_request, Dict("expression" => "Base.length([1, 2])", "target_type" => "Int64")),
          merge(edge_request, Dict("expression" => "open(\"/tmp/x\", \"w\")")),
        )
          failing_response = make_request(
            "POST",
            "/test_numeric_expression";
            body=failing_request,
          )
          @test failing_response.status == 200
          failing_data = parse_response(failing_response)
          @test failing_data["success"] == false
          @test failing_data["error_code"] == "EVALUATION_FAILED"
        end
      else
        @test response.status == 403
        @test data["error"]["code"] == "UNSAFE_EVALUATION_DISABLED"
      end

      for malformed_request in (
        Dict(
          "target_type" => "Float64",
          "placement" => "variable",
        ),
        Dict(
          "expression" => "1",
          "target_type" => "Number",
          "placement" => "variable",
        ),
        Dict(
          "expression" => "1",
          "target_type" => "Float64",
          "placement" => "variable",
          "context" => Dict(),
        ),
        merge(edge_request, Dict("unexpected" => true)),
      )
        malformed_response = make_request(
          "POST",
          "/test_numeric_expression";
          body=malformed_request,
        )
        @test malformed_response.status == 400
        malformed_data = parse_response(malformed_response)
        @test malformed_data["error"]["code"] == "VALIDATION_ERROR"
      end
  end

  @testset "Test Symbolic Expression Endpoint" begin
      # Success when enabled; stable policy denial otherwise.
      response = make_request("POST", "/test_symbolic_expression", body=Dict("expr" => "(Z₁⊗Z₁+Z₂⊗Z₂) / √2"))
      data = parse_response(response)
      if unsafe_evaluation_enabled
        @test response.status == 200
        @test data["success"] == true
        @test haskey(data, "results")
        @test haskey(data["results"], "latex")
        @test haskey(data["results"], "value")
      else
        @test response.status == 403
        @test data["error"]["message"] == "Unsafe Julia code evaluation is disabled"
        @test data["error"]["code"] == "UNSAFE_EVALUATION_DISABLED"
      end

      # Validation error (missing field)
      response2 = make_request("POST", "/test_symbolic_expression", body=Dict("wrong" => "..."))
      @test response2.status == 400
      data2 = parse_response(response2)
      @test data2["error"]["code"] == "VALIDATION_ERROR"
      @test occursin("missing required field: 'expr'", data2["error"]["message"])

      for invalid_expression in (
        nothing,
        Dict("nested" => "Z₁"),
        Any["Z₁"],
      )
        invalid_expression_response = make_request(
          "POST",
          "/test_symbolic_expression";
          body=Dict("expr" => invalid_expression),
        )
        @test invalid_expression_response.status == 400
        invalid_expression_data = parse_response(invalid_expression_response)
        @test invalid_expression_data["error"]["code"] == "VALIDATION_ERROR"
        @test occursin(
          "field 'expr' must be a string",
          invalid_expression_data["error"]["message"],
        )
        @test invalid_expression_data["error"]["details"]["field"] == "expr"
        @test haskey(
          invalid_expression_data["error"]["details"],
          "received_type",
        )
      end

      for invalid_payload in (nothing, Any["Z₁"], "Z₁", 1)
        invalid_payload_response = HTTP.post(
          "$TEST_BASE_URL/test_symbolic_expression",
          ["Content-Type" => "application/json"],
          JSON.json(invalid_payload);
          status_exception=false,
        )
        @test invalid_payload_response.status == 400
        invalid_payload_data = parse_response(invalid_payload_response)
        @test invalid_payload_data["error"]["code"] == "VALIDATION_ERROR"
        @test occursin(
          "must be an object",
          invalid_payload_data["error"]["message"],
        )
      end

      extra_field_response = make_request(
        "POST",
        "/test_symbolic_expression";
        body=Dict("expr" => "Z₁", "unexpected" => true),
      )
      @test extra_field_response.status == 400
      extra_field_data = parse_response(extra_field_response)
      @test extra_field_data["error"]["code"] == "VALIDATION_ERROR"
      @test occursin(
        "fields do not match the request schema",
        extra_field_data["error"]["message"],
      )

      if unsafe_evaluation_enabled
        # Execution error (bad expression)
        response3 = make_request("POST", "/test_symbolic_expression", body=Dict("expr" => "(Z₁⊗Z₁+"))
        @test response3.status == 200
        data3 = parse_response(response3)
        @test data3["success"] == false
        @test data3["error_code"] == "EVALUATION_FAILED"
      end
  end

  @testset "Simulation Log Groups Endpoint" begin
      response = make_request("GET", "/simulation_log_groups")
      @test response.status == 200
      data = parse_response(response)
      expected_log_groups = String[
        string(group) for group in values(QuantumSavory.LOG_GROUPS)
      ]
      @test data["simulation_log_groups"] == expected_log_groups
  end

  @testset "Logs Endpoint - Success" begin
      # First create a simulation to have logs
      logs_test_name = "logs_test_sim"
      payload = deepcopy(test_payload)
      payload["name"] = logs_test_name

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200

      # Test getting logs with default purge=true
      logs_response = make_request("GET", "/logs/$logs_test_name")
      @test logs_response.status == 200
      logs_data = parse_response(logs_response)
      @test logs_data["success"] == true
      @test haskey(logs_data, "logs")
      @test haskey(logs_data, "count")
      @test isa(logs_data["logs"], Vector)
      @test isa(logs_data["count"], Int)
      @test logs_data["count"] == length(logs_data["logs"])

      # Test getting logs with purge=false
      logs_response_no_purge = make_request("GET", "/logs/$logs_test_name", query=Dict("purge" => "false"))
      @test logs_response_no_purge.status == 200
      logs_data_no_purge = parse_response(logs_response_no_purge)
      @test logs_data_no_purge["success"] == true
      @test haskey(logs_data_no_purge, "logs")
      @test haskey(logs_data_no_purge, "count")

      # Test getting logs with purge=true explicitly
      logs_response_purge = make_request("GET", "/logs/$logs_test_name", query=Dict("purge" => "true"))
      @test logs_response_purge.status == 200
      logs_data_purge = parse_response(logs_response_purge)
      @test logs_data_purge["success"] == true
      @test haskey(logs_data_purge, "logs")
      @test haskey(logs_data_purge, "count")

      # Test various purge parameter values
      purge_values = ["1", "yes", "on", "0", "no", "off"]
      for purge_val in purge_values
          purge_response = make_request("GET", "/logs/$logs_test_name", query=Dict("purge" => purge_val))
          @test purge_response.status == 200
          purge_data = parse_response(purge_response)
          @test purge_data["success"] == true
      end

      # Clean up
      destroy_response = make_request("POST", "/destroy_simulation", body=Dict("name" => logs_test_name))
      @test destroy_response.status == 200
  end

  @testset "Logs Endpoint - Error Cases" begin
      # Test getting logs for non-existent simulation
      response = make_request("GET", "/logs/nonexistent_sim")
      @test response.status == 404
      data = parse_response(response)
      @test data["error"]["message"] == "Simulation not found"
      @test data["error"]["details"]["resource"] == "Simulation"
      @test data["error"]["details"]["identifier"] == "nonexistent_sim"
  end

  @testset "Pause Simulation - Success" begin
      # First create and prepare a simulation
      pause_test_name = "pause_test_sim"
      payload = deepcopy(test_payload)
      payload["name"] = pause_test_name

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200

      prepare_response = make_request("POST", "/prepare_simulation", body=Dict("name" => pause_test_name))
      @test prepare_response.status == 200

      # Start a long run and observe actual progress before pausing it.
      target_time = 1000
      run_response = make_request("POST", "/run_simulation", body=Dict("name" => pause_test_name, "time_units" => target_time))
      @test run_response.status == 202

      running_state = wait_for_state(pause_test_name, timeout=10.0) do state
        state["simulation"]["simulation_running"] == true &&
          state["simulation"]["simulation_progress"] > 0
      end
      @test running_state["simulation"]["simulation_paused"] == false

      # A second run cannot overlap the active task.
      duplicate_response = make_request("POST", "/run_simulation", body=Dict("name" => pause_test_name, "time_units" => target_time))
      @test duplicate_response.status == 400
      @test occursin(
        "running",
        parse_response(duplicate_response)["error"]["message"],
      )

      # Pause the simulation
      pause_response = make_request("POST", "/pause_simulation", body=Dict("name" => pause_test_name))
      @test pause_response.status == 200
      pause_data = parse_response(pause_response)
      @test pause_data["success"] == true
      @test pause_data["message"] == "Simulation paused"
      @test pause_data["state"]["simulation"]["simulation_running"] == false
      @test pause_data["state"]["simulation"]["simulation_paused"] == true

      # The serialized state remains paused after acknowledgement.
      state_response2 = make_request("GET", "/get_state", query=Dict("name" => pause_test_name))
      @test state_response2.status == 200
      state_data2 = parse_response(state_response2)
      @test state_data2["success"] == true
      @test state_data2["state"]["simulation"]["simulation_paused"] == true
      @test state_data2["state"]["simulation"]["simulation_running"] == false

      duplicate_pause = make_request("POST", "/pause_simulation", body=Dict("name" => pause_test_name))
      @test duplicate_pause.status == 400

      # An acknowledged pause has no active task, so stop/destroy is race-free.
      destroy_response = make_request("POST", "/destroy_simulation", body=Dict("name" => pause_test_name))
      @test destroy_response.status == 200
  end

  @testset "Pause Simulation - Error Cases" begin
      # Test pausing non-existent simulation
      response = make_request("POST", "/pause_simulation", body=Dict("name" => "nonexistent_sim"))
      @test response.status == 404
      data = parse_response(response)
      @test data["error"]["message"] == "Simulation not found"

      # Test pausing unprepared simulation
      unprepared_name = "unprepared_pause_test"
      payload = deepcopy(test_payload)
      payload["name"] = unprepared_name

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200

      pause_response = make_request("POST", "/pause_simulation", body=Dict("name" => unprepared_name))
      @test pause_response.status == 400
      pause_data = parse_response(pause_response)
      @test occursin("not running", pause_data["error"]["message"])

      # Clean up the unprepared state.
      destroy_response = make_request("POST", "/destroy_simulation", body=Dict("name" => unprepared_name))
      @test destroy_response.status == 200
  end

  @testset "Complete Workflow with Pause" begin
      workflow_pause_name = "workflow_pause_test_sim"

      # 1. Create network
      payload = deepcopy(test_payload)
      payload["name"] = workflow_pause_name

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200
      create_data = parse_response(create_response)
      @test create_data["status"] == WebQuantumSavory.STATUS_CREATED

      # 2. Prepare simulation
      prepare_response = make_request("POST", "/prepare_simulation", body=Dict("name" => workflow_pause_name))
      @test prepare_response.status == 200
      prepare_data = parse_response(prepare_response)
      @test prepare_data["status"] == WebQuantumSavory.STATUS_PREPARED

      # 3. Start simulation
      # Keep the run long enough that the cooperative task cannot finish
      # between observing progress and sending the pause request.
      target_time = 1000
      run_response = make_request("POST", "/run_simulation", body=Dict("name" => workflow_pause_name, "time_units" => target_time))
      @test run_response.status == 202
      run_data = parse_response(run_response)
      @test run_data["success"] == true

      # 4. Observe real execution before requesting a pause.
      running_state = wait_for_state(workflow_pause_name, timeout=10.0) do state
        state["simulation"]["simulation_running"] == true &&
          state["simulation"]["simulation_progress"] > 0
      end
      @test running_state["simulation"]["simulation_paused"] == false

      # 5. Pause simulation
      pause_response = make_request("POST", "/pause_simulation", body=Dict("name" => workflow_pause_name))
      @test pause_response.status == 200
      pause_data = parse_response(pause_response)
      @test pause_data["success"] == true

      # 6. Check paused state
      state_response2 = make_request("GET", "/get_state", query=Dict("name" => workflow_pause_name))
      @test state_response2.status == 200
      state_data2 = parse_response(state_response2)
      @test state_data2["success"] == true
      @test state_data2["state"]["simulation"]["simulation_paused"] == true
      @test state_data2["state"]["simulation"]["simulation_running"] == false
      paused_progress = state_data2["state"]["simulation"]["simulation_progress"]
      @test state_data2["state"]["simulation"]["simulation_time"] == target_time

      # 7. Resume to the same cumulative target and wait for completion.
      resume_response = make_request("POST", "/run_simulation", body=Dict("name" => workflow_pause_name, "time_units" => target_time))
      @test resume_response.status == 202

      final_state = wait_for_state(workflow_pause_name, timeout=15.0) do state
        state["simulation"]["simulation_running"] == false &&
          state["simulation"]["simulation_paused"] == false
      end
      @test final_state["simulation"]["simulation_error"] === nothing
      @test final_state["simulation"]["simulation_time"] == target_time
      @test final_state["simulation"]["simulation_progress"] >= target_time
      @test final_state["simulation"]["simulation_progress"] >= paused_progress

      # 8. Clean up
      destroy_response = make_request("POST", "/destroy_simulation", body=Dict("name" => workflow_pause_name))
      @test destroy_response.status == 200
      destroy_data = parse_response(destroy_response)
      @test destroy_data["success"] == true

      # Verify cleanup
      verify_response = make_request("GET", "/get_state", query=Dict("name" => workflow_pause_name))
      @test verify_response.status == 404
  end

  @testset "Tags and Queries Explorer" begin
      catalog_response = make_request("GET", "/tag_types")
      @test catalog_response.status == 200
      catalog = parse_response(catalog_response)
      @test Set(keys(catalog)) == Set([
        "named_tags",
        "general_signatures",
        "allowed_data_types",
        "unsafe_evaluation",
      ])
      @test !isempty(catalog["named_tags"])
      @test !isempty(catalog["general_signatures"])
      @test !isempty(catalog["allowed_data_types"])
      @test catalog["unsafe_evaluation"] == unsafe_evaluation_enabled
      @test all(definition -> startswith(
        definition["type_id"],
        "QuantumSavory.ProtocolZoo.",
      ), catalog["named_tags"])
      @test Set(definition["type_id"] for definition in catalog["named_tags"]) == Set([
        "QuantumSavory.ProtocolZoo.EntanglementCounterpart",
        "QuantumSavory.ProtocolZoo.EntanglementDelete",
        "QuantumSavory.ProtocolZoo.EntanglementHistory",
        "QuantumSavory.ProtocolZoo.EntanglementUpdateX",
        "QuantumSavory.ProtocolZoo.EntanglementUpdateZ",
        "QuantumSavory.ProtocolZoo.MBQCEntanglementDistillation.GraphStateStorage",
        "QuantumSavory.ProtocolZoo.MBQCEntanglementDistillation.PurifiedEntanglementCounterpart",
        "QuantumSavory.ProtocolZoo.MBQCEntanglementDistillation.PurifierBellMeasurementResults",
        "QuantumSavory.ProtocolZoo.QTCP.Flow",
        "QuantumSavory.ProtocolZoo.QTCP.LinkLevelReply",
        "QuantumSavory.ProtocolZoo.QTCP.LinkLevelReplyAtHop",
        "QuantumSavory.ProtocolZoo.QTCP.LinkLevelReplyAtSource",
        "QuantumSavory.ProtocolZoo.QTCP.LinkLevelRequest",
        "QuantumSavory.ProtocolZoo.QTCP.QDatagram",
        "QuantumSavory.ProtocolZoo.QTCP.QDatagramSuccess",
        "QuantumSavory.ProtocolZoo.QTCP.QTCPPairBegin",
        "QuantumSavory.ProtocolZoo.QTCP.QTCPPairEnd",
        "QuantumSavory.ProtocolZoo.Switches.SwitchRequest",
      ])

      symbol_int_signature = only(filter(catalog["general_signatures"]) do signature
        signature["head_type"] == "Symbol" &&
          [field["type"] for field in signature["fields"]] == ["Int64"]
      end)
      symbol_float_signature = only(filter(catalog["general_signatures"]) do signature
        signature["head_type"] == "Symbol" &&
          [field["type"] for field in signature["fields"]] == ["Float64"]
      end)

      function tag_spec(head, value)
        Dict(
          "kind" => "general",
          "signature_id" => symbol_int_signature["signature_id"],
          "head" => Dict("type" => "Symbol", "value" => head),
          "fields" => [Dict("type" => "Int64", "value" => value)],
        )
      end

      function query_spec(head, term)
        Dict(
          "kind" => "general",
          "signature_id" => symbol_int_signature["signature_id"],
          "head" => Dict("type" => "Symbol", "value" => head),
          "fields" => [Dict("type" => "Int64", "value" => term)],
        )
      end

      function float_tag_spec(head, value)
        Dict(
          "kind" => "general",
          "signature_id" => symbol_float_signature["signature_id"],
          "head" => Dict("type" => "Symbol", "value" => head),
          "fields" => [Dict("type" => "Float64", "value" => value)],
        )
      end

      function float_query_spec(head, term)
        Dict(
          "kind" => "general",
          "signature_id" => symbol_float_signature["signature_id"],
          "head" => Dict("type" => "Symbol", "value" => head),
          "fields" => [Dict("type" => "Float64", "value" => term)],
        )
      end

      preview_response = make_request(
        "POST",
        "/tag_preview";
        body=Dict("tag" => tag_spec("integration_preview", 9)),
      )
      @test preview_response.status == 200
      preview = parse_response(preview_response)
      @test preview["success"] == true
      @test preview["tag"]["kind"] == "general"
      @test preview["tag"]["signature_id"] == symbol_int_signature["signature_id"]
      @test preview["tag"]["head"]["value"] == "integration_preview"
      @test preview["tag"]["fields"][1]["value"] == 9
      @test preview["rendered"] == "SymbolInt(:integration_preview, 9)::Tag"

      malformed_preview = make_request(
        "POST",
        "/tag_preview";
        body=Dict("tag" => Dict("kind" => "general")),
      )
      @test malformed_preview.status == 400
      malformed_preview_data = parse_response(malformed_preview)
      @test malformed_preview_data["error"]["code"] == "VALIDATION_ERROR"

      malformed_discriminator_preview = make_request(
        "POST",
        "/tag_preview";
        body=Dict("tag" => Dict("kind" => 1)),
      )
      @test malformed_discriminator_preview.status == 400
      @test parse_response(malformed_discriminator_preview)["error"]["code"] ==
        "VALIDATION_ERROR"

      simulation_name = "tags_queries_integration_$(time_ns())"
      payload = deepcopy(test_payload)
      payload["name"] = simulation_name
      node_id = "node_FVAmt8"
      slot_one_id = "slot_MglsMO"
      slot_two_id = "slot_VSOCk6"
      slot_one = Dict("target" => "slot", "node_id" => node_id, "slot_id" => slot_one_id)
      slot_two = Dict("target" => "slot", "node_id" => node_id, "slot_id" => slot_two_id)
      register_target = Dict("target" => "register", "node_id" => node_id)
      register_destination = merge(
        register_target,
        Dict("destination_slot_id" => slot_two_id),
      )
      message_target = Dict("target" => "message_buffer", "node_id" => node_id)

      try
        create_response = make_request("POST", "/parse_network_graph"; body=payload)
        @test create_response.status == 200

        empty_list_response = make_request(
          "GET",
          "/tags/$simulation_name";
          query=slot_one,
        )
        @test empty_list_response.status == 200
        @test parse_response(empty_list_response)["entries"] == []

        slot_add_response = make_request(
          "POST",
          "/tags/$simulation_name";
          body=merge(slot_one, Dict("tag" => tag_spec("integration_attach", 1))),
        )
        @test slot_add_response.status == 200
        slot_add = parse_response(slot_add_response)
        @test slot_add["success"] == true
        @test slot_add["entry"]["tag_id"] isa String
        @test slot_add["entry"]["slot_id"] == slot_one_id
        @test slot_add["entry"]["node_id"] == node_id
        slot_tag_id = slot_add["entry"]["tag_id"]

        register_add_response = make_request(
          "POST",
          "/tags/$simulation_name";
          body=merge(
            register_destination,
            Dict("tag" => tag_spec("integration_attach", 2)),
          ),
        )
        @test register_add_response.status == 200
        register_add = parse_response(register_add_response)
        @test register_add["entry"]["tag_id"] isa String
        @test register_add["entry"]["slot_id"] == slot_two_id
        register_tag_id = register_add["entry"]["tag_id"]

        slot_list_response = make_request(
          "GET",
          "/tags/$simulation_name";
          query=slot_one,
        )
        @test slot_list_response.status == 200
        @test [entry["tag_id"] for entry in parse_response(slot_list_response)["entries"]] ==
          [slot_tag_id]

        register_list_response = make_request(
          "GET",
          "/tags/$simulation_name";
          query=register_target,
        )
        @test register_list_response.status == 200
        @test [entry["tag_id"] for entry in parse_response(register_list_response)["entries"]] ==
          [register_tag_id, slot_tag_id]

        delete_response = make_request(
          "DELETE",
          "/tags/$simulation_name/$slot_tag_id";
          query=slot_one,
        )
        @test delete_response.status == 200
        delete_data = parse_response(delete_response)
        @test delete_data["success"] == true
        @test delete_data["entry"]["tag_id"] == slot_tag_id

        stale_response = make_request(
          "DELETE",
          "/tags/$simulation_name/$slot_tag_id";
          query=register_target,
        )
        @test stale_response.status == 404
        stale_data = parse_response(stale_response)
        @test stale_data["error"]["code"] == "NOT_FOUND"

        message_add_response = make_request(
          "POST",
          "/tags/$simulation_name";
          body=merge(message_target, Dict("tag" => tag_spec("integration_message", 3))),
        )
        @test message_add_response.status == 200
        message_add = parse_response(message_add_response)
        @test message_add["entry"]["tag_id"] isa String
        @test message_add["entry"]["depth"] == 1
        message_tag_id = message_add["entry"]["tag_id"]

        message_list_response = make_request(
          "GET",
          "/tags/$simulation_name";
          query=message_target,
        )
        @test message_list_response.status == 200
        message_entries = parse_response(message_list_response)["entries"]
        @test length(message_entries) == 1
        @test message_entries[1]["tag_id"] == message_tag_id
        @test message_entries[1]["depth"] == 1
        @test message_entries[1]["node_id"] == node_id

        message_delete_response = make_request(
          "DELETE",
          "/tags/$simulation_name/$message_tag_id";
          query=message_target,
        )
        @test message_delete_response.status == 400
        @test occursin(
          "not supported",
          parse_response(message_delete_response)["error"]["message"],
        )

        query_entry_one_response = make_request(
          "POST",
          "/tags/$simulation_name";
          body=merge(slot_one, Dict("tag" => tag_spec("integration_query", 1))),
        )
        @test query_entry_one_response.status == 200
        query_entry_one = parse_response(query_entry_one_response)["entry"]

        query_entry_two_response = make_request(
          "POST",
          "/tags/$simulation_name";
          body=merge(
            register_destination,
            Dict("tag" => tag_spec("integration_query", 2)),
          ),
        )
        @test query_entry_two_response.status == 200
        query_entry_two = parse_response(query_entry_two_response)["entry"]

        exact_query_response = make_request(
          "POST",
          "/tag_queries/$simulation_name";
          body=merge(register_target, Dict("query" => query_spec(
            "integration_query",
            Dict("kind" => "exact", "value" => 2),
          ))),
        )
        @test exact_query_response.status == 200
        exact_entries = parse_response(exact_query_response)["entries"]
        @test [entry["tag_id"] for entry in exact_entries] == [query_entry_two["tag_id"]]

        slot_query_response = make_request(
          "POST",
          "/tag_queries/$simulation_name";
          body=merge(slot_one, Dict("query" => query_spec(
            "integration_query",
            Dict("kind" => "exact", "value" => 1),
          ))),
        )
        @test slot_query_response.status == 200
        @test [entry["tag_id"] for entry in parse_response(slot_query_response)["entries"]] ==
          [query_entry_one["tag_id"]]

        wildcard_query_response = make_request(
          "POST",
          "/tag_queries/$simulation_name";
          body=merge(register_target, Dict("query" => query_spec(
            "integration_query",
            Dict("kind" => "wildcard"),
          ))),
        )
        @test wildcard_query_response.status == 200
        wildcard_entries = parse_response(wildcard_query_response)["entries"]
        @test [entry["tag_id"] for entry in wildcard_entries] ==
          [query_entry_two["tag_id"], query_entry_one["tag_id"]]

        predicate_query_response = make_request(
          "POST",
          "/tag_queries/$simulation_name";
          body=merge(register_target, Dict("query" => query_spec(
            "integration_query",
            Dict(
              "kind" => "predicate",
              "predicate" => "preset",
              "operator" => ">",
              "operand" => 1,
            ),
          ))),
        )
        @test predicate_query_response.status == 200
        @test [
          entry["tag_id"] for entry in parse_response(predicate_query_response)["entries"]
        ] == [query_entry_two["tag_id"]]

        custom_query_response = make_request(
          "POST",
          "/tag_queries/$simulation_name";
          body=merge(register_target, Dict("query" => query_spec(
            "integration_query",
            Dict(
              "kind" => "predicate",
              "predicate" => "custom",
              "source" => "candidate -> candidate == 2",
            ),
          ))),
        )
        if unsafe_evaluation_enabled
          @test custom_query_response.status == 200
          @test [
            entry["tag_id"] for entry in parse_response(custom_query_response)["entries"]
          ] == [query_entry_two["tag_id"]]
        else
          @test custom_query_response.status == 403
          @test parse_response(custom_query_response)["error"]["code"] ==
            WebQuantumSavory.UNSAFE_EVALUATION_DISABLED_CODE
        end

        nonconsuming_list = parse_response(make_request(
          "GET",
          "/tags/$simulation_name";
          query=register_target,
        ))["entries"]
        @test Set(entry["tag_id"] for entry in nonconsuming_list) == Set([
          register_tag_id,
          query_entry_one["tag_id"],
          query_entry_two["tag_id"],
        ])

        integer_collision_response = make_request(
          "POST",
          "/tags/$simulation_name";
          body=merge(slot_one, Dict("tag" => tag_spec("integration_float_exact", 1))),
        )
        @test integer_collision_response.status == 200
        integer_collision = parse_response(integer_collision_response)["entry"]

        float_add_response = make_request(
          "POST",
          "/tags/$simulation_name";
          body=merge(
            register_destination,
            Dict("tag" => float_tag_spec("integration_float_exact", 1.0)),
          ),
        )
        @test float_add_response.status == 200
        float_entry = parse_response(float_add_response)["entry"]

        float_query_response = make_request(
          "POST",
          "/tag_queries/$simulation_name";
          body=merge(register_target, Dict("query" => float_query_spec(
            "integration_float_exact",
            Dict("kind" => "exact", "value" => 1.0),
          ))),
        )
        @test float_query_response.status == 200
        @test [entry["tag_id"] for entry in parse_response(float_query_response)["entries"]] ==
          [float_entry["tag_id"]]
        @test integer_collision["tag_id"] != float_entry["tag_id"]

        missing_target_response = make_request("GET", "/tags/$simulation_name")
        @test missing_target_response.status == 400
        @test parse_response(missing_target_response)["error"]["code"] ==
          "VALIDATION_ERROR"

        missing_slot_response = make_request(
          "GET",
          "/tags/$simulation_name";
          query=Dict("target" => "slot", "slot_id" => "slot_missing"),
        )
        @test missing_slot_response.status == 404

        malformed_attachment = make_request(
          "POST",
          "/tags/$simulation_name";
          body=slot_two,
        )
        @test malformed_attachment.status == 400
        @test parse_response(malformed_attachment)["error"]["code"] ==
          "VALIDATION_ERROR"

        missing_simulation = make_request(
          "GET",
          "/tags/tags_queries_missing_simulation";
          query=register_target,
        )
        @test missing_simulation.status == 404

        block_response = make_request(
          "POST",
          "/dev/manipulate_state";
          body=Dict("name" => simulation_name, "block_reason" => "timeout"),
        )
        @test block_response.status == 200

        blocked_response = make_request(
          "GET",
          "/tags/$simulation_name";
          query=register_target,
        )
        @test blocked_response.status == 400
        blocked_data = parse_response(blocked_response)
        @test occursin("expired", blocked_data["error"]["message"])
      finally
        make_request(
          "POST",
          "/destroy_simulation";
          body=Dict("name" => simulation_name),
        )
      end

      destroyed_response = make_request(
        "GET",
        "/tags/$simulation_name";
        query=register_target,
      )
      @test destroyed_response.status == 404
  end

  # Cleanup after all tests
  @testset "Final Cleanup" begin
      # Clean up any remaining test simulations
      test_names = [TEST_SIMULATION_NAME, "unprepared_sim", "workflow_test_sim", "logs_test_sim", "pause_test_sim", "unprepared_pause_test", "workflow_pause_test_sim"]

      for name in test_names
        try
          state_response = make_request("GET", "/get_state", query=Dict("name" => name))
          if state_response.status == 200
            state = parse_response(state_response)["state"]["simulation"]
            if state["simulation_running"]
              make_request("POST", "/pause_simulation", body=Dict("name" => name))
            end
          end
        catch
          # Best-effort cleanup after a failed test.
        end
        
        try
          make_request("POST", "/destroy_simulation", body=Dict("name" => name))
        catch
          # Ignore errors during cleanup
        end
      end

      true
  end

end
