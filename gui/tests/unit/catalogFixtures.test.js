import { describe, expect, it } from 'vitest'

import {
  validateConstructorParameterMetadata,
  validateSlotTypeCatalog,
} from '../../src/utils/ApiConnector.js'
import { SLOT_TYPE_CATALOG, constructorField } from '../catalogFixtures.js'

describe('exact runtime catalog fixtures', () => {
  it('stays admissible through the production catalog validators', () => {
    const ordinary = constructorField({ field: 'rounds', type: 'Int64' })
    const namedTag = constructorField({
      field: 'tag',
      type: 'Type{<:QuantumSavory.AbstractTag}',
      kind: 'named_tag_type',
      nullable: false,
    })

    expect(validateConstructorParameterMetadata(ordinary, 'ordinary')).toEqual(ordinary)
    expect(validateConstructorParameterMetadata(namedTag, 'named_tag')).toEqual(namedTag)
    expect(validateSlotTypeCatalog(SLOT_TYPE_CATALOG)).toEqual(SLOT_TYPE_CATALOG)
  })
})
