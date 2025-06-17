-- KombinApp Database Table Alterations
-- Creation Date: 2024
-- Description: SQL commands to modify existing tables if needed

USE KombinApp;
GO

-- Add new columns to Kullanicilar table
ALTER TABLE Kullanicilar ADD TelefonNumarasi NVARCHAR(20) NULL;
ALTER TABLE Kullanicilar ADD Ulke NVARCHAR(50) NULL;
ALTER TABLE Kullanicilar ADD Sehir NVARCHAR(50) NULL;

-- Add missing columns to Kombinler table for sharing functionality
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Kombinler' AND COLUMN_NAME = 'PaylasildiMi')
BEGIN
    ALTER TABLE Kombinler ADD PaylasildiMi BIT DEFAULT 1;
    PRINT 'PaylasildiMi column added to Kombinler table.';
END
ELSE
BEGIN
    PRINT 'PaylasildiMi column already exists in Kombinler table.';
END

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Kombinler' AND COLUMN_NAME = 'Gorunurluk')
BEGIN
    ALTER TABLE Kombinler ADD Gorunurluk NVARCHAR(20) DEFAULT 'herkes';
    PRINT 'Gorunurluk column added to Kombinler table.';
END
ELSE
BEGIN
    PRINT 'Gorunurluk column already exists in Kombinler table.';
END

-- Modify KapakResimURL column to handle base64 image data
ALTER TABLE Kombinler ALTER COLUMN KapakResimURL NVARCHAR(MAX);
PRINT 'KapakResimURL column modified to NVARCHAR(MAX) for base64 support.';

-- Add Yorumlar table for comments system
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Yorumlar' AND xtype='U')
BEGIN
    CREATE TABLE Yorumlar (
        YorumID INT IDENTITY(1,1) PRIMARY KEY,
        KullaniciID INT NOT NULL,
        KombinID INT NOT NULL,
        YorumMetni NVARCHAR(500) NOT NULL,
        YorumTarihi DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (KullaniciID) REFERENCES Kullanicilar(KullaniciID),
        FOREIGN KEY (KombinID) REFERENCES Kombinler(KombinID)
    );
    PRINT 'Yorumlar tablosu oluşturuldu.';
END
ELSE
BEGIN
    PRINT 'Yorumlar tablosu zaten mevcut.';
END
GO

-- Add index for performance
CREATE NONCLUSTERED INDEX IX_Yorumlar_KombinID ON Yorumlar(KombinID);
CREATE NONCLUSTERED INDEX IX_Yorumlar_KullaniciID ON Yorumlar(KullaniciID);

-- Example: Add new columns to existing tables
-- Uncomment and modify as needed

-- Add new column to Users table
-- ALTER TABLE Kullanicilar ADD YeniSutun NVARCHAR(100) NULL;

-- Add new column to Clothes table  
-- ALTER TABLE Kiyafetler ADD YeniOzellik NVARCHAR(50) NULL;

-- Add new column to Combinations table
-- ALTER TABLE Kombinler ADD YeniAlan NVARCHAR(200) NULL;

-- Modify existing column data type (be careful with data loss)
-- ALTER TABLE Kullanicilar ALTER COLUMN Email NVARCHAR(150) NULL;

-- Drop a column (be careful with data loss)
-- ALTER TABLE Kullanicilar DROP COLUMN UnnecessaryColumn;

-- Add index for performance
-- CREATE NONCLUSTERED INDEX IX_Kiyafetler_Kategori ON Kiyafetler(Kategori);

PRINT 'Table alterations completed (if any were uncommented)';
GO 