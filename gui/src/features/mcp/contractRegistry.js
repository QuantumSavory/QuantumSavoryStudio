import contract from '../../../../contracts/mcp/v2/tools.json'

export const MCP_CONTRACT_VERSION = contract.contract_version
export const MCP_TOOLS = Object.freeze(contract.tools)
export const MCP_TOOL_NAMES = Object.freeze(contract.tools.map(tool => tool.name))
