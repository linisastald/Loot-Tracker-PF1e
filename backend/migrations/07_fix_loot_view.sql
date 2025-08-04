-- Migration: Fix loot_view - convert from table back to proper view
-- This fixes the issue where loot_view was incorrectly created as a table instead of a view

-- Drop the incorrect table
DROP TABLE IF EXISTS public.loot_view;

-- Create the correct view
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