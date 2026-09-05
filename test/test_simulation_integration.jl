@safetestset "Repeater Simulation Integration Tests" begin
  using HTTP
  using JSON
  using Test

  include("../src/WebQuantumSavory.jl")
  using .WebQuantumSavory

  TEST_BASE_URL = get(
    ENV,
    "WEBQUANTUMSAVORY_TEST_BASE_URL",
    "http://localhost:8000",
  )

  function make_request(method, endpoint; body=nothing)
    url = "$TEST_BASE_URL$endpoint"
    headers = ["Content-Type" => "application/json"]
    if method == "GET"
      return HTTP.get(url, headers; status_exception=false)
    end
    return HTTP.post(url, headers, JSON.json(body); status_exception=false)
  end

  parse_response(response) = JSON.parse(String(response.body))

  protocol_parameter(name, type, value) = Dict(
    "name" => name,
    "type" => type,
    "value" => value,
  )

  protocol(id, type; parameters=Any[]) = Dict(
    "id" => id,
    "type" => type,
    "parameters" => parameters,
  )

  default_slot(id) = Dict(
    "id" => id,
    "type" => "Qubit",
    "backgroundNoise" => Dict(
      "type" => "default",
      "parameters" => Any[],
    ),
  )

  function simulation_node(id, name, slots, protocols)
    Dict(
      "id" => id,
      "name" => name,
      "position" => [0.0, 0.0],
      "data" => Dict(
        "type" => "City",
        "slots" => slots,
        "protocols" => protocols,
      ),
    )
  end

  function simulation_edge(id, source, target, protocols; is_logic=false)
    Dict(
      "id" => id,
      "source" => source,
      "target" => target,
      "isLogic" => is_logic,
      "data" => Dict(
        "type" => "connection",
        "protocols" => protocols,
        (is_logic ? () : (
          "distanceMeters" => 1000.0,
          "propagationDelaySeconds" => 0.000005,
          "refractiveIndex" => 1.5,
          "lossDbPerKm" => 0.2,
          "transmissivity" => 0.95,
        ))...,
      ),
    )
  end

  function repeater_chain_payload(name)
    tracker(node) = protocol(
      "tracker-$node",
      "QuantumSavory.ProtocolZoo.EntanglementTracker",
    )
    entangler(id, slot_a, slot_b) = protocol(
      id,
      "QuantumSavory.ProtocolZoo.EntanglerProt";
      parameters=Any[
        protocol_parameter("success_prob", "Float64", 1.0),
        protocol_parameter("attempt_time", "Float64", 0.01),
        protocol_parameter("retry_lock_time", "Float64", 0.01),
        protocol_parameter("rounds", "Int64", 1),
        protocol_parameter("chooseslotA", "Int64", slot_a),
        protocol_parameter("chooseslotB", "Int64", slot_b),
      ],
    )
    eager_low_predicate = """
    let start_node = nodeid("A"),
        start_repeater = nodeid("Repeater-1")
        function eager_low_predicate(x)
            return (start_repeater <= x < self) || x == start_node
        end
    end
    """
    eager_high_predicate = """
    let end_node = nodeid("B"),
        end_repeater = nodeid("Repeater-1")
        function eager_high_predicate(x)
            return (self < x <= end_repeater) || x == end_node
        end
    end
    """
    swapper = protocol(
      "swapper-repeater",
      "QuantumSavory.ProtocolZoo.SwapperProt";
      parameters=Any[
        protocol_parameter("nodeL", "Function", eager_low_predicate),
        protocol_parameter("nodeH", "Function", eager_high_predicate),
        protocol_parameter("retry_lock_time", "Float64", 0.01),
        protocol_parameter("rounds", "Int64", 1),
      ],
    )
    consumer = protocol(
      "consumer-a-b",
      "QuantumSavory.ProtocolZoo.EntanglementConsumer";
      parameters=Any[
        protocol_parameter("period", "Float64", 0.05),
      ],
    )

    Dict(
      "name" => name,
      "simulationConfig" => Dict(
        "qubitRepresentation" => "QuantumOpticsRepr",
        "qumodeRepresentation" => "QuantumOpticsRepr",
      ),
      "variables" => Any[],
      "net" => Dict(
        # Generated chains keep selected endpoints before newly added repeaters.
        "nodes" => Any[
          simulation_node("node-a", "A", Any[default_slot("slot-a")], Any[tracker("a")]),
          simulation_node("node-b", "B", Any[default_slot("slot-b")], Any[tracker("b")]),
          simulation_node(
            "node-r",
            "Repeater-1",
            Any[default_slot("slot-r-left"), default_slot("slot-r-right")],
            Any[tracker("r"), swapper],
          ),
        ],
        "edges" => Any[
          simulation_edge("edge-a-r", "node-a", "node-r", Any[entangler("entangler-a-r", 1, 1)]),
          simulation_edge("edge-r-b", "node-r", "node-b", Any[entangler("entangler-r-b", 2, 1)]),
          simulation_edge("edge-a-b", "node-a", "node-b", Any[consumer]; is_logic=true),
        ],
        "protocols" => Any[],
      ),
    )
  end

  function wait_for_completion(name; timeout=60.0)
    deadline = time() + timeout
    last_state = nothing
    escaped_name = HTTP.escapeuri(name)
    while time() < deadline
      response = make_request("GET", "/get_state?name=$escaped_name")
      if response.status == 200
        last_state = parse_response(response)["state"]
        !last_state["simulation"]["simulation_running"] && return last_state
      end
      sleep(0.05)
    end
    error("Timed out waiting for simulation $name; last state: $last_state")
  end

  @testset "three-node chain completes and consumes an end-to-end pair" begin
    simulation_name = "repeater_chain_simulation_integration_$(getpid())"
    simulation_target = 0.1
    payload = repeater_chain_payload(simulation_name)

    try
      prepare_response = make_request(
        "POST",
        "/prepare_simulation";
        body=payload,
      )
      @test prepare_response.status == 200
      prepared = parse_response(prepare_response)
      @test prepared["status"] == WebQuantumSavory.STATUS_PREPARED
      @test prepared["protocols_launched"] == Dict(
        "nodes" => 4,
        "edges" => 3,
        "floating" => 0,
      )

      run_response = make_request(
        "POST",
        "/run_simulation";
        body=Dict("name" => simulation_name, "time_units" => simulation_target),
      )
      @test run_response.status == 202
      @test parse_response(run_response)["success"] == true

      final_state = wait_for_completion(simulation_name)
      @test final_state["simulation"]["simulation_error"] === nothing
      @test final_state["simulation"]["simulation_progress"] >= simulation_target

      protocol_response = make_request(
        "GET",
        "/protocols/$simulation_name/consumer-a-b",
      )
      @test protocol_response.status == 200
      protocol_data = parse_response(protocol_response)
      @test protocol_data["success"] == true
      @test protocol_data["protocol_type"] == "QuantumSavory.ProtocolZoo.EntanglementConsumer"

      consumer_html = String(WebQuantumSavory.base64decode(protocol_data["html_base64"]))
      consumed_pairs = match(r"<dt>Consumed pairs</dt>\s*<dd>(\d+)</dd>", consumer_html)
      @test consumed_pairs !== nothing
      if consumed_pairs !== nothing
        @test parse(Int, consumed_pairs.captures[1]) >= 1
      end
    finally
      make_request(
        "POST",
        "/destroy_simulation";
        body=Dict("name" => simulation_name),
      )
    end
  end

  @testset "diagnostic protocol reports a structured simulator panic" begin
    simulation_name = "mock_broken_protocol_integration_$(getpid())"
    payload = repeater_chain_payload(simulation_name)
    payload["net"]["protocols"] = Any[
      protocol("broken-diagnostic", WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE),
    ]

    try
      catalog_response = make_request("GET", "/protocol_types")
      @test catalog_response.status == 200
      catalog = parse_response(catalog_response)["protocol_types"]
      diagnostic = only(filter(
        entry -> entry["type"] == WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE,
        catalog,
      ))
      @test diagnostic["group"] == "floating"

      prepare_response = make_request(
        "POST",
        "/prepare_simulation";
        body=payload,
      )
      @test prepare_response.status == 200
      @test parse_response(prepare_response)["protocols_launched"]["floating"] == 1

      run_response = make_request(
        "POST",
        "/run_simulation";
        body=Dict("name" => simulation_name, "time_units" => 0.1),
      )
      @test run_response.status == 202

      final_state = wait_for_completion(simulation_name)
      @test occursin("BoundsError", final_state["simulation"]["simulation_error"])
      panic = final_state["simulation"]["simulation_panic"]
      @test panic !== nothing
      @test panic["source"] == "Simulator"
      @test panic["severity"] == "panic"
      @test panic["exception_type"] == "BoundsError"
      @test occursin("index [100]", panic["message"])
      @test occursin("MockBrokenProtocol", panic["stacktrace"])

      logs_response = make_request(
        "GET",
        "/logs/$(HTTP.escapeuri(simulation_name))?purge=false",
      )
      @test logs_response.status == 200
      logs = parse_response(logs_response)["logs"]
      panic_log = only(filter(log -> get(log, "severity", nothing) == "panic", logs))
      @test panic_log["id"] == panic["id"]
      @test !any(log -> get(log, "message", nothing) == "Error running simulation", logs)

      export_response = make_request("POST", "/export_script"; body=payload)
      @test export_response.status == 400
      export_error = parse_response(export_response)
      @test export_error["error_code"] == "VALIDATION_ERROR"
      @test occursin("diagnostic-only", export_error["error"])
    finally
      make_request(
        "POST",
        "/destroy_simulation";
        body=Dict("name" => simulation_name),
      )
    end
  end
end
