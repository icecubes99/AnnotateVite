import React, { useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '../lib/supabase'

const CSVLoader: React.FC = () => {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState(0)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile)
      setMessage('')
    } else {
      setMessage('Please select a valid CSV file.')
    }
  }

  const uploadComments = async () => {
    if (!file) return

    setLoading(true)
    setMessage('')
    setProgress(0)

    try {
      Papa.parse(file, {
        header: true,
        complete: async (results) => {
          const data = results.data as Array<{ [key: string]: any }>
          
          const comments = data
            .filter(row => row.comment_to_annotate && row.comment_to_annotate.trim() !== '' && row.unique_comment_id)
            .map(row => ({
              unique_comment_id: row.unique_comment_id.trim(),
              context_title: row.context_title ? row.context_title.trim() : '',
              text: row.comment_to_annotate.trim(),
              likes: parseInt(row.LIKES) || 0,
              post_url: row['POST URL'] ? row['POST URL'].trim() : null
            }))

          if (comments.length === 0) {
            setMessage('No valid comments found in the CSV file.')
            setLoading(false)
            return
          }

          const batchSize = 100
          let uploaded = 0

          for (let i = 0; i < comments.length; i += batchSize) {
            const batch = comments.slice(i, i + batchSize)
            
            const { error } = await supabase
              .from('comments')
              .insert(batch)

            if (error) {
              console.error('Error uploading batch:', error)
              setMessage(`Error uploading comments: ${error.message}`)
              setLoading(false)
              return
            }

            uploaded += batch.length
            setProgress((uploaded / comments.length) * 100)
          }

          setMessage(`Successfully uploaded ${uploaded} comments!`)
          setFile(null)
          setLoading(false)
        },
        error: (error) => {
          console.error('Error parsing CSV:', error)
          setMessage('Error parsing CSV file.')
          setLoading(false)
        }
      })
    } catch (error) {
      console.error('Error:', error)
      setMessage('An error occurred while processing the file.')
      setLoading(false)
    }
  }

  const clearComments = async () => {
    if (!confirm('Are you sure you want to clear all comments and annotations? This action cannot be undone.')) {
      return
    }

    setLoading(true)
    setMessage('')

    try {
      await supabase.from('final_annotations').delete().neq('id', 0)
      await supabase.from('annotations').delete().neq('id', 0)
      const { error } = await supabase.from('comments').delete().neq('id', 0)

      if (error) {
        setMessage(`Error clearing data: ${error.message}`)
      } else {
        setMessage('All comments and annotations cleared successfully.')
      }
    } catch (error) {
      console.error('Error:', error)
      setMessage('An error occurred while clearing data.')
    }

    setLoading(false)
  }

  return (
    <div className="csv-loader">
      <h3>Load Comments from CSV</h3>
      
      <div className="upload-section">
        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          disabled={loading}
        />
        
        <button
          onClick={uploadComments}
          disabled={!file || loading}
          className="upload-btn"
        >
          {loading ? `Uploading... ${progress.toFixed(1)}%` : 'Upload Comments'}
        </button>
      </div>

      <div className="danger-zone">
        <button
          onClick={clearComments}
          disabled={loading}
          className="danger-btn"
        >
          Clear All Data
        </button>
        <p className="warning">⚠️ This will delete all comments and annotations</p>
      </div>

      {message && (
        <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      <div className="instructions">
        <h4>CSV Format Requirements:</h4>
        <ul>
          <li>Required columns: <code>unique_comment_id</code>, <code>context_title</code>, <code>comment_to_annotate</code></li>
          <li>Optional columns: <code>LIKES</code>, <code>POST URL</code></li>
          <li>Comments should be in Filipino/English text</li>
          <li>Empty rows will be skipped</li>
        </ul>
        <h5>Expected CSV structure:</h5>
        <pre>unique_comment_id,context_title,comment_to_annotate,LIKES,POST URL</pre>
      </div>
    </div>
  )
}

export default CSVLoader