import { RESOLVED_PHYSICAL_EDGE_FIELDS } from '../utils/physicalParameters.js'

/**
 * Represents an edge (connection) between two nodes
 */
export default class Edge {
  /**
   * Create a new edge
   * @param {Object} options - Edge options
   * @param {string} options.id - Unique identifier for the edge
   * @param {Object} options.source - Source node
   * @param {Object} options.target - Target node
   * @param {Object} [options.data={}] - Additional data associated with the edge
   * @param {boolean} [options.isLogic=false] - Whether the edge is a logic edge
   */
  constructor({ id, source, target, data = {}, isLogic = false }) {
    if (!id || !source || !target) {
      throw new Error('Edge requires id, source node, and target node')
    }

    this.id = id
    this.source = source
    this.target = target
    this.data = {
      type: 'connection',
      protocols: [],
      ...data,
    }
    this.isLogic = isLogic
    if (this.isLogic) {
      delete this.data.curvePoints
      delete this.data.physicalOverrides
      RESOLVED_PHYSICAL_EDGE_FIELDS.forEach(field => delete this.data[field])
    } else {
      this.data.curvePoints = Array.isArray(this.data.curvePoints)
        ? this.data.curvePoints
        : []
      this.data.physicalOverrides = this.data.physicalOverrides ?? null
    }
  }

  /**
   * Get the coordinates for drawing the edge line
   * @returns {Array<Array<number>>} Array of [longitude, latitude] pairs
   */
  getCoordinates() {
    return [
      this.source.getPosition(),
      this.target.getPosition()
    ]
  }

  /**
   * Check if a node is part of this edge
   * @param {Object} node - Node to check
   * @returns {boolean} True if the node is either source or target
   */
  hasNode(node) {
    return this.source.id === node.id || this.target.id === node.id
  }

  /**
   * Update edge data
   * @param {Object} newData - Data to merge with existing data
   */
  updateData(newData) {
    if (typeof newData !== 'object') {
      console.error('Data must be an object')
      return
    }
    this.data = { ...this.data, ...newData }
  }

  /**
   * Convert edge to a plain object
   * @returns {Object} Plain object representation of the edge
   */
  toJSON() {
    return {
      id: this.id,
      source: this.source.id,
      target: this.target.id,
      isLogic: this.isLogic,
      data: { ...this.data }
    }
  }
}
