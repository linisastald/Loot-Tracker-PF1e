-- Create game sessions table
CREATE TABLE game_sessions (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    discord_message_id VARCHAR(255),
    discord_channel_id VARCHAR(255)
);

-- Create attendance table for tracking player responses
CREATE TABLE session_attendance (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    character_id INTEGER REFERENCES characters(id),
    status VARCHAR(20) NOT NULL CHECK (status IN ('accepted', 'declined', 'tentative')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (session_id, user_id)
);

-- Add index for faster lookups
CREATE INDEX idx_session_attendance_session_id ON session_attendance(session_id);
CREATE INDEX idx_session_attendance_user_id ON session_attendance(user_id);
CREATE INDEX idx_session_attendance_character_id ON session_attendance(character_id);
