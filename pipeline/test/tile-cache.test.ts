import { describe, expect, it } from 'vitest'
import { TileCache } from '../src/kernel/tile-cache'

describe('TileCache', () => {
  it('evicts the least recently used entry', async () => {
    const c = new TileCache<number>(2)
    c.set('a', 1)
    c.set('b', 2)
    c.get('a') // refresh a
    c.set('c', 3) // evicts b
    expect(c.has('a')).toBe(true)
    expect(c.has('b')).toBe(false)
    expect(c.has('c')).toBe(true)
    expect(c.size).toBe(2)
  })

  it('remembers loaded values, including null, without reloading', async () => {
    const c = new TileCache<number | null>(4)
    let loads = 0
    const load = async () => {
      loads++
      return null
    }
    expect(await c.remember('k', load)).toBeNull()
    expect(await c.remember('k', load)).toBeNull()
    expect(loads).toBe(1)
  })
})
