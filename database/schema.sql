--
-- PostgreSQL database dump
--

-- Dumped from database version 16.9 (Debian 16.9-1.pgdg120+1)
-- Dumped by pg_dump version 16.9 (Debian 16.9-1.pgdg120+1)

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
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: appraisal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appraisal (
    id integer NOT NULL,
    "time" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    characterid integer,
    lootid integer,
    appraisalroll integer,
    believedvalue numeric
);


--
-- Name: appraisal_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.appraisal_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: appraisal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.appraisal_id_seq OWNED BY public.appraisal.id;


--
-- Name: characters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.characters (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    appraisal_bonus integer NOT NULL,
    birthday date,
    deathday date,
    active boolean DEFAULT true,
    user_id integer
);


--
-- Name: characters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.characters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: characters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.characters_id_seq OWNED BY public.characters.id;


--
-- Name: consumableuse; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consumableuse (
    id integer NOT NULL,
    lootid integer,
    who integer,
    "time" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: consumableuse_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.consumableuse_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: consumableuse_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.consumableuse_id_seq OWNED BY public.consumableuse.id;


--
-- Name: crew; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crew (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    race character varying(100),
    age integer,
    description text,
    location_type character varying(20),
    location_id integer,
    ship_position character varying(100),
    is_alive boolean DEFAULT true,
    death_date date,
    departure_date date,
    departure_reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT crew_location_type_check CHECK (((location_type)::text = ANY ((ARRAY['ship'::character varying, 'outpost'::character varying])::text[])))
);


--
-- Name: crew_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crew_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crew_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crew_id_seq OWNED BY public.crew.id;


--
-- Name: fame; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fame (
    id integer NOT NULL,
    character_id integer NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: fame_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fame_history (
    id integer NOT NULL,
    character_id integer NOT NULL,
    points integer NOT NULL,
    reason text,
    added_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    event character varying(255)
);


--
-- Name: fame_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fame_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fame_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fame_history_id_seq OWNED BY public.fame_history.id;


--
-- Name: fame_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fame_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fame_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fame_id_seq OWNED BY public.fame.id;


--
-- Name: favored_ports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favored_ports (
    id integer NOT NULL,
    port_name character varying(255) NOT NULL,
    bonus integer DEFAULT 2 NOT NULL,
    user_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: favored_ports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.favored_ports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: favored_ports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.favored_ports_id_seq OWNED BY public.favored_ports.id;


--
-- Name: game_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_sessions (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    discord_message_id character varying(255),
    discord_channel_id character varying(255)
);


--
-- Name: game_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.game_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: game_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.game_sessions_id_seq OWNED BY public.game_sessions.id;


--
-- Name: golarion_calendar_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golarion_calendar_notes (
    id integer NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    day integer NOT NULL,
    note text NOT NULL
);


--
-- Name: golarion_calendar_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.golarion_calendar_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: golarion_calendar_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.golarion_calendar_notes_id_seq OWNED BY public.golarion_calendar_notes.id;


--
-- Name: golarion_current_date; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golarion_current_date (
    year integer NOT NULL,
    month integer NOT NULL,
    day integer NOT NULL
);


--
-- Name: golarion_weather; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.golarion_weather (
    year integer NOT NULL,
    month integer NOT NULL,
    day integer NOT NULL,
    region character varying(100) NOT NULL,
    condition character varying(50) NOT NULL,
    temp_low integer NOT NULL,
    temp_high integer NOT NULL,
    precipitation_type character varying(20),
    wind_speed integer DEFAULT 5,
    humidity integer DEFAULT 50,
    visibility character varying(20) DEFAULT 'Clear'::character varying,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: gold; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gold (
    id integer NOT NULL,
    session_date timestamp without time zone NOT NULL,
    who integer,
    transaction_type character varying(63) NOT NULL,
    notes character varying(255),
    copper integer,
    silver integer,
    gold integer,
    platinum integer,
    character_id integer
);


--
-- Name: gold_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gold_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gold_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gold_id_seq OWNED BY public.gold.id;


--
-- Name: identify; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.identify (
    id integer NOT NULL,
    lootid integer,
    characterid integer,
    spellcraft_roll integer NOT NULL,
    identified_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    golarion_date text,
    success boolean DEFAULT true
);


--
-- Name: identify_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.identify_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: identify_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.identify_id_seq OWNED BY public.identify.id;


--
-- Name: imposition_uses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.imposition_uses (
    id integer NOT NULL,
    imposition_id integer,
    cost_paid integer NOT NULL,
    user_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: imposition_uses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.imposition_uses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: imposition_uses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.imposition_uses_id_seq OWNED BY public.imposition_uses.id;


--
-- Name: impositions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.impositions (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    cost integer NOT NULL,
    effect text NOT NULL,
    description text,
    threshold_required integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: impositions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.impositions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: impositions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.impositions_id_seq OWNED BY public.impositions.id;


--
-- Name: infamy_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.infamy_history (
    id integer NOT NULL,
    infamy_change integer DEFAULT 0,
    disrepute_change integer DEFAULT 0,
    reason text,
    port character varying(255),
    user_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    golarion_date character varying(20)
);


--
-- Name: infamy_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.infamy_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: infamy_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.infamy_history_id_seq OWNED BY public.infamy_history.id;


--
-- Name: invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invites (
    id integer NOT NULL,
    code character varying(255) NOT NULL,
    created_by integer,
    used_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    used_at timestamp without time zone,
    expires_at timestamp without time zone,
    is_used boolean DEFAULT false
);


--
-- Name: invites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invites_id_seq OWNED BY public.invites.id;


--
-- Name: item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item (
    id integer NOT NULL,
    name character varying(127) NOT NULL,
    type character varying(15) NOT NULL,
    value numeric,
    subtype character varying(31),
    weight double precision,
    casterlevel integer
);


--
-- Name: item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.item_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.item_id_seq OWNED BY public.item.id;


--
-- Name: loot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loot (
    id integer NOT NULL,
    session_date date NOT NULL,
    quantity integer NOT NULL,
    name character varying(255) NOT NULL,
    unidentified boolean,
    masterwork boolean,
    type character varying(15),
    size character varying(15),
    status character varying(15),
    itemid integer,
    modids integer[],
    charges integer,
    value numeric,
    whohas integer,
    whoupdated integer,
    lastupdate timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    notes character varying(511),
    spellcraft_dc integer,
    dm_notes text,
    cursed boolean DEFAULT false
);


--
-- Name: loot_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.loot_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: loot_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.loot_id_seq OWNED BY public.loot.id;


--
-- Name: loot_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.loot_view AS
 WITH quantity_sums AS (
         SELECT loot.name,
            loot.type,
            loot.size,
            loot.unidentified,
            loot.masterwork,
            loot.status,
            sum(loot.quantity) AS total_quantity
           FROM public.loot
          GROUP BY loot.name, loot.type, loot.size, loot.unidentified, loot.masterwork, loot.status
        ), loot_summary AS (
         SELECT min(l.id) AS summary_id,
            l.name,
            l.type,
            l.size,
            l.unidentified,
            l.masterwork,
            qs.total_quantity,
            NULL::numeric AS average_value,
            round(COALESCE(avg(a.believedvalue), NULL::numeric), 2) AS average_appraisal,
            array_agg(DISTINCT c_whohas.name) AS character_names,
            string_agg(DISTINCT (l.notes)::text, ' | '::text) AS notes,
            array_agg(json_build_object('character_name', c_appraisal.name, 'believedvalue', a.believedvalue)) AS appraisals,
            NULL::integer AS id,
            max(l.session_date) AS session_date,
            min(l.itemid) AS itemid,
            min(l.modids) AS modids,
            max(l.lastupdate) AS lastupdate,
                CASE
                    WHEN bool_or(((l.status)::text = 'Pending Sale'::text)) THEN 'Pending Sale'::text
                    ELSE NULL::text
                END AS status,
            l.status AS statuspage
           FROM ((((public.loot l
             LEFT JOIN public.characters c_whohas ON ((l.whohas = c_whohas.id)))
             LEFT JOIN public.appraisal a ON ((l.id = a.lootid)))
             LEFT JOIN public.characters c_appraisal ON ((a.characterid = c_appraisal.id)))
             LEFT JOIN quantity_sums qs ON ((((l.name)::text = (qs.name)::text) AND ((l.type)::text = (qs.type)::text) AND (((l.size)::text = (qs.size)::text) OR ((l.size IS NULL) AND (qs.size IS NULL))) AND ((l.unidentified = qs.unidentified) OR ((l.unidentified IS NULL) AND (qs.unidentified IS NULL))) AND ((l.masterwork = qs.masterwork) OR ((l.masterwork IS NULL) AND (qs.masterwork IS NULL))) AND (((l.status)::text = (qs.status)::text) OR ((l.status IS NULL) AND (qs.status IS NULL))))))
          GROUP BY l.name, l.type, l.size, l.unidentified, l.masterwork, l.status, qs.total_quantity
        ), individual_rows AS (
         SELECT l.id,
            l.session_date,
            l.quantity,
            l.name,
            l.unidentified,
            l.masterwork,
            l.type,
            l.size,
            l.status,
            l.itemid,
            l.modids,
            l.charges,
            l.value,
            l.whohas,
            l.whoupdated,
            l.lastupdate,
            l.notes,
            l.spellcraft_dc,
            l.dm_notes,
            c_whohas.name AS character_name,
            round(COALESCE(avg(a.believedvalue), NULL::numeric), 2) AS average_appraisal,
            array_agg(json_build_object('character_name', c_appraisal.name, 'believedvalue', a.believedvalue)) AS appraisals
           FROM (((public.loot l
             LEFT JOIN public.characters c_whohas ON ((l.whohas = c_whohas.id)))
             LEFT JOIN public.appraisal a ON ((l.id = a.lootid)))
             LEFT JOIN public.characters c_appraisal ON ((a.characterid = c_appraisal.id)))
          GROUP BY l.id, c_whohas.name
        )
 SELECT 'summary'::text AS row_type,
    ls.summary_id AS id,
    ls.session_date,
    ls.total_quantity AS quantity,
    ls.name,
    ls.unidentified,
    ls.masterwork,
    ls.type,
    ls.size,
    ls.average_value AS value,
    ls.itemid,
    ls.modids,
    ls.status,
    ls.statuspage,
    ls.character_names[1] AS character_name,
    NULL::integer AS whoupdated,
    ls.lastupdate,
    ls.average_appraisal,
    ls.notes,
    ls.appraisals
   FROM loot_summary ls
UNION ALL
 SELECT 'individual'::text AS row_type,
    ir.id,
    ir.session_date,
    ir.quantity,
    ir.name,
    ir.unidentified,
    ir.masterwork,
    ir.type,
    ir.size,
    ir.value,
    ir.itemid,
    ir.modids,
    ir.status,
    ir.status AS statuspage,
    ir.character_name,
    ir.whoupdated,
    ir.lastupdate,
    ir.average_appraisal,
    ir.notes,
    ir.appraisals
   FROM individual_rows ir
  ORDER BY 1, 5, 2;


--
-- Name: min_caster_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.min_caster_levels (
    spell_level integer NOT NULL,
    min_caster_level integer
);


--
-- Name: min_costs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.min_costs (
    item_type character varying(10) NOT NULL,
    spell_level integer NOT NULL,
    min_cost numeric
);


--
-- Name: mod; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mod (
    id integer NOT NULL,
    name character varying(255),
    plus integer,
    type character varying(31),
    valuecalc character varying(255),
    target character varying(31),
    subtarget character varying(31),
    casterlevel integer
);


--
-- Name: mod_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mod_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mod_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mod_id_seq OWNED BY public.mod.id;


--
-- Name: outposts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outposts (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    location character varying(255),
    access_date date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: outposts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.outposts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: outposts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.outposts_id_seq OWNED BY public.outposts.id;


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.password_reset_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id integer DEFAULT nextval('public.password_reset_tokens_id_seq'::regclass) NOT NULL,
    user_id integer NOT NULL,
    token character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: port_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.port_visits (
    id integer NOT NULL,
    port_name character varying(255) NOT NULL,
    threshold integer NOT NULL,
    infamy_gained integer NOT NULL,
    skill_used character varying(50),
    plunder_spent integer DEFAULT 0,
    user_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: port_visits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.port_visits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: port_visits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.port_visits_id_seq OWNED BY public.port_visits.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    id integer NOT NULL,
    filename character varying(255) NOT NULL,
    applied_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schema_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schema_migrations_id_seq OWNED BY public.schema_migrations.id;


--
-- Name: session_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_attendance (
    id integer NOT NULL,
    session_id integer,
    user_id integer,
    character_id integer,
    status character varying(20) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT session_attendance_status_check CHECK (((status)::text = ANY ((ARRAY['accepted'::character varying, 'declined'::character varying, 'tentative'::character varying])::text[])))
);


--
-- Name: session_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.session_attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: session_attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.session_attendance_id_seq OWNED BY public.session_attendance.id;


--
-- Name: session_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_messages (
    message_id character varying(20) NOT NULL,
    channel_id character varying(20) NOT NULL,
    session_date timestamp without time zone NOT NULL,
    session_time timestamp without time zone NOT NULL,
    responses jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    value text NOT NULL,
    value_type character varying(50) DEFAULT 'integer'::character varying NOT NULL,
    description text
);


--
-- Name: settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.settings_id_seq OWNED BY public.settings.id;


--
-- Name: ship_infamy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ship_infamy (
    id integer NOT NULL,
    infamy integer DEFAULT 0 NOT NULL,
    disrepute integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: ships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ships (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    location character varying(255),
    is_squibbing boolean DEFAULT false,
    damage integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    base_ac integer DEFAULT 10,
    touch_ac integer DEFAULT 10,
    hardness integer DEFAULT 0,
    max_hp integer DEFAULT 100,
    current_hp integer DEFAULT 100,
    cmb integer DEFAULT 0,
    cmd integer DEFAULT 10,
    saves integer DEFAULT 0,
    initiative integer DEFAULT 0,
    legacy_damage integer,
    plunder integer DEFAULT 0,
    infamy integer DEFAULT 0,
    disrepute integer DEFAULT 0,
    sails_oars character varying(100),
    sailing_check_bonus integer DEFAULT 0,
    weapons jsonb DEFAULT '[]'::jsonb,
    officers jsonb DEFAULT '[]'::jsonb,
    improvements jsonb DEFAULT '[]'::jsonb,
    cargo_manifest jsonb DEFAULT '{"items": [], "passengers": [], "impositions": []}'::jsonb,
    ship_notes text,
    captain_name character varying(255),
    flag_description text,
    ship_type character varying(50),
    size character varying(20) DEFAULT 'Colossal'::character varying,
    cost integer DEFAULT 0,
    max_speed integer DEFAULT 30,
    acceleration integer DEFAULT 15,
    propulsion character varying(100),
    min_crew integer DEFAULT 1,
    max_crew integer DEFAULT 10,
    cargo_capacity integer DEFAULT 10000,
    max_passengers integer DEFAULT 10,
    decks integer DEFAULT 1,
    ramming_damage character varying(20) DEFAULT '1d8'::character varying,
    status character varying(20) DEFAULT 'Active'::character varying,
    CONSTRAINT ships_ac_check CHECK (((base_ac >= 0) AND (base_ac <= 50) AND (touch_ac >= 0) AND (touch_ac <= 50))),
    CONSTRAINT ships_campaign_stats_check CHECK (((plunder >= 0) AND (infamy >= 0) AND (disrepute >= 0))),
    CONSTRAINT ships_capacity_check CHECK (((cargo_capacity >= 0) AND (max_passengers >= 0))),
    CONSTRAINT ships_crew_check CHECK (((min_crew >= 0) AND (max_crew >= min_crew))),
    CONSTRAINT ships_hp_check CHECK (((current_hp >= 0) AND (current_hp <= max_hp))),
    CONSTRAINT ships_status_check CHECK (((status)::text = ANY ((ARRAY['PC Active'::character varying, 'Active'::character varying, 'Docked'::character varying, 'Lost'::character varying, 'Sunk'::character varying])::text[])))
);


--
-- Name: COLUMN ships.base_ac; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.base_ac IS 'Base armor class (before pilot bonuses)';


--
-- Name: COLUMN ships.touch_ac; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.touch_ac IS 'Touch armor class';


--
-- Name: COLUMN ships.hardness; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.hardness IS 'Damage reduction from hardness';


--
-- Name: COLUMN ships.max_hp; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.max_hp IS 'Maximum hit points of the ship';


--
-- Name: COLUMN ships.current_hp; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.current_hp IS 'Current hit points of the ship';


--
-- Name: COLUMN ships.cmb; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.cmb IS 'Combat Maneuver Bonus';


--
-- Name: COLUMN ships.cmd; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.cmd IS 'Combat Maneuver Defense';


--
-- Name: COLUMN ships.saves; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.saves IS 'Base save bonus';


--
-- Name: COLUMN ships.initiative; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.initiative IS 'Initiative modifier';


--
-- Name: COLUMN ships.legacy_damage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.legacy_damage IS 'Backup of old damage percentage system';


--
-- Name: COLUMN ships.plunder; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.plunder IS 'Current plunder points for pirate campaigns';


--
-- Name: COLUMN ships.infamy; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.infamy IS 'Current infamy score for pirate campaigns';


--
-- Name: COLUMN ships.disrepute; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.disrepute IS 'Current disrepute score for pirate campaigns';


--
-- Name: COLUMN ships.sails_oars; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.sails_oars IS 'Description of sails and oars configuration';


--
-- Name: COLUMN ships.sailing_check_bonus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.sailing_check_bonus IS 'Bonus to sailing checks from modifications';


--
-- Name: COLUMN ships.weapons; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.weapons IS 'Array of ship weapons with full statistics';


--
-- Name: COLUMN ships.officers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.officers IS 'Array of ship officers with positions';


--
-- Name: COLUMN ships.improvements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.improvements IS 'Array of ship improvements and modifications';


--
-- Name: COLUMN ships.cargo_manifest; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.cargo_manifest IS 'Detailed cargo, passengers, and impositions tracking';


--
-- Name: COLUMN ships.ship_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.ship_notes IS 'General notes about the ship';


--
-- Name: COLUMN ships.captain_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.captain_name IS 'Name of the current captain';


--
-- Name: COLUMN ships.flag_description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ships.flag_description IS 'Description of the ship flag or colors';


--
-- Name: ships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ships_id_seq OWNED BY public.ships.id;


--
-- Name: sold; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sold (
    id integer NOT NULL,
    lootid integer,
    soldfor numeric,
    soldon date
);


--
-- Name: sold_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sold_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sold_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sold_id_seq OWNED BY public.sold.id;


--
-- Name: spells; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spells (
    id integer NOT NULL,
    name character varying(255),
    type character varying(255),
    school character varying(255),
    subschool character varying(255),
    class character varying[] DEFAULT ARRAY[]::character varying[],
    domain character varying(255),
    spelllevel integer,
    item character varying[] DEFAULT ARRAY[]::character varying[],
    source character varying(255)
);


--
-- Name: spells_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.spells_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: spells_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.spells_id_seq OWNED BY public.spells.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    role character varying(7) NOT NULL,
    joined timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    login_attempts integer DEFAULT 0,
    locked_until timestamp without time zone,
    email character varying(255) NOT NULL,
    google_id character varying(255),
    discord_id character varying(20)
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: weather_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weather_regions (
    region_name character varying(100) NOT NULL,
    base_temp_low integer NOT NULL,
    base_temp_high integer NOT NULL,
    temp_variance integer DEFAULT 15 NOT NULL,
    precipitation_chance numeric(3,2) DEFAULT 0.30 NOT NULL,
    storm_chance numeric(3,2) DEFAULT 0.05 NOT NULL,
    storm_season_months integer[] DEFAULT ARRAY[0, 1, 2, 9, 10, 11],
    hurricane_chance numeric(3,2) DEFAULT 0.02,
    hurricane_season_months integer[] DEFAULT ARRAY[5, 6, 7, 8],
    seasonal_temp_adjustment json NOT NULL
);


--
-- Name: appraisal id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appraisal ALTER COLUMN id SET DEFAULT nextval('public.appraisal_id_seq'::regclass);


--
-- Name: characters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters ALTER COLUMN id SET DEFAULT nextval('public.characters_id_seq'::regclass);


--
-- Name: consumableuse id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumableuse ALTER COLUMN id SET DEFAULT nextval('public.consumableuse_id_seq'::regclass);


--
-- Name: crew id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crew ALTER COLUMN id SET DEFAULT nextval('public.crew_id_seq'::regclass);


--
-- Name: fame id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fame ALTER COLUMN id SET DEFAULT nextval('public.fame_id_seq'::regclass);


--
-- Name: fame_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fame_history ALTER COLUMN id SET DEFAULT nextval('public.fame_history_id_seq'::regclass);


--
-- Name: favored_ports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favored_ports ALTER COLUMN id SET DEFAULT nextval('public.favored_ports_id_seq'::regclass);


--
-- Name: game_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_sessions ALTER COLUMN id SET DEFAULT nextval('public.game_sessions_id_seq'::regclass);


--
-- Name: golarion_calendar_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golarion_calendar_notes ALTER COLUMN id SET DEFAULT nextval('public.golarion_calendar_notes_id_seq'::regclass);


--
-- Name: gold id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gold ALTER COLUMN id SET DEFAULT nextval('public.gold_id_seq'::regclass);


--
-- Name: identify id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identify ALTER COLUMN id SET DEFAULT nextval('public.identify_id_seq'::regclass);


--
-- Name: imposition_uses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imposition_uses ALTER COLUMN id SET DEFAULT nextval('public.imposition_uses_id_seq'::regclass);


--
-- Name: impositions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impositions ALTER COLUMN id SET DEFAULT nextval('public.impositions_id_seq'::regclass);


--
-- Name: infamy_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infamy_history ALTER COLUMN id SET DEFAULT nextval('public.infamy_history_id_seq'::regclass);


--
-- Name: invites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites ALTER COLUMN id SET DEFAULT nextval('public.invites_id_seq'::regclass);


--
-- Name: item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item ALTER COLUMN id SET DEFAULT nextval('public.item_id_seq'::regclass);


--
-- Name: loot id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loot ALTER COLUMN id SET DEFAULT nextval('public.loot_id_seq'::regclass);


--
-- Name: mod id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod ALTER COLUMN id SET DEFAULT nextval('public.mod_id_seq'::regclass);


--
-- Name: outposts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outposts ALTER COLUMN id SET DEFAULT nextval('public.outposts_id_seq'::regclass);


--
-- Name: port_visits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.port_visits ALTER COLUMN id SET DEFAULT nextval('public.port_visits_id_seq'::regclass);


--
-- Name: schema_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations ALTER COLUMN id SET DEFAULT nextval('public.schema_migrations_id_seq'::regclass);


--
-- Name: session_attendance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance ALTER COLUMN id SET DEFAULT nextval('public.session_attendance_id_seq'::regclass);


--
-- Name: settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings ALTER COLUMN id SET DEFAULT nextval('public.settings_id_seq'::regclass);


--
-- Name: ships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ships ALTER COLUMN id SET DEFAULT nextval('public.ships_id_seq'::regclass);


--
-- Name: sold id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sold ALTER COLUMN id SET DEFAULT nextval('public.sold_id_seq'::regclass);


--
-- Name: spells id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spells ALTER COLUMN id SET DEFAULT nextval('public.spells_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: appraisal appraisal_characterid_lootid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appraisal
    ADD CONSTRAINT appraisal_characterid_lootid_key UNIQUE (characterid, lootid);


--
-- Name: appraisal appraisal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appraisal
    ADD CONSTRAINT appraisal_pkey PRIMARY KEY (id);


--
-- Name: characters characters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_pkey PRIMARY KEY (id);


--
-- Name: consumableuse consumableuse_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumableuse
    ADD CONSTRAINT consumableuse_pkey PRIMARY KEY (id);


--
-- Name: crew crew_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crew
    ADD CONSTRAINT crew_pkey PRIMARY KEY (id);


--
-- Name: fame fame_character_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fame
    ADD CONSTRAINT fame_character_id_key UNIQUE (character_id);


--
-- Name: fame_history fame_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fame_history
    ADD CONSTRAINT fame_history_pkey PRIMARY KEY (id);


--
-- Name: fame fame_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fame
    ADD CONSTRAINT fame_pkey PRIMARY KEY (id);


--
-- Name: favored_ports favored_ports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favored_ports
    ADD CONSTRAINT favored_ports_pkey PRIMARY KEY (id);


--
-- Name: favored_ports favored_ports_port_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favored_ports
    ADD CONSTRAINT favored_ports_port_name_key UNIQUE (port_name);


--
-- Name: game_sessions game_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_sessions
    ADD CONSTRAINT game_sessions_pkey PRIMARY KEY (id);


--
-- Name: golarion_calendar_notes golarion_calendar_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golarion_calendar_notes
    ADD CONSTRAINT golarion_calendar_notes_pkey PRIMARY KEY (id);


--
-- Name: golarion_calendar_notes golarion_calendar_notes_year_month_day_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golarion_calendar_notes
    ADD CONSTRAINT golarion_calendar_notes_year_month_day_key UNIQUE (year, month, day);


--
-- Name: golarion_weather golarion_weather_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golarion_weather
    ADD CONSTRAINT golarion_weather_pkey PRIMARY KEY (year, month, day, region);


--
-- Name: gold gold_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gold
    ADD CONSTRAINT gold_pkey PRIMARY KEY (id);


--
-- Name: identify identify_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identify
    ADD CONSTRAINT identify_pkey PRIMARY KEY (id);


--
-- Name: imposition_uses imposition_uses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imposition_uses
    ADD CONSTRAINT imposition_uses_pkey PRIMARY KEY (id);


--
-- Name: impositions impositions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impositions
    ADD CONSTRAINT impositions_pkey PRIMARY KEY (id);


--
-- Name: infamy_history infamy_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infamy_history
    ADD CONSTRAINT infamy_history_pkey PRIMARY KEY (id);


--
-- Name: invites invites_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_code_key UNIQUE (code);


--
-- Name: invites invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_pkey PRIMARY KEY (id);


--
-- Name: item item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item
    ADD CONSTRAINT item_pkey PRIMARY KEY (id);


--
-- Name: loot loot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loot
    ADD CONSTRAINT loot_pkey PRIMARY KEY (id);


--
-- Name: min_caster_levels min_caster_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.min_caster_levels
    ADD CONSTRAINT min_caster_levels_pkey PRIMARY KEY (spell_level);


--
-- Name: min_costs min_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.min_costs
    ADD CONSTRAINT min_costs_pkey PRIMARY KEY (item_type, spell_level);


--
-- Name: mod mod_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod
    ADD CONSTRAINT mod_pkey PRIMARY KEY (id);


--
-- Name: outposts outposts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outposts
    ADD CONSTRAINT outposts_pkey PRIMARY KEY (id);


--
-- Name: port_visits port_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.port_visits
    ADD CONSTRAINT port_visits_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_filename_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_filename_key UNIQUE (filename);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);


--
-- Name: session_attendance session_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_pkey PRIMARY KEY (id);


--
-- Name: session_attendance session_attendance_session_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_session_id_user_id_key UNIQUE (session_id, user_id);


--
-- Name: session_messages session_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_messages
    ADD CONSTRAINT session_messages_pkey PRIMARY KEY (message_id);


--
-- Name: settings settings_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_name_key UNIQUE (name);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: ship_infamy ship_infamy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ship_infamy
    ADD CONSTRAINT ship_infamy_pkey PRIMARY KEY (id);


--
-- Name: ships ships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ships
    ADD CONSTRAINT ships_pkey PRIMARY KEY (id);


--
-- Name: sold sold_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sold
    ADD CONSTRAINT sold_pkey PRIMARY KEY (id);


--
-- Name: spells spells_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spells
    ADD CONSTRAINT spells_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: weather_regions weather_regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_regions
    ADD CONSTRAINT weather_regions_pkey PRIMARY KEY (region_name);


--
-- Name: fame_character_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fame_character_id_idx ON public.fame USING btree (character_id);


--
-- Name: idx_characters_active_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_characters_active_user ON public.characters USING btree (user_id, active) WHERE (active = true);


--
-- Name: idx_consumableuse_lootid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumableuse_lootid ON public.consumableuse USING btree (lootid);


--
-- Name: idx_crew_is_alive; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crew_is_alive ON public.crew USING btree (is_alive);


--
-- Name: idx_crew_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crew_location ON public.crew USING btree (location_type, location_id);


--
-- Name: idx_crew_ship_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crew_ship_position ON public.crew USING btree (ship_position);


--
-- Name: idx_fame_character_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fame_character_id ON public.fame USING btree (character_id);


--
-- Name: idx_fame_history_character_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fame_history_character_id ON public.fame_history USING btree (character_id);


--
-- Name: idx_fame_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fame_history_created_at ON public.fame_history USING btree (created_at);


--
-- Name: idx_gold_character_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gold_character_transaction ON public.gold USING btree (character_id, transaction_type);


--
-- Name: idx_identify_loot_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_identify_loot_date ON public.identify USING btree (lootid, golarion_date);


--
-- Name: idx_invites_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invites_code ON public.invites USING btree (code);


--
-- Name: idx_item_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_name_trgm ON public.item USING gin (name public.gin_trgm_ops);


--
-- Name: idx_loot_compound; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loot_compound ON public.loot USING btree (status, unidentified, session_date);


--
-- Name: idx_loot_cursed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loot_cursed ON public.loot USING btree (cursed);


--
-- Name: idx_loot_session_date_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loot_session_date_desc ON public.loot USING btree (session_date DESC);


--
-- Name: idx_loot_status_whohas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loot_status_whohas ON public.loot USING btree (status, whohas) WHERE (status IS NOT NULL);


--
-- Name: idx_loot_unidentified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loot_unidentified ON public.loot USING btree (unidentified) WHERE (unidentified = true);


--
-- Name: idx_mod_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mod_name_trgm ON public.mod USING gin (name public.gin_trgm_ops);


--
-- Name: idx_password_reset_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_expires_at ON public.password_reset_tokens USING btree (expires_at);


--
-- Name: idx_password_reset_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_token ON public.password_reset_tokens USING btree (token);


--
-- Name: idx_password_reset_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);


--
-- Name: idx_session_attendance_character_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_attendance_character_id ON public.session_attendance USING btree (character_id);


--
-- Name: idx_session_attendance_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_attendance_session_id ON public.session_attendance USING btree (session_id);


--
-- Name: idx_session_attendance_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_attendance_user_id ON public.session_attendance USING btree (user_id);


--
-- Name: idx_ships_cargo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ships_cargo ON public.ships USING gin (cargo_manifest);


--
-- Name: idx_ships_improvements; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ships_improvements ON public.ships USING gin (improvements);


--
-- Name: idx_ships_officers; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ships_officers ON public.ships USING gin (officers);


--
-- Name: idx_ships_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ships_status ON public.ships USING btree (status);


--
-- Name: idx_ships_weapons; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ships_weapons ON public.ships USING gin (weapons);


--
-- Name: idx_sold_lootid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sold_lootid ON public.sold USING btree (lootid);


--
-- Name: idx_weather_date_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weather_date_region ON public.golarion_weather USING btree (year, month, day, region);


--
-- Name: unique_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_name ON public.settings USING btree (name);


--
-- Name: users_discord_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_discord_id_key ON public.users USING btree (discord_id);


--
-- Name: users_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_idx ON public.users USING btree (email);


--
-- Name: users_google_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_google_id_key ON public.users USING btree (google_id);


--
-- Name: appraisal appraisal_characterid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appraisal
    ADD CONSTRAINT appraisal_characterid_fkey FOREIGN KEY (characterid) REFERENCES public.characters(id);


--
-- Name: appraisal appraisal_lootid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appraisal
    ADD CONSTRAINT appraisal_lootid_fkey FOREIGN KEY (lootid) REFERENCES public.loot(id);


--
-- Name: characters characters_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: consumableuse consumableuse_lootid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumableuse
    ADD CONSTRAINT consumableuse_lootid_fkey FOREIGN KEY (lootid) REFERENCES public.loot(id);


--
-- Name: consumableuse consumableuse_who_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumableuse
    ADD CONSTRAINT consumableuse_who_fkey FOREIGN KEY (who) REFERENCES public.characters(id);


--
-- Name: fame fame_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fame
    ADD CONSTRAINT fame_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: fame_history fame_history_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fame_history
    ADD CONSTRAINT fame_history_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: fame_history fame_history_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fame_history
    ADD CONSTRAINT fame_history_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: favored_ports favored_ports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favored_ports
    ADD CONSTRAINT favored_ports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: golarion_weather golarion_weather_region_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.golarion_weather
    ADD CONSTRAINT golarion_weather_region_fkey FOREIGN KEY (region) REFERENCES public.weather_regions(region_name);


--
-- Name: gold gold_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gold
    ADD CONSTRAINT gold_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id);


--
-- Name: gold gold_who_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gold
    ADD CONSTRAINT gold_who_fkey FOREIGN KEY (who) REFERENCES public.users(id);


--
-- Name: identify identify_characterid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identify
    ADD CONSTRAINT identify_characterid_fkey FOREIGN KEY (characterid) REFERENCES public.characters(id);


--
-- Name: identify identify_lootid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identify
    ADD CONSTRAINT identify_lootid_fkey FOREIGN KEY (lootid) REFERENCES public.loot(id);


--
-- Name: imposition_uses imposition_uses_imposition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imposition_uses
    ADD CONSTRAINT imposition_uses_imposition_id_fkey FOREIGN KEY (imposition_id) REFERENCES public.impositions(id);


--
-- Name: imposition_uses imposition_uses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imposition_uses
    ADD CONSTRAINT imposition_uses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: infamy_history infamy_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.infamy_history
    ADD CONSTRAINT infamy_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: invites invites_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: invites invites_used_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_used_by_fkey FOREIGN KEY (used_by) REFERENCES public.users(id);


--
-- Name: loot loot_itemid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loot
    ADD CONSTRAINT loot_itemid_fkey FOREIGN KEY (itemid) REFERENCES public.item(id);


--
-- Name: loot loot_whohas_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loot
    ADD CONSTRAINT loot_whohas_fkey FOREIGN KEY (whohas) REFERENCES public.characters(id);


--
-- Name: loot loot_whoupdated_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loot
    ADD CONSTRAINT loot_whoupdated_fkey FOREIGN KEY (whoupdated) REFERENCES public.users(id);


--
-- Name: port_visits port_visits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.port_visits
    ADD CONSTRAINT port_visits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: session_attendance session_attendance_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id);


--
-- Name: session_attendance session_attendance_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.game_sessions(id) ON DELETE CASCADE;


--
-- Name: session_attendance session_attendance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_attendance
    ADD CONSTRAINT session_attendance_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: sold sold_lootid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sold
    ADD CONSTRAINT sold_lootid_fkey FOREIGN KEY (lootid) REFERENCES public.loot(id);


--
-- PostgreSQL database dump complete
--

