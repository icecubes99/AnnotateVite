# Annotation Tool - Sentiment & Discourse Polarization

A simple annotation tool built with Vite + React + TypeScript + Supabase for annotating political comments with sentiment polarity and discourse polarization labels.

## Features

- **Role-based Interface**: Support for 2 annotators and 1 adjudicator
- **Annotation Guidelines**: Built-in guidelines for sentiment and discourse polarization
- **CSV Data Loading**: Upload comments from CSV files
- **Inter-annotator Agreement**: Calculate Cohen's Kappa for reliability assessment
- **Adjudication Interface**: Resolve disagreements between annotators
- **Real-time Progress Tracking**: Monitor annotation completion status

## Annotation Schema

### Sentiment Polarity Labels
- **Positive**: Approval, support, praise, or optimism
- **Negative**: Disapproval, criticism, anger, or pessimism  
- **Neutral**: Factual statements, questions, or balanced observations

### Discourse Polarization Labels
- **Partisan**: Divisive language, extreme viewpoints, us-vs-them framing
- **Objective**: Balanced views, factual language, avoids inflammatory rhetoric
- **Non-Polarized**: No political opinion, factual questions, off-topic remarks

## Setup Instructions

### 1. Prerequisites
- Node.js (v16 or higher)
- A Supabase account and project

### 2. Install Dependencies
```bash
npm install
```

### 3. Supabase Setup

1. Create a new Supabase project at https://supabase.com
2. Go to Settings > API to get your project URL and anon key
3. Update `.env.local` with your Supabase credentials:
```
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 4. Database Schema

In your Supabase SQL editor, run the contents of `supabase-schema.sql`:

**Updated schema includes:**
- `unique_comment_id`: Unique identifier for each comment
- `context_title`: Post title for context
- `text`: The comment to annotate  
- `likes`: Number of likes
- `post_url`: Link to original post

```sql
-- Comments table
CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Annotations table
CREATE TABLE annotations (
  id SERIAL PRIMARY KEY,
  comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  annotator_role TEXT CHECK (annotator_role IN ('annotator1', 'annotator2')) NOT NULL,
  sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral')) NOT NULL,
  discourse_polarization TEXT CHECK (discourse_polarization IN ('partisan', 'objective', 'non_polarized')) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(comment_id, annotator_role)
);

-- Final annotations table
CREATE TABLE final_annotations (
  id SERIAL PRIMARY KEY,
  comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  final_sentiment TEXT CHECK (final_sentiment IN ('positive', 'negative', 'neutral')) NOT NULL,
  final_discourse_polarization TEXT CHECK (final_discourse_polarization IN ('partisan', 'objective', 'non_polarized')) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(comment_id)
);
```

### 5. Run the Application
```bash
npm run dev
```

Visit `http://localhost:5173` to use the application.

## Uploading Your Dataset to Supabase

You have **two options** to upload your annotation dataset:

### Option 1: Using the Web Interface (Recommended for smaller datasets)
1. Run the app: `npm run dev`
2. Select "Adjudicator" role
3. Use the CSV Loader component to upload your file
4. The app will process and upload the data automatically

### Option 2: Using the Upload Script (Recommended for large datasets like yours)
For your ~10k comment dataset, use the provided Node.js script:

1. Install additional packages:
```bash
npm install dotenv
```

2. Make sure your `.env.local` file has the correct Supabase credentials

3. Run the upload script:
```bash
node upload-data.js
```

This script will:
- Parse your CSV file
- Clear existing data
- Upload comments in batches of 100
- Show progress and summary statistics

**For your specific dataset:** The script is already configured to handle your CSV structure with columns: `unique_comment_id`, `context_title`, `comment_to_annotate`, `LIKES`, `POST URL`

## Usage Workflow

### For Adjudicators
1. Select "Adjudicator" role
2. Upload CSV file with comments (must have a "text" column)
3. Monitor annotation progress
4. Resolve disagreements between annotators
5. Calculate Cohen's Kappa for inter-annotator agreement

### For Annotators  
1. Select "Annotator 1" or "Annotator 2" role
2. Annotate comments with sentiment and discourse labels
3. Navigate through comments using Previous/Next buttons
4. Track progress with the completion counter

## CSV Format

Your CSV file should have the following format:
```csv
unique_comment_id,context_title,comment_to_annotate,LIKES,POST URL
p1_c357,"tulfo: scrap 4ps, provide livelihood capital to beneficiaries instead","ganun din yan, magtayo lang ng sari-sari store sa bahay gamit ang bintana tas chichirya ang tinda. kinabukasan la na. tigilan nyo na kasi ayu-ayuda na yan.",0,https://www.facebook.com/photo.php?fbid=1178184524492501&set=pb.100069028928005.-2207520000&type=3
```

**Required columns:**
- `unique_comment_id`: Unique identifier for each comment
- `context_title`: Title or context of the post
- `comment_to_annotate`: The actual comment text to be annotated

**Optional columns:**
- `LIKES`: Number of likes the comment received
- `POST URL`: Link to the original post

## Cohen's Kappa Interpretation

- **0.81-1.00**: Almost Perfect Agreement
- **0.61-0.80**: Substantial Agreement  
- **0.41-0.60**: Moderate Agreement
- **0.21-0.40**: Fair Agreement
- **0.00-0.20**: Slight Agreement
- **< 0.00**: Poor Agreement (worse than chance)

## Technical Stack

- **Frontend**: Vite + React + TypeScript
- **Database**: Supabase (PostgreSQL)
- **Styling**: Custom CSS with responsive design
- **CSV Parsing**: PapaParse library
- **Statistical Analysis**: Built-in Cohen's Kappa calculation
