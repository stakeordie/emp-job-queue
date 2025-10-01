-- ============================================================================
-- Backfill miniapp_collection_config for Historical Miniapp Collections
-- ============================================================================
-- Purpose: Create miniapp_collection_config records for all miniapp collections
--          that existed before the config table was introduced.
--
-- Background: The miniapp_collection_config table was recently introduced to
--             manage miniapp settings. Collections created before this need
--             config records with proper defaults.
--
-- ============================================================================

-- STEP 1: Identify the date threshold
-- ============================================================================
-- Find the earliest created_at date in miniapp_collection_config
-- This tells us when the table started being populated automatically

SELECT
    'Date Threshold Analysis' as analysis_step,
    MIN(created_at) as earliest_config_created,
    MAX(created_at) as latest_config_created,
    COUNT(*) as total_configs
FROM miniapp_collection_config;

-- ============================================================================
-- STEP 2: Find collections that should be miniapp collections
-- ============================================================================
-- A collection is a miniapp collection if it has:
-- - miniapp_cover_image (indicates it's configured for miniapp)
-- - cast_hash (indicates it's associated with a Farcaster frame)
-- - is_custodial = true (indicates it's managed by the miniapp system)
-- - OR has related miniapp_generation or miniapp_payment records

-- First, let's identify what makes a collection a "miniapp collection"
-- by examining existing configs:
SELECT
    'Existing Configs Analysis' as analysis_step,
    COUNT(*) as total_configs,
    COUNT(DISTINCT c.id) as collections_with_config,
    COUNT(DISTINCT CASE WHEN c.miniapp_cover_image IS NOT NULL THEN c.id END) as has_miniapp_cover,
    COUNT(DISTINCT CASE WHEN c.cast_hash IS NOT NULL THEN c.id END) as has_cast_hash,
    COUNT(DISTINCT CASE WHEN c.is_custodial = true THEN c.id END) as is_custodial
FROM miniapp_collection_config mcc
JOIN collection c ON c.id = mcc.collection_id;

-- ============================================================================
-- STEP 3: Find miniapp collections WITHOUT config records
-- ============================================================================
-- This query identifies all collections that should have a config but don't

WITH miniapp_collections AS (
    SELECT DISTINCT c.id as collection_id
    FROM collection c
    WHERE
        -- Has miniapp indicators
        (c.miniapp_cover_image IS NOT NULL
         OR c.cast_hash IS NOT NULL
         OR c.is_custodial = true)
        -- Has activity in miniapp tables
        OR EXISTS (
            SELECT 1 FROM miniapp_generation mg
            WHERE mg.collection_id = c.id
        )
        OR EXISTS (
            SELECT 1 FROM miniapp_payment mp
            WHERE mp.collection_id = c.id
        )
)
SELECT
    'Missing Configs Report' as report_type,
    COUNT(*) as collections_missing_config,
    MIN(c.created_at) as earliest_collection,
    MAX(c.created_at) as latest_collection
FROM miniapp_collections mc
JOIN collection c ON c.id = mc.collection_id
LEFT JOIN miniapp_collection_config mcc ON mcc.collection_id = mc.collection_id
WHERE mcc.id IS NULL;

-- Show the actual collections missing configs
SELECT
    c.id as collection_id,
    c.title,
    c.created_at as collection_created_at,
    c.miniapp_cover_image IS NOT NULL as has_cover_image,
    c.cast_hash IS NOT NULL as has_cast_hash,
    c.is_custodial,
    (SELECT COUNT(*) FROM miniapp_generation mg WHERE mg.collection_id = c.id) as generation_count,
    (SELECT COUNT(*) FROM miniapp_payment mp WHERE mp.collection_id = c.id) as payment_count
FROM collection c
WHERE
    (c.miniapp_cover_image IS NOT NULL
     OR c.cast_hash IS NOT NULL
     OR c.is_custodial = true
     OR EXISTS (SELECT 1 FROM miniapp_generation mg WHERE mg.collection_id = c.id)
     OR EXISTS (SELECT 1 FROM miniapp_payment mp WHERE mp.collection_id = c.id))
    AND NOT EXISTS (
        SELECT 1 FROM miniapp_collection_config mcc
        WHERE mcc.collection_id = c.id
    )
ORDER BY c.created_at DESC;

-- ============================================================================
-- STEP 4: Generate INSERT statements for missing configs
-- ============================================================================
-- This creates the actual INSERT statement to backfill missing configs
-- Using proper defaults from the schema:
-- - price: 0.75
-- - generations_per_payment: 3
-- - is_active: true
-- - is_visible: true
-- - is_featured: false
-- - max_retries: 2

-- *** REVIEW THIS CAREFULLY BEFORE RUNNING ***
-- This is the actual data modification query

INSERT INTO miniapp_collection_config (
    id,
    collection_id,
    price,
    generations_per_payment,
    is_active,
    is_visible,
    is_featured,
    collection_type,
    max_retries,
    cast_hash,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid() as id,
    c.id as collection_id,
    0.75 as price,
    3 as generations_per_payment,
    true as is_active,
    true as is_visible,
    false as is_featured,
    NULL as collection_type,
    2 as max_retries,
    c.cast_hash as cast_hash,
    c.created_at as created_at,  -- Use collection's creation date
    NOW() as updated_at
FROM collection c
WHERE
    -- Only collections that appear to be miniapp collections
    (c.miniapp_cover_image IS NOT NULL
     OR c.cast_hash IS NOT NULL
     OR c.is_custodial = true
     OR EXISTS (SELECT 1 FROM miniapp_generation mg WHERE mg.collection_id = c.id)
     OR EXISTS (SELECT 1 FROM miniapp_payment mp WHERE mp.collection_id = c.id))
    -- But don't have a config yet
    AND NOT EXISTS (
        SELECT 1 FROM miniapp_collection_config mcc
        WHERE mcc.collection_id = c.id
    );

-- ============================================================================
-- STEP 5: Verification queries (run AFTER the INSERT)
-- ============================================================================

-- Verify all miniapp collections now have configs
SELECT
    'Post-Migration Verification' as verification_step,
    COUNT(DISTINCT c.id) as total_miniapp_collections,
    COUNT(DISTINCT mcc.collection_id) as collections_with_config,
    COUNT(DISTINCT c.id) - COUNT(DISTINCT mcc.collection_id) as still_missing
FROM collection c
LEFT JOIN miniapp_collection_config mcc ON mcc.collection_id = c.id
WHERE
    c.miniapp_cover_image IS NOT NULL
    OR c.cast_hash IS NOT NULL
    OR c.is_custodial = true
    OR EXISTS (SELECT 1 FROM miniapp_generation mg WHERE mg.collection_id = c.id)
    OR EXISTS (SELECT 1 FROM miniapp_payment mp WHERE mp.collection_id = c.id);

-- Show newly created configs
SELECT
    mcc.id,
    mcc.collection_id,
    c.title as collection_title,
    mcc.price,
    mcc.generations_per_payment,
    mcc.is_active,
    mcc.is_visible,
    mcc.created_at,
    mcc.updated_at
FROM miniapp_collection_config mcc
JOIN collection c ON c.id = mcc.collection_id
WHERE mcc.created_at >= (
    -- Show configs created in the last hour (adjust as needed)
    NOW() - INTERVAL '1 hour'
)
ORDER BY mcc.created_at DESC;

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================
-- If something goes wrong, you can remove the newly created configs with:
--
-- DELETE FROM miniapp_collection_config
-- WHERE created_at >= 'YYYY-MM-DD HH:MM:SS'  -- Use the timestamp from STEP 4
-- AND updated_at >= NOW() - INTERVAL '1 hour';
--
-- *** BE VERY CAREFUL WITH ROLLBACK - VERIFY THE TIMESTAMP FIRST ***
-- ============================================================================
