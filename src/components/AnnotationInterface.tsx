import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../contexts/AppContext'
import { supabase } from '../lib/supabase'
import CommentDisplay from './common/CommentDisplay'
import CommentNavigation from './common/CommentNavigation'

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
  const [annotationsLoaded, setAnnotationsLoaded] = useState(false)
  const [jumpToComment, setJumpToComment] = useState('')
  const commentSectionRef = useRef<HTMLDivElement>(null)
  const annotationSectionRef = useRef<HTMLDivElement>(null)
  const commentsRef = useRef<Array<Comment | null>>([])
  const [hasPositionedInitial, setHasPositionedInitial] = useState(false)

  useEffect(() => {
    commentsRef.current = comments
  }, [comments])

  useEffect(() => {
    const loadData = async () => {
      if (!currentRole || currentRole === 'adjudicator') {
        commentsRef.current = []
        setComments([])
        setAnnotations({})
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
      await fetchAnnotations()
    }

    loadData()
  }, [currentRole]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const fetchInitialData = async () => {
    // Get total count first
    const { count } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })

    setTotalComments(count || 0)
    console.log('Total comments in database:', count)

    // Load only first batch of comments
    await loadCommentsBatch(0)
  }

  const loadCommentsBatch = useCallback(async (startIndex: number, batchSize: number = BATCH_SIZE) => {
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

    // Update comments array - replace or extend
    setComments(prev => {
      const newComments = [...prev]
      data.forEach((comment, index) => {
        newComments[startIndex + index] = comment
      })
      commentsRef.current = newComments
      return newComments
    })

    return data
  }, [])

  const fetchAnnotations = async () => {
    if (!currentRole || currentRole === 'adjudicator') return

    const { data } = await supabase
      .from('annotations')
      .select('*')
      .eq('annotator_role', currentRole)

    if (data) {
      const annotationsMap = data.reduce((acc, annotation) => {
        acc[annotation.comment_id] = annotation
        return acc
      }, {} as Record<number, Annotation>)
      setAnnotations(annotationsMap)
    }

    setAnnotationsLoaded(true)
  }

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentRole || currentRole === 'adjudicator' || !currentComment || !sentiment || !discoursePolarization) return

    setLoading(true)

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
        }
      }
    } catch (error) {
      console.error('Error saving annotation:', error)
    }
    setLoading(false)
  }

  const goToNext = async () => {
    if (currentCommentIndex < totalComments - 1) {
      const nextIndex = currentCommentIndex + 1

      // Load comment if not already loaded
      if (!comments[nextIndex]) {
        const batchStart = Math.floor(nextIndex / BATCH_SIZE) * BATCH_SIZE
        await loadCommentsBatch(batchStart)
      }

      setCurrentCommentIndex(nextIndex)
    }
  }

  const goToPrevious = () => {
    if (currentCommentIndex > 0) {
      setCurrentCommentIndex(currentCommentIndex - 1)
    }
  }

  const goToNextUnannotated = async () => {
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
  }

  const handleJumpToComment = async () => {
    const commentNumber = parseInt(jumpToComment)
    if (commentNumber && commentNumber >= 1 && commentNumber <= totalComments) {
      const targetIndex = commentNumber - 1

      // Load comment if not already loaded
      if (!comments[targetIndex]) {
        const batchStart = Math.floor(targetIndex / BATCH_SIZE) * BATCH_SIZE
        await loadCommentsBatch(batchStart)
      }

      setCurrentCommentIndex(targetIndex)
      setJumpToComment('')
    }
  }

  const clearAnnotation = async () => {
    if (!currentComment || !currentAnnotation) return

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
        setSentiment('')
        setDiscoursePolarization('')
      }
    } catch (error) {
      console.error('Error clearing annotation:', error)
    }
    setLoading(false)
  }

  const annotatedCount = Object.keys(annotations).length
  const progress = totalComments > 0 ? (annotatedCount / totalComments) * 100 : 0

  if (!currentComment) {
    return <div>No comments available for annotation.</div>
  }

  return (
    <div className="annotation-interface">
      <div className="header">
        <h2>Annotation Interface - {currentRole}</h2>
        <div className="progress">
          Progress: {annotatedCount}/{totalComments} ({progress.toFixed(1)}%)
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
