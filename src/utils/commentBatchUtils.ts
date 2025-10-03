import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

type LoadBatchFn = (
  startIndex: number,
  batchSize: number,
  options?: { prefetchNext?: boolean },
) => Promise<unknown>

export function mergeCommentBatch<StateItem, DataItem extends StateItem>(
  startIndex: number,
  data: DataItem[],
  setState: Dispatch<SetStateAction<StateItem[]>>,
  commentsRef: MutableRefObject<StateItem[]>,
) {
  setState(prev => {
    const next = [...prev]
    data.forEach((item, offset) => {
      next[startIndex + offset] = item
    })
    commentsRef.current = next
    return next
  })
}

export function maybePrefetchNextBatch<StateItem>(
  startIndex: number,
  batchSize: number,
  totalCount: number,
  commentsRef: MutableRefObject<StateItem[]>,
  loadBatch: LoadBatchFn,
) {
  const nextStart = startIndex + batchSize
  if (totalCount <= nextStart) {
    return
  }

  const expectedSize = Math.min(batchSize, totalCount - nextStart)
  const existing = commentsRef.current.slice(nextStart, nextStart + batchSize)
  const hasGap = existing.length < expectedSize || existing.some(entry => !entry)

  if (hasGap) {
    void loadBatch(nextStart, batchSize, { prefetchNext: false })
  }
}
