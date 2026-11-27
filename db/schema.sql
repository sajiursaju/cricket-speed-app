-- CreaseRadar Relational Database Schema (MySQL 8.0+ / PostgreSQL compatible)
-- Supports 3-Tier RBAC, Short/Long Pitch Configs, Live Ball-by-Ball Scoring, and Speed Radar Telemetry

CREATE TABLE roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code ENUM('SUPER_ADMIN', 'MANAGING_ADMIN', 'SCORER') NOT NULL UNIQUE,
  display_name VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  role_id INT NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  subscription_tier ENUM('COMMUNITY', 'CLUB_PRO', 'LEAGUE_ENTERPRISE') NOT NULL DEFAULT 'COMMUNITY',
  created_by CHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_users_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE app_settings (
  setting_key VARCHAR(64) PRIMARY KEY,
  setting_value JSON NOT NULL,
  updated_by CHAR(36) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE tournaments (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  city VARCHAR(100) NOT NULL,
  format_category ENUM('SHORT_PITCH', 'LONG_PITCH') NOT NULL,
  default_pitch_yards DECIMAL(5,2) NOT NULL DEFAULT 22.00,
  default_overs INT NOT NULL DEFAULT 20,
  ball_type ENUM('TAPE_GREEN', 'TENNIS_YELLOW', 'LEATHER_RED', 'LEATHER_WHITE') NOT NULL DEFAULT 'TAPE_GREEN',
  managed_by CHAR(36) NOT NULL,
  status ENUM('UPCOMING', 'LIVE', 'COMPLETED') NOT NULL DEFAULT 'UPCOMING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tournaments_manager FOREIGN KEY (managed_by) REFERENCES users(id)
);

CREATE TABLE teams (
  id CHAR(36) PRIMARY KEY,
  tournament_id CHAR(36) NULL,
  name VARCHAR(120) NOT NULL,
  short_code VARCHAR(8) NOT NULL,
  captain_name VARCHAR(120) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_teams_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL
);

CREATE TABLE players (
  id CHAR(36) PRIMARY KEY,
  team_id CHAR(36) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  batting_style ENUM('RHB', 'LHB') NOT NULL DEFAULT 'RHB',
  bowling_style ENUM('PACE', 'MEDIUM', 'SPIN', 'NONE') NOT NULL DEFAULT 'MEDIUM',
  jersey_number INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_players_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE TABLE matches (
  id CHAR(36) PRIMARY KEY,
  tournament_id CHAR(36) NULL,
  team_a_id CHAR(36) NOT NULL,
  team_b_id CHAR(36) NOT NULL,
  assigned_scorer_id CHAR(36) NULL,
  pitch_mode ENUM('SHORT_PITCH', 'LONG_PITCH') NOT NULL,
  pitch_distance_yards DECIMAL(5,2) NOT NULL,
  overs_limit INT NOT NULL,
  ball_type ENUM('TAPE_GREEN', 'TENNIS_YELLOW', 'LEATHER_RED', 'LEATHER_WHITE') NOT NULL,
  single_run_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  boundary_only_mode BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('SCHEDULED', 'LIVE', 'COMPLETED', 'VERIFIED') NOT NULL DEFAULT 'SCHEDULED',
  verified_by CHAR(36) NULL,
  verified_at TIMESTAMP NULL,
  winner_team_id CHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_matches_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL,
  CONSTRAINT fk_matches_team_a FOREIGN KEY (team_a_id) REFERENCES teams(id),
  CONSTRAINT fk_matches_team_b FOREIGN KEY (team_b_id) REFERENCES teams(id),
  CONSTRAINT fk_matches_scorer FOREIGN KEY (assigned_scorer_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_matches_verifier FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE innings (
  id CHAR(36) PRIMARY KEY,
  match_id CHAR(36) NOT NULL,
  innings_number TINYINT NOT NULL,
  batting_team_id CHAR(36) NOT NULL,
  bowling_team_id CHAR(36) NOT NULL,
  total_runs INT NOT NULL DEFAULT 0,
  wickets_lost INT NOT NULL DEFAULT 0,
  legal_balls_bowled INT NOT NULL DEFAULT 0,
  target_runs INT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_innings_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE balls (
  id CHAR(36) PRIMARY KEY,
  match_id CHAR(36) NOT NULL,
  innings_id CHAR(36) NOT NULL,
  over_number INT NOT NULL,
  ball_in_over INT NOT NULL,
  sequence_index INT NOT NULL,
  striker_id CHAR(36) NOT NULL,
  non_striker_id CHAR(36) NOT NULL,
  bowler_id CHAR(36) NOT NULL,
  runs_off_bat TINYINT NOT NULL DEFAULT 0,
  extra_runs TINYINT NOT NULL DEFAULT 0,
  extra_type ENUM('NONE', 'WIDE', 'NO_BALL', 'BYE', 'LEG_BYE') NOT NULL DEFAULT 'NONE',
  is_legal_delivery BOOLEAN NOT NULL DEFAULT TRUE,
  is_wicket BOOLEAN NOT NULL DEFAULT FALSE,
  dismissal_type ENUM('NONE', 'BOWLED', 'CAUGHT', 'RUN_OUT', 'LBW', 'STUMPED') NOT NULL DEFAULT 'NONE',
  dismissed_player_id CHAR(36) NULL,
  -- Bowling Speed Radar Telemetry Fields
  speed_kmh DECIMAL(5,2) NULL,
  speed_mph DECIMAL(5,2) NULL,
  release_ts_ms DOUBLE NULL,
  reach_ts_ms DOUBLE NULL,
  pitch_distance_yards DECIMAL(5,2) NULL,
  camera_fps INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_balls_match_seq (match_id, innings_id, sequence_index),
  INDEX idx_balls_bowler_speed (bowler_id, speed_kmh DESC),
  CONSTRAINT fk_balls_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  CONSTRAINT fk_balls_innings FOREIGN KEY (innings_id) REFERENCES innings(id) ON DELETE CASCADE
);
