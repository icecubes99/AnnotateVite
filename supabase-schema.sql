-- Comments table
CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  unique_comment_id TEXT UNIQUE NOT NULL,
  context_title TEXT NOT NULL,
  text TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  post_url TEXT,
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