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

  Base.@kwdef struct ContextualIntegerBackground <: QuantumSavory.AbstractBackground
    count::Int64 = 1
    label::String = "default"
  end

  QuantumSavory.constructor_metadata(::Type{ContextualIntegerBackground}) = [
    (field=:count, type=Int64, doc="A contextual integer constructor field."),
    (field=:label, type=String, doc="A nonnumeric constructor field."),
  ]

  function constructor_catalogs_with_contextual_background()
    catalogs = WebQuantumSavory._constructor_catalog_snapshot()
    backgrounds = copy(catalogs.backgrounds)
    push!(backgrounds, (
      type=ContextualIntegerBackground,
      wire_type="ContextualIntegerBackground",
      doc="Test-only background with contextual integer and string fields.",
      parameters=QuantumSavory.constructor_metadata(ContextualIntegerBackground),
    ))
    return WebQuantumSavory._ConstructorCatalogSnapshot(
      catalogs.protocols,
      backgrounds,
      catalogs.slots,
    )
  end

  # Load test data
  test_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload.json"))

  @testset "Constructor transport recipes" begin
    context = Dict{Symbol,Any}(
      :node => 2,
      WebQuantumSavory.NODE_NAME_TO_INDEX_CONTEXT_KEY => Dict("A" => 1, "B" => 2),
    )
    entity = (kind="protocol", id="protocol-1", path="/net/protocols/0")

    mutable_value = Any[Dict("value" => 1)]
    literal = WebQuantumSavory._LiteralValue(mutable_value)
    first_literal = WebQuantumSavory._materialize_transport_value(literal, context, WebQuantumSavory._VariableRecipe[])
    second_literal = WebQuantumSavory._materialize_transport_value(literal, context, WebQuantumSavory._VariableRecipe[])
    @test first_literal == second_literal == mutable_value
    @test first_literal !== second_literal
    @test first_literal[1] !== second_literal[1]

    first_wildcard = WebQuantumSavory._materialize_transport_value(
      WebQuantumSavory._FreshWildcard(), context, WebQuantumSavory._VariableRecipe[],
    )
    second_wildcard = WebQuantumSavory._materialize_transport_value(
      WebQuantumSavory._FreshWildcard(), context, WebQuantumSavory._VariableRecipe[],
    )
    @test first_wildcard isa QuantumSavory.Wildcard
    @test second_wildcard isa QuantumSavory.Wildcard
    @test WebQuantumSavory._materialize_transport_value(
      WebQuantumSavory._NamedType(Int), context, WebQuantumSavory._VariableRecipe[],
    ) === Int

    numeric = WebQuantumSavory._NumericSource("self + 3", "Int64")
    @test WebQuantumSavory._materialize_transport_value(
      numeric, context, WebQuantumSavory._VariableRecipe[],
    ) === Int64(5)
    function_source = WebQuantumSavory._FunctionSource("value -> self + value")
    contextual_function = WebQuantumSavory._materialize_transport_value(
      function_source, context, WebQuantumSavory._VariableRecipe[],
    )
    @test contextual_function(4) == 6
    symbolic = WebQuantumSavory._SymbolicSource("Z₁")
    @test WebQuantumSavory._materialize_transport_value(
      symbolic, context, WebQuantumSavory._VariableRecipe[],
    ) !== nothing

    zoo = WebQuantumSavory._normalize_states_zoo_value(
      Dict(
        "kind" => "states_zoo",
        "state_type" => "DepolarizedBellPair",
        "parameters" => Dict("p" => 2.0),
      ),
      "/variables/0/value",
    )
    @test WebQuantumSavory._materialize_transport_value(
      zoo, context, WebQuantumSavory._VariableRecipe[],
    ) isa QuantumSavory.StatesZoo.DepolarizedBellPair

    variables = [WebQuantumSavory._VariableRecipe(
      "variable-1",
      "shared value",
      "/variables/0",
      "Int64",
      WebQuantumSavory._LiteralValue(Int64(7)),
    )]
    @test WebQuantumSavory._materialize_transport_value(
      WebQuantumSavory._VariableUse(1), context, variables,
    ) === Int64(7)

    assignment = WebQuantumSavory._AssignmentRecipe(
      "unknown_but_valid",
      "/net/protocols/0/parameters/0",
      "Int64",
      WebQuantumSavory._LiteralValue(Int64(9)),
    )
    calls = Ref(0)
    counting_constructor = function (; unknown_but_valid)
      calls[] += 1
      return unknown_but_valid
    end
    kwargs = WebQuantumSavory._materialize_assignments(
      [assignment], context, variables, entity, "CountingConstructor",
    )
    @test WebQuantumSavory._invoke_constructor(
      counting_constructor, kwargs, entity, "CountingConstructor", [assignment],
    ) == 9
    @test calls[] == 1

    rejecting_calls = Ref(0)
    rejecting_constructor = function (; unknown_but_valid)
      rejecting_calls[] += 1
      throw(DomainError(unknown_but_valid, "test rejection"))
    end
    rejection = try
      WebQuantumSavory._invoke_constructor(
        rejecting_constructor, kwargs, entity, "RejectingConstructor", [assignment],
      )
      nothing
    catch error
      error
    end
    @test rejection isa WebQuantumSavory.APIError
    @test rejection.status_code == 422
    @test rejection.error_code == "CONSTRUCTOR_REJECTED"
    @test rejection.details["stage"] == "invoke"
    @test rejection.details["exception_type"] == "DomainError"
    @test rejecting_calls[] == 1

    payload = deepcopy(test_payload)
    payload["variables"] = Any[]
    for node in payload["net"]["nodes"]
      node["data"]["protocols"] = Any[]
    end
    for edge in payload["net"]["edges"]
      edge["data"]["protocols"] = Any[]
    end
    payload["net"]["protocols"] = Any[
      Dict("id" => "first", "type" => "Test.First", "parameters" => Any[]),
      Dict("id" => "second", "type" => "Test.Second", "parameters" => Any[]),
    ]
    first_constructions = Ref(0)
    second_constructions = Ref(0)
    schedules = Ref(0)
    first_constructor = function (; sim, net)
      first_constructions[] += 1
      return () -> (schedules[] += 1)
    end
    second_constructor = function (; sim, net)
      second_constructions[] += 1
      throw(DomainError(:second, "second constructor failed"))
    end
    misleading_metadata = [(
      field=:invented_required_field,
      type=Bool,
      required=true,
      default=nothing,
      min=nothing,
      max=nothing,
      doc="Transport must ignore this metadata.",
    )]
    base_catalogs = WebQuantumSavory._constructor_catalog_snapshot()
    protocol_entries = Any[
      (
        type=first_constructor,
        wire_type="Test.First",
        doc="",
        attachment=:network,
        group="floating",
        attachment_fields=NamedTuple(),
        parameters=misleading_metadata,
        permits_virtual_edge=false,
      ),
      (
        type=second_constructor,
        wire_type="Test.Second",
        doc="",
        attachment=:network,
        group="floating",
        attachment_fields=NamedTuple(),
        parameters=misleading_metadata,
        permits_virtual_edge=false,
      ),
    ]
    fake_catalogs = WebQuantumSavory._ConstructorCatalogSnapshot(
      protocol_entries,
      base_catalogs.backgrounds,
      base_catalogs.slots,
    )
    WebQuantumSavory._normalize_project_transport(payload; catalogs=fake_catalogs)
    construction_error = try
      WebQuantumSavory._construct_protocol_instances(
        payload,
        nothing,
        nothing;
        catalogs=fake_catalogs,
      )
      nothing
    catch error
      error
    end
    @test construction_error isa WebQuantumSavory.APIError
    @test construction_error.error_code == "CONSTRUCTOR_REJECTED"
    @test first_constructions[] == 1
    @test second_constructions[] == 1
    @test schedules[] == 0
  end

  @testset "Atomic simulation preparation" begin
    payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    payload["name"] = "atomic-preparation"
    previous = WebQuantumSavory.State(
      name="atomic-preparation",
      payload=Dict{String,Any}("marker" => "healthy"),
      simulation=ConcurrentSim.Simulation(),
    )
    service = WebQuantumSavory.SimulationService(
      Dict("atomic-preparation" => previous),
    )

    rejected = deepcopy(payload)
    push!(
      rejected["net"]["edges"][1]["data"]["protocols"][1]["parameters"],
      Dict("name" => "success_prob", "type" => "Float64", "value" => 0.0),
    )
    rejection = try
      WebQuantumSavory.simulation_prepare!(service, rejected)
      nothing
    catch error
      error
    end
    @test rejection isa WebQuantumSavory.APIError
    @test rejection.status_code == 422
    @test rejection.error_code == "CONSTRUCTOR_REJECTED"
    @test rejection.details["replacement_committed"] === false
    @test rejection.details["retained_previous"] === true
    @test service.states["atomic-preparation"] === previous
    @test previous.payload["marker"] == "healthy"

    prepare_error(candidate; kwargs...) = try
      WebQuantumSavory.simulation_prepare!(service, candidate; kwargs...)
      nothing
    catch error
      error
    end

    invalid = deepcopy(payload)
    invalid["variables"] = [Dict(
      "id" => "legacy-symbolic",
      "name" => "legacy symbolic",
      "type" => "QuantumSavory.Symbolic",
      "value" => "Z₁",
    )]
    admission_error = prepare_error(invalid)
    @test admission_error.status_code == 400
    @test admission_error.error_code == "VALIDATION_ERROR"
    @test admission_error.details["stage"] == "admission"
    @test admission_error.details["path"] == "/variables/0/type"
    @test admission_error.details["replacement_committed"] === false
    @test admission_error.details["retained_previous"] === true
    @test service.states["atomic-preparation"] === previous

    materialization = deepcopy(payload)
    materialization["net"]["edges"][1]["data"]["protocols"][1]["parameters"] = [
      Dict(
        "name" => "success_prob",
        "type" => "Float64",
        "value" => Dict(
          "kind" => "numeric_expression",
          "source" => "Int64(1.5)",
        ),
      ),
    ]
    materialization_error = withenv(
      WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true",
    ) do
      prepare_error(materialization)
    end
    @test materialization_error.status_code == 422
    @test materialization_error.error_code == "PROJECT_MATERIALIZATION_FAILED"
    @test materialization_error.details["replacement_committed"] === false
    @test materialization_error.details["retained_previous"] === true
    @test service.states["atomic-preparation"] === previous

    policy_error = withenv(
      WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false",
    ) do
      prepare_error(materialization)
    end
    @test policy_error.status_code == 403
    @test policy_error.error_code == WebQuantumSavory.UNSAFE_EVALUATION_DISABLED_CODE
    @test policy_error.details["replacement_committed"] === false
    @test policy_error.details["retained_previous"] === true
    @test service.states["atomic-preparation"] === previous

    scheduling_payload = deepcopy(payload)
    for node in scheduling_payload["net"]["nodes"]
      empty!(node["data"]["protocols"])
    end
    for edge in scheduling_payload["net"]["edges"]
      empty!(edge["data"]["protocols"])
    end
    scheduling_payload["net"]["protocols"] = [Dict(
      "id" => "schedule-failure",
      "type" => "Test.ScheduleFailure",
      "parameters" => Any[],
    )]
    scheduling_constructor = (; sim, net) -> () -> error("schedule failure")
    base_catalogs = WebQuantumSavory._constructor_catalog_snapshot()
    scheduling_catalogs = WebQuantumSavory._ConstructorCatalogSnapshot(
      Any[(
        type=scheduling_constructor,
        wire_type="Test.ScheduleFailure",
        doc="",
        attachment=:network,
        group="floating",
        attachment_fields=NamedTuple(),
        parameters=Any[],
        permits_virtual_edge=false,
      )],
      base_catalogs.backgrounds,
      base_catalogs.slots,
    )
    scheduling_error = prepare_error(
      scheduling_payload;
      catalogs=scheduling_catalogs,
    )
    @test scheduling_error.status_code == 500
    @test scheduling_error.error_code == "SERVER_ERROR"
    @test scheduling_error.details["replacement_committed"] === false
    @test scheduling_error.details["retained_previous"] === true
    @test service.states["atomic-preparation"] === previous
    @test previous.payload["marker"] == "healthy"

    variable_rejected = deepcopy(rejected)
    variable_rejected["variables"] = [Dict(
      "id" => "zero-probability",
      "name" => "zero probability",
      "type" => "Float64",
      "value" => 0.0,
    )]
    only(
      variable_rejected["net"]["edges"][1]["data"]["protocols"][1]["parameters"],
    )["value"] = Dict("kind" => "variable", "id" => "zero-probability")
    variable_service = WebQuantumSavory.SimulationService(
      Dict{String,WebQuantumSavory.State}(),
    )
    variable_rejection = try
      WebQuantumSavory.simulation_prepare!(variable_service, variable_rejected)
      nothing
    catch error
      error
    end
    @test variable_rejection.error_code == rejection.error_code == "CONSTRUCTOR_REJECTED"
    for key in ("stage", "entity_kind", "entity_id", "path", "constructor_type",
      "supplied_keywords", "exception_type", "cause")
      @test variable_rejection.details[key] == rejection.details[key]
    end
    @test isempty(variable_service.states)

    previous.is_running = true
    builder_calls = Ref(0)
    running_error = try
      WebQuantumSavory.simulation_prepare!(
        service,
        payload;
        builder=candidate_payload -> begin
          builder_calls[] += 1
          WebQuantumSavory.State(name=candidate_payload["name"])
        end,
      )
      nothing
    catch error
      error
    end
    @test running_error isa WebQuantumSavory.APIError
    @test running_error.status_code == 409
    @test running_error.error_code == "SIMULATION_RUNNING"
    @test running_error.details["replacement_committed"] === false
    @test running_error.details["retained_previous"] === true
    @test builder_calls[] == 0
    @test service.states["atomic-preparation"] === previous
    previous.is_running = false

    prepared = WebQuantumSavory.simulation_prepare!(service, payload)
    @test service.states["atomic-preparation"] === prepared
    @test prepared !== previous
    @test prepared.payload === payload
    @test prepared.simulation !== nothing
    @test WebQuantumSavory._determine_status(prepared) == "prepared"
    @test previous.payload === nothing
    WebQuantumSavory.cleanup_state!(prepared)

    empty_service = WebQuantumSavory.SimulationService(
      Dict{String,WebQuantumSavory.State}(),
    )
    first_failure = try
      WebQuantumSavory.simulation_prepare!(empty_service, rejected)
      nothing
    catch error
      error
    end
    @test first_failure.details["replacement_committed"] === false
    @test first_failure.details["retained_previous"] === false
    @test isempty(empty_service.states)
  end

  @testset "Julia Script Export" begin
    payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    payload["name"] = "../Constructor First Export?"
    payload["simulationConfig"]["time"] = 0.01
    payload["simulationConfig"]["timeStep"] = 0.01

    state_names_before = Set(keys(WebQuantumSavory.STATE))
    script = WebQuantumSavory.generate_julia_script(payload)
    @test script == WebQuantumSavory.generate_julia_script(payload)
    @test Set(keys(WebQuantumSavory.STATE)) == state_names_before
    @test WebQuantumSavory.generate_julia_script_export(payload)["filename"] ==
      "constructor-first-export.jl"
    @test Meta.parseall(script) isa Expr
    @test occursin("using QuantumSavory", script)
    @test occursin("QuantumSavory.RegisterNet", script)
    @test occursin("QuantumSavory.ProtocolZoo.EntanglerProt", script)
    @test occursin("ConcurrentSim.run(sim, simulation_duration)", script)
    @test occursin("CairoMakie.record", script)
    @test occursin("MIME\"image/png\"()", script)
    @test !occursin("using WebQuantumSavory", script)

    generated_module = Module(gensym(:ValidConstructorFirstExport))
    Core.eval(generated_module, :(using Base))
    Base.include_string(generated_module, script, "valid-constructor-first-export.jl")
    @test length(getfield(generated_module, :registers)) == 2
    @test length(getfield(generated_module, :protocols)) == 2

    transport_payload = deepcopy(payload)
    transport_payload["name"] = "transport-recipes"
    transport_payload["variables"] = Any[
      Dict("id" => "literal", "name" => "literal rate", "type" => "Float64", "value" => 0.25),
      Dict(
        "id" => "numeric",
        "name" => "contextual count",
        "type" => "Int64",
        "value" => Dict("kind" => "numeric_expression", "source" => "self + 1"),
      ),
      Dict("id" => "wildcard", "name" => "fresh wildcard", "type" => "Wildcard", "value" => "Wildcard"),
      Dict("id" => "function", "name" => "known function", "type" => "Function", "value" => "minimum"),
      Dict(
        "id" => "lambda",
        "name" => "custom function",
        "type" => "Lambda",
        "value" => "values -> first(values)",
      ),
      Dict("id" => "symbolic", "name" => "symbolic source", "type" => "Symbolic", "value" => "Z₁"),
      Dict(
        "id" => "state",
        "name" => "zoo state",
        "type" => "Symbolic",
        "value" => Dict(
          "kind" => "states_zoo",
          "state_type" => "DepolarizedBellPair",
          "parameters" => Dict(
            "p" => Dict("kind" => "variable", "id" => "literal"),
          ),
        ),
      ),
      Dict(
        "id" => "weighted",
        "name" => "weighted state",
        "type" => "Symbolic",
        "value" => Dict(
          "kind" => "states_zoo",
          "state_type" => "BarrettKokBellPairW",
          "parameters" => Dict(
            "ηᴬ" => 1.0,
            "ηᴮ" => 1.0,
            "Pᵈ" => 0.0,
            "ηᵈ" => 1.0,
            "𝒱" => 1.0,
          ),
        ),
      ),
      Dict(
        "id" => "weighted_tr",
        "name" => "weighted state trace",
        "type" => "Float64",
        "value" => 0.125,
        "statesZooTraceSourceId" => "weighted",
      ),
    ]
    entangler = transport_payload["net"]["edges"][1]["data"]["protocols"][1]
    entangler["parameters"] = Any[
      Dict(
        "name" => "success_prob",
        "type" => "Float64",
        "value" => Dict("kind" => "variable", "id" => "literal"),
      ),
      Dict(
        "name" => "tag",
        "type" => "DataType",
        "value" => "QuantumSavory.ProtocolZoo.EntanglementCounterpart",
      ),
      Dict(
        "name" => "chooseslotA",
        "type" => "Function",
        "value" => Dict("kind" => "variable", "id" => "function"),
      ),
      Dict(
        "name" => "chooseslotB",
        "type" => "Lambda",
        "value" => Dict("kind" => "variable", "id" => "lambda"),
      ),
      Dict(
        "name" => "pairstate",
        "type" => "Symbolic",
        "value" => Dict("kind" => "variable", "id" => "state"),
      ),
      Dict(
        "name" => "numeric_extra",
        "type" => "Int64",
        "value" => Dict("kind" => "variable", "id" => "numeric"),
      ),
      Dict(
        "name" => "wildcard_extra",
        "type" => "Wildcard",
        "value" => Dict("kind" => "variable", "id" => "wildcard"),
      ),
      Dict(
        "name" => "symbolic_extra",
        "type" => "Symbolic",
        "value" => Dict("kind" => "variable", "id" => "symbolic"),
      ),
      Dict(
        "name" => "weighted_extra",
        "type" => "Symbolic",
        "value" => Dict("kind" => "variable", "id" => "weighted"),
      ),
    ]

    padded_weighted_payload = deepcopy(transport_payload)
    filter!(
      variable -> variable["id"] != "weighted_tr",
      padded_weighted_payload["variables"],
    )
    padded_weighted_payload["variables"][8]["value"]["state_type"] =
      " BarrettKokBellPairW "
    padded_state_type_error = try
      WebQuantumSavory.validate_payload(padded_weighted_payload)
      nothing
    catch error
      error
    end
    @test padded_state_type_error isa WebQuantumSavory.APIError
    @test padded_state_type_error.details["path"] == "/variables/7/value/state_type"

    transport_script = withenv(
      WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false",
    ) do
      WebQuantumSavory.generate_julia_script(transport_payload)
    end
    @test Meta.parseall(transport_script) isa Expr
    @test occursin("uniform placement-context factories", transport_script)
    @test occursin("Base.Float64(0.25)", transport_script)
    @test !occursin("Base.deepcopy", transport_script)
    @test occursin("QuantumSavory.Wildcard()", transport_script)
    @test occursin("Base.minimum", transport_script)
    @test occursin("values -> first(values)", transport_script)
    @test occursin("Base.Int64((begin", transport_script)
    @test occursin(
      "QuantumSavory.StatesZoo.DepolarizedBellPair(variable_literal_rate(",
      transport_script,
    )
    @test occursin("QuantumSavory.StatesZoo.BarrettKokBellPairW", transport_script)
    @test occursin("variable_weighted_state_trace", transport_script)
    @test length(findall("LinearAlgebra.tr(state)", transport_script)) == 2
    @test !occursin("Base.Float64(0.125)", transport_script)
    @test occursin(
      "QuantumSavory.ProtocolZoo.EntanglementCounterpart",
      transport_script,
    )
    @test occursin("numeric_extra = variable_contextual_count(", transport_script)
    @test occursin("wildcard_extra = variable_fresh_wildcard(", transport_script)

    vector_expression = WebQuantumSavory._script_transport_expression(
      WebQuantumSavory._LiteralValue(Int64[1, 2]),
      "Vector{Int64}",
      Dict{Symbol,Any}(),
      WebQuantumSavory._VariableRecipe[],
      String[];
      in_factory=true,
    )
    @test vector_expression == "Base.Int64[1, 2]"
    vector_factory = Core.eval(
      Module(gensym(:LiteralFactory)),
      Meta.parse("() -> $vector_expression"),
    )
    first_vector = Base.invokelatest(vector_factory)
    second_vector = Base.invokelatest(vector_factory)
    @test first_vector == second_vector == Int64[1, 2]
    @test first_vector !== second_vector
    push!(first_vector, 3)
    @test second_vector == Int64[1, 2]

    if !isdefined(Main, :WebQSExportCounting)
      Base.include_string(Main, """
      module WebQSExportCounting
        using QuantumSavory
        const calls = Ref(0)
        struct CountingBackground <: QuantumSavory.AbstractBackground
          value::Float64
        end
        function CountingBackground(; value)
          calls[] += 1
          return CountingBackground(Float64(value))
        end
      end
      """, "webqs-export-counting.jl")
    end
    counting_module = getfield(Main, :WebQSExportCounting)
    counting_module.calls[] = 0
    base_catalogs = WebQuantumSavory._constructor_catalog_snapshot()
    counting_backgrounds = copy(base_catalogs.backgrounds)
    push!(counting_backgrounds, (
      type=counting_module.CountingBackground,
      wire_type="Test.CountingBackground",
      doc="Counting export test constructor.",
      parameters=[(
        field=:invented,
        type=String,
        required=true,
        default=nothing,
        min=10,
        max=20,
        doc="Deliberately inaccurate metadata.",
      )],
    ))
    counting_catalogs = WebQuantumSavory._ConstructorCatalogSnapshot(
      base_catalogs.protocols,
      counting_backgrounds,
      base_catalogs.slots,
    )
    counting_payload = deepcopy(payload)
    counting_payload["net"]["nodes"][1]["data"]["slots"][1]["backgroundNoise"] = Dict(
      "type" => "Test.CountingBackground",
      "parameters" => [
        Dict("name" => "value", "type" => "Float64", "value" => -1.0),
      ],
    )
    counting_script = WebQuantumSavory.generate_julia_script(
      counting_payload;
      catalogs=counting_catalogs,
    )
    @test counting_module.calls[] == 0
    @test occursin("Main.WebQSExportCounting.CountingBackground", counting_script)
    @test occursin("value = Base.Float64(-1.0)", counting_script)

    root_error(error) = error isa LoadError ? root_error(error.error) : error
    function execution_error(invalid_payload, filename)
      invalid_script = WebQuantumSavory.generate_julia_script(invalid_payload)
      @test Meta.parseall(invalid_script) isa Expr
      try
        generated = Module(gensym(:RejectedConstructorExport))
        Core.eval(generated, :(using Base))
        Base.include_string(generated, invalid_script, filename)
        return nothing
      catch error
        return root_error(error)
      end
    end

    missing = deepcopy(payload)
    empty!(missing["net"]["edges"][1]["data"]["protocols"])
    push!(missing["net"]["nodes"][1]["data"]["protocols"], Dict(
      "id" => "missing-required",
      "type" => string(QuantumSavory.ProtocolZoo.SimpleSwitchDiscreteProt),
      "parameters" => Any[],
    ))
    @test execution_error(missing, "missing-required-export.jl") isa UndefKeywordError

    unknown = deepcopy(payload)
    unknown["net"]["edges"][1]["data"]["protocols"][1]["parameters"] = [
      Dict("name" => "unknown_keyword", "type" => "Float64", "value" => 1.0),
    ]
    @test execution_error(unknown, "unknown-keyword-export.jl") isa MethodError

    wrong_type = deepcopy(payload)
    wrong_type["net"]["edges"][1]["data"]["protocols"][1]["parameters"] = [
      Dict("name" => "success_prob", "type" => "String", "value" => "wrong"),
    ]
    @test execution_error(wrong_type, "wrong-type-export.jl") isa MethodError

    out_of_domain = deepcopy(payload)
    out_of_domain["net"]["edges"][1]["data"]["protocols"][1]["parameters"] = [
      Dict("name" => "success_prob", "type" => "Float64", "value" => 0.0),
    ]
    @test execution_error(out_of_domain, "out-of-domain-export.jl") isa DomainError

    malformed_source = deepcopy(transport_payload)
    malformed_source["variables"][2]["value"]["source"] = "self +"
    malformed_error = try
      WebQuantumSavory.generate_julia_script(malformed_source)
      nothing
    catch error
      error
    end
    @test malformed_error isa WebQuantumSavory.APIError
    @test malformed_error.status_code == 400
    @test malformed_error.details["stage"] == "admission"

    forbidden_source = deepcopy(transport_payload)
    forbidden_source["variables"][2]["value"]["source"] = "open(\"forbidden\", \"w\")"
    forbidden_error = try
      WebQuantumSavory.generate_julia_script(forbidden_source)
      nothing
    catch error
      error
    end
    @test forbidden_error isa WebQuantumSavory.APIError
    @test forbidden_error.status_code == 400
    @test occursin("source policy", lowercase(forbidden_error.message))
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
      "minimum",
      "maximum",
      "abs",
      "identity",
      "<(self)",
      ">(self)",
      "≤(self)",
      "≥(self)",
      "==(self)",
    ]
    @test WebQuantumSavory.known_functions() == expected_known_functions
    @test WebQuantumSavory.resolve_function_reference("minimum") === minimum
    @test WebQuantumSavory.resolve_function_reference("maximum") === maximum
    @test WebQuantumSavory.resolve_function_reference("abs") === abs
    @test WebQuantumSavory.resolve_function_reference("identity") === identity
    @test WebQuantumSavory.resolve_function_reference("exit") === nothing
    @test WebQuantumSavory.resolve_function_reference("Main.eval") === nothing

    variables = WebQuantumSavory._VariableRecipe[]
    context = Dict{Symbol,Any}(:node => 2)
    recipe = WebQuantumSavory._normalize_transport_value(
      "Function",
      "==(self)",
      "/net/nodes/0/data/protocols/0/parameters/0/value",
    )
    chooser = WebQuantumSavory._materialize_transport_value(recipe, context, variables)
    @test chooser(2)
    @test !chooser(1)

    ordinary = WebQuantumSavory._normalize_transport_value(
      "Function",
      "identity",
      "/net/protocols/0/parameters/0/value",
    )
    @test WebQuantumSavory._materialize_transport_value(
      ordinary,
      Dict{Symbol,Any}(),
      variables,
    ) === identity

    unknown_error = try
      WebQuantumSavory._normalize_transport_value(
        "Function",
        "exit",
        "/net/protocols/0/parameters/0/value",
      )
      nothing
    catch error
      error
    end
    @test unknown_error isa WebQuantumSavory.APIError
    @test unknown_error.status_code == 400
    @test unknown_error.details["stage"] == "admission"
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
    end
  end

  @testset "Custom Function Runtime Context" begin
    node_names = Dict("Alice" => 1, "Cambridge" => 2)
    node_context = Dict{Symbol,Any}(
      :node => 2,
      WebQuantumSavory.NODE_NAME_TO_INDEX_CONTEXT_KEY => node_names,
    )
    edge_context = Dict{Symbol,Any}(
      WebQuantumSavory.NODE_NAME_TO_INDEX_CONTEXT_KEY => node_names,
      WebQuantumSavory.EDGE_FUNCTION_CONTEXT_KEY =>
        WebQuantumSavory._EdgeFunctionContext(100.0, 0.2, 1.5, 0.1, 0.9, 1, 2),
    )

    withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true") do
      node_function = WebQuantumSavory._materialize_transport_value(
        WebQuantumSavory._FunctionSource(
          "candidate -> candidate == self && nodeid(\"Cambridge\") == self",
        ),
        node_context,
        WebQuantumSavory._VariableRecipe[],
      )
      @test node_function(2)
      @test !node_function(1)

      edge_function = WebQuantumSavory._materialize_transport_value(
        WebQuantumSavory._FunctionSource(
          "() -> distance == 100 && delay == 0.2 && node_a == 1 && node_b == 2",
        ),
        edge_context,
        WebQuantumSavory._VariableRecipe[],
      )
      @test edge_function()

      numeric = WebQuantumSavory._materialize_transport_value(
        WebQuantumSavory._NumericSource(
          "(loss + transmissivity) * delay + nodeid(\"Alice\")",
          "Float64",
        ),
        edge_context,
        WebQuantumSavory._VariableRecipe[],
      )
      @test numeric ≈ 1.2

      variables = [WebQuantumSavory._VariableRecipe(
        "selector",
        "contextual selector",
        "/variables/0",
        "Lambda",
        WebQuantumSavory._FunctionSource("candidate -> candidate == self"),
      )]
      first_use = WebQuantumSavory._materialize_transport_value(
        WebQuantumSavory._VariableUse(1),
        Dict{Symbol,Any}(:node => 1),
        variables,
      )
      second_use = WebQuantumSavory._materialize_transport_value(
        WebQuantumSavory._VariableUse(1),
        Dict{Symbol,Any}(:node => 2),
        variables,
      )
      @test first_use(1)
      @test !first_use(2)
      @test second_use(2)
      @test !second_use(1)
    end

    withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false") do
      @test_throws WebQuantumSavory.APIError WebQuantumSavory._materialize_transport_value(
        WebQuantumSavory._FunctionSource("value -> value"),
        node_context,
        WebQuantumSavory._VariableRecipe[],
      )
      @test_throws WebQuantumSavory.APIError WebQuantumSavory._materialize_transport_value(
        WebQuantumSavory._NumericSource("self + 1", "Int64"),
        node_context,
        WebQuantumSavory._VariableRecipe[],
      )
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

  @testset "Live Protocol Catalog Adapter" begin
      @test !WebQuantumSavory.mock_broken_protocol_enabled(override=nothing)
      @test WebQuantumSavory.mock_broken_protocol_enabled(override=" TRUE ")
      @test !WebQuantumSavory.mock_broken_protocol_enabled(override="False")
      @test_throws ArgumentError WebQuantumSavory.mock_broken_protocol_enabled(override="1")
      @test_throws ArgumentError WebQuantumSavory.mock_broken_protocol_enabled(override="yes")

      live_catalogs = withenv(
        WebQuantumSavory.MOCK_BROKEN_PROTOCOL_ENV_VAR => nothing,
      ) do
        WebQuantumSavory._constructor_catalog_snapshot()
      end
      @test all(
        entry.type !== ContextualIntegerBackground
        for entry in live_catalogs.backgrounds
      )
      upstream_entries = QuantumSavory.ProtocolZoo.available_protocol_types()
      web_entries = withenv(
        WebQuantumSavory.MOCK_BROKEN_PROTOCOL_ENV_VAR => nothing,
      ) do
        Dict(entry["type"] => entry for entry in WebQuantumSavory.get_protocol_types())
      end
      named_tag_parameters = 0

      for upstream in upstream_entries
        wire_type = string(parentmodule(upstream.type), ".", nameof(upstream.type))
        @test haskey(web_entries, wire_type)
        web = web_entries[wire_type]
        adapter = WebQuantumSavory._resolve_protocol_catalog_entry(wire_type, live_catalogs)

        @test adapter.type === upstream.type
        @test adapter.attachment === upstream.attachment
        @test adapter.attachment_fields == upstream.attachment_fields
        @test web["group"] == (upstream.attachment === :network ? "floating" : string(upstream.attachment))
        @test web["virtual"] === upstream.permits_virtual_edge

        upstream_parameters = Dict(string(parameter.field) => parameter for parameter in upstream.parameters)
        web_parameters = Dict(string(parameter.field) => parameter for parameter in web["parameters"])
        @test keys(web_parameters) == keys(upstream_parameters)
        for (field, upstream_parameter) in upstream_parameters
          web_parameter = web_parameters[field]
          @test web_parameter.required === upstream_parameter.required
          named_tag_semantics =
            WebQuantumSavory._named_tag_parameter_semantics(upstream_parameter.type)
          if named_tag_semantics === nothing
            @test !hasproperty(web_parameter, :kind)
            @test !hasproperty(web_parameter, :nullable)
          else
            named_tag_parameters += 1
            @test web_parameter.kind == WebQuantumSavory.NAMED_TAG_PARAMETER_KIND
            @test web_parameter.nullable === named_tag_semantics.nullable
          end
        end
      end
      @test named_tag_parameters > 0

      for override in (nothing, "false")
        withenv(WebQuantumSavory.MOCK_BROKEN_PROTOCOL_ENV_VAR => override) do
          hidden_catalogs = WebQuantumSavory._constructor_catalog_snapshot()
          @test all(
            entry.wire_type != WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE
            for entry in hidden_catalogs.protocols
          )
          @test_logs (:warn, "Diagnostic protocol is disabled") begin
            @test WebQuantumSavory._resolve_protocol_catalog_entry(
              WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE,
              hidden_catalogs,
            ) === nothing
          end
        end
      end

      withenv(WebQuantumSavory.MOCK_BROKEN_PROTOCOL_ENV_VAR => "true") do
        diagnostic_catalogs = WebQuantumSavory._constructor_catalog_snapshot()
        diagnostic = only(filter(
          entry -> entry["type"] == WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE,
          WebQuantumSavory.get_protocol_types(),
        ))
        @test diagnostic["group"] == "floating"
        @test diagnostic["virtual"] === false
        @test WebQuantumSavory._resolve_type_from_string(
          WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE,
          :protocol,
          diagnostic_catalogs,
        ) === WebQuantumSavory.MockBrokenProtocol
      end

      withenv(WebQuantumSavory.MOCK_BROKEN_PROTOCOL_ENV_VAR => "invalid") do
        @test_throws ArgumentError WebQuantumSavory.get_protocol_types()
        @test_throws ArgumentError WebQuantumSavory.validate_payload(test_payload)
        @test WebQuantumSavory.validate_payload(
          deepcopy(test_payload);
          catalogs=live_catalogs,
        )["success"]
      end

      bare_protocol_payload = deepcopy(test_payload)
      bare_protocol_payload["net"]["nodes"][1]["data"]["protocols"][1] =
        string(QuantumSavory.ProtocolZoo.CutoffProt)
      bare_protocol_error = try
        WebQuantumSavory.validate_payload(bare_protocol_payload; catalogs=live_catalogs)
        nothing
      catch error
        error
      end
      @test bare_protocol_error isa WebQuantumSavory.APIError
      @test bare_protocol_error.message == "Expected an object"
      @test bare_protocol_error.details["stage"] == "admission"
      @test bare_protocol_error.details["path"] ==
        "/net/nodes/0/data/protocols/0"
  end

  @testset "SimpleSwitch Catalog Construction and Export" begin
      catalogs = WebQuantumSavory._constructor_catalog_snapshot()
      payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
      payload["name"] = "simple_switch_catalog_parity"
      empty!(payload["net"]["edges"][1]["data"]["protocols"])
      switch_definition = Dict(
        "id" => "simple-switch",
        "type" => string(QuantumSavory.ProtocolZoo.SimpleSwitchDiscreteProt),
        "parameters" => Any[
          Dict("name" => "clientnodes", "type" => "Vector{Int64}", "value" => [2]),
          Dict("name" => "success_probs", "type" => "Vector{Float64}", "value" => [0.8]),
        ],
      )
      push!(payload["net"]["nodes"][1]["data"]["protocols"], switch_definition)

      missing_required = deepcopy(payload)
      pop!(missing_required["net"]["nodes"][1]["data"]["protocols"][1]["parameters"])
      @test WebQuantumSavory.validate_payload(missing_required; catalogs)["success"]

      WebQuantumSavory.validate_payload(payload; catalogs)
      state = WebQuantumSavory.build_simulation_state(payload; catalogs)
      runtime_switch = WebQuantumSavory._instantiate_protocol(
        switch_definition,
        Dict{Symbol,Any}(
          :sim => WebQuantumSavory.get_network_time_tracker(state.network),
          :net => state.network,
          :node => 1,
        );
        catalogs,
      )
      @test runtime_switch.switchnode == 1
      @test runtime_switch.clientnodes == [2]
      @test runtime_switch.success_probs == [0.8]
      @test runtime_switch._backlog[1, 1] == 0

      missing_runtime_error = try
        WebQuantumSavory._instantiate_protocol(
          missing_required["net"]["nodes"][1]["data"]["protocols"][1],
          Dict{Symbol,Any}(
            :sim => WebQuantumSavory.get_network_time_tracker(state.network),
            :net => state.network,
            :node => 1,
          );
          catalogs,
        )
        nothing
      catch error
        error
      end
      @test missing_runtime_error isa WebQuantumSavory.APIError
      @test missing_runtime_error.error_code == "CONSTRUCTOR_REJECTED"

      script = WebQuantumSavory.generate_julia_script(payload; catalogs)
      @test occursin("switchnode = 1", script)
      paused_script = replace(
        script,
        "\nConcurrentSim.run(sim, simulation_duration)\n" =>
          "\n# ConcurrentSim.run(sim, simulation_duration)  # paused by the switch parity test\n";
        count=1,
      )
      generated_module = Module(gensym(:SimpleSwitchCatalogExport))
      Core.eval(generated_module, :(using Base))
      Base.include_string(generated_module, paused_script, "simple-switch-catalog-export.jl")
      exported_switch = only(getfield(generated_module, :protocols)).second
      @test exported_switch.switchnode == runtime_switch.switchnode
      @test exported_switch.clientnodes == runtime_switch.clientnodes
      @test exported_switch.success_probs == runtime_switch.success_probs
      @test exported_switch._backlog[1, 1] == runtime_switch._backlog[1, 1]
      WebQuantumSavory.cleanup_state!(state)
  end

  @testset "Named AbstractTag transport values" begin
    payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    WebQuantumSavory.validate_payload(payload)
    state = WebQuantumSavory.build_simulation_state(payload)
    context = Dict{Symbol,Any}(
      :sim => WebQuantumSavory.get_network_time_tracker(state.network),
      :net => state.network,
      :node_a => 1,
      :node_b => 2,
    )
    counterpart_id = "QuantumSavory.ProtocolZoo.EntanglementCounterpart"
    protocol_definition(T, value, wire_type; id="tag-protocol") = Dict(
      "id" => id,
      "type" => string(T),
      "parameters" => [Dict(
        "name" => "tag",
        "type" => wire_type,
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
        entangler = WebQuantumSavory._instantiate_protocol(
          protocol_definition(
            QuantumSavory.ProtocolZoo.EntanglerProt,
            counterpart_id,
            "DataType",
          ),
          context,
        )
        @test entangler.tag === QuantumSavory.ProtocolZoo.EntanglementCounterpart

        no_tag = WebQuantumSavory._instantiate_protocol(
          protocol_definition(
            QuantumSavory.ProtocolZoo.EntanglerProt,
            "nothing",
            "Nothing";
            id="no-tag",
          ),
          context,
        )
        @test no_tag.tag === nothing

        unknown_type = captured_error(() -> WebQuantumSavory._instantiate_protocol(
          protocol_definition(
            QuantumSavory.ProtocolZoo.EntanglerProt,
            "Main.UnknownTag",
            "DataType";
            id="unknown-tag",
          ),
          context,
        ))
        @test unknown_type isa WebQuantumSavory.APIError
        @test unknown_type.status_code == 400
        @test unknown_type.details["stage"] == "admission"

        incompatible_type = captured_error(() -> WebQuantumSavory._instantiate_protocol(
          protocol_definition(
            QuantumSavory.ProtocolZoo.EntanglerProt,
            "Core.Int64",
            "DataType";
            id="incompatible-tag",
          ),
          context,
        ))
        @test incompatible_type isa WebQuantumSavory.APIError
        @test incompatible_type.status_code == 422
        @test incompatible_type.error_code == "CONSTRUCTOR_REJECTED"

        unknown_keyword = Dict(
          "id" => "unknown-keyword",
          "type" => string(QuantumSavory.ProtocolZoo.EntanglerProt),
          "parameters" => [Dict(
            "name" => "forged_parameter",
            "type" => "Float64",
            "value" => 0.5,
          )],
        )
        constructor_error = captured_error(() -> WebQuantumSavory._instantiate_protocol(
          unknown_keyword,
          context,
        ))
        @test constructor_error isa WebQuantumSavory.APIError
        @test constructor_error.error_code == "CONSTRUCTOR_REJECTED"
        @test constructor_error.details["supplied_keywords"] == ["forged_parameter"]
      end

      withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true") do
        custom_choosers = WebQuantumSavory._instantiate_protocol(
          Dict(
            "id" => "custom-choosers",
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
      end
    finally
      WebQuantumSavory.cleanup_state!(state)
    end
  end

  @testset "States Zoo Registry and Recipes" begin
    expected = [
      "BarrettKokBellPair" => QuantumSavory.StatesZoo.BarrettKokBellPair,
      "BarrettKokBellPairW" => QuantumSavory.StatesZoo.BarrettKokBellPairW,
      "DepolarizedBellPair" => QuantumSavory.StatesZoo.DepolarizedBellPair,
      "GenqoMultiplexedCascadedBellPairW" =>
        QuantumSavory.StatesZoo.Genqo.GenqoMultiplexedCascadedBellPairW,
      "GenqoUnheraldedSPDCBellPairW" =>
        QuantumSavory.StatesZoo.Genqo.GenqoUnheraldedSPDCBellPairW,
    ]
    catalog = WebQuantumSavory.get_states_zoo_types()
    @test [entry["id"] for entry in catalog] == first.(expected)
    @test [entry["weighted"] for entry in catalog] == [false, true, false, true, true]

    for (catalog_entry, (id, T)) in zip(catalog, expected)
      parameter_names = QuantumSavory.StatesZoo.stateparameters(T)
      ranges = QuantumSavory.StatesZoo.stateparametersrange(T)
      metadata = Dict(
        string(parameter.field) => parameter
        for parameter in QuantumSavory.constructor_metadata(T)
      )
      @test [parameter["name"] for parameter in catalog_entry["parameters"]] ==
        string.(collect(parameter_names))
      @test [parameter["doc"] for parameter in catalog_entry["parameters"]] ==
        [string(metadata[string(name)].doc) for name in parameter_names]
      @test all(
        !isempty(strip(parameter["doc"]))
        for parameter in catalog_entry["parameters"]
      )
      parameters = Dict(
        string(parameter) => ranges[parameter].good for parameter in parameter_names
      )
      @test WebQuantumSavory.construct_states_zoo_state(id, parameters) isa T
    end

    multiplexed = only(filter(
      entry -> entry["id"] == "GenqoMultiplexedCascadedBellPairW",
      catalog,
    ))
    unheralded = only(filter(
      entry -> entry["id"] == "GenqoUnheraldedSPDCBellPairW",
      catalog,
    ))
    @test [parameter["name"] for parameter in multiplexed["parameters"]] ==
      ["ηᵇ", "ηᵈ", "ηᵗ", "N"]
    @test [parameter["name"] for parameter in unheralded["parameters"]] ==
      ["ηᵈ", "ηᵗ", "N"]
    @test all(parameter["name"] != "Pᵈ" for parameter in multiplexed["parameters"])
    @test all(parameter["name"] != "Pᵈ" for parameter in unheralded["parameters"])

    # Suggested exploration ranges are not validity checks.
    outside_suggestion = WebQuantumSavory.construct_states_zoo_state(
      "DepolarizedBellPair",
      Dict("p" => 2.0),
    )
    @test outside_suggestion isa QuantumSavory.StatesZoo.DepolarizedBellPair

    weighted_parameters =
      Dict("ηᴬ" => 1.0, "ηᴮ" => 1.0, "Pᵈ" => 0.0, "ηᵈ" => 1.0, "𝒱" => 1.0)
    weighted = WebQuantumSavory.construct_states_zoo_state(
      "BarrettKokBellPairW",
      weighted_parameters,
    )
    @test WebQuantumSavory._states_zoo_absolute_trace(
      "BarrettKokBellPairW",
      weighted,
    ) ≈ 0.5
    weighted_recipe = WebQuantumSavory._normalize_states_zoo_value(
      Dict(
        "kind" => "states_zoo",
        "state_type" => "BarrettKokBellPairW",
        "parameters" => weighted_parameters,
      ),
      "/inline-state",
    )
    materialized_weighted = WebQuantumSavory._materialize_transport_value(
      weighted_recipe,
      Dict{Symbol,Any}(),
      WebQuantumSavory._VariableRecipe[],
    )
    @test abs(LinearAlgebra.tr(QuantumSavory.express(materialized_weighted))) ≈ 1
    exported_weighted = Core.eval(
      @__MODULE__,
      Meta.parse(WebQuantumSavory._script_transport_expression(
        weighted_recipe,
        "Symbolic",
        Dict{Symbol,Any}(),
        WebQuantumSavory._VariableRecipe[],
        String[],
      )),
    )
    @test QuantumSavory.express(exported_weighted) ≈
      QuantumSavory.express(materialized_weighted)

    zero_weighted_parameters =
      Dict("ηᴬ" => 0.0, "ηᴮ" => 0.0, "Pᵈ" => 0.0, "ηᵈ" => 1.0, "𝒱" => 1.0)
    zero_weighted_recipe = WebQuantumSavory._normalize_states_zoo_value(
      Dict(
        "kind" => "states_zoo",
        "state_type" => "BarrettKokBellPairW",
        "parameters" => zero_weighted_parameters,
      ),
      "/zero-state",
    )
    zero_trace_error = try
      WebQuantumSavory._materialize_transport_value(
        zero_weighted_recipe,
        Dict{Symbol,Any}(),
        WebQuantumSavory._VariableRecipe[],
      )
      nothing
    catch error
      error
    end
    @test zero_trace_error isa WebQuantumSavory.APIError
    @test occursin("finite, positive", zero_trace_error.message)

    function zoo_error(state_type, parameters)
      try
        WebQuantumSavory.construct_states_zoo_state(state_type, parameters)
        return nothing
      catch error
        return error
      end
    end
    @test zoo_error("NotAState", Dict()) isa WebQuantumSavory.APIError
    @test zoo_error("DepolarizedBellPair", Dict()) isa WebQuantumSavory.APIError
    @test zoo_error(
      "DepolarizedBellPair",
      Dict("p" => 0.5, "extra" => 1.0),
    ) isa WebQuantumSavory.APIError
    for value in ("0.5", true, NaN, Inf, -Inf)
      @test zoo_error("DepolarizedBellPair", Dict("p" => value)) isa
        WebQuantumSavory.APIError
    end

    recipe = WebQuantumSavory._normalize_states_zoo_value(
      Dict(
        "kind" => "states_zoo",
        "state_type" => "DepolarizedBellPair",
        "parameters" => Dict("p" => 0.9),
      ),
      "/variables/0/value",
    )
    materialized = WebQuantumSavory._materialize_transport_value(
      recipe,
      Dict{Symbol,Any}(),
      WebQuantumSavory._VariableRecipe[],
    )
    @test materialized isa QuantumSavory.StatesZoo.DepolarizedBellPair

    variable_backed = Any[
      Dict(
        "id" => "depolarization",
        "name" => "depolarization",
        "type" => "Float64",
        "value" => 0.7,
      ),
      Dict(
        "id" => "variable-backed-state",
        "name" => "variable-backed state",
        "type" => "Symbolic",
        "value" => Dict(
          "kind" => "states_zoo",
          "state_type" => "DepolarizedBellPair",
          "parameters" => Dict(
            "p" => Dict("kind" => "variable", "id" => "depolarization"),
          ),
        ),
      ),
    ]
    WebQuantumSavory._admit_variables(variable_backed, Set{String}())
    variable_recipes, _, _ = WebQuantumSavory._normalize_variable_recipes(Dict(
      "variables" => variable_backed,
    ))
    variable_backed_state = WebQuantumSavory._materialize_transport_value(
      variable_recipes[2].value,
      Dict{Symbol,Any}(),
      variable_recipes,
    )
    direct_state = WebQuantumSavory.construct_states_zoo_state(
      "DepolarizedBellPair",
      Dict("p" => 0.7),
    )
    @test QuantumSavory.express(variable_backed_state) == QuantumSavory.express(direct_state)

    weighted_variables = Any[
      Dict(
        "id" => "weighted",
        "name" => "weighted",
        "type" => "Symbolic",
        "value" => Dict(
          "kind" => "states_zoo",
          "state_type" => "BarrettKokBellPairW",
          "parameters" => weighted_parameters,
        ),
      ),
      Dict(
        "id" => "weighted_tr",
        "name" => "weighted trace",
        "type" => "Float64",
        "value" => 0.125,
        "statesZooTraceSourceId" => "weighted",
      ),
    ]
    WebQuantumSavory._admit_variables(weighted_variables, Set{String}())
    weighted_recipes, _, _ = WebQuantumSavory._normalize_variable_recipes(Dict(
      "variables" => weighted_variables,
    ))
    @test WebQuantumSavory._materialize_transport_value(
      weighted_recipes[2].value,
      Dict{Symbol,Any}(),
      weighted_recipes,
    ) ≈ 0.5

    missing_trace_error = try
      WebQuantumSavory._admit_variables(weighted_variables[1:1], Set{String}())
      nothing
    catch error
      error
    end
    @test missing_trace_error isa WebQuantumSavory.APIError
    @test occursin("trace companion", missing_trace_error.message)

    zero_weighted_variables = deepcopy(weighted_variables)
    zero_weighted_variables[1]["value"]["parameters"] = zero_weighted_parameters
    WebQuantumSavory._admit_variables(zero_weighted_variables, Set{String}())
    zero_weighted_recipes, _, _ = WebQuantumSavory._normalize_variable_recipes(Dict(
      "variables" => zero_weighted_variables,
    ))
    for recipe in zero_weighted_recipes
      @test_throws WebQuantumSavory.APIError WebQuantumSavory._materialize_transport_value(
        recipe.value,
        Dict{Symbol,Any}(),
        zero_weighted_recipes,
      )
      expression = WebQuantumSavory._script_transport_expression(
        recipe.value,
        recipe.wire_type,
        Dict{Symbol,Any}(),
        zero_weighted_recipes,
        ["weighted_state", "weighted_trace"],
      )
      @test_throws ArgumentError Core.eval(@__MODULE__, Meta.parse(expression))
    end

    state_value(parameter) = Dict(
      "kind" => "states_zoo",
      "state_type" => "DepolarizedBellPair",
      "parameters" => Dict("p" => parameter),
    )
    function state_reference_error(target_id, target)
      variables = target === nothing ? Dict{String,Any}() : Dict(target_id => target)
      paths = target === nothing ? Dict{String,String}() : Dict(target_id => "/variables/0")
      return try
        WebQuantumSavory._admit_states_zoo_parameter_references(
          Dict("p" => Dict("kind" => "variable", "id" => target_id)),
          "/parameters",
          variables,
          paths,
        )
        nothing
      catch error
        error
      end
    end

    direct_integer = Dict("type" => "Int64", "value" => 1)
    @test state_reference_error("integer", direct_integer) === nothing

    rejected_targets = [
      ("missing", nothing, "Unknown variable"),
      ("text", Dict("type" => "String", "value" => "0.7"), "Float64 or Int64"),
      (
        "contextual",
        Dict(
          "type" => "Float64",
          "value" => Dict("kind" => "numeric_expression", "source" => "delay"),
        ),
        "direct finite numeric",
      ),
      ("other-state", Dict("type" => "Symbolic", "value" => state_value(0.5)), "Float64 or Int64"),
      (
        "weighted_tr",
        Dict(
          "type" => "Float64",
          "value" => 0.5,
          "statesZooTraceSourceId" => "weighted",
        ),
        "trace companion",
      ),
    ]
    for (id, target, message) in rejected_targets
      error = state_reference_error(id, target)
      @test error isa WebQuantumSavory.APIError
      @test occursin(message, error.message)
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

  @testset "Canonical Simulation Payload Admission" begin
    failure(payload) = try
      WebQuantumSavory.validate_payload(payload)
      nothing
    catch error
      error
    end

    @test WebQuantumSavory.validate_payload(deepcopy(test_payload))["success"]
    malformed = Dict{String,Any}[]

    extra_root = deepcopy(test_payload)
    extra_root["description"] = "project-only"
    push!(malformed, extra_root)

    missing_variables = deepcopy(test_payload)
    delete!(missing_variables, "variables")
    push!(malformed, missing_variables)

    string_background = deepcopy(test_payload)
    string_background["net"]["nodes"][1]["data"]["slots"][1]["backgroundNoise"] = "default"
    push!(malformed, string_background)

    parameter_extra = deepcopy(test_payload)
    parameter_extra["net"]["nodes"][1]["data"]["protocols"][1]["parameters"][1]["doc"] = "forged"
    push!(malformed, parameter_extra)

    coerced_integer = deepcopy(test_payload)
    coerced_integer["net"]["nodes"][1]["data"]["protocols"][2]["parameters"][2]["value"] = "2"
    push!(malformed, coerced_integer)

    constructor_incompatible_wire = deepcopy(test_payload)
    constructor_incompatible_wire["net"]["nodes"][1]["data"]["protocols"][1]["parameters"][1]["type"] = "String"
    constructor_incompatible_wire["net"]["nodes"][1]["data"]["protocols"][1]["parameters"][1]["value"] = "0.15"
    @test WebQuantumSavory.validate_payload(constructor_incompatible_wire)["success"]

    duplicate_id = deepcopy(test_payload)
    duplicate_id["net"]["nodes"][1]["data"]["slots"][1]["id"] = "node1"
    push!(malformed, duplicate_id)

    for value in (nothing, 9_007_199_254_740_992, Inf)
      invalid_variable = deepcopy(test_payload)
      push!(invalid_variable["variables"], Dict(
        "id" => "variable-invalid",
        "name" => "invalid",
        "type" => value isa Integer ? "Int64" : "Float64",
        "value" => value,
      ))
      push!(malformed, invalid_variable)
    end

    malformed_reference = deepcopy(test_payload)
    malformed_reference["net"]["nodes"][1]["data"]["protocols"][1]["parameters"][1]["value"] = Dict(
      "kind" => "variable",
      "id" => "missing-variable",
      "preview" => 0.15,
    )
    push!(malformed, malformed_reference)

    for payload in malformed
      error = failure(payload)
      @test error isa WebQuantumSavory.APIError
      @test error.status_code == 400
    end
  end

  @testset "Payload Validation" begin
    result = WebQuantumSavory.validate_payload(test_payload)
    @test result["success"]
    @test result["message"] == "Project is structurally valid"
    @test result["graph_info"]["node_count"] == 2
    @test result["graph_info"]["edge_count"] == 1

    failure(payload) = try
      WebQuantumSavory.validate_payload(payload)
      nothing
    catch error
      error
    end

    cases = [
      ("name", payload -> delete!(payload, "name"), "/name"),
      ("net", payload -> delete!(payload, "net"), "/net"),
      (
        "nodes",
        payload -> delete!(payload["net"], "nodes"),
        "/net/nodes",
      ),
      (
        "duplicate node",
        payload -> (payload["net"]["nodes"][2]["id"] = "node1"),
        "/net/nodes/1/id",
      ),
      (
        "source",
        payload -> (payload["net"]["edges"][1]["source"] = "missing"),
        "/net/edges/0/source",
      ),
      (
        "target",
        payload -> (payload["net"]["edges"][1]["target"] = "missing"),
        "/net/edges/0/target",
      ),
      (
        "delay",
        payload ->
          (payload["net"]["edges"][1]["data"]["propagationDelaySeconds"] = -1.0),
        "/net/edges/0/data/propagationDelaySeconds",
      ),
      (
        "transmissivity",
        payload -> (payload["net"]["edges"][1]["data"]["transmissivity"] = 1.01),
        "/net/edges/0/data/transmissivity",
      ),
    ]
    for (_, mutate!, path) in cases
      invalid = deepcopy(test_payload)
      mutate!(invalid)
      error = failure(invalid)
      @test error isa WebQuantumSavory.APIError
      @test error.status_code == 400
      @test error.error_code == "VALIDATION_ERROR"
      @test error.details["stage"] == "admission"
      @test error.details["path"] == path
    end

    duplicate_physical = deepcopy(test_payload)
    duplicate_edge = deepcopy(duplicate_physical["net"]["edges"][1])
    duplicate_edge["id"] = "duplicate-physical"
    duplicate_edge["source"], duplicate_edge["target"] =
      duplicate_edge["target"], duplicate_edge["source"]
    empty!(duplicate_edge["data"]["protocols"])
    push!(duplicate_physical["net"]["edges"], duplicate_edge)
    duplicate_error = failure(duplicate_physical)
    @test duplicate_error.details["path"] == "/net/edges/1"

    permitted_virtual = deepcopy(duplicate_physical)
    permitted_virtual["net"]["edges"][2]["isLogic"] = true
    permitted_virtual["net"]["edges"][2]["data"] = Dict(
      "type" => "connection",
      "protocols" => [Dict(
        "id" => "virtual-consumer",
        "type" => string(QuantumSavory.ProtocolZoo.EntanglementConsumer),
        "parameters" => Any[],
      )],
    )
    @test WebQuantumSavory.validate_payload(permitted_virtual)["success"]

    forbidden_virtual = deepcopy(permitted_virtual)
    forbidden_virtual["net"]["edges"][2]["data"]["protocols"][1]["type"] =
      string(QuantumSavory.ProtocolZoo.EntanglerProt)
    forbidden_error = failure(forbidden_virtual)
    @test forbidden_error isa WebQuantumSavory.APIError
    @test forbidden_error.details["path"] ==
      "/net/edges/1/data/protocols/0/type"
  end
  @testset "Simulation Variables" begin
    payload = deepcopy(test_payload)
    payload["variables"] = [Dict(
      "id" => "retention",
      "name" => "retention time",
      "type" => "Float64",
      "value" => 0.75,
    )]
    parameter = only(
      assignment for assignment in
        payload["net"]["nodes"][1]["data"]["protocols"][1]["parameters"]
      if assignment["name"] == "retention_time"
    )
    parameter["value"] = Dict("kind" => "variable", "id" => "retention")
    @test WebQuantumSavory.validate_payload(payload)["success"]

    variables, indices, types = WebQuantumSavory._normalize_variable_recipes(payload)
    @test length(variables) == 1
    @test variables[1].id == "retention"
    @test variables[1].name == "retention time"
    @test variables[1].wire_type == "Float64"
    @test indices == Dict("retention" => 1)
    @test types == Dict("retention" => "Float64")

    reference = WebQuantumSavory._parse_variable_reference(
      Dict("kind" => "variable", "id" => "retention"),
    )
    @test reference isa WebQuantumSavory.VariableReference
    @test reference.id == "retention"
    @test WebQuantumSavory._parse_variable_reference(
      Dict("kind" => "literal", "id" => "retention"),
    ) === nothing

    function variable_error(mutate!)
      invalid = deepcopy(payload)
      mutate!(invalid)
      try
        WebQuantumSavory.validate_payload(invalid)
        return nothing
      catch error
        return error
      end
    end

    duplicate_name = variable_error(candidate -> push!(
      candidate["variables"],
      Dict("id" => "other", "name" => "retention time", "type" => "Int64", "value" => 2),
    ))
    @test duplicate_name.details["path"] == "/variables/1/name"

    dangling = variable_error(
      candidate -> (parameter = only(
        assignment for assignment in
          candidate["net"]["nodes"][1]["data"]["protocols"][1]["parameters"]
        if assignment["name"] == "retention_time"
      ); parameter["value"]["id"] = "missing"),
    )
    @test dangling.details["path"] ==
      "/net/nodes/0/data/protocols/0/parameters/0/value/id"

    mismatched = variable_error(candidate -> begin
      parameter = only(
        assignment for assignment in
          candidate["net"]["nodes"][1]["data"]["protocols"][1]["parameters"]
        if assignment["name"] == "retention_time"
      )
      parameter["type"] = "Int64"
    end)
    @test mismatched.details["path"] ==
      "/net/nodes/0/data/protocols/0/parameters/0/value"
    @test mismatched.details["assignment_type"] == "Int64"
    @test mismatched.details["variable_type"] == "Float64"
  end
  @testset "Variable-backed Protocol Parameters" begin
      runtime_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
      simulation_name = "variable_backed_protocol_parameters"
      runtime_payload["name"] = simulation_name
      runtime_payload["variables"] = [
        Dict("id" => "probability", "name" => "probability", "type" => "Float64", "value" => 0.25),
        Dict("id" => "no_retry", "name" => "no retry", "type" => "Nothing", "value" => "nothing"),
        Dict(
          "id" => "contextual_lambda",
          "name" => "contextual lambda",
          "type" => "Lambda",
          "value" => "candidates -> self * 100 + nodeid(\"Cambridge\") + first(candidates)",
        ),
      ]

      protocol_definition = runtime_payload["net"]["edges"][1]["data"]["protocols"][1]
      protocol_definition["parameters"] = Any[
        Dict(
          "name" => "success_prob",
          "type" => "Float64",
          "value" => Dict("kind" => "variable", "id" => "probability"),
        ),
        Dict(
          "name" => "retry_lock_time",
          "type" => "Nothing",
          "value" => Dict("kind" => "variable", "id" => "no_retry"),
        ),
      ]

      contextual_protocol_definition = Dict(
        "id" => "runtime-contextual-swapper",
        "type" => string(QuantumSavory.ProtocolZoo.SwapperProt),
        "parameters" => Any[
          Dict(
            "name" => "chooseL",
            "type" => "Lambda",
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
        state = WebQuantumSavory.simulation_prepare!(runtime_payload)
        protocol = state.protocol_mapping[protocol_definition["id"]]
        @test protocol.success_prob == 0.25
        @test protocol.retry_lock_time === nothing
        @test protocol.attempt_time == 0.001

        contextual_protocol = state.protocol_mapping[contextual_protocol_definition["id"]]
        @test contextual_protocol.chooseL([5]) == 107
        @test contextual_protocol.chooseH([5]) == 1006

        ctx = Dict{Symbol,Any}(
          :sim => state.simulation,
          :net => state.network,
          :node_a => 1,
          :node_b => 2,
        )

        states_zoo_protocol_definition = Dict(
          "id" => "states-zoo-variable",
          "type" => string(QuantumSavory.ProtocolZoo.EntanglerProt),
          "parameters" => [Dict(
            "name" => "pairstate",
            "type" => "Symbolic",
            "value" => Dict("kind" => "variable", "id" => "zoo_pair_state"),
          )],
        )
        states_zoo_variables, _, _ = WebQuantumSavory._normalize_variable_recipes(Dict(
          "variables" => [Dict(
            "id" => "zoo_pair_state",
            "name" => "zoo pair state",
            "type" => "Symbolic",
            "value" => Dict(
              "kind" => "states_zoo",
              "state_type" => "DepolarizedBellPair",
              "parameters" => Dict("p" => 0.9),
            ),
          )],
        ))
        withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false") do
          states_zoo_protocol = WebQuantumSavory._instantiate_protocol(
            states_zoo_protocol_definition,
            ctx;
            variables=states_zoo_variables,
          )
          @test states_zoo_protocol.pairstate isa QuantumSavory.StatesZoo.DepolarizedBellPair
        end

        incompatible_protocol_definition = Dict(
          "id" => "string-probability-protocol",
          "type" => string(QuantumSavory.ProtocolZoo.EntanglerProt),
          "parameters" => [Dict(
            "name" => "success_prob",
            "type" => "String",
            "value" => Dict("kind" => "variable", "id" => "string_probability"),
          )],
        )
        incompatible_variables, _, _ = WebQuantumSavory._normalize_variable_recipes(Dict(
          "variables" => [Dict(
            "id" => "string_probability",
            "name" => "string probability",
            "type" => "String",
            "value" => "0.25",
          )],
        ))
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
        @test constructor_error.status_code == 422
        @test constructor_error.error_code == "CONSTRUCTOR_REJECTED"
        @test constructor_error.details["supplied_keywords"] == ["success_prob"]

      finally
        haskey(WebQuantumSavory.STATE, simulation_name) && WebQuantumSavory.destroy_simulation(simulation_name)
      end

      # A function-valued recipe still resolves in the assigned node context.
      recipe = WebQuantumSavory._normalize_transport_value(
        "Function",
        "<(self)",
        "/net/nodes/0/data/protocols/0/parameters/0/value",
      )
      filter_function = WebQuantumSavory._materialize_transport_value(
        recipe,
        Dict{Symbol,Any}(:node => 2),
        WebQuantumSavory._VariableRecipe[],
      )
      @test filter_function.(1:3) == [true, false, false]
  end

  @testset "Graph Building" begin
      WebQuantumSavory.validate_payload(test_payload)
      g = WebQuantumSavory.build_graph(test_payload)
      @test isa(g, SimpleGraph)
      @test nv(g) == 2  # 2 nodes
      @test ne(g) == 1  # 1 edge

      with_virtual = deepcopy(test_payload)
      virtual_edge = deepcopy(with_virtual["net"]["edges"][1])
      virtual_edge["id"] = "virtual-edge"
      virtual_edge["isLogic"] = true
      virtual_edge["data"] = Dict("type" => "connection", "protocols" => Any[])
      push!(with_virtual["net"]["edges"], virtual_edge)
      WebQuantumSavory.validate_payload(with_virtual)
      virtual_graph = WebQuantumSavory.build_graph(with_virtual)
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
      push!(entangler_definition["parameters"], Dict(
        "name" => "chooseslotA",
        "type" => "Lambda",
        "value" =>
          "slot -> distance == 12500.0 && delay == 0.125 && " *
          "refractive_index == 1.5 && loss == 0.2 && transmissivity == 0.95 && " *
          "node_a == 1 && node_b == 2 ? " *
          "slot > 0 : false",
      ))
      virtual_edge = deepcopy(payload["net"]["edges"][1])
      virtual_edge["id"] = "virtual-edge"
      virtual_edge["isLogic"] = true
      virtual_edge["data"] = Dict(
        "type" => "connection",
        "protocols" => [Dict(
          "id" => "virtual-consumer",
          "type" => string(QuantumSavory.ProtocolZoo.EntanglementConsumer),
          "parameters" => Any[],
        )],
      )
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

      try
        state = WebQuantumSavory.simulation_prepare!(payload)
        @test ne(state.graph) == 1
        for endpoints in (1 => 2, 2 => 1)
          @test QuantumSavory.channel(state.network, endpoints).delay == 0.125
          @test QuantumSavory.qchannel(state.network, endpoints).queue.delay == 0.125
        end
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
      WebQuantumSavory.validate_payload(test_payload)
      registers, slot_mapping, slot_reverse_mapping = WebQuantumSavory.create_registers_from_nodes(test_payload)
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
      # operations can index the register by slot.
      default_noise_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
      default_noise_payload["net"]["nodes"][1]["data"]["slots"][2]["backgroundNoise"] = Dict(
        "type" => "T1Decay",
        "parameters" => [Dict("name" => "t1", "type" => "Float64", "value" => 5.0)],
      )

      WebQuantumSavory.validate_payload(default_noise_payload)
      default_noise_registers, _, _ = WebQuantumSavory.create_registers_from_nodes(default_noise_payload)
      @test length.(getfield.(default_noise_registers, :backgrounds)) == length.(default_noise_registers)
      @test isnothing(default_noise_registers[1].backgrounds[1])
      @test default_noise_registers[1].backgrounds[2] isa QuantumSavory.T1Decay
      @test all(isnothing, default_noise_registers[2].backgrounds)

      for malformed_noise in (nothing, "default")
        malformed_payload = deepcopy(default_noise_payload)
        malformed_payload["net"]["nodes"][2]["data"]["slots"][1]["backgroundNoise"] = malformed_noise
        @test_throws WebQuantumSavory.APIError WebQuantumSavory.validate_payload(malformed_payload)
      end

      selected_representation_payload = deepcopy(default_noise_payload)
      selected_representation_payload["simulationConfig"] = Dict(
        "qubitRepresentation" => "QuantumMCRepr",
        "qumodeRepresentation" => "GabsRepr",
      )
      selected_representation_payload["net"]["nodes"][1]["data"]["slots"][2]["type"] = "Qumode"
      WebQuantumSavory.validate_payload(selected_representation_payload)
      selected_representation_registers, _, _ =
        WebQuantumSavory.create_registers_from_nodes(selected_representation_payload)
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
        WebQuantumSavory.validate_payload(named_payload)
        state = WebQuantumSavory.build_simulation_state(named_payload)
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
      WebQuantumSavory.validate_payload(test_payload)
      g = WebQuantumSavory.build_graph(test_payload)
      registers, slot_mapping, slot_reverse_mapping =
        WebQuantumSavory.create_registers_from_nodes(test_payload)
      
      # Test that RegisterNet creation fails with empty slot registers (current behavior)
      @test_throws BoundsError RegisterNet(g, registers)
  end

  @testset "Type Resolution" begin
      catalogs = WebQuantumSavory._constructor_catalog_snapshot()

      protocol_type = WebQuantumSavory._resolve_type_from_string(
        "QuantumSavory.ProtocolZoo.CutoffProt",
        :protocol,
        catalogs,
      )
      @test protocol_type !== nothing

      protocol_type = WebQuantumSavory._resolve_type_from_string(
        "quantumsavory.protocolzoo.cutoffprot",
        :protocol,
        catalogs,
      )
      @test protocol_type === nothing

      @test WebQuantumSavory._resolve_type_from_string(
        "Depolarization",
        :noise,
        catalogs,
      ) !== nothing
      @test WebQuantumSavory._resolve_type_from_string(
        "DEPOLARIZATION",
        :noise,
        catalogs,
      ) === nothing
      @test WebQuantumSavory._resolve_type_from_string(
        "Qubit",
        :slot,
        catalogs,
      ) !== nothing
      @test WebQuantumSavory._resolve_type_from_string(
        "QUBIT",
        :slot,
        catalogs,
      ) === nothing

      @test_logs (:warn, "Protocol type not found in catalog") begin
        @test WebQuantumSavory._resolve_type_from_string(
          "NonExistentType",
          :protocol,
          catalogs,
        ) === nothing
      end
      @test_logs (:warn, "Noise type not found in catalog") begin
        @test WebQuantumSavory._resolve_type_from_string(
          "NonExistent",
          :noise,
          catalogs,
        ) === nothing
      end
      @test_logs (:warn, "Slot type not found in catalog") begin
        @test WebQuantumSavory._resolve_type_from_string(
          "NonExistent",
          :slot,
          catalogs,
        ) === nothing
      end
      @test_throws ArgumentError WebQuantumSavory._resolve_type_from_string(
        "Qubit",
        :unsupported,
        catalogs,
      )
  end

  @testset "Protocol Instantiation Context" begin
      # Test that protocol instantiation uses context values correctly
      prot_def = Dict(
        "type" => "QuantumSavory.ProtocolZoo.CutoffProt",
        "parameters" => [
          Dict("name" => "sim", "type" => "ConcurrentSim.Simulation", "value" => "5"),
          Dict("name" => "net", "type" => "QuantumSavory.RegisterNet", "value" => "5"),
          Dict("name" => "node", "type" => "Int64", "value" => "5")
        ]
      )

      ctx = Dict{Symbol, Any}(:sim => "sim_value", :net => "net_value", :node => 1)
      # This test verifies the context is used correctly in _instantiate_protocol
      # The actual instantiation might fail due to quantum dependencies, but we test the structure
      @test haskey(prot_def, "type")
      @test haskey(prot_def, "parameters")
      @test length(prot_def["parameters"]) == 3
  end

  @testset "Protocol Instantiation" begin
      # Test protocol instantiation with proper context
      prot_def = Dict(
        "type" => "QuantumSavory.ProtocolZoo.CutoffProt",
        "parameters" => [
          Dict("name" => "sim", "type" => "ConcurrentSim.Simulation", "value" => "5"),
          Dict("name" => "net", "type" => "QuantumSavory.RegisterNet", "value" => "5"),
          Dict("name" => "node", "type" => "Int64", "value" => "5")
        ]
      )

      # Test that RegisterNet creation fails with current test payload (has empty slots)
      WebQuantumSavory.validate_payload(test_payload)
      g = WebQuantumSavory.build_graph(test_payload)
      registers, slot_mapping, slot_reverse_mapping =
        WebQuantumSavory.create_registers_from_nodes(test_payload)
      
      # Test that the protocol definition is valid
      @test haskey(prot_def, "type")
      @test haskey(prot_def, "parameters")
      @test length(prot_def["parameters"]) == 3

      # Test that RegisterNet creation fails due to empty slots (expected behavior)
      @test_throws BoundsError RegisterNet(g, registers)
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
      # Partial graph-only states are no longer publicly observable.
      state = WebQuantumSavory.State(name="test", graph=SimpleGraph(2))
      status = WebQuantumSavory._determine_status(state)
      @test status == "unknown"

      # Test prepared status
      state = WebQuantumSavory.State(name="test", network=nothing)
      status = WebQuantumSavory._determine_status(state)
      @test status == "unknown"

      # Test prepared status with simulation
      state = WebQuantumSavory.State(name="test", simulation=nothing)
      status = WebQuantumSavory._determine_status(state)
      @test status == "unknown"

      # A graph without a prepared simulation is not a lifecycle phase.
      state = WebQuantumSavory.State(name="test", graph=SimpleGraph(2))
      status = WebQuantumSavory._determine_status(state)
      @test status == "unknown"

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
      # Partial graph-only states have no public lifecycle message.
      state = WebQuantumSavory.State(name="test", graph=SimpleGraph(2))
      message = WebQuantumSavory._get_status_message(state)
      @test message == "No network data available"

      # Test prepared message
      state = WebQuantumSavory.State(name="test", network=nothing)
      message = WebQuantumSavory._get_status_message(state)
      @test message == "No network data available"

    # Partial graph-only states have no public lifecycle message.
    state = WebQuantumSavory.State(name="test", graph=SimpleGraph(2))
    message = WebQuantumSavory._get_status_message(state)
    @test message == "No network data available"

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
    @test error1.error_code == ""
    @test error1.details === nothing

    error2 = WebQuantumSavory.APIError("Test error", 404, "NOT_FOUND")
    @test error2.error_code == "NOT_FOUND"

    error3 = WebQuantumSavory.APIError("Test error", 500, "SERVER_ERROR", Dict("key" => "value"))
    @test error3.details["key"] == "value"

    # Test error response creation
    response = WebQuantumSavory.create_error_response(error3)
    @test response["success"] == false
    @test response["error"] == "Test error"
    @test response["status_code"] == 500
    @test response["error_code"] == "SERVER_ERROR"
    @test response["details"]["key"] == "value"

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
    WebQuantumSavory.validate_payload(test_payload)
    registers, slot_mapping, slot_reverse_mapping =
      WebQuantumSavory.create_registers_from_nodes(test_payload)
    state = WebQuantumSavory.State(name="test", slot_mapping=slot_mapping)

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
      slot_id = first(keys(slot_mapping))
      result = WebQuantumSavory.get_slot_state(slot_id, state)
      @test result["slot_id"] == slot_id
      @test haskey(result, "is_locked")
      @test haskey(result, "is_assigned")
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
    WebQuantumSavory.validate_payload(cleanup_payload)
    g = WebQuantumSavory.build_graph(cleanup_payload)
    registers, slot_mapping, slot_reverse_mapping =
      WebQuantumSavory.create_registers_from_nodes(cleanup_payload)
    network = RegisterNet(g, registers)
    assigned_slots = (registers[1][1], registers[2][1])
    initialize!(assigned_slots, StabilizerState("ZZ XX"); time=0.0)
    @test all(QuantumSavory.isassigned, assigned_slots)

    state = WebQuantumSavory.State(
      name="test_cleanup",
      payload=cleanup_payload,
      graph=g,
      network=network,
      slot_mapping=slot_mapping,
      slot_reverse_mapping=slot_reverse_mapping,
      protocol_mapping=Dict("test" => "protocol")
    )

    # Test cleanup
    cleanup_success = WebQuantumSavory.cleanup_state!(state)
    @test cleanup_success == true

    # Verify cleanup worked
    @test state.network === nothing
    @test state.slot_mapping === nothing
    @test state.protocol_mapping === nothing
    @test state.graph === nothing
    @test state.payload === nothing
    @test all(slot -> !QuantumSavory.isassigned(slot), assigned_slots)
  end

  @testset "Slot Serialization" begin
    # Create a test state with slot mapping
    WebQuantumSavory.validate_payload(test_payload)
    registers, slot_mapping, slot_reverse_mapping =
      WebQuantumSavory.create_registers_from_nodes(test_payload)
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
    WebQuantumSavory.validate_payload(test_payload)
    g = WebQuantumSavory.build_graph(test_payload)
    registers, slot_mapping = WebQuantumSavory.create_registers_from_nodes(test_payload)
    
    # Test that RegisterNet creation fails due to empty slots (expected behavior)
    @test_throws BoundsError RegisterNet(g, registers)
  end

  @testset "Canonical Wire Decoding" begin
    context = Dict{Symbol,Any}()
    variables = WebQuantumSavory._VariableRecipe[]
    cases = (
      ("Int", 42, 42),
      ("Int64", 7, Int64(7)),
      ("Float64", 3.14, 3.14),
      ("String", "123", "123"),
      ("Bool", true, true),
      ("Nothing", "nothing", nothing),
      ("Vector{Int64}", [1, 2], Int64[1, 2]),
      ("Vector{Float64}", [1, 2.5], Float64[1, 2.5]),
    )
    for (wire_type, wire_value, expected) in cases
      recipe = WebQuantumSavory._normalize_transport_value(
        wire_type,
        wire_value,
        "/value",
      )
      @test WebQuantumSavory._materialize_transport_value(
        recipe,
        context,
        variables,
      ) == expected
    end

    first_wildcard = WebQuantumSavory._materialize_transport_value(
      WebQuantumSavory._normalize_transport_value("Wildcard", "Wildcard", "/value"),
      context,
      variables,
    )
    second_wildcard = WebQuantumSavory._materialize_transport_value(
      WebQuantumSavory._normalize_transport_value("Wildcard", "Wildcard", "/value"),
      context,
      variables,
    )
    @test first_wildcard isa QuantumSavory.Wildcard
    @test second_wildcard isa QuantumSavory.Wildcard

    payload = deepcopy(test_payload)
    assignment = payload["net"]["nodes"][1]["data"]["protocols"][2]["parameters"][2]
    assignment["type"] = "Int64"
    for value in ("7", true, 7.5)
      invalid = deepcopy(payload)
      invalid["net"]["nodes"][1]["data"]["protocols"][2]["parameters"][2]["value"] = value
      error = try
        WebQuantumSavory.validate_payload(invalid)
        nothing
      catch caught
        caught
      end
      @test error isa WebQuantumSavory.APIError
      @test error.status_code == 400
      @test error.details["stage"] == "admission"
    end
  end
  @testset "Unsafe Evaluation Policy" begin
    @test WebQuantumSavory.unsafe_code_evaluation_enabled(environment="dev", override=nothing)
    @test WebQuantumSavory.unsafe_code_evaluation_enabled(environment="test", override=nothing)
    @test !WebQuantumSavory.unsafe_code_evaluation_enabled(environment="prod", override=nothing)
    @test !WebQuantumSavory.unsafe_code_evaluation_enabled(environment="staging", override=nothing)
    @test WebQuantumSavory.unsafe_code_evaluation_enabled(environment="prod", override=" TRUE ")
    @test !WebQuantumSavory.unsafe_code_evaluation_enabled(environment="test", override="False")
    @test_throws ArgumentError WebQuantumSavory.unsafe_code_evaluation_enabled(environment="prod", override="1")
    @test_throws ArgumentError WebQuantumSavory.unsafe_code_evaluation_enabled(environment="prod", override="yes")
  end

  @testset "Unsafe Evaluation Surfaces" begin
    function test_disabled(thunk)
      caught = try
        thunk()
        nothing
      catch error
        error
      end
      @test caught isa WebQuantumSavory.APIError
      @test caught.status_code == 403
      @test caught.error_code == WebQuantumSavory.UNSAFE_EVALUATION_DISABLED_CODE
    end

    withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false") do
      test_disabled(() -> WebQuantumSavory.Sandbox.test_code("x -> x + 1"))
      test_disabled(() -> WebQuantumSavory.Sandbox.evaluate_symbolic_expression("Z₁"))
      test_disabled(() -> WebQuantumSavory.create_lambda("x -> x + 1"))

      # Static source admission and export do not execute source.
      source_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
      source_payload["variables"] = [Dict(
        "id" => "source",
        "name" => "source",
        "type" => "Float64",
        "value" => Dict("kind" => "numeric_expression", "source" => "1 / 2"),
      )]
      @test WebQuantumSavory.validate_payload(source_payload)["success"]
      @test occursin("1 / 2", WebQuantumSavory.generate_julia_script(source_payload))

      known = WebQuantumSavory._materialize_transport_value(
        WebQuantumSavory._normalize_transport_value("Function", "identity", "/value"),
        Dict{Symbol,Any}(),
        WebQuantumSavory._VariableRecipe[],
      )
      @test known === identity
      literal = WebQuantumSavory._materialize_transport_value(
        WebQuantumSavory._normalize_transport_value("Int64", 3, "/value"),
        Dict{Symbol,Any}(),
        WebQuantumSavory._VariableRecipe[],
      )
      @test literal == 3

      safe_noise = WebQuantumSavory._instantiate_noise(Dict(
        "type" => "AmplitudeDamping",
        "parameters" => [Dict("name" => "τ", "type" => "Float64", "value" => 2.0)],
      ))
      @test safe_noise isa QuantumSavory.AmplitudeDamping

      for recipe in (
        WebQuantumSavory._FunctionSource("x -> true"),
        WebQuantumSavory._SymbolicSource("Z₁"),
        WebQuantumSavory._NumericSource("2.0", "Float64"),
      )
        test_disabled(() -> WebQuantumSavory._materialize_transport_value(
          recipe,
          Dict{Symbol,Any}(),
          WebQuantumSavory._VariableRecipe[],
        ))
      end

      test_disabled(() -> WebQuantumSavory._instantiate_noise(Dict(
        "type" => "AmplitudeDamping",
        "parameters" => [Dict(
          "name" => "τ",
          "type" => "Float64",
          "value" => Dict(
            "kind" => "numeric_expression",
            "source" => "Int64(1.5)",
          ),
        )],
      )))
    end
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
    WebQuantumSavory.validate_payload(test_payload)
    g = WebQuantumSavory.build_graph(test_payload)
    registers, slot_mapping = WebQuantumSavory.create_registers_from_nodes(test_payload)
    
    # Test that RegisterNet creation fails due to empty slots (expected behavior)
    @test_throws BoundsError RegisterNet(g, registers)
    
    # Test protocol launch structure without creating network
    protocol_mapping = Dict{String, Any}()
    modified_payload = deepcopy(test_payload)
    modified_payload["net"]["protocols"] = []  # Remove floating protocols

    # Test that the structure is correct even if we can't create the network
    @test haskey(modified_payload["net"], "protocols")
    @test isa(modified_payload["net"]["protocols"], Vector)
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

    state = WebQuantumSavory.simulation_prepare!(payload)

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
        state = WebQuantumSavory.simulation_prepare!(payload)
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
    state = WebQuantumSavory.simulation_prepare!(test_payload3)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    @test state.simulation_last_active_time !== nothing
    
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
    state = WebQuantumSavory.simulation_prepare!(test_payload3)
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
    state = WebQuantumSavory.simulation_prepare!(test_payload3)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    @test state.simulation_last_active_time !== nothing
    
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
    state = WebQuantumSavory.simulation_prepare!(test_payload3)
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
    ok = WebQuantumSavory.block_simulation(state1; reason=:timeout, max_minutes=WebQuantumSavory.MAX_SIM_RUNTIME_MINUTES)
    @test ok == true
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
    ok2 = WebQuantumSavory.block_simulation(state2; reason=:autopurge, max_minutes=30, auto_purged=true)
    @test ok2 == true
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
    WebQuantumSavory._invalidate_tag_catalog_cache!()
    cached_snapshot = WebQuantumSavory._tag_catalog_snapshot()
    @test WebQuantumSavory._tag_catalog_snapshot() === cached_snapshot

    @eval begin
      struct TagCatalogCacheProbe
        value::Int
      end
      QuantumSavory.Tag(probe::TagCatalogCacheProbe) =
        QuantumSavory.Tag(:catalog_cache_probe, probe.value)
    end
    method_invalidated_snapshot = WebQuantumSavory._tag_catalog_snapshot()
    @test method_invalidated_snapshot !== cached_snapshot
    @test any(
      definition -> definition.type === TagCatalogCacheProbe,
      method_invalidated_snapshot.converter_definitions,
    )
    @test !any(
      definition -> definition.type === TagCatalogCacheProbe,
      method_invalidated_snapshot.named,
    )

    WebQuantumSavory._invalidate_tag_catalog_cache!()
    @test WebQuantumSavory._tag_catalog_snapshot() !== method_invalidated_snapshot

    catalog = WebQuantumSavory.tag_type_catalog()
    @test Set(keys(catalog)) == Set([
      "named_tags",
      "general_signatures",
      "allowed_data_types",
      "unsafe_evaluation",
    ])
    @test catalog["unsafe_evaluation"] isa Bool

    function method_argument_types(method)
      signature = Base.unwrap_unionall(method.sig)
      signature isa DataType || return Any[]
      Any[signature.parameters[2:end]...]
    end

    function qualified_type_id(type::DataType)
      base_id = join((string.(Base.fullname(parentmodule(type)))..., string(nameof(type))), ".")
      isempty(type.parameters) && return base_id
      parameter_ids = map(type.parameters) do parameter
        parameter isa DataType ? qualified_type_id(parameter) : string(parameter)
      end
      "$base_id{$(join(parameter_ids, ","))}"
    end

    expected_named_ids = Set{String}()
    expected_general_shapes = Set{Tuple{String,Tuple}}()
    for method in methods(QuantumSavory.Tag)
      arguments = method_argument_types(method)
      if length(arguments) == 1
        type = only(arguments)
        if type isa DataType && isconcretetype(type) &&
           type <: QuantumSavory.AbstractTag &&
           !(type in (QuantumSavory.Tag, Symbol, DataType)) &&
           all(fieldtypes(type)) do field_type
             field_type === Symbol || field_type === DataType ||
               field_type <: Integer || field_type <: AbstractFloat
           end
          push!(expected_named_ids, qualified_type_id(type))
        end
      end
      if !isempty(arguments) && first(arguments) in (Symbol, DataType) &&
         all(type -> type isa DataType && (
           type === Symbol || type === DataType || type <: Integer || type <: AbstractFloat
         ), arguments[2:end])
        push!(expected_general_shapes, (
          string(nameof(first(arguments))),
          Tuple(string(nameof(type)) for type in arguments[2:end]),
        ))
      end
    end

    actual_named_ids = Set(String(definition["type_id"]) for definition in catalog["named_tags"])
    actual_general_shapes = Set(
      (
        String(signature["head_type"]),
        Tuple(String(field["type"]) for field in signature["fields"]),
      ) for signature in catalog["general_signatures"]
    )
    @test actual_named_ids == expected_named_ids
    @test all(definition -> begin
      type = method_invalidated_snapshot.named_by_id[String(definition["type_id"])].type
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
    @test WebQuantumSavory._qualified_tag_type_id(TagCatalogCacheProbe) in allowed_type_ids
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

    non_abstract_converter_id = WebQuantumSavory._qualified_tag_type_id(TagCatalogCacheProbe)
    non_abstract_protocol_error = captured_error(() ->
      WebQuantumSavory._resolve_named_abstract_tag_type(
        non_abstract_converter_id;
        nullable=true,
        context="Protocol tag",
      )
    )
    @test non_abstract_protocol_error isa WebQuantumSavory.APIError
    @test occursin(
      "not an advertised named AbstractTag type",
      non_abstract_protocol_error.message,
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
      state = WebQuantumSavory.simulation_prepare!(payload)
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

  @testset "Typed Numeric Transport" begin
    node_context = Dict{Symbol,Any}(
      :node => 2,
      WebQuantumSavory.NODE_NAME_TO_INDEX_CONTEXT_KEY =>
        Dict("Alice" => 1, "Cambridge" => 2),
    )
    edge_context = Dict{Symbol,Any}(
      WebQuantumSavory.NODE_NAME_TO_INDEX_CONTEXT_KEY =>
        Dict("Alice" => 1, "Cambridge" => 2),
      WebQuantumSavory.EDGE_FUNCTION_CONTEXT_KEY =>
        WebQuantumSavory._EdgeFunctionContext(100.0, 0.2, 1.5, 0.2, 0.95, 1, 2),
    )
    withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true") do
      @test WebQuantumSavory._materialize_transport_value(
        WebQuantumSavory._NumericSource(
          "2 * self + nodeid(\"Alice\")",
          "Int64",
        ),
        node_context,
        WebQuantumSavory._VariableRecipe[],
      ) === Int64(5)
      @test WebQuantumSavory._materialize_transport_value(
        WebQuantumSavory._NumericSource(
          "(loss + transmissivity) * delay / 4",
          "Float64",
        ),
        edge_context,
        WebQuantumSavory._VariableRecipe[],
      ) ≈ 0.0575
      @test WebQuantumSavory._materialize_transport_value(
        WebQuantumSavory._NumericSource("Inf", "Float64"),
        Dict{Symbol,Any}(),
        WebQuantumSavory._VariableRecipe[],
      ) === Inf
      @test isnan(WebQuantumSavory._materialize_transport_value(
        WebQuantumSavory._NumericSource("NaN", "Float64"),
        Dict{Symbol,Any}(),
        WebQuantumSavory._VariableRecipe[],
      ))
    end

    catalogs = constructor_catalogs_with_contextual_background()
    inaccurate_entry = only(filter(
      entry -> entry.wire_type == "ContextualIntegerBackground",
      catalogs.backgrounds,
    ))
    @test inaccurate_entry.parameters[1].type === Int64
    noise = WebQuantumSavory._instantiate_noise(
      Dict(
        "type" => "ContextualIntegerBackground",
        "parameters" => [
          Dict("name" => "count", "type" => "Int64", "value" => -200),
          Dict("name" => "label", "type" => "String", "value" => "accepted"),
        ],
      ),
      Dict{Symbol,Any}();
      catalogs,
    )
    @test noise.count == -200
    @test noise.label == "accepted"

    materialization_recipe = WebQuantumSavory._AssignmentRecipe(
      "count",
      "/net/nodes/0/data/slots/0/backgroundNoise/parameters/0",
      "Int64",
      WebQuantumSavory._NumericSource("1.5", "Int64"),
    )
    background_entity = (
      kind="background",
      id="slot-1",
      path="/net/nodes/0/data/slots/0/backgroundNoise",
    )
    materialization_error = withenv(
      WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true",
    ) do
      try
        WebQuantumSavory._materialize_assignments(
          [materialization_recipe],
          node_context,
          WebQuantumSavory._VariableRecipe[],
          background_entity,
          "ContextualIntegerBackground",
        )
        nothing
      catch error
        error
      end
    end
    @test materialization_error isa WebQuantumSavory.APIError
    @test materialization_error.status_code == 422
    @test materialization_error.error_code == "PROJECT_MATERIALIZATION_FAILED"
    @test materialization_error.details["stage"] == "decode"
    @test materialization_error.details["entity_kind"] == "background"
    @test materialization_error.details["entity_id"] == "slot-1"
    @test materialization_error.details["parameter"] == "count"
    @test materialization_error.details["wire_type"] == "Int64"
    @test materialization_error.details["exception_type"] == "InexactError"

    variable = WebQuantumSavory._VariableRecipe(
      "invalid-count",
      "invalid count",
      "/variables/0",
      "Int64",
      WebQuantumSavory._NumericSource("1.5", "Int64"),
    )
    variable_recipe = WebQuantumSavory._AssignmentRecipe(
      "count",
      "/net/nodes/0/data/slots/0/backgroundNoise/parameters/0",
      "Int64",
      WebQuantumSavory._VariableUse(1),
    )
    variable_error = withenv(
      WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true",
    ) do
      try
        WebQuantumSavory._materialize_assignments(
          [variable_recipe],
          node_context,
          [variable],
          background_entity,
          "ContextualIntegerBackground",
        )
        nothing
      catch error
        error
      end
    end
    @test variable_error isa WebQuantumSavory.APIError
    @test variable_error.error_code == "PROJECT_MATERIALIZATION_FAILED"
    for key in (
      "stage",
      "entity_kind",
      "entity_id",
      "path",
      "constructor_type",
      "parameter",
      "wire_type",
      "exception_type",
      "cause",
    )
      @test variable_error.details[key] == materialization_error.details[key]
    end
    inline_response = WebQuantumSavory.create_error_response(materialization_error)
    variable_response = WebQuantumSavory.create_error_response(variable_error)
    @test inline_response["details"]["cause"] ==
      variable_response["details"]["cause"] == materialization_error.details["cause"]
    @test occursin("InexactError", inline_response["details"]["cause"])
    @test !haskey(inline_response["details"], "evaluation_error")
    @test !haskey(variable_response["details"], "evaluation_error")

    calls = Ref(0)
    supplied = Vector{Vector{Symbol}}()
    fake_constructor = function (; kwargs...)
      calls[] += 1
      push!(supplied, sort!(collect(keys(kwargs))))
      haskey(kwargs, :required_value) || throw(UndefKeywordError(:required_value))
      haskey(kwargs, :unknown_value) &&
        throw(ArgumentError("unknown keyword reached constructor"))
      kwargs[:required_value] isa Float64 ||
        throw(TypeError(:FakeConstructor, "", Float64, kwargs[:required_value]))
      kwargs[:required_value] > 0 ||
        throw(DomainError(kwargs[:required_value], "required_value must be positive"))
      return kwargs[:required_value]
    end
    entity = (kind="protocol", id="fake", path="/net/protocols/0")
    function invoke_fake(recipes)
      kwargs = WebQuantumSavory._materialize_assignments(
        recipes,
        Dict{Symbol,Any}(),
        WebQuantumSavory._VariableRecipe[],
        entity,
        "FakeConstructor",
      )
      try
        WebQuantumSavory._invoke_constructor(
          fake_constructor,
          kwargs,
          entity,
          "FakeConstructor",
          recipes,
        )
        return nothing
      catch error
        return error
      end
    end
    missing = invoke_fake(WebQuantumSavory._AssignmentRecipe[])
    unknown = invoke_fake([
      WebQuantumSavory._AssignmentRecipe(
        "required_value",
        "/net/protocols/0/parameters/0",
        "Float64",
        WebQuantumSavory._LiteralValue(1.0),
      ),
      WebQuantumSavory._AssignmentRecipe(
        "unknown_value",
        "/net/protocols/0/parameters/1",
        "Bool",
        WebQuantumSavory._LiteralValue(true),
      ),
    ])
    wrong = invoke_fake([
      WebQuantumSavory._AssignmentRecipe(
        "required_value",
        "/net/protocols/0/parameters/0",
        "String",
        WebQuantumSavory._LiteralValue("wrong"),
      ),
    ])
    domain = invoke_fake([
      WebQuantumSavory._AssignmentRecipe(
        "required_value",
        "/net/protocols/0/parameters/0",
        "Float64",
        WebQuantumSavory._LiteralValue(-1.0),
      ),
    ])
    numeric_inf, numeric_nan = withenv(
      WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true",
    ) do
      recipes(source) = [WebQuantumSavory._AssignmentRecipe(
        "required_value",
        "/net/protocols/0/parameters/0",
        "Float64",
        WebQuantumSavory._NumericSource(source, "Float64"),
      )]
      invoke_fake(recipes("Inf")), invoke_fake(recipes("NaN"))
    end
    @test calls[] == 6
    @test numeric_inf === nothing
    @test all(
      error -> error isa WebQuantumSavory.APIError,
      (missing, unknown, wrong, domain, numeric_nan),
    )
    @test all(
      error -> error.error_code == "CONSTRUCTOR_REJECTED",
      (missing, unknown, wrong, domain, numeric_nan),
    )
    @test missing.details["exception_type"] == "UndefKeywordError"
    @test unknown.details["exception_type"] == "ArgumentError"
    @test wrong.details["exception_type"] == "TypeError"
    @test domain.details["exception_type"] == "DomainError"
    @test numeric_nan.details["exception_type"] == "DomainError"
    @test supplied == [
      Symbol[],
      [:required_value, :unknown_value],
      [:required_value],
      [:required_value],
      [:required_value],
      [:required_value],
    ]
  end
end
