import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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

interface FinalAnnotation {
  id: number
  comment_id: number
  final_sentiment: 'positive' | 'negative' | 'neutral'
  final_discourse_polarization: 'partisan' | 'objective' | 'non_polarized'
  created_at: string
}

const BATCH_SIZE = 100

const AdjudicatorInterface: React.FC = () => {
  const [comments, setComments] = useState<Comment[]>([])
  const [totalComments, setTotalComments] = useState(0)
  const [annotations, setAnnotations] = useState<Record<number, Annotation[]>>({})
  const [finalAnnotations, setFinalAnnotations] = useState<Record<number, FinalAnnotation>>({})
  const [finalizedTotal, setFinalizedTotal] = useState(0)
  const [currentCommentIndex, setCurrentCommentIndex] = useState(0)
  const [finalSentiment, setFinalSentiment] = useState<'positive' | 'negative' | 'neutral' | ''>('')
  const [finalDiscoursePolarization, setFinalDiscoursePolarization] = useState<'partisan' | 'objective' | 'non_polarized' | ''>('')
  const [loading, setLoading] = useState(false)
  const [jumpToComment, setJumpToComment] = useState('')
  // Prevent auto-positioning from overriding user navigation
  const [hasAutoPositioned, setHasAutoPositioned] = useState(false)
  const commentsRef = useRef<Comment[]>([])

  useEffect(() => {
    commentsRef.current = comments
  }, [comments])

  const hasDisagreement = (annotations: Annotation[]) => {
    if (annotations.length < 2) return false
    const sentiment1 = annotations[0]?.sentiment
    const sentiment2 = annotations[1]?.sentiment
    const discourse1 = annotations[0]?.discourse_polarization
    const discourse2 = annotations[1]?.discourse_polarization

    return sentiment1 !== sentiment2 || discourse1 !== discourse2
  }

  // Auto-position once on initial load so it doesn't block manual back/jump
  useEffect(() => {
    if (hasAutoPositioned || totalComments === 0 || comments.length === 0) {
      return
    }

    const currentComment = comments[currentCommentIndex]
    const currentAnnotations = currentComment ? annotations[currentComment.id] || [] : []
    const currentFinalAnnotation = currentComment ? finalAnnotations[currentComment.id] : undefined
    const currentNeedsAdjudication = !!currentComment && currentAnnotations.length === 2 && !currentFinalAnnotation

    if (currentNeedsAdjudication) {
      setHasAutoPositioned(true)
      return
    }

    const firstDisagreementIndex = comments.findIndex(comment => {
      if (!comment) return false
      const commentAnnotations = annotations[comment.id] || []
      const hasFinal = finalAnnotations[comment.id]
      if (commentAnnotations.length !== 2 || hasFinal) {
        return false
      }
      return hasDisagreement(commentAnnotations)
    })

    if (firstDisagreementIndex !== -1 && firstDisagreementIndex !== currentCommentIndex) {
      setCurrentCommentIndex(firstDisagreementIndex)
      setHasAutoPositioned(true)
      return
    }

    const firstUnfinishedIndex = comments.findIndex(comment => {
      if (!comment) return false
      const commentAnnotations = annotations[comment.id] || []
      return commentAnnotations.length === 2 && !finalAnnotations[comment.id]
    })

    if (firstUnfinishedIndex !== -1 && firstUnfinishedIndex !== currentCommentIndex) {
      setCurrentCommentIndex(firstUnfinishedIndex)
    }
    setHasAutoPositioned(true)
  }, [annotations, comments, finalAnnotations, totalComments, currentCommentIndex, hasAutoPositioned])

  const processCommentsBatch = useCallback(
    async (startIndex: number, data: Comment[]) => {
      if (!data || data.length === 0) {
        return [] as Comment[]
      }

      mergeCommentBatch(startIndex, data, setComments, commentsRef)

      const commentIds = data.map(comment => comment.id)
      if (commentIds.length > 0) {
        const [
          { data: annotationsData, error: annotationsError },
          { data: finalsData, error: finalsError },
        ] = await Promise.all([
          supabase
            .from('annotations')
            .select('id, comment_id, annotator_role, sentiment, discourse_polarization, created_at')
            .in('comment_id', commentIds)
            .order('comment_id, annotator_role'),
          supabase
            .from('final_annotations')
            .select('id, comment_id, final_sentiment, final_discourse_polarization, created_at')
            .in('comment_id', commentIds),
        ])

        if (annotationsError) {
          console.error('Adjudicator error loading annotations batch:', annotationsError)
        } else if (annotationsData) {
          const grouped = annotationsData.reduce((acc, annotation) => {
            if (!acc[annotation.comment_id]) {
              acc[annotation.comment_id] = []
            }
            acc[annotation.comment_id].push(annotation)
            return acc
          }, {} as Record<number, Annotation[]>)

          setAnnotations(prev => {
            const updated = { ...prev }
            commentIds.forEach(id => {
              if (grouped[id] && grouped[id].length > 0) {
                updated[id] = grouped[id]
              } else {
                delete updated[id]
              }
            })
            return updated
          })
        }

        if (finalsError) {
          console.error('Adjudicator error loading final annotations batch:', finalsError)
        } else if (finalsData) {
          setFinalAnnotations(prev => {
            const updated = { ...prev }
            finalsData.forEach(finalAnnotation => {
              updated[finalAnnotation.comment_id] = finalAnnotation
            })
            return updated
          })
        }
      }

      return data
    },
    [],
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
        console.error('Adjudicator error loading comments batch:', error)
        return
      }

      if (data) {
        await processCommentsBatch(startIndex, data)

        if (prefetchNext) {
          maybePrefetchNextBatch(startIndex, batchSize, totalComments, commentsRef, loadCommentsBatch)
        }
      }
    },
    [processCommentsBatch, totalComments],
  )

  const fetchInitialData = useCallback(async () => {
    let initialIndex = 0
    let targetCommentId: number | null = null

    const { data: lastFinal, error: lastFinalError } = await supabase
      .from('final_annotations')
      .select('comment_id')
      .order('comment_id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastFinalError) {
      console.error('Error retrieving last adjudicated comment:', lastFinalError)
    }

    if (lastFinal?.comment_id) {
      const { data: nextComment, error: nextCommentError } = await supabase
        .from('comments')
        .select('id')
        .gt('id', lastFinal.comment_id)
        .order('id')
        .limit(1)
        .maybeSingle()

      if (nextCommentError) {
        console.error('Error retrieving next comment after last adjudication:', nextCommentError)
      }

      targetCommentId = nextComment?.id ?? lastFinal.comment_id

      const { count: precedingCount, error: precedingError } = await supabase
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .lt('id', targetCommentId)

      if (precedingError) {
        console.error('Error calculating adjudication resume position:', precedingError)
      } else if (typeof precedingCount === 'number') {
        initialIndex = precedingCount
      }
    }

    const batchStart = Math.floor(initialIndex / BATCH_SIZE) * BATCH_SIZE

    const { data, count, error } = await supabase
      .from('comments')
      .select('*', { count: 'exact' })
      .order('id')
      .range(batchStart, batchStart + BATCH_SIZE - 1)

    if (error) {
      console.error('Adjudicator error loading initial comments:', error)
      setTotalComments(0)
      return
    }

    const total = count || 0
    setTotalComments(total)

    const { count: completedCount, error: completedError } = await supabase
      .from('final_annotations')
      .select('comment_id', { count: 'exact', head: true })

    if (completedError) {
      console.error('Error counting adjudicated comments:', completedError)
    }

    setFinalizedTotal(completedCount || 0)
    console.log('Adjudicator - Total comments in database:', count)

    const clampedIndex = total > 0 ? Math.min(initialIndex, total - 1) : 0

    if (data) {
      await processCommentsBatch(batchStart, data)
      maybePrefetchNextBatch(batchStart, BATCH_SIZE, total, commentsRef, loadCommentsBatch)
      setCurrentCommentIndex(clampedIndex)
    }
  }, [loadCommentsBatch, processCommentsBatch])

  useEffect(() => {
    const load = async () => {
      await fetchInitialData()
    }
    void load()
  }, [fetchInitialData])

  const currentComment = comments[currentCommentIndex]
  const currentAnnotations = currentComment ? annotations[currentComment.id] || [] : []
  const currentFinalAnnotation = currentComment ? finalAnnotations[currentComment.id] : null

  useEffect(() => {
    if (currentFinalAnnotation) {
      setFinalSentiment(currentFinalAnnotation.final_sentiment)
      setFinalDiscoursePolarization(currentFinalAnnotation.final_discourse_polarization)
      return
    }

    if (currentAnnotations.length === 2) {
      const [first, second] = currentAnnotations

      if (first.sentiment === second.sentiment) {
        setFinalSentiment(first.sentiment)
      } else {
        setFinalSentiment('')
      }

      if (first.discourse_polarization === second.discourse_polarization) {
        setFinalDiscoursePolarization(first.discourse_polarization)
      } else {
        setFinalDiscoursePolarization('')
      }
    } else {
      setFinalSentiment('')
      setFinalDiscoursePolarization('')
    }
  }, [currentAnnotations, currentCommentIndex, currentFinalAnnotation])

  const saveFinalDecision = useCallback(async () => {
    if (loading || !currentComment || !finalSentiment || !finalDiscoursePolarization) {
      return false
    }

    setLoading(true)
    let success = false

    try {
      if (currentFinalAnnotation) {
        const { error } = await supabase
          .from('final_annotations')
          .update({
            final_sentiment: finalSentiment,
            final_discourse_polarization: finalDiscoursePolarization,
          })
          .eq('id', currentFinalAnnotation.id)

        if (!error) {
          setFinalAnnotations(prev => ({
            ...prev,
            [currentComment.id]: {
              ...currentFinalAnnotation,
              final_sentiment: finalSentiment,
              final_discourse_polarization: finalDiscoursePolarization,
            }
          }))
          success = true
        }
      } else {
        const { data, error } = await supabase
          .from('final_annotations')
          .insert([{
            comment_id: currentComment.id,
            final_sentiment: finalSentiment,
            final_discourse_polarization: finalDiscoursePolarization,
          }])
          .select()
          .single()

        if (!error && data) {
          setFinalAnnotations(prev => ({
            ...prev,
            [currentComment.id]: data
          }))
          setFinalizedTotal(prev => prev + 1)
          success = true
        }
      }
    } catch (error) {
      console.error('Error saving final annotation:', error)
    }

    setLoading(false)
    return success
  }, [currentComment, currentFinalAnnotation, finalDiscoursePolarization, finalSentiment, loading])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await saveFinalDecision()
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

  const handleJumpToComment = useCallback(async () => {
    const commentNumber = parseInt(jumpToComment)
    if (commentNumber && commentNumber >= 1 && commentNumber <= totalComments) {
      const targetIndex = commentNumber - 1

      if (!commentsRef.current[targetIndex]) {
        const batchStart = Math.floor(targetIndex / BATCH_SIZE) * BATCH_SIZE
        await loadCommentsBatch(batchStart)
      }

      setCurrentCommentIndex(targetIndex)
      setJumpToComment('')
    }
  }, [jumpToComment, loadCommentsBatch, totalComments])

  const progress = totalComments > 0 ? (finalizedTotal / totalComments) * 100 : 0

  const hotkeys = useMemo(
    () => [
      { key: '1', handler: () => setFinalSentiment('positive') },
      { key: '2', handler: () => setFinalSentiment('negative') },
      { key: '3', handler: () => setFinalSentiment('neutral') },
      { key: 'q', handler: () => setFinalDiscoursePolarization('partisan') },
      { key: 'w', handler: () => setFinalDiscoursePolarization('objective') },
      { key: 'e', handler: () => setFinalDiscoursePolarization('non_polarized') },
      {
        key: 'Enter',
        ctrl: true,
        preventDefault: true,
        handler: () => {
          void (async () => {
            const saved = await saveFinalDecision()
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
            const saved = await saveFinalDecision()
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
    ],
    [goToNext, goToPrevious, saveFinalDecision, setFinalDiscoursePolarization, setFinalSentiment],
  )

  useHotkeys(hotkeys)

  if (comments.length === 0 && totalComments === 0) {
    // No adjudication data at all
    return (
      <div className="empty-state">No comments available for adjudication.</div>
    )
  }

  if (comments.length === 0 && totalComments > 0) {
    return (
      <div className="loading-state">
        <div className="loading-spinner" role="status" aria-label="Loading comments" />
      </div>
    )
  }

  if (!currentComment) {
    return <div>No comments available for adjudication.</div>
  }

  return (
    <div className="adjudicator-interface">
      <div className="header">
        <h2>Adjudicator Interface</h2>
        <div className="progress">
          Progress: {finalizedTotal}/{totalComments} ({progress.toFixed(1)}%)
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
      />

      <div className="shortcut-hints">
        <span>
          Shortcuts: 1/2/3 sentiment, Q/W/E discourse, Alt/Option+←/→ navigate, Ctrl/Cmd+Enter save.
        </span>
      </div>

      <div className="adjudication-layout">
        <div className="comment-section">
          <CommentDisplay
            contextTitle={currentComment.context_title}
            uniqueId={currentComment.unique_comment_id}
            likes={currentComment.likes}
            postUrl={currentComment.post_url}
            commentText={currentComment.text}
            commentHeading="Comment to Adjudicate:"
          />

          <div className="annotations-comparison">
            <h3>Annotator Responses {hasDisagreement(currentAnnotations) && <span className="disagreement">⚠️ Disagreement</span>}</h3>
            <div className="annotators-grid">
              {currentAnnotations.map((annotation) => (
                <div key={annotation.id} className="annotator-response">
                  <h4>{annotation.annotator_role}</h4>
                  <p><strong>Sentiment:</strong> {annotation.sentiment}</p>
                  <p><strong>Discourse:</strong> {annotation.discourse_polarization}</p>
                </div>
              ))}
              {currentAnnotations.length < 2 && (
                <div className="missing-annotations">
                  Not all annotators have completed this comment yet.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="adjudication-section">
          <form onSubmit={handleSubmit} className="final-annotation-form">
            <div className="form-section">
              <h4>Final Sentiment Decision</h4>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    name="finalSentiment"
                    value="positive"
                    checked={finalSentiment === 'positive'}
                    onChange={(e) => setFinalSentiment(e.target.value as 'positive')}
                  />
                  <strong>Positive</strong> - Expresses approval, support, praise, or optimism
                </label>
                <label>
                  <input
                    type="radio"
                    name="finalSentiment"
                    value="negative"
                    checked={finalSentiment === 'negative'}
                    onChange={(e) => setFinalSentiment(e.target.value as 'negative')}
                  />
                  <strong>Negative</strong> - Expresses disapproval, criticism, anger, or pessimism
                </label>
                <label>
                  <input
                    type="radio"
                    name="finalSentiment"
                    value="neutral"
                    checked={finalSentiment === 'neutral'}
                    onChange={(e) => setFinalSentiment(e.target.value as 'neutral')}
                  />
                  <strong>Neutral</strong> - Factual statements, questions, or balanced observations
                </label>
              </div>
            </div>

            <div className="form-section">
              <h4>Final Discourse Polarization Decision</h4>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    name="finalDiscoursePolarization"
                    value="partisan"
                    checked={finalDiscoursePolarization === 'partisan'}
                    onChange={(e) => setFinalDiscoursePolarization(e.target.value as 'partisan')}
                  />
                  <strong>Partisan</strong> - Uses divisive language, extreme viewpoints, us-vs-them framing
                </label>
                <label>
                  <input
                    type="radio"
                    name="finalDiscoursePolarization"
                    value="objective"
                    checked={finalDiscoursePolarization === 'objective'}
                    onChange={(e) => setFinalDiscoursePolarization(e.target.value as 'objective')}
                  />
                  <strong>Objective</strong> - Presents balanced views, uses factual language
                </label>
                <label>
                  <input
                    type="radio"
                    name="finalDiscoursePolarization"
                    value="non_polarized"
                    checked={finalDiscoursePolarization === 'non_polarized'}
                    onChange={(e) => setFinalDiscoursePolarization(e.target.value as 'non_polarized')}
                  />
                  <strong>Non-Polarized</strong> - No political opinion, factual questions, off-topic
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !finalSentiment || !finalDiscoursePolarization}
              className="submit-final"
            >
              {loading ? 'Saving...' : currentFinalAnnotation ? 'Update Final Decision' : 'Save Final Decision'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default AdjudicatorInterface
