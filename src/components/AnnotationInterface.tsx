import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useApp } from '../contexts/AppContext'
import { supabase } from '../lib/supabase'
import CommentDisplay from './common/CommentDisplay'
import CommentNavigation from './common/CommentNavigation'
import useHotkeys from '../hooks/useHotkeys'
import { maybePrefetchNextBatch, mergeCommentBatch } from '../utils/commentBatchUtils'

interface Comment {
  id: number
  unique_comment_id: string
  context_title: string
  text: string
  likes: number
  post_url: string | null
  created_at: string
}

interface Annotation {
  id: number
  comment_id: number
  annotator_role: 'annotator1' | 'annotator2'
  sentiment: 'positive' | 'negative' | 'neutral'
  discourse_polarization: 'partisan' | 'objective' | 'non_polarized'
  created_at: string
}

const BATCH_SIZE = 100

const AnnotationInterface: React.FC = () => {
  const { currentRole } = useApp()
  const [comments, setComments] = useState<Array<Comment | null>>([])
  const [totalComments, setTotalComments] = useState(0)
  const [currentCommentIndex, setCurrentCommentIndex] = useState(0)
  const [sentiment, setSentiment] = useState<'positive' | 'negative' | 'neutral' | ''>('')
  const [discoursePolarization, setDiscoursePolarization] = useState<'partisan' | 'objective' | 'non_polarized' | ''>('')
  const [loading, setLoading] = useState(false)
  const [annotations, setAnnotations] = useState<Record<number, Annotation>>({})
  const [annotatedTotal, setAnnotatedTotal] = useState(0)
  const [annotationsLoaded, setAnnotationsLoaded] = useState(false)
  const [jumpToComment, setJumpToComment] = useState('')
  const commentSectionRef = useRef<HTMLDivElement>(null)
  const annotationSectionRef = useRef<HTMLDivElement>(null)
  const commentsRef = useRef<Array<Comment | null>>([])
  const [hasPositionedInitial, setHasPositionedInitial] = useState(false)

  useEffect(() => {
    commentsRef.current = comments
  }, [comments])

  // Equal height effect
  useEffect(() => {
    const equalizeHeights = () => {
      if (commentSectionRef.current && annotationSectionRef.current) {
        // Reset heights
        commentSectionRef.current.style.height = 'auto'
        annotationSectionRef.current.style.height = 'auto'

        // Get current heights
        const commentHeight = commentSectionRef.current.offsetHeight
        const annotationHeight = annotationSectionRef.current.offsetHeight

        // Set both to the maximum height
        const maxHeight = Math.max(commentHeight, annotationHeight)
        commentSectionRef.current.style.height = `${maxHeight}px`
        annotationSectionRef.current.style.height = `${maxHeight}px`
      }
    }

    // Run after a short delay to ensure content is rendered
    const timer = setTimeout(equalizeHeights, 100)

    // Also run on window resize
    window.addEventListener('resize', equalizeHeights)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', equalizeHeights)
    }
  }, [currentCommentIndex, sentiment, discoursePolarization]) // Re-run when content changes

  const processCommentsBatch = useCallback(
    async (startIndex: number, data: Comment[]) => {
      if (!data || data.length === 0) {
        return [] as Comment[]
      }

      mergeCommentBatch(startIndex, data, setComments, commentsRef)

      if (currentRole && currentRole !== 'adjudicator') {
        const commentIds = data.map(comment => comment.id)
        if (commentIds.length > 0) {
          const { data: annotationsData, error: annotationsError } = await supabase
            .from('annotations')
            .select('id, comment_id, annotator_role, sentiment, discourse_polarization, created_at')
            .in('comment_id', commentIds)
            .eq('annotator_role', currentRole)

          if (annotationsError) {
            console.error('Error loading annotations for batch:', annotationsError)
          } else if (annotationsData) {
            setAnnotations(prev => {
              const updated = { ...prev }
              annotationsData.forEach(annotation => {
                updated[annotation.comment_id] = annotation
              })
              return updated
            })
          }
        }
      }

      return data
    },
    [currentRole],
  )

  const loadCommentsBatch = useCallback(
    async (
      startIndex: number,
      batchSize: number = BATCH_SIZE,
      options: { prefetchNext?: boolean } = {},
    ) => {
      const { prefetchNext = true } = options
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .order('id')
        .range(startIndex, startIndex + batchSize - 1)

      if (error) {
        console.error('Error loading comments batch:', error)
        return [] as Comment[]
      }

      if (!data) {
        return [] as Comment[]
      }

      const processed = await processCommentsBatch(startIndex, data)

      if (prefetchNext) {
        maybePrefetchNextBatch(startIndex, batchSize, totalComments, commentsRef, loadCommentsBatch)
      }

      return processed
    },
    [processCommentsBatch, totalComments],
  )

  const fetchInitialData = useCallback(async () => {
    let initialIndex = 0
    let targetCommentId: number | null = null

    if (currentRole && currentRole !== 'adjudicator') {
      const { data: lastAnnotation, error: lastAnnotationError } = await supabase
        .from('annotations')
        .select('comment_id')
        .eq('annotator_role', currentRole)
        .order('comment_id', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastAnnotationError) {
        console.error('Error retrieving last annotation:', lastAnnotationError)
      }

      if (lastAnnotation?.comment_id) {
        const { data: nextComment, error: nextCommentError } = await supabase
          .from('comments')
          .select('id')
          .gt('id', lastAnnotation.comment_id)
          .order('id')
          .limit(1)
          .maybeSingle()

        if (nextCommentError) {
          console.error('Error retrieving next comment after last annotation:', nextCommentError)
        }

        targetCommentId = nextComment?.id ?? lastAnnotation.comment_id

        const { count: precedingCount, error: precedingError } = await supabase
          .from('comments')
          .select('id', { count: 'exact', head: true })
          .lt('id', targetCommentId)

        if (precedingError) {
          console.error('Error calculating comment position:', precedingError)
        } else if (typeof precedingCount === 'number') {
          initialIndex = precedingCount
        }
      }
    }

    const batchStart = Math.floor(initialIndex / BATCH_SIZE) * BATCH_SIZE
    const { data, count, error } = await supabase
      .from('comments')
      .select('*', { count: 'exact' })
      .order('id')
      .range(batchStart, batchStart + BATCH_SIZE - 1)

    if (error) {
      console.error('Error loading initial comments:', error)
      setTotalComments(0)
      setAnnotationsLoaded(true)
      return
    }

    const total = count || 0
    setTotalComments(total)

    if (currentRole && currentRole !== 'adjudicator') {
      const { count: annotatedCount, error: annotatedError } = await supabase
        .from('annotations')
        .select('comment_id', { count: 'exact', head: true })
        .eq('annotator_role', currentRole)

      if (annotatedError) {
        console.error('Error counting annotations for role:', annotatedError)
      }

      setAnnotatedTotal(annotatedCount || 0)
    } else {
      setAnnotatedTotal(0)
    }

    const clampedIndex = total > 0 ? Math.min(initialIndex, total - 1) : 0

    if (data) {
      await processCommentsBatch(batchStart, data)
      maybePrefetchNextBatch(batchStart, BATCH_SIZE, total, commentsRef, loadCommentsBatch)

      setCurrentCommentIndex(clampedIndex)
      setHasPositionedInitial(true)
    }

    setAnnotationsLoaded(true)
  }, [currentRole, loadCommentsBatch, processCommentsBatch])

  useEffect(() => {
    const loadData = async () => {
      if (!currentRole || currentRole === 'adjudicator') {
        commentsRef.current = []
        setComments([])
        setAnnotations({})
        setAnnotatedTotal(0)
        setTotalComments(0)
        setCurrentCommentIndex(0)
        setAnnotationsLoaded(false)
        setHasPositionedInitial(false)
        return
      }

      commentsRef.current = []
      setComments([])
      setAnnotations({})
      setCurrentCommentIndex(0)
      setAnnotationsLoaded(false)
      setHasPositionedInitial(false)

      await fetchInitialData()
    }

    void loadData()
  }, [currentRole, fetchInitialData])

  const findAndPositionFirstUnannotated = useCallback(async () => {
    if (!currentRole || currentRole === 'adjudicator' || totalComments === 0) {
      return false
    }

    for (let start = 0; start < totalComments; start += BATCH_SIZE) {
      const expectedSize = Math.min(BATCH_SIZE, Math.max(totalComments - start, 0))
      let batch = commentsRef.current.slice(start, start + BATCH_SIZE)
      const hasCompleteData = batch.length === expectedSize && batch.every(comment => Boolean(comment))

      if (!hasCompleteData) {
        const fetched = await loadCommentsBatch(start)
        if (fetched.length === 0) {
          continue
        }
        batch = fetched
      }

      for (let offset = 0; offset < batch.length; offset++) {
        const comment = batch[offset]
        if (comment && !annotations[comment.id]) {
          setCurrentCommentIndex(start + offset)
          return true
        }
      }
    }

    // Default to the first comment when everything is annotated
    setCurrentCommentIndex(0)
    return false
  }, [annotations, currentRole, loadCommentsBatch, totalComments])

  // Navigate to first unannotated comment when data is loaded
  useEffect(() => {
    if (!annotationsLoaded || hasPositionedInitial || !totalComments) {
      return
    }

    let isActive = true

    const position = async () => {
      const found = await findAndPositionFirstUnannotated()
      if (isActive) {
        setHasPositionedInitial(true)
        if (!found) {
          setSentiment('')
          setDiscoursePolarization('')
        }
      }
    }

    position()

    return () => {
      isActive = false
    }
  }, [annotationsLoaded, findAndPositionFirstUnannotated, hasPositionedInitial, totalComments])

  const currentComment = comments[currentCommentIndex]
  const currentAnnotation = currentComment ? annotations[currentComment.id] : null

  useEffect(() => {
    if (currentAnnotation) {
      setSentiment(currentAnnotation.sentiment)
      setDiscoursePolarization(currentAnnotation.discourse_polarization)
    } else {
      setSentiment('')
      setDiscoursePolarization('')
    }
  }, [currentAnnotation, currentCommentIndex])

  const saveAnnotation = useCallback(async () => {
    if (
      loading ||
      !currentRole ||
      currentRole === 'adjudicator' ||
      !currentComment ||
      !sentiment ||
      !discoursePolarization
    ) {
      return false
    }

    setLoading(true)
    let success = false

    try {
      if (currentAnnotation) {
        const { error } = await supabase
          .from('annotations')
          .update({
            sentiment,
            discourse_polarization: discoursePolarization,
          })
          .eq('id', currentAnnotation.id)

        if (!error) {
          setAnnotations(prev => ({
            ...prev,
            [currentComment.id]: {
              ...currentAnnotation,
              sentiment,
              discourse_polarization: discoursePolarization,
            }
          }))
          success = true
        }
      } else {
        const { data, error } = await supabase
          .from('annotations')
          .insert([{
            comment_id: currentComment.id,
            annotator_role: currentRole,
            sentiment,
            discourse_polarization: discoursePolarization,
          }])
          .select()
          .single()

        if (!error && data) {
          setAnnotations(prev => ({
            ...prev,
            [currentComment.id]: data
          }))
          setAnnotatedTotal(prev => prev + 1)
          success = true
        }
      }
    } catch (error) {
      console.error('Error saving annotation:', error)
    }

    setLoading(false)
    return success
  }, [currentAnnotation, currentComment, currentRole, discoursePolarization, loading, sentiment])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await saveAnnotation()
  }

  const goToNext = useCallback(async () => {
    if (currentCommentIndex < totalComments - 1) {
      const nextIndex = currentCommentIndex + 1

      if (!commentsRef.current[nextIndex]) {
        const batchStart = Math.floor(nextIndex / BATCH_SIZE) * BATCH_SIZE
        await loadCommentsBatch(batchStart)
      }

      setCurrentCommentIndex(nextIndex)
    }
  }, [currentCommentIndex, loadCommentsBatch, totalComments])

  const goToPrevious = useCallback(() => {
    if (currentCommentIndex > 0) {
      setCurrentCommentIndex(currentCommentIndex - 1)
    }
  }, [currentCommentIndex])

  const goToNextUnannotated = useCallback(async () => {
    // Look in loaded comments first
    const commentsSnapshot = commentsRef.current
    const nextUnannotatedIndex = commentsSnapshot.findIndex((comment, index) =>
      index > currentCommentIndex && comment && !annotations[comment.id]
    )

    if (nextUnannotatedIndex !== -1) {
      setCurrentCommentIndex(nextUnannotatedIndex)
    } else {
      // If not found in loaded comments, load next batch and search
      const nextBatchStart = Math.floor((currentCommentIndex + 1) / BATCH_SIZE) * BATCH_SIZE
      if (nextBatchStart < totalComments) {
        await loadCommentsBatch(nextBatchStart)
        // Retry search after loading
        const updatedSnapshot = commentsRef.current
        const retryIndex = updatedSnapshot.findIndex((comment, index) =>
          index > currentCommentIndex && comment && !annotations[comment.id]
        )
        if (retryIndex !== -1) {
          setCurrentCommentIndex(retryIndex)
        }
      }
    }
  }, [annotations, currentCommentIndex, loadCommentsBatch, totalComments])

  const handleJumpToComment = useCallback(async () => {
    const commentNumber = parseInt(jumpToComment)
    if (commentNumber && commentNumber >= 1 && commentNumber <= totalComments) {
      const targetIndex = commentNumber - 1

      // Load comment if not already loaded
      if (!commentsRef.current[targetIndex]) {
        const batchStart = Math.floor(targetIndex / BATCH_SIZE) * BATCH_SIZE
        await loadCommentsBatch(batchStart)
      }

      setCurrentCommentIndex(targetIndex)
      setJumpToComment('')
    }
  }, [jumpToComment, loadCommentsBatch, totalComments])

  const clearAnnotation = useCallback(async () => {
    if (loading || !currentComment || !currentAnnotation) return

    setLoading(true)
    try {
      const { error } = await supabase
        .from('annotations')
        .delete()
        .eq('id', currentAnnotation.id)

      if (!error) {
        const newAnnotations = { ...annotations }
        delete newAnnotations[currentComment.id]
        setAnnotations(newAnnotations)
        setAnnotatedTotal(prev => (prev > 0 ? prev - 1 : 0))
        setSentiment('')
        setDiscoursePolarization('')
      }
    } catch (error) {
      console.error('Error clearing annotation:', error)
    }
    setLoading(false)
  }, [annotations, currentAnnotation, currentComment, loading])

  const progress = totalComments > 0 ? (annotatedTotal / totalComments) * 100 : 0

  const hotkeys = useMemo(
    () => [
      { key: '1', handler: () => setSentiment('positive') },
      { key: '2', handler: () => setSentiment('negative') },
      { key: '3', handler: () => setSentiment('neutral') },
      { key: 'q', handler: () => setDiscoursePolarization('partisan') },
      { key: 'w', handler: () => setDiscoursePolarization('objective') },
      { key: 'e', handler: () => setDiscoursePolarization('non_polarized') },
      {
        key: 'Enter',
        ctrl: true,
        preventDefault: true,
        handler: () => {
          void (async () => {
            const saved = await saveAnnotation()
            if (saved) {
              await goToNext()
            }
          })()
        },
      },
      {
        key: 'Enter',
        meta: true,
        preventDefault: true,
        handler: () => {
          void (async () => {
            const saved = await saveAnnotation()
            if (saved) {
              await goToNext()
            }
          })()
        },
      },
      {
        key: 'ArrowRight',
        alt: true,
        preventDefault: true,
        handler: () => {
          void goToNext()
        },
      },
      {
        key: 'ArrowLeft',
        alt: true,
        preventDefault: true,
        handler: () => {
          goToPrevious()
        },
      },
      {
        key: 'u',
        alt: true,
        handler: () => {
          void goToNextUnannotated()
        },
      },
      {
        key: 'c',
        shift: true,
        preventDefault: true,
        handler: () => {
          void clearAnnotation()
        },
      },
    ],
    [
      clearAnnotation,
      goToNext,
      goToNextUnannotated,
      goToPrevious,
      saveAnnotation,
      setDiscoursePolarization,
      setSentiment,
    ],
  )

  useHotkeys(hotkeys)

  if (!currentComment) {
    return <div>No comments available for annotation.</div>
  }

  return (
    <div className="annotation-interface">
      <div className="header">
        <h2>Annotation Interface - {currentRole}</h2>
        <div className="progress">
          Progress: {annotatedTotal}/{totalComments} ({progress.toFixed(1)}%)
        </div>
      </div>

      <CommentNavigation
        currentIndex={currentCommentIndex}
        totalCount={totalComments}
        onPrevious={goToPrevious}
        disablePrevious={currentCommentIndex === 0}
        onNext={goToNext}
        disableNext={currentCommentIndex === totalComments - 1}
        jumpValue={jumpToComment}
        onJumpChange={(value) => setJumpToComment(value)}
        onJumpSubmit={handleJumpToComment}
        jumpMax={totalComments}
        extraCenter={
          currentAnnotation ? <span className="annotated-badge">✓ Annotated</span> : undefined
        }
        extraRight={
          <button
            type="button"
            onClick={goToNextUnannotated}
            disabled={false}
            className="next-unannotated"
          >
            Next Unannotated
          </button>
        }
      />

      <div className="shortcut-hints">
        <span>
          Shortcuts: 1/2/3 sentiment, Q/W/E discourse, Alt/Option + ←/→ navigate,
          Ctrl/Cmd + Enter save, Shift + C clear.
        </span>
      </div>

      <div className="annotation-layout">
        <div className="comment-section" ref={commentSectionRef}>
          <CommentDisplay
            contextTitle={currentComment.context_title}
            uniqueId={currentComment.unique_comment_id}
            likes={currentComment.likes}
            postUrl={currentComment.post_url}
            commentText={currentComment.text}
            commentHeading="Comment to Annotate:"
          />
        </div>

        <div className="annotation-section" ref={annotationSectionRef}>
          <form onSubmit={handleSubmit} className="annotation-form">
            <div className="form-section">
              <h4>Sentiment Polarity</h4>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    name="sentiment"
                    value="positive"
                    checked={sentiment === 'positive'}
                    onChange={(e) => setSentiment(e.target.value as 'positive')}
                  />
                  <strong>Positive</strong> - Expresses approval, support, praise, or optimism
                </label>
                <label>
                  <input
                    type="radio"
                    name="sentiment"
                    value="negative"
                    checked={sentiment === 'negative'}
                    onChange={(e) => setSentiment(e.target.value as 'negative')}
                  />
                  <strong>Negative</strong> - Expresses disapproval, criticism, anger, or pessimism
                </label>
                <label>
                  <input
                    type="radio"
                    name="sentiment"
                    value="neutral"
                    checked={sentiment === 'neutral'}
                    onChange={(e) => setSentiment(e.target.value as 'neutral')}
                  />
                  <strong>Neutral</strong> - Factual statements, questions, or balanced observations
                </label>
              </div>
            </div>

            <div className="form-section">
              <h4>Discourse Polarization</h4>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    name="discoursePolarization"
                    value="partisan"
                    checked={discoursePolarization === 'partisan'}
                    onChange={(e) => setDiscoursePolarization(e.target.value as 'partisan')}
                  />
                  <strong>Partisan</strong> - Uses divisive language, extreme viewpoints, us-vs-them framing
                </label>
                <label>
                  <input
                    type="radio"
                    name="discoursePolarization"
                    value="objective"
                    checked={discoursePolarization === 'objective'}
                    onChange={(e) => setDiscoursePolarization(e.target.value as 'objective')}
                  />
                  <strong>Objective</strong> - Presents balanced views, uses factual language
                </label>
                <label>
                  <input
                    type="radio"
                    name="discoursePolarization"
                    value="non_polarized"
                    checked={discoursePolarization === 'non_polarized'}
                    onChange={(e) => setDiscoursePolarization(e.target.value as 'non_polarized')}
                  />
                  <strong>Non-Polarized</strong> - No political opinion, factual questions, off-topic
                </label>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                disabled={loading || !sentiment || !discoursePolarization}
                className="submit-annotation"
              >
                {loading ? 'Saving...' : currentAnnotation ? 'Update Annotation' : 'Save Annotation'}
              </button>

              {currentAnnotation && (
                <button
                  type="button"
                  onClick={clearAnnotation}
                  disabled={loading}
                  className="clear-annotation"
                >
                  {loading ? 'Clearing...' : 'Clear Annotation'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default AnnotationInterface
