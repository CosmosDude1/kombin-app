USE KombinApp;
GO

PRINT 'Retrieving the last added combination and its items...';
GO

-- Get the last combination added
DECLARE @LastKombinID INT;
SELECT TOP 1 @LastKombinID = KombinID
FROM Kombinler
ORDER BY OlusturulmaTarihi DESC;

IF @LastKombinID IS NOT NULL
BEGIN
    PRINT 'Last KombinID found: ' + CAST(@LastKombinID AS NVARCHAR(10));

    -- Display details of the last combination
    PRINT '--- Last Combination Details ---';
    SELECT 
        KombinID,
        KullaniciID,
        KombinAdi,
        Aciklama,
        KapakResimURL,
        Stil,
        Mevsim,
        PaylasildiMi,
        Gorunurluk, -- Assuming this column is now correctly NVARCHAR(20)
        BegeniSayisi,
        GoruntulenmeSayisi,
        OlusturulmaTarihi,
        GuncellenmeTarihi,
        Durum
    FROM Kombinler
    WHERE KombinID = @LastKombinID;

    -- Display clothing items in the last combination
    PRINT '--- Clothing Items in Last Combination ---';
    SELECT 
        kk.KombinKiyafetID,
        kk.KiyafetID,
        k.Isim AS KiyafetIsmi,
        k.Kategori AS KiyafetKategorisi,
        k.ResimURL AS KiyafetResimURL,
        kk.Sira
    FROM KombinKiyafetleri kk
    JOIN Kiyafetler k ON kk.KiyafetID = k.KiyafetID
    WHERE kk.KombinID = @LastKombinID
    ORDER BY kk.Sira;
END
ELSE
BEGIN
    PRINT 'No combinations found in the Kombinler table.';
END
GO

PRINT 'Combination check script completed.';
GO 