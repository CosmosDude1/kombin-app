-- KombinApp Veritabanı Tabloları
-- Oluşturulma Tarihi: 2024
-- Açıklama: Giyim kombinasyon uygulaması için gerekli tüm tablolar

USE KombinApp;
GO

-- 1. Kullanicilar tablosu (güncellenmiş)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Kullanicilar' AND xtype='U')
BEGIN
    CREATE TABLE Kullanicilar (
        KullaniciID INT IDENTITY(1,1) PRIMARY KEY,
        KullaniciAdi NVARCHAR(50) NOT NULL UNIQUE,
        Sifre NVARCHAR(100) NOT NULL,
        Email NVARCHAR(100) NULL UNIQUE,
        Ad NVARCHAR(50) NULL,
        Soyad NVARCHAR(50) NULL,
        ProfilFotoURL NVARCHAR(500) NULL,
        FavoriStil NVARCHAR(50) NULL,
        Cinsiyet NVARCHAR(10) NULL,
        DogumTarihi DATE NULL,
        KayitTarihi DATETIME DEFAULT GETDATE(),
        SonGirisTarihi DATETIME NULL,
        Aktif BIT DEFAULT 1
    );
    PRINT 'Kullanicilar tablosu oluşturuldu.';
END
ELSE
BEGIN
    PRINT 'Kullanicilar tablosu zaten mevcut.';
END
GO

-- 2. Kiyafetler tablosu
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Kiyafetler' AND xtype='U')
BEGIN
    CREATE TABLE Kiyafetler (
        KiyafetID INT IDENTITY(1,1) PRIMARY KEY,
        KullaniciID INT NOT NULL,
        Isim NVARCHAR(100) NOT NULL,
        Marka NVARCHAR(50) NULL,
        ResimURL NVARCHAR(500) NOT NULL,
        Kategori NVARCHAR(50) NOT NULL,
        AltKategori NVARCHAR(50) NULL,
        Renk NVARCHAR(200) NULL,
        Stil NVARCHAR(50) NULL,
        Cinsiyet NVARCHAR(10) NULL,
        Fiyat DECIMAL(10,2) NULL,
        Mevcut BIT DEFAULT 1,
        VeriKaynagi NVARCHAR(50) NULL,
        EklenmeTarihi DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (KullaniciID) REFERENCES Kullanicilar(KullaniciID)
    );
    PRINT 'Kiyafetler tablosu oluşturuldu.';
END
ELSE
BEGIN
    PRINT 'Kiyafetler tablosu zaten mevcut.';
END
GO

-- 3. Kombinler tablosu
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Kombinler' AND xtype='U')
BEGIN
    CREATE TABLE Kombinler (
        KombinID INT IDENTITY(1,1) PRIMARY KEY,
        KullaniciID INT NOT NULL,
        KombinAdi NVARCHAR(100) NOT NULL,
        Aciklama NVARCHAR(500) NULL,
        KapakResimURL NVARCHAR(500) NULL,
        Stil NVARCHAR(50) NULL,
        Mevsim NVARCHAR(20) NULL,
        Durum NVARCHAR(20) DEFAULT 'Aktif',
        YapayZekaSkor DECIMAL(3,2) NULL,
        BegeniSayisi INT DEFAULT 0,
        GoruntulenmeSayisi INT DEFAULT 0,
        OlusturulmaTarihi DATETIME DEFAULT GETDATE(),
        GuncellenmeTarihi DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (KullaniciID) REFERENCES Kullanicilar(KullaniciID)
    );
    PRINT 'Kombinler tablosu oluşturuldu.';
END
ELSE
BEGIN
    PRINT 'Kombinler tablosu zaten mevcut.';
END
GO

-- 4. KombinKiyafetleri ilişki tablosu
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='KombinKiyafetleri' AND xtype='U')
BEGIN
    CREATE TABLE KombinKiyafetleri (
        KombinKiyafetID INT IDENTITY(1,1) PRIMARY KEY,
        KombinID INT NOT NULL,
        KiyafetID INT NOT NULL,
        Sira INT NULL,
        EklenmeTarihi DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (KombinID) REFERENCES Kombinler(KombinID),
        FOREIGN KEY (KiyafetID) REFERENCES Kiyafetler(KiyafetID),
        UNIQUE(KombinID, KiyafetID)
    );
    PRINT 'KombinKiyafetleri tablosu oluşturuldu.';
END
ELSE
BEGIN
    PRINT 'KombinKiyafetleri tablosu zaten mevcut.';
END
GO

-- 5. Begeniler tablosu
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Begeniler' AND xtype='U')
BEGIN
    CREATE TABLE Begeniler (
        BegeniID INT IDENTITY(1,1) PRIMARY KEY,
        KullaniciID INT NOT NULL,
        KombinID INT NOT NULL,
        BegeniTarihi DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (KullaniciID) REFERENCES Kullanicilar(KullaniciID),
        FOREIGN KEY (KombinID) REFERENCES Kombinler(KombinID),
        UNIQUE(KullaniciID, KombinID)
    );
    PRINT 'Begeniler tablosu oluşturuldu.';
END
ELSE
BEGIN
    PRINT 'Begeniler tablosu zaten mevcut.';
END
GO

-- 6. Favoriler tablosu
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Favoriler' AND xtype='U')
BEGIN
    CREATE TABLE Favoriler (
        FavoriID INT IDENTITY(1,1) PRIMARY KEY,
        KullaniciID INT NOT NULL,
        KombinID INT NOT NULL,
        EklenmeTarihi DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (KullaniciID) REFERENCES Kullanicilar(KullaniciID),
        FOREIGN KEY (KombinID) REFERENCES Kombinler(KombinID),
        UNIQUE(KullaniciID, KombinID)
    );
    PRINT 'Favoriler tablosu oluşturuldu.';
END
ELSE
BEGIN
    PRINT 'Favoriler tablosu zaten mevcut.';
END
GO

-- 7. KullaniciTercihleri tablosu
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='KullaniciTercihleri' AND xtype='U')
BEGIN
    CREATE TABLE KullaniciTercihleri (
        TercihID INT IDENTITY(1,1) PRIMARY KEY,
        KullaniciID INT NOT NULL,
        KaranlıkMod BIT DEFAULT 0,
        PushBildirimleri BIT DEFAULT 1,
        EmailBildirimleri BIT DEFAULT 1,
        FavoriRenkler NVARCHAR(200) NULL,
        FavoriMarkalar NVARCHAR(200) NULL,
        GuncellenmeTarihi DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (KullaniciID) REFERENCES Kullanicilar(KullaniciID)
    );
    PRINT 'KullaniciTercihleri tablosu oluşturuldu.';
END
ELSE
BEGIN
    PRINT 'KullaniciTercihleri tablosu zaten mevcut.';
END
GO

-- 8. YapayZekaOnerileri tablosu
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='YapayZekaOnerileri' AND xtype='U')
BEGIN
    CREATE TABLE YapayZekaOnerileri (
        OneriID INT IDENTITY(1,1) PRIMARY KEY,
        KullaniciID INT NOT NULL,
        TemelKiyafetID INT NOT NULL,
        OnerilenKiyafetID INT NOT NULL,
        UyumSkoru DECIMAL(3,2) NOT NULL,
        OneriTipi NVARCHAR(50) NOT NULL,
        OlusturulmaTarihi DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (KullaniciID) REFERENCES Kullanicilar(KullaniciID),
        FOREIGN KEY (TemelKiyafetID) REFERENCES Kiyafetler(KiyafetID),
        FOREIGN KEY (OnerilenKiyafetID) REFERENCES Kiyafetler(KiyafetID)
    );
    PRINT 'YapayZekaOnerileri tablosu oluşturuldu.';
END
ELSE
BEGIN
    PRINT 'YapayZekaOnerileri tablosu zaten mevcut.';
END
GO

-- 9. KombinGecmisi tablosu
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='KombinGecmisi' AND xtype='U')
BEGIN
    CREATE TABLE KombinGecmisi (
        GecmisID INT IDENTITY(1,1) PRIMARY KEY,
        KullaniciID INT NOT NULL,
        KombinID INT NOT NULL,
        Aktivite NVARCHAR(50) NOT NULL,
        AktiviteTarihi DATETIME DEFAULT GETDATE(),
        Detaylar NVARCHAR(500) NULL,
        FOREIGN KEY (KullaniciID) REFERENCES Kullanicilar(KullaniciID),
        FOREIGN KEY (KombinID) REFERENCES Kombinler(KombinID)
    );
    PRINT 'KombinGecmisi tablosu oluşturuldu.';
END
ELSE
BEGIN
    PRINT 'KombinGecmisi tablosu zaten mevcut.';
END
GO

-- 10. Etiketler tablosu
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Etiketler' AND xtype='U')
BEGIN
    CREATE TABLE Etiketler (
        EtiketID INT IDENTITY(1,1) PRIMARY KEY,
        EtiketAdi NVARCHAR(50) NOT NULL UNIQUE,
        Renk NVARCHAR(7) NULL,
        OlusturulmaTarihi DATETIME DEFAULT GETDATE()
    );
    PRINT 'Etiketler tablosu oluşturuldu.';
END
ELSE
BEGIN
    PRINT 'Etiketler tablosu zaten mevcut.';
END
GO

-- 11. KombinEtiketleri ilişki tablosu
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='KombinEtiketleri' AND xtype='U')
BEGIN
    CREATE TABLE KombinEtiketleri (
        KombinEtiketID INT IDENTITY(1,1) PRIMARY KEY,
        KombinID INT NOT NULL,
        EtiketID INT NOT NULL,
        FOREIGN KEY (KombinID) REFERENCES Kombinler(KombinID),
        FOREIGN KEY (EtiketID) REFERENCES Etiketler(EtiketID),
        UNIQUE(KombinID, EtiketID)
    );
    PRINT 'KombinEtiketleri tablosu oluşturuldu.';
END
ELSE
BEGIN
    PRINT 'KombinEtiketleri tablosu zaten mevcut.';
END
GO

-- İndeksler oluştur (performans için)
CREATE NONCLUSTERED INDEX IX_Kiyafetler_KullaniciID ON Kiyafetler(KullaniciID);
CREATE NONCLUSTERED INDEX IX_Kombinler_KullaniciID ON Kombinler(KullaniciID);
CREATE NONCLUSTERED INDEX IX_Begeniler_KombinID ON Begeniler(KombinID);
CREATE NONCLUSTERED INDEX IX_Favoriler_KullaniciID ON Favoriler(KullaniciID);

PRINT 'Tüm tablolar ve indeksler başarıyla oluşturuldu!';
GO 