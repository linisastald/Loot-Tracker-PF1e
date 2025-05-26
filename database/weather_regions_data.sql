-- weather_regions data export from current database
-- Generated on Mon May 26 00:55:06 EDT 2025

--
-- PostgreSQL database dump
--

-- Dumped from database version 16.3
-- Dumped by pg_dump version 16.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: weather_regions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.weather_regions (region_name, base_temp_low, base_temp_high, temp_variance, precipitation_chance, storm_chance, storm_season_months, hurricane_chance, hurricane_season_months, seasonal_temp_adjustment) VALUES ('Varisia', 40, 65, 20, 0.35, 0.08, '{0,1,2,9,10,11}', 0.02, '{5,6,7,8}', '{"0": -25, "1": -20, "2": -10, "3": 5, "4": 15, "5": 25, "6": 30, "7": 25, "8": 15, "9": 5, "10": -10, "11": -20}');
INSERT INTO public.weather_regions (region_name, base_temp_low, base_temp_high, temp_variance, precipitation_chance, storm_chance, storm_season_months, hurricane_chance, hurricane_season_months, seasonal_temp_adjustment) VALUES ('The Shackles', 65, 85, 15, 0.45, 0.06, '{0,1,10,11}', 0.03, '{5,6,7,8}', '{"0": 0, "1": 0, "2": 5, "3": 10, "4": 15, "5": 20, "6": 20, "7": 20, "8": 15, "9": 10, "10": 5, "11": 0}');


--
-- PostgreSQL database dump complete
--

