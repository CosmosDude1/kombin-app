-- KombinApp Sample Combination Data
-- Creation Date: 2024
-- Description: Insert sample combination data with images

USE KombinApp;
GO

-- Insert sample users first (if not exists)
IF NOT EXISTS (SELECT * FROM Kullanicilar WHERE KullaniciAdi = 'demo_user')
BEGIN
    INSERT INTO Kullanicilar (KullaniciAdi, Sifre, Email, Ad, Soyad, ProfilFotoURL, FavoriStil, Cinsiyet)
    VALUES ('demo_user', 'demo123', 'demo@example.com', 'Demo', 'User', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150', 'casual', 'unisex');
    PRINT 'Demo user eklendi.';
END

IF NOT EXISTS (SELECT * FROM Kullanicilar WHERE KullaniciAdi = 'style_guru')
BEGIN
    INSERT INTO Kullanicilar (KullaniciAdi, Sifre, Email, Ad, Soyad, ProfilFotoURL, FavoriStil, Cinsiyet)
    VALUES ('style_guru', 'style123', 'style@example.com', 'Style', 'Guru', 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150', 'formal', 'kadın');
    PRINT 'Style guru eklendi.';
END

-- Insert sample clothing items
DECLARE @DemoUserID INT = (SELECT KullaniciID FROM Kullanicilar WHERE KullaniciAdi = 'demo_user');
DECLARE @StyleGuruID INT = (SELECT KullaniciID FROM Kullanicilar WHERE KullaniciAdi = 'style_guru');

-- Kıyafet örnekleri ekle
INSERT INTO Kiyafetler (KullaniciID, Isim, Marka, ResimURL, Kategori, Renk, Stil, Cinsiyet, Fiyat, VeriKaynagi) VALUES
(@DemoUserID, 'Beyaz Basic Tişört', 'H&M', 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400', 'Tişört', 'Beyaz', 'casual', 'unisex', 89.99, 'User'),
(@DemoUserID, 'Mavi Slim Fit Kot', 'Zara', 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400', 'Pantolon', 'Mavi', 'casual', 'unisex', 199.99, 'User'),
(@DemoUserID, 'Siyah Deri Ceket', 'Mango', 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400', 'Ceket', 'Siyah', 'formal', 'unisex', 599.99, 'User'),
(@DemoUserID, 'Beyaz Spor Ayakkabı', 'Nike', 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400', 'Ayakkabı', 'Beyaz', 'sport', 'unisex', 449.99, 'User'),
(@StyleGuruID, 'Kırmızı Elbise', 'Zara', 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400', 'Elbise', 'Kırmızı', 'formal', 'kadın', 299.99, 'User'),
(@StyleGuruID, 'Siyah Topuklu Ayakkabı', 'Aldo', 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400', 'Ayakkabı', 'Siyah', 'formal', 'kadın', 349.99, 'User'),
(@StyleGuruID, 'Gri Blazer', 'Mango', 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400', 'Ceket', 'Gri', 'formal', 'kadın', 399.99, 'User'),
(@StyleGuruID, 'Beyaz Gömlek', 'H&M', 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400', 'Gömlek', 'Beyaz', 'formal', 'kadın', 129.99, 'User'),
(@DemoUserID, 'Kahverengi Deri Bot', 'Timberland', 'https://images.unsplash.com/photo-1544966503-7cc5ac882d5f?w=400', 'Bot', 'Kahverengi', 'casual', 'unisex', 699.99, 'User'),
(@DemoUserID, 'Gri Kapüşonlu Sweatshirt', 'Adidas', 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400', 'Sweatshirt', 'Gri', 'sport', 'unisex', 179.99, 'User');

-- Get clothing IDs for combinations
DECLARE @TshirtID INT = (SELECT TOP 1 KiyafetID FROM Kiyafetler WHERE Isim = 'Beyaz Basic Tişört');
DECLARE @JeansID INT = (SELECT TOP 1 KiyafetID FROM Kiyafetler WHERE Isim = 'Mavi Slim Fit Kot');
DECLARE @JacketID INT = (SELECT TOP 1 KiyafetID FROM Kiyafetler WHERE Isim = 'Siyah Deri Ceket');
DECLARE @SneakersID INT = (SELECT TOP 1 KiyafetID FROM Kiyafetler WHERE Isim = 'Beyaz Spor Ayakkabı');
DECLARE @DressID INT = (SELECT TOP 1 KiyafetID FROM Kiyafetler WHERE Isim = 'Kırmızı Elbise');
DECLARE @HeelsID INT = (SELECT TOP 1 KiyafetID FROM Kiyafetler WHERE Isim = 'Siyah Topuklu Ayakkabı');
DECLARE @BlazerID INT = (SELECT TOP 1 KiyafetID FROM Kiyafetler WHERE Isim = 'Gri Blazer');
DECLARE @ShirtID INT = (SELECT TOP 1 KiyafetID FROM Kiyafetler WHERE Isim = 'Beyaz Gömlek');
DECLARE @BootsID INT = (SELECT TOP 1 KiyafetID FROM Kiyafetler WHERE Isim = 'Kahverengi Deri Bot');
DECLARE @SweatshirtID INT = (SELECT TOP 1 KiyafetID FROM Kiyafetler WHERE Isim = 'Gri Kapüşonlu Sweatshirt');

-- Insert sample combinations
INSERT INTO Kombinler (KullaniciID, KombinAdi, Aciklama, KapakResimURL, Stil, Mevsim, BegeniSayisi, GoruntulenmeSayisi) VALUES
(@DemoUserID, 'Günlük Şıklık', 'Rahat ve şık bir günlük kombin. Her ortamda kullanılabilir.', 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400', 'casual', 'İlkbahar', 156, 1240),
(@DemoUserID, 'Akşam Çıkışı', 'Akşam buluşmaları için mükemmel bir kombin.', 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400', 'formal', 'Sonbahar', 89, 756),
(@StyleGuruID, 'İş Toplantısı', 'Profesyonel ve güçlü görünüm için ideal.', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400', 'formal', 'Kış', 203, 1890),
(@StyleGuruID, 'Romantik Akşam', 'Özel günler için zarif ve çekici bir seçim.', 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400', 'formal', 'Yaz', 134, 987),
(@DemoUserID, 'Spor Şıklık', 'Spor ve şıklığı bir arada sunan modern kombin.', 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400', 'sport', 'İlkbahar', 78, 623),
(@StyleGuruID, 'Ofis Klasik', 'Klasik ofis stili, her zaman şık ve profesyonel.', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400', 'formal', 'Sonbahar', 167, 1456);

-- Get combination IDs
DECLARE @Kombin1ID INT = (SELECT TOP 1 KombinID FROM Kombinler WHERE KombinAdi = 'Günlük Şıklık');
DECLARE @Kombin2ID INT = (SELECT TOP 1 KombinID FROM Kombinler WHERE KombinAdi = 'Akşam Çıkışı');
DECLARE @Kombin3ID INT = (SELECT TOP 1 KombinID FROM Kombinler WHERE KombinAdi = 'İş Toplantısı');
DECLARE @Kombin4ID INT = (SELECT TOP 1 KombinID FROM Kombinler WHERE KombinAdi = 'Romantik Akşam');
DECLARE @Kombin5ID INT = (SELECT TOP 1 KombinID FROM Kombinler WHERE KombinAdi = 'Spor Şıklık');
DECLARE @Kombin6ID INT = (SELECT TOP 1 KombinID FROM Kombinler WHERE KombinAdi = 'Ofis Klasik');

-- Link clothing items to combinations
INSERT INTO KombinKiyafetleri (KombinID, KiyafetID, Sira) VALUES
-- Günlük Şıklık
(@Kombin1ID, @TshirtID, 1),
(@Kombin1ID, @JeansID, 2),
(@Kombin1ID, @SneakersID, 3),

-- Akşam Çıkışı
(@Kombin2ID, @TshirtID, 1),
(@Kombin2ID, @JacketID, 2),
(@Kombin2ID, @JeansID, 3),
(@Kombin2ID, @BootsID, 4),

-- İş Toplantısı
(@Kombin3ID, @ShirtID, 1),
(@Kombin3ID, @BlazerID, 2),
(@Kombin3ID, @HeelsID, 3),

-- Romantik Akşam
(@Kombin4ID, @DressID, 1),
(@Kombin4ID, @HeelsID, 2),

-- Spor Şıklık
(@Kombin5ID, @SweatshirtID, 1),
(@Kombin5ID, @JeansID, 2),
(@Kombin5ID, @SneakersID, 3),

-- Ofis Klasik
(@Kombin6ID, @ShirtID, 1),
(@Kombin6ID, @BlazerID, 2),
(@Kombin6ID, @HeelsID, 3);

-- Insert sample likes
INSERT INTO Begeniler (KullaniciID, KombinID) VALUES
(@DemoUserID, @Kombin3ID),
(@DemoUserID, @Kombin4ID),
(@StyleGuruID, @Kombin1ID),
(@StyleGuruID, @Kombin2ID),
(@StyleGuruID, @Kombin5ID);

-- Insert sample comments
INSERT INTO Yorumlar (KullaniciID, KombinID, YorumMetni) VALUES
(@StyleGuruID, @Kombin1ID, 'Çok şık bir kombin! Renk uyumu mükemmel.'),
(@DemoUserID, @Kombin3ID, 'İş toplantıları için harika bir seçim. Çok profesyonel görünüyor.'),
(@StyleGuruID, @Kombin2ID, 'Akşam çıkışları için ideal. Hem rahat hem şık.'),
(@DemoUserID, @Kombin4ID, 'Bu elbise çok güzel! Hangi mağazadan aldınız?'),
(@StyleGuruID, @Kombin5ID, 'Spor ve şıklığı çok güzel birleştirmişsiniz.'),
(@DemoUserID, @Kombin6ID, 'Klasik ama modern bir yaklaşım. Beğendim.');

PRINT 'Sample combination data inserted successfully!';
GO 