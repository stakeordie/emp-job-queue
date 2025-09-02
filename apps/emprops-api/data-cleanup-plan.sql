-- Data Recovery & Cleanup Plan for component_flat_file orphaned records
-- Execute these steps in order

-- Step 1: Create recovery table for orphaned records
CREATE TABLE "component_flat_file_recover" (
    "id" BIGINT PRIMARY KEY,
    "component_id" BIGINT NOT NULL,
    "flat_file_id" BIGINT NOT NULL,
    "recovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issue_type" TEXT NOT NULL -- 'missing_flat_file' or 'missing_component'
);

-- Step 2: Check current orphaned record counts
SELECT 
  'Missing flat_file' as issue_type,
  COUNT(*) as count
FROM component_flat_file cff
LEFT JOIN flat_file ff ON cff.flat_file_id = ff.id
WHERE ff.id IS NULL

UNION ALL

SELECT 
  'Missing component' as issue_type,
  COUNT(*) as count  
FROM component_flat_file cff
LEFT JOIN component c ON cff.component_id = c.id
WHERE c.id IS NULL;

-- Step 3: Move orphaned records (missing flat_file) to recovery table
INSERT INTO component_flat_file_recover (id, component_id, flat_file_id, issue_type)
SELECT cff.id, cff.component_id, cff.flat_file_id, 'missing_flat_file'
FROM component_flat_file cff
LEFT JOIN flat_file ff ON cff.flat_file_id = ff.id
WHERE ff.id IS NULL;

-- Step 4: Move orphaned records (missing component) to recovery table  
INSERT INTO component_flat_file_recover (id, component_id, flat_file_id, issue_type)
SELECT cff.id, cff.component_id, cff.flat_file_id, 'missing_component'
FROM component_flat_file cff
LEFT JOIN component c ON cff.component_id = c.id
WHERE c.id IS NULL;

-- Step 5: Delete orphaned component_flat_file records (missing flat_file)
DELETE FROM component_flat_file cff
WHERE NOT EXISTS (
    SELECT 1 FROM flat_file ff WHERE ff.id = cff.flat_file_id
);

-- Step 6: Delete orphaned component_flat_file records (missing component) and their flat_files
-- First, delete the flat_file records for missing components
DELETE FROM flat_file ff
WHERE EXISTS (
    SELECT 1 FROM component_flat_file cff
    WHERE cff.flat_file_id = ff.id
    AND NOT EXISTS (SELECT 1 FROM component c WHERE c.id = cff.component_id)
);

-- Then delete the component_flat_file records for missing components
DELETE FROM component_flat_file cff
WHERE NOT EXISTS (
    SELECT 1 FROM component c WHERE c.id = cff.component_id
);

-- Step 7: Verify cleanup
SELECT 
  'After cleanup - Missing flat_file' as issue_type,
  COUNT(*) as count
FROM component_flat_file cff
LEFT JOIN flat_file ff ON cff.flat_file_id = ff.id
WHERE ff.id IS NULL

UNION ALL

SELECT 
  'After cleanup - Missing component' as issue_type,
  COUNT(*) as count  
FROM component_flat_file cff
LEFT JOIN component c ON cff.component_id = c.id
WHERE c.id IS NULL;

-- Step 8: Check recovery table contents
SELECT issue_type, COUNT(*) as recovered_count
FROM component_flat_file_recover
GROUP BY issue_type;