-- Check current database schema for Kombinler table
USE KombinApp;
GO

-- Check all columns in Kombinler table
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'Kombinler'
ORDER BY ORDINAL_POSITION;

-- Show the actual structure
EXEC sp_help 'Kombinler';

-- If we need to fix the Gorunurluk column, run these commands:
-- DROP the column if it exists with wrong type
-- IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Kombinler' AND COLUMN_NAME = 'Gorunurluk')
-- BEGIN
--     ALTER TABLE Kombinler DROP COLUMN Gorunurluk;
--     PRINT 'Dropped existing Gorunurluk column';
-- END

-- Add it back with correct type
-- ALTER TABLE Kombinler ADD Gorunurluk NVARCHAR(20) DEFAULT 'herkes';
-- PRINT 'Added Gorunurluk column with NVARCHAR(20) type';

-- Also fix KapakResimURL if needed
-- ALTER TABLE Kombinler ALTER COLUMN KapakResimURL NVARCHAR(MAX);
-- PRINT 'Modified KapakResimURL to NVARCHAR(MAX)'; 