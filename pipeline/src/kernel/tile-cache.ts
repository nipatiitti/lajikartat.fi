/** Small LRU for parsed tiles: neighbouring tiles share most of their skirts. */
export class TileCache<T> {
  #entries = new Map<string, T>()

  constructor(private readonly maxEntries: number) {}

  has(key: string): boolean {
    return this.#entries.has(key)
  }

  get(key: string): T | undefined {
    if (!this.#entries.has(key)) return undefined
    const v = this.#entries.get(key) as T
    this.#entries.delete(key) // refresh recency
    this.#entries.set(key, v)
    return v
  }

  set(key: string, value: T): void {
    this.#entries.delete(key)
    this.#entries.set(key, value)
    if (this.#entries.size > this.maxEntries) {
      const oldest = this.#entries.keys().next().value
      if (oldest !== undefined) this.#entries.delete(oldest)
    }
  }

  /** Cached value, or `load()` stored under the key. */
  async remember(key: string, load: () => Promise<T>): Promise<T> {
    if (this.#entries.has(key)) return this.get(key) as T
    const v = await load()
    this.set(key, v)
    return v
  }

  get size(): number {
    return this.#entries.size
  }
}
