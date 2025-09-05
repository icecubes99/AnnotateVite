import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface Annotation {
  id: number
  comment_id: number
  annotator_role: 'annotator1' | 'annotator2'
  sentiment: 'positive' | 'negative' | 'neutral'
  discourse_polarization: 'partisan' | 'objective' | 'non_polarized'
  created_at: string
}

interface KappaResult {
  sentiment: {
    observedAgreement: number
    expectedAgreement: number
    kappa: number
    matrix: number[][]
    labels: string[]
  }
  discoursePolarization: {
    observedAgreement: number
    expectedAgreement: number
    kappa: number
    matrix: number[][]
    labels: string[]
  }
}

const KappaCalculator: React.FC = () => {
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [kappaResults, setKappaResults] = useState<KappaResult | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchAnnotations()
  }, [])

  const fetchAnnotations = async () => {
    const { data } = await supabase
      .from('annotations')
      .select('*')
      .order('comment_id, annotator_role')
    
    if (data) {
      setAnnotations(data)
    }
  }

  const calculateKappa = () => {
    setLoading(true)

    const commentAnnotations: Record<number, { annotator1?: Annotation; annotator2?: Annotation }> = {}
    
    annotations.forEach(annotation => {
      if (!commentAnnotations[annotation.comment_id]) {
        commentAnnotations[annotation.comment_id] = {}
      }
      commentAnnotations[annotation.comment_id][annotation.annotator_role] = annotation
    })

    const completePairs = Object.values(commentAnnotations)
      .filter(pair => pair.annotator1 && pair.annotator2)

    if (completePairs.length === 0) {
      alert('No complete annotation pairs found for both annotators.')
      setLoading(false)
      return
    }

    const sentimentLabels = ['positive', 'negative', 'neutral']
    const discourseLabels = ['partisan', 'objective', 'non_polarized']

    const sentimentKappa = calculateKappaForCategory(
      completePairs.map(pair => pair.annotator1!.sentiment),
      completePairs.map(pair => pair.annotator2!.sentiment),
      sentimentLabels
    )

    const discourseKappa = calculateKappaForCategory(
      completePairs.map(pair => pair.annotator1!.discourse_polarization),
      completePairs.map(pair => pair.annotator2!.discourse_polarization),
      discourseLabels
    )

    setKappaResults({
      sentiment: {
        ...sentimentKappa,
        labels: sentimentLabels
      },
      discoursePolarization: {
        ...discourseKappa,
        labels: discourseLabels
      }
    })

    setLoading(false)
  }

  const calculateKappaForCategory = (
    annotator1: string[],
    annotator2: string[],
    labels: string[]
  ) => {
    const n = annotator1.length
    const matrix = Array(labels.length).fill(0).map(() => Array(labels.length).fill(0))
    
    let observedAgreements = 0
    
    for (let i = 0; i < n; i++) {
      const idx1 = labels.indexOf(annotator1[i])
      const idx2 = labels.indexOf(annotator2[i])
      
      matrix[idx1][idx2]++
      
      if (idx1 === idx2) {
        observedAgreements++
      }
    }

    const observedAgreement = observedAgreements / n

    const marginal1 = labels.map((_, idx) => 
      matrix[idx].reduce((sum, count) => sum + count, 0) / n
    )
    
    const marginal2 = labels.map((_, idx) => 
      matrix.reduce((sum, row) => sum + row[idx], 0) / n
    )

    const expectedAgreement = marginal1.reduce((sum, p1, idx) => 
      sum + (p1 * marginal2[idx]), 0
    )

    const kappa = expectedAgreement === 1 ? 1 : 
      (observedAgreement - expectedAgreement) / (1 - expectedAgreement)

    return {
      observedAgreement,
      expectedAgreement,
      kappa,
      matrix
    }
  }

  const interpretKappa = (kappa: number) => {
    if (kappa < 0) return 'Poor (worse than chance)'
    if (kappa < 0.20) return 'Slight'
    if (kappa < 0.40) return 'Fair'
    if (kappa < 0.60) return 'Moderate'
    if (kappa < 0.80) return 'Substantial'
    return 'Almost Perfect'
  }

  const getAnnotationCounts = () => {
    const commentCounts = annotations.reduce((acc, annotation) => {
      if (!acc[annotation.comment_id]) {
        acc[annotation.comment_id] = new Set()
      }
      acc[annotation.comment_id].add(annotation.annotator_role)
      return acc
    }, {} as Record<number, Set<string>>)

    const totalComments = Object.keys(commentCounts).length
    const completePairs = Object.values(commentCounts)
      .filter(annotators => annotators.size === 2).length

    return { totalComments, completePairs }
  }

  const { totalComments, completePairs } = getAnnotationCounts()

  return (
    <div className="kappa-calculator">
      <h3>Cohen's Kappa Inter-Annotator Agreement</h3>
      
      <div className="stats">
        <p><strong>Total Comments with Annotations:</strong> {totalComments}</p>
        <p><strong>Comments Annotated by Both:</strong> {completePairs}</p>
        <p><strong>Coverage:</strong> {totalComments > 0 ? ((completePairs / totalComments) * 100).toFixed(1) : 0}%</p>
      </div>

      <button 
        onClick={calculateKappa} 
        disabled={loading || completePairs === 0}
        className="calculate-btn"
      >
        {loading ? 'Calculating...' : 'Calculate Cohen\'s Kappa'}
      </button>

      {kappaResults && (
        <div className="results">
          <div className="result-section">
            <h4>Sentiment Polarity Agreement</h4>
            <div className="kappa-stats">
              <p><strong>Cohen's κ:</strong> {kappaResults.sentiment.kappa.toFixed(3)}</p>
              <p><strong>Interpretation:</strong> {interpretKappa(kappaResults.sentiment.kappa)}</p>
              <p><strong>Observed Agreement:</strong> {(kappaResults.sentiment.observedAgreement * 100).toFixed(1)}%</p>
              <p><strong>Expected Agreement:</strong> {(kappaResults.sentiment.expectedAgreement * 100).toFixed(1)}%</p>
            </div>
            
            <div className="confusion-matrix">
              <h5>Confusion Matrix</h5>
              <table>
                <thead>
                  <tr>
                    <th>Annotator 1 \ Annotator 2</th>
                    {kappaResults.sentiment.labels.map(label => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {kappaResults.sentiment.matrix.map((row, i) => (
                    <tr key={i}>
                      <td><strong>{kappaResults.sentiment.labels[i]}</strong></td>
                      {row.map((count, j) => (
                        <td key={j} className={i === j ? 'diagonal' : ''}>{count}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="result-section">
            <h4>Discourse Polarization Agreement</h4>
            <div className="kappa-stats">
              <p><strong>Cohen's κ:</strong> {kappaResults.discoursePolarization.kappa.toFixed(3)}</p>
              <p><strong>Interpretation:</strong> {interpretKappa(kappaResults.discoursePolarization.kappa)}</p>
              <p><strong>Observed Agreement:</strong> {(kappaResults.discoursePolarization.observedAgreement * 100).toFixed(1)}%</p>
              <p><strong>Expected Agreement:</strong> {(kappaResults.discoursePolarization.expectedAgreement * 100).toFixed(1)}%</p>
            </div>

            <div className="confusion-matrix">
              <h5>Confusion Matrix</h5>
              <table>
                <thead>
                  <tr>
                    <th>Annotator 1 \ Annotator 2</th>
                    {kappaResults.discoursePolarization.labels.map(label => (
                      <th key={label}>{label.replace('_', ' ')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {kappaResults.discoursePolarization.matrix.map((row, i) => (
                    <tr key={i}>
                      <td><strong>{kappaResults.discoursePolarization.labels[i].replace('_', ' ')}</strong></td>
                      {row.map((count, j) => (
                        <td key={j} className={i === j ? 'diagonal' : ''}>{count}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="interpretation-guide">
        <h4>Kappa Interpretation Guide</h4>
        <ul>
          <li><strong>0.81-1.00:</strong> Almost Perfect Agreement</li>
          <li><strong>0.61-0.80:</strong> Substantial Agreement</li>
          <li><strong>0.41-0.60:</strong> Moderate Agreement</li>
          <li><strong>0.21-0.40:</strong> Fair Agreement</li>
          <li><strong>0.00-0.20:</strong> Slight Agreement</li>
          <li><strong>&lt; 0.00:</strong> Poor Agreement (worse than chance)</li>
        </ul>
      </div>
    </div>
  )
}

export default KappaCalculator