import React from 'react'

interface CommentNavigationProps {
  currentIndex: number
  totalCount: number
  onPrevious: () => void
  disablePrevious: boolean
  onNext: () => void
  disableNext: boolean
  jumpValue: string
  onJumpChange: (value: string) => void
  onJumpSubmit: () => void
  jumpPlaceholder?: string
  jumpMin?: number
  jumpMax?: number
  jumpDisabled?: boolean
  extraLeft?: React.ReactNode
  extraCenter?: React.ReactNode
  extraRight?: React.ReactNode
  label?: string
}

const CommentNavigation: React.FC<CommentNavigationProps> = ({
  currentIndex,
  totalCount,
  onPrevious,
  disablePrevious,
  onNext,
  disableNext,
  jumpValue,
  onJumpChange,
  onJumpSubmit,
  jumpPlaceholder = 'Jump to #',
  jumpMin = 1,
  jumpMax,
  jumpDisabled = false,
  extraLeft,
  extraCenter,
  extraRight,
  label = 'Comment',
}) => {
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onJumpChange(event.target.value)
  }

  return (
    <div className="comment-navigation">
      <div className="nav-left">
        <button onClick={onPrevious} disabled={disablePrevious}>
          Previous
        </button>
        <div className="jump-to-comment">
          <input
            type="number"
            placeholder={jumpPlaceholder}
            value={jumpValue}
            onChange={handleInputChange}
            min={jumpMin}
            max={jumpMax}
            className="jump-input"
            disabled={jumpDisabled}
          />
          <button onClick={onJumpSubmit} className="jump-btn" disabled={jumpDisabled}>
            Go
          </button>
        </div>
        {extraLeft}
      </div>

      <div className="nav-center">
        <span>
          {label} {totalCount > 0 ? currentIndex + 1 : 0} of {totalCount}
        </span>
        {extraCenter}
      </div>

      <div className="nav-right">
        {extraRight}
        <button onClick={onNext} disabled={disableNext}>
          Next
        </button>
      </div>
    </div>
  )
}

export default CommentNavigation
