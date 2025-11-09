-- Weather System Database Schema

-- Table to store weather patterns for each region
CREATE TABLE IF NOT EXISTS weather_regions (
    region_name VARCHAR(100) PRIMARY KEY,
    base_temp_low INTEGER NOT NULL,
    base_temp_high INTEGER NOT NULL,
    temp_variance INTEGER NOT NULL DEFAULT 15,
    precipitation_chance DECIMAL(3,2) NOT NULL DEFAULT 0.30,
    storm_chance DECIMAL(3,2) NOT NULL DEFAULT 0.05,
    storm_season_months INTEGER[] DEFAULT ARRAY[0,1,2,9,10,11],
    hurricane_chance DECIMAL(3,2) DEFAULT 0.02,
    hurricane_season_months INTEGER[] DEFAULT ARRAY[5,6,7,8],
    seasonal_temp_adjustment JSON NOT NULL -- Monthly adjustments
);

-- Insert weather patterns for initial regions (using safer INSERT WHERE NOT EXISTS pattern)
INSERT INTO weather_regions (region_name, base_temp_low, base_temp_high, temp_variance, precipitation_chance, storm_chance, storm_season_months, seasonal_temp_adjustment)
SELECT 'Varisia', 40, 65, 20, 0.35, 0.08, ARRAY[0,1,2,9,10,11], 
       '{"0": -25, "1": -20, "2": -10, "3": 5, "4": 15, "5": 25, "6": 30, "7": 25, "8": 15, "9": 5, "10": -10, "11": -20}'
WHERE NOT EXISTS (SELECT 1 FROM weather_regions WHERE region_name = 'Varisia');

INSERT INTO weather_regions (region_name, base_temp_low, base_temp_high, temp_variance, precipitation_chance, storm_chance, storm_season_months, seasonal_temp_adjustment)
SELECT 'The Shackles', 65, 85, 15, 0.45, 0.06, ARRAY[0,1,10,11], 
       '{"0": 0, "1": 0, "2": 5, "3": 10, "4": 15, "5": 20, "6": 20, "7": 20, "8": 15, "9": 10, "10": 5, "11": 0}'
WHERE NOT EXISTS (SELECT 1 FROM weather_regions WHERE region_name = 'The Shackles');

-- Insert hurricane data for The Shackles
UPDATE weather_regions 
SET hurricane_chance = 0.03, hurricane_season_months = ARRAY[5,6,7,8] 
WHERE region_name = 'The Shackles';

-- Table to store daily weather data
CREATE TABLE IF NOT EXISTS golarion_weather (
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    day INTEGER NOT NULL,
    region VARCHAR(100) NOT NULL,
    condition VARCHAR(50) NOT NULL,
    temp_low INTEGER NOT NULL,
    temp_high INTEGER NOT NULL,
    precipitation_type VARCHAR(20),
    wind_speed INTEGER DEFAULT 5,
    humidity INTEGER DEFAULT 50,
    visibility VARCHAR(20) DEFAULT 'Clear',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (year, month, day, region),
    FOREIGN KEY (region) REFERENCES weather_regions(region_name)
);

-- Add region setting to settings table (using safer INSERT WHERE NOT EXISTS pattern)
INSERT INTO settings (name, value, value_type, description) 
SELECT 'default_region', 'Varisia', 'string', 'Default weather region for the campaign'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE name = 'default_region');

-- Add index for faster weather queries
CREATE INDEX IF NOT EXISTS idx_weather_date_region ON golarion_weather(year, month, day, region);
