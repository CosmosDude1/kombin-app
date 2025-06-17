USE KombinApp;
GO

PRINT 'Attempting to fix Gorunurluk column and its dependencies...';
GO

-- Step 1: Find and drop the default constraint for Gorunurluk
DECLARE @ConstraintName NVARCHAR(200);
SELECT @ConstraintName = DC.name 
FROM sys.default_constraints DC
JOIN sys.columns C ON DC.parent_object_id = C.object_id AND DC.parent_column_id = C.column_id
WHERE DC.parent_object_id = OBJECT_ID('Kombinler') AND C.name = 'Gorunurluk';

IF @ConstraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE Kombinler DROP CONSTRAINT ' + @ConstraintName);
    PRINT 'Default constraint ' + @ConstraintName + ' on Gorunurluk column dropped.';
END
ELSE
BEGIN
    PRINT 'No default constraint found for Gorunurluk column.';
END
GO

-- Step 2: Drop the Gorunurluk column if it exists
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Kombinler' AND COLUMN_NAME = 'Gorunurluk')
BEGIN
    ALTER TABLE Kombinler DROP COLUMN Gorunurluk;
    PRINT 'Gorunurluk column dropped.';
END
ELSE
BEGIN
    PRINT 'Gorunurluk column does not exist, no need to drop.';
END
GO

-- Step 3: Add the Gorunurluk column with NVARCHAR(20) type and default value
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Kombinler' AND COLUMN_NAME = 'Gorunurluk')
BEGIN
    ALTER TABLE Kombinler ADD Gorunurluk NVARCHAR(20) DEFAULT 'herkes';
    PRINT 'Gorunurluk column added as NVARCHAR(20) with default value '''herkes'''.';
END
ELSE
BEGIN
    PRINT 'Gorunurluk column somehow still exists after attempting to drop. Please check manually.';
END
GO

-- Step 4: Verify the fix
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'Kombinler' AND COLUMN_NAME = 'Gorunurluk';
GO

PRINT 'Manual fix script for Gorunurluk completed.';
GO

-- Additionally, ensure KapakResimURL is NVARCHAR(MAX)
PRINT 'Ensuring KapakResimURL is NVARCHAR(MAX)...';
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Kombinler' AND COLUMN_NAME = 'KapakResimURL' AND DATA_TYPE = 'nvarchar' AND (CHARACTER_MAXIMUM_LENGTH = -1 OR CHARACTER_MAXIMUM_LENGTH > 1000) )
BEGIN
    PRINT 'KapakResimURL is already NVARCHAR(MAX) or very large.';
END
ELSE
BEGIN
    IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Kombinler' AND COLUMN_NAME = 'KapakResimURL')
    BEGIN
        ALTER TABLE Kombinler ALTER COLUMN KapakResimURL NVARCHAR(MAX);
        PRINT 'KapakResimURL column altered to NVARCHAR(MAX).';
    END
    ELSE
    BEGIN
        ALTER TABLE Kombinler ADD KapakResimURL NVARCHAR(MAX) NULL;
        PRINT 'KapakResimURL column added as NVARCHAR(MAX).';
    END
END
GO

SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'Kombinler' AND COLUMN_NAME = 'KapakResimURL';
GO

PRINT 'Full manual fix script completed.';
GO 