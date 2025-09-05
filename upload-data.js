// Node.js script to upload CSV data directly to Supabase
// Run with: node upload-data.js

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import Papa from 'papaparse'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env.local file')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function uploadCSVData() {
  try {
    console.log('📁 Reading CSV file...')
    
    // Update this path to your CSV file location
    const csvPath = '../data/annotation/annotation_dataset.csv'
    const csvFile = fs.readFileSync(csvPath, 'utf8')
    
    console.log('🔄 Parsing CSV data...')
    const parseResult = Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true
    })
    
    if (parseResult.errors.length > 0) {
      console.error('❌ CSV parsing errors:', parseResult.errors)
      return
    }
    
    const data = parseResult.data
    console.log(`📊 Found ${data.length} rows in CSV`)
    
    // Transform data to match database schema
    const comments = data
      .filter(row => row.comment_to_annotate && row.comment_to_annotate.trim() !== '' && row.unique_comment_id)
      .map(row => ({
        unique_comment_id: row.unique_comment_id.trim(),
        context_title: row.context_title ? row.context_title.trim() : '',
        text: row.comment_to_annotate.trim(),
        likes: parseInt(row.LIKES) || 0,
        post_url: row['POST URL'] ? row['POST URL'].trim() : null
      }))
    
    console.log(`✅ Processed ${comments.length} valid comments`)
    
    // Clear existing data
    console.log('🗑️ Clearing existing data...')
    await supabase.from('final_annotations').delete().neq('id', 0)
    await supabase.from('annotations').delete().neq('id', 0)
    await supabase.from('comments').delete().neq('id', 0)
    
    // Upload in batches to avoid timeout
    const batchSize = 100
    let uploaded = 0
    
    console.log(`🚀 Uploading ${comments.length} comments in batches of ${batchSize}...`)
    
    for (let i = 0; i < comments.length; i += batchSize) {
      const batch = comments.slice(i, i + batchSize)
      
      const { error } = await supabase
        .from('comments')
        .insert(batch)
      
      if (error) {
        console.error(`❌ Error uploading batch ${Math.floor(i/batchSize) + 1}:`, error)
        break
      }
      
      uploaded += batch.length
      const progress = ((uploaded / comments.length) * 100).toFixed(1)
      console.log(`📈 Progress: ${uploaded}/${comments.length} (${progress}%)`)
    }
    
    if (uploaded === comments.length) {
      console.log('✅ All data uploaded successfully!')
      console.log(`📋 Summary:`)
      console.log(`   - Total comments: ${uploaded}`)
      console.log(`   - Unique IDs: ${new Set(comments.map(c => c.unique_comment_id)).size}`)
      console.log(`   - With URLs: ${comments.filter(c => c.post_url).length}`)
      console.log(`   - Average likes: ${(comments.reduce((sum, c) => sum + c.likes, 0) / comments.length).toFixed(1)}`)
    }
    
  } catch (error) {
    console.error('❌ Upload failed:', error)
  }
}

// Install required packages
console.log('📦 Make sure you have installed the required packages:')
console.log('   npm install @supabase/supabase-js papaparse dotenv')
console.log('')

uploadCSVData()