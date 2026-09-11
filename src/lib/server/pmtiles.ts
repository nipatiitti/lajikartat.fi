import { EtagMismatch, PMTiles, type RangeResponse, type Source } from 'pmtiles'

// A PMTiles archive on R2, read by byte range. The header and root directory
// are fetched once per archive per isolate; tile lookups then cost one range
// read (plus a leaf directory read for large archives).
class R2Source implements Source {
  constructor(
    private readonly bucket: R2Bucket,
    private readonly key: string
  ) {}

  getKey(): string {
    return this.key
  }

  // PMTiles hands back the etag it read the header with; a republished
  // archive under the same key must not be read at the old directory offsets,
  // so the read is conditional and a mismatch makes PMTiles reload the header.
  async getBytes(offset: number, length: number, _signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
    const object = await this.bucket.get(this.key, {
      range: { offset, length },
      ...(etag ? { onlyIf: { etagMatches: etag } } : {})
    })
    if (!object) throw new Error(`R2 object missing: ${this.key}`)
    // A failed precondition yields a bare R2Object. Probe for the body method:
    // touching `body` itself consumes the stream through the dev platform proxy.
    if (typeof (object as Partial<R2ObjectBody>).arrayBuffer !== 'function')
      throw new EtagMismatch(`R2 object changed under reader: ${this.key}`)
    // Plain etag (no quotes): that is the form R2's etagMatches accepts.
    return { data: await (object as R2ObjectBody).arrayBuffer(), etag: object.etag }
  }
}

const archives = new Map<string, PMTiles>()

/** One PMTiles instance per R2 key, shared across requests of this isolate. */
export function pmtilesFor(bucket: R2Bucket, key: string): PMTiles {
  let p = archives.get(key)
  if (!p) {
    p = new PMTiles(new R2Source(bucket, key))
    archives.set(key, p)
  }
  return p
}
