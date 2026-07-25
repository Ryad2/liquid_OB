import { BigInt } from '@graphprotocol/graph-ts'
import { assert, describe, test } from 'matchstick-as/assembly/index'

import { decodeStrategy } from '../src/decoder'
import { BASE, MAKER, QUOTE, buildStrategy } from './fixtures'

describe('canonical strategy decoder', () => {
  test('decodes the payload prefixed SwapVM order', () => {
    const decoded = decodeStrategy(buildStrategy())
    assert.assertNotNull(decoded)
    if (decoded === null) return

    assert.addressEquals(decoded.maker, MAKER)
    assert.addressEquals(decoded.baseToken, BASE)
    assert.addressEquals(decoded.quoteToken, QUOTE)
    assert.bigIntEquals(decoded.sell.startPrice, BigInt.fromString('100000000000000000000'))
    assert.bigIntEquals(decoded.sell.initialReserve, BigInt.fromString('5000000000000000000'))
    assert.bigIntEquals(decoded.buy.startPrice, BigInt.fromString('99000000000000000000'))
    assert.bigIntEquals(decoded.buy.initialReserve, BigInt.fromString('500000000000000000000'))
  })
})
