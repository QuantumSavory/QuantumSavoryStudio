@safetestset "HTTP Contract" begin
  using Test
  import JSON

  WQS = Main.WebQuantumSavory

  function operations(document)
    Dict(
      string(operation["operationId"]) => (
        method=uppercase(string(method)),
        path=string(path),
        exposure=string(operation["x-wqs-exposure"]),
      )
      for (path, path_item) in pairs(document["paths"])
      for (method, operation) in pairs(path_item)
      if lowercase(string(method)) in WQS.HTTP_METHODS
    )
  end

  document = WQS.http_contract_document()
  all_operations = operations(document)

  @test document["openapi"] == "3.1.0"
  @test document["info"]["version"] == WQS._application_version()
  @test length(all_operations) == 46
  @test count(operation -> operation.exposure == "ordinary", values(all_operations)) == 31
  @test count(operation -> operation.exposure == "local-mcp", values(all_operations)) == 14
  @test count(operation -> operation.exposure == "test-only", values(all_operations)) == 1
  @test Set(keys(all_operations)) == Set(keys(WQS.HTTP_OPERATION_INDEX))
  @test WQS.http_operation("getProtocolState").route_path ==
    "/protocols/:name/:protocol_id"
  @test WQS.http_operation("runSimulation").method == "POST"
  @test_throws ArgumentError WQS.http_operation("notAnOperation")

  route_source = read(joinpath(dirname(@__DIR__), "routes.jl"), String)
  source_operation_ids = [
    match.captures[1]
    for match in eachmatch(r"""operation_route\("([^"]+)"\)""", route_source)
  ]
  raw_route_paths = [
    match.captures[1]
    for match in eachmatch(r"""(?m)^\s*route\("([^"]+)"\)""", route_source)
  ]
  @test length(source_operation_ids) == length(all_operations)
  @test Set(source_operation_ids) == Set(keys(all_operations))
  @test raw_route_paths == ["/"]

  error_envelope = document["components"]["schemas"]["ErrorEnvelope"]
  error_body = document["components"]["schemas"]["ErrorBody"]
  @test error_envelope["additionalProperties"] == false
  @test error_envelope["required"] == ["error"]
  @test Set(error_body["required"]) == Set(["code", "message", "details"])
  @test error_body["additionalProperties"] == false
  @test all(
    get(operation["responses"]["default"], "\$ref", nothing) ==
      "#/components/responses/Error"
    for path_item in values(document["paths"])
    for (method, operation) in pairs(path_item)
    if lowercase(string(method)) in WQS.HTTP_METHODS
  )
  @test !haskey(document["components"]["responses"], "JsonSuccess")
  @test Set(keys(document["components"]["responses"])) == Set(["Error"])

  operation_schemas =
    document["components"]["schemas"]["HttpOperationSchemas"]["\$defs"]

  constructor_parameter_metadata =
    operation_schemas["constructorParameterMetadata"]
  @test constructor_parameter_metadata["additionalProperties"] == false
  @test Set(constructor_parameter_metadata["required"]) == Set([
    "field",
    "type",
    "doc",
    "required",
    "min",
    "max",
  ])
  @test constructor_parameter_metadata["properties"]["required"] ==
    Dict("type" => "boolean")
  @test constructor_parameter_metadata["dependentRequired"] == Dict(
    "kind" => ["nullable"],
    "nullable" => ["kind"],
  )

  catalog_schemas = Dict(
    "listBackgroundTypesResponse" => (
      response_field="background_types",
      item_schema="backgroundTypeMetadata",
    ),
    "listProtocolTypesResponse" => (
      response_field="protocol_types",
      item_schema="protocolTypeMetadata",
    ),
    "listSlotTypesResponse" => (
      response_field="slot_types",
      item_schema="slotTypeMetadata",
    ),
    "listStatesZooTypesResponse" => (
      response_field="states_zoo_types",
      item_schema="statesZooTypeMetadata",
    ),
  )
  for (response_schema, catalog) in pairs(catalog_schemas)
    response = operation_schemas[response_schema]
    @test response["additionalProperties"] == false
    @test response["required"] == [catalog.response_field]
    @test response["properties"][catalog.response_field]["items"]["\$ref"] ==
      "#/components/schemas/HttpOperationSchemas/\$defs/$(catalog.item_schema)"
    @test operation_schemas[catalog.item_schema]["additionalProperties"] == false
  end
  for metadata_schema in ("backgroundTypeMetadata", "protocolTypeMetadata")
    parameters = operation_schemas[metadata_schema]["properties"]["parameters"]
    @test parameters["items"]["\$ref"] ==
      "#/components/schemas/HttpOperationSchemas/\$defs/constructorParameterMetadata"
  end

  states_zoo_type = operation_schemas["statesZooTypeMetadata"]
  @test Set(states_zoo_type["required"]) ==
    Set(["id", "display_name", "weighted", "parameters"])
  @test states_zoo_type["properties"]["parameters"]["items"]["\$ref"] ==
    "#/components/schemas/HttpOperationSchemas/\$defs/statesZooParameterMetadata"

  states_zoo_parameter = operation_schemas["statesZooParameterMetadata"]
  @test states_zoo_parameter["additionalProperties"] == false
  @test Set(states_zoo_parameter["required"]) == Set([
    "name",
    "type",
    "integer",
    "doc",
    "min",
    "max",
    "min_inclusive",
    "max_inclusive",
    "good",
  ])
  @test states_zoo_parameter["properties"]["integer"] ==
    Dict("type" => "boolean")
  integer_parameter, floating_parameter = states_zoo_parameter["oneOf"]
  @test integer_parameter["properties"]["type"] == Dict("const" => "Int")
  @test integer_parameter["properties"]["integer"] == Dict("const" => true)
  for field in ("min", "max", "good")
    @test integer_parameter["properties"][field] == Dict(
      "type" => "integer",
      "minimum" => -9007199254740991,
      "maximum" => 9007199254740991,
    )
  end
  @test floating_parameter["properties"]["type"] ==
    Dict("not" => Dict("const" => "Int"))
  @test floating_parameter["properties"]["integer"] == Dict("const" => false)

  for path_item in values(document["paths"])
    for (method, operation) in pairs(path_item)
      lowercase(string(method)) in WQS.HTTP_METHODS || continue
      operation_id = string(operation["operationId"])
      if lowercase(string(method)) in ("patch", "post", "put")
        request_schema =
          operation["requestBody"]["content"]["application/json"]["schema"]
        @test request_schema["\$ref"] ==
          WQS.HTTP_OPERATION_SCHEMA_ROOT * operation_id * "Request"
        @test haskey(operation_schemas, operation_id * "Request")
      else
        @test !haskey(operation, "requestBody")
      end

      success_statuses = [
        string(status)
        for status in keys(operation["responses"])
        if occursin(r"^2\d\d$", string(status))
      ]
      @test length(success_statuses) == 1
      success = operation["responses"][only(success_statuses)]
      media_type = operation_id == "serveApiDocs" ? "text/html" : "application/json"
      @test Set(keys(success["content"])) == Set([media_type])
      @test success["content"][media_type]["schema"]["\$ref"] ==
        WQS.HTTP_OPERATION_SCHEMA_ROOT * operation_id * "Response"
      @test haskey(operation_schemas, operation_id * "Response")
    end
  end
  @test Set(keys(
    document["paths"]["/_mcp/internal/tool"]["post"]["responses"],
  )) == Set(["200", "default"])
  @test Set(keys(
    document["paths"]["/run_simulation"]["post"]["responses"],
  )) == Set(["202", "default"])
  run_request = document["components"]["schemas"]["RunSimulationRequest"]
  @test run_request["additionalProperties"] == false
  @test Set(run_request["required"]) == Set(["name", "time_units"])
  @test run_request["properties"]["name"] ==
    Dict("type" => "string", "minLength" => 1, "pattern" => "\\S")
  @test run_request["properties"]["time_units"] == Dict("type" => "number")

  validate_code_request = operation_schemas["validateCodeRequest"]
  @test validate_code_request["additionalProperties"] == false
  @test validate_code_request["required"] == ["code"]
  @test validate_code_request["properties"]["code"] ==
    Dict("type" => "string", "minLength" => 1, "pattern" => "\\S")
  @test Set(validate_code_request["properties"]["placement"]["enum"]) ==
    Set(["node", "edge", "floating", "variable", "query"])

  validate_symbolic_request =
    operation_schemas["validateSymbolicExpressionRequest"]
  @test validate_symbolic_request["additionalProperties"] == false
  @test validate_symbolic_request["required"] == ["expr"]
  @test validate_symbolic_request["properties"]["expr"] ==
    Dict("type" => "string", "minLength" => 1, "pattern" => "\\S")

  editor_commit_request = operation_schemas["commitMcpEditorCommandRequest"]
  @test !haskey(editor_commit_request["properties"], "operation_id")

  parse_request = document["components"]["schemas"]["ParseNetworkGraphRequest"]
  export_request =
    document["components"]["schemas"]["ExportSimulationScriptRequest"]
  @test parse_request["additionalProperties"] == false
  @test export_request["additionalProperties"] == false
  @test Set(parse_request["required"]) ==
    Set(["name", "variables", "simulationConfig", "net"])
  @test export_request["required"] == parse_request["required"]
  @test parse_request["properties"]["simulationConfig"]["\$ref"] ==
    "#/components/schemas/SimulationRepresentationConfig"
  @test export_request["properties"]["simulationConfig"]["\$ref"] ==
    "#/components/schemas/ScriptExportSimulationConfig"
  @test !haskey(document["components"]["schemas"], "NetworkGraphRequest")
  @test operation_schemas["parseNetworkGraphRequest"]["\$ref"] ==
    "#/components/schemas/ParseNetworkGraphRequest"
  @test operation_schemas["exportSimulationScriptRequest"]["\$ref"] ==
    "#/components/schemas/ExportSimulationScriptRequest"

  representation_config =
    document["components"]["schemas"]["SimulationRepresentationConfig"]
  export_config =
    document["components"]["schemas"]["ScriptExportSimulationConfig"]
  @test representation_config["additionalProperties"] == false
  @test Set(representation_config["required"]) ==
    Set(["qubitRepresentation", "qumodeRepresentation"])
  @test export_config["additionalProperties"] == false
  @test Set(export_config["required"]) == Set([
    "time",
    "timeStep",
    "qubitRepresentation",
    "qumodeRepresentation",
  ])

  physical_data = document["components"]["schemas"]["PhysicalEdgeData"]
  virtual_data = document["components"]["schemas"]["VirtualEdgeData"]
  physical_fields = Set([
    "distanceMeters",
    "propagationDelaySeconds",
    "refractiveIndex",
    "lossDbPerKm",
    "transmissivity",
  ])
  @test physical_data["additionalProperties"] == false
  @test Set(physical_data["required"]) == union(physical_fields, Set(["protocols"]))
  @test virtual_data["additionalProperties"] == false
  @test virtual_data["required"] == ["protocols"]
  @test isempty(intersect(physical_fields, Set(keys(virtual_data["properties"]))))
  @test document["components"]["schemas"]["PhysicalSimulationEdge"]["properties"][
    "isLogic"
  ]["const"] == false
  @test document["components"]["schemas"]["VirtualSimulationEdge"]["properties"][
    "isLogic"
  ]["const"] == true

  node_data = document["components"]["schemas"]["SimulationNodeData"]
  slot = document["components"]["schemas"]["SimulationSlot"]
  background = document["components"]["schemas"]["SimulationBackgroundNoise"]
  background_parameter =
    document["components"]["schemas"]["BackgroundNoiseParameter"]
  protocol = document["components"]["schemas"]["SimulationProtocol"]
  protocol_parameter = document["components"]["schemas"]["ProtocolParameter"]
  for schema in (
    node_data,
    slot,
    background,
    background_parameter,
    protocol,
    protocol_parameter,
  )
    @test schema["additionalProperties"] == false
  end
  @test node_data["properties"]["slots"]["items"]["\$ref"] ==
    "#/components/schemas/SimulationSlot"
  @test Set(slot["required"]) == Set(["id", "type", "backgroundNoise"])
  @test slot["properties"]["backgroundNoise"]["\$ref"] ==
    "#/components/schemas/SimulationBackgroundNoise"
  @test Set(background["required"]) == Set(["type", "parameters"])
  @test background["properties"]["parameters"]["items"]["\$ref"] ==
    "#/components/schemas/BackgroundNoiseParameter"
  @test Set(background_parameter["required"]) == Set(["name", "value"])
  @test Set(protocol["required"]) == Set(["id", "type", "parameters"])
  @test protocol["properties"]["parameters"]["items"]["\$ref"] ==
    "#/components/schemas/ProtocolParameter"
  @test Set(protocol_parameter["required"]) == Set(["name", "type", "value"])
  @test protocol_parameter["properties"]["type"] == Dict(
    "type" => "string",
    "minLength" => 1,
    "pattern" => "\\S",
  )
  @test !haskey(document["components"]["schemas"], "EdgeProtocol")

  variable_reference =
    document["components"]["schemas"]["VariableReferenceValue"]
  numeric_expression =
    document["components"]["schemas"]["NumericExpressionValue"]
  states_zoo = document["components"]["schemas"]["StatesZooValue"]
  for schema in (variable_reference, numeric_expression, states_zoo)
    @test schema["additionalProperties"] == false
  end
  @test Set(variable_reference["required"]) == Set(["kind", "id"])
  @test Set(numeric_expression["required"]) == Set(["kind", "source"])
  @test Set(states_zoo["required"]) ==
    Set(["kind", "state_type", "parameters"])
  @test protocol_parameter["properties"]["value"]["\$ref"] ==
    "#/components/schemas/ConstructorParameterValue"
  @test document["components"]["schemas"]["SimulationVariable"]["properties"][
    "value"
  ]["\$ref"] == "#/components/schemas/VariableDefinitionValue"
  opaque_value = document["components"]["schemas"]["OpaqueSimulatorValue"]
  @test length(opaque_value["oneOf"]) == 6
  @test opaque_value["oneOf"][5]["items"]["\$ref"] ==
    "#/components/schemas/OpaqueSimulatorValue"
  @test opaque_value["oneOf"][6]["not"]["required"] == ["kind"]
  @test opaque_value["oneOf"][6]["additionalProperties"]["\$ref"] ==
    "#/components/schemas/OpaqueSimulatorValue"
  @test states_zoo["properties"]["parameters"] ==
    Dict("type" => "object", "additionalProperties" => Dict("type" => "number"))

  evaluation_failure = operation_schemas["evaluationFailure"]
  @test Set(evaluation_failure["required"]) ==
    Set(["success", "error_code", "error", "error_type"])
  @test Set(keys(operation_schemas["destroySimulationResponse"]["properties"])) ==
    Set(["success", "message"])

  test_document = WQS.active_http_contract_document(mcp=false, test_support=true)
  test_operations = operations(test_document)
  @test length(test_operations) == 32
  @test haskey(test_operations, "manipulateSimulationState")
  @test !any(startswith(operation.path, "/_mcp") for operation in values(test_operations))
  test_definitions =
    test_document["components"]["schemas"]["HttpOperationSchemas"]["\$defs"]
  @test haskey(test_definitions, "manipulateSimulationStateResponse")
  @test !haskey(test_definitions, "getMcpStatusResponse")
  @test !haskey(test_definitions, "bindingIdentityRequest")
  @test haskey(test_document["components"]["schemas"], "TestStateMutation")
  @test "Test support" in getindex.(test_document["tags"], "name")
  @test !("Local MCP" in getindex.(test_document["tags"], "name"))
  @test WQS.validate_http_contract!(test_document) === test_document

  mcp_document = WQS.active_http_contract_document(mcp=true, test_support=false)
  mcp_operations = operations(mcp_document)
  @test length(mcp_operations) == 45
  @test haskey(mcp_operations, "getMcpStatus")
  @test !haskey(mcp_operations, "manipulateSimulationState")
  mcp_definitions =
    mcp_document["components"]["schemas"]["HttpOperationSchemas"]["\$defs"]
  @test haskey(mcp_definitions, "getMcpStatusResponse")
  @test !haskey(mcp_definitions, "manipulateSimulationStateResponse")
  @test haskey(mcp_definitions, "bindingIdentityRequest")
  @test !haskey(mcp_document["components"]["schemas"], "TestStateMutation")
  @test "Local MCP" in getindex.(mcp_document["tags"], "name")
  @test !("Test support" in getindex.(mcp_document["tags"], "name"))
  @test WQS.validate_http_contract!(mcp_document) === mcp_document
  @test JSON.parse(JSON.json(mcp_document))["openapi"] == "3.1.0"
  @test JSON.json(WQS.active_http_contract_document(mcp=true, test_support=false)) ==
    JSON.json(WQS.active_http_contract_document(mcp=true, test_support=false))

  ordinary_document =
    WQS.active_http_contract_document(mcp=false, test_support=false)
  ordinary_definitions =
    ordinary_document["components"]["schemas"]["HttpOperationSchemas"]["\$defs"]
  @test length(operations(ordinary_document)) == 31
  @test !haskey(ordinary_definitions, "bindingIdentityRequest")
  @test !haskey(ordinary_document["components"]["schemas"], "TestStateMutation")
  @test isempty(intersect(
    Set(getindex.(ordinary_document["tags"], "name")),
    Set(["Local MCP", "Test support"]),
  ))
  @test WQS.validate_http_contract!(ordinary_document) === ordinary_document

  registered = WQS.registered_http_operations()
  @test Set(keys(registered)) == WQS.active_http_operation_ids()
  @test WQS.assert_http_route_parity!()
  @test all(
    registered[id] == WQS.http_operation(id)
    for id in keys(registered)
  )

  removed = first(keys(registered))
  try
    delete!(WQS.REGISTERED_HTTP_OPERATIONS, removed)
    @test_throws ArgumentError WQS.assert_http_route_parity!()
  finally
    empty!(WQS.REGISTERED_HTTP_OPERATIONS)
    merge!(WQS.REGISTERED_HTTP_OPERATIONS, registered)
  end

  wrong_version = WQS.http_contract_document()
  wrong_version["info"]["version"] = "0.0.0"
  @test_throws ArgumentError WQS.validate_http_contract!(wrong_version)

  duplicate_id = WQS.http_contract_document()
  duplicate_id["paths"]["/background_types"]["get"]["operationId"] =
    "listSimulations"
  @test_throws ArgumentError WQS.validate_http_contract!(duplicate_id)

  missing_path_parameter = WQS.http_contract_document()
  empty!(missing_path_parameter["paths"]["/slots/{name}/{slot_id}"]["get"]["parameters"])
  @test_throws ArgumentError WQS.validate_http_contract!(missing_path_parameter)

  unresolved_reference = WQS.http_contract_document()
  unresolved_reference["paths"]["/status"]["get"]["responses"]["200"]["\$ref"] =
    "#/components/responses/Missing"
  @test_throws ArgumentError WQS.validate_http_contract!(unresolved_reference)

  generic_success = WQS.http_contract_document()
  generic_success["paths"]["/status"]["get"]["responses"]["200"]["content"][
    "application/json"
  ]["schema"] = Dict("type" => "object", "additionalProperties" => true)
  @test_throws ArgumentError WQS.validate_http_contract!(generic_success)

  wrong_success_schema = WQS.http_contract_document()
  wrong_success_schema["paths"]["/status"]["get"]["responses"]["200"]["content"][
    "application/json"
  ]["schema"]["\$ref"] =
    WQS.HTTP_OPERATION_SCHEMA_ROOT * "getPlatformInfoResponse"
  @test_throws ArgumentError WQS.validate_http_contract!(wrong_success_schema)

  duplicate_success = WQS.http_contract_document()
  duplicate_success["paths"]["/_mcp/internal/tool"]["post"]["responses"]["202"] =
    deepcopy(duplicate_success["paths"]["/_mcp/internal/tool"]["post"]["responses"]["200"])
  @test_throws ArgumentError WQS.validate_http_contract!(duplicate_success)

  missing_request_schema = WQS.http_contract_document()
  delete!(
    missing_request_schema["paths"]["/destroy_simulation"]["post"],
    "requestBody",
  )
  @test_throws ArgumentError WQS.validate_http_contract!(missing_request_schema)

  generic_request = WQS.http_contract_document()
  generic_request["paths"]["/destroy_simulation"]["post"]["requestBody"]["content"][
    "application/json"
  ]["schema"] = Dict("type" => "object", "additionalProperties" => true)
  @test_throws ArgumentError WQS.validate_http_contract!(generic_request)

  noncanonical_error = WQS.http_contract_document()
  noncanonical_error["components"]["schemas"]["ErrorBody"]["properties"]["details"] =
    Dict("type" => "object")
  @test_throws ArgumentError WQS.validate_http_contract!(noncanonical_error)
end
