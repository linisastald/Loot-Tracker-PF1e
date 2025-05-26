-- min_costs data export from current database
-- Generated on Mon May 26 00:55:04 EDT 2025

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
-- Data for Name: min_costs; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('potion', 0, 25);
INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('potion', 1, 50);
INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('potion', 2, 300);
INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('potion', 3, 750);
INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('scroll', 0, 12.5);
INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('scroll', 1, 25);
INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('scroll', 2, 150);
INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('scroll', 3, 375);
INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('scroll', 4, 700);
INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('scroll', 5, 1125);
INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('scroll', 6, 1650);
INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('scroll', 7, 2275);
INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('scroll', 8, 3000);
INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('scroll', 9, 3825);
INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('wand', 0, 375);
INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('wand', 1, 750);
INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('wand', 2, 4500);
INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('wand', 3, 11250);
INSERT INTO public.min_costs (item_type, spell_level, min_cost) VALUES ('wand', 4, 21000);


--
-- PostgreSQL database dump complete
--

