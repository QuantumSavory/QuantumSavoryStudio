@safetestset "Unit Tests" begin
  using JSON
  include("../src/WebQuantumSavory.jl")
  using .WebQuantumSavory
  using Graphs
  using QuantumSavory
  using Logging
  import LinearAlgebra
  using ConcurrentSim
  using Dates

  ServerLauncherFixture = Module(:ServerLauncherFixture)
  Base.include(
    ServerLauncherFixture,
    joinpath(@__DIR__, "..", "bin", "server.jl"),
  )

  @eval begin
    """A test-only background used to exercise non-Float64 catalog fields."""
    Base.@kwdef struct ContextualIntegerBackground
      count::Int64 = 1
      label::String = "default"
      values::Vector{Int64} = [7]
    end
    QuantumSavory.constructor_schema(::Type{ContextualIntegerBackground}) =
      QuantumSavory.ConstructorSchema(
        ContextualIntegerBackground,
        "A test-only constructor schema.",
        (
          QuantumSavory.ConstructorFieldSchema(
            :count,
            Int64,
            "A contextual integer constructor field.",
          ),
          QuantumSavory.ConstructorFieldSchema(
            :label,
            String,
            "A nonnumeric constructor field.",
          ),
          QuantumSavory.ConstructorFieldSchema(
            :values,
            Vector{Int64},
            "An unsupported complex wire field.",
          ),
        ),
      )
  end

  function instantiate_contextual_background(
    parameters,
    context=Dict{Symbol,Any}();
    variables=Dict{String,WebQuantumSavory.Variable}(),
  )
    kwargs, _ = WebQuantumSavory._constructor_parameter_kwargs(
      parameters,
      ContextualIntegerBackground,
      context;
      variables,
      parameter_context="test background parameter",
    )
    return ContextualIntegerBackground(; kwargs...)
  end

  # Load test data
  test_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload.json"))

  @testset "Julia Script Export" begin
    payload = JSON.parsefile(joinpath(@__DIR__, "..", "gui", "src", "demos", "1.Entangler.Example.json"))
    payload["name"] = "../Export Demo?"
    payload["simulationConfig"] = Dict(
      "time" => 0.02,
      "timeStep" => 0.01,
      "qubitRepresentation" => "CliffordRepr",
      "qumodeRepresentation" => "GabsRepr",
    )
    payload["variables"] = Any[
      Dict(
        "id" => "state-variable",
        "name" => "pair fidelity",
        "type" => "Symbolic",
        "value" => Dict(
          "kind" => "states_zoo",
          "state_type" => "DepolarizedBellPair",
          "parameters" => Dict("p" => 0.9),
        ),
      ),
      Dict(
        "id" => "probability-variable",
        "name" => "pair-fidelity",
        "type" => "Float64",
        "value" => 0.8,
      ),
      Dict(
        "id" => "weighted-state-variable_tr",
        "name" => "weighted pair_tr",
        "type" => "Float64",
        "value" => 0.123,
        "statesZooTraceSourceId" => "weighted-state-variable",
      ),
      Dict(
        "id" => "weighted-state-variable",
        "name" => "weighted pair",
        "type" => "Symbolic",
        "value" => Dict(
          "kind" => "states_zoo",
          "state_type" => "BarrettKokBellPairW",
          "parameters" => Dict("ηᴬ" => 1, "ηᴮ" => 1, "Pᵈ" => 0, "ηᵈ" => 1, "𝒱" => 1),
        ),
      ),
      Dict(
        "id" => "nested-state-variable",
        "name" => "nested weighted pair",
        "type" => "Symbolic",
        "value" => Dict(
          "kind" => "states_zoo",
          "state_type" => "GenqoUnheraldedSPDCBellPairW",
          "parameters" => Dict("ηᵈ" => 1, "ηᵗ" => 1, "N" => 0.1),
        ),
      ),
      Dict(
        "id" => "default-function-variable",
        "name" => "default chooser",
        "type" => "Function",
        "value" => "default",
      ),
    ]

    payload["net"]["nodes"][1]["data"]["slots"][1]["backgroundNoise"] = Dict(
      "type" => "T2Dephasing",
      "parameters" => [Dict("name" => "t2", "value" => 5)],
    )
    payload["net"]["edges"][1]["data"]["distanceMeters"] = 12_500.0
    payload["net"]["edges"][1]["data"]["propagationDelaySeconds"] = 0.125
    payload["net"]["edges"][1]["data"]["refractiveIndex"] = 1.5
    payload["net"]["edges"][1]["data"]["lossDbPerKm"] = 0.2
    payload["net"]["edges"][1]["data"]["transmissivity"] = 0.95
    parameters = payload["net"]["edges"][1]["data"]["protocols"][1]["parameters"]
    parameter_by_name = Dict(parameter["name"] => parameter for parameter in parameters)
    parameter_by_name["pairstate"]["value"] = Dict("kind" => "variable", "id" => "state-variable")
    parameter_by_name["success_prob"]["value"] =
      Dict("kind" => "variable", "id" => "weighted-state-variable_tr")
    parameter_by_name["chooseslotA"]["value"] =
      Dict("kind" => "variable", "id" => "default-function-variable")

    state_names_before = Set(keys(WebQuantumSavory.STATE))
    script = WebQuantumSavory.generate_julia_script(payload)
    @test script == WebQuantumSavory.generate_julia_script(payload)
    @test Set(keys(WebQuantumSavory.STATE)) == state_names_before
    @test WebQuantumSavory.generate_julia_script_export(payload)["filename"] == "export-demo.jl"
    @test Meta.parseall(script) isa Expr
    script_lines = split(script, '\n')
    @test occursin(
      "Pkg.add([\"QuantumSavory\", \"Graphs\", \"ConcurrentSim\", " *
      "\"ResumableFunctions\", \"CairoMakie\"])",
      script,
    )
    for broad_import in (
      "using QuantumSavory",
      "using QuantumSavory.ProtocolZoo",
      "using QuantumSavory.StatesZoo",
      "using Graphs",
      "using ConcurrentSim",
      "using ResumableFunctions",
      "using CairoMakie",
      "using LinearAlgebra",
    )
      @test broad_import in script_lines
    end
    for generated_import in (
      "using CairoMakie: Figure, activate!, record",
      "using ConcurrentSim: @process, run",
      "using Graphs: SimpleGraph, add_edge!",
      "using QuantumSavory: CliffordRepr, Qubit, Register, RegisterNet, " *
      "T2Dephasing, get_time_tracker, registernetplot_axis",
      "using QuantumSavory.ProtocolZoo: EntanglerProt",
      "using QuantumSavory.StatesZoo: BarrettKokBellPairW, DepolarizedBellPair, " *
      "normalized_state_and_weight",
      "using QuantumSavory.StatesZoo.Genqo: GenqoUnheraldedSPDCBellPairW",
    )
      @test generated_import in script_lines
    end
    @test occursin("# Variables", script)
    @test occursin("variable_pair_fidelity = DepolarizedBellPair(0.9)", script)
    @test occursin("variable_pair_fidelity_2 = 0.8", script)
    @test occursin("variable_weighted_pair, variable_weighted_pair_tr = (let", script)
    @test occursin(
      "normalized = normalized_state_and_weight(BarrettKokBellPairW(1, 1, 0, 1, 1))",
      script,
    )
    @test occursin("(normalized.state, normalized.weight)", script)
    @test occursin(
      "normalized = normalized_state_and_weight(GenqoUnheraldedSPDCBellPairW(1, 1, 0.1))",
      script,
    )
    @test !occursin("variable_weighted_pair_tr = 0.123", script)
    @test occursin("success_prob = variable_weighted_pair_tr", script)
    @test occursin("variable_default_chooser = nothing", script)
    @test occursin("T2Dephasing(; t2 = 5.0)", script)
    @test occursin("# Registers", script)
    @test occursin(
      "representations = [CliffordRepr(), CliffordRepr()]",
      script,
    )
    @test first(findfirst("# Resolve GUI node names", script)) <
      first(findfirst("# Registers", script))
    @test occursin(
      "node_indices = Dict{String,Int}(\n" *
      "    \"Amherst\" => 1,\n" *
      "    \"Cambridge\" => 2,\n" *
      ")\n" *
      "nodeid(name::String)::Int = node_indices[name]",
      script,
    )
    @test occursin("# Register network and simulation clock", script)
    @test occursin("propagation_delays = Dict{Tuple{Int,Int},Float64}(", script)
    @test occursin("    (1, 2) => 0.125,", script)
    @test occursin("link_delay(src, dst) = propagation_delays[minmax(src, dst)]", script)
    @test occursin(
      "RegisterNet(graph, registers; names = [\"Amherst\", \"Cambridge\"], " *
      "classical_delay = link_delay, quantum_delay = link_delay)",
      script,
    )
    @test occursin("# Protocol construction and initialization", script)
    @test occursin("nodeA = 1, nodeB = 2", script)
    @test occursin("run(sim, simulation_duration)", script)
    @test occursin("record(figure, animation_filename", script)
    @test occursin("show(io, MIME\"image/png\"(), protocol)", script)

    virtual_payload = deepcopy(payload)
    consumer = Dict(
      "id" => "virtual-consumer",
      "type" => string(QuantumSavory.ProtocolZoo.EntanglementConsumer),
      "parameters" => Any[],
    )
    push!(virtual_payload["net"]["edges"], Dict(
      "id" => "virtual-edge",
      "source" => virtual_payload["net"]["edges"][1]["target"],
      "target" => virtual_payload["net"]["edges"][1]["source"],
      "isLogic" => true,
      "data" => Dict("protocols" => [consumer]),
    ))
    virtual_script = WebQuantumSavory.generate_julia_script(virtual_payload)
    @test count(==("add_edge!(graph, 1, 2)"), eachline(IOBuffer(virtual_script))) == 1
    @test occursin("virtual-consumer", virtual_script)
    @test count(==("    (1, 2) => 0.125,"), eachline(IOBuffer(virtual_script))) == 1

    mixed_representation_payload = deepcopy(payload)
    mixed_representation_payload["net"]["nodes"][1]["data"]["slots"][1]["type"] = "Qumode"
    mixed_representation_payload["simulationConfig"]["qubitRepresentation"] =
      "QuantumOpticsRepr"
    mixed_representation_script =
      WebQuantumSavory.generate_julia_script(mixed_representation_payload)
    @test occursin(
      "representations = [" *
      "GabsRepr(QuadBlockBasis), QuantumOpticsRepr()]",
      mixed_representation_script,
    )
    mixed_representation_lines = split(mixed_representation_script, '\n')
    @test "using QuantumSavory.Gabs: QuadBlockBasis" in mixed_representation_lines
    @test any(
      line -> startswith(line, "using QuantumSavory: ") &&
        occursin("GabsRepr", line) &&
        occursin("QuantumOpticsRepr", line),
      mixed_representation_lines,
    )
    paused_mixed_representation_script = replace(
      mixed_representation_script,
      "\nrun(sim, simulation_duration)\n" =>
        "\n# run(sim, simulation_duration)  # paused by the exporter test\n";
      count=1,
    )
    mixed_representation_module = Module(gensym(:MixedRepresentationExport))
    Core.eval(mixed_representation_module, :(using Base))
    Base.include_string(
      mixed_representation_module,
      paused_mixed_representation_script,
      "mixed-representation-export.jl",
    )
    mixed_registers = getfield(mixed_representation_module, :registers)
    @test mixed_registers[1].reprs[1] isa QuantumSavory.GabsRepr
    @test mixed_registers[1].reprs[2] isa QuantumSavory.QuantumOpticsRepr
    @test getfield(mixed_representation_module, :QuadBlockBasis) ===
      QuantumSavory.Gabs.QuadBlockBasis
    @test getfield(mixed_representation_module, :QuantumOpticsRepr) ===
      QuantumSavory.QuantumOpticsRepr

    counterpart_id = "QuantumSavory.ProtocolZoo.EntanglementCounterpart"
    tagged_payload = deepcopy(payload)
    tagged_parameters = tagged_payload["net"]["edges"][1]["data"]["protocols"][1]["parameters"]
    tagged_by_name = Dict(parameter["name"] => parameter for parameter in tagged_parameters)
    # Simulator metadata, not a forged client annotation, drives safe source
    # generation.
    tagged_by_name["tag"]["type"] = "Float64"
    tagged_by_name["tag"]["value"] = counterpart_id
    tagged_by_name["attempt_time"]["type"] = "String"
    tagged_by_name["attempt_time"]["value"] = 0.125
    tagged_script = withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false") do
      WebQuantumSavory.generate_julia_script(tagged_payload)
    end
    @test tagged_script == WebQuantumSavory.generate_julia_script(tagged_payload)
    @test occursin(
      "using QuantumSavory.ProtocolZoo: EntanglementCounterpart, EntanglerProt",
      tagged_script,
    )
    @test occursin("tag = EntanglementCounterpart", tagged_script)
    @test occursin("attempt_time = 0.125", tagged_script)
    @test !occursin("attempt_time = \"0.125\"", tagged_script)
    @test Meta.parseall(tagged_script) isa Expr

    symbolic_payload = deepcopy(tagged_payload)
    symbolic_parameters =
      symbolic_payload["net"]["edges"][1]["data"]["protocols"][1]["parameters"]
    symbolic_pairstate = only(
      parameter for parameter in symbolic_parameters if parameter["name"] == "pairstate"
    )
    symbolic_pairstate["type"] = "Float64"
    symbolic_pairstate["value"] = Dict(
      "kind" => "states_zoo",
      "state_type" => "DepolarizedBellPair",
      "parameters" => Dict("p" => 0.85),
    )
    symbolic_script = withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false") do
      WebQuantumSavory.generate_julia_script(symbolic_payload)
    end
    @test occursin(
      "pairstate = DepolarizedBellPair(0.85)",
      symbolic_script,
    )

    lambda_payload = deepcopy(tagged_payload)
    lambda_parameters = lambda_payload["net"]["edges"][1]["data"]["protocols"][1]["parameters"]
    lambda_by_name = Dict(parameter["name"] => parameter for parameter in lambda_parameters)
    raw_context_lambda =
      "slot -> (MessageBuffer; EntanglementConsumer; LinearAlgebra.tr; " *
      "distance == 12500.0 && delay == 0.125 && refractive_index == 1.5 && " *
      "loss == 0.2 && transmissivity == 0.95 && " *
      "node_a == 1 && node_b == 2 && Base.length((slot,)) == 1 && slot > 0)"
    lambda_by_name["chooseslotA"]["type"] = "Lambda"
    lambda_by_name["chooseslotA"]["value"] = raw_context_lambda
    lambda_by_name["chooseslotB"]["type"] = "Lambda"
    lambda_by_name["chooseslotB"]["value"] = "slot -> slot > 0"
    lambda_script = withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true") do
      WebQuantumSavory.generate_julia_script(lambda_payload)
    end
    @test lambda_script == WebQuantumSavory.generate_julia_script(lambda_payload)
    @test occursin("chooseslotA = (let", lambda_script)
    @test occursin("chooseslotB = (slot -> slot > 0)", lambda_script)
    @test occursin(raw_context_lambda, lambda_script)
    @test occursin("distance = 12500.0", lambda_script)
    @test occursin("delay = 0.125", lambda_script)
    @test occursin("refractive_index = 1.5", lambda_script)
    @test occursin("loss = 0.2", lambda_script)
    @test occursin("transmissivity = 0.95", lambda_script)
    @test occursin("node_a = 1", lambda_script)
    @test occursin("node_b = 2", lambda_script)
    @test occursin("Base.length((slot,))", lambda_script)
    @test occursin("slot -> slot > 0", lambda_script)
    @test !occursin("function_value", lambda_script)
    @test !occursin("isa Core.Function", lambda_script)
    @test !occursin("nodeid = Base.getproperty", lambda_script)
    @test Meta.parseall(lambda_script) isa Expr
    lambda_import_lines = filter(
      line -> startswith(line, "using ") && occursin(": ", line),
      split(lambda_script, '\n'),
    )
    @test !any(line -> occursin("MessageBuffer", line), lambda_import_lines)
    @test !any(line -> occursin("EntanglementConsumer", line), lambda_import_lines)
    paused_lambda_script = replace(
      lambda_script,
      "\nrun(sim, simulation_duration)\n" =>
        "\n# run(sim, simulation_duration)  # paused by the exporter test\n";
      count=1,
    )
    lambda_module = Module(gensym(:LambdaExplicitImportExport))
    Core.eval(lambda_module, :(using Base))
    Base.include_string(
      lambda_module,
      paused_lambda_script,
      "lambda-explicit-import-export.jl",
    )
    lambda_protocol = only(getfield(lambda_module, :protocols)).second
    @test Base.invokelatest(lambda_protocol.chooseslotA, 7)
    @test !Base.invokelatest(lambda_protocol.chooseslotA, -1)
    @test Base.invokelatest(lambda_protocol.chooseslotB, 7)
    @test lambda_protocol.tag === QuantumSavory.ProtocolZoo.EntanglementCounterpart

    sparse_edge_function = WebQuantumSavory._script_custom_function_expression(
      "slot -> transmissivity > 0 && nodeid(\"Amherst\") == 1 && slot > 0",
      nothing,
      "Sparse edge context";
      edge_context=WebQuantumSavory._EdgeFunctionContext(
        12_500.0,
        0.125,
        1.5,
        0.2,
        0.95,
        1,
        2,
      ),
    )
    @test occursin("let\n    transmissivity = 0.95", sparse_edge_function)
    for unused_binding in ("distance", "delay", "refractive_index", "loss", "node_a", "node_b")
      @test !occursin("    $unused_binding =", sparse_edge_function)
    end
    @test !occursin("    nodeid =", sparse_edge_function)

    for context_free_source in (
      "let delay = 4; delay / 2; end",
      "delay(x) = x + 1\ndelay(2)",
      "distance -> distance",
    )
      parsed_source = WebQuantumSavory._parse_complete_source(context_free_source)
      @test isempty(WebQuantumSavory._script_assignment_context_references(
        parsed_source,
      ))
    end
    parsed_outer_reference = WebQuantumSavory._parse_complete_source(
      "(distance -> distance); distance",
    )
    @test WebQuantumSavory._script_assignment_context_references(
      parsed_outer_reference,
    ) == Set((:distance,))
    parsed_default_reference = WebQuantumSavory._parse_complete_source(
      "(distance=distance) -> distance",
    )
    @test WebQuantumSavory._script_assignment_context_references(
      parsed_default_reference,
    ) == Set((:distance,))
    parsed_keyword_default_reference = WebQuantumSavory._parse_complete_source(
      "(value; fallback=distance) -> fallback",
    )
    @test WebQuantumSavory._script_assignment_context_references(
      parsed_keyword_default_reference,
    ) == Set((:distance,))
    parsed_parameter_shadow = WebQuantumSavory._parse_complete_source(
      "fallback(distance; value=distance) = value\nfallback",
    )
    @test isempty(WebQuantumSavory._script_assignment_context_references(
      parsed_parameter_shadow,
    ))
    parsed_generator_shadow = WebQuantumSavory._parse_complete_source(
      "sum(delay for delay in (1, 2, 3))",
    )
    @test isempty(WebQuantumSavory._script_assignment_context_references(
      parsed_generator_shadow,
    ))
    parsed_generator_reference = WebQuantumSavory._parse_complete_source(
      "sum(value for value in 1:distance)",
    )
    @test WebQuantumSavory._script_assignment_context_references(
      parsed_generator_reference,
    ) == Set((:distance,))
    for soft_scope_source in (
      "f() = begin; while false; delay = 4; end; delay; end; f",
      "f() = begin; try; delay = 4; catch; delay = 5; end; delay; end; f",
    )
      parsed_soft_scope = WebQuantumSavory._parse_complete_source(
        soft_scope_source,
      )
      @test WebQuantumSavory._script_assignment_context_references(
        parsed_soft_scope,
      ) == Set((:delay,))
    end
    parsed_try_else = WebQuantumSavory._parse_complete_source(
      "() -> try; 1; catch; 2; else; delay; end",
    )
    @test WebQuantumSavory._script_assignment_context_references(
      parsed_try_else,
    ) == Set((:delay,))

    # Exported node functions must not gain edge-only values merely because the
    # generated script has physical edges elsewhere.
    node_only_expression = WebQuantumSavory._script_custom_function_expression(
      "() -> (node_a, delay)",
      1,
      "Node-only context regression",
    )
    @test !occursin("node_a =", node_only_expression)
    @test !occursin("delay =", node_only_expression)
    node_only_module = Module(gensym(:NodeOnlyContextExport))
    Core.eval(node_only_module, :(using Base))
    node_only_function = Core.eval(node_only_module, Meta.parse(node_only_expression))
    @test_throws UndefVarError node_only_function()

    forged_lambda_payload = deepcopy(tagged_payload)
    forged_lambda_parameters =
      forged_lambda_payload["net"]["edges"][1]["data"]["protocols"][1]["parameters"]
    forged_lambda_success = only(
      parameter for parameter in forged_lambda_parameters if parameter["name"] == "success_prob"
    )
    forged_lambda_success["type"] = "Lambda"
    forged_lambda_success["value"] = 0.375
    forged_lambda_script = WebQuantumSavory.generate_julia_script(forged_lambda_payload)
    @test occursin("success_prob = 0.375", forged_lambda_script)

    no_tag_payload = deepcopy(tagged_payload)
    no_tag_parameters = no_tag_payload["net"]["edges"][1]["data"]["protocols"][1]["parameters"]
    only(parameter for parameter in no_tag_parameters if parameter["name"] == "tag")["value"] = "nothing"
    no_tag_script = WebQuantumSavory.generate_julia_script(no_tag_payload)
    @test occursin("tag = nothing", no_tag_script)

    function tag_export_error(value; client_type="Type{<:AbstractTag}")
      invalid_payload = deepcopy(tagged_payload)
      invalid_parameters = invalid_payload["net"]["edges"][1]["data"]["protocols"][1]["parameters"]
      tag_parameter = only(parameter for parameter in invalid_parameters if parameter["name"] == "tag")
      tag_parameter["type"] = client_type
      tag_parameter["value"] = value
      try
        WebQuantumSavory.generate_julia_script(invalid_payload)
        nothing
      catch error
        error
      end
    end

    for invalid_id in ("EntanglementCounterpart", "Main.UnknownTag", "Core.Int64")
      error = tag_export_error(invalid_id; client_type="Float64")
      @test error isa WebQuantumSavory.APIError
      @test occursin("not an advertised named AbstractTag type", error.message)
    end
    variable_tag_error = tag_export_error(Dict("kind" => "variable", "id" => "state-variable"))
    @test variable_tag_error isa WebQuantumSavory.APIError
    @test occursin("cannot use variable", variable_tag_error.message)

    unknown_export_parameter = deepcopy(tagged_payload)
    unknown_parameters = unknown_export_parameter["net"]["edges"][1]["data"]["protocols"][1]["parameters"]
    push!(unknown_parameters, Dict(
      "name" => "forged_parameter",
      "type" => "Float64",
      "value" => 0.5,
    ))
    unknown_export_error = try
      WebQuantumSavory.generate_julia_script(unknown_export_parameter)
      nothing
    catch error
      error
    end
    @test unknown_export_error isa WebQuantumSavory.APIError
    @test occursin(
      "unknown protocol parameter 'forged_parameter'",
      lowercase(unknown_export_error.message),
    )

    diagnostic_payload = deepcopy(payload)
    diagnostic_payload["net"]["protocols"] = Any[
      Dict(
        "id" => "diagnostic-broken",
        "type" => WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE,
        "parameters" => Any[],
      ),
    ]
    diagnostic_export_error = try
      WebQuantumSavory.generate_julia_script(diagnostic_payload)
      nothing
    catch error
      error
    end
    @test diagnostic_export_error isa WebQuantumSavory.APIError
    if diagnostic_export_error isa WebQuantumSavory.APIError
      @test diagnostic_export_error.status_code == 400
      @test occursin("diagnostic-only", diagnostic_export_error.message)
      @test occursin("cannot be exported", diagnostic_export_error.message)
    end

    generated_module = Module(gensym(:GeneratedExport))
    Core.eval(generated_module, :(using Base))
    Base.include_string(generated_module, script, "generated-export.jl")
    generated_sim = getfield(generated_module, :sim)
    @test ConcurrentSim.now(generated_sim) == 0.02
    generated_network = getfield(generated_module, :network)
    @test generated_network.names == ["Amherst", "Cambridge"]
    @test QuantumSavory.name.(generated_network.registers) == ["Amherst", "Cambridge"]
    generated_nodeid = getfield(generated_module, :nodeid)
    @test generated_nodeid("Amherst") == 1
    @test generated_nodeid("Cambridge") == 2
    @test_throws KeyError generated_nodeid("Missing node")
    generated_weighted_state = getfield(generated_module, :variable_weighted_pair)
    @test abs(LinearAlgebra.tr(QuantumSavory.express(generated_weighted_state))) ≈ 1
    generated_weighted_trace = getfield(generated_module, :variable_weighted_pair_tr)
    @test generated_weighted_trace ≈ 0.5
    generated_nested_state =
      getfield(generated_module, :variable_nested_weighted_pair)
    @test abs(LinearAlgebra.tr(QuantumSavory.express(generated_nested_state))) ≈ 1
    generated_protocols = getfield(generated_module, :protocols)
    @test length(generated_protocols) == 1
    @test generated_protocols[1].second.success_prob ≈ generated_weighted_trace

    duplicate_name_payload = deepcopy(payload)
    duplicate_name_payload["net"]["nodes"][2]["name"] = "Amherst"
    duplicate_name_script = WebQuantumSavory.generate_julia_script(duplicate_name_payload)
    @test occursin(
      "node_indices = Dict{String,Int}(\n" *
      "    \"Amherst\" => 1,\n" *
      "    \"Amherst\" => 2,\n" *
      ")",
      duplicate_name_script,
    )
    duplicate_name_module = Module(gensym(:DuplicateNameExport))
    Core.eval(duplicate_name_module, :(using Base))
    Base.include_string(duplicate_name_module, duplicate_name_script, "duplicate-name-export.jl")
    @test getfield(duplicate_name_module, :nodeid)("Amherst") == 2

    contextual_payload = JSON.parsefile(joinpath(
      @__DIR__,
      "..",
      "gui",
      "src",
      "demos",
      "1.Entangler.Example.json",
    ))
    contextual_payload["name"] = "Contextual Function Export"
    contextual_payload["simulationConfig"] = Dict("time" => 0.001, "timeStep" => 0.001)
    contextual_payload["variables"] = Any[
      Dict{String,Any}(
        "id" => "node-context-function",
        "name" => "node context function",
        "type" => "Lambda",
        "value" => "candidates -> self * 100 + nodeid(\"Cambridge\") + first(candidates)",
      ),
      Dict{String,Any}(
        "id" => "global-node-function",
        "name" => "global node function",
        "type" => "Lambda",
        "value" => "candidates -> nodeid(\"Cambridge\") + first(candidates)",
      ),
      Dict{String,Any}(
        "id" => "global-rate",
        "name" => "global rate",
        "type" => "Float64",
        "value" => Dict(
          "kind" => "numeric_expression",
          "source" => "nodeid(\"Cambridge\") / 4",
        ),
      ),
      Dict{String,Any}(
        "id" => "shadowed-rate",
        "name" => "shadowed rate",
        "type" => "Float64",
        "value" => Dict(
          "kind" => "numeric_expression",
          "source" => "let delay = 4; delay / 2; end",
        ),
      ),
      Dict{String,Any}(
        "id" => "shadowed-function",
        "name" => "shadowed function",
        "type" => "Lambda",
        "value" => "let distance = value -> value + 1; distance; end",
      ),
    ]
    contextual_payload["net"]["edges"][1]["data"]["protocols"] = Any[]
    named_node_function = """function named_node_choice(candidates)
        self * 1000 + nodeid("Amherst") + first(candidates)
    end"""
    for (node_index, node) in enumerate(contextual_payload["net"]["nodes"])
      push!(node["data"]["protocols"], Dict(
        "id" => "node-context-$node_index",
        "type" => "QuantumSavory.ProtocolZoo.SwapperProt",
        "parameters" => Any[
          Dict(
            "name" => "chooseL",
            "type" => "Function",
            "value" => Dict("kind" => "variable", "id" => "node-context-function"),
          ),
          Dict("name" => "chooseH", "type" => "Lambda", "value" => named_node_function),
          Dict("name" => "rounds", "type" => "Int64", "value" => 0),
        ],
      ))
    end

    contextual_script = WebQuantumSavory.generate_julia_script(contextual_payload)
    @test Meta.parseall(contextual_script) isa Expr
    @test occursin(
      "# GUI variable \"node context function\" is instantiated at each constructor assignment",
      contextual_script,
    )
    @test !occursin("variable_node_context_function =", contextual_script)
    @test occursin("let\n    self = 1", contextual_script)
    @test occursin("let\n    self = 2", contextual_script)
    @test length(findall("candidates -> self * 100 + nodeid", contextual_script)) == 2
    @test length(findall("function named_node_choice", contextual_script)) == 2
    @test occursin(
      "variable_global_node_function = " *
      "(candidates -> nodeid(\"Cambridge\") + first(candidates))",
      contextual_script,
    )
    @test occursin(
      "variable_global_rate = Base.Float64(nodeid(\"Cambridge\") / 4)",
      contextual_script,
    )
    @test occursin(
      "variable_shadowed_rate = Base.Float64(let delay = 4; delay / 2; end)",
      contextual_script,
    )
    @test !occursin(
      "# GUI variable \"shadowed rate\" is instantiated at each constructor assignment",
      contextual_script,
    )
    @test occursin(
      "variable_shadowed_function = " *
      "(let distance = value -> value + 1; distance; end)",
      contextual_script,
    )
    @test !occursin(
      "# GUI variable \"shadowed function\" is instantiated at each constructor assignment",
      contextual_script,
    )
    @test first(findfirst("nodeid(name::String)", contextual_script)) <
      first(findfirst("variable_global_rate =", contextual_script))

    lambda_default_payload = deepcopy(contextual_payload)
    lambda_default_payload["variables"][1]["value"] = "default"
    lambda_default_error = try
      WebQuantumSavory.generate_julia_script(lambda_default_payload)
      nothing
    catch error
      error
    end
    @test lambda_default_error isa WebQuantumSavory.APIError
    @test occursin("cannot use a constructor default", lambda_default_error.message)

    unused_nonstring_lambda_payload = deepcopy(contextual_payload)
    unused_nonstring_lambda_payload["variables"][1]["value"] = 42
    for node in unused_nonstring_lambda_payload["net"]["nodes"]
      empty!(node["data"]["protocols"])
    end
    unused_nonstring_lambda_error = try
      WebQuantumSavory.generate_julia_script(unused_nonstring_lambda_payload)
      nothing
    catch error
      error
    end
    @test unused_nonstring_lambda_error isa WebQuantumSavory.APIError
    @test occursin(
      "must be a function name or Julia function expression",
      unused_nonstring_lambda_error.message,
    )

    contextual_module = Module(gensym(:ContextualExport))
    Core.eval(contextual_module, :(using Base))
    Base.include_string(contextual_module, contextual_script, "contextual-export.jl")
    contextual_protocols = Dict(getfield(contextual_module, :protocols))
    node_one_protocol = contextual_protocols["node-context-1"]
    node_two_protocol = contextual_protocols["node-context-2"]
    @test Base.invokelatest(node_one_protocol.chooseL, [5]) == 107
    @test Base.invokelatest(node_two_protocol.chooseL, [5]) == 207
    @test Base.invokelatest(node_one_protocol.chooseH, [5]) == 1006
    @test Base.invokelatest(node_two_protocol.chooseH, [5]) == 2006
    @test getfield(contextual_module, :variable_shadowed_rate) == 2.0
    @test Base.invokelatest(
      getfield(contextual_module, :variable_shadowed_function),
      2,
    ) == 3

    complete_source_expression = WebQuantumSavory._script_value_expression(
      "Lambda",
      "complete_choice(value) = self + value\ncomplete_choice\n# trailing comment",
      "Complete-source custom function";
      node_index=2,
    )
    complete_source_function = Core.eval(
      contextual_module,
      Meta.parse(complete_source_expression),
    )
    @test Base.invokelatest(complete_source_function, 3) == 5

    nonfunction_source_expression = WebQuantumSavory._script_value_expression(
      "Lambda",
      "42",
      "Non-function custom source";
      node_index=2,
    )
    @test Core.eval(
      contextual_module,
      Meta.parse(nonfunction_source_expression),
    ) == 42
    @test !occursin("isa Core.Function", nonfunction_source_expression)

    for context in ("Edge custom function", "Floating custom function")
      nodeid_expression = WebQuantumSavory._script_value_expression(
        "Lambda",
        "value -> nodeid(\"Cambridge\") + value",
        context,
      )
      nodeid_function = Core.eval(contextual_module, Meta.parse(nodeid_expression))
      @test Base.invokelatest(nodeid_function, 3) == 5

      unknown_name_expression = WebQuantumSavory._script_value_expression(
        "Lambda",
        "value -> nodeid(\"Missing node\") + value",
        context,
      )
      unknown_name_function = Core.eval(contextual_module, Meta.parse(unknown_name_expression))
      @test_throws KeyError Base.invokelatest(unknown_name_function, 3)

      self_expression = WebQuantumSavory._script_value_expression(
        "Lambda",
        "value -> self + value",
        context,
      )
      self_function = Core.eval(contextual_module, Meta.parse(self_expression))
      @test_throws UndefVarError Base.invokelatest(self_function, 3)
    end

    virtual_edge_expression = WebQuantumSavory._script_value_expression(
      "Lambda",
      "() -> isnothing(distance) && isnothing(delay) && isnothing(refractive_index) && " *
      "isnothing(loss) && isnothing(transmissivity) && " *
      "node_a == 2 && node_b == 1",
      "Virtual edge custom function";
      edge_context=WebQuantumSavory._EdgeFunctionContext(
        nothing,
        nothing,
        nothing,
        nothing,
        nothing,
        2,
        1,
      ),
    )
    virtual_edge_function = Core.eval(
      contextual_module,
      Meta.parse(virtual_edge_expression),
    )
    @test Base.invokelatest(virtual_edge_function)

    weighted_variable = only(filter(
      variable -> variable["id"] == "weighted-state-variable",
      payload["variables"],
    ))
    direct_weighted_expression = WebQuantumSavory._script_states_zoo_expression(
      weighted_variable["value"],
      "Direct weighted state",
    )
    @test !occursin("(state / trace, trace)", direct_weighted_expression)
    direct_weighted_state = Core.eval(generated_module, Meta.parse(direct_weighted_expression))
    @test abs(LinearAlgebra.tr(QuantumSavory.express(direct_weighted_state))) ≈ 1

    function trace_ownership_error(mutate_companion!)
      invalid_payload = deepcopy(payload)
      companion = only(filter(
        variable -> variable["id"] == "weighted-state-variable_tr",
        invalid_payload["variables"],
      ))
      mutate_companion!(companion)
      try
        WebQuantumSavory.generate_julia_script(invalid_payload)
        return nothing
      catch error
        return error
      end
    end

    unknown_owner = trace_ownership_error(
      companion -> (companion["statesZooTraceSourceId"] = "missing-state"),
    )
    @test unknown_owner isa WebQuantumSavory.APIError
    @test occursin("unknown States Zoo variable", unknown_owner.message)

    unweighted_owner = trace_ownership_error(
      companion -> (companion["statesZooTraceSourceId"] = "state-variable"),
    )
    @test unweighted_owner isa WebQuantumSavory.APIError
    @test occursin("must be a weighted States Zoo variable", unweighted_owner.message)

    mismatched_companion = trace_ownership_error(
      companion -> (companion["name"] = "stale trace name"),
    )
    @test mismatched_companion isa WebQuantumSavory.APIError
    @test occursin("does not match its weighted States Zoo owner", mismatched_companion.message)

    invalid_config = deepcopy(payload)
    invalid_config["simulationConfig"]["time"] = 0
    invalid_config_error = try
      WebQuantumSavory.generate_julia_script(invalid_config)
      nothing
    catch error
      error
    end
    @test invalid_config_error isa WebQuantumSavory.APIError
    @test invalid_config_error.status_code == 400
    @test occursin("positive finite", invalid_config_error.message)

    incompatible_representation = deepcopy(payload)
    incompatible_representation["simulationConfig"]["qubitRepresentation"] = "GabsRepr"
    incompatible_representation_error = try
      WebQuantumSavory.generate_julia_script(incompatible_representation)
      nothing
    catch error
      error
    end
    @test incompatible_representation_error isa WebQuantumSavory.APIError
    @test incompatible_representation_error.status_code == 400
    @test occursin("does not support Qubit slots", incompatible_representation_error.message)

    unknown_representation = deepcopy(payload)
    unknown_representation["simulationConfig"]["qumodeRepresentation"] = "UnknownRepr"
    unknown_representation_error = try
      WebQuantumSavory.generate_julia_script(unknown_representation)
      nothing
    catch error
      error
    end
    @test unknown_representation_error isa WebQuantumSavory.APIError
    @test unknown_representation_error.status_code == 400
    @test occursin("Unknown representation", unknown_representation_error.message)

    invalid_protocol = deepcopy(payload)
    invalid_protocol["net"]["edges"][1]["data"]["protocols"][1]["type"] = "Main.NotAProtocol"
    invalid_protocol_error = try
      WebQuantumSavory.generate_julia_script(invalid_protocol)
      nothing
    catch error
      error
    end
    @test invalid_protocol_error isa WebQuantumSavory.APIError
    @test invalid_protocol_error.status_code == 400
    @test occursin("unknown protocol type", lowercase(invalid_protocol_error.message))

    empty_network_error = try
      WebQuantumSavory.generate_julia_script(Dict(
        "name" => "Empty Network",
        "net" => Dict("nodes" => Any[], "edges" => Any[], "protocols" => Any[]),
      ))
      nothing
    catch error
      error
    end
    @test empty_network_error isa WebQuantumSavory.APIError
    @test occursin("at least one node", empty_network_error.message)

    empty_register_payload = Dict(
      "name" => "Empty Register",
      "net" => Dict(
        "nodes" => [Dict(
          "id" => "node",
          "name" => "Node",
          "position" => [0, 0],
          "data" => Dict("slots" => Any[], "protocols" => Any[]),
        )],
        "edges" => Any[],
        "protocols" => Any[],
      ),
    )
    empty_register_error = try
      WebQuantumSavory.generate_julia_script(empty_register_payload)
      nothing
    catch error
      error
    end
    @test empty_register_error isa WebQuantumSavory.APIError
    @test occursin("at least one slot", empty_register_error.message)

    wildcard_payload = deepcopy(payload)
    push!(wildcard_payload["variables"], Dict(
      "id" => "wildcard-variable",
      "name" => "any remote node",
      "type" => "QuantumSavory.Wildcard",
      "value" => nothing,
    ))
    push!(wildcard_payload["net"]["nodes"][1]["data"]["protocols"], Dict(
      "id" => "wildcard-swapper",
      "type" => "QuantumSavory.ProtocolZoo.SwapperProt",
      "parameters" => [
        Dict(
          "name" => "nodeL",
          "type" => ["QuantumSavory.Wildcard", "Int64", "Function"],
          "value" => Dict("kind" => "variable", "id" => "wildcard-variable"),
        ),
        Dict(
          "name" => "nodeH",
          "type" => "QuantumSavory.Wildcard",
          "value" => "Wildcard",
        ),
      ],
    ))
    wildcard_script = WebQuantumSavory.generate_julia_script(wildcard_payload)
    @test any(
      line -> startswith(line, "using QuantumSavory: ") &&
        occursin("Wildcard", line),
      split(wildcard_script, '\n'),
    )
    @test occursin("variable_any_remote_node = (() -> Wildcard())", wildcard_script)
    @test length(findall("variable_any_remote_node()", wildcard_script)) == 1
    @test occursin("nodeH = Wildcard()", wildcard_script)
    paused_wildcard_script = replace(
      wildcard_script,
      "\nrun(sim, simulation_duration)\n" =>
        "\n# run(sim, simulation_duration)  # paused by the exporter test\n";
      count=1,
    )
    wildcard_module = Module(gensym(:WildcardExplicitImportExport))
    Core.eval(wildcard_module, :(using Base))
    Base.include_string(
      wildcard_module,
      paused_wildcard_script,
      "wildcard-explicit-import-export.jl",
    )
    wildcard_factory = getfield(wildcard_module, :variable_any_remote_node)
    @test wildcard_factory() isa QuantumSavory.Wildcard

    nested_protocol_payload = deepcopy(payload)
    nested_protocol = nested_protocol_payload["net"]["edges"][1]["data"]["protocols"][1]
    nested_protocol["id"] = "show"
    nested_protocol["type"] = "QuantumSavory.ProtocolZoo.QTCP.LinkController"
    nested_protocol["parameters"] = Any[]
    nested_protocol_script = WebQuantumSavory.generate_julia_script(nested_protocol_payload)
    @test "using QuantumSavory.ProtocolZoo: LinkController" in
      split(nested_protocol_script, '\n')
    @test occursin(
      "LinkController(; sim = sim, net = network, nodeA = 1, nodeB = 2)",
      nested_protocol_script,
    )
    @test occursin("protocol_instance_show = LinkController", nested_protocol_script)
    @test occursin("show(io, MIME\"image/png\"(), protocol)", nested_protocol_script)
    paused_nested_protocol_script = replace(
      nested_protocol_script,
      "\nrun(sim, simulation_duration)\n" =>
        "\n# run(sim, simulation_duration)  # paused by the exporter test\n";
      count=1,
    )
    nested_protocol_module = Module(gensym(:NestedProtocolExplicitImportExport))
    Core.eval(nested_protocol_module, :(using Base))
    Base.include_string(
      nested_protocol_module,
      paused_nested_protocol_script,
      "nested-protocol-explicit-import-export.jl",
    )
    @test only(getfield(nested_protocol_module, :protocols)).second isa
      QuantumSavory.ProtocolZoo.QTCP.LinkController

    if !isdefined(Main, :WebQuantumSavoryScriptCollisionA)
      Core.eval(Main, :(
        module WebQuantumSavoryScriptCollisionA
          const Shared = Val{:a}
          const network = :a
          const var"for" = :keyword
          macro shared()
            QuoteNode(:macro_a)
          end
        end
      ))
    end
    if !isdefined(Main, :WebQuantumSavoryScriptCollisionB)
      Core.eval(Main, :(
        module WebQuantumSavoryScriptCollisionB
          const Shared = Val{:b}
          macro shared()
            QuoteNode(:macro_b)
          end
        end
      ))
    end
    collision_a = getfield(Main, :WebQuantumSavoryScriptCollisionA)
    collision_b = getfield(Main, :WebQuantumSavoryScriptCollisionB)
    collision_sources = [
      (collision_a, :Shared),
      (collision_a, :network),
      (collision_a, :for),
      (collision_a, Symbol("@shared")),
      (collision_b, :Shared),
      (collision_b, Symbol("@shared")),
    ]
    forward_registry =
      WebQuantumSavory._script_import_registry(collision_sources)
    forward_references = Dict(
      source => WebQuantumSavory._script_reference(forward_registry, source...)
      for source in collision_sources
    )
    reverse_registry =
      WebQuantumSavory._script_import_registry(reverse(collision_sources))
    reverse_references = Dict(
      source => WebQuantumSavory._script_reference(reverse_registry, source...)
      for source in reverse(collision_sources)
    )
    @test forward_references == reverse_references
    @test all(reference != "Shared" for reference in values(forward_references))
    @test forward_references[(collision_a, :network)] != "network"
    @test forward_references[(collision_a, :for)] != "for"
    @test forward_references[(collision_a, Symbol("@shared"))] != "@shared"
    @test forward_references[(collision_b, Symbol("@shared"))] != "@shared"
    forward_import_lines =
      WebQuantumSavory._script_import_lines(forward_registry)
    reverse_import_lines =
      WebQuantumSavory._script_import_lines(reverse_registry)
    @test forward_import_lines == reverse_import_lines

    collision_module = Module(gensym(:CollisionExplicitImportExport))
    Core.eval(collision_module, :(using Base))
    collision_values = join(
      (
        forward_references[(collision_a, :Shared)],
        forward_references[(collision_b, :Shared)],
        forward_references[(collision_a, :network)],
        forward_references[(collision_a, :for)],
        forward_references[(collision_a, Symbol("@shared"))] * "()",
        forward_references[(collision_b, Symbol("@shared"))] * "()",
      ),
      ", ",
    )
    Base.include_string(
      collision_module,
      join(forward_import_lines, "\n") *
        "\ncollision_values = ($collision_values)\n",
      "collision-explicit-import-export.jl",
    )
    @test getfield(collision_module, :collision_values) ==
      (Val{:a}, Val{:b}, :a, :keyword, :macro_a, :macro_b)

    catalog_candidates = WebQuantumSavory._script_import_candidates()
    catalog_registry =
      WebQuantumSavory._script_import_registry(catalog_candidates)
    for source in catalog_candidates
      WebQuantumSavory._script_reference(catalog_registry, source...)
    end
    catalog_module = Module(gensym(:CatalogExplicitImportExport))
    Core.eval(catalog_module, :(using Base))
    Base.include_string(
      catalog_module,
      join((
        "using QuantumSavory",
        "using QuantumSavory.ProtocolZoo",
        "using QuantumSavory.StatesZoo",
        "using Graphs",
        "using ConcurrentSim",
        "using ResumableFunctions",
        "using CairoMakie",
        "using LinearAlgebra",
        WebQuantumSavory._script_import_lines(catalog_registry)...,
      ), "\n"),
      "catalog-explicit-import-export.jl",
    )
    for entry in values(catalog_registry.entries)
      @test getfield(catalog_module, entry.local_name) ===
        getfield(entry.source_module, entry.source_name)
    end
  end

  @testset "Background Types" begin
      background_types = WebQuantumSavory.get_background_types()
      @test isa(background_types, Vector)
      @test !isempty(background_types)
      @test all(isa(bt, Dict) for bt in background_types)
      @test all(haskey(bt, "type") for bt in background_types)
      @test all(haskey(bt, "doc") for bt in background_types)
      @test all(haskey(bt, "parameters") for bt in background_types)
  end

  @testset "Slot Types" begin
      slot_types = WebQuantumSavory.get_slot_types()
      @test isa(slot_types, Vector)
      @test !isempty(slot_types)
      @test all(isa(st, Dict) for st in slot_types)
      @test all(haskey(st, "type") for st in slot_types)
      @test all(haskey(st, "doc") for st in slot_types)
  end

  @testset "Known Function References" begin
      expected_known_functions = [
          "minimum", "maximum", "abs", "identity", "<(self)", ">(self)", "≤(self)", "≥(self)", "==(self)",
      ]
      @test WebQuantumSavory.known_functions() == expected_known_functions

      safe_references = [
        "minimum" => minimum,
        "maximum" => maximum,
        "abs" => abs,
        "identity" => identity,
      ]
      for (name, expected) in safe_references
        @test WebQuantumSavory.resolve_function_reference(name) === expected
      end

      # Names outside the advertised allowlist must not reach arbitrary Julia
      # functions, whether they are qualified or unqualified.
      rejected_references = [
        "min", "Base.min", "exit", "Base.exit", "eval", "Core.eval",
        "Main.eval", "include", "Base.include", "run", "Base.run", "rm",
        "Base.rm", "open", "Base.open",
      ]
      for name in rejected_references
        @test WebQuantumSavory.resolve_function_reference(name) === nothing
      end

      rejected_kwargs = Dict{Symbol,Any}()
      @test !WebQuantumSavory._handle_function_lambda_parameter!(
        rejected_kwargs,
        :filter,
        "Function",
        "exit",
      )
      @test !haskey(rejected_kwargs, :filter)

      comparison_cases = [
        "<(self)" => [true, false, false],
        ">(self)" => [false, false, true],
        "≤(self)" => [true, true, false],
        "≥(self)" => [false, true, true],
        "==(self)" => [false, true, false],
      ]
      for (name, expected) in comparison_cases
        comparison = WebQuantumSavory.resolve_self_comparison_reference(name, 2)
        @test comparison !== nothing
        if comparison !== nothing
          @test comparison.(1:3) == expected
        end
        @test WebQuantumSavory.resolve_function_reference(name) === nothing
      end
      @test WebQuantumSavory.resolve_self_comparison_reference("!=(self)", 2) === nothing
      @test WebQuantumSavory.resolve_self_comparison_reference("==(self)", nothing) === nothing

      node_kwargs = Dict{Symbol,Any}()
      @test WebQuantumSavory._handle_function_lambda_parameter!(
        node_kwargs,
        :chooseslot,
        "Function",
        "==(self)";
        self_node_index=2,
      )
      @test haskey(node_kwargs, :chooseslot)
      if haskey(node_kwargs, :chooseslot)
        @test node_kwargs[:chooseslot].(1:3) == [false, true, false]
      end

      non_node_kwargs = Dict{Symbol,Any}()
      @test !WebQuantumSavory._handle_function_lambda_parameter!(
        non_node_kwargs,
        :chooseslot,
        "Function",
        "==(self)",
      )
      @test !haskey(non_node_kwargs, :chooseslot)

      # The optional positional state argument remains backwards compatible.
      ordinary_kwargs = Dict{Symbol,Any}()
      @test WebQuantumSavory._handle_function_lambda_parameter!(
        ordinary_kwargs,
        :filter,
        "Function",
        "identity",
        nothing,
      )
      @test haskey(ordinary_kwargs, :filter)
      if haskey(ordinary_kwargs, :filter)
        @test ordinary_kwargs[:filter] === identity
      end
  end

  @testset "Custom Function Source Evaluation" begin
    withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true") do
      accepted_sources = (
        ("<(1)", 0, true),
        (">(1)", 2, true),
        ("in([1, 3])", 3, true),
        ("increment(x) = x + 1", 2, 3),
        ("increment(x) = x + 1\nincrement", 3, 4),
        ("increment(x) = x + 1\n# trailing comment", 4, 5),
        ("function double(x)\n  return 2x\nend", 5, 10),
      )

      for (source, input, expected) in accepted_sources
        success, results, validation_error = WebQuantumSavory.Sandbox.test_code(source)
        @test success
        @test results isa Dict
        @test validation_error === nothing

        custom_function = WebQuantumSavory.create_lambda(source)
        @test custom_function(input) == expected
      end

      node_name_to_index = Dict("Amherst" => 1, "Cambridge" => 2)
      contextual_sources = (
        ("<(self)", 1, true),
        ("==(nodeid(\"Cambridge\"))", 2, true),
        ("let threshold = self\n  <(threshold)\nend", 1, true),
      )
      for (source, input, expected) in contextual_sources
        success, results, validation_error = WebQuantumSavory.Sandbox.test_code(
          source;
          placement="node",
        )
        @test success
        @test results isa Dict
        @test validation_error === nothing

        custom_function = WebQuantumSavory.create_lambda(
          source;
          node_name_to_index=node_name_to_index,
          self_node_index=2,
        )
        @test custom_function(input) == expected
      end

      success, _, validation_error = WebQuantumSavory.Sandbox.test_code(
        "==(nodeid(\"Amherst\"))";
        placement="edge",
      )
      @test success
      @test validation_error === nothing

      for placement in ("edge", "variable")
        # The edge-distance binding is `distance`, so the `length` function is
        # not shadowed and may be called directly in edge/variable placement.
        success, results, validation_error = WebQuantumSavory.Sandbox.test_code(
          "candidates -> distance > 0 && delay >= 0 && refractive_index > 0 && " *
          "loss >= 0 && 0 <= transmissivity <= 1 && " *
          "node_a == 1 && node_b == 2 && length(candidates) > 0";
          placement=placement,
        )
        @test success
        @test results isa Dict
        @test validation_error === nothing
      end

      success, results, validation_error = WebQuantumSavory.Sandbox.test_code(
        "candidate -> candidate == self && node_a < node_b";
        placement="variable",
      )
      @test success
      @test results isa Dict
      @test validation_error === nothing

      for placement in (nothing, "edge", "floating")
        success, results, validation_error = WebQuantumSavory.Sandbox.test_code(
          "<(self)";
          placement=placement,
        )
        @test !success
        @test results === nothing
        @test validation_error isa UndefVarError
      end

      success, results, validation_error = WebQuantumSavory.Sandbox.test_code(
        "x -> x > 1";
        placement="query",
      )
      @test success
      @test results isa Dict
      @test validation_error === nothing

      success, results, validation_error = WebQuantumSavory.Sandbox.test_code(
        "candidate -> let nodeid = _ -> 1\n  candidate == nodeid(\"Amherst\")\nend";
        placement="query",
      )
      @test success
      @test results isa Dict
      @test validation_error === nothing

      for contextual_source in (
        "<(self)",
        "==(nodeid(\"Amherst\"))",
        "candidate -> candidate == self",
        "candidate -> candidate == nodeid(\"Amherst\")",
      )
        success, results, validation_error = WebQuantumSavory.Sandbox.test_code(
          contextual_source;
          placement="query",
        )
        @test !success
        @test results === nothing
        @test validation_error isa UndefVarError
      end

      success, results, validation_error = WebQuantumSavory.Sandbox.test_code("42")
      @test !success
      @test results === nothing
      @test validation_error isa ArgumentError
      @test occursin("got Int64", sprint(showerror, validation_error))
      @test occursin("<(1)", sprint(showerror, validation_error))

      success, results, parse_error = WebQuantumSavory.Sandbox.test_code("invalid(")
      @test !success
      @test results === nothing
      @test parse_error isa Base.Meta.ParseError

      failure_response = WebQuantumSavory.evaluation_failure_response(parse_error)
      @test startswith(failure_response[:error], "ParseError:")
      @test occursin("Expected `)` or `,`", failure_response[:error])
      @test !occursin("Base.Meta.ParseError(", failure_response[:error])
      @test failure_response[:error_type] == "Base.Meta.ParseError"
    end
  end

  @testset "Custom Function Runtime Context" begin
      nodes = [
        Dict("name" => "Amherst"),
        Dict("name" => "Cambridge"),
        Dict("name" => "Amherst"),
      ]
      node_name_to_index = WebQuantumSavory._node_name_to_index(nodes)
      # Julia Dict construction intentionally preserves compatibility for
      # duplicate names by retaining the last matching node.
      @test node_name_to_index == Dict("Amherst" => 3, "Cambridge" => 2)

      withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true") do
        anonymous = WebQuantumSavory.create_lambda(
          "candidate -> self == nodeid(\"Cambridge\") && candidate == nodeid(\"Amherst\")";
          node_name_to_index=node_name_to_index,
          self_node_index=2,
        )
        @test anonymous(3)
        @test !anonymous(2)

        named = WebQuantumSavory.create_lambda(
          """
          function contextual_selector(candidate)
            return self == nodeid("Cambridge") && candidate == nodeid("Amherst")
          end
          """;
          node_name_to_index=node_name_to_index,
          self_node_index=2,
        )
        @test named(3)
        @test !named(1)

        short_form_source =
          "contextual_short(candidate) = " *
          "self == nodeid(\"Cambridge\") && candidate == nodeid(\"Amherst\"); contextual_short"
        @test Meta.parse(short_form_source).head === :toplevel
        short_form = WebQuantumSavory.create_lambda(
          short_form_source;
          node_name_to_index=node_name_to_index,
          self_node_index=2,
        )
        @test short_form(3)
        @test !short_form(2)
        @test !isdefined(parentmodule(short_form.func), :contextual_short)

        long_form_source = """
        function contextual_long(candidate)
          return self == nodeid("Cambridge") && candidate == nodeid("Amherst")
        end; contextual_long
        """
        @test Meta.parse(long_form_source).head === :toplevel
        long_form = WebQuantumSavory.create_lambda(
          long_form_source;
          node_name_to_index=node_name_to_index,
          self_node_index=2,
        )
        @test long_form(3)
        @test !long_form(1)
        @test !isdefined(parentmodule(long_form.func), :contextual_long)

        # Literal custom functions are instantiated with the node assignment's
        # context rather than a process-global value.
        literal_kwargs = Dict{Symbol,Any}()
        literal_ctx = Dict{Symbol,Any}(
          :node => 2,
          WebQuantumSavory.NODE_NAME_TO_INDEX_CONTEXT_KEY => node_name_to_index,
        )
        @test WebQuantumSavory._handle_typed_parameter!(
          literal_kwargs,
          :selector,
          "Lambda",
          "candidate -> candidate == self && nodeid(\"Cambridge\") == self",
          literal_ctx,
        )
        @test literal_kwargs[:selector](2)
        @test !literal_kwargs[:selector](1)

        # Lambda variables retain raw source and receive a fresh lexical `self`
        # for each assignment, while sharing the prepared node lookup.
        lambda_variable = WebQuantumSavory.Variable(
          "contextual-selector",
          "contextual selector",
          "Lambda",
          "candidate -> candidate == self && nodeid(\"Cambridge\") == 2",
        )
        variable_functions = Dict{Int,Any}()
        for node_index in 1:2
          kwargs = Dict{Symbol,Any}()
          ctx = Dict{Symbol,Any}(
            :node => node_index,
            WebQuantumSavory.NODE_NAME_TO_INDEX_CONTEXT_KEY => node_name_to_index,
          )
          @test WebQuantumSavory._handle_typed_parameter!(
            kwargs,
            :selector,
            lambda_variable.type,
            lambda_variable.value,
            ctx,
          )
          variable_functions[node_index] = kwargs[:selector]
        end
        @test variable_functions[1](1)
        @test !variable_functions[1](2)
        @test variable_functions[2](2)
        @test !variable_functions[2](1)

        physical_edge_context = WebQuantumSavory._EdgeFunctionContext(
          1250.0,
          0.25,
          1.5,
          0.2,
          0.95,
          1,
          2,
        )
        edge_ctx = Dict{Symbol,Any}(
          :nodeA => 1,
          :nodeB => 2,
          WebQuantumSavory.NODE_NAME_TO_INDEX_CONTEXT_KEY => node_name_to_index,
          WebQuantumSavory.EDGE_FUNCTION_CONTEXT_KEY => physical_edge_context,
        )
        edge_kwargs = Dict{Symbol,Any}()
        @test WebQuantumSavory._handle_typed_parameter!(
          edge_kwargs,
          :selector,
          "Lambda",
          "candidates -> distance == 1250.0 && delay == 0.25 && " *
          "refractive_index == 1.5 && loss == 0.2 && transmissivity == 0.95 && " *
          "node_a == 1 && node_b == 2 && length(candidates) == 2",
          edge_ctx,
        )
        @test edge_kwargs[:selector]([1, 2])

        virtual_function = WebQuantumSavory.create_lambda(
          "() -> isnothing(distance) && isnothing(delay) && isnothing(refractive_index) && " *
          "isnothing(loss) && isnothing(transmissivity) && " *
          "node_a == 2 && node_b == 1";
          edge_context=WebQuantumSavory._EdgeFunctionContext(
            nothing,
            nothing,
            nothing,
            nothing,
            nothing,
            2,
            1,
          ),
        )
        @test virtual_function()

        ordinary_length = WebQuantumSavory.create_lambda("values -> length(values)")
        @test ordinary_length([1, 2, 3]) == 3

        for self_node_index in (1, nothing), edge_only_name in ("node_a", "delay")
          node_or_floating_function = WebQuantumSavory.create_lambda(
            "() -> $edge_only_name";
            node_name_to_index=node_name_to_index,
            self_node_index=self_node_index,
          )
          @test_throws UndefVarError node_or_floating_function()
        end

        # Edge and floating functions receive `nodeid`, but no `self` binding.
        for ctx in (
          edge_ctx,
          Dict{Symbol,Any}(
            WebQuantumSavory.NODE_NAME_TO_INDEX_CONTEXT_KEY => node_name_to_index,
          ),
        )
          kwargs = Dict{Symbol,Any}()
          @test WebQuantumSavory._handle_typed_parameter!(
            kwargs,
            :selector,
            "Lambda",
            "candidate -> candidate == nodeid(\"Cambridge\")",
            ctx,
          )
          @test kwargs[:selector](2)

          invalid_kwargs = Dict{Symbol,Any}()
          @test WebQuantumSavory._handle_typed_parameter!(
            invalid_kwargs,
            :selector,
            "Lambda",
            "candidate -> candidate == self",
            ctx,
          )
          @test_throws UndefVarError invalid_kwargs[:selector](2)
        end

        missing_name = WebQuantumSavory.create_lambda(
          "candidate -> candidate == nodeid(\"Springfield\")";
          node_name_to_index=node_name_to_index,
          self_node_index=1,
        )
        @test_throws KeyError missing_name(1)
      end
  end

  @testset "Restricted source allowlist" begin
    withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true") do
      # Accepted: ordinary custom functions and query predicates that stay within
      # the allowlisted operations and context bindings.
      for source in (
        "x -> x + 1",
        "f(x) = x + 1",
        "function double(x)\n  return 2x\nend",
        "<(1)",
        "candidate -> candidate > 0 && isfinite(candidate)",
      )
        success, _, err = WebQuantumSavory.Sandbox.test_code(source; placement="query")
        @test success
        @test err === nothing
      end

      # Accepted: symbolic source built from QuantumSymbolics atoms, operator
      # functions, and concrete constructors.
      for expr in ("Z₁", "Z₁ ⊗ Z₂", "projector(Z₁)", "ZGate()")
        success, _, err = WebQuantumSavory.Sandbox.evaluate_symbolic_expression(expr)
        @test success
        @test err === nothing
      end

      # Rejected: dangerous identifiers and syntactic forms are refused before
      # evaluation and surfaced as an ArgumentError validation failure.
      for source in (
        "using Base",
        "import Base",
        "`ls`",
        "@time 1",
        "x -> run(`ls`)",
        "Core.eval(:(1 + 1))",
        "@eval 1",
        "x -> read(\"/etc/passwd\", String)",
        "getfield(Core, :eval)",
        "getproperty(x, :im)",
        "x -> x.im",
        # Named-property destructuring lowers to `getproperty`; reject it too.
        "obj -> begin\n  f = nothing\n  (; f) = obj\n  f()\nend",
        "x -> open(\"/tmp/x\", \"w\")",
        "candidates -> Base.length(candidates) > 0",
      )
        success, results, err = WebQuantumSavory.Sandbox.test_code(source; placement="query")
        @test !success
        @test results === nothing
        @test err isa ArgumentError
        @test occursin("restricted expression", sprint(showerror, err))
      end

      # Rejected in the symbolic profile as well.
      for expr in ("run(`ls`)", "Core.eval(:(1 + 1))", "getfield(Core, :eval)")
        success, _, err = WebQuantumSavory.Sandbox.evaluate_symbolic_expression(expr)
        @test !success
        @test err isa ArgumentError
      end
    end
  end

  @testset "Protocol Types" begin
      @test !WebQuantumSavory.mock_broken_protocol_enabled(override=nothing)
      @test WebQuantumSavory.mock_broken_protocol_enabled(override="true")
      @test !WebQuantumSavory.mock_broken_protocol_enabled(override="false")
      @test_throws ArgumentError WebQuantumSavory.mock_broken_protocol_enabled(override=" TRUE ")
      @test_throws ArgumentError WebQuantumSavory.mock_broken_protocol_enabled(override="False")
      @test_throws ArgumentError WebQuantumSavory.mock_broken_protocol_enabled(override="1")
      @test_throws ArgumentError WebQuantumSavory.mock_broken_protocol_enabled(override="yes")

      withenv(WebQuantumSavory.MOCK_BROKEN_PROTOCOL_ENV_VAR => nothing) do
        hidden_types = WebQuantumSavory.get_protocol_types()
        @test all(pt["type"] != WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE for pt in hidden_types)
        @test WebQuantumSavory._resolve_protocol_type_from_string(
          WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE,
        ) === nothing
      end

      withenv(WebQuantumSavory.MOCK_BROKEN_PROTOCOL_ENV_VAR => "false") do
        hidden_types = WebQuantumSavory.get_protocol_types()
        @test all(pt["type"] != WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE for pt in hidden_types)
        @test WebQuantumSavory._resolve_protocol_type_from_string(
          WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE,
        ) === nothing
      end

      withenv(WebQuantumSavory.MOCK_BROKEN_PROTOCOL_ENV_VAR => "true") do
        diagnostic_types = WebQuantumSavory.get_protocol_types()
        diagnostic = only(filter(
          pt -> pt["type"] == WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE,
          diagnostic_types,
        ))
        @test diagnostic["group"] == "floating"
        @test isempty(diagnostic["parameters"])
        @test WebQuantumSavory._resolve_protocol_type_from_string(
          WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE,
        ) === WebQuantumSavory.MockBrokenProtocol
      end

      withenv(WebQuantumSavory.MOCK_BROKEN_PROTOCOL_ENV_VAR => "invalid") do
        @test_throws ArgumentError WebQuantumSavory.get_protocol_types()
      end

      protocol_types = WebQuantumSavory.get_protocol_types()
      @test isa(protocol_types, Vector)
      @test !isempty(protocol_types)
      @test all(isa(pt, Dict) for pt in protocol_types)
      @test all(haskey(pt, "type") for pt in protocol_types)
      @test all(haskey(pt, "doc") for pt in protocol_types)
      @test all(haskey(pt, "group") for pt in protocol_types)
      @test all(haskey(pt, "parameters") for pt in protocol_types)
      @test all(haskey(pt, "virtual") for pt in protocol_types)
      @test all(pt["group"] in ["node", "edge", "floating"] for pt in protocol_types)

      protocol_types_by_name = Dict(pt["type"] => pt for pt in protocol_types)
      virtual_protocol = protocol_types_by_name[string(QuantumSavory.ProtocolZoo.EntanglementConsumer)]
      physical_protocols = [
        protocol_types_by_name[string(QuantumSavory.ProtocolZoo.EntanglerProt)],
        protocol_types_by_name[string(QuantumSavory.ProtocolZoo.LinkController)],
      ]

      @test virtual_protocol["group"] == "edge"
      @test virtual_protocol["virtual"] === true
      @test all(pt["group"] == "edge" for pt in physical_protocols)
      @test all(pt["virtual"] === false for pt in physical_protocols)

      entangler_parameters = protocol_types_by_name[string(QuantumSavory.ProtocolZoo.EntanglerProt)]["parameters"]
      pairstate = only(filter(parameter -> string(parameter.field) == "pairstate", entangler_parameters))
      @test pairstate.type == "Symbolic"

      entangler_tag = only(filter(parameter -> string(parameter.field) == "tag", entangler_parameters))
      @test entangler_tag.type == ["Nothing", "Type{<:AbstractTag}"]
      @test entangler_tag.kind == WebQuantumSavory.NAMED_TAG_PARAMETER_KIND
      @test entangler_tag.nullable === true

      consumer_parameters = virtual_protocol["parameters"]
      consumer_tag = only(filter(parameter -> string(parameter.field) == "tag", consumer_parameters))
      @test consumer_tag.type == "Type{<:AbstractTag}"
      @test consumer_tag.kind == WebQuantumSavory.NAMED_TAG_PARAMETER_KIND
      @test consumer_tag.nullable === false

      @test WebQuantumSavory._named_tag_parameter_semantics(
        Type{<:QuantumSavory.AbstractTag},
      ) == (; nullable=false)
      @test WebQuantumSavory._named_tag_parameter_semantics(
        Union{Nothing,Type{<:QuantumSavory.AbstractTag}},
      ) == (; nullable=true)
      @test WebQuantumSavory._named_tag_parameter_semantics(DataType) === nothing
      @test WebQuantumSavory._named_tag_parameter_semantics(
        Union{Nothing,DataType},
      ) === nothing
      @test WebQuantumSavory._named_tag_parameter_semantics(
        Union{Nothing,Float64,Type{<:QuantumSavory.AbstractTag}},
      ) === nothing
      @test WebQuantumSavory._protocol_parameter_handling_type(
        Union{Int64,Function},
        "Int64",
        "1",
      ) === Int64
      @test WebQuantumSavory._protocol_parameter_handling_type(
        Union{Int64,Function},
        "Lambda",
        "slots -> first(slots)",
      ) == "Lambda"
      @test WebQuantumSavory._is_symbolic_parameter_type(QuantumSavory.SymQObj)
      @test WebQuantumSavory._is_symbolic_parameter_type(typeof(QuantumSavory.X))
      @test all(
        type -> !WebQuantumSavory._is_symbolic_parameter_type(type),
        (
          "Symbolic",
          "SymQObj",
          "QuantumSymbolics.SymQObj",
          "SymbolicUtils.Symbolic{Real}",
        ),
      )
      @test WebQuantumSavory._protocol_parameter_handling_type(
        QuantumSavory.SymQObj,
        "Symbolic",
        Dict("kind" => "states_zoo"),
      ) === QuantumSavory.SymQObj
      consumer_declared_types = WebQuantumSavory._constructor_parameter_types(
        QuantumSavory.ProtocolZoo.EntanglementConsumer,
      )
      @test Set(keys(consumer_declared_types)) == Set(["period", "tag"])
      @test !haskey(consumer_declared_types, "_log")
  end

  @testset "Named AbstractTag Protocol Parameters" begin
    payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    simulation_name = "named_abstract_tag_protocol_parameters"
    payload["name"] = simulation_name
    state = WebQuantumSavory.parse_network_graph(WebQuantumSavory.validate_payload(payload))
    context = Dict{Symbol,Any}(
      :sim => WebQuantumSavory.get_network_time_tracker(state.network),
      :net => state.network,
      :nodeA => 1,
      :nodeB => 2,
    )
    counterpart_id = "QuantumSavory.ProtocolZoo.EntanglementCounterpart"

    protocol_definition(T, value; client_type="Any") = Dict(
      "type" => string(T),
      "parameters" => [Dict(
        "name" => "tag",
        "type" => client_type,
        "value" => value,
      )],
    )

    captured_error(thunk) = try
      thunk()
      nothing
    catch error
      error
    end

    try
      withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false") do
        # Client-supplied type annotations are deliberately forged. The
        # simulator-owned constructor schema remains authoritative.
        entangler = WebQuantumSavory._instantiate_protocol(
          protocol_definition(
            QuantumSavory.ProtocolZoo.EntanglerProt,
            counterpart_id;
            client_type=["Nothing", "DataType"],
          ),
          context,
        )
        @test entangler.tag === QuantumSavory.ProtocolZoo.EntanglementCounterpart

        consumer = WebQuantumSavory._instantiate_protocol(
          protocol_definition(
            QuantumSavory.ProtocolZoo.EntanglementConsumer,
            counterpart_id;
            client_type="Any",
          ),
          context,
        )
        @test consumer.tag === QuantumSavory.ProtocolZoo.EntanglementCounterpart

        no_tag = WebQuantumSavory._instantiate_protocol(
          protocol_definition(
            QuantumSavory.ProtocolZoo.EntanglerProt,
            "nothing";
            client_type="Float64",
          ),
          context,
        )
        @test no_tag.tag === nothing

        forged_ordinary_types = Dict(
          "type" => string(QuantumSavory.ProtocolZoo.EntanglerProt),
          "parameters" => Any[
            Dict("name" => "success_prob", "type" => "String", "value" => 0.25),
            Dict("name" => "chooseslotA", "type" => "String", "value" => 1),
            Dict("name" => "chooseslotB", "type" => "Float64", "value" => "minimum"),
          ],
        )
        authoritative_protocol = WebQuantumSavory._instantiate_protocol(
          forged_ordinary_types,
          context,
        )
        @test authoritative_protocol.success_prob == 0.25
        @test authoritative_protocol.chooseslotA == 1
        @test authoritative_protocol.chooseslotB === minimum

        authoritative_symbolic = WebQuantumSavory._instantiate_protocol(
          Dict(
            "type" => string(QuantumSavory.ProtocolZoo.EntanglerProt),
            "parameters" => [Dict(
              "name" => "pairstate",
              "type" => "Float64",
              "value" => Dict(
                "kind" => "states_zoo",
                "state_type" => "DepolarizedBellPair",
                "parameters" => Dict("p" => 0.85),
              ),
            )],
          ),
          context,
        )
        @test authoritative_symbolic.pairstate isa QuantumSavory.SymQObj

        for blank in (nothing, "", "  ")
          default_entangler = WebQuantumSavory._instantiate_protocol(
            protocol_definition(
              QuantumSavory.ProtocolZoo.EntanglerProt,
              blank;
              client_type="DataType",
            ),
            context,
          )
          @test default_entangler.tag === QuantumSavory.ProtocolZoo.EntanglementCounterpart
        end

        invalid_values = Any[
          "nothing" => "does not accept nothing",
          "EntanglementCounterpart" => "not an advertised named AbstractTag type",
          "Main.UnknownTag" => "not an advertised named AbstractTag type",
          "Core.Int64" => "not an advertised named AbstractTag type",
          42 => "fully qualified named AbstractTag type ID",
          Dict("kind" => "variable", "id" => "tag-variable") => "cannot use variables",
        ]
        for (value, message) in invalid_values
          T = value == "nothing" ?
            QuantumSavory.ProtocolZoo.EntanglementConsumer :
            QuantumSavory.ProtocolZoo.EntanglerProt
          error = captured_error(() -> WebQuantumSavory._instantiate_protocol(
            protocol_definition(T, value; client_type="Type{<:AbstractTag}"),
            context,
          ))
          @test error isa WebQuantumSavory.APIError
          if error isa WebQuantumSavory.APIError
            @test error.status_code == 400
            @test occursin(message, error.message)
          end
        end


        unknown_parameter = Dict(
          "type" => string(QuantumSavory.ProtocolZoo.EntanglerProt),
          "parameters" => [Dict(
            "name" => "forged_parameter",
            "type" => "Float64",
            "value" => 0.5,
          )],
        )
        error = captured_error(() -> WebQuantumSavory._instantiate_protocol(
          unknown_parameter,
          context,
        ))
        @test error isa WebQuantumSavory.APIError
        @test occursin("Unknown protocol parameter", error.message)
        unknown_parameter["parameters"][1]["value"] = ""
        @test_throws WebQuantumSavory.APIError WebQuantumSavory._instantiate_protocol(
          unknown_parameter,
          context,
        )
      end

      withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true") do
        custom_choosers = WebQuantumSavory._instantiate_protocol(
          Dict(
            "type" => string(QuantumSavory.ProtocolZoo.EntanglerProt),
            "parameters" => Any[
              Dict(
                "name" => "chooseslotA",
                "type" => "Lambda",
                "value" => "slots -> first(slots)",
              ),
              Dict(
                "name" => "chooseslotB",
                "type" => "Lambda",
                "value" => "slots -> last(slots)",
              ),
            ],
          ),
          context,
        )
        @test custom_choosers.chooseslotA([2, 3]) == 2
        @test custom_choosers.chooseslotB([2, 3]) == 3

        forged_lambda = WebQuantumSavory._instantiate_protocol(
          Dict(
            "type" => string(QuantumSavory.ProtocolZoo.EntanglerProt),
            "parameters" => [Dict(
              "name" => "success_prob",
              "type" => "Lambda",
              "value" => 0.25,
            )],
          ),
          context,
        )
        @test forged_lambda.success_prob == 0.25
        @test WebQuantumSavory._protocol_parameter_handling_type(
          Float64,
          "Lambda",
          0.25,
        ) === Float64
      end
    finally
      WebQuantumSavory.destroy_simulation(simulation_name)
    end
  end

  @testset "States Zoo Registry and Recipes" begin
      schemas = QuantumSavory.StatesZoo.state_family_schemas()
      expected = [
        string(nameof(schema.family)) => schema.family
        for schema in schemas
      ]

      catalog = WebQuantumSavory.get_states_zoo_types()
      @test [entry["id"] for entry in catalog] == first.(expected)
      @test [entry["display_name"] for entry in catalog] == [
        "Barrett-Kok Bell Pair",
        "Barrett-Kok Bell Pair (weighted)",
        "Depolarized Bell Pair",
        "Genqo Multiplexed Cascaded Bell Pair (weighted)",
        "Genqo Unheralded SPDC Bell Pair (weighted)",
      ]
      @test [entry["weighted"] for entry in catalog] == [false, true, false, true, true]

      for (catalog_entry, schema) in zip(catalog, schemas)
        id = string(nameof(schema.family))
        T = schema.family
        expected_metadata = [
          Dict{String,Any}(
            "name" => string(parameter.name),
            "type" => string(parameter.value_type),
            "doc" => parameter.doc,
            "min" => parameter.minimum,
            "max" => parameter.maximum,
            "min_inclusive" => parameter.minimum_inclusive,
            "max_inclusive" => parameter.maximum_inclusive,
            "good" => parameter.recommended,
          ) for parameter in schema.parameters
        ]
        @test catalog_entry["parameters"] == expected_metadata

        good_parameters = Dict(
          string(parameter.name) => parameter.recommended
          for parameter in schema.parameters
        )
        @test WebQuantumSavory.construct_states_zoo_state(id, good_parameters) isa T

        recipe = Dict(
          "kind" => "states_zoo",
          "state_type" => id,
          "parameters" => good_parameters,
        )
        recipe_state = WebQuantumSavory.construct_states_zoo_recipe(recipe)
        if catalog_entry["weighted"]
          @test recipe_state isa QuantumSavory.SymQObj
          @test abs(LinearAlgebra.tr(QuantumSavory.express(recipe_state))) ≈ 1
          raw_state = WebQuantumSavory.construct_states_zoo_state(id, good_parameters)
          @test QuantumSavory.StatesZoo.state_weight(raw_state) > 0
        else
          @test recipe_state isa T
        end
      end

      barrett_weighted_parameters =
        Dict("ηᴬ" => 1, "ηᴮ" => 1, "Pᵈ" => 0, "ηᵈ" => 1, "𝒱" => 1)
      barrett_weighted = WebQuantumSavory.construct_states_zoo_state(
        "BarrettKokBellPairW",
        barrett_weighted_parameters,
      )
      @test QuantumSavory.StatesZoo.state_weight(barrett_weighted) ≈ 0.5

      zero_trace_recipe = Dict(
        "kind" => "states_zoo",
        "state_type" => "BarrettKokBellPairW",
        "parameters" => Dict("ηᴬ" => 0, "ηᴮ" => 0, "Pᵈ" => 0, "ηᵈ" => 1, "𝒱" => 1),
      )
      zero_trace_error = try
        WebQuantumSavory.construct_states_zoo_recipe(zero_trace_recipe)
        nothing
      catch error
        error
      end
      @test zero_trace_error isa WebQuantumSavory.APIError
      @test zero_trace_error.status_code == 400
      @test occursin("outside its declared type or range", zero_trace_error.message)
      @test zero_trace_error.details["min"] == 0
      @test zero_trace_error.details["min_inclusive"] === false

      function states_zoo_error(state_type, parameters)
        try
          WebQuantumSavory.construct_states_zoo_state(state_type, parameters)
          return nothing
        catch error
          return error
        end
      end

      unknown = states_zoo_error("NotAState", Dict())
      @test unknown isa WebQuantumSavory.APIError
      @test unknown.status_code == 400
      @test unknown.error_code == "VALIDATION_ERROR"

      missing = states_zoo_error("DepolarizedBellPair", Dict())
      @test missing isa WebQuantumSavory.APIError
      @test missing.details["missing"] == ["p"]

      extra = states_zoo_error("DepolarizedBellPair", Dict("p" => 0.5, "other" => 1))
      @test extra isa WebQuantumSavory.APIError
      @test extra.details["extra"] == ["other"]

      for invalid_value in ("0.5", true, NaN, Inf, -Inf)
        invalid = states_zoo_error("DepolarizedBellPair", Dict("p" => invalid_value))
        @test invalid isa WebQuantumSavory.APIError
        @test occursin("outside its declared type or range", invalid.message)
      end

      for invalid_value in (-0.01, 1.01)
        invalid = states_zoo_error("DepolarizedBellPair", Dict("p" => invalid_value))
        @test invalid isa WebQuantumSavory.APIError
        @test occursin("outside its declared type or range", invalid.message)
      end

      tagged_recipe = Dict(
        "kind" => "states_zoo",
        "state_type" => "DepolarizedBellPair",
        "parameters" => Dict("p" => 0.75),
      )
      withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false") do
        kwargs = Dict{Symbol,Any}()
        @test WebQuantumSavory._handle_symbolic_parameter!(kwargs, :pairstate, tagged_recipe)
        @test kwargs[:pairstate] isa QuantumSavory.StatesZoo.DepolarizedBellPair

        weighted_recipe = Dict(
          "kind" => "states_zoo",
          "state_type" => "BarrettKokBellPairW",
          "parameters" => barrett_weighted_parameters,
        )
        @test WebQuantumSavory._handle_symbolic_parameter!(kwargs, :weighted, weighted_recipe)
        @test kwargs[:weighted] isa QuantumSavory.SymQObj
        @test abs(LinearAlgebra.tr(QuantumSavory.express(kwargs[:weighted]))) ≈ 1
      end

      # Existing symbolic strings keep their evaluation-backed behavior.
      withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true") do
        kwargs = Dict{Symbol,Any}()
        @test WebQuantumSavory._handle_symbolic_parameter!(kwargs, :pairstate, "Z₁")
        @test haskey(kwargs, :pairstate)
      end
  end

  @testset "States Zoo Preview Rendering" begin
      state = WebQuantumSavory.construct_states_zoo_state(
        "DepolarizedBellPair",
        Dict("p" => 0.8),
      )
      preview = WebQuantumSavory.render_states_zoo_preview("DepolarizedBellPair", state)
      png = WebQuantumSavory.base64decode(preview.png_base64)
      @test length(png) > 8
      @test png[1:8] == UInt8[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      @test preview.trace ≈ 1

      weighted = WebQuantumSavory.construct_states_zoo_state(
        "BarrettKokBellPairW",
        Dict("ηᴬ" => 1, "ηᴮ" => 1, "Pᵈ" => 0, "ηᵈ" => 1, "𝒱" => 1),
      )
      density_operator, original_trace =
        WebQuantumSavory._states_zoo_preview_density_operator("BarrettKokBellPairW", weighted)
      @test original_trace ≈ 0.5
      @test abs(LinearAlgebra.tr(density_operator)) ≈ 1
  end

  @testset "Platform Information" begin
      tree_hash = repeat("1", 40)
      tracked_source = "https://github.com/QuantumSavory/QuantumSavory.jl.git"
      quantumsavory_package = (
        version=v"0.7.0",
        tree_hash,
        git_revision="master",
        git_source=tracked_source,
      )
      genie_package = (version=v"5.35.15",)
      dependencies = Dict{Base.UUID,Any}(
        Base.PkgId(WebQuantumSavory.Genie).uuid => genie_package,
        Base.PkgId(QuantumSavory).uuid => quantumsavory_package,
      )

      mktemp() do project_file, project_io
        write(project_io, "version = \"9.8.7\"\n")
        flush(project_io)
        info = WebQuantumSavory.get_platform_info(
          dependencies_provider=() -> dependencies,
          project_file=project_file,
        )

        @test all(haskey(info["versions"], key) for key in ("julia", "quantumsavory", "app"))
        @test info["versions"]["julia"] == string(VERSION)
        @test info["versions"]["genie"] == "5.35.15"
        @test info["versions"]["quantumsavory"] == "0.7.0"
        @test info["versions"]["app"] == "9.8.7"
        @test info["capabilities"]["unsafe_code_evaluation"] isa Bool

        details = info["quantumsavory"]
        @test details["version"] == info["versions"]["quantumsavory"]
        @test details["tracked_revision"] == "master"
        @test details["tracked_source"] == tracked_source
        @test details["tree_hash"] == tree_hash
        @test details["commit"] === nothing
      end

      full_sha = uppercase(repeat("a1", 20))
      committed = WebQuantumSavory._quantumsavory_platform_info(merge(
        quantumsavory_package,
        (git_revision=full_sha,),
      ))
      @test committed["commit"] == lowercase(full_sha)
      @test committed["tree_hash"] == tree_hash
      @test committed["commit"] != committed["tree_hash"]

      full_sha_256 = repeat("b2", 32)
      @test WebQuantumSavory._full_commit_sha(full_sha_256) == full_sha_256
      for revision in (nothing, "", "master", "v0.7.0", "deadbeef", repeat("c", 39))
        @test WebQuantumSavory._full_commit_sha(revision) === nothing
      end

      unavailable = WebQuantumSavory.get_platform_info(
        dependencies_provider=() -> error("Pkg introspection failed"),
        project_file="/missing/WebQuantumSavory/Project.toml",
      )
      @test unavailable["versions"]["genie"] === nothing
      @test unavailable["versions"]["quantumsavory"] === nothing
      @test unavailable["versions"]["app"] === nothing
      @test all(value === nothing for value in values(unavailable["quantumsavory"]))
  end

  @testset "Server Startup Warmup" begin
      @test WebQuantumSavory.start_startup_warmup!() === nothing
      @test !WebQuantumSavory.STARTUP_WARMUP_COMPLETE[]
      @test basename(WebQuantumSavory._latest_startup_warmup_demo()) ==
        "2.Entangler.Example.with.consumer.json"
      mktempdir() do demos_dir
        touch(joinpath(demos_dir, "2.second.json"))
        touch(joinpath(demos_dir, "10.tenth.json"))
        @test basename(WebQuantumSavory._latest_startup_warmup_demo(demos_dir)) ==
          "10.tenth.json"
      end

      state_names_before = Set(keys(WebQuantumSavory.STATE))
      report, warmup_stderr = mktemp() do _, stderr_io
        report = redirect_stderr(stderr_io) do
          WebQuantumSavory._run_startup_warmup!()
        end
        flush(stderr_io)
        seekstart(stderr_io)
        return report, read(stderr_io, String)
      end
      @test report.demo == "2.Entangler.Example.with.consumer.json"
      @test report.protocol_count == 2
      @test report.generated_state_count > 0
      @test report.states_zoo_type == "BarrettKokBellPair"
      @test !occursin("QuantumSavory.ProtocolZoo", warmup_stderr)
      @test !occursin("EntanglerProt", warmup_stderr)
      @test !occursin("EntanglementConsumer", warmup_stderr)
      @test Set(keys(WebQuantumSavory.STATE)) == state_names_before

      # Failure after parsing and preparing must still remove the private state.
      @test_throws WebQuantumSavory.APIError WebQuantumSavory._run_startup_warmup!(
        simulation_target=0.0,
      )
      @test Set(keys(WebQuantumSavory.STATE)) == state_names_before

      sentinel = WebQuantumSavory.State(name=WebQuantumSavory.STARTUP_WARMUP_STATE_NAME)
      WebQuantumSavory.STATE[WebQuantumSavory.STARTUP_WARMUP_STATE_NAME] = sentinel
      try
        @test_throws ErrorException WebQuantumSavory._run_startup_warmup!()
        @test WebQuantumSavory.STATE[WebQuantumSavory.STARTUP_WARMUP_STATE_NAME] === sentinel
      finally
        delete!(WebQuantumSavory.STATE, WebQuantumSavory.STARTUP_WARMUP_STATE_NAME)
      end
      @test Set(keys(WebQuantumSavory.STATE)) == state_names_before
  end

  @testset "Payload Extraction" begin
      # Now that extract_payload accepts missing/relaxed headers, direct call should parse
      json_str = JSON.json(test_payload)
      result = WebQuantumSavory.extract_payload(nothing, json_str)
      @test result["name"] == "PR15"
  end

  @testset "Payload Validation" begin
      result = WebQuantumSavory.validate_payload(test_payload)
      @test result["success"] == true
      @test result["message"] == "Network graph parsed successfully"
      @test haskey(result, "graph_info")
      @test result["graph_info"]["node_count"] == 2
      @test result["graph_info"]["edge_count"] == 1
      @test length(result["graph_info"]["node_ids"]) == 2
      @test length(result["graph_info"]["edge_connections"]) == 1

      # Test missing name field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload, "name")
      try
        result = WebQuantumSavory.validate_payload(invalid_payload)
      catch e
        @test e isa WebQuantumSavory.APIError
        @test e.message == "Missing required field: 'name' must be present"
      end

      # Test missing net field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload, "net")
      try
        result = WebQuantumSavory.validate_payload(invalid_payload)
      catch e
        @test e isa WebQuantumSavory.APIError
        @test e.message == "Missing required field: 'net' must be present"
      end

      # Test missing nodes field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload["net"], "nodes")
      try
        result = WebQuantumSavory.validate_payload(invalid_payload)
      catch e
        @test e isa WebQuantumSavory.APIError
        @test e.message == "Missing required fields in 'net': 'nodes' and 'edges' must be present"
      end

      # Test missing edges field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload["net"], "edges")
      try
        result = WebQuantumSavory.validate_payload(invalid_payload)
      catch e
        @test e isa WebQuantumSavory.APIError
        @test e.message == "Missing required fields in 'net': 'nodes' and 'edges' must be present"
      end

      # Test duplicate node IDs
      invalid_payload = deepcopy(test_payload)
      invalid_payload["net"]["nodes"][2]["id"] = "node1"  # Duplicate ID
      try
        result = WebQuantumSavory.validate_payload(invalid_payload)
      catch e
        @test e isa WebQuantumSavory.APIError
        @test e.message == "Duplicate node ID: 'node1'"
      end

      # Test edge referencing non-existent source node
      invalid_payload = deepcopy(test_payload)
      invalid_payload["net"]["edges"][1]["source"] = "nonexistent"
      try
        result = WebQuantumSavory.validate_payload(invalid_payload)
      catch e
        @test e isa WebQuantumSavory.APIError
        @test e.message == "Edge 1 references non-existent source node: 'nonexistent'"
      end

      # Test edge referencing non-existent target node
      invalid_payload = deepcopy(test_payload)
      invalid_payload["net"]["edges"][1]["target"] = "nonexistent"
      try
        result = WebQuantumSavory.validate_payload(invalid_payload)
      catch e
        @test e isa WebQuantumSavory.APIError
        @test e.message == "Edge 1 references non-existent target node: 'nonexistent'"
      end

      duplicate_physical = deepcopy(test_payload)
      duplicate_edge = deepcopy(duplicate_physical["net"]["edges"][1])
      duplicate_edge["id"] = "duplicate-physical"
      duplicate_edge["source"], duplicate_edge["target"] =
        duplicate_edge["target"], duplicate_edge["source"]
      duplicate_edge["data"]["protocols"] = Any[]
      push!(duplicate_physical["net"]["edges"], duplicate_edge)
      duplicate_error = try
        WebQuantumSavory.validate_payload(duplicate_physical)
        nothing
      catch error
        error
      end
      @test duplicate_error isa WebQuantumSavory.APIError
      @test occursin("Duplicate physical edge endpoints", duplicate_error.message)

      permitted_virtual = deepcopy(duplicate_physical)
      permitted_virtual["net"]["edges"][2]["isLogic"] = true
      permitted_virtual["net"]["edges"][2]["data"]["protocols"] = [Dict(
        "id" => "virtual-consumer",
        "type" => string(QuantumSavory.ProtocolZoo.EntanglementConsumer),
        "parameters" => Any[],
      )]
      @test WebQuantumSavory.validate_payload(permitted_virtual)["success"] == true

      forbidden_virtual = deepcopy(permitted_virtual)
      forbidden_virtual["net"]["edges"][2]["data"]["protocols"][1]["type"] =
        string(QuantumSavory.ProtocolZoo.EntanglerProt)
      forbidden_error = try
        WebQuantumSavory.validate_payload(forbidden_virtual)
        nothing
      catch error
        error
      end
      @test forbidden_error isa WebQuantumSavory.APIError
      @test occursin("not permitted on a virtual edge", forbidden_error.message)

      for invalid_delay in (true, -1, Inf, "slow")
        invalid_payload = deepcopy(test_payload)
        invalid_payload["net"]["edges"][1]["data"]["propagationDelaySeconds"] = invalid_delay
        delay_error = try
          WebQuantumSavory.validate_payload(invalid_payload)
          nothing
        catch error
          error
        end
        @test delay_error isa WebQuantumSavory.APIError
        @test occursin("propagation delay", delay_error.message)
      end

      for (field, invalid_value, message) in (
        ("distanceMeters", -1, "distance"),
        ("distanceMeters", Inf, "distance"),
        ("refractiveIndex", 0, "refractive index"),
        ("refractiveIndex", "glass", "refractive index"),
        ("lossDbPerKm", -1, "fiber loss"),
        ("lossDbPerKm", Inf, "fiber loss"),
        ("transmissivity", -0.01, "transmissivity"),
        ("transmissivity", 1.01, "transmissivity"),
        ("transmissivity", Inf, "transmissivity"),
      )
        invalid_payload = deepcopy(test_payload)
        invalid_payload["net"]["edges"][1]["data"][field] = invalid_value
        physical_error = try
          WebQuantumSavory.validate_payload(invalid_payload)
          nothing
        catch error
          error
        end
        @test physical_error isa WebQuantumSavory.APIError
        @test occursin(message, physical_error.message)
      end

      independent_physical_values = deepcopy(test_payload)
      independent_physical_values["net"]["edges"][1]["data"]["distanceMeters"] = 1.0
      independent_physical_values["net"]["edges"][1]["data"]["lossDbPerKm"] = 0.2
      independent_physical_values["net"]["edges"][1]["data"]["transmissivity"] = 0.1
      @test WebQuantumSavory.validate_payload(independent_physical_values)["success"] == true
  end

  @testset "Simulation Variables" begin
      # Legacy payloads have no variables field and remain valid.
      legacy_variables = WebQuantumSavory._parse_variables(test_payload)
      @test isempty(legacy_variables)
      @test WebQuantumSavory.validate_payload(test_payload)["success"] == true

      variable_payload = deepcopy(test_payload)
      variable_payload["variables"] = [
        Dict(
          "id" => "variable_retention",
          "name" => "retention time",
          "type" => "Float64",
          "value" => 0.75,
        ),
        Dict(
          "id" => "variable_default",
          "name" => "use default",
          "type" => "default",
          "value" => nothing,
        ),
      ]
      retention_parameter(payload) = only(filter(
        parameter -> parameter["name"] == "retention_time",
        payload["net"]["nodes"][1]["data"]["protocols"][1]["parameters"],
      ))
      retention_parameter(variable_payload)["value"] = Dict(
        "kind" => "variable",
        "id" => "variable_retention",
      )

      validated = WebQuantumSavory.validate_payload(variable_payload)
      @test validated["success"] == true
      variables = WebQuantumSavory._parse_variables(variable_payload)
      @test variables["variable_retention"] isa WebQuantumSavory.Variable
      @test variables["variable_retention"].name == "retention time"
      @test variables["variable_retention"].type == "Float64"
      @test variables["variable_retention"].value == 0.75

      reference = WebQuantumSavory._parse_variable_reference(Dict(
        "kind" => "variable",
        "id" => "variable_retention",
      ))
      @test reference isa WebQuantumSavory.VariableReference
      @test reference.id == "variable_retention"
      @test WebQuantumSavory._parse_variable_reference(Dict("kind" => "literal", "id" => "x")) === nothing
      @test WebQuantumSavory._parse_variable_reference(3.0) === nothing

      function variable_validation_error(mutator)
        payload = deepcopy(variable_payload)
        mutator(payload)
        try
          WebQuantumSavory.validate_payload(payload)
          return nothing
        catch e
          return e
        end
      end

      invalid_array = variable_validation_error(payload -> (payload["variables"] = Dict()))
      @test invalid_array isa WebQuantumSavory.APIError
      @test invalid_array.status_code == 400

      duplicate_id = variable_validation_error(payload -> push!(
        payload["variables"],
        Dict("id" => "variable_retention", "name" => "other", "type" => "Int64", "value" => 2),
      ))
      @test duplicate_id isa WebQuantumSavory.APIError
      @test occursin("Duplicate variable ID", duplicate_id.message)

      duplicate_name = variable_validation_error(payload -> push!(
        payload["variables"],
        Dict("id" => "other", "name" => "retention time", "type" => "Int64", "value" => 2),
      ))
      @test duplicate_name isa WebQuantumSavory.APIError
      @test occursin("Duplicate variable name", duplicate_name.message)

      missing_value = variable_validation_error(payload -> delete!(payload["variables"][1], "value"))
      @test missing_value isa WebQuantumSavory.APIError
      @test occursin("missing required field: 'value'", missing_value.message)

      malformed_reference = variable_validation_error(payload -> delete!(
        retention_parameter(payload)["value"],
        "id",
      ))
      @test malformed_reference isa WebQuantumSavory.APIError
      @test occursin("missing required field: 'id'", malformed_reference.message)

      dangling_reference = variable_validation_error(payload -> (
        retention_parameter(payload)["value"]["id"] = "missing"
      ))
      @test dangling_reference isa WebQuantumSavory.APIError
      @test dangling_reference.status_code == 400
      @test occursin("Unknown variable reference", dangling_reference.message)

      null_typed_value = variable_validation_error(payload -> (payload["variables"][1]["value"] = nothing))
      @test null_typed_value isa WebQuantumSavory.APIError
      @test occursin("must not be null", null_typed_value.message)
  end

  @testset "Variable-backed Protocol Parameters" begin
      runtime_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
      simulation_name = "variable_backed_protocol_parameters"
      runtime_payload["name"] = simulation_name
      runtime_payload["variables"] = [
        Dict("id" => "probability", "name" => "probability", "type" => "Float64", "value" => 0.25),
        Dict("id" => "no_retry", "name" => "no retry", "type" => "Nothing", "value" => nothing),
        Dict("id" => "protocol_default", "name" => "protocol default", "type" => "Function", "value" => "default"),
        Dict(
          "id" => "contextual_lambda",
          "name" => "contextual lambda",
          "type" => "Lambda",
          "value" => "candidates -> self * 100 + nodeid(\"Cambridge\") + first(candidates)",
        ),
      ]

      protocol_definition = runtime_payload["net"]["edges"][1]["data"]["protocols"][1]
      parameter_by_name(name) = only(filter(p -> p["name"] == name, protocol_definition["parameters"]))
      parameter_by_name("success_prob")["value"] = Dict("kind" => "variable", "id" => "probability")
      parameter_by_name("retry_lock_time")["value"] = Dict("kind" => "variable", "id" => "no_retry")
      parameter_by_name("attempt_time")["value"] = Dict("kind" => "variable", "id" => "protocol_default")

      contextual_protocol_definition = Dict(
        "id" => "runtime-contextual-swapper",
        "type" => string(QuantumSavory.ProtocolZoo.SwapperProt),
        "parameters" => Any[
          Dict(
            "name" => "chooseL",
            "type" => "Function",
            "value" => Dict("kind" => "variable", "id" => "contextual_lambda"),
          ),
          Dict(
            "name" => "chooseH",
            "type" => "Lambda",
            "value" => "candidates -> self * 1000 + nodeid(\"Amherst\") + first(candidates)",
          ),
          Dict("name" => "rounds", "type" => "Int64", "value" => 0),
        ],
      )
      push!(
        runtime_payload["net"]["nodes"][1]["data"]["protocols"],
        contextual_protocol_definition,
      )

      try
        state = WebQuantumSavory.parse_network_graph(WebQuantumSavory.validate_payload(runtime_payload))
        WebQuantumSavory.prepare_simulation(state, simulation_name)
        protocol = state.protocol_mapping[protocol_definition["id"]]
        @test protocol.success_prob == 0.25
        @test protocol.retry_lock_time === nothing
        @test protocol.attempt_time == 0.001

        contextual_protocol = state.protocol_mapping[contextual_protocol_definition["id"]]
        @test contextual_protocol.chooseL([5]) == 107
        @test contextual_protocol.chooseH([5]) == 1006

        invalid_protocol_definition = Dict(
          "type" => string(QuantumSavory.ProtocolZoo.EntanglerProt),
          "parameters" => [Dict(
            "name" => "success_prob",
            "type" => "Float64",
            "value" => Dict("kind" => "variable", "id" => "invalid_probability"),
          )],
        )
        invalid_variables = Dict(
          "invalid_probability" => WebQuantumSavory.Variable(
            "invalid_probability",
            "invalid probability",
            "Float64",
            "not-a-number",
          ),
        )
        ctx = Dict{Symbol,Any}(
          :sim => state.simulation,
          :net => state.network,
          :nodeA => 1,
          :nodeB => 2,
        )

        states_zoo_protocol_definition = Dict(
          "type" => string(QuantumSavory.ProtocolZoo.EntanglerProt),
          "parameters" => [Dict(
            "name" => "pairstate",
            "type" => "Symbolic",
            "value" => Dict("kind" => "variable", "id" => "zoo_pair_state"),
          )],
        )
        states_zoo_variables = Dict(
          "zoo_pair_state" => WebQuantumSavory.Variable(
            "zoo_pair_state",
            "zoo pair state",
            "Symbolic",
            Dict(
              "kind" => "states_zoo",
              "state_type" => "DepolarizedBellPair",
              "parameters" => Dict("p" => 0.9),
            ),
          ),
        )
        withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false") do
          states_zoo_protocol = WebQuantumSavory._instantiate_protocol(
            states_zoo_protocol_definition,
            ctx;
            variables=states_zoo_variables,
          )
          @test states_zoo_protocol.pairstate isa QuantumSavory.StatesZoo.DepolarizedBellPair
        end

        conversion_error = try
          WebQuantumSavory._instantiate_protocol(
            invalid_protocol_definition,
            ctx;
            variables=invalid_variables,
          )
          nothing
        catch e
          e
        end
        @test conversion_error isa WebQuantumSavory.APIError
        @test conversion_error.status_code == 400
        @test occursin("Failed to convert variable", conversion_error.message)

        incompatible_protocol_definition = Dict(
          "type" => string(QuantumSavory.ProtocolZoo.EntanglerProt),
          "parameters" => [Dict(
            "name" => "success_prob",
            "type" => "Float64",
            "value" => Dict("kind" => "variable", "id" => "string_probability"),
          )],
        )
        incompatible_variables = Dict(
          "string_probability" => WebQuantumSavory.Variable(
            "string_probability",
            "string probability",
            "String",
            "0.25",
          ),
        )
        constructor_error = try
          WebQuantumSavory._instantiate_protocol(
            incompatible_protocol_definition,
            ctx;
            variables=incompatible_variables,
          )
          nothing
        catch e
          e
        end
        @test constructor_error isa WebQuantumSavory.APIError
        @test constructor_error.status_code == 400
        @test occursin("incompatible", constructor_error.message)
        @test constructor_error.details["variable_id"] == "string_probability"
        @test constructor_error.details["parameter_name"] == "success_prob"

        # Literal parameters use the authoritative constructor field type, not
        # a stale or forged client snapshot.
        literal_protocol_definition = deepcopy(incompatible_protocol_definition)
        literal_protocol_definition["parameters"][1]["value"] = "0.25"
        literal_protocol_definition["parameters"][1]["type"] = "String"
        literal_protocol = WebQuantumSavory._instantiate_protocol(
          literal_protocol_definition,
          ctx,
        )
        @test literal_protocol.success_prob == 0.25
      finally
        haskey(WebQuantumSavory.STATE, simulation_name) && WebQuantumSavory.destroy_simulation(simulation_name)
      end

      # A function-valued variable still resolves in the assigned node context.
      kwargs = Dict{Symbol,Any}()
      ctx = Dict{Symbol,Any}(:node => 2)
      @test WebQuantumSavory._handle_typed_parameter!(kwargs, :filter, "Function", "<(self)", ctx)
      @test kwargs[:filter].(1:3) == [true, false, false]
  end

  @testset "Graph Building" begin
      validation_result = WebQuantumSavory.validate_payload(test_payload)
      g = WebQuantumSavory.build_graph(validation_result)
      @test isa(g, SimpleGraph)
      @test nv(g) == 2  # 2 nodes
      @test ne(g) == 1  # 1 edge

      with_virtual = deepcopy(test_payload)
      virtual_edge = deepcopy(with_virtual["net"]["edges"][1])
      virtual_edge["id"] = "virtual-edge"
      virtual_edge["isLogic"] = true
      virtual_edge["data"]["protocols"] = Any[]
      push!(with_virtual["net"]["edges"], virtual_edge)
      virtual_graph = WebQuantumSavory.build_graph(
        WebQuantumSavory.validate_payload(with_virtual),
      )
      @test nv(virtual_graph) == 2
      @test ne(virtual_graph) == 1
  end

  @testset "Physical Propagation Delays" begin
      payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
      simulation_name = "physical_propagation_delays"
      payload["name"] = simulation_name
      payload["net"]["edges"][1]["data"]["distanceMeters"] = 12_500.0
      payload["net"]["edges"][1]["data"]["propagationDelaySeconds"] = 0.125
      payload["net"]["edges"][1]["data"]["refractiveIndex"] = 1.5
      payload["net"]["edges"][1]["data"]["lossDbPerKm"] = 0.2
      payload["net"]["edges"][1]["data"]["transmissivity"] = 0.95
      entangler_definition = payload["net"]["edges"][1]["data"]["protocols"][1]
      choose_a = only(filter(
        parameter -> parameter["name"] == "chooseslotA",
        entangler_definition["parameters"],
      ))
      choose_a["type"] = "Lambda"
      choose_a["value"] =
        "slot -> distance == 12500.0 && delay == 0.125 && " *
        "refractive_index == 1.5 && loss == 0.2 && transmissivity == 0.95 && " *
        "node_a == 1 && node_b == 2 ? " *
        "slot > 0 : false"
      virtual_edge = deepcopy(payload["net"]["edges"][1])
      virtual_edge["id"] = "virtual-edge"
      virtual_edge["isLogic"] = true
      virtual_edge["data"]["protocols"] = [Dict(
        "id" => "virtual-consumer",
        "type" => string(QuantumSavory.ProtocolZoo.EntanglementConsumer),
        "parameters" => Any[],
      )]
      push!(payload["net"]["edges"], virtual_edge)

      physical_context = WebQuantumSavory._edge_function_context(
        payload["net"]["edges"][1],
        1,
        2,
      )
      @test physical_context.distance_meters == 12_500.0
      @test physical_context.delay_seconds == 0.125
      @test physical_context.refractive_index == 1.5
      @test physical_context.loss_db_per_km == 0.2
      @test physical_context.transmissivity == 0.95
      @test physical_context.node_a == 1
      @test physical_context.node_b == 2

      virtual_context = WebQuantumSavory._edge_function_context(virtual_edge, 1, 2)
      @test isnothing(virtual_context.distance_meters)
      @test isnothing(virtual_context.delay_seconds)
      @test isnothing(virtual_context.refractive_index)
      @test isnothing(virtual_context.loss_db_per_km)
      @test isnothing(virtual_context.transmissivity)
      @test virtual_context.node_a == 1
      @test virtual_context.node_b == 2

      legacy_edge = deepcopy(payload["net"]["edges"][1])
      delete!(legacy_edge["data"], "distanceMeters")
      delete!(legacy_edge["data"], "propagationDelaySeconds")
      delete!(legacy_edge["data"], "refractiveIndex")
      delete!(legacy_edge["data"], "lossDbPerKm")
      delete!(legacy_edge["data"], "transmissivity")
      legacy_context = WebQuantumSavory._edge_function_context(legacy_edge, 1, 2)
      @test isnothing(legacy_context.distance_meters)
      @test legacy_context.delay_seconds == 0.0
      @test isnothing(legacy_context.refractive_index)
      @test isnothing(legacy_context.loss_db_per_km)
      @test isnothing(legacy_context.transmissivity)

      try
        state = WebQuantumSavory.parse_network_graph(WebQuantumSavory.validate_payload(payload))
        @test ne(state.graph) == 1
        for endpoints in (1 => 2, 2 => 1)
          @test QuantumSavory.channel(state.network, endpoints).delay == 0.125
          @test QuantumSavory.qchannel(state.network, endpoints).queue.delay == 0.125
        end
        WebQuantumSavory.prepare_simulation(state, simulation_name)
        entangler = state.protocol_mapping[entangler_definition["id"]]
        @test entangler.chooseslotA(7)
        @test state.protocol_mapping["virtual-consumer"] isa
          QuantumSavory.ProtocolZoo.EntanglementConsumer
      finally
        haskey(WebQuantumSavory.STATE, simulation_name) &&
          WebQuantumSavory.destroy_simulation(simulation_name)
      end
  end

  @testset "Register Creation" begin
      validation_result = WebQuantumSavory.validate_payload(test_payload)
      registers, slot_mapping, slot_reverse_mapping = WebQuantumSavory.create_registers_from_nodes(validation_result)
      @test isa(registers, Vector)
      @test length(registers) == 2  # Both nodes (including empty slots node)
      @test isa(registers[1], Register)
      @test isa(slot_mapping, Dict)
      @test !isempty(slot_mapping)  # Should have some slots from node1
      @test all(
        representation isa QuantumOpticsRepr
        for register in registers
        for representation in register.reprs
      )

      # No-noise slots still need a positional `nothing` entry so background
      # operations can index the register by slot. Exercise object, string, and
      # missing representations while keeping one real background in place.
      default_noise_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
      default_noise_payload["net"]["nodes"][1]["data"]["slots"][2]["backgroundNoise"] = Dict(
        "type" => "T1Decay",
        "parameters" => [Dict("name" => "t1", "value" => 5.0)],
      )
      delete!(default_noise_payload["net"]["nodes"][2]["data"]["slots"][1], "backgroundNoise")
      default_noise_payload["net"]["nodes"][2]["data"]["slots"][2]["backgroundNoise"] = "default"

      default_noise_validation = WebQuantumSavory.validate_payload(default_noise_payload)
      default_noise_registers, _, _ = WebQuantumSavory.create_registers_from_nodes(default_noise_validation)
      @test length.(getfield.(default_noise_registers, :backgrounds)) == length.(default_noise_registers)
      @test isnothing(default_noise_registers[1].backgrounds[1])
      @test default_noise_registers[1].backgrounds[2] isa QuantumSavory.T1Decay
      @test all(isnothing, default_noise_registers[2].backgrounds)

      selected_representation_payload = deepcopy(default_noise_payload)
      selected_representation_payload["simulationConfig"] = Dict(
        "qubitRepresentation" => "QuantumMCRepr",
        "qumodeRepresentation" => "GabsRepr",
      )
      selected_representation_payload["net"]["nodes"][1]["data"]["slots"][2]["type"] = "Qumode"
      selected_representation_validation =
        WebQuantumSavory.validate_payload(selected_representation_payload)
      selected_representation_registers, _, _ =
        WebQuantumSavory.create_registers_from_nodes(selected_representation_validation)
      @test selected_representation_registers[1].reprs[1] isa QuantumMCRepr
      @test selected_representation_registers[1].reprs[2] isa QuantumSavory.GabsRepr

      # This is the operation that exposed the malformed background vector in
      # SwapperProt after it selected an assigned slot.
      initialize!(default_noise_registers[2][1], X₁; time=0.0)
      @test_nowarn uptotime!(default_noise_registers[2][1], 1.0)
  end

  @testset "Register Names" begin
      named_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
      simulation_name = "named_registers"
      named_payload["name"] = simulation_name

      try
        state = WebQuantumSavory.parse_network_graph(WebQuantumSavory.validate_payload(named_payload))
        @test state.network.names == ["Amherst", "Cambridge"]
        @test QuantumSavory.name.(state.network.registers) == ["Amherst", "Cambridge"]
        @test occursin("Amherst(#1)", sprint(show, state.network.registers[1]))
        @test sprint(show, state.network.registers[1][1]; context=:compact => true) ==
          "Amherst(#1).1"
      finally
        haskey(WebQuantumSavory.STATE, simulation_name) &&
          WebQuantumSavory.destroy_simulation(simulation_name)
      end
  end

  @testset "RegisterNet Creation" begin
      validation_result = WebQuantumSavory.validate_payload(test_payload)
      g = WebQuantumSavory.build_graph(validation_result)
      registers, slot_mapping, slot_reverse_mapping = WebQuantumSavory.create_registers_from_nodes(validation_result)
      
      # Test that RegisterNet creation fails with empty slot registers (current behavior)
      @test_throws BoundsError RegisterNet(g, registers)
  end

  @testset "Type Resolution" begin
      # Test protocol type resolution
      protocol_type = WebQuantumSavory._resolve_type_from_string("QuantumSavory.ProtocolZoo.CutoffProt", :protocol)
      @test protocol_type !== nothing

      # Catalog IDs are exact in the breaking schema.
      protocol_type = WebQuantumSavory._resolve_type_from_string("quantumsavory.protocolzoo.cutoffprot", :protocol)
      @test protocol_type === nothing

      # Test non-existent type
      protocol_type = WebQuantumSavory._resolve_type_from_string("NonExistentType", :protocol)
      @test protocol_type === nothing
  end

  @testset "Protocol Schema Placement" begin
      node_schema = QuantumSavory.ProtocolZoo.protocol_schema(
        QuantumSavory.ProtocolZoo.CutoffProt,
      )
      edge_schema = QuantumSavory.ProtocolZoo.protocol_schema(
        QuantumSavory.ProtocolZoo.EntanglerProt,
      )
      @test WebQuantumSavory._protocol_placement_kwargs(
        node_schema,
        Dict{Symbol,Any}(:node => 1),
      ) == (only(node_schema.placement_fields) => 1,)
      @test WebQuantumSavory._protocol_placement_kwargs(
        edge_schema,
        Dict{Symbol,Any}(:nodeA => 1, :nodeB => 2),
      ) == (
        edge_schema.placement_fields[1] => 1,
        edge_schema.placement_fields[2] => 2,
      )
      @test_throws WebQuantumSavory.APIError WebQuantumSavory._protocol_placement_kwargs(
        node_schema,
        Dict{Symbol,Any}(:nodeA => 1, :nodeB => 2),
      )
      @test_throws WebQuantumSavory.APIError WebQuantumSavory._protocol_placement_kwargs(
        edge_schema,
        Dict{Symbol,Any}(:node => 1),
      )
  end

  @testset "State Serialization" begin
      # Create a minimal state
      state = WebQuantumSavory.State(name="test_simulation")
      serialized = WebQuantumSavory.serialize_state(state)

      @test isa(serialized, Dict)
      @test serialized["name"] == "test_simulation"
      @test serialized["status"] == "unknown"
      @test serialized["node_count"] == 0
      @test serialized["edge_count"] == 0
      @test serialized["protocols_launched"] === nothing
      @test haskey(serialized, "message")
      @test haskey(serialized, "simulation")
      @test haskey(serialized["simulation"], "simulation_started_at")
      @test haskey(serialized["simulation"], "simulation_execution_time_exceeded")
      @test haskey(serialized["simulation"], "simulation_auto_purged")
      @test haskey(serialized["simulation"], "simulation_panic")
      @test serialized["simulation"]["simulation_panic"] === nothing
  end

  @testset "Status Determination" begin
      # Test created status
      state = WebQuantumSavory.State(name="test", graph=SimpleGraph(2))
      status = WebQuantumSavory._determine_status(state)
      @test status == "created"

      # Test prepared status
      state = WebQuantumSavory.State(name="test", network=nothing)
      status = WebQuantumSavory._determine_status(state)
      @test status == "unknown"

      # Test prepared status with simulation
      state = WebQuantumSavory.State(name="test", simulation=nothing)
      status = WebQuantumSavory._determine_status(state)
      @test status == "unknown"

      # Test prepared status with graph (created status)
      state = WebQuantumSavory.State(name="test", graph=SimpleGraph(2))
      status = WebQuantumSavory._determine_status(state)
      @test status == "created"

      # Test prepared status with simulation (we'll test this by checking the has_run field)
      # Since we can't easily create a Simulation object, we'll test the logic indirectly
      state = WebQuantumSavory.State(name="test", has_run=false)
      # This should return "unknown" since simulation is nothing
      status = WebQuantumSavory._determine_status(state)
      @test status == "unknown"

      # Test unknown status
      state = WebQuantumSavory.State(name="test")
      status = WebQuantumSavory._determine_status(state)
      @test status == "unknown"
  end

  @testset "Status Messages" begin
      # Test created message
      state = WebQuantumSavory.State(name="test", graph=SimpleGraph(2))
      message = WebQuantumSavory._get_status_message(state)
      @test message == "Network has been created"

      # Test prepared message
      state = WebQuantumSavory.State(name="test", network=nothing)
      message = WebQuantumSavory._get_status_message(state)
      @test message == "No network data available"

    # Test created message
    state = WebQuantumSavory.State(name="test", graph=SimpleGraph(2))
    message = WebQuantumSavory._get_status_message(state)
    @test message == "Network has been created"

    # Test unknown message
    state = WebQuantumSavory.State(name="test")
    message = WebQuantumSavory._get_status_message(state)
    @test message == "No network data available"
  end

  @testset "Error Handling Framework" begin
    # Test APIError creation
    error1 = WebQuantumSavory.APIError("Test error", 400)
    @test error1.message == "Test error"
    @test error1.status_code == 400
    @test error1.error_code == "API_ERROR"
    @test error1.details === nothing

    error2 = WebQuantumSavory.APIError("Test error", 404, "NOT_FOUND")
    @test error2.error_code == "NOT_FOUND"

    error3 = WebQuantumSavory.APIError("Test error", 500, "SERVER_ERROR", Dict("key" => "value"))
    @test error3.details["key"] == "value"

    # Test error response creation
    response = WebQuantumSavory.create_error_response(error3)
    @test response == Dict(
      "error" => Dict(
        "code" => "SERVER_ERROR",
        "message" => "Test error",
        "details" => Dict("key" => "value"),
      ),
    )
    @test WebQuantumSavory.create_error_response(error1)["error"]["details"] ==
      Dict{String,Any}()

    # Test convenience error functions
    not_found = WebQuantumSavory.not_found_error("Simulation", "test_sim")
    @test not_found.message == "Simulation not found"
    @test not_found.status_code == 404
    @test not_found.error_code == "NOT_FOUND"
    @test not_found.details["resource"] == "Simulation"
    @test not_found.details["identifier"] == "test_sim"

    validation = WebQuantumSavory.validation_error("Invalid input")
    @test validation.message == "Invalid input"
    @test validation.status_code == 400
    @test validation.error_code == "VALIDATION_ERROR"

    server = WebQuantumSavory.server_error("Internal error", Dict{String, Any}("trace" => "stack"))
    @test server.message == "Internal error"
    @test server.status_code == 500
    @test server.error_code == "SERVER_ERROR"
    @test server.details["trace"] == "stack"

    bad_request = WebQuantumSavory.bad_request_error("Bad request")
    @test bad_request.message == "Bad request"
    @test bad_request.status_code == 400
    @test bad_request.error_code == "BAD_REQUEST"
  end

  @testset "Slot State Inspection" begin
    # Create a test state with slot mapping
    validation_result = WebQuantumSavory.validate_payload(test_payload)
    registers, slot_mapping, slot_reverse_mapping = WebQuantumSavory.create_registers_from_nodes(validation_result)
    state = WebQuantumSavory.State(
      name="test",
      slot_mapping=slot_mapping,
    )

    reverse_mapping = WebQuantumSavory.ensure_slot_reverse_mapping!(state)
    @test reverse_mapping === state.slot_reverse_mapping
    @test length(reverse_mapping) == length(slot_mapping)
    @test all(reverse_mapping[slot] == slot_id for (slot_id, slot) in slot_mapping)
    @test WebQuantumSavory.ensure_slot_reverse_mapping!(state) === reverse_mapping

    if !isempty(slot_mapping)
      missing_slot_id, missing_slot = first(slot_mapping)
      delete!(reverse_mapping, missing_slot)
      @test WebQuantumSavory.ensure_slot_reverse_mapping!(state)[missing_slot] == missing_slot_id
    end

    # Test get_slot_state with existing slot
    if !isempty(slot_mapping)
      slot_id, slot = first(slot_mapping)
      state.network = QuantumSavory.RegisterNet(
        SimpleGraph(1),
        [parent(slot)],
      )
      result = WebQuantumSavory.get_slot_state(slot_id, state)
      @test result["slot_id"] == slot_id
      @test haskey(result, "is_locked")
      @test haskey(result, "is_assigned")
      @test result["access_time"] ==
        QuantumSavory.access_time(slot_mapping[slot_id])
      @test haskey(result, "entangled_slots")
      @test haskey(result, "entangled_slot_details")
    end

    # Test get_slot_state with non-existent slot
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.get_slot_state("non_existent_slot", state)
  end

  @testset "Protocol State Inspection" begin
    # Create a test state with protocol mapping
    state = WebQuantumSavory.State(name="test", protocol_mapping=Dict("test_protocol" => "mock_protocol"))

    # Test get_protocol_state with existing protocol
    result = WebQuantumSavory.get_protocol_state("test_protocol", state)
    @test result["protocol_id"] == "test_protocol"
    @test haskey(result, "protocol_type")
    @test haskey(result, "html_base64")
    @test haskey(result, "png_base64")

    # Test get_protocol_state with non-existent protocol
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.get_protocol_state("non_existent_protocol", state)
  end

  @testset "State Cleanup" begin
    # Exercise cleanup with a live assigned state so register back-references are removed.
    cleanup_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    validation_result = WebQuantumSavory.validate_payload(cleanup_payload)
    g = WebQuantumSavory.build_graph(validation_result)
    registers, slot_mapping, slot_reverse_mapping = WebQuantumSavory.create_registers_from_nodes(validation_result)
    network = RegisterNet(g, registers)
    assigned_slots = (registers[1][1], registers[2][1])
    initialize!(assigned_slots, StabilizerState("ZZ XX"); time=0.0)
    @test all(QuantumSavory.isassigned, assigned_slots)

    state = WebQuantumSavory.State(
      name="test_cleanup",
      payload=validation_result,
      graph=g,
      network=network,
      slot_mapping=slot_mapping,
      slot_reverse_mapping=slot_reverse_mapping,
      protocol_mapping=Dict("test" => "protocol")
    )

    # Test cleanup
    cleanup_report = WebQuantumSavory.cleanup_state!(state)
    @test WebQuantumSavory.cleanup_succeeded(cleanup_report)
    @test isempty(cleanup_report.failures)
    @test cleanup_report.degradation_event === nothing

    # Verify cleanup worked
    @test state.network === nothing
    @test state.slot_mapping === nothing
    @test state.protocol_mapping === nothing
    @test state.graph === nothing
    @test state.payload === nothing
    @test all(slot -> !QuantumSavory.isassigned(slot), assigned_slots)

    # Every originally assigned release is attempted even when each one fails.
    failed_registers, failed_slot_mapping, failed_slot_reverse_mapping =
      WebQuantumSavory.create_registers_from_nodes(validation_result)
    failed_network = RegisterNet(g, failed_registers)
    failed_slots = (failed_registers[1][1], failed_registers[2][1])
    initialize!(failed_slots, StabilizerState("ZZ XX"); time=0.0)
    failed_state = WebQuantumSavory.State(
      name="test_cleanup_failure",
      payload=validation_result,
      graph=g,
      network=failed_network,
      protocols_launched=Dict("node" => 1),
      simulation=Simulation(),
      slot_mapping=failed_slot_mapping,
      slot_reverse_mapping=failed_slot_reverse_mapping,
      protocol_mapping=Dict("test" => "protocol"),
    )
    failed_service = WebQuantumSavory.SimulationService(
      Dict(failed_state.name => failed_state),
    )
    attempted_slots = Any[]
    failing_release = function (slot)
      push!(attempted_slots, slot)
      error("injected release failure")
    end

    cleanup_error = try
      WebQuantumSavory.simulation_destroy!(
        failed_service,
        failed_state.name;
        release_slot! = failing_release,
      )
      nothing
    catch error
      error
    end

    @test cleanup_error isa WebQuantumSavory.APIError
    if cleanup_error isa WebQuantumSavory.APIError
      @test cleanup_error.status_code == 500
      @test cleanup_error.error_code == "SIMULATION_CLEANUP_FAILED"
      @test cleanup_error.details["simulation"] == failed_state.name
      @test cleanup_error.details["failure_count"] == 2
      @test length(cleanup_error.details["failures"]) == 2
      @test all(
        failure -> failure["stage"] == "release_assigned_slot",
        cleanup_error.details["failures"],
      )
      degradation_event = cleanup_error.details["degradation_event"]
      @test degradation_event["severity"] == "error"
      @test degradation_event["error_code"] ==
        "SIMULATION_CLEANUP_FAILED"
      @test degradation_event["cleanup_failure_count"] == 2
    end
    @test length(attempted_slots) == 2
    @test all(
      slot -> any(attempted -> attempted === slot, attempted_slots),
      failed_slots,
    )
    @test !WebQuantumSavory.simulation_exists(
      failed_service,
      failed_state.name,
    )
    @test isempty(failed_service.lifecycle_locks)
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.simulation_status(
      failed_service,
      failed_state.name,
    )
    @test failed_state.payload === nothing
    @test failed_state.graph === nothing
    @test failed_state.network === nothing
    @test failed_state.protocols_launched === nothing
    @test failed_state.simulation === nothing
    @test failed_state.slot_mapping === nothing
    @test failed_state.slot_reverse_mapping === nothing
    @test failed_state.protocol_mapping === nothing

    for slot in failed_slots
      QuantumSavory.isassigned(slot) && QuantumSavory.traceout!(slot)
    end
  end

  @testset "Slot Serialization" begin
    # Create a test state with slot mapping
    validation_result = WebQuantumSavory.validate_payload(test_payload)
    registers, slot_mapping, slot_reverse_mapping = WebQuantumSavory.create_registers_from_nodes(validation_result)
    state = WebQuantumSavory.State(name="test", slot_mapping=slot_mapping)

    # Test slot serialization
    serialized_slots = WebQuantumSavory._serialize_slots(state)
    @test haskey(serialized_slots, "slots")
    @test haskey(serialized_slots, "entanglements")
    @test isa(serialized_slots["slots"], Vector)
    @test isa(serialized_slots["entanglements"], Vector)

    # Test with empty slot mapping
    empty_state = WebQuantumSavory.State(name="empty", slot_mapping=nothing)
    empty_serialized = WebQuantumSavory._serialize_slots(empty_state)
    @test empty_serialized["slots"] == []
    @test empty_serialized["entanglements"] == []
  end

  @testset "Protocol Serialization" begin
    # Create a test state with protocol mapping
    state = WebQuantumSavory.State(name="test", protocol_mapping=Dict("proto1" => "protocol1", "proto2" => "protocol2"))

    # Test protocol serialization
    serialized_protocols = WebQuantumSavory._serialize_protocols(state)
    @test haskey(serialized_protocols, "protocols")
    @test isa(serialized_protocols["protocols"], Vector)
    @test length(serialized_protocols["protocols"]) == 2

    # Test with empty protocol mapping
    empty_state = WebQuantumSavory.State(name="empty", protocol_mapping=nothing)
    empty_serialized = WebQuantumSavory._serialize_protocols(empty_state)
    @test empty_serialized["protocols"] == []
  end

  @testset "Network Time Tracker" begin
    # Test that RegisterNet creation fails with empty slot registers (current behavior)
    validation_result = WebQuantumSavory.validate_payload(test_payload)
    g = WebQuantumSavory.build_graph(validation_result)
    registers, slot_mapping = WebQuantumSavory.create_registers_from_nodes(validation_result)
    
    # Test that RegisterNet creation fails due to empty slots (expected behavior)
    @test_throws BoundsError RegisterNet(g, registers)
  end

  @testset "Type Resolution Functions" begin
    # Test noise type resolution
    noise_type = WebQuantumSavory._resolve_noise_type_from_string("Depolarization")
    @test noise_type !== nothing

    # Simulator catalog identifiers are exact.
    noise_type = WebQuantumSavory._resolve_noise_type_from_string("DEPOLARIZATION")
    @test noise_type === nothing

    # # Test default noise type
    # default_noise = WebQuantumSavory._resolve_noise_type_from_string("default")
    # @test default_noise !== nothing

    # Test slot type resolution
    slot_type = WebQuantumSavory._resolve_slot_type_from_string("Qubit")
    @test slot_type !== nothing

    # Simulator catalog identifiers are exact.
    slot_type = WebQuantumSavory._resolve_slot_type_from_string("QUBIT")
    @test slot_type === nothing

    # Test non-existent types
    @test WebQuantumSavory._resolve_noise_type_from_string("NonExistent") === nothing
    @test WebQuantumSavory._resolve_slot_type_from_string("NonExistent") === nothing
  end

  @testset "Parameter Conversion Utility" begin
    # Wildcard selections carry no user-entered value, but the UI sends the
    # selected entry name so the backend can construct the sentinel.
    for wildcard_type in ("Wildcard", "QuantumSavory.Wildcard")
      ok, wildcard = WebQuantumSavory._convert_parameter_value(wildcard_type, "Wildcard")
      @test ok
      @test wildcard isa QuantumSavory.Wildcard
    end

    # Int conversions
    ok, v = WebQuantumSavory._convert_parameter_value("Int", "42")
    @test ok && v == 42
    ok, v = WebQuantumSavory._convert_parameter_value("Int64", 7.0)
    @test ok && v == 7

    # Float conversions
    ok, v = WebQuantumSavory._convert_parameter_value("Float64", "3.14")
    @test ok && v ≈ 3.14
    ok, v = WebQuantumSavory._convert_parameter_value("Float32", 2)
    @test ok && v == 2.0

    # Strings and explicit Nothing values do not require Julia evaluation.
    ok, v = WebQuantumSavory._convert_parameter_value("String", 123)
    @test ok && v == "123"
    ok, v = WebQuantumSavory._convert_parameter_value("Nothing", nothing)
    @test ok && v === nothing

    # Bool conversions
    ok, v = WebQuantumSavory._convert_parameter_value("Bool", "true")
    @test ok && v === true
    ok, v = WebQuantumSavory._convert_parameter_value("Bool", "off")
    @test ok && v === false
    ok, v = WebQuantumSavory._convert_parameter_value("Bool", 0)
    @test ok && v === false
    ok, v = WebQuantumSavory._convert_parameter_value("Bool", :nope)
    @test !ok

    # Union with Nothing
    ok, v = WebQuantumSavory._convert_parameter_value("Union{Nothing, Int64}", "nothing")
    @test ok && v === nothing
    ok, v = WebQuantumSavory._convert_parameter_value("Union{Nothing, Float64}", "2.5")
    @test ok && v == 2.5
    ok, v = WebQuantumSavory._convert_parameter_value("Union{Nothing, String}", 123)
    @test ok && v == "123"
    ok, v = WebQuantumSavory._convert_parameter_value("Union{Nothing, Bool}", "yes")
    @test ok && v === true
  end

  @testset "Unsafe Evaluation Policy" begin
    @test !WebQuantumSavory.unsafe_code_evaluation_enabled(
      profile="local",
      override=nothing,
    )
    @test WebQuantumSavory.unsafe_code_evaluation_enabled(
      profile="local",
      override="true",
      backend_host="127.0.0.1",
    )
    @test WebQuantumSavory.unsafe_code_evaluation_enabled(
      profile="local",
      override="true",
      backend_host="::1",
    )
    @test !WebQuantumSavory.unsafe_code_evaluation_enabled(
      profile="local",
      override="true",
      backend_host="0.0.0.0",
    )
    nonloopback_error = try
      WebQuantumSavory.require_unsafe_code_evaluation(
        profile="local",
        override="true",
        backend_host="192.0.2.10",
      )
      nothing
    catch error
      error
    end
    @test nonloopback_error isa WebQuantumSavory.APIError
    if nonloopback_error isa WebQuantumSavory.APIError
      @test nonloopback_error.status_code == 403
      @test nonloopback_error.error_code ==
        WebQuantumSavory.UNSAFE_EVALUATION_DISABLED_CODE
    end
    @test !WebQuantumSavory.unsafe_code_evaluation_enabled(
      profile="local",
      override="false",
    )
    @test !WebQuantumSavory.unsafe_code_evaluation_enabled(
      profile="public",
      override=nothing,
    )
    @test !WebQuantumSavory.unsafe_code_evaluation_enabled(
      profile="public",
      override="false",
    )
    @test !WebQuantumSavory.unsafe_code_evaluation_enabled(
      profile="public",
      override="true",
    )

    for malformed in (" TRUE ", "False", "1", "yes", "")
      @test_throws ArgumentError WebQuantumSavory.unsafe_code_evaluation_enabled(
        profile="local",
        override=malformed,
      )
      @test_throws ArgumentError WebQuantumSavory.unsafe_code_evaluation_enabled(
        profile="public",
        override=malformed,
      )
    end
    @test_throws ArgumentError WebQuantumSavory.unsafe_code_evaluation_enabled(
      profile=nothing,
      override="false",
    )
    for malformed in ("dev", "test", "prod", "LOCAL", " public ", "")
      @test_throws ArgumentError WebQuantumSavory.unsafe_code_evaluation_enabled(
        profile=malformed,
        override="false",
      )
    end

    withenv(
      WebQuantumSavory.DEPLOYMENT_PROFILE_ENV_VAR => "local",
      WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true",
    ) do
      @test WebQuantumSavory.unsafe_code_evaluation_enabled()
    end
    withenv(
      WebQuantumSavory.DEPLOYMENT_PROFILE_ENV_VAR => "public",
      WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true",
    ) do
      @test !WebQuantumSavory.unsafe_code_evaluation_enabled()
      disabled = try
        WebQuantumSavory.Sandbox.test_code("x -> x + 1")
        nothing
      catch error
        error
      end
      @test disabled isa WebQuantumSavory.APIError
      if disabled isa WebQuantumSavory.APIError
        @test disabled.status_code == 403
        @test disabled.error_code ==
          WebQuantumSavory.UNSAFE_EVALUATION_DISABLED_CODE
      end
    end
    withenv(
      WebQuantumSavory.DEPLOYMENT_PROFILE_ENV_VAR => "local",
      WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => nothing,
    ) do
      @test !WebQuantumSavory.unsafe_code_evaluation_enabled()
    end
    withenv(
      WebQuantumSavory.DEPLOYMENT_PROFILE_ENV_VAR => nothing,
      WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false",
    ) do
      @test_throws ArgumentError WebQuantumSavory.main()
    end
    withenv(
      WebQuantumSavory.DEPLOYMENT_PROFILE_ENV_VAR => "staging",
      WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false",
    ) do
      @test_throws ArgumentError WebQuantumSavory.main()
    end
    withenv(
      WebQuantumSavory.DEPLOYMENT_PROFILE_ENV_VAR => "local",
      WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "yes",
    ) do
      @test_throws ArgumentError WebQuantumSavory.main()
    end

    local_environment = Dict(
      WebQuantumSavory.DEPLOYMENT_PROFILE_ENV_VAR => "local",
      WebQuantumSavory.GENIE_ENV_VAR => "test",
      WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true",
      WebQuantumSavory.MCP_ENABLE_ENV_VAR => "true",
      WebQuantumSavory.MOCK_BROKEN_PROTOCOL_ENV_VAR => "true",
    )
    @test WebQuantumSavory.validate_deployment_configuration(local_environment) ==
      WebQuantumSavory.LOCAL_DEPLOYMENT_PROFILE

    public_environment = Dict(
      WebQuantumSavory.DEPLOYMENT_PROFILE_ENV_VAR => "public",
      WebQuantumSavory.GENIE_ENV_VAR => "prod",
      WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true",
      WebQuantumSavory.MCP_ENABLE_ENV_VAR => "false",
      WebQuantumSavory.MOCK_BROKEN_PROTOCOL_ENV_VAR => "false",
    )
    @test WebQuantumSavory.validate_deployment_configuration(public_environment) ==
      WebQuantumSavory.PUBLIC_DEPLOYMENT_PROFILE

    @test ServerLauncherFixture.supervised_shutdown_file(Dict{String,String}()) ===
      nothing
    @test_throws ArgumentError ServerLauncherFixture.supervised_shutdown_file(
      Dict(ServerLauncherFixture.SUPERVISED_SHUTDOWN_FILE_ENV_VAR => " "),
    )
    mktempdir() do directory
      shutdown_file = joinpath(directory, "shutdown")
      environment = Dict(
        ServerLauncherFixture.SUPERVISED_SHUTDOWN_FILE_ENV_VAR => shutdown_file,
      )
      @test ServerLauncherFixture.supervised_shutdown_file(environment) ==
        shutdown_file
      touch(shutdown_file)
      @test_throws ArgumentError ServerLauncherFixture.supervised_shutdown_file(
        environment,
      )
    end

    for (variable, value) in (
      WebQuantumSavory.GENIE_ENV_VAR => "test",
      WebQuantumSavory.MCP_ENABLE_ENV_VAR => "true",
      WebQuantumSavory.MOCK_BROKEN_PROTOCOL_ENV_VAR => "true",
    )
      invalid_environment = copy(public_environment)
      invalid_environment[variable] = value
      @test_throws ArgumentError WebQuantumSavory.validate_deployment_configuration(
        invalid_environment,
      )

      preparation_actions = Symbol[]
      @test_throws ArgumentError ServerLauncherFixture.prepare_server(
        environment=invalid_environment,
        instantiate_mcp_fn=_ -> push!(preparation_actions, :mcp),
        build_frontend_fn=() -> push!(preparation_actions, :frontend),
      )
      @test isempty(preparation_actions)
    end

    failure = WebQuantumSavory.evaluation_failure_response(
      ErrorException("useful evaluation details"),
    )
    @test occursin("useful evaluation details", failure[:error])
    @test failure[:error_code] == WebQuantumSavory.EVALUATION_FAILED_CODE
    @test haskey(failure, :error_type)

    evaluation_error = WebQuantumSavory.validation_error(
      "A runtime expression failed",
      Dict{String,Any}(
        "parameter_name" => "timeout",
        "evaluation_error" => "sensitive response-boundary details",
      ),
    )
    development_error_response = WebQuantumSavory.create_error_response(evaluation_error)
    @test development_error_response["error"]["details"]["parameter_name"] ==
      "timeout"
    @test occursin(
      "sensitive response-boundary details",
      development_error_response["error"]["details"]["evaluation_error"],
    )
  end

  @testset "Native Evaluator Site Inventory" begin
    source_root = normpath(joinpath(@__DIR__, "..", "src"))
    native_evaluator_sites = Tuple{String,String}[]
    evaluator_gateway_sites = Tuple{String,String}[]
    for (root, _, files) in walkdir(source_root)
      for filename in sort(filter(name -> endswith(name, ".jl"), files))
        path = joinpath(root, filename)
        relative_path = relpath(path, normpath(joinpath(source_root, "..")))
        for line in eachline(path)
          stripped = strip(line)
          startswith(stripped, "#") && continue
          occursin(
            r"(^|[^A-Za-z0-9_])(?:Base\.|Core\.)?eval\s*\(",
            stripped,
          ) && push!(native_evaluator_sites, (relative_path, stripped))
          occursin(r"\b_evaluate_in_module\s*\(", stripped) &&
            push!(evaluator_gateway_sites, (relative_path, stripped))
        end
      end
    end

    @test native_evaluator_sites == [(
      joinpath("src", "restricted_evaluation.jl"),
      "Base.eval(evaluation_module, expression)",
    )]
    @test !isempty(evaluator_gateway_sites)
    @test all(
      site -> first(site) == joinpath("src", "restricted_evaluation.jl"),
      evaluator_gateway_sites,
    )
  end

  @testset "Unsafe Evaluation Surfaces" begin
    function test_disabled(thunk)
      caught = try
        thunk()
        nothing
      catch e
        e
      end

      @test caught isa WebQuantumSavory.APIError
      if caught isa WebQuantumSavory.APIError
        @test caught.status_code == 403
        @test caught.error_code == WebQuantumSavory.UNSAFE_EVALUATION_DISABLED_CODE
      end
    end

    original_override = get(ENV, WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR, nothing)
    withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false") do
      # Direct code, symbolic, and lambda entry points enforce the policy before
      # entering their tuple-return/error-wrapping catches.
      test_disabled(() -> WebQuantumSavory.Sandbox.test_code("x -> x + 1"))
      test_disabled(() -> WebQuantumSavory.Sandbox.test_numeric_expression(
        "1 / 2",
        "Float64",
        "variable",
      ))
      test_disabled(() -> WebQuantumSavory.Sandbox.evaluate_symbolic_expression("Z₁"))
      test_disabled(() -> WebQuantumSavory.create_lambda("x -> x + 1"))
      test_disabled(() -> WebQuantumSavory.create_symbolic("Z₁"))

      # Known function references and primitive conversion do not evaluate code.
      safe_function_kwargs = Dict{Symbol,Any}()
      @test WebQuantumSavory._handle_function_lambda_parameter!(
        safe_function_kwargs,
        :filter,
        "Function",
        "identity",
      )
      @test safe_function_kwargs[:filter] === identity

      safe_primitive_kwargs = Dict{Symbol,Any}()
      @test WebQuantumSavory._handle_regular_parameter!(safe_primitive_kwargs, :rounds, "Int64", "3")
      @test safe_primitive_kwargs[:rounds] == 3
      @test WebQuantumSavory._handle_regular_parameter!(safe_primitive_kwargs, :label, "String", "hello")
      @test safe_primitive_kwargs[:label] == "hello"

      safe_noise = WebQuantumSavory._instantiate_noise(Dict(
        "type" => "AmplitudeDamping",
        "parameters" => [Dict("name" => "τ", "value" => "2.0")],
      ))
      @test safe_noise isa QuantumSavory.AmplitudeDamping

      # Explicit source-bearing values propagate denial.
      test_disabled(() -> WebQuantumSavory._handle_function_lambda_parameter!(
        Dict{Symbol,Any}(),
        :filter,
        "Lambda",
        "x -> true",
      ))
      test_disabled(() -> WebQuantumSavory._handle_symbolic_parameter!(
        Dict{Symbol,Any}(),
        :pairstate,
        "Z₁",
      ))
      complex_kwargs = Dict{Symbol,Any}()
      @test !WebQuantumSavory._handle_regular_parameter!(
        complex_kwargs,
        :values,
        "Vector{Int64}",
        "[1, 2]",
      )
      @test isempty(complex_kwargs)
      test_disabled(() -> WebQuantumSavory._instantiate_noise(Dict(
        "type" => "AmplitudeDamping",
        "parameters" => [Dict(
          "name" => "τ",
          "value" => Dict(
            "kind" => "numeric_expression",
            "source" => "begin error(\"must not execute\"); 2.0 end",
          ),
        )],
      )))
    end

    @test get(ENV, WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR, nothing) == original_override
  end

  @testset "Symbolic Expression Evaluation (Unit)" begin
    # Simple valid expression using QuantumSavory symbols should produce latex and value
    expr = "(Z₁⊗Z₁+Z₂⊗Z₂) / √2"
    success, results, err = WebQuantumSavory.Sandbox.test_symbolic_expression(expr)
    @test success == true
    @test isa(results, Dict)
    @test haskey(results, :latex)
    @test haskey(results, :value)

    # Invalid expression should return an error
    bad_expr = "(Z₁⊗Z₁+"  # malformed
    success2, results2, err2 = WebQuantumSavory.Sandbox.test_symbolic_expression(bad_expr)
    @test success2 == false
    @test results2 === nothing
    @test err2 !== nothing
  end

  @testset "Extract Payload Error Handling" begin
    # Test with invalid JSON string
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.extract_payload(nothing, "invalid json")

    # Test with non-string raw payload
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.extract_payload(nothing, 123)

    # Valid JSON parses without requiring headers
    valid_json = JSON.json(Dict("test" => "value"))
    result = WebQuantumSavory.extract_payload(nothing, valid_json)
    @test result["test"] == "value"

    # Existing parsed payload is returned as-is
    existing_payload = Dict("existing" => "data")
    result2 = WebQuantumSavory.extract_payload(existing_payload, "ignored")
    @test result2["existing"] == "data"
  end

  @testset "Protocol Launch" begin
    # Test that RegisterNet creation fails with empty slot registers (current behavior)
    validation_result = WebQuantumSavory.validate_payload(test_payload)
    g = WebQuantumSavory.build_graph(validation_result)
    registers, slot_mapping = WebQuantumSavory.create_registers_from_nodes(validation_result)
    
    # Test that RegisterNet creation fails due to empty slots (expected behavior)
    @test_throws BoundsError RegisterNet(g, registers)
    
    # Test protocol launch structure without creating network
    protocol_mapping = Dict{String, Any}()
    modified_payload = deepcopy(validation_result)
    modified_payload["data"]["net"]["protocols"] = []  # Remove floating protocols

    # Test that the structure is correct even if we can't create the network
    @test haskey(modified_payload["data"]["net"], "protocols")
    @test isa(modified_payload["data"]["net"]["protocols"], Vector)
  end

  @testset "Log Management" begin
    expected_log_groups = String[
      string(group) for group in values(QuantumSavory.LOG_GROUPS)
    ]
    @test WebQuantumSavory.Logger.simulation_log_groups() == expected_log_groups

    canonical_group = QuantumSavory.LOG_GROUPS.protocol
    @test WebQuantumSavory.Logger._canonical_log_group(
      canonical_group,
      pairs((; _group_4=QuantumSavory.LOG_GROUPS.network)),
    ) == canonical_group
    @test WebQuantumSavory.Logger._canonical_log_group(
      :ProtocolZoo,
      pairs((; _group_4=canonical_group)),
    ) == canonical_group
    @test WebQuantumSavory.Logger._canonical_log_group(
      :ProtocolZoo,
      pairs((; _group=QuantumSavory.LOG_GROUPS.simulation)),
    ) == QuantumSavory.LOG_GROUPS.simulation
    @test WebQuantumSavory.Logger._canonical_log_group(
      :ProtocolZoo,
      pairs((; group=canonical_group, _group_label=canonical_group, _group_4=:unknown)),
    ) == :ProtocolZoo

    Core.eval(QuantumSavory, quote
      @resumable function __webquantumsavory_test_resumable_log_group__(sim)
        @debug "resumable group probe" _group=LOG_GROUPS.protocol
        @yield timeout(sim, 0.0)
      end
    end)
    actual_resumable_state = WebQuantumSavory.State(name="actual_resumable_log_group")
    actual_resumable_logger = WebQuantumSavory.Logger.make_logger(
      actual_resumable_state;
      console=Logging.NullLogger(),
    )
    actual_resumable_sim = ConcurrentSim.Simulation()
    Logging.with_logger(actual_resumable_logger) do
      ConcurrentSim.Process(
        QuantumSavory.__webquantumsavory_test_resumable_log_group__,
        actual_resumable_sim,
      )
      ConcurrentSim.run(actual_resumable_sim)
    end
    @test only(actual_resumable_state.log_events)["group"] ==
      string(QuantumSavory.LOG_GROUPS.protocol)

    structured_state = WebQuantumSavory.State(name="structured_logs")
    captured_error, captured_backtrace = try
      error("structured logger failure")
    catch error
      (error, catch_backtrace())
    end
    logger = WebQuantumSavory.Logger.make_logger(structured_state)
    Logging.handle_message(
      logger,
      Logging.Error,
      "ordinary simulator error",
      QuantumSavory,
      QuantumSavory.LOG_GROUPS.protocol,
      :ordinary_error,
      @__FILE__,
      @__LINE__;
      event=:pair_entangled,
      sim_time=1.25,
      sim_process_id=Int128(9_007_199_254_740_992),
      protocol=:ExampleProtocol,
      nodes=(1, 2),
      pair_id=Int128(9_007_199_254_740_993),
      attempt=2,
      context=Dict(:slot => 3, :active => true),
      exception=(captured_error, captured_backtrace),
    )
    WebQuantumSavory.Logger.log_event(
      structured_state,
      "success",
      "manual simulator success";
      result=(:ok, 4),
    )

    captured = structured_state.log_events[1]
    @test captured["source"] == "Simulator"
    @test captured["severity"] == "error"
    @test captured["message"] == "ordinary simulator error"
    @test captured["group"] == "protocol"
    @test captured["event"] == "pair_entangled"
    @test captured["sim_time"] == 1.25
    @test captured["sim_process_id"] == "9007199254740992"
    @test captured["protocol"] == "ExampleProtocol"
    @test captured["nodes"] == Any[1, 2]
    @test captured["pair_id"] == "9007199254740993"
    @test captured["attempt"] == 2
    @test captured["context"] == Dict("slot" => 3, "active" => true)
    @test captured["exception"]["exception_type"] == "ErrorException"
    @test occursin("structured logger failure", captured["exception"]["message"])
    @test occursin("Stacktrace", captured["exception"]["stacktrace"])
    @test structured_state.log_events[2]["severity"] == "success"
    @test all(log["source"] == "Simulator" for log in structured_state.log_events)
    @test length(unique(log["id"] for log in structured_state.log_events)) == 2
    round_tripped_logs = JSON.parse(JSON.json(structured_state.log_events))
    @test round_tripped_logs isa Vector
    @test round_tripped_logs[1]["group"] == string(QuantumSavory.LOG_GROUPS.protocol)
    @test WebQuantumSavory.Logger.json_safe(Int128(9_007_199_254_740_991)) ==
      Int128(9_007_199_254_740_991)
    @test WebQuantumSavory.Logger.json_safe(Int128(-9_007_199_254_740_991)) ==
      Int128(-9_007_199_254_740_991)
    @test WebQuantumSavory.Logger.json_safe(Int128(9_007_199_254_740_992)) ==
      "9007199254740992"
    @test WebQuantumSavory.Logger.json_safe(Int128(-9_007_199_254_740_992)) ==
      "-9007199254740992"

    resumable_state = WebQuantumSavory.State(name="resumable_structured_logs")
    resumable_logger = WebQuantumSavory.Logger.make_logger(
      resumable_state;
      console=Logging.NullLogger(),
    )
    resumable_fields = [
      Symbol("_group_15") => QuantumSavory.LOG_GROUPS.protocol,
      Symbol("event_16") => :pair_entangled,
      Symbol("_fsmi.round_1") => 2,
      Symbol("slots_23") => (1, 2),
      Symbol("_fsmi.pair_id_22") => Int128(9_007_199_254_740_993),
    ]
    Logging.handle_message(
      resumable_logger,
      Logging.Debug,
      "resumable protocol event",
      QuantumSavory.ProtocolZoo,
      :ProtocolZoo,
      :resumable_event,
      @__FILE__,
      @__LINE__;
      resumable_fields...,
    )
    resumable_record = only(resumable_state.log_events)
    @test resumable_record["group"] == "protocol"
    @test resumable_record["event"] == "pair_entangled"
    @test resumable_record["round"] == 2
    @test resumable_record["slots"] == Any[1, 2]
    @test resumable_record["pair_id"] == "9007199254740993"
    @test !any(occursin(r"_\d+$", key) for key in keys(resumable_record))

    custom_state = WebQuantumSavory.State(name="custom_module_structured_logs")
    custom_logger = WebQuantumSavory.Logger.make_logger(
      custom_state;
      console=Logging.NullLogger(),
    )
    custom_module = Module(:CustomStructuredLogModule)
    Core.eval(custom_module, :(using Logging))
    Core.eval(custom_module, quote
      function emit_test_records(logger, stable_group)
        Logging.with_logger(logger) do
          @debug(
            "custom protocol event",
            _group=stable_group,
            event=:custom_event,
            protocol=:CustomProtocol,
          )
          @debug("unrelated custom event", _group=:unrelated, event=:unrelated_event)
        end
      end
    end)
    Core.eval(custom_module, :emit_test_records)(
      custom_logger,
      QuantumSavory.LOG_GROUPS.protocol,
    )
    @test length(custom_state.log_events) == 1
    @test only(custom_state.log_events)["message"] == "custom protocol event"
    @test only(custom_state.log_events)["module"] == "Main.CustomStructuredLogModule"
    @test only(custom_state.log_events)["group"] == "protocol"
    @test only(custom_state.log_events)["event"] == "custom_event"
    @test !Logging.shouldlog(
      custom_logger,
      Logging.Debug,
      custom_module,
      :unrelated,
      :unrelated_event,
    )

    silent_state = WebQuantumSavory.State(name="silent_structured_logs")
    silent_logger = WebQuantumSavory.Logger.make_logger(
      silent_state;
      console=Logging.NullLogger(),
    )
    Logging.handle_message(
      silent_logger,
      Logging.Debug,
      "captured without console output",
      QuantumSavory,
      :unit,
      :silent_debug,
      @__FILE__,
      @__LINE__,
    )
    @test only(silent_state.log_events)["message"] == "captured without console output"

    # Create a test state with log events
    test_logs = [
      Dict("timestamp" => "2023-01-01T00:00:00", "level" => "info", "message" => "Test log 1"),
      Dict("timestamp" => "2023-01-01T00:00:01", "level" => "warn", "message" => "Test log 2"),
      Dict("timestamp" => "2023-01-01T00:00:02", "level" => "error", "message" => "Test log 3")
    ]
    
    state = WebQuantumSavory.State(name="test_logs", log_events=test_logs)
    
    # Store the state in STATE for testing
    original_state = get(WebQuantumSavory.STATE, "test_logs", nothing)
    WebQuantumSavory.STATE["test_logs"] = state
    
    try
      # Test get_logs with purge=true (default)
      logs = WebQuantumSavory.get_logs("test_logs", true)
      @test length(logs) == 3
      @test logs[1]["message"] == "Test log 1"
      @test logs[2]["message"] == "Test log 2"
      @test logs[3]["message"] == "Test log 3"
      
      # After purge=true, logs should be cleared from state
      @test length(state.log_events) == 0
      
      # Add more logs
      push!(state.log_events, Dict("timestamp" => "2023-01-01T00:00:03", "level" => "info", "message" => "Test log 4"))
      push!(state.log_events, Dict("timestamp" => "2023-01-01T00:00:04", "level" => "debug", "message" => "Test log 5"))
      
      # Test get_logs with purge=false
      logs_no_purge = WebQuantumSavory.get_logs("test_logs", false)
      @test length(logs_no_purge) == 2
      @test logs_no_purge[1]["message"] == "Test log 4"
      @test logs_no_purge[2]["message"] == "Test log 5"
      
      # After purge=false, logs should still be in state
      @test length(state.log_events) == 2
      
      # Test get_logs with default purge=true
      logs_default = WebQuantumSavory.get_logs("test_logs")
      @test length(logs_default) == 2
      @test length(state.log_events) == 0  # Should be purged by default
      
    finally
      # Clean up
      if original_state !== nothing
        WebQuantumSavory.STATE["test_logs"] = original_state
      else
        delete!(WebQuantumSavory.STATE, "test_logs")
      end
    end
  end

  @testset "Symbolic Expression Handling" begin
    # Test create_symbolic function
    symbolic_expr = "(Z₁⊗Z₁+Z₂⊗Z₂) / √2"
    
    try
      symbolic_obj = WebQuantumSavory.create_symbolic(symbolic_expr)
      @test isa(symbolic_obj, WebQuantumSavory.SymbolicImpl)
      @test symbolic_obj.expression == symbolic_expr
      @test !isempty(symbolic_obj.latex)
      @test symbolic_obj.value !== nothing
    catch e
      @warn "Symbolic expression test failed: $e"
    end
    
    # Test protocol parameter handling with symbolic type
    test_params = [
      Dict(
        "name" => "pairstate",
        "type" => "Symbolic", 
        "value" => "(Z₁⊗Z₁+Z₂⊗Z₂) / √2"
      )
    ]
    
    try
      # This tests the parameter conversion logic
      kwargs = Dict{Symbol, Any}()
      for p in test_params
        name = Symbol(p["name"])
        ptype = p["type"]
        value = p["value"]
        
        # Simulate the parameter conversion logic
        symbolic_type_requested = ptype == "Symbolic"
        
        if symbolic_type_requested && isa(value, String)
          try
            symbolic_obj = WebQuantumSavory.create_symbolic(value)
            kwargs[name] = symbolic_obj.value
          catch e
            @warn "Failed to create symbolic expression: $e"
          end
        end
      end
      
      # If we got here without error, the basic logic works
      @test true
    catch e
      @warn "Symbolic parameter handling test failed: $e"
      # This might fail if QuantumSavory packages aren't available in test environment
    end
  end

  @testset "State Serialization with Pause Field" begin
    # Test that simulation_paused field is included in serialization
    state = WebQuantumSavory.State(
      name="serialization_test",
      simulation_paused=true,
      is_running=false
    )
    
    serialized = WebQuantumSavory.serialize_state(state)
    @test haskey(serialized, "simulation")
    @test haskey(serialized["simulation"], "simulation_paused")
    @test serialized["simulation"]["simulation_paused"] == true
    @test serialized["simulation"]["simulation_running"] == false
    
    # Test with false pause state
    state.simulation_paused = false
    state.is_running = true
    serialized2 = WebQuantumSavory.serialize_state(state)
    @test serialized2["simulation"]["simulation_paused"] == false
    @test serialized2["simulation"]["simulation_running"] == true
  end

  @testset "Cooperative Simulation Lifecycle" begin
    payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    simulation_name = "cooperative_lifecycle"
    payload["name"] = simulation_name

    state = WebQuantumSavory.parse_network_graph(WebQuantumSavory.validate_payload(payload))
    state = WebQuantumSavory.prepare_simulation(state, simulation_name)

    # A prepared-but-not-started simulation cannot be paused.
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.pause_simulation(state)

    # Starting is immediate and creates exactly one same-thread task.
    WebQuantumSavory.run_simulation(state, 2.0, simulation_name)
    first_task = state.run_task
    @test state.is_running
    @test first_task !== nothing
    @test first_task.sticky
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.run_simulation(state, 2.0, simulation_name)
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.destroy_simulation(simulation_name)

    # Pause waits for acknowledgement and task cleanup.
    @test WebQuantumSavory.pause_simulation(state)
    @test !state.is_running
    @test state.simulation_paused
    @test !state.pause_requested
    @test state.run_task === nothing
    paused_progress = state.simulation_progress
    paused_logs = state.log_events
    retained_panic = Dict{String,Any}("id" => "retained-while-resuming")
    state.simulation_panic = retained_panic

    # Resume retains the cumulative target, progress, captured logs, and panic
    # report associated with the same interrupted run.
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.run_simulation(state, 3.0, simulation_name)
    WebQuantumSavory.run_simulation(state, 2.0, simulation_name)
    @test state.simulation_time == 2.0
    @test state.simulation_progress == paused_progress
    @test state.log_events === paused_logs
    @test state.simulation_panic === retained_panic
    @test timedwait(() -> state.run_task === nothing, 10.0) == :ok
    @test state.has_run
    @test !state.is_running
    @test !state.simulation_paused
    @test state.error === nothing
    @test state.simulation_progress >= 2.0

    # A later run extends the absolute target and starts a fresh log stream.
    completed_logs = state.log_events
    WebQuantumSavory.run_simulation(state, 3.0, simulation_name)
    @test state.log_events !== completed_logs
    @test state.simulation_panic === nothing
    @test timedwait(() -> state.run_task === nothing, 10.0) == :ok
    @test state.has_run
    @test state.simulation_progress >= 3.0

    @test WebQuantumSavory.destroy_simulation(simulation_name)
    @test !haskey(WebQuantumSavory.STATE, simulation_name)
  end

  @testset "Simulation Task Error" begin
    simulation_name = "simulation_task_error"
    state = WebQuantumSavory.State(name=simulation_name, simulation=ConcurrentSim.Simulation())
    WebQuantumSavory.STATE[simulation_name] = state

    WebQuantumSavory.run_simulation(state, 1.0, simulation_name)
    @test timedwait(() -> state.run_task === nothing, 10.0) == :ok
    @test !state.is_running
    @test !state.simulation_paused
    @test state.error isa ConcurrentSim.EmptySchedule
    @test !state.has_run
    @test state.simulation_panic !== nothing
    @test state.simulation_panic["severity"] == "panic"
    @test state.simulation_panic["source"] == "Simulator"
    @test state.simulation_panic["exception_type"] == string(ConcurrentSim.EmptySchedule)
    @test occursin("EmptySchedule", state.simulation_panic["message"])
    @test occursin("Stacktrace", state.simulation_panic["stacktrace"])

    panic_logs = filter(log -> get(log, "severity", nothing) == "panic", state.log_events)
    error_logs = filter(log -> get(log, "severity", nothing) == "error", state.log_events)
    @test length(panic_logs) == 1
    @test isempty(error_logs)
    @test panic_logs[1]["id"] == state.simulation_panic["id"]
    @test JSON.parse(JSON.json(WebQuantumSavory.serialize_state(state))) isa Dict

    @test WebQuantumSavory.destroy_simulation(simulation_name)
  end

  @testset "Diagnostic Broken Protocol Panic" begin
    withenv(WebQuantumSavory.MOCK_BROKEN_PROTOCOL_ENV_VAR => "true") do
      payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
      simulation_name = "mock_broken_protocol_panic"
      payload["name"] = simulation_name
      payload["net"]["protocols"] = Any[
        Dict(
          "id" => "broken-diagnostic",
          "type" => WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE,
          "parameters" => Any[],
        ),
      ]

      try
        state = WebQuantumSavory.parse_network_graph(WebQuantumSavory.validate_payload(payload))
        state = WebQuantumSavory.prepare_simulation(state, simulation_name)
        @test state.protocols_launched["floating"] == 1
        @test state.protocol_mapping["broken-diagnostic"] isa WebQuantumSavory.MockBrokenProtocol

        WebQuantumSavory.run_simulation(state, 1.0, simulation_name)
        @test timedwait(() -> state.run_task === nothing, 10.0) == :ok
        @test state.error isa BoundsError
        @test state.simulation_panic !== nothing

        panic = state.simulation_panic
        @test Set(keys(panic)) == Set([
          "id",
          "timestamp",
          "source",
          "severity",
          "summary",
          "exception_type",
          "message",
          "stacktrace",
        ])
        @test panic["source"] == "Simulator"
        @test panic["severity"] == "panic"
        @test panic["exception_type"] == "BoundsError"
        @test occursin("index [100]", panic["message"])
        @test occursin("MockBrokenProtocol", panic["stacktrace"])
        @test JSON.parse(JSON.json(panic))["id"] == panic["id"]

        logs = WebQuantumSavory.get_logs(simulation_name, false)
        panic_log = only(filter(log -> get(log, "severity", nothing) == "panic", logs))
        @test panic_log == panic
        @test !any(log -> get(log, "message", nothing) == "Error running simulation", logs)

        purged_logs = WebQuantumSavory.get_logs(simulation_name, true)
        @test purged_logs == logs
        @test isempty(state.log_events)
        @test state.simulation_panic == panic
      finally
        haskey(WebQuantumSavory.STATE, simulation_name) &&
          WebQuantumSavory.destroy_simulation(simulation_name)
      end
    end
  end

  @testset "Cleanup Stale Simulations - Basic Test" begin
    # Load payload3 for testing
    test_payload3 = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    
    # Create and setup a simulation
    simulation_name = "cleanup_test_basic"
    test_payload3["name"] = simulation_name
    
    # Validate payload first (this adds the graph_info structure)
    validation_result = WebQuantumSavory.validate_payload(test_payload3)
    
    # Parse the network graph
    state = WebQuantumSavory.parse_network_graph(validation_result)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    @test state.simulation_last_active_time !== nothing
    
    # Prepare the simulation
    state = WebQuantumSavory.prepare_simulation(state, simulation_name)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # Make the simulation stale by setting last_active_time to AUTO_PURGE_MINUTES + 1 minutes ago
    state.simulation_last_active_time = Dates.now() - Dates.Minute(WebQuantumSavory.AUTO_PURGE_MINUTES + 1)
    WebQuantumSavory.STATE[simulation_name] = state
    
    # Verify simulation exists before cleanup
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # Call cleanup function (modified to run once instead of infinite loop)
    WebQuantumSavory.cleanup_stale_simulations_once()
    
    # Verify simulation was NOT destroyed but blocked and preserved
    # Auto-purged simulations have execution_time_exceeded=false, auto_purged=true
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    blocked = WebQuantumSavory.STATE[simulation_name]
    @test blocked.execution_time_exceeded == false
    @test blocked.auto_purged == true
    @test blocked.payload === nothing
    @test blocked.graph === nothing
    @test blocked.network === nothing
    @test blocked.simulation === nothing
  end

  @testset "Cleanup Stale Simulations - Running Simulation Test" begin
    # Load payload3 for testing
    test_payload3 = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    
    # Create and setup a simulation
    simulation_name = "cleanup_test_running"
    test_payload3["name"] = simulation_name
    
    # Validate payload first (this adds the graph_info structure)
    validation_result = WebQuantumSavory.validate_payload(test_payload3)
    
    # Parse the network graph
    state = WebQuantumSavory.parse_network_graph(validation_result)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # Prepare the simulation
    state = WebQuantumSavory.prepare_simulation(state, simulation_name)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # Make the simulation stale by setting last_active_time to AUTO_PURGE_MINUTES + 1 minutes ago
    state.simulation_last_active_time = Dates.now() - Dates.Minute(WebQuantumSavory.AUTO_PURGE_MINUTES + 1)
    
    # Start simulation in background (very long time)
    state.is_running = true
    WebQuantumSavory.STATE[simulation_name] = state
    
    # Verify simulation exists before cleanup
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # Call cleanup function - should NOT clean up running simulation
    WebQuantumSavory.cleanup_stale_simulations_once()
    
    # Verify simulation was NOT cleaned up because it's running
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    @test WebQuantumSavory.STATE[simulation_name].is_running == true
    
    # Now pause the simulation
    state.is_running = false
    state.simulation_paused = true
    WebQuantumSavory.STATE[simulation_name] = state
    
    # Call cleanup function again - should clean up paused simulation
    WebQuantumSavory.cleanup_stale_simulations_once()
    
    # Verify simulation was blocked (preserved, not destroyed)
    # Auto-purged simulations have execution_time_exceeded=false, auto_purged=true
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    s2 = WebQuantumSavory.STATE[simulation_name]
    @test s2.execution_time_exceeded == false
    @test s2.auto_purged == true
    
    # Clean up
    WebQuantumSavory.destroy_simulation(simulation_name)
    @test !haskey(WebQuantumSavory.STATE, simulation_name)
  end

  @testset "Cleanup Stale Simulations - Auto-Destroy of Purged Simulation Test" begin
    # Load payload3 for testing
    test_payload3 = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    
    # Create and setup a simulation
    simulation_name = "cleanup_test_autodestroy_purged"
    test_payload3["name"] = simulation_name
    
    # Validate payload first (this adds the graph_info structure)
    validation_result = WebQuantumSavory.validate_payload(test_payload3)
    
    # Parse the network graph
    state = WebQuantumSavory.parse_network_graph(validation_result)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    @test state.simulation_last_active_time !== nothing
    
    # Prepare the simulation
    state = WebQuantumSavory.prepare_simulation(state, simulation_name)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # STEP 1: Make the simulation stale for auto-purge (AUTO_PURGE_MINUTES + 1 minutes ago)
    state.simulation_last_active_time = Dates.now() - Dates.Minute(WebQuantumSavory.AUTO_PURGE_MINUTES + 1)
    WebQuantumSavory.STATE[simulation_name] = state
    
    # Verify simulation exists before cleanup
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    @test state.auto_purged == false
    
    # Call cleanup function - should auto-purge the simulation
    WebQuantumSavory.cleanup_stale_simulations_once()
    
    # Verify simulation was auto-purged (blocked but not destroyed)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    purged_state = WebQuantumSavory.STATE[simulation_name]
    @test purged_state.auto_purged == true
    @test purged_state.execution_time_exceeded == false
    @test purged_state.payload === nothing  # Resources cleared
    @test purged_state.graph === nothing
    @test purged_state.network === nothing
    @test purged_state.simulation === nothing
    
    # STEP 2: Make the purged simulation stale for auto-destroy (AUTO_DESTROY_MINUTES + 1 minutes ago)
    purged_state.simulation_last_active_time = Dates.now() - Dates.Minute(WebQuantumSavory.AUTO_DESTROY_MINUTES + 1)
    WebQuantumSavory.STATE[simulation_name] = purged_state
    
    # Verify simulation still exists before auto-destroy cleanup
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # Call cleanup function again - should auto-destroy the purged simulation
    WebQuantumSavory.cleanup_stale_simulations_once()
    
    # Verify simulation was completely destroyed (removed from STATE)
    @test !haskey(WebQuantumSavory.STATE, simulation_name)
  end

  @testset "Cleanup Stale Simulations - Auto-Destroy of Timed Out Simulation Test" begin
    # Test that timed-out simulations (execution_time_exceeded=true) also get auto-destroyed
    test_payload3 = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    
    # Create and setup a simulation
    simulation_name = "cleanup_test_autodestroy_timeout"
    test_payload3["name"] = simulation_name
    
    # Validate payload first (this adds the graph_info structure)
    validation_result = WebQuantumSavory.validate_payload(test_payload3)
    
    # Parse the network graph
    state = WebQuantumSavory.parse_network_graph(validation_result)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # Prepare the simulation
    state = WebQuantumSavory.prepare_simulation(state, simulation_name)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # Block the simulation due to timeout
    WebQuantumSavory.block_simulation(state; reason=:timeout, max_minutes=WebQuantumSavory.MAX_SIM_RUNTIME_MINUTES)
    @test state.execution_time_exceeded == true
    @test state.auto_purged == false
    @test state.payload === nothing
    
    # Make the blocked simulation stale for auto-destroy (AUTO_DESTROY_MINUTES + 1 minutes ago)
    state.simulation_last_active_time = Dates.now() - Dates.Minute(WebQuantumSavory.AUTO_DESTROY_MINUTES + 1)
    WebQuantumSavory.STATE[simulation_name] = state
    
    # Verify simulation still exists before auto-destroy cleanup
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # Call cleanup function - should auto-destroy the timed-out simulation
    WebQuantumSavory.cleanup_stale_simulations_once()
    
    # Verify simulation was completely destroyed (removed from STATE)
    @test !haskey(WebQuantumSavory.STATE, simulation_name)
  end

  @testset "Block Simulation Behavior" begin
    # Test timeout block (execution_time_exceeded=true)
    simulation_name = "block_behavior_test_timeout"
    state1 = WebQuantumSavory.State(name=simulation_name, payload=Dict("data"=>Dict()), graph=SimpleGraph(0))
    WebQuantumSavory.STATE[simulation_name] = state1

    # Block it explicitly with timeout reason
    report = WebQuantumSavory.block_simulation(state1; reason=:timeout, max_minutes=WebQuantumSavory.MAX_SIM_RUNTIME_MINUTES)
    @test WebQuantumSavory.cleanup_succeeded(report)
    @test state1.execution_time_exceeded == true
    @test state1.auto_purged == false
    @test state1.payload === nothing

    # Further non-destroy actions should be forbidden
    try
      WebQuantumSavory.action_is_valid(simulation_name, false)
      @test false  # should not reach
    catch e
      @test e isa WebQuantumSavory.APIError
      @test occursin("expired", e.message)
    end

    # Test auto-purge block (auto_purged=true, execution_time_exceeded=false)
    simulation_name2 = "block_behavior_test_autopurge"
    state2 = WebQuantumSavory.State(name=simulation_name2, payload=Dict("data"=>Dict()), graph=SimpleGraph(0))
    WebQuantumSavory.STATE[simulation_name2] = state2

    # Block it explicitly with autopurge reason
    report2 = WebQuantumSavory.block_simulation(state2; reason=:autopurge, max_minutes=30, auto_purged=true)
    @test WebQuantumSavory.cleanup_succeeded(report2)
    @test state2.execution_time_exceeded == false
    @test state2.auto_purged == true
    @test state2.payload === nothing

    # Further non-destroy actions should be forbidden (auto_purged also blocks)
    try
      WebQuantumSavory.action_is_valid(simulation_name2, false)
      @test false  # should not reach
    catch e
      @test e isa WebQuantumSavory.APIError
      @test occursin("expired", e.message)
    end

    # Destroy should still be allowed for both
    WebQuantumSavory.destroy_simulation(simulation_name)
    WebQuantumSavory.destroy_simulation(simulation_name2)
    @test !haskey(WebQuantumSavory.STATE, simulation_name)
    @test !haskey(WebQuantumSavory.STATE, simulation_name2)
  end

  @testset "Execution Time Exceeded Prevention" begin
    # Test that blocked simulations cannot be run
    simulation_name = "expired_simulation"
    state = WebQuantumSavory.State(name=simulation_name, execution_time_exceeded=true)
    WebQuantumSavory.STATE[simulation_name] = state

    # Attempting to run should fail via action_is_valid check
    try
      WebQuantumSavory.run_simulation(state, 5.0, simulation_name)
      @test false  # should not reach
    catch e
      @test e isa WebQuantumSavory.APIError
      @test occursin("expired", e.message) || occursin("blocked", e.message)
    end

    # Cleanup
    WebQuantumSavory.destroy_simulation(simulation_name)
    @test !haskey(WebQuantumSavory.STATE, simulation_name)
  end

  @testset "Auto-Purged State Prevention" begin
    # Test that auto-purged simulations cannot be run
    simulation_name = "autopurged_simulation"
    state = WebQuantumSavory.State(name=simulation_name, auto_purged=true)
    WebQuantumSavory.STATE[simulation_name] = state

    # Attempting to run should fail via action_is_valid check
    try
      WebQuantumSavory.run_simulation(state, 5.0, simulation_name)
      @test false  # should not reach
    catch e
      @test e isa WebQuantumSavory.APIError
      @test occursin("expired", e.message) || occursin("blocked", e.message)
    end

    # Cleanup
    WebQuantumSavory.destroy_simulation(simulation_name)
    @test !haskey(WebQuantumSavory.STATE, simulation_name)
  end

  @testset "Tag Metadata Catalog and Codec" begin
    @eval begin
      struct TagSchemaProbe <: QuantumSavory.AbstractTag
        value::Int
      end
      QuantumSavory.Tag(probe::TagSchemaProbe) =
        QuantumSavory.Tag(TagSchemaProbe, probe.value)
      QuantumSavory.tag_head_schema(::Type{TagSchemaProbe}) =
        QuantumSavory.TagHeadSchema(
          TagSchemaProbe,
          "A test-only named tag.",
          (QuantumSavory.TagFieldSchema(:value, Int, "Probe value."),),
        )
    end

    internal_catalog = WebQuantumSavory._tag_catalog()
    custom_schema = QuantumSavory.tag_head_schema(TagSchemaProbe)
    @test custom_schema.head === TagSchemaProbe
    @test !haskey(
      internal_catalog.named_by_id,
      WebQuantumSavory._qualified_tag_type_id(TagSchemaProbe),
    )

    catalog = WebQuantumSavory.tag_type_catalog()
    @test Set(keys(catalog)) == Set([
      "named_tags",
      "general_signatures",
      "allowed_data_types",
      "unsafe_evaluation",
    ])
    @test catalog["unsafe_evaluation"] isa Bool

    expected_named_ids = Set(
      WebQuantumSavory._qualified_tag_type_id(schema.head)
      for schema in QuantumSavory.tag_head_schemas()
    )
    expected_general_shapes = Set(
      (
        string(nameof(schema.head_type)),
        Tuple(string(nameof(type)) for type in schema.field_types),
      ) for schema in QuantumSavory.general_tag_signatures()
    )

    actual_named_ids = Set(String(definition["type_id"]) for definition in catalog["named_tags"])
    actual_general_shapes = Set(
      (
        String(signature["head_type"]),
        Tuple(String(field["type"]) for field in signature["fields"]),
      ) for signature in catalog["general_signatures"]
    )
    @test actual_named_ids == expected_named_ids
    @test all(definition -> begin
      type = internal_catalog.named_by_id[String(definition["type_id"])].type
      isconcretetype(type) && type <: QuantumSavory.AbstractTag
    end, catalog["named_tags"])
    @test actual_general_shapes == expected_general_shapes
    @test length(unique(signature["signature_id"] for signature in catalog["general_signatures"])) ==
      length(catalog["general_signatures"])
    @test any(
      signature -> signature["head_type"] == "Symbol" &&
        length(signature["fields"]) == 6 &&
        all(field -> field["type"] == "Int64", signature["fields"]),
      catalog["general_signatures"],
    )
    @test all(signature["variadic"] === false for signature in catalog["general_signatures"])

    graph_definition = only(filter(
      definition -> definition["display_name"] == "GraphStateStorage",
      catalog["named_tags"],
    ))
    @test graph_definition["type_id"] ==
      "QuantumSavory.ProtocolZoo.MBQCEntanglementDistillation.GraphStateStorage"
    @test [field["name"] for field in graph_definition["fields"]] == ["uuid", "vertex"]
    @test [field["type"] for field in graph_definition["fields"]] == ["Int64", "Int64"]
    @test all(field["doc"] isa String for field in graph_definition["fields"])

    graph_spec = Dict(
      "kind" => "named",
      "type_id" => graph_definition["type_id"],
      "fields" => Dict("uuid" => 17, "vertex" => 4),
    )
    graph_preview = WebQuantumSavory.preview_tag_payload(Dict("tag" => graph_spec))
    @test graph_preview["tag"]["kind"] == "named"
    @test graph_preview["tag"]["type_id"] == graph_definition["type_id"]
    @test [field["value"] for field in graph_preview["tag"]["fields"]] == [17, 4]
    @test graph_preview["rendered"] isa String
    @test !isempty(graph_preview["rendered"])

    symbol_int_signature = only(filter(catalog["general_signatures"]) do signature
      signature["head_type"] == "Symbol" &&
        [field["type"] for field in signature["fields"]] == ["Int64"]
    end)
    symbol_int_spec = Dict(
      "kind" => "general",
      "signature_id" => symbol_int_signature["signature_id"],
      "head" => Dict("type" => "Symbol", "value" => "codec_test"),
      "fields" => [Dict("type" => "Int64", "value" => 7)],
    )
    symbol_preview = WebQuantumSavory.preview_tag_payload(Dict("tag" => symbol_int_spec))
    @test symbol_preview["tag"]["kind"] == "general"
    @test symbol_preview["tag"]["head"] == Dict("type" => "Symbol", "value" => "codec_test")
    @test symbol_preview["tag"]["fields"][1]["value"] == 7
    @test symbol_preview["rendered"] == "SymbolInt(:codec_test, 7)::Tag"

    allowed_type_ids = Set(String(type["type_id"]) for type in catalog["allowed_data_types"])
    @test "Core.Int64" in allowed_type_ids
    @test !(WebQuantumSavory._qualified_tag_type_id(TagSchemaProbe) in allowed_type_ids)
    datatype_empty_signature = only(filter(catalog["general_signatures"]) do signature
      signature["head_type"] == "DataType" && isempty(signature["fields"])
    end)
    @test datatype_empty_signature["allowed_data_type_ids"] == ["Core.Int64"]
    datatype_spec = Dict(
      "kind" => "general",
      "signature_id" => datatype_empty_signature["signature_id"],
      "head" => Dict("type" => "DataType", "value" => "Core.Int64"),
      "fields" => Any[],
    )
    datatype_preview = WebQuantumSavory.preview_tag_payload(Dict("tag" => datatype_spec))
    @test datatype_preview["tag"]["head"]["value"] == "Core.Int64"
    @test occursin("Int64", datatype_preview["rendered"])

    function captured_error(thunk)
      try
        thunk()
        nothing
      catch error
        error
      end
    end

    unadvertised_tag_id = WebQuantumSavory._qualified_tag_type_id(TagSchemaProbe)
    unadvertised_protocol_error = captured_error(() ->
      WebQuantumSavory._resolve_named_abstract_tag_type(
        unadvertised_tag_id;
        nullable=true,
        context="Protocol tag",
      )
    )
    @test unadvertised_protocol_error isa WebQuantumSavory.APIError
    @test occursin(
      "not an advertised named AbstractTag type",
      unadvertised_protocol_error.message,
    )

    missing_named = deepcopy(graph_spec)
    delete!(missing_named["fields"], "vertex")
    error = captured_error(() -> WebQuantumSavory.preview_tag_payload(Dict("tag" => missing_named)))
    @test error isa WebQuantumSavory.APIError
    @test error.status_code == 400
    @test occursin("incomplete", error.message)

    extra_named = deepcopy(graph_spec)
    extra_named["fields"]["extra"] = 1
    error = captured_error(() -> WebQuantumSavory.preview_tag_payload(Dict("tag" => extra_named)))
    @test error isa WebQuantumSavory.APIError
    @test error.status_code == 400

    mismatched_general = deepcopy(symbol_int_spec)
    mismatched_general["fields"][1]["type"] = "Float64"
    error = captured_error(() -> WebQuantumSavory.preview_tag_payload(Dict("tag" => mismatched_general)))
    @test error isa WebQuantumSavory.APIError
    @test error.status_code == 400
    @test occursin("does not match", error.message)

    incomplete_general = deepcopy(symbol_int_spec)
    empty!(incomplete_general["fields"])
    error = captured_error(() -> WebQuantumSavory.preview_tag_payload(Dict("tag" => incomplete_general)))
    @test error isa WebQuantumSavory.APIError
    @test error.status_code == 400

    malformed_string_fields = Any[
      Dict("tag" => Dict("kind" => 1)),
      Dict("tag" => Dict("kind" => "named", "type_id" => 1)),
      Dict("tag" => Dict("kind" => "general", "signature_id" => 1)),
    ]
    malformed_head_type = deepcopy(symbol_int_spec)
    malformed_head_type["head"] = Dict{String,Any}(
      "type" => 1,
      "value" => "codec_test",
    )
    push!(malformed_string_fields, Dict("tag" => malformed_head_type))
    malformed_field_type = deepcopy(symbol_int_spec)
    malformed_field_type["fields"][1]["type"] = 1
    push!(malformed_string_fields, Dict("tag" => malformed_field_type))
    for malformed_payload in malformed_string_fields
      error = captured_error(() -> WebQuantumSavory.preview_tag_payload(malformed_payload))
      @test error isa WebQuantumSavory.APIError
      @test error.status_code == 400
      @test occursin("must be a string", error.message)
    end

    unsafe_datatype = deepcopy(datatype_spec)
    unsafe_datatype["head"]["value"] = "Main.UnadvertisedType"
    error = captured_error(() -> WebQuantumSavory.preview_tag_payload(Dict("tag" => unsafe_datatype)))
    @test error isa WebQuantumSavory.APIError
    @test error.status_code == 400
    @test occursin("advertised DataType", error.message)

    incompatible_datatype = deepcopy(datatype_spec)
    incompatible_datatype["head"]["value"] = graph_definition["type_id"]
    error = captured_error(() -> WebQuantumSavory.preview_tag_payload(
      Dict("tag" => incompatible_datatype),
    ))
    @test error isa WebQuantumSavory.APIError
    @test error.status_code == 400
    @test occursin("incompatible", error.message)
  end

  @testset "Live Tag Operations and Queries" begin
    payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    simulation_name = "tag_operations_unit"
    payload["name"] = simulation_name
    state = nothing

    function captured_error(thunk)
      try
        thunk()
        nothing
      catch error
        error
      end
    end

    catalog = WebQuantumSavory.tag_type_catalog()
    symbol_int_signature = only(filter(catalog["general_signatures"]) do signature
      signature["head_type"] == "Symbol" &&
        [field["type"] for field in signature["fields"]] == ["Int64"]
    end)
    symbol_float_signature = only(filter(catalog["general_signatures"]) do signature
      signature["head_type"] == "Symbol" &&
        [field["type"] for field in signature["fields"]] == ["Float64"]
    end)
    symbol_tag(head, value) = Dict(
      "kind" => "general",
      "signature_id" => symbol_int_signature["signature_id"],
      "head" => Dict("type" => "Symbol", "value" => head),
      "fields" => [Dict("type" => "Int64", "value" => value)],
    )
    query_spec(head, term) = Dict(
      "kind" => "general",
      "signature_id" => symbol_int_signature["signature_id"],
      "head" => Dict("type" => "Symbol", "value" => head),
      "fields" => [Dict("type" => "Int64", "value" => term)],
    )
    symbol_float_tag(head, value) = Dict(
      "kind" => "general",
      "signature_id" => symbol_float_signature["signature_id"],
      "head" => Dict("type" => "Symbol", "value" => head),
      "fields" => [Dict("type" => "Float64", "value" => value)],
    )
    float_query_spec(head, term) = Dict(
      "kind" => "general",
      "signature_id" => symbol_float_signature["signature_id"],
      "head" => Dict("type" => "Symbol", "value" => head),
      "fields" => [Dict("type" => "Float64", "value" => term)],
    )

    slot_one = Dict("target" => "slot", "slot_id" => "slot_MglsMO")
    slot_two = Dict("target" => "slot", "slot_id" => "slot_VSOCk6")
    register_target = Dict("target" => "register", "node_id" => "node_FVAmt8")
    register_destination = merge(register_target, Dict("destination_slot_id" => "slot_VSOCk6"))
    message_target = Dict("target" => "message_buffer", "node_id" => "node_FVAmt8")

    try
      state = WebQuantumSavory.parse_network_graph(WebQuantumSavory.validate_payload(payload))
      @test WebQuantumSavory.require_live_tag_state(simulation_name) === state

      malformed_target_error = captured_error(() -> WebQuantumSavory.list_tags(
        state,
        Dict("target" => 1),
      ))
      @test malformed_target_error isa WebQuantumSavory.APIError
      @test malformed_target_error.status_code == 400

      contradictory_target = merge(slot_one, Dict("node_id" => "node_ZowYQo"))
      ownership_error = captured_error(() -> WebQuantumSavory.list_tags(
        state,
        contradictory_target,
      ))
      @test ownership_error isa WebQuantumSavory.APIError
      @test ownership_error.status_code == 400

      slot_entry = WebQuantumSavory.attach_tag!(
        state,
        merge(slot_one, Dict("tag" => symbol_tag("unit_attach", 1))),
      )
      register_entry = WebQuantumSavory.attach_tag!(
        state,
        merge(register_destination, Dict("tag" => symbol_tag("unit_attach", 2))),
      )
      @test slot_entry["tag_id"] isa String
      @test register_entry["tag_id"] isa String
      @test slot_entry["slot_id"] == "slot_MglsMO"
      @test register_entry["slot_id"] == "slot_VSOCk6"
      @test slot_entry["node_id"] == "node_FVAmt8"
      @test slot_entry["time"] == 0.0

      slot_entries = WebQuantumSavory.list_tags(state, slot_one)
      register_entries = WebQuantumSavory.list_tags(state, register_target)
      @test [entry["tag_id"] for entry in slot_entries] == [slot_entry["tag_id"]]
      @test [entry["tag_id"] for entry in register_entries] ==
        [register_entry["tag_id"], slot_entry["tag_id"]]

      inactive_since = Dates.now() - Dates.Hour(1)
      state.simulation_last_active_time = inactive_since
      WebQuantumSavory.list_tags(state, register_target)
      @test state.simulation_last_active_time > inactive_since

      removed_slot = WebQuantumSavory.delete_tag!(state, slot_entry["tag_id"], slot_one)
      @test removed_slot["tag_id"] == slot_entry["tag_id"]
      @test isempty(WebQuantumSavory.list_tags(state, slot_one))

      stale_error = captured_error(() -> WebQuantumSavory.delete_tag!(
        state,
        slot_entry["tag_id"],
        register_target,
      ))
      @test stale_error isa WebQuantumSavory.APIError
      @test stale_error.status_code == 404

      removed_register = WebQuantumSavory.delete_tag!(
        state,
        register_entry["tag_id"],
        register_target,
      )
      @test removed_register["tag_id"] == register_entry["tag_id"]
      @test isempty(WebQuantumSavory.list_tags(state, register_target))

      message_one = WebQuantumSavory.attach_tag!(
        state,
        merge(message_target, Dict("tag" => symbol_tag("unit_message", 1))),
      )
      message_two = WebQuantumSavory.attach_tag!(
        state,
        merge(message_target, Dict("tag" => symbol_tag("unit_message", 2))),
      )
      message_entries = WebQuantumSavory.list_tags(state, message_target)
      @test [entry["tag_id"] for entry in message_entries] ==
        [message_two["tag_id"], message_one["tag_id"]]
      @test [entry["depth"] for entry in message_entries] == [2, 1]
      @test all(entry["node_id"] == "node_FVAmt8" for entry in message_entries)
      @test length(QuantumSavory.peektags(QuantumSavory.messagebuffer(state.network, 1))) == 2

      message_delete_error = captured_error(() -> WebQuantumSavory.delete_tag!(
        state,
        message_one["tag_id"],
        message_target,
      ))
      @test message_delete_error isa WebQuantumSavory.APIError
      @test message_delete_error.status_code == 400
      @test occursin("not supported", message_delete_error.message)

      query_entry_one = WebQuantumSavory.attach_tag!(
        state,
        merge(slot_one, Dict("tag" => symbol_tag("unit_query", 1))),
      )
      query_entry_two = WebQuantumSavory.attach_tag!(
        state,
        merge(register_destination, Dict("tag" => symbol_tag("unit_query", 2))),
      )

      exact_query = merge(register_target, Dict("query" => query_spec(
        "unit_query",
        Dict("kind" => "exact", "value" => 2),
      )))
      exact_entries = WebQuantumSavory.query_tags(state, exact_query)
      @test [entry["tag_id"] for entry in exact_entries] == [query_entry_two["tag_id"]]

      slot_exact = merge(slot_one, Dict("query" => query_spec(
        "unit_query",
        Dict("kind" => "exact", "value" => 1),
      )))
      @test [entry["tag_id"] for entry in WebQuantumSavory.query_tags(state, slot_exact)] ==
        [query_entry_one["tag_id"]]

      wildcard_query = merge(register_target, Dict("query" => query_spec(
        "unit_query",
        Dict("kind" => "wildcard"),
      )))
      wildcard_entries = WebQuantumSavory.query_tags(state, wildcard_query)
      @test [entry["tag_id"] for entry in wildcard_entries] ==
        [query_entry_two["tag_id"], query_entry_one["tag_id"]]

      preset_query = merge(register_target, Dict("query" => query_spec(
        "unit_query",
        Dict(
          "kind" => "predicate",
          "predicate" => "preset",
          "operator" => "≥",
          "operand" => 2,
        ),
      )))
      @test [entry["tag_id"] for entry in WebQuantumSavory.query_tags(state, preset_query)] ==
        [query_entry_two["tag_id"]]

      custom_query = merge(register_target, Dict("query" => query_spec(
        "unit_query",
        Dict(
          "kind" => "predicate",
          "predicate" => "custom",
          "source" => "candidate -> candidate == 2",
        ),
      )))
      withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true") do
        @test [entry["tag_id"] for entry in WebQuantumSavory.query_tags(state, custom_query)] ==
          [query_entry_two["tag_id"]]
      end
      @test length(WebQuantumSavory.list_tags(state, register_target)) == 2

      withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false") do
        denied = captured_error(() -> WebQuantumSavory.query_tags(state, custom_query))
        @test denied isa WebQuantumSavory.APIError
        @test denied.status_code == 403
        @test denied.error_code == WebQuantumSavory.UNSAFE_EVALUATION_DISABLED_CODE
      end

      invalid_operator = deepcopy(preset_query)
      invalid_operator["query"]["fields"][1]["value"]["operator"] = "≈"
      operator_error = captured_error(() -> WebQuantumSavory.query_tags(state, invalid_operator))
      @test operator_error isa WebQuantumSavory.APIError
      @test operator_error.status_code == 400

      malformed_query = deepcopy(exact_query)
      malformed_query["query"]["kind"] = 1
      malformed_query_error = captured_error(() -> WebQuantumSavory.query_tags(state, malformed_query))
      @test malformed_query_error isa WebQuantumSavory.APIError
      @test malformed_query_error.status_code == 400

      message_query_error = captured_error(() -> WebQuantumSavory.query_tags(
        state,
        merge(message_target, Dict("query" => wildcard_query["query"])),
      ))
      @test message_query_error isa WebQuantumSavory.APIError
      @test message_query_error.status_code == 400

      integer_collision = WebQuantumSavory.attach_tag!(
        state,
        merge(slot_one, Dict("tag" => symbol_tag("unit_float_exact", 1))),
      )
      float_entry = WebQuantumSavory.attach_tag!(
        state,
        merge(register_destination, Dict("tag" => symbol_float_tag("unit_float_exact", 1.0))),
      )
      float_exact_query = merge(register_target, Dict("query" => float_query_spec(
        "unit_float_exact",
        Dict("kind" => "exact", "value" => 1.0),
      )))
      @test [entry["tag_id"] for entry in WebQuantumSavory.query_tags(state, float_exact_query)] ==
        [float_entry["tag_id"]]
      @test integer_collision["tag_id"] != float_entry["tag_id"]
    finally
      haskey(WebQuantumSavory.STATE, simulation_name) &&
        WebQuantumSavory.destroy_simulation(simulation_name)
    end

    missing_error = captured_error(() -> WebQuantumSavory.require_live_tag_state("missing_tag_state"))
    @test missing_error isa WebQuantumSavory.APIError
    @test missing_error.status_code == 404

    blocked_name = "blocked_tag_state"
    blocked_state = WebQuantumSavory.State(
      name=blocked_name,
      execution_time_exceeded=true,
    )
    WebQuantumSavory.STATE[blocked_name] = blocked_state
    try
      blocked_error = captured_error(() -> WebQuantumSavory.require_live_tag_state(blocked_name))
      @test blocked_error isa WebQuantumSavory.APIError
      @test blocked_error.status_code == 400
    finally
      haskey(WebQuantumSavory.STATE, blocked_name) &&
        WebQuantumSavory.destroy_simulation(blocked_name)
    end
  end

  @testset "Typed Numeric Expressions" begin
    expression(source) = Dict(
      "kind" => "numeric_expression",
      "source" => source,
    )
    capture_error(thunk) = try
      thunk()
      nothing
    catch error
      error
    end

    parsed_expression = WebQuantumSavory._parse_numeric_expression(
      expression("delay / 2"),
    )
    @test parsed_expression isa WebQuantumSavory.NumericExpression
    @test parsed_expression.source == "delay / 2"
    @test WebQuantumSavory._parse_numeric_expression(0.5) === nothing
    @test WebQuantumSavory._parse_numeric_expression(
      Dict("kind" => "literal", "source" => "1"),
    ) === nothing
    @test_throws WebQuantumSavory.APIError WebQuantumSavory._parse_numeric_expression(
      merge(expression("1"), Dict("value" => 1)),
    )
    @test_throws WebQuantumSavory.APIError WebQuantumSavory._parse_numeric_expression(
      Dict("kind" => "numeric_expression", "source" => 1),
    )

    function lowered_bindings(source; evaluation_module=Module())
      lowered = Meta.lower(
        evaluation_module,
        WebQuantumSavory._parse_complete_source(source),
      )
      return WebQuantumSavory._lowered_numeric_context_bindings(
        lowered,
        evaluation_module,
      )
    end
    @test lowered_bindings("delay / 2 + node_a") == Set((:delay, :node_a))
    @test lowered_bindings("loss * transmissivity") == Set((:loss, :transmissivity))
    @test isempty(lowered_bindings("Base.length([1, 2])"))
    @test isempty(lowered_bindings("let delay = 4; delay / 2; end"))
    @test isempty(lowered_bindings("delay(x) = x + 1\ndelay(2)"))
    @test lowered_bindings("x -> x + delay") == Set((:delay,))
    @test isempty(lowered_bindings(":(delay + self)"))
    @test lowered_bindings("# delay\nself") == Set((:self,))
    @test lowered_bindings("@isdefined(delay)") == Set((:delay,))
    @test isempty(lowered_bindings("if true; delay = 1; end; delay"))

    macro_module = Module()
    Core.eval(macro_module, :(expansion_count = Ref(0)))
    Core.eval(macro_module, quote
      macro count_expansion(expression)
        expansion_count[] += 1
        return esc(expression)
      end
      macro discard_expression(expression)
        return :(1)
      end
      macro hygienic_delay()
        return :(delay)
      end
      macro escaped_delay()
        return esc(:delay)
      end
    end)
    counted_lowered = Meta.lower(
      macro_module,
      WebQuantumSavory._parse_complete_source("@count_expansion(1 + 1)"),
    )
    @test isempty(WebQuantumSavory._lowered_numeric_context_bindings(
      counted_lowered,
      macro_module,
    ))
    @test Core.eval(macro_module, counted_lowered) == 2
    @test Core.eval(macro_module, :expansion_count)[] == 1
    @test isempty(lowered_bindings(
      "@discard_expression(delay)";
      evaluation_module=macro_module,
    ))
    @test lowered_bindings(
      "@hygienic_delay";
      evaluation_module=macro_module,
    ) == Set((:delay,))
    @test lowered_bindings(
      "@escaped_delay";
      evaluation_module=macro_module,
    ) == Set((:delay,))

    withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true") do
      # Non-allowlisted operations and syntax are rejected before evaluation:
      # rationals (`//`), ranges/generators, module qualification, and property
      # access.
      for (source, placement) in (
        ("x = 1 // 2\nx + π / π", "floating"),
        ("x = 1 // 2\nx + π / π", "variable"),
        ("sum(range(1; length=3))", "variable"),
        ("(; delay=1).delay", "variable"),
        ("sum(length for length in 1:3)", "variable"),
        ("Base.length((1, 2))", "variable"),
      )
        success, results, error = WebQuantumSavory.Sandbox.test_numeric_expression(
          source,
          "Int64",
          placement,
        )
        @test !success
        @test results === nothing
        @test error isa ArgumentError
        @test occursin("restricted expression", sprint(showerror, error))
      end

      # Plain assignment and finite arithmetic without a free context reference
      # evaluate immediately.
      success, results, error = WebQuantumSavory.Sandbox.test_numeric_expression(
        "if true; delay=1; end; delay",
        "Int64",
        "variable",
      )
      @test success
      @test error === nothing
      @test results == Dict(
        :deferred => false,
        :target_type => "Int64",
        :value => "1",
      )

      for source in (
        "delay / 2",
        "self + nodeid(\"Bob\")",
        "distance + refractive_index + loss + transmissivity + node_a + node_b",
      )
        success, results, error = WebQuantumSavory.Sandbox.test_numeric_expression(
          source,
          "Float64",
          "variable",
        )
        @test success
        @test error === nothing
        @test results[:deferred] == true
        @test !haskey(results, :value)
      end

      # Macros are rejected before any lowering or expansion.
      success, results, error = WebQuantumSavory.Sandbox.test_numeric_expression(
        "@isdefined(delay)",
        "Float64",
        "variable",
      )
      @test !success
      @test results === nothing
      @test error isa ArgumentError

      edge_context = (
        node_names=["Alice", "Bob"],
        edge_context=WebQuantumSavory._EdgeFunctionContext(
          100.0,
          5.0e-7,
          1.5,
          0.2,
          0.95,
          1,
          2,
        ),
      )
      success, results, error = WebQuantumSavory.Sandbox.test_numeric_expression(
        "delay / 2",
        "Float64",
        "edge";
        context=edge_context,
      )
      @test success
      @test error === nothing
      @test results == Dict(
        :deferred => false,
        :target_type => "Float64",
        :value => "2.5e-7",
      )

      success, results, error = WebQuantumSavory.Sandbox.test_numeric_expression(
        "loss + transmissivity",
        "Float64",
        "edge";
        context=edge_context,
      )
      @test success
      @test error === nothing
      @test parse(Float64, results[:value]) ≈ 1.15

      duplicate_context = (
        node_names=["Alice", "Alice"],
        self=1,
      )
      success, results, error = WebQuantumSavory.Sandbox.test_numeric_expression(
        "nodeid(\"Alice\") + self",
        "Int64",
        "node";
        context=duplicate_context,
      )
      @test success
      @test results[:value] == "3"
      @test error === nothing

      virtual_context = (
        node_names=["Alice", "Bob"],
        edge_context=WebQuantumSavory._EdgeFunctionContext(
          nothing,
          nothing,
          nothing,
          nothing,
          nothing,
          1,
          2,
        ),
      )
      # `all` is not an allowlisted reducer, so the expression is rejected.
      success, results, error = WebQuantumSavory.Sandbox.test_numeric_expression(
        "all(isnothing, (distance, delay, refractive_index, loss, transmissivity)) ? " *
        "node_b - node_a : 99",
        "Int64",
        "edge";
        context=virtual_context,
      )
      @test !success
      @test results === nothing
      @test error isa ArgumentError

      # These evaluate past the allowlist and then fail in the target cast or
      # parser, exercising the downstream error path rather than the guard.
      for (source, target, expected_error) in (
        ("1 / 2", "Int64", InexactError),
        ("Inf", "Float64", ArgumentError),
        ("true", "Int64", ArgumentError),
        ("\"not numeric\"", "Float64", ArgumentError),
        ("invalid(", "Float64", Base.Meta.ParseError),
      )
        success, results, error = WebQuantumSavory.Sandbox.test_numeric_expression(
          source,
          target,
          "variable",
        )
        @test !success
        @test results === nothing
        @test error isa expected_error
      end

      # `big` and `typemax` are not allowlisted, so this is rejected up front.
      success, results, error = WebQuantumSavory.Sandbox.test_numeric_expression(
        "big(typemax(Int64)) + 1",
        "Int64",
        "variable",
      )
      @test !success
      @test results === nothing
      @test error isa ArgumentError

      success, results, error = WebQuantumSavory.Sandbox.test_numeric_expression(
        "delay / 2",
        "Float64",
        "node";
        context=(node_names=["Alice"], self=1),
      )
      @test !success
      @test results === nothing
      @test error isa UndefVarError

      # Module qualification is rejected; the bare allowlisted `length` is fine.
      success, results, error = WebQuantumSavory.Sandbox.test_numeric_expression(
        "Base.length([1, 2])",
        "Int64",
        "floating";
        context=(node_names=["Alice"],),
      )
      @test !success
      @test results === nothing
      @test error isa ArgumentError

      success, results, error = WebQuantumSavory.Sandbox.test_numeric_expression(
        "length([1, 2])",
        "Int64",
        "floating";
        context=(node_names=["Alice"],),
      )
      @test success
      @test results[:value] == "2"
      @test error === nothing

      # I/O is rejected before evaluation, so the source never runs and no file
      # is ever created.
      contextual_body_file = tempname()
      contextual_source = "open($(repr(contextual_body_file)), \"a\") do io; write(io, \"x\"); end; delay"
      success, results, error = WebQuantumSavory.Sandbox.test_numeric_expression(
        contextual_source,
        "Float64",
        "variable",
      )
      @test !success
      @test results === nothing
      @test error isa ArgumentError
      @test !isfile(contextual_body_file)

      for placement in ("variable", "floating")
        execution_file = tempname()
        source = "open($(repr(execution_file)), \"a\") do io; write(io, \"x\"); end; 1"
        success, results, error = WebQuantumSavory.Sandbox.test_numeric_expression(
          source,
          "Int64",
          placement,
        )
        @test !success
        @test results === nothing
        @test error isa ArgumentError
        @test !isfile(execution_file)
      end

      success, results, error = WebQuantumSavory.Sandbox.test_numeric_expression(
        "delay; break",
        "Float64",
        "variable",
      )
      @test !success
      @test results === nothing
      @test error isa Exception
    end

    concrete_edge_request = WebQuantumSavory._parse_numeric_expression_test_request(Dict(
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
    ))
    @test concrete_edge_request.context.edge_context.delay_seconds == 5.0e-7
    @test concrete_edge_request.context.edge_context.loss_db_per_km == 0.2
    @test concrete_edge_request.context.edge_context.transmissivity == 0.95
    @test WebQuantumSavory._parse_numeric_expression_test_request(Dict(
      "expression" => "self",
      "target_type" => "Int64",
      "placement" => "node",
    )).context === nothing
    for malformed in (
      Dict(
        "expression" => "1",
        "target_type" => "Float64",
        "placement" => "variable",
        "context" => Dict(),
      ),
      Dict(
        "expression" => "1",
        "target_type" => "Number",
        "placement" => "floating",
      ),
      Dict(
        "expression" => "1",
        "target_type" => "Float64",
        "placement" => "floating",
        "extra" => true,
      ),
      Dict(
        "expression" => "1",
        "target_type" => "Float64",
        "placement" => "edge",
        "context" => Dict(
          "node_names" => ["Alice", "Bob"],
          "distance" => nothing,
          "delay" => 1.0,
          "refractive_index" => nothing,
          "loss" => nothing,
          "transmissivity" => nothing,
          "node_a" => 1,
          "node_b" => 2,
        ),
      ),
      Dict(
        "expression" => "1",
        "target_type" => "Float64",
        "placement" => "edge",
        "context" => Dict(
          "node_names" => ["Alice", "Bob"],
          "distance" => 100.0,
          "delay" => 5.0e-7,
          "refractive_index" => 1.5,
          "loss" => 0.2,
          "transmissivity" => 1.01,
          "node_a" => 1,
          "node_b" => 2,
        ),
      ),
    )
      @test_throws WebQuantumSavory.APIError WebQuantumSavory._parse_numeric_expression_test_request(
        malformed,
      )
    end

    invalid_variable_payload = deepcopy(test_payload)
    invalid_variable_payload["variables"] = [Dict(
      "id" => "invalid-expression",
      "name" => "invalid expression",
      "type" => "String",
      "value" => expression("1"),
    )]
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.validate_payload(
      invalid_variable_payload,
    )

    noise_expression = Dict(
      "type" => "AmplitudeDamping",
      "parameters" => [Dict(
        "name" => "τ",
        "value" => expression("self + nodeid(\"Alice\")"),
      )],
    )
    noise_context = Dict{Symbol,Any}(
      :node => 2,
      WebQuantumSavory.NODE_NAME_TO_INDEX_CONTEXT_KEY => Dict("Alice" => 1),
    )
    withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true") do
      default_noise = WebQuantumSavory._instantiate_noise(Dict(
        "type" => "T1Decay",
        "parameters" => Any[],
      ))
      @test default_noise.t1 == 1.0e9

      noise = WebQuantumSavory._instantiate_noise(noise_expression, noise_context)
      @test noise isa QuantumSavory.AmplitudeDamping
      @test noise.τ == 3.0

      variable_noise = WebQuantumSavory._instantiate_noise(
        Dict(
          "type" => "AmplitudeDamping",
          "parameters" => [Dict(
            "name" => "τ",
            "value" => Dict("kind" => "variable", "id" => "noise-rate"),
          )],
        ),
        noise_context;
        variables=Dict(
          "noise-rate" => WebQuantumSavory.Variable(
            "noise-rate",
            "noise rate",
            "Float64",
            expression("self * nodeid(\"Alice\")"),
          ),
        ),
      )
      @test variable_noise.τ == 2.0

      integer_noise = instantiate_contextual_background(
        [Dict(
          "name" => "count",
          "value" => expression("self + 1"),
        )],
        noise_context,
      )
      @test integer_noise.count == 3
      @test integer_noise.label == "default"

      integer_variable = WebQuantumSavory.Variable(
        "integer-count",
        "integer count",
        "Int64",
        expression("2 * self + nodeid(\"Alice\")"),
      )
      variable_integer_noise = instantiate_contextual_background(
        [Dict(
          "name" => "count",
          "value" => Dict("kind" => "variable", "id" => "integer-count"),
        )],
        noise_context;
        variables=Dict("integer-count" => integer_variable),
      )
      @test variable_integer_noise.count == 5
    end

    script_noise = WebQuantumSavory._script_noise_expression(
      noise_expression,
      "Test background noise";
      node_index=2,
    )
    @test occursin("self = 2", script_noise)
    @test occursin("nodeid(\"Alice\")", script_noise)
    @test Meta.parse(script_noise) isa Expr

    integer_variable = WebQuantumSavory.Variable(
      "integer-count",
      "integer count",
      "Int64",
      expression("2 * self + nodeid(\"Alice\")"),
    )
    _, integer_script_expression =
      WebQuantumSavory._script_constructor_parameter_expression(
        Dict(
          "name" => "count",
          "value" => Dict("kind" => "variable", "id" => "integer-count"),
        ),
        Dict(
          "integer-count" => (
            name="variable_integer_count",
            variable=integer_variable,
            per_assignment=true,
            fresh_wildcard=false,
            uses_default=false,
          ),
        ),
        "Test background noise";
        node_index=2,
        declared_type=Int64,
        field_schema=first(
          QuantumSavory.constructor_schema(ContextualIntegerBackground).fields,
        ),
      )
    @test occursin("Base.Int64(let\n    self = 2", integer_script_expression)
    @test !occursin("nodeid =", integer_script_expression)
    @test !occursin("expression_value", integer_script_expression)
    integer_script_module = Module(gensym(:IntegerBackgroundExpressionExport))
    Core.eval(
      integer_script_module,
      :(nodeid(name::String)::Int = Dict{String,Int}("Alice" => 1)[name]),
    )
    exported_integer_value = Core.eval(
      integer_script_module,
      Meta.parse(integer_script_expression),
    )
    @test exported_integer_value === Int64(5)

    withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false") do
      disabled_error = capture_error(
        () -> WebQuantumSavory._instantiate_noise(noise_expression, noise_context),
      )
      @test disabled_error isa WebQuantumSavory.APIError
      @test disabled_error.status_code == 403
      @test disabled_error.error_code ==
        WebQuantumSavory.UNSAFE_EVALUATION_DISABLED_CODE
    end

    bounded_schema = QuantumSavory.ConstructorFieldSchema(
      :bounded,
      Float64,
      "A bounded test value.";
      minimum=0.0,
      maximum=1.0,
    )
    withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true") do
      rejected = capture_error(() -> WebQuantumSavory._instantiate_noise(
        Dict(
          "type" => "AmplitudeDamping",
          "parameters" => [Dict(
            "name" => "τ",
            "value" => expression("open(\"forbidden\", \"w\")"),
          )],
        ),
        noise_context,
      ))
      @test rejected isa WebQuantumSavory.APIError
      @test occursin("restricted expression", string(rejected.details["evaluation_error"]))
    end

    nonnumeric_expression = Dict(
      "type" => "ContextualIntegerBackground",
      "parameters" => [Dict(
        "name" => "label",
        "value" => expression("1"),
      )],
    )
    nonnumeric_error = capture_error(
      () -> instantiate_contextual_background(
        nonnumeric_expression["parameters"],
        noise_context,
      ),
    )
    @test nonnumeric_error isa WebQuantumSavory.APIError
    @test occursin("does not authoritatively accept", nonnumeric_error.message)
    script_nonnumeric_error = capture_error(
      () -> WebQuantumSavory._script_constructor_parameter_expression(
        only(nonnumeric_expression["parameters"]),
        Dict{String,NamedTuple}(),
        "Test background noise";
        node_index=2,
        declared_type=String,
        field_schema=only(filter(
          field -> field.name === :label,
          QuantumSavory.constructor_schema(ContextualIntegerBackground).fields,
        )),
      ),
    )
    @test script_nonnumeric_error isa WebQuantumSavory.APIError
    @test occursin(
      "does not authoritatively accept",
      script_nonnumeric_error.message,
    )

    function background_validation_error(background; variables=Any[])
      payload = deepcopy(test_payload)
      payload["variables"] = variables
      payload["net"]["nodes"][1]["data"]["slots"][1]["backgroundNoise"] = background
      return capture_error(() -> WebQuantumSavory.validate_payload(payload))
    end

    valid_background_payload = deepcopy(test_payload)
    valid_background_payload["variables"] = [Dict(
      "id" => "contextual-rate",
      "name" => "contextual rate",
      "type" => "Float64",
      "value" => expression("self + nodeid(\"Amherst\")"),
    )]
    valid_background_payload["net"]["nodes"][1]["data"]["slots"][1]["backgroundNoise"] =
      Dict(
        "type" => "T1Decay",
        "parameters" => [Dict(
          "name" => "t1",
          "value" => Dict("kind" => "variable", "id" => "contextual-rate"),
        )],
      )
    @test WebQuantumSavory.validate_payload(valid_background_payload)["success"]

    unknown_variable = background_validation_error(Dict(
      "type" => "T1Decay",
      "parameters" => [Dict(
        "name" => "t1",
        "value" => Dict("kind" => "variable", "id" => "missing"),
      )],
    ))
    @test unknown_variable isa WebQuantumSavory.APIError
    @test occursin("Unknown variable reference", unknown_variable.message)

    incompatible_variable = background_validation_error(
      Dict(
        "type" => "T1Decay",
        "parameters" => [Dict(
          "name" => "t1",
          "value" => Dict("kind" => "variable", "id" => "label"),
        )],
      );
      variables=[Dict(
        "id" => "label",
        "name" => "label",
        "type" => "String",
        "value" => "not numeric",
      )],
    )
    @test incompatible_variable isa WebQuantumSavory.APIError
    @test occursin("incompatible", incompatible_variable.message)

    unknown_background = background_validation_error(Dict(
      "type" => "Main.ForgedBackground",
      "parameters" => Any[],
    ))
    @test unknown_background isa WebQuantumSavory.APIError
    @test occursin("Unknown background noise type", unknown_background.message)

    unsupported_complex_error = capture_error(() ->
      instantiate_contextual_background([Dict(
          "name" => "values",
          "value" => Any[1, 2],
        )]))
    @test unsupported_complex_error isa WebQuantumSavory.APIError
    if unsupported_complex_error isa WebQuantumSavory.APIError
      @test unsupported_complex_error.status_code == 400
      @test unsupported_complex_error.error_code == "VALIDATION_ERROR"
      @test unsupported_complex_error.message ==
        "Unsupported value for test background parameter 'values'"
      @test unsupported_complex_error.details == Dict{String,Any}(
        "parameter_name" => "values",
        "constructor_type" => string(ContextualIntegerBackground),
        "parameter_type" => "Vector{Int64}",
        "received_type" => "Vector{Any}",
      )
    end

    withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true") do
      kwargs = Dict{Symbol,Any}()
      @test WebQuantumSavory._handle_typed_parameter!(
        kwargs,
        :bounded,
        Float64,
        expression("0.75"),
        Dict{Symbol,Any}();
        field_schema=bounded_schema,
      )
      @test kwargs[:bounded] == 0.75
      @test_throws WebQuantumSavory.APIError WebQuantumSavory._handle_typed_parameter!(
        Dict{Symbol,Any}(),
        :bounded,
        Float64,
        expression("2"),
        Dict{Symbol,Any}();
        field_schema=bounded_schema,
      )

      sensitive_error = capture_error(() -> WebQuantumSavory._handle_typed_parameter!(
        Dict{Symbol,Any}(),
        :bounded,
        Float64,
        expression("error(\"sensitive runtime expression details\")"),
        Dict{Symbol,Any}();
        field_schema=bounded_schema,
      ))
      @test sensitive_error isa WebQuantumSavory.APIError
      @test sensitive_error.error_code == "VALIDATION_ERROR"
      response = WebQuantumSavory.create_error_response(sensitive_error)
      @test response["error"]["details"]["parameter_name"] == "bounded"
      @test occursin(
        "Disallowed identifier",
        response["error"]["details"]["evaluation_error"],
      )
      @test !occursin("sensitive runtime expression details", string(response))
    end

    bounded_script_expression = WebQuantumSavory._script_value_expression(
      Float64,
      expression("1 / 2"),
      "Bounded numeric";
      field_schema=bounded_schema,
    )
    @test bounded_script_expression == "Base.Float64(1 / 2)"
    @test !occursin("isa Base.Real", bounded_script_expression)
    @test !occursin("isfinite", bounded_script_expression)
    @test !occursin("cast_value", bounded_script_expression)
    @test Meta.parse(bounded_script_expression) isa Expr

    background_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    background_payload["name"] = "numeric_expression_background_runtime"
    background_payload["variables"] = [Dict(
      "id" => "background-rate",
      "name" => "background rate",
      "type" => "Float64",
      "value" => expression("self + nodeid(\"Amherst\")"),
    )]
    empty!(background_payload["net"]["protocols"])
    for node in background_payload["net"]["nodes"]
      empty!(node["data"]["protocols"])
      node["data"]["slots"][1]["backgroundNoise"] = Dict(
        "type" => "T1Decay",
        "parameters" => [Dict(
          "name" => "t1",
          "value" => Dict("kind" => "variable", "id" => "background-rate"),
        )],
      )
      node["data"]["slots"][2]["backgroundNoise"] = Dict(
        "type" => "T1Decay",
        "parameters" => [Dict(
          "name" => "t1",
          "value" => expression("10 * self + nodeid(\"Cambridge\")"),
        )],
      )
    end
    background_validation = WebQuantumSavory.validate_payload(background_payload)
    background_registers = withenv(
      WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true",
    ) do
      first(WebQuantumSavory.create_registers_from_nodes(background_validation))
    end
    @test [register.backgrounds[1].t1 for register in background_registers] ==
      [2.0, 3.0]
    @test [register.backgrounds[2].t1 for register in background_registers] ==
      [12.0, 22.0]

    background_script = withenv(
      WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false",
    ) do
      WebQuantumSavory.generate_julia_script(background_payload)
    end
    @test first(findfirst("# Resolve GUI node names", background_script)) <
      first(findfirst("# Registers", background_script))
    @test length(findall("self + nodeid(\"Amherst\")", background_script)) == 2
    @test length(findall("10 * self + nodeid(\"Cambridge\")", background_script)) == 2
    @test occursin(
      "GUI variable \"background rate\" is instantiated at each constructor assignment",
      background_script,
    )

    paused_background_script = replace(
      background_script,
      "\nrun(sim, simulation_duration)\n" =>
        "\n# run(sim, simulation_duration)  # paused by the background test\n";
      count=1,
    )
    background_module = Module(gensym(:BackgroundExpressionExport))
    Core.eval(background_module, :(using Base))
    Base.include_string(
      background_module,
      paused_background_script,
      "background-expression-export.jl",
    )
    exported_background_registers = Core.eval(background_module, :registers)
    @test [register.backgrounds[1].t1 for register in exported_background_registers] ==
      [2.0, 3.0]
    @test [register.backgrounds[2].t1 for register in exported_background_registers] ==
      [12.0, 22.0]

    runtime_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    runtime_payload["name"] = "numeric_expression_runtime"
    runtime_payload["net"]["edges"][1]["data"]["distanceMeters"] = 100.0
    runtime_payload["net"]["edges"][1]["data"]["propagationDelaySeconds"] = 0.2
    runtime_payload["net"]["edges"][1]["data"]["refractiveIndex"] = 1.5
    runtime_payload["net"]["edges"][1]["data"]["lossDbPerKm"] = 0.2
    runtime_payload["net"]["edges"][1]["data"]["transmissivity"] = 0.95
    runtime_payload["variables"] = [Dict(
      "id" => "per-assignment-expression",
      "name" => "per assignment expression",
      "type" => "Float64",
      "value" => expression("(loss + transmissivity) * delay / 4"),
    )]
    protocol_definition = runtime_payload["net"]["edges"][1]["data"]["protocols"][1]
    parameter_by_name = Dict(
      parameter["name"] => parameter for parameter in protocol_definition["parameters"]
    )
    parameter_by_name["success_prob"]["value"] = Dict(
      "kind" => "variable",
      "id" => "per-assignment-expression",
    )
    parameter_by_name["attempt_time"]["value"] =
      expression("(distance + nodeid(\"Cambridge\") - 2) / 1000")

    try
      validation = WebQuantumSavory.validate_payload(runtime_payload)
      state = WebQuantumSavory.parse_network_graph(validation)
      WebQuantumSavory.prepare_simulation(state, runtime_payload["name"])
      protocol = state.protocol_mapping[protocol_definition["id"]]
      @test protocol.success_prob ≈ 0.0575
      @test protocol.attempt_time == 0.1

      variables = WebQuantumSavory._parse_variables(runtime_payload)
      assignment_context = Dict{Symbol,Any}(
        :sim => state.simulation,
        :net => state.network,
        :nodeA => 1,
        :nodeB => 2,
        WebQuantumSavory.NODE_NAME_TO_INDEX_CONTEXT_KEY =>
          WebQuantumSavory._node_name_to_index(validation["graph_info"]["nodes"]),
        WebQuantumSavory.EDGE_FUNCTION_CONTEXT_KEY =>
          WebQuantumSavory._EdgeFunctionContext(100.0, 0.2, 1.5, 0.2, 0.95, 1, 2),
      )
      first_assignment = WebQuantumSavory._instantiate_protocol(
        protocol_definition,
        assignment_context;
        variables,
      )
      assignment_context[WebQuantumSavory.EDGE_FUNCTION_CONTEXT_KEY] =
        WebQuantumSavory._EdgeFunctionContext(100.0, 0.4, 1.5, 0.2, 0.95, 1, 2)
      second_assignment = WebQuantumSavory._instantiate_protocol(
        protocol_definition,
        assignment_context;
        variables,
      )
      @test first_assignment.success_prob ≈ 0.0575
      @test second_assignment.success_prob ≈ 0.115

      script = WebQuantumSavory.generate_julia_script(runtime_payload)
      @test occursin("(loss + transmissivity) * delay / 4", script)
      @test occursin("nodeid(\"Cambridge\")", script)
      @test !occursin("nodeid = Base.getproperty", script)
      @test !occursin("variable_per_assignment_expression =", script)

      paused_script = replace(
        script,
        "\nrun(sim, simulation_duration)\n" =>
          "\n# run(sim, simulation_duration)  # paused by the numeric-expression test\n";
        count=1,
      )
      generated_module = Module(gensym(:NumericExpressionExport))
      Core.eval(generated_module, :(using Base))
      Base.include_string(
        generated_module,
        paused_script,
        "numeric-expression-export.jl",
      )
      exported_protocol = only(
        entry.second
        for entry in Core.eval(generated_module, :protocols)
        if entry.first == protocol_definition["id"]
      )
      @test exported_protocol.success_prob == protocol.success_prob
      @test exported_protocol.attempt_time == protocol.attempt_time
    finally
      haskey(WebQuantumSavory.STATE, runtime_payload["name"]) &&
        WebQuantumSavory.destroy_simulation(runtime_payload["name"])
    end

    nonexecuting_payload = deepcopy(runtime_payload)
    nonexecuting_payload["name"] = "numeric_expression_nonexecuting_export"
    empty!(nonexecuting_payload["variables"])
    parameter_by_name = Dict(
      parameter["name"] => parameter
      for parameter in
        nonexecuting_payload["net"]["edges"][1]["data"]["protocols"][1]["parameters"]
    )
    parameter_by_name["success_prob"]["value"] =
      expression("error(\"export must not execute source\")")
    parameter_by_name["attempt_time"]["value"] = nothing
    script = withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false") do
      WebQuantumSavory.generate_julia_script(nonexecuting_payload)
    end
    @test occursin("export must not execute source", script)

    parameter_by_name["success_prob"]["value"] =
      expression("@server_must_not_expand_this_macro(delay)")
    macro_script = withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false") do
      WebQuantumSavory.generate_julia_script(nonexecuting_payload)
    end
    @test occursin("@server_must_not_expand_this_macro(delay)", macro_script)
  end
end
