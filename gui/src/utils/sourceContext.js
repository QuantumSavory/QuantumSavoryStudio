const contextualKeywordDefinitions = [
  {
    id: 'nodeid',
    syntax: 'nodeid("Node name")',
    description: 'Returns the one-based simulator ID of the node with that exact name.',
    availability: 'Available in node, edge, and floating protocol source.',
    recommendation: 'Use unique node names.'
  },
  {
    id: 'self',
    syntax: 'self',
    description: 'The one-based simulator ID of the current node.',
    availability: 'Available only when the source is assigned to a node protocol.'
  },
  {
    id: 'distance',
    syntax: 'distance',
    description: 'The resolved route or overridden physical-edge distance in meters.',
    availability: 'Available only for edge protocol source; it is nothing on virtual edges.'
  },
  {
    id: 'delay',
    syntax: 'delay',
    description: 'The resolved physical-edge propagation delay in seconds.',
    availability: 'Available only for edge protocol source; it is nothing on virtual edges.'
  },
  {
    id: 'refractive_index',
    syntax: 'refractive_index',
    description: 'The resolved physical-edge refractive index.',
    availability: 'Available only for edge protocol source; it is nothing on virtual edges.'
  },
  {
    id: 'loss',
    syntax: 'loss',
    description: 'The resolved physical-edge fiber loss in dB/km.',
    availability: 'Available only for edge protocol source; it is nothing on virtual edges.'
  },
  {
    id: 'transmissivity',
    syntax: 'transmissivity',
    description: 'The resolved dimensionless physical-edge transmissivity from zero through one.',
    availability: 'Available only for edge protocol source; it is nothing on virtual edges.'
  },
  {
    id: 'node_a',
    syntax: 'node_a',
    description: 'The one-based simulator ID of the edge source endpoint.',
    availability: 'Available only for edge protocol source.'
  },
  {
    id: 'node_b',
    syntax: 'node_b',
    description: 'The one-based simulator ID of the edge target endpoint.',
    availability: 'Available only for edge protocol source.'
  }
]

export const SOURCE_CONTEXT_KEYWORDS = Object.freeze(
  contextualKeywordDefinitions.map(keyword => Object.freeze(keyword))
)

export const SOURCE_CONTEXT_BY_ID = Object.freeze(
  Object.fromEntries(SOURCE_CONTEXT_KEYWORDS.map(keyword => [keyword.id, keyword]))
)
