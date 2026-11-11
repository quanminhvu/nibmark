import PouchDB from 'pouchdb-browser'
import type { AnyDoc } from './types'

// Local-first: mọi dữ liệu nằm trong PouchDB (IndexedDB). Giai đoạn 2 chỉ cần
// db.sync(<CouchDB url>) là có đồng bộ, vì PouchDB nói cùng giao thức với CouchDB.
export const db = new PouchDB<AnyDoc>('nibmark', { auto_compaction: true })

type Stored<T> = T & { _rev?: string }

// Ghi tuần tự theo từng _id để không bao giờ tự gây xung đột revision.
const chains = new Map<string, Promise<unknown>>()

function enqueue<T>(id: string, task: () => Promise<T>): Promise<T> {
  const next = (chains.get(id) ?? Promise.resolve()).then(task, task)
  chains.set(
    id,
    next.catch(() => undefined)
  )
  return next
}

async function getOrNull(id: string): Promise<Stored<AnyDoc> | null> {
  try {
    return (await db.get(id)) as Stored<AnyDoc>
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null
    throw err
  }
}

export function putDoc(doc: AnyDoc): Promise<void> {
  return enqueue(doc._id, async () => {
    const current = await getOrNull(doc._id)
    await db.put({ ...doc, _rev: current?._rev } as PouchDB.Core.PutDocument<AnyDoc>)
  })
}

export function removeDoc(id: string): Promise<void> {
  return enqueue(id, async () => {
    const current = await getOrNull(id)
    if (current?._rev) await db.remove(id, current._rev)
  })
}

function strip(doc: Stored<AnyDoc>): AnyDoc {
  const { _rev: _ignored, ...rest } = doc as Stored<AnyDoc> & Record<string, unknown>
  return rest as unknown as AnyDoc
}

export async function loadAll(): Promise<AnyDoc[]> {
  const res = await db.allDocs({ include_docs: true })
  return res.rows
    .map((row) => row.doc)
    .filter((doc): doc is NonNullable<typeof doc> => !!doc && !doc._id.startsWith('_design/'))
    .map((doc) => strip(doc as Stored<AnyDoc>))
}

export function watchChanges(onChange: (id: string, doc: AnyDoc | null) => void): () => void {
  const feed = db
    .changes({ since: 'now', live: true, include_docs: true })
    .on('change', (change) => {
      if (change.deleted || !change.doc) onChange(change.id, null)
      else onChange(change.id, strip(change.doc as Stored<AnyDoc>))
    })
  return () => feed.cancel()
}
