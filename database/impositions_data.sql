-- impositions data export from current database
-- Generated on Mon May 26 00:55:10 EDT 2025

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
-- Data for Name: impositions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (1, 'Yes, Sir!', 2, 'Crew completes mundane tasks in half the time for 1 hour', 'For the next hour, the PCs'' crew completes any mundane tasks they''re assigned in half the expected time. This typically relates to Craft and Profession (sailor) checks made to prepare, maintain, or repair the ship, and cannot be applied to combat or more complex deeds like crafting magic items.', 10, '2025-04-01 12:47:04.051312-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (2, 'Captain''s Orders!', 5, 'Cast fog cloud, heroism, make whole, quench, or whispering wind', 'As a standard action, a PC on board her ship can cast fog cloud, heroism, make whole, quench, or whispering wind with a caster level equal to her character level.', 10, '2025-04-01 12:47:04.051312-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (3, 'Walk the Plank!', 5, 'Sacrifice crew for +2 to all skill checks or attack rolls', 'The PCs may sacrifice one crew member or prisoner to grant themselves and their crew one of two bonuses: either a +2 bonus on all skill checks or a +2 bonus on attack rolls. These bonuses only apply while on board the PCs'' ship and last until either the next day or when the captain leaves the ship.', 10, '2025-04-01 12:47:04.051312-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (4, 'Get Up, You Dogs!', 10, 'Heal everyone on deck with cure light wounds', 'Every PC and allied character on the deck of the PCs'' ship is affected as per the spell cure light wounds, as if cast by a cleric of the PCs'' average party level. This imposition can only be used once per week.', 10, '2025-04-01 12:47:04.051312-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (5, 'Lashings!', 5, 'Double ship speed for 1 day', 'The speed of the PCs'' ship doubles for 1 day.', 20, '2025-04-01 12:47:04.053497-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (6, 'Shiver Me Timbers!', 5, 'Reroll initiative or act in surprise round', 'While on board their ship, the PCs and their entire crew can reroll initiative or roll initiative in what would otherwise be a surprise round. The benefit of this imposition can be used immediately, but only once per week.', 20, '2025-04-01 12:47:04.053497-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (7, 'Besmara''s Blessings!', 10, 'Cast animate rope, control water, remove curse, remove disease, or water breathing', 'As a standard action, a PC on board her ship can cast animate rope, control water, remove curse, remove disease, or water breathing with a caster level equal to her character level.', 20, '2025-04-01 12:47:04.053497-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (8, 'Dead Men Tell No Tales!', 10, 'Automatically confirm a critical hit', 'While on board their ship, the PCs can use this imposition to automatically confirm a threatened critical hit.', 20, '2025-04-01 12:47:04.053497-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (9, 'You''ll Take It!', 5, 'Sell plunder at 50% value regardless of community max', 'The PCs can spend up to 5 points of plunder in 1 day at 50% of its value (regardless of a community''s maximum sale %). This amount cannot be adjusted by skill checks.', 30, '2025-04-01 12:47:04.05549-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (10, 'Honor the Code!', 5, '+4 bonus on Charisma skills against pirates for 24 hours', 'The PCs and their crew gain a +4 bonus on all Charisma-based skill checks made against other pirates for the next 24 hours.', 30, '2025-04-01 12:47:04.05549-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (11, 'Master the Winds!', 10, 'Cast call lightning storm, control winds, mirage arcana, or telekinesis', 'As a standard action, a PC on board her ship can cast call lightning storm, control winds, mirage arcana, or telekinesis with a caster level equal to her character level.', 30, '2025-04-01 12:47:04.05549-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (12, 'Chum the Waters!', 15, 'Summon sharks', 'For every Infamy threshold they possess, the PCs summon 1d4 sharks into the waters surrounding their ship. These sharks are not under the PCs'' control and viciously attack any creature in the water.', 30, '2025-04-01 12:47:04.05549-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (13, 'Evade!', 5, 'Teleport ship 100 feet', 'Teleport your ship''s100 feet in any direction. This imposition can be used once per day.', 40, '2025-04-01 12:47:50.696748-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (14, 'You''ll Take It and Like It!', 10, 'Sell plunder at 100% value regardless of community max', 'The PCs can spend up to 5 points of plunder in 1 day at 100% of its value (regardless of a community''s maximum sale %). This amount cannot be adjusted by skill checks.', 40, '2025-04-01 12:47:50.696748-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (15, 'Master the Waves!', 10, 'Cast control weather, discern location, hero''s feast, or waves of exhaustion', 'As a standard action, a PC on board her ship can cast control weather, discern location, hero''s feast, or waves of exhaustion with a caster level equal to her character level.', 40, '2025-04-01 12:47:50.696748-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (16, 'The Widow''s Scar!', 20, 'Curse enemy for +2 to attack and damage for 1 week', 'Choose one enemy to curse. You and your crew gain a +2 bonus on attack and damage rolls against that NPC for 1 week. The enemy is aware of the curse and who cursed her, and can end the effect with a remove curse spell.', 40, '2025-04-01 12:47:50.696748-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (17, 'More Lashings!', 10, 'Quadruple ship speed for 1 day', 'The speed of the PCs'' ship quadruples for 1 day.', 55, '2025-04-01 12:47:51.326772-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (18, 'The Hungry Sea!', 15, 'Cast elemental swarm, storm of vengeance, or whirlwind', 'A PC aboard her ship may cast elemental swarm, storm of vengeance, or whirlwind as an 17th-level caster.', 55, '2025-04-01 12:47:51.326772-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (19, 'Dive! Dive! Dive!', 20, 'Ship can travel underwater for 1 hour', 'The PCs'' ship submerges and can travel underwater at its normal speed for up to 1 hour. During this time, the vessel is encompassed by a bubble of breathable air and takes no ill effects from the water—even most sea creatures keep their distance. The ship leaves no visible wake upon the waters above, but might be visible in particularly clear water.', 55, '2025-04-01 12:47:51.326772-04');
INSERT INTO public.impositions (id, name, cost, effect, description, threshold_required, created_at) VALUES (20, 'Summon the Serpent!', 25, 'Summon a sea serpent for 10 minutes', 'One sea serpent comes to the aid of the PCs'' ship. This sea monster is under the control of the PCs and serves for 10 minutes before disappearing back into the deep.', 55, '2025-04-01 12:47:51.326772-04');


--
-- Name: impositions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.impositions_id_seq', 20, true);


--
-- PostgreSQL database dump complete
--

