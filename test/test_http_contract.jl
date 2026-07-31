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

  test_document = WQS.active_http_contract_document(mcp=false, test_support=true)
  test_operations = operations(test_document)
  @test length(test_operations) == 32
  @test haskey(test_operations, "manipulateSimulationState")
  @test !any(startswith(operation.path, "/_mcp") for operation in values(test_operations))

  mcp_document = WQS.active_http_contract_document(mcp=true, test_support=false)
  mcp_operations = operations(mcp_document)
  @test length(mcp_operations) == 45
  @test haskey(mcp_operations, "getMcpStatus")
  @test !haskey(mcp_operations, "manipulateSimulationState")
  @test JSON.parse(JSON.json(mcp_document))["openapi"] == "3.1.0"

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
end
