import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../contexts/AppContext'
import { supabase } from '../lib/supabase'

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

const AnnotationInterface: React.FC = () => {
  const { currentRole } = useApp()
  const [comments, setComments] = useState<Comment[]>([])
  const [totalComments, setTotalComments] = useState(0)
  const [currentCommentIndex, setCurrentCommentIndex] = useState(0)
  const [sentiment, setSentiment] = useState<'positive' | 'negative' | 'neutral' | ''>('')
  const [discoursePolarization, setDiscoursePolarization] = useState<'partisan' | 'objective' | 'non_polarized' | ''>('')
  const [loading, setLoading] = useState(false)
  const [annotations, setAnnotations] = useState<Record<number, Annotation>>({})
  const [jumpToComment, setJumpToComment] = useState('')
  const commentSectionRef = useRef<HTMLDivElement>(null)
  const annotationSectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadDataAndNavigate = async () => {
      await fetchInitialData()
      await fetchAnnotations()
    }
    loadDataAndNavigate()
  }, [currentRole]) // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate to first unannotated comment when data is loaded
  useEffect(() => {
    if (totalComments > 0 && Object.keys(annotations).length >= 0) {
      // Find first unannotated comment in loaded batch
      const firstUnannotatedIndex = comments.findIndex(comment => comment && !annotations[comment.id])
      if (firstUnannotatedIndex !== -1) {
        setCurrentCommentIndex(firstUnannotatedIndex)
      }
    }
  }, [comments, annotations, totalComments])

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
    await loadCommentsBatch(0, 100)
  }

  const loadCommentsBatch = async (startIndex: number, batchSize: number = 100) => {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .order('id')
      .range(startIndex, startIndex + batchSize - 1)

    if (error) {
      console.error('Error loading comments batch:', error)
      return
    }

    if (data) {
      // Update comments array - replace or extend
      setComments(prev => {
        const newComments = [...prev]
        data.forEach((comment, index) => {
          newComments[startIndex + index] = comment
        })
        return newComments
      })
    }
  }

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
  }

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
        const batchStart = Math.floor(nextIndex / 100) * 100
        await loadCommentsBatch(batchStart, 100)
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
    const nextUnannotatedIndex = comments.findIndex((comment, index) =>
      index > currentCommentIndex && comment && !annotations[comment.id]
    )

    if (nextUnannotatedIndex !== -1) {
      setCurrentCommentIndex(nextUnannotatedIndex)
    } else {
      // If not found in loaded comments, load next batch and search
      const nextBatchStart = Math.floor((currentCommentIndex + 1) / 100) * 100
      if (nextBatchStart < totalComments) {
        await loadCommentsBatch(nextBatchStart, 100)
        // Retry search after loading
        const retryIndex = comments.findIndex((comment, index) =>
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
        const batchStart = Math.floor(targetIndex / 100) * 100
        await loadCommentsBatch(batchStart, 100)
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

      <div className="comment-navigation">
        <div className="nav-left">
          <button onClick={goToPrevious} disabled={currentCommentIndex === 0}>
            Previous
          </button>
          <div className="jump-to-comment">
            <input
              type="number"
              placeholder="Jump to #"
              value={jumpToComment}
              onChange={(e) => setJumpToComment(e.target.value)}
              min="1"
              max={totalComments}
              className="jump-input"
            />
            <button onClick={handleJumpToComment} className="jump-btn">
              Go
            </button>
          </div>
        </div>
        <div className="nav-center">
          <span>Comment {currentCommentIndex + 1} of {totalComments}</span>
          {currentAnnotation && <span className="annotated-badge">✓ Annotated</span>}
        </div>
        <div className="nav-right">
          <button
            onClick={goToNextUnannotated}
            disabled={false}
            className="next-unannotated"
          >
            Next Unannotated
          </button>
          <button onClick={goToNext} disabled={currentCommentIndex === totalComments - 1}>
            Next
          </button>
        </div>
      </div>

      <div className="annotation-layout">
        <div className="comment-section" ref={commentSectionRef}>
          <div className="comment-display">
            <div className="comment-context">
              <h3>Context</h3>
              <div className="context-info">
                <p><strong>Title:</strong> {currentComment.context_title}</p>
                <div className="context-meta">
                  <span><strong>ID:</strong> {currentComment.unique_comment_id}</span>
                  <span><strong>Likes:</strong> {currentComment.likes}</span>
                  {currentComment.post_url && (
                    <a href={currentComment.post_url} target="_blank" rel="noopener noreferrer" className="post-link">
                      View Original Post
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="comment-content">
              <h3>Comment to Annotate:</h3>
              <p className="comment-text">{currentComment.text}</p>
            </div>
          </div>
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