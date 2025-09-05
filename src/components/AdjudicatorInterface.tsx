import React, { useState, useEffect } from 'react'
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

interface FinalAnnotation {
  id: number
  comment_id: number
  final_sentiment: 'positive' | 'negative' | 'neutral'
  final_discourse_polarization: 'partisan' | 'objective' | 'non_polarized'
  created_at: string
}

const AdjudicatorInterface: React.FC = () => {
  const [comments, setComments] = useState<Comment[]>([])
  const [totalComments, setTotalComments] = useState(0)
  const [annotations, setAnnotations] = useState<Record<number, Annotation[]>>({})
  const [finalAnnotations, setFinalAnnotations] = useState<Record<number, FinalAnnotation>>({})
  const [currentCommentIndex, setCurrentCommentIndex] = useState(0)
  const [finalSentiment, setFinalSentiment] = useState<'positive' | 'negative' | 'neutral' | ''>('')
  const [finalDiscoursePolarization, setFinalDiscoursePolarization] = useState<'partisan' | 'objective' | 'non_polarized' | ''>('')
  const [loading, setLoading] = useState(false)
  const [jumpToComment, setJumpToComment] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const hasDisagreement = (annotations: Annotation[]) => {
    if (annotations.length < 2) return false
    const sentiment1 = annotations[0]?.sentiment
    const sentiment2 = annotations[1]?.sentiment
    const discourse1 = annotations[0]?.discourse_polarization
    const discourse2 = annotations[1]?.discourse_polarization
    
    return sentiment1 !== sentiment2 || discourse1 !== discourse2
  }

  // Navigate to first unadjudicated comment with disagreement
  useEffect(() => {
    if (totalComments > 0 && Object.keys(annotations).length > 0) {
      const firstDisagreementIndex = comments.findIndex(comment => {
        if (!comment) return false
        const commentAnnotations = annotations[comment.id] || []
        const hasFinalAnnotation = finalAnnotations[comment.id]
        const hasDisagreementResult = hasDisagreement(commentAnnotations)
        
        return commentAnnotations.length === 2 && !hasFinalAnnotation && hasDisagreementResult
      })
      
      if (firstDisagreementIndex !== -1) {
        setCurrentCommentIndex(firstDisagreementIndex)
      } else {
        // If no disagreements, find first comment without final annotation
        const firstUnfinishedIndex = comments.findIndex(comment => {
          if (!comment) return false
          const commentAnnotations = annotations[comment.id] || []
          return commentAnnotations.length === 2 && !finalAnnotations[comment.id]
        })
        if (firstUnfinishedIndex !== -1) {
          setCurrentCommentIndex(firstUnfinishedIndex)
        }
      }
    }
  }, [comments, annotations, finalAnnotations, totalComments])

  const fetchData = async () => {
    await Promise.all([
      fetchInitialData(),
      fetchAnnotations(),
      fetchFinalAnnotations(),
    ])
  }

  const fetchInitialData = async () => {
    // Get total count first
    const { count } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
    
    setTotalComments(count || 0)
    console.log('Adjudicator - Total comments in database:', count)
    
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
      console.error('Adjudicator error loading comments batch:', error)
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
    const { data } = await supabase
      .from('annotations')
      .select('*')
      .order('comment_id, annotator_role')
    
    if (data) {
      const annotationsMap = data.reduce((acc, annotation) => {
        if (!acc[annotation.comment_id]) {
          acc[annotation.comment_id] = []
        }
        acc[annotation.comment_id].push(annotation)
        return acc
      }, {} as Record<number, Annotation[]>)
      setAnnotations(annotationsMap)
    }
  }

  const fetchFinalAnnotations = async () => {
    const { data } = await supabase
      .from('final_annotations')
      .select('*')
    
    if (data) {
      const finalAnnotationsMap = data.reduce((acc, finalAnnotation) => {
        acc[finalAnnotation.comment_id] = finalAnnotation
        return acc
      }, {} as Record<number, FinalAnnotation>)
      setFinalAnnotations(finalAnnotationsMap)
    }
  }

  const currentComment = comments[currentCommentIndex]
  const currentAnnotations = currentComment ? annotations[currentComment.id] || [] : []
  const currentFinalAnnotation = currentComment ? finalAnnotations[currentComment.id] : null

  useEffect(() => {
    if (currentFinalAnnotation) {
      setFinalSentiment(currentFinalAnnotation.final_sentiment)
      setFinalDiscoursePolarization(currentFinalAnnotation.final_discourse_polarization)
    } else {
      setFinalSentiment('')
      setFinalDiscoursePolarization('')
    }
  }, [currentFinalAnnotation, currentCommentIndex])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentComment || !finalSentiment || !finalDiscoursePolarization) return

    setLoading(true)

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
        }
      }
    } catch (error) {
      console.error('Error saving final annotation:', error)
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

  const finalizedCount = Object.keys(finalAnnotations).length
  const progress = totalComments > 0 ? (finalizedCount / totalComments) * 100 : 0

  if (!currentComment) {
    return <div>No comments available for adjudication.</div>
  }

  return (
    <div className="adjudicator-interface">
      <div className="header">
        <h2>Adjudicator Interface</h2>
        <div className="progress">
          Progress: {finalizedCount}/{totalComments} ({progress.toFixed(1)}%)
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
        </div>
        <div className="nav-right">
          <button onClick={goToNext} disabled={currentCommentIndex === totalComments - 1}>
            Next
          </button>
        </div>
      </div>

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
          <h3>Comment to Adjudicate:</h3>
          <p className="comment-text">{currentComment.text}</p>
        </div>
      </div>

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
              <strong>Positive</strong>
            </label>
            <label>
              <input
                type="radio"
                name="finalSentiment"
                value="negative"
                checked={finalSentiment === 'negative'}
                onChange={(e) => setFinalSentiment(e.target.value as 'negative')}
              />
              <strong>Negative</strong>
            </label>
            <label>
              <input
                type="radio"
                name="finalSentiment"
                value="neutral"
                checked={finalSentiment === 'neutral'}
                onChange={(e) => setFinalSentiment(e.target.value as 'neutral')}
              />
              <strong>Neutral</strong>
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
              <strong>Partisan</strong>
            </label>
            <label>
              <input
                type="radio"
                name="finalDiscoursePolarization"
                value="objective"
                checked={finalDiscoursePolarization === 'objective'}
                onChange={(e) => setFinalDiscoursePolarization(e.target.value as 'objective')}
              />
              <strong>Objective</strong>
            </label>
            <label>
              <input
                type="radio"
                name="finalDiscoursePolarization"
                value="non_polarized"
                checked={finalDiscoursePolarization === 'non_polarized'}
                onChange={(e) => setFinalDiscoursePolarization(e.target.value as 'non_polarized')}
              />
              <strong>Non-Polarized</strong>
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
  )
}

export default AdjudicatorInterface