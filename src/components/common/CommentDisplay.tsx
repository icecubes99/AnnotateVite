import React from 'react'

interface CommentDisplayProps {
  contextTitle: string
  uniqueId: string
  likes: number
  postUrl?: string | null
  commentText: string
  commentHeading: string
  contextHeading?: string
  className?: string
}

const CommentDisplay: React.FC<CommentDisplayProps> = ({
  contextTitle,
  uniqueId,
  likes,
  postUrl,
  commentText,
  commentHeading,
  contextHeading = 'Context',
  className,
}) => {
  return (
    <div className={`comment-display${className ? ` ${className}` : ''}`}>
      <div className="comment-context">
        <h3>{contextHeading}</h3>
        <div className="context-info">
          <p>
            <strong>Title:</strong> {contextTitle}
          </p>
          <div className="context-meta">
            <span>
              <strong>ID:</strong> {uniqueId}
            </span>
            <span>
              <strong>Likes:</strong> {likes}
            </span>
            {postUrl && (
              <a
                href={postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="post-link"
              >
                View Original Post
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="comment-content">
        <h3>{commentHeading}</h3>
        <p className="comment-text">{commentText}</p>
      </div>
    </div>
  )
}

export default CommentDisplay
