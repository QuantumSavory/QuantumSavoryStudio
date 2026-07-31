using Genie.Router
using SwagUI
using SwaggerMarkdown
using Genie.Renderer.Json

"""Safe route wrappers: use `sroute(args...) do ... end` or `@sroute args... do ... end`"""
function _derive_route_name(args...; kwargs...)
  if !isempty(args) && isa(args[1], AbstractString)
    return String(args[1])
  elseif haskey(kwargs, :path)
    return String(get(kwargs, :path, ""))
  else
    return "route"
  end
end

function route(f::Function, args...; name=nothing, kwargs...)
  Genie.Router.route(args...; kwargs...) do
    route_name = isnothing(name) ? _derive_route_name(args...; kwargs...) : name
    safe_route_handler(() -> f(), route_name)
  end
end

function bootstrap()
# don't indent everything 
unsafe_code_evaluation_enabled() # validate the operator override during startup

route("/") do
  Genie.Router.serve_static_file("index.html")
end

########################################################


@swagger """
/simulations:
  get:
    description: List all existing simulations with their current status.
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                simulations:
                  type: array
                  items:
                    type: object
                    properties:
                      name:
                        type: string
                      status:
                        type: string
                        enum: ["created", "prepared", "complete", "unknown"]
"""
route("/simulations", method="GET") do
  json(Dict(
    :success => true,
    :simulations => WebQuantumSavory.simulation_list(),
  ))
end

########################################################

@swagger """
/background_types:
  get:
    description: Get the available background types.
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                background_types:
                  type: array
                  items:
                    type: object
                    properties:
                      type:
                        type: string
                        description: The name of the background type
                      doc:
                        type: string
                        description: Documentation describing the background type
                      parameters:
                        type: array
                        description: List of parameters for the background type
                        items:
                          type: object
                          properties:
                            field:
                              type: string
                              description: The parameter field name
                            type:
                              type: string
                              description: The parameter data type
                            doc:
                              type: string
                              description: Documentation describing the parameter
"""
route("/background_types") do
  Dict(:background_types => get_background_types()) |> json
end

########################################################

@swagger """
/slot_types:
  get:
    description: Get the available slot types.
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                slot_types:
                  type: array
                  items:
                    type: object
                    properties:
                      type:
                        type: string
                        description: The name of the slot type
                      doc:
                        type: string
                        description: Documentation describing the slot type
"""
route("/slot_types") do
  Dict(:slot_types => get_slot_types()) |> json
end

########################################################

@swagger """
/protocol_types:
  get:
    description: Get the available protocol types.
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                protocol_types:
                  type: array
                  items:
                    type: object
                    properties:
                      type:
                        type: string
                        description: The name of the protocol type
                      doc:
                        type: string
                        description: Documentation describing the protocol type
                      parameters:
                        type: array
                        description: List of constructor parameters for the protocol type
                        items:
                          type: object
                          properties:
                            field:
                              type: string
                              description: The parameter field name
                            type:
                              oneOf:
                                - type: string
                                - type: array
                                  items:
                                    type: string
                                - type: object
                                  properties:
                                    name:
                                      type: string
                                      description: The type name
                                    lb:
                                      type: string
                                      description: The lower bound type
                                    ub:
                                      type: string
                                      description: The upper bound type
                              description: The existing parameter type wire value; unions are arrays of member names.
                            kind:
                              type: string
                              enum: [named_tag_type]
                              description: Semantic editor kind, present for fields declared as Type{<:AbstractTag}.
                            nullable:
                              type: boolean
                              description: Whether a named-tag-type field also permits Nothing.
                            doc:
                              type: string
                              description: Documentation describing the parameter
"""
route("/protocol_types") do
  Dict(:protocol_types => get_protocol_types()) |> json
end

########################################################

@swagger """
/tag_types:
  get:
    summary: List runtime-discovered tag definitions and signatures
    description: Returns concrete AbstractTag named definitions, general Symbol/DataType signatures, allowlisted DataType heads (including safe converters outside AbstractTag), field documentation, and the unsafe-evaluation capability.
    responses:
      '200':
        description: Tag metadata catalog
        content:
          application/json:
            schema:
              type: object
              required: [named_tags, general_signatures, allowed_data_types, unsafe_evaluation]
              properties:
                named_tags:
                  type: array
                  description: Concrete one-argument Tag converter types that subtype QuantumSavory.AbstractTag and are valid for named-tag protocol fields.
                  items:
                    type: object
                    required: [type_id, display_name, fields]
                general_signatures:
                  type: array
                  items:
                    type: object
                    required: [signature_id, head_type, fields, allowed_data_type_ids]
                    properties:
                      signature_id:
                        type: string
                      head_type:
                        type: string
                        enum: [Symbol, DataType]
                      fields:
                        type: array
                        items:
                          type: object
                      allowed_data_type_ids:
                        type: array
                        description: Fully qualified type IDs that are valid heads for this DataType signature; empty for Symbol signatures.
                        items:
                          type: string
                allowed_data_types:
                  type: array
                  items:
                    type: object
                    required: [type_id, display_name]
                unsafe_evaluation:
                  type: boolean
"""
route("/tag_types", method="GET") do
  json(tag_type_catalog())
end

########################################################

@swagger """
/tag_preview:
  post:
    summary: Validate, construct, and render a typed tag
    description: Constructs only a catalog-advertised named tag or general signature. Arbitrary Julia type lookup is not supported.
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [tag]
            properties:
              tag:
                type: object
                required: [kind]
    responses:
      '200':
        description: Structured tag preview
      '400':
        description: Malformed or incomplete tag specification
"""
route("/tag_preview", method="POST") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  preview = preview_tag_payload(payload)
  json(Dict(:success => true, preview...))
end

########################################################

function _tag_target_query_payload()
  target = Dict{String,Any}()
  for key in ("target", "node_id", "slot_id", "destination_slot_id")
    value = Genie.Requests.getpayload(Symbol(key), nothing)
    value === nothing || (target[key] = string(value))
  end
  target
end

@swagger """
/tags/{name}:
  get:
    summary: List tags for a live register, slot, or message buffer
    parameters:
      - {name: name, in: path, required: true, schema: {type: string}}
      - {name: target, in: query, required: true, schema: {type: string, enum: [register, slot, message_buffer]}}
      - {name: node_id, in: query, schema: {type: string}}
      - {name: slot_id, in: query, schema: {type: string}}
    responses:
      '200': {description: Structured tag entries}
      '404': {description: Simulation or target not found}
  post:
    summary: Attach a slot tag or insert a message-buffer tag
    description: Register targets require destination_slot_id because QuantumSavory attaches metadata to a concrete slot.
    parameters:
      - {name: name, in: path, required: true, schema: {type: string}}
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [target, tag]
            properties:
              target: {type: string, enum: [register, slot, message_buffer]}
              node_id: {type: string}
              slot_id: {type: string}
              destination_slot_id: {type: string}
              tag: {type: object}
    responses:
      '200': {description: Attached tag entry}
      '400': {description: Malformed tag or target}
      '404': {description: Simulation or target not found}
"""
route("/tags/:name", method="GET") do
  simulation_name = string(params(:name))
  state = require_live_tag_state(simulation_name)
  entries = list_tags(state, _tag_target_query_payload())
  json(Dict(:success => true, :entries => entries))
end

route("/tags/:name", method="POST") do
  simulation_name = string(params(:name))
  state = require_live_tag_state(simulation_name)
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  entry = attach_tag!(state, payload)
  json(Dict(:success => true, :entry => entry))
end

########################################################

@swagger """
/tags/{name}/{tag_id}:
  delete:
    summary: Remove a slot/register tag by its string ID
    description: Message-buffer deletion is intentionally unsupported.
    parameters:
      - {name: name, in: path, required: true, schema: {type: string}}
      - {name: tag_id, in: path, required: true, schema: {type: string}}
      - {name: target, in: query, required: true, schema: {type: string, enum: [register, slot, message_buffer]}}
      - {name: node_id, in: query, schema: {type: string}}
      - {name: slot_id, in: query, schema: {type: string}}
    responses:
      '200': {description: Removed tag entry}
      '400': {description: Message deletion or malformed ID}
      '404': {description: "Simulation, target, or tag not found"}
"""
route("/tags/:name/:tag_id", method="DELETE") do
  simulation_name = string(params(:name))
  tag_id = string(params(:tag_id))
  state = require_live_tag_state(simulation_name)
  entry = delete_tag!(state, tag_id, _tag_target_query_payload())
  json(Dict(:success => true, :entry => entry))
end

########################################################

@swagger """
/tag_queries/{name}:
  post:
    summary: Execute a non-consuming FILO tag query
    description: Queries a live register or slot with exact, wildcard, preset-predicate, or policy-gated custom Julia predicate terms. Message-buffer queries are not supported in v1.
    parameters:
      - {name: name, in: path, required: true, schema: {type: string}}
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [target, query]
            properties:
              target: {type: string, enum: [register, slot]}
              node_id: {type: string}
              slot_id: {type: string}
              query: {type: object}
    responses:
      '200': {description: All matching entries in FILO order}
      '400': {description: Malformed query or unsupported target}
      '403': {description: Custom predicates are disabled by server policy}
      '404': {description: Simulation or target not found}
"""
route("/tag_queries/:name", method="POST") do
  simulation_name = string(params(:name))
  state = require_live_tag_state(simulation_name)
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  entries = query_tags(state, payload)
  json(Dict(:success => true, :entries => entries))
end

########################################################

@swagger """
/states_zoo_types:
  get:
    summary: List allowlisted States Zoo types
    description: Return stable type IDs and ordered parameter metadata from QuantumSavory.StatesZoo.
    responses:
      '200':
        description: Available States Zoo types
        content:
          application/json:
            schema:
              type: object
              required:
                - states_zoo_types
              properties:
                states_zoo_types:
                  type: array
                  items:
                    type: object
                    required:
                      - id
                      - display_name
                      - weighted
                      - parameters
                    properties:
                      id:
                        type: string
                        description: Stable allowlisted API type ID
                        example: DepolarizedBellPair
                      display_name:
                        type: string
                        example: Depolarized Bell Pair
                      weighted:
                        type: boolean
                        description: Whether the state constructor returns an unnormalized weighted density matrix
                      parameters:
                        type: array
                        description: Parameters in constructor order
                        items:
                          type: object
                          required:
                            - name
                            - min
                            - max
                            - good
                          properties:
                            name:
                              type: string
                              example: p
                            min:
                              type: number
                            max:
                              type: number
                            good:
                              type: number
"""
route("/states_zoo_types", method="GET") do
  json(Dict(:states_zoo_types => get_states_zoo_types()))
end

########################################################

@swagger """
/states_zoo_preview:
  post:
    summary: Render an allowlisted States Zoo state preview
    description: Safely constructs a whitelisted state from validated numeric parameters and returns a PNG. No Julia source is evaluated.
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            additionalProperties: false
            required:
              - state_type
              - parameters
            properties:
              state_type:
                type: string
                description: Stable ID returned by GET /states_zoo_types
                example: DepolarizedBellPair
              parameters:
                type: object
                description: Exact parameter-name/value object for the selected type
                additionalProperties:
                  type: number
                example:
                  p: 0.8
    responses:
      '200':
        description: Preview rendered successfully
        content:
          application/json:
            schema:
              type: object
              required:
                - success
                - png_base64
                - trace
              properties:
                success:
                  type: boolean
                  example: true
                png_base64:
                  type: string
                  format: byte
                  description: Base64-encoded PNG bytes
                trace:
                  type: number
                  description: Absolute trace of the original density matrix before preview normalization
      '400':
        description: Unknown type or invalid parameter object
        content:
          application/json:
            schema:
              type: object
              required:
                - success
                - error
                - status_code
                - error_code
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                status_code:
                  type: integer
                  example: 400
                error_code:
                  type: string
                  example: VALIDATION_ERROR
                details:
                  type: object
      '500':
        description: Preview rendering failed
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                status_code:
                  type: integer
                  example: 500
                error_code:
                  type: string
                  example: SERVER_ERROR
"""
route("/states_zoo_preview", method="POST") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  state_type, state = parse_states_zoo_preview_payload(payload)
  preview = render_states_zoo_preview(state_type, state)
  json(Dict(
    :success => true,
    :png_base64 => preview.png_base64,
    :trace => preview.trace,
  ))
end

########################################################

@swagger """
/export_script:
  post:
    description: Generate a standalone pedagogical Julia script from a WebQuantumSavory project without creating a server-side simulation.
    requestBody:
      content:
        application/json:
          schema:
            type: object
            required:
              - name
              - net
            properties:
              name:
                type: string
              variables:
                type: array
                items:
                  type: object
                  properties:
                    statesZooTraceSourceId:
                      type: string
                      description: Optional owner ID for a generated weighted States Zoo trace companion; used to compute tuple bindings rather than embedding its cached value
              simulationConfig:
                type: object
                properties:
                  time:
                    type: number
                    minimum: 0
                    exclusiveMinimum: true
                  timeStep:
                    type: number
                    minimum: 0
                    exclusiveMinimum: true
                  qubitRepresentation:
                    type: string
                    enum: [QuantumOpticsRepr, QuantumMCRepr, CliffordRepr]
                    default: QuantumOpticsRepr
                    description: Default numerical representation for Qubit slots
                  qumodeRepresentation:
                    type: string
                    enum: [QuantumOpticsRepr, QuantumMCRepr, GabsRepr]
                    default: QuantumOpticsRepr
                    description: Default numerical representation for Qumode slots
              net:
                type: object
                required:
                  - nodes
                  - edges
    responses:
      '200':
        description: Generated Julia source and a safe download filename.
        content:
          application/json:
            schema:
              type: object
              required:
                - success
                - script
                - filename
              properties:
                success:
                  type: boolean
                  example: true
                script:
                  type: string
                filename:
                  type: string
                  example: repeater-chain.jl
      '400':
        description: The project is invalid or contains a value that cannot be translated reliably.
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                status_code:
                  type: integer
                  example: 400
                error_code:
                  type: string
                  example: VALIDATION_ERROR
"""
route("/export_script", method="POST") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  json(generate_julia_script_export(payload))
end

########################################################

@swagger """
/parse_network_graph:
  post:
    description: Parse a network graph JSON payload and return the parsed object
    requestBody:
      content:
        application/json:
          schema:
            type: object
            required:
              - name
              - net
            properties:
              name:
                type: string
                description: Name of the network
              variables:
                type: array
                description: Optional simulation-global typed variables
                items:
                  type: object
                  required:
                    - id
                    - name
                    - type
                    - value
                  properties:
                    id:
                      type: string
                      description: Stable variable identifier used by protocol references
                    name:
                      type: string
                      description: User-visible unique variable name
                    type:
                      type: string
                      description: Concrete parameter type used to convert the value
                    statesZooTraceSourceId:
                      type: string
                      description: Optional owner ID for a generated weighted States Zoo trace companion
                    value:
                      nullable: true
                      description: JSON-compatible variable value; Symbolic variables may use the structured States Zoo recipe object shown below
                      oneOf:
                        - type: string
                        - type: number
                        - type: boolean
                        - type: object
                          additionalProperties: false
                          required:
                            - kind
                            - state_type
                            - parameters
                          properties:
                            kind:
                              type: string
                              enum: [states_zoo]
                            state_type:
                              type: string
                              description: Stable ID returned by GET /states_zoo_types
                            parameters:
                              type: object
                              additionalProperties:
                                type: number
              simulationConfig:
                type: object
                description: >-
                  Optional global numerical-representation defaults; omitted fields use
                  QuantumOpticsRepr
                properties:
                  qubitRepresentation:
                    type: string
                    enum: [QuantumOpticsRepr, QuantumMCRepr, CliffordRepr]
                    default: QuantumOpticsRepr
                  qumodeRepresentation:
                    type: string
                    enum: [QuantumOpticsRepr, QuantumMCRepr, GabsRepr]
                    default: QuantumOpticsRepr
              net:
                type: object
                required:
                  - nodes
                  - edges
                properties:
                  nodes:
                    type: array
                    items:
                      type: object
                      required:
                        - id
                        - name
                        - position
                        - data
                      properties:
                        id:
                          type: string
                          description: Unique identifier for the node
                        name:
                          type: string
                          description: Display name for the node
                        position:
                          type: array
                          items:
                            type: number
                          minItems: 2
                          maxItems: 2
                          description: "[longitude, latitude] coordinates"
                        data:
                          type: object
                          properties:
                            type:
                              type: string
                              description: "Type of node (e.g., city, City)"
                            slots:
                              type: array
                              items:
                                type: object
                                properties:
                                  id:
                                    type: string
                                  type:
                                    type: string
                                  backgroundNoise:
                                    type: string
                                  lastOperationTime:
                                    type: number
                                  assignment:
                                    type: boolean
                                  isLocked:
                                    type: boolean
                                  representationType:
                                    type: string
                            protocols:
                              type: array
                              items:
                                type: object
                                properties:
                                  id:
                                    type: string
                                  type:
                                    type: string
                                  parameters:
                                    type: array
                                    items:
                                      type: object
                                      properties:
                                        name:
                                          type: string
                                        type:
                                          type: string
                                        value:
                                          oneOf:
                                            - type: string
                                            - type: number
                                            - type: boolean
                                            - type: object
                                              required:
                                                - kind
                                                - id
                                              properties:
                                                kind:
                                                  type: string
                                                  enum: ["variable"]
                                                id:
                                                  type: string
                                              description: Reference to a top-level simulation variable
                  edges:
                    type: array
                    items:
                      type: object
                      required:
                        - id
                        - source
                        - target
                      properties:
                        id:
                          type: string
                          description: Unique identifier for the edge
                        source:
                          type: string
                          description: Source node ID
                        target:
                          type: string
                          description: Target node ID
                        data:
                          type: object
                          properties:
                            type:
                              type: string
                              description: Type of connection
                            distanceMeters:
                              type: number
                              format: double
                              minimum: 0
                              nullable: true
                              description: Optional resolved physical-edge distance in meters; a number must be finite and nonnegative, while omission or null leaves custom-function context unknown
                            propagationDelaySeconds:
                              type: number
                              format: double
                              minimum: 0
                              description: Optional resolved physical-edge propagation delay in seconds; when present it must be finite and nonnegative, while omission by a legacy client defaults to zero
                            refractiveIndex:
                              type: number
                              format: double
                              minimum: 0
                              exclusiveMinimum: true
                              nullable: true
                              description: Optional resolved dimensionless physical-edge refractive index; a number must be finite and greater than zero, while omission or null leaves custom-function context unknown
                            lossDbPerKm:
                              type: number
                              format: double
                              minimum: 0
                              nullable: true
                              description: Optional resolved physical-edge fiber loss in dB/km; a number must be finite and nonnegative, while omission or null leaves custom-function context unknown
                            transmissivity:
                              type: number
                              format: double
                              minimum: 0
                              maximum: 1
                              nullable: true
                              description: Optional resolved dimensionless physical-edge transmissivity; a number must be finite from zero through one, while omission or null leaves custom-function context unknown
                            protocols:
                              type: array
                              items:
                                type: object
                                properties:
                                  id:
                                    type: string
                                    description: Protocol identifier
                                  type:
                                    type: string
                                    description: Protocol type name
                                  parameters:
                                    type: array
                                    items:
                                      type: object
                                      properties:
                                        name:
                                          type: string
                                          description: Parameter name
                                        type:
                                          type: string
                                          description: Parameter type
                                        value:
                                          oneOf:
                                            - type: string
                                            - type: number
                                            - type: boolean
                                            - type: object
                                              required:
                                                - kind
                                                - id
                                              properties:
                                                kind:
                                                  type: string
                                                  enum: ["variable"]
                                                id:
                                                  type: string
                                              description: Reference to a top-level simulation variable
                                          description: Parameter value
                  protocols:
                    type: array
                    description: Array of floating protocols that operate at the network level
                    items:
                      type: object
                      properties:
                        id:
                          type: string
                          description: Protocol identifier
                        type:
                          type: string
                          description: Protocol type name
                        parameters:
                          type: array
                          items:
                            type: object
                            properties:
                              name:
                                type: string
                                description: Parameter name
                              type:
                                type: string
                                description: Parameter type
                              value:
                                oneOf:
                                  - type: string
                                  - type: number
                                  - type: boolean
                                  - type: object
                                    required:
                                      - kind
                                      - id
                                    properties:
                                      kind:
                                        type: string
                                        enum: ["variable"]
                                      id:
                                        type: string
                                    description: Reference to a top-level simulation variable
                                description: Parameter value
    responses:
      '200':
        description: Network created and stored; returns serializable state information
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                  description: Name of the simulation
                status:
                  type: string
                  description: Current status of the simulation
                  enum: ["created", "prepared", "complete", "unknown"]
                node_count:
                  type: integer
                  description: Number of nodes in the network
                edge_count:
                  type: integer
                  description: Number of edges in the network
                protocols_launched:
                  type: object
                  description: Count of launched protocols by category
                  additionalProperties:
                    type: integer
                  nullable: true
                slots:
                  type: object
                  description: Information about quantum slots and their entanglements
                  properties:
                    slots:
                      type: array
                      items:
                        type: object
                        properties:
                          slot_id:
                            type: string
                            description: Unique identifier for the slot
                          state_type:
                            type: string
                            nullable: true
                            description: Type of quantum state in the slot
                          is_locked:
                            type: boolean
                            description: Whether the slot is locked
                          is_assigned:
                            type: boolean
                            description: Whether the slot has an assigned state
                          entangled_slots:
                            type: array
                            items:
                              type: string
                            description: List of slot IDs that are entangled with this slot
                    entanglements:
                      type: array
                      items:
                        type: array
                        items:
                          type: string
                        description: Pairs of entangled slot IDs
                protocols:
                  type: object
                  description: Information about launched protocols
                  properties:
                    protocols:
                      type: array
                      items:
                        type: object
                        properties:
                          protocol_id:
                            type: string
                            description: Unique identifier for the protocol
                          protocol_type:
                            type: string
                            description: Type of the protocol
                simulation:
                  type: object
                  description: Simulation execution information
                  properties:
                    simulation_time:
                      type: number
                      nullable: true
                      description: Total time units for the simulation
                    simulation_progress:
                      type: number
                      nullable: true
                      description: Current simulation time progress
                    simulation_running:
                      type: string
                      enum: ["running", "complete", "not_started"]
                      description: Current simulation execution status
                    simulation_paused:
                      type: boolean
                      description: Whether the simulation is currently paused
                message:
                  type: string
                  description: Human-readable status message
      '400':
        description: Invalid JSON payload or missing required fields
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Error message describing the validation failure
                details:
                  type: object
                  description: Additional error details
      '403':
        description: Payload requires unsafe Julia evaluation, which is disabled (UNSAFE_EVALUATION_DISABLED)
"""
route("/parse_network_graph", method="POST") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  state = try
    WebQuantumSavory.simulation_create!(payload)
  catch ex
    isa(ex, APIError) && rethrow(ex)
    throw(validation_error("Invalid graph - data can not be correctly parsed. Details: $ex"))
  end

  json(WebQuantumSavory.serialize_state(state))
end

########################################################

@swagger """
/prepare_simulation:
  post:
    description: Prepare the simulation for running
    requestBody:
      content:
        application/json:
          schema:
            type: object
            properties:
              name:
                type: string
                description: Name of the simulation
    responses:
      '200':
        description: Simulation prepared and stored; returns serializable state information
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                  description: Name of the simulation
                status:
                  type: string
                  description: Current status of the simulation
                  enum: ["created", "prepared", "complete", "unknown"]
                node_count:
                  type: integer
                  description: Number of nodes in the network
                edge_count:
                  type: integer
                  description: Number of edges in the network
                protocols_launched:
                  type: object
                  description: Count of launched protocols by category
                  additionalProperties:
                    type: integer
                  nullable: true
                slots:
                  type: object
                  description: Information about quantum slots and their entanglements
                  properties:
                    slots:
                      type: array
                      items:
                        type: object
                        properties:
                          slot_id:
                            type: string
                            description: Unique identifier for the slot
                          state_type:
                            type: string
                            nullable: true
                            description: Type of quantum state in the slot
                          is_locked:
                            type: boolean
                            description: Whether the slot is locked
                          is_assigned:
                            type: boolean
                            description: Whether the slot has an assigned state
                          entangled_slots:
                            type: array
                            items:
                              type: string
                            description: List of slot IDs that are entangled with this slot
                    entanglements:
                      type: array
                      items:
                        type: array
                        items:
                          type: string
                        description: Pairs of entangled slot IDs
                protocols:
                  type: object
                  description: Information about launched protocols
                  properties:
                    protocols:
                      type: array
                      items:
                        type: object
                        properties:
                          protocol_id:
                            type: string
                            description: Unique identifier for the protocol
                          protocol_type:
                            type: string
                            description: Type of the protocol
                simulation:
                  type: object
                  description: Simulation execution information
                  properties:
                    simulation_time:
                      type: number
                      nullable: true
                      description: Total time units for the simulation
                    simulation_progress:
                      type: number
                      nullable: true
                      description: Current simulation time progress
                    simulation_running:
                      type: string
                      enum: ["running", "complete", "not_started"]
                      description: Current simulation execution status
                    simulation_paused:
                      type: boolean
                      description: Whether the simulation is currently paused
                message:
                  type: string
                  description: Human-readable status message
      '404':
        description: Simulation not found
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Error message describing the validation failure
                details:
                  type: object
                  description: Additional error details
      '403':
        description: Protocol parameters require unsafe Julia evaluation, which is disabled (UNSAFE_EVALUATION_DISABLED)
"""
route("/prepare_simulation", method="POST") do
  simulation_name = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())["name"]

  # Prepare the simulation, logging unexpected errors to the simulation's log stream
  simulation_state = try
    WebQuantumSavory.simulation_prepare!(simulation_name)
  catch e
    isa(e, APIError) && rethrow(e)

    # Log a human-readable message into the simulation logs for frontend display
    try
      recovered_state = WebQuantumSavory._simulation_state(
        WebQuantumSavory.SIMULATION_SERVICE,
        simulation_name,
      )
      @log_event recovered_state Logging.Error "Error preparing simulation $simulation_name: $(e)" error_type=string(typeof(e))
    catch
    end

    # Rethrow so that safe_route_handler can still produce a proper HTTP error response
    throw(validation_error("Error preparing simulation $simulation_name: $(e)", Dict("error" => string(e))))
  end

  json(WebQuantumSavory.serialize_state(simulation_state))
end

########################################################

function _parse_time_input(time_units_raw)
  # Handle time_units parameter with proper type conversion
  time_units = 10.0  # default value
  if time_units_raw !== nothing
    try
      if isa(time_units_raw, String)
        time_units = parse(Float64, time_units_raw)
      elseif isa(time_units_raw, Number)
        time_units = Float64(time_units_raw)
      else
        throw(validation_error("time_units must be a number or string", Dict("received_type" => string(typeof(time_units_raw)))))
      end
    catch e
      if isa(e, APIError)
        rethrow(e)
      else
        throw(validation_error("Invalid time_units value: $(time_units_raw)", Dict("error" => string(e))))
      end
    end
  end

  time_units
end

@swagger """
/run_simulation:
  post:
    description: Start or resume a simulation in a cooperative background task
    requestBody:
      content:
        application/json:
          schema:
            type: object
            properties:
              name:
                type: string
                description: Name of the simulation
              time_units:
                type: number
                description: Absolute cumulative simulation-time target
    responses:
      '202':
        description: Simulation run accepted
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
                status:
                  type: string
                  example: started
                state:
                  type: object
                  description: State immediately after accepting the run
      '400':
        description: Simulation is unprepared, already running, or has an invalid target
      '404':
        description: Simulation not found
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Error message describing the issue
"""
route("/run_simulation", method="POST") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  simulation_name = payload["name"]
  time_units = _parse_time_input(payload["time_units"])

  simulation_state = try
    WebQuantumSavory.simulation_run!(simulation_name, time_units)
  catch e
    if isa(e, APIError)
      rethrow(e)
    else
      @error stacktrace(catch_backtrace())
      @show e
      throw(server_error("Error running simulation: $e", Dict("error" => string(e))))
    end
  end

  json(
    Dict(
      :success => true,
      :status => "started",
      :state => WebQuantumSavory.serialize_state(simulation_state),
    );
    status=202,
  )
end

########################################################

@swagger """
/get_state:
  get:
    description: Get the state of the simulation
    parameters:
      - name: name
        in: query
        required: true
        schema:
          type: string
    responses:
      '200':
        description: Returns the current simulation state
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
                state:
                  type: object
                  description: Complete simulation state information
                  properties:
                    name:
                      type: string
                      description: Name of the simulation
                    status:
                      type: string
                      description: Current status of the simulation
                      enum: ["created", "prepared", "complete", "unknown"]
                    node_count:
                      type: integer
                      description: Number of nodes in the network
                    edge_count:
                      type: integer
                      description: Number of edges in the network
                    protocols_launched:
                      type: object
                      description: Count of launched protocols by category
                      additionalProperties:
                        type: integer
                      nullable: true
                    slots:
                      type: object
                      description: Information about quantum slots and their entanglements
                      properties:
                        slots:
                          type: array
                          items:
                            type: object
                            properties:
                              slot_id:
                                type: string
                                description: Unique identifier for the slot
                              state_type:
                                type: string
                                nullable: true
                                description: Type of quantum state in the slot
                              is_locked:
                                type: boolean
                                description: Whether the slot is locked
                              is_assigned:
                                type: boolean
                                description: Whether the slot has an assigned state
                              entangled_slots:
                                type: array
                                items:
                                  type: string
                                description: List of slot IDs that are entangled with this slot
                        entanglements:
                          type: array
                          items:
                            type: array
                            items:
                              type: string
                            description: Pairs of entangled slot IDs
                    protocols:
                      type: object
                      description: Information about launched protocols
                      properties:
                        protocols:
                          type: array
                          items:
                            type: object
                            properties:
                              protocol_id:
                                type: string
                                description: Unique identifier for the protocol
                              protocol_type:
                                type: string
                                description: Type of the protocol
                    simulation:
                      type: object
                      description: Simulation execution information
                      properties:
                        simulation_time:
                          type: number
                          nullable: true
                          description: Total time units for the simulation
                        simulation_progress:
                          type: number
                          nullable: true
                          description: Current simulation time progress
                        simulation_running:
                          type: string
                          enum: ["running", "complete", "not_started"]
                          description: Current simulation execution status
                    message:
                      type: string
                      description: Human-readable status message
      '404':
        description: Simulation not found
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Error message describing the issue
"""
route("/get_state", method="GET") do
  simulation_name = Genie.Requests.getpayload()[:name]
  json(Dict(
    :success => true,
    :state => WebQuantumSavory.simulation_status(simulation_name),
  ))
end

########################################################

@swagger """
/slots/{name}/{slot_id}:
  get:
    description: Get the state and entangled slots for a specific slot by ID.
    parameters:
      - name: name
        in: path
        required: true
        schema:
          type: string
        description: The name of the simulation containing the slot
      - name: slot_id
        in: path
        required: true
        schema:
          type: string
        description: The ID of the slot to inspect
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                slot_id:
                  type: string
                  description: The ID of the inspected slot
                state_type:
                  type: string
                  nullable: true
                  description: Type of quantum state in the slot
                is_locked:
                  type: boolean
                  description: Whether the slot is locked
                is_assigned:
                  type: boolean
                  description: Whether the slot has an assigned state
                access_time:
                  type: number
                  nullable: true
                  description: Last access time for the slot
                entangled_slots:
                  type: array
                  items:
                    type: string
                  description: List of slot IDs that are entangled with this slot
                entangled_slot_details:
                  type: array
                  items:
                    type: object
                    properties:
                      slot_id:
                        type: string
                        nullable: true
                        description: ID of the entangled slot
                      parent_reg_index:
                        type: integer
                        description: Index of the parent register
                      slot_index:
                        type: integer
                        description: Index of the slot within the register
                      parent_reg:
                        type: string
                        description: Type of the parent register
                  description: Detailed information about entangled slots
                html_base64:
                  type: string
                  nullable: true
                  description: HTML representation of the slot state encoded as base64
                png_base64:
                  type: string
                  nullable: true
                  description: PNG representation of the slot state encoded as base64
      '404':
        description: Simulation or slot not found
        content:

          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                error:
                  type: string
                  description: Error message describing the issue
"""
route("/slots/:name/:slot_id", method="GET") do
  slot_id = string(params(:slot_id))
  simulation_name = string(params(:name))

  result = WebQuantumSavory.simulation_slot_result(simulation_name, slot_id)

  json(Dict(:success => true, result...))
end

########################################################

@swagger """
/pause_simulation:
  post:
    description: Pause a running simulation
    requestBody:
      content:
        application/json:
          schema:
            type: object
            properties:
              name:
                type: string
                description: Name of the simulation to pause
    responses:
      '200':
        description: Simulation paused successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
                message:
                  type: string
                  example: Simulation paused
                state:
                  type: object
                  description: State after the run task acknowledges the pause
      '400':
        description: Simulation is not running
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Error message describing the issue
      '404':
        description: Simulation not found
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Error message describing the issue
"""
route("/pause_simulation", method="POST") do
  simulation_name = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())["name"]

  try
    state = WebQuantumSavory.simulation_pause!(simulation_name)

    json(Dict(
      :success => true,
      :message => "Simulation paused",
      :state => WebQuantumSavory.serialize_state(state),
    ))
  catch e
    if isa(e, APIError)
      rethrow(e)
    else
      @error stacktrace(catch_backtrace())
      @show e
      throw(server_error("Error pausing simulation: $e", Dict("error" => string(e))))
    end
  end
end

########################################################

@swagger """
/destroy_simulation:
  post:
    description: Destroy the simulation
    requestBody:
      content:
        application/json:
          schema:
            type: object
            properties:
              name:
                type: string
    responses:
      '200':
        description: Simulation destroyed successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
                message:
                  type: string
                  example: Simulation destroyed
      '404':
        description: Simulation not found
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Error message describing the issue
"""
route("/destroy_simulation", method="POST") do
  simulation_name = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())["name"]

  WebQuantumSavory.simulation_destroy!(simulation_name)
  json(Dict(:success => true, :message => "Simulation destroyed and resources cleaned up"))
end

########################################################

@swagger """
/protocols/{name}/{protocol_id}:
  get:
    description: Get the state and visual representation for a specific protocol by ID.
    parameters:
      - name: name
        in: path
        required: true
        schema:
          type: string
        description: The name of the simulation containing the protocol
      - name: protocol_id
        in: path
        required: true
        schema:
          type: string
        description: The ID of the protocol to inspect
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                protocol_id:
                  type: string
                  description: The ID of the inspected protocol
                protocol_type:
                  type: string
                  description: The type of the protocol
                html_base64:
                  type: string
                  description: HTML representation of the protocol encoded as base64
                png_base64:
                  type: string
                  description: PNG representation of the protocol encoded as base64
      '404':
        description: Simulation or protocol not found
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                error:
                  type: string
                  description: Error message describing the issue
"""
route("/protocols/:name/:protocol_id", method="GET") do
  protocol_id = string(params(:protocol_id))
  simulation_name = string(params(:name))

  result = WebQuantumSavory.simulation_protocol_result(simulation_name, protocol_id)

  json(Dict(:success => true, result...))
end

########################################################

@swagger """
/status:
  get:
    description: Get the status of the server.
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                status:
                  type: string
"""
route("/status") do
  Dict(:status => "OK") |> json
end

########################################################

@swagger """
/known_functions:
  get:
    summary: List known Julia functions usable as argument values
    description: Returns the whitelist of supported Julia functions that can be referenced in request payloads as argument values. Functions containing `(self)` are available only to node protocols, where `self` is the node's Julia-native one-based RegisterNet index.
    responses:
      '200':
        description: Successful response with the list of known functions
        content:
          application/json:
            schema:
              type: object
              properties:
                known_functions:
                  type: array
                  items:
                    type: string
                  description: Array of function names
            examples:
              default:
                summary: Example response
                value:
                  known_functions: ["minimum", "maximum", "abs", "identity", "<(self)", ">(self)", "≤(self)", "≥(self)", "==(self)"]
"""
route("/known_functions") do
  Dict(:known_functions => WebQuantumSavory.known_functions()) |> json
end

########################################################

@swagger """
/test_code:
  post:
    summary: Test Julia code in a fresh module
    description: |
      Execute Julia code in the server process and return the results. The
      fresh module isolates names but is not a security sandbox. This endpoint
      is available only when unsafe code evaluation is enabled.
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            properties:
              code:
                type: string
                description: Julia code to execute
                example: "function add(a, b)\nreturn a + b\nend"
              placement:
                type: string
                enum: [node, edge, floating, variable, query]
                description: Optional validation placement; protocol placements provide representative custom-function context, variable provides the deferred-assignment superset, query matches tag-query runtime without injected context, and omission defaults to floating context
            required:
              - code
    responses:
      '200':
        description: Code executed successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
                message:
                  type: string
                  example: "Code executed successfully"
                results:
                  type: object
                  description: Functions and variables defined in the code
                  properties:
                    functions:
                      type: array
                      items:
                        type: string
                      description: Names of functions created
                      example: ["add", "multiply"]
                    variables:
                      type: object
                      description: Variables and constants defined
                      example: {"PI": 3.14159}
      '400':
        description: Code execution failed
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Detailed error message
                  example: "UndefVarError: `unknown_function` not defined"
                error_type:
                  type: string
                  description: Type of error that occurred
                  example: "UndefVarError"
      '403':
        description: Unsafe Julia code evaluation is disabled
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  example: Unsafe Julia code evaluation is disabled
                error_code:
                  type: string
                  example: UNSAFE_EVALUATION_DISABLED
"""
route("/test_code", method="POST") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())

  if !haskey(payload, "code")
    throw(validation_error("Missing required field 'code'", Dict("required_field" => "code")))
  end

  code_string = payload["code"]
  placement = get(payload, "placement", nothing)
  if placement !== nothing && !(
    placement isa AbstractString &&
      placement in ("node", "edge", "floating", "variable", "query")
  )
    throw(validation_error(
      "Field 'placement' must be 'node', 'edge', 'floating', 'variable', or 'query'",
      Dict("field" => "placement"),
    ))
  end
  require_unsafe_code_evaluation()

  # Evaluate in a fresh namespace; Sandbox also enforces the policy for direct callers.
  success, results, error = Sandbox.test_code(
    code_string;
    placement=placement === nothing ? nothing : String(placement),
  )

  if success
    json(Dict(
      :success => true,
      :message => "Code executed successfully",
      :results => results
    ))
  else
    json(evaluation_failure_response(error))
  end
end

########################################################

@swagger """
/test_numeric_expression:
  post:
    summary: Validate or evaluate a typed Julia numeric expression
    description: |
      Parses complete Julia source and casts its final value to Float64 or
      Int64. Concrete node, edge, and floating requests evaluate with the
      supplied lexical assignment context. Omit context only for explicit
      templates and Variables. Templates evaluate once with stable
      representative values and return that value with deferred=true. Variable
      requests lower once and are deferred without executing the expression
      body when resolved assignment globals are referenced. This endpoint
      executes trusted Julia code in the server process and is available only
      when unsafe evaluation is enabled.
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            additionalProperties: false
            required: [expression, target_type, placement]
            properties:
              expression:
                type: string
                example: "delay / 2"
              target_type:
                type: string
                enum: [Float64, Int64]
              placement:
                type: string
                enum: [node, edge, floating, variable]
              context:
                description: Strict placement-specific concrete context; omit for templates and variables.
                oneOf:
                  - type: object
                    title: Floating protocol context
                    additionalProperties: false
                    required: [node_names]
                    properties:
                      node_names:
                        type: array
                        items:
                          type: string
                  - type: object
                    title: Node protocol context
                    additionalProperties: false
                    required: [node_names, self]
                    properties:
                      node_names:
                        type: array
                        items:
                          type: string
                      self:
                        type: integer
                        minimum: 1
                  - type: object
                    title: Edge protocol context
                    additionalProperties: false
                    required: [node_names, distance, delay, refractive_index, loss, transmissivity, node_a, node_b]
                    properties:
                      node_names:
                        type: array
                        items:
                          type: string
                      distance:
                        type: number
                        nullable: true
                        minimum: 0
                      delay:
                        type: number
                        nullable: true
                        minimum: 0
                      refractive_index:
                        type: number
                        nullable: true
                        minimum: 0
                        exclusiveMinimum: true
                      loss:
                        type: number
                        nullable: true
                        minimum: 0
                      transmissivity:
                        type: number
                        nullable: true
                        minimum: 0
                        maximum: 1
                      node_a:
                        type: integer
                        minimum: 1
                      node_b:
                        type: integer
                        minimum: 1
    responses:
      '200':
        description: Evaluated/deferred result or an EVALUATION_FAILED envelope
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                results:
                  type: object
                  required: [deferred, target_type]
                  properties:
                    deferred:
                      type: boolean
                    target_type:
                      type: string
                      enum: [Float64, Int64]
                    value:
                      type: string
                      description: Precision-safe cast result; present for concrete, context-free Variable, and representative template results.
                error_code:
                  type: string
                  enum: [EVALUATION_FAILED]
      '400':
        description: Malformed request DTO
      '403':
        description: Unsafe Julia code evaluation is disabled
"""
route("/test_numeric_expression", method="POST") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  request = _parse_numeric_expression_test_request(payload)

  success, results, error = Sandbox.test_numeric_expression(
    request.expression,
    request.target_type,
    request.placement;
    context=request.context,
  )
  if success
    json(Dict(:success => true, :results => results))
  else
    json(evaluation_failure_response(error))
  end
end

########################################################

@swagger """
/test_symbolic_expression:
  post:
    summary: Evaluate a symbolic expression and return its LaTeX form
    description: |
      Parses and evaluates a symbolic expression in the server process, in a
      fresh module with QuantumSavory preloaded. The module is not a security
      sandbox. This endpoint is available only when unsafe code evaluation is
      enabled.
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            properties:
              expr:
                type: string
                description: Symbolic expression to evaluate
                example: "(Z₁⊗Z₁+Z₂⊗Z₂) / √2"
            required:
              - expr
    responses:
      '200':
        description: Expression evaluated successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
                results:
                  type: object
                  description: Evaluation results
                  properties:
                    value:
                      type: string
                      description: Stringified result of the evaluated expression
                    latex:
                      type: string
                      description: LaTeX representation of the evaluated expression
      '400':
        description: Evaluation failed
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Detailed error message
                error_type:
                  type: string
                  description: Type of error that occurred
      '403':
        description: Unsafe Julia code evaluation is disabled
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  example: Unsafe Julia code evaluation is disabled
                error_code:
                  type: string
                  example: UNSAFE_EVALUATION_DISABLED
"""
route("/test_symbolic_expression", method="POST") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())

  if !haskey(payload, "expr")
    throw(validation_error("Missing required field 'expr'", Dict("required_field" => "expr")))
  end

  expr = payload["expr"]
  require_unsafe_code_evaluation()

  success, results, error = Sandbox.test_symbolic_expression(expr)

  if success
    json(Dict(:success => true, :results => results, :message => "Expression evaluated successfully"))
  else
    json(evaluation_failure_response(error))
  end
end

########################################################

@swagger """
/platform_info:
  get:
    description: Get platform and application version information.
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                versions:
                  type: object
                  properties:
                    julia:
                      type: string
                      description: Julia version string
                      example: "1.10.4"
                    genie:
                      type: string
                      nullable: true
                      description: Installed Genie version or null if not found
                      example: "5.35.15"
                    quantumsavory:
                      type: string
                      nullable: true
                      description: Installed QuantumSavory version or null if not found
                      example: "0.3.1"
                    app:
                      type: string
                      nullable: true
                      description: Application version from Project.toml
                      example: "1.0.0"
                quantumsavory:
                  type: object
                  description: Installed QuantumSavory package and tracked-source information
                  properties:
                    version:
                      type: string
                      nullable: true
                      description: Installed QuantumSavory version
                      example: "0.7.0"
                    tracked_revision:
                      type: string
                      nullable: true
                      description: Revision tracked by Pkg, such as a branch, tag, or commit SHA
                      example: "master"
                    tracked_source:
                      type: string
                      nullable: true
                      description: Repository source tracked by Pkg
                      example: "https://github.com/QuantumSavory/QuantumSavory.jl.git"
                    tree_hash:
                      type: string
                      nullable: true
                      description: Pkg source-tree hash; this is not a commit SHA
                      example: "2592869d777da86ae854f738e23e64f99124876f"
                    commit:
                      type: string
                      nullable: true
                      description: Full commit SHA only when Pkg's tracked revision is a full SHA
                      example: null
                capabilities:
                  type: object
                  properties:
                    unsafe_code_evaluation:
                      type: boolean
                      description: Whether raw Julia code and symbolic evaluation are enabled
"""
route("/platform_info") do
  json(WebQuantumSavory.get_platform_info())
end

########################################################

@swagger """
/simulation_log_groups:
  get:
    description: Get the stable QuantumSavory log groups used to classify simulator records.
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              required:
                - simulation_log_groups
              properties:
                simulation_log_groups:
                  type: array
                  description: Canonical group identifiers sourced from QuantumSavory.LOG_GROUPS.
                  items:
                    type: string
"""
route("/simulation_log_groups", method="GET") do
  json(Dict(
    :simulation_log_groups => WebQuantumSavory.Logger.simulation_log_groups(),
  ))
end

########################################################

@swagger """
/logs/{name}:
  get:
    description: Get and optionally purge JSON-safe structured log events from a simulation. Panic records include complete exception and stacktrace details.
    parameters:
      - name: name
        in: path
        required: true
        schema:
          type: string
        description: The name of the simulation
      - name: purge
        in: query
        required: false
        schema:
          type: boolean
          default: true
        description: Whether to purge the logs after reading them
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                logs:
                  type: array
                  items:
                    type: object
                    required:
                      - id
                      - timestamp
                      - source
                      - severity
                      - message
                    properties:
                      id:
                        type: string
                        description: Stable unique record identifier
                      timestamp:
                        type: string
                        format: date-time
                        description: UTC record timestamp
                      source:
                        type: string
                        enum: [Simulator]
                        description: Normalized record source
                      severity:
                        type: string
                        enum: [debug, info, success, warning, error, panic]
                        description: Normalized severity; terminating exceptions appear once as panic, while error represents ordinary emitted error logs
                      message:
                        type: string
                        description: Complete log or exception message
                      module:
                        type: string
                        nullable: true
                        description: Module that generated the log
                      group:
                        type: string
                        nullable: true
                        description: Canonical QuantumSavory log family recovered from ordinary and hygienically renamed structured metadata; legacy records retain their original group
                      event:
                        type: string
                        nullable: true
                        description: Event identifier discovered from the emitting component; event vocabularies are extensible
                      sim_time:
                        type: number
                        format: double
                        nullable: true
                        description: Simulated time at which the record was emitted
                      sim_process_id:
                        nullable: true
                        description: ConcurrentSim process identity; oversized integer identities are exact decimal strings
                        oneOf:
                          - type: integer
                          - type: string
                            pattern: '^-?[0-9]+\$'
                      protocol:
                        type: string
                        nullable: true
                        description: Concrete protocol type associated with the record
                      nodes:
                        type: array
                        nullable: true
                        description: Ordered 1-based simulator node identities associated with the protocol
                        items:
                          oneOf:
                            - type: integer
                            - type: string
                              pattern: '^-?[0-9]+\$'
                      logging_id:
                        type: string
                        nullable: true
                        description: Optional Julia logging call-site identifier
                      summary:
                        type: string
                        nullable: true
                        description: Concise panic summary, present on panic records
                      exception_type:
                        type: string
                        nullable: true
                        description: Julia exception type, present on panic records
                      stacktrace:
                        type: string
                        nullable: true
                        description: Complete formatted stacktrace, present on panic records
                    additionalProperties: true
                    description: Event-specific logger metadata is retained as additional JSON-safe fields. Integers outside JavaScript's safe range are serialized as exact decimal strings.
                count:
                  type: integer
                  description: Number of log events returned
      '404':
        description: Simulation not found
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Error message describing the issue
"""
route("/logs/:name", method="GET") do
  simulation_name = string(params(:name))

  purge_raw = Genie.Requests.getpayload(:purge, "true")
  purge = purge_raw isa Bool ? purge_raw : (lowercase(string(purge_raw)) in ("true", "1", "yes", "on"))

  logs = WebQuantumSavory.simulation_logs(simulation_name; purge, limit=nothing)

  json(Dict(
    :success => true,
    :logs => logs,
    :count => length(logs)
  ))
end

########################################################

if WebQuantumSavory.mcp_enabled()
  function _mcp_request_payload()
    payload = Genie.Requests.jsonpayload()
    payload === nothing && return Dict{String,Any}()
    return Dict{String,Any}(string(key) => value for (key, value) in payload)
  end

  route("/_mcp/status", method="GET") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    json(Dict(
      :success => true,
      :server => WebQuantumSavory.sidecar_status(),
      :collaboration => WebQuantumSavory.collaboration_status(),
      :local_only => true,
      :start_mode => "manual",
    ))
  end

  route("/_mcp/start", method="POST") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    json(Dict(
      :success => true,
      :server => WebQuantumSavory.start_sidecar!(),
    ))
  end

  route("/_mcp/stop", method="POST") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    payload = _mcp_request_payload()
    hub = WebQuantumSavory.collaboration_hub()
    lock(hub.lock) do
      binding = hub.binding
      if binding !== nothing &&
        string(get(payload, "binding_id", "")) != binding.id
        throw(WebQuantumSavory._mcp_error(
          "EDITOR_BUSY",
          "Only the tab which owns the live editor binding can stop MCP.",
          status=409,
        ))
      end
    end
    json(Dict(
      :success => true,
      :server => WebQuantumSavory.stop_sidecar!(),
    ))
  end

  route("/_mcp/editor/bind", method="POST") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    json(Dict(
      :success => true,
      :binding => WebQuantumSavory.bind_editor!(_mcp_request_payload()),
    ))
  end

  route("/_mcp/editor/unbind", method="POST") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    json(WebQuantumSavory.unbind_editor!(_mcp_request_payload()))
  end

  route("/_mcp/editor/heartbeat", method="POST") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    json(WebQuantumSavory.heartbeat_editor!(_mcp_request_payload()))
  end

  route("/_mcp/editor/commands", method="GET") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    request = Dict{String,Any}(
      "binding_id" => string(Genie.Requests.getpayload(:binding_id, "")),
      "generation" => something(
        tryparse(Int, string(Genie.Requests.getpayload(:generation, "-1"))),
        -1,
      ),
    )
    command = WebQuantumSavory.next_browser_command!(request; timeout_seconds=20)
    json(Dict(:success => true, :command => command))
  end

  route("/_mcp/editor/commit", method="POST") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    payload = _mcp_request_payload()
    origin = string(get(payload, "origin", "mcp"))
    result = origin == "gui" ?
      WebQuantumSavory.commit_gui_snapshot!(payload) :
      WebQuantumSavory.commit_browser_command!(payload)
    json(result)
  end

  route("/_mcp/activity", method="GET") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    cursor = something(
      tryparse(Int, string(Genie.Requests.getpayload(:cursor, "0"))),
      0,
    )
    limit = something(
      tryparse(Int, string(Genie.Requests.getpayload(:limit, "100"))),
      100,
    )
    category = Genie.Requests.getpayload(:category, nothing)
    activity_status = Genie.Requests.getpayload(:status, nothing)
    json(Dict(
      :success => true,
      WebQuantumSavory.mcp_activity(
        ;
        cursor,
        limit,
        category,
        status=activity_status,
      )...,
    ))
  end

  route("/_mcp/activity/clear", method="POST") do
    WebQuantumSavory.verify_mcp_browser_origin!()
    WebQuantumSavory.clear_mcp_activity!()
    json(Dict(:success => true))
  end

  route("/_mcp/internal/ready", method="POST") do
    payload = _mcp_request_payload()
    accepted = WebQuantumSavory.sidecar_ready!(
      string(get(payload, "capability", "")),
      Int(get(payload, "port", 0)),
    )
    accepted || throw(WebQuantumSavory._mcp_error(
      "INTERNAL_ERROR",
      "Unexpected sidecar ready callback.",
      status=409,
    ))
    json(Dict(:success => true))
  end

  route("/_mcp/internal/tool", method="POST") do
    payload = _mcp_request_payload()
    WebQuantumSavory.verify_sidecar_capability!(
      string(get(payload, "capability", "")),
    )
    WebQuantumSavory.note_sidecar_request!()
    result = WebQuantumSavory.dispatch_mcp_tool!(
      string(get(payload, "tool", "")),
      get(payload, "arguments", Dict{String,Any}()),
    )
    json(Dict(:success => true, :result => result))
  end

  route("/_mcp/internal/resource", method="POST") do
    payload = _mcp_request_payload()
    WebQuantumSavory.verify_sidecar_capability!(
      string(get(payload, "capability", "")),
    )
    WebQuantumSavory.note_sidecar_request!()
    result = WebQuantumSavory.read_mcp_resource(string(get(payload, "uri", "")))
    json(Dict(:success => true, :result => result))
  end

  route("/_mcp/internal/activity", method="POST") do
    payload = _mcp_request_payload()
    WebQuantumSavory.verify_sidecar_capability!(
      string(get(payload, "capability", "")),
    )
    if string(get(payload, "category", "")) == "session" &&
      string(get(payload, "phase", "")) == "initialized"
      WebQuantumSavory.note_sidecar_session_initialized!()
    end
    WebQuantumSavory.record_mcp_activity!(
      WebQuantumSavory.collaboration_hub(),
      string(get(payload, "category", "mcp")),
      string(get(payload, "phase", "event"));
      summary=string(get(payload, "summary", "")),
      status=string(get(payload, "status", "")),
      details=get(payload, "details", Dict{String,Any}()),
    )
    json(Dict(:success => true))
  end
end

########################################################

@swagger """
/dev/manipulate_state:
  post:
    summary: Dev-only endpoint to manipulate simulation state for testing
    description: Allows modification of simulation state fields for testing purposes. Only available in dev environment.
    tags:
      - Dev
    requestBody:
      content:
        application/json:
          schema:
            type: object
            required:
              - name
            properties:
              name:
                type: string
                description: Name of the simulation
              is_running:
                type: boolean
                description: Set simulation running state
              simulation_paused:
                type: boolean
                description: Set simulation paused state
              has_run:
                type: boolean
                description: Set whether simulation has run
              simulation_progress:
                type: number
                description: Set simulation progress
              simulation_started_at:
                type: string
                nullable: true
                description: Set simulation start time
              simulation_last_active_time:
                type: string
                description: Set last active time
              block_reason:
                type: string
                enum: [timeout, autopurge]
                description: Run the real blocked-state cleanup path for lifecycle tests
    responses:
      '200':
        description: State updated successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                message:
                  type: string
                name:
                  type: string
      '400':
        description: Validation error
      '404':
        description: Simulation not found
      '500':
        description: Internal server error or not in dev mode
"""
# Dev/test-only endpoint for test support
route("/dev/manipulate_state", method="POST") do
  if !(Genie.Configuration.isdev() || Genie.Configuration.istest())
    throw(server_error("This endpoint is only available in dev or test environment"))
  end

  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  
  if !haskey(payload, "name")
    throw(validation_error("Missing required field: 'name'"))
  end

  simulation_name = payload["name"]
  WebQuantumSavory.simulation_update_for_test!(simulation_name, payload)

  json(Dict(:success => true, :message => "State updated", :name => simulation_name))
end

########################################################

info = Dict{String,Any}()
info["title"] = "WebQuantumSavory API"
info["version"] = something(WebQuantumSavory._application_version(), "unknown")
openApi = OpenAPI("3.0.0", info)
swagger_document = build(openApi)

route("/docs") do
  render_swagger(swagger_document)
end

########################################################

WebQuantumSavory.start_startup_warmup!()

########################################################

try 
  @async WebQuantumSavory.cleanup_stale_simulations() |> errormonitor
catch e
  @error "Error starting cleanup_stale_simulations" error=e
end

########################################################

end # bootstrap()

bootstrap()
