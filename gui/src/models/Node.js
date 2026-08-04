import Slot from './Slot'
import { generateUUid } from '../utils/Utils'
import { isMapPosition } from '../utils/mapCoordinates'
/**
 * Represents a node in the map
 */
export default class Node {
  /**
   * Create a new node
   * @param {Object} options - Node options
   * @param {string} options.id - Unique identifier for the node
   * @param {string} options.name - Display name of the node
   * @param {Array<number>} options.position - [longitude, latitude] coordinates
   * @param {Object} [options.data={}] - Additional data associated with the node
   */
  constructor({ id, name, position, data = {} }) {
    if (!id || !isMapPosition(position)) {
      throw new Error('Node requires id and valid position [longitude, latitude]')
    }

    this.id = id
    this.name = name || `Node ${id}`
    this.position = [...position] // Clone to prevent external mutations
    this.data = {
      type: 'City',
      slots: [],
      protocols: [],
      ...data,
    }
  }

  addSlot(slot){
    this.data.slots.push(slot)
  }
  
  createNewSlot(){
    const slot = new Slot({
      id: generateUUid('slot'),
      type: 'Qubit'
    })
    this.addSlot(slot)
    return slot
  }

  /**
   * Update node position
   * @param {Array<number>} newPosition - New [longitude, latitude] coordinates
   * @returns {boolean} - Success status
   */
  updatePosition(newPosition) {
    if (!isMapPosition(newPosition)) {
      console.error('Invalid coordinates for the supported Web Mercator map area')
      return false
    }

    this.position = [...newPosition]
    return true
  }

  /**
   * Get node position
   * @returns {Array<number>} - [longitude, latitude] coordinates
   */
  getPosition() {
    return [...this.position] // Return copy to prevent external mutations
  }

  /**
   * Update node data
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
   * Convert node to a plain object
   * @returns {Object} - Plain object representation of the node
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      position: [...this.position],
      data: { ...this.data }
    }
  }
}
