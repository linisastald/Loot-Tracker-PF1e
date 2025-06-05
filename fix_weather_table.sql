-- Add missing primary key constraint to golarion_weather table
ALTER TABLE golarion_weather ADD CONSTRAINT golarion_weather_pkey PRIMARY KEY (year, month, day, region);
