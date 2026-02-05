-- =============================================================================
-- OpenClaw Skills Schema
-- =============================================================================
-- Skills are knowledge files (.md) that users can upload to teach their bot.
-- These are injected into the system prompt when the bot responds.
-- =============================================================================

-- Skills table
CREATE TABLE IF NOT EXISTS openclaw_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES moltbot_instances(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  
  -- Skill metadata
  name TEXT NOT NULL,
  description TEXT,
  filename TEXT NOT NULL,
  
  -- Skill content
  content TEXT NOT NULL,
  content_tokens INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT skill_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
  CONSTRAINT skill_content_length CHECK (char_length(content) <= 100000)  -- ~100k chars max
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_skills_instance ON openclaw_skills(instance_id);
CREATE INDEX IF NOT EXISTS idx_skills_user ON openclaw_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_skills_active ON openclaw_skills(instance_id, is_active) WHERE is_active = true;

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_skill_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS skills_updated_at ON openclaw_skills;
CREATE TRIGGER skills_updated_at
  BEFORE UPDATE ON openclaw_skills
  FOR EACH ROW
  EXECUTE FUNCTION update_skill_timestamp();

-- =============================================================================
-- Helper function to get combined skills content for an instance
-- =============================================================================
CREATE OR REPLACE FUNCTION get_instance_skills_prompt(p_instance_id UUID)
RETURNS TEXT AS $$
DECLARE
  skills_text TEXT := '';
  skill_record RECORD;
BEGIN
  FOR skill_record IN 
    SELECT name, content 
    FROM openclaw_skills 
    WHERE instance_id = p_instance_id AND is_active = true
    ORDER BY created_at ASC
  LOOP
    skills_text := skills_text || E'\n\n## ' || skill_record.name || E'\n' || skill_record.content;
  END LOOP;
  
  IF skills_text != '' THEN
    skills_text := E'# KNOWLEDGE BASE\nUse the following information to answer questions:\n' || skills_text;
  END IF;
  
  RETURN skills_text;
END;
$$ LANGUAGE plpgsql;
