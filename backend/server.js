require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const sql = require('mssql');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5001;

// CORS configuration - specific origins allowed for web
app.use(cors({
  origin: ['http://localhost:8081', 'http://127.0.0.1:8081', 'http://localhost:19006', 'http://127.0.0.1:19006'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' })); // Base64 resimler için limiti artır
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 'uploads' klasörünün varlığını kontrol et, yoksa oluştur
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
    console.log('Created "uploads" directory for images.');
}

// --- MS SQL Configuration ---
const dbConfig = {
  user: process.env.DB_USER, // SQL Server Authentication için
  password: process.env.DB_PASSWORD, // SQL Server Authentication için
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: false, // Lokal bağlantı için false
    trustServerCertificate: true, // Lokal development için genellikle true
    // trustedConnection: true // SQL Server Auth için bu satırı yorumluyoruz
  }
};

// --- MS SQL Connection Pool ---
let pool;
async function connectToDb() {
  try {
    if (!pool) {
        pool = await sql.connect(dbConfig);
        console.log('Connected to MS SQL Server');
    }
    return pool;
  } catch (err) {
    console.error('MS SQL Connection Error:', err);
    // Exit the process if DB connection fails, or implement retry logic
    process.exit(1); 
  }
}
connectToDb(); // Initialize connection on startup

// --- IMAGE UPLOAD ENDPOINT ---
// Bu endpoint, base64 formatında bir resim alır, sunucuya kaydeder ve erişilebilir bir URL döndürür.
app.post('/api/upload/image', (req, res) => {
    const { image } = req.body; // 'image' base64 string'ini içerir

    if (!image) {
        return res.status(400).json({ message: 'Resim verisi bulunamadı.' });
    }

    try {
        // 'data:image/jpeg;base64,' gibi başlıkları temizle
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Benzersiz bir dosya adı oluştur
        const uniqueFilename = `${Date.now()}.jpg`;
        const filePath = path.join(uploadsDir, uniqueFilename);

        fs.writeFileSync(filePath, buffer);

        // İstemcinin kullanacağı tam URL'i oluştur
        const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${uniqueFilename}`;
        
        console.log(`Image uploaded successfully: ${imageUrl}`);
        res.status(201).json({ imageUrl: imageUrl });

    } catch (error) {
        console.error('Image upload error:', error);
        res.status(500).json({ message: 'Resim yüklenirken bir sunucu hatası oluştu.' });
    }
});

// Database initialization function
async function initializeDatabase() {
  try {
    console.log('Initializing database schema...');
    const pool = await sql.connect(dbConfig);

    // --- Fix PaylasildiMi column ---
    console.log('Checking/Fixing PaylasildiMi column...');
    const checkPaylasildiMi = await pool.request().query(
      "SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Kombinler' AND COLUMN_NAME = 'PaylasildiMi'"
    );
    if (checkPaylasildiMi.recordset[0].count === 0) {
      await pool.request().query('ALTER TABLE Kombinler ADD PaylasildiMi BIT DEFAULT 1');
      console.log('✓ PaylasildiMi column added as BIT DEFAULT 1');
    } else {
      // Ensure it is BIT type
      const typeCheckPaylasildiMi = await pool.request().query(
        "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Kombinler' AND COLUMN_NAME = 'PaylasildiMi'"
      );
      if (typeCheckPaylasildiMi.recordset[0].DATA_TYPE !== 'bit') {
        console.log('⚠️ PaylasildiMi column is not BIT type. Attempting to fix...');
        await pool.request().query('ALTER TABLE Kombinler DROP COLUMN PaylasildiMi');
        await pool.request().query('ALTER TABLE Kombinler ADD PaylasildiMi BIT DEFAULT 1');
        console.log('✓ PaylasildiMi column recreated as BIT DEFAULT 1');
      } else {
        console.log('✓ PaylasildiMi column already exists as BIT type.');
      }
    }

    // --- Fix Gorunurluk column ---
    console.log('Checking/Fixing Gorunurluk column...');
    // Step 1: Find and drop the default constraint for Gorunurluk if it exists
    try {
      const constraintResult = await pool.request().query(`
        SELECT DC.name 
        FROM sys.default_constraints DC
        JOIN sys.columns C ON DC.parent_object_id = C.object_id AND DC.parent_column_id = C.column_id
        WHERE DC.parent_object_id = OBJECT_ID('Kombinler') AND C.name = 'Gorunurluk';
      `);
      if (constraintResult.recordset.length > 0) {
        const constraintName = constraintResult.recordset[0].name;
        if (constraintName) {
          console.log(`Attempting to drop constraint: ${constraintName} for Gorunurluk...`);
          await pool.request().query(`ALTER TABLE Kombinler DROP CONSTRAINT ${constraintName}`);
          console.log(`✓ Default constraint ${constraintName} on Gorunurluk column dropped.`);
        }
      }
    } catch (constraintError) {
      console.warn(`Could not drop constraint for Gorunurluk (it might not exist or other issue): ${constraintError.message}`);
    }

    // Step 2: Drop the Gorunurluk column if it exists
    try {
      const columnCheckGorunurluk = await pool.request().query(
        "SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Kombinler' AND COLUMN_NAME = 'Gorunurluk'"
      );
      if (columnCheckGorunurluk.recordset[0].count > 0) {
        console.log('Gorunurluk column exists. Attempting to drop...');
        await pool.request().query('ALTER TABLE Kombinler DROP COLUMN Gorunurluk');
        console.log('✓ Gorunurluk column dropped.');
      }
    } catch (dropColumnError) {
      console.warn(`Could not drop Gorunurluk column (it might not exist or other issue): ${dropColumnError.message}`);
    }
    
    // Step 3: Add the Gorunurluk column with NVARCHAR(20)
    try {
      await pool.request().query("ALTER TABLE Kombinler ADD Gorunurluk NVARCHAR(20) DEFAULT 'herkes'");
      console.log("✓ Gorunurluk column added as NVARCHAR(20) DEFAULT 'herkes'");
    } catch (addColumnError) {
      console.error(`❌ Failed to add Gorunurluk column: ${addColumnError.message}. This might happen if it wasn\'t properly dropped or already exists with a different conflicting type.`);
    }

    // --- Fix KapakResimURL column ---
    console.log('Checking/Fixing KapakResimURL column...');
    const checkKapakResim = await pool.request().query(
      "SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Kombinler' AND COLUMN_NAME = 'KapakResimURL'"
    );
    if (checkKapakResim.recordset.length > 0) {
      if (checkKapakResim.recordset[0].CHARACTER_MAXIMUM_LENGTH !== -1) { // -1 for MAX
        await pool.request().query('ALTER TABLE Kombinler ALTER COLUMN KapakResimURL NVARCHAR(MAX)');
        console.log('✓ KapakResimURL column modified to NVARCHAR(MAX).');
      } else {
        console.log('✓ KapakResimURL column already NVARCHAR(MAX).');
      }
    } else {
      await pool.request().query('ALTER TABLE Kombinler ADD KapakResimURL NVARCHAR(MAX) NULL');
      console.log('✓ KapakResimURL column added as NVARCHAR(MAX) NULL.');
    }

    console.log('Database schema initialization completed.');

    // Log the last added combination for verification
    try {
      const lastComboRequest = await pool.request().query(
        "SELECT TOP 1 KombinID, KombinAdi, OlusturulmaTarihi, Gorunurluk FROM Kombinler ORDER BY OlusturulmaTarihi DESC"
      );
      if (lastComboRequest.recordset.length > 0) {
        console.log('VERIFICATION: Last combination in DB:', JSON.stringify(lastComboRequest.recordset[0], null, 2));
      } else {
        console.log('VERIFICATION: No combinations found in DB.');
      }
    } catch (verifyError) {
      console.error('VERIFICATION ERROR: Could not fetch last combination:', verifyError.message);
    }

  } catch (error) {
    console.error('Error initializing database:', error.message);
    console.log('⚠️ Database initialization failed, but server will continue...');
  }
}

// --- API Configuration ---
const fakeStoreApiBaseUrl = 'https://fakestoreapi.com';
const unsplashApiBaseUrl = 'https://api.unsplash.com';
// NOTE: These keys are for demo purposes and might not work, use your own keys
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || 'YOUR_UNSPLASH_ACCESS_KEY';


// --- Login Endpoint ---
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Kullanıcı adı ve şifre gereklidir.' });
  }

  try {
    const pool = await connectToDb();
    const request = pool.request();
    
    // Sanitize inputs to prevent SQL injection (though parameterized queries are better)
    request.input('username', sql.NVarChar, username); 
    
    const result = await request.query('SELECT * FROM Kullanicilar WHERE KullaniciAdi = @username');

    if (result.recordset.length === 0) {
      return res.status(401).json({ message: 'Geçersiz kullanıcı adı veya şifre.' });
    }

    const user = result.recordset[0];

    // Compare hashed password
    // const passwordMatch = await bcrypt.compare(password, user.SifreHash); // Assuming 'SifreHash' is your DB column for hashed passwords
    // For now, we'll use plain text password comparison (NOT SECURE FOR PRODUCTION)
    
    let passwordMatch = false;
    // IMPORTANT: This is a placeholder for password hashing.
    // In a real app, you MUST hash passwords before storing and use bcrypt.compare for verification.
    if (user.Sifre === password) { // 'Sifre' is the plain text password column (for demo only)
        passwordMatch = true;
    }


    if (!passwordMatch) {
      return res.status(401).json({ message: 'Geçersiz kullanıcı adı veya şifre.' });
    }

    // Login successful
    // In a real app, you would generate a JWT token here and send it back
    res.json({ 
        message: 'Login başarılı!', 
        user: { 
            id: user.KullaniciID,
            KullaniciAdi: user.KullaniciAdi, // camelCase'den PascalCase'e düzeltildi
            Email: user.Email,
            Ad: user.Ad,
            Soyad: user.Soyad,
            ProfilFotoURL: user.ProfilFotoURL,
            FavoriStil: user.FavoriStil,
            Cinsiyet: user.Cinsiyet,
            DogumTarihi: user.DogumTarihi,
            TelefonNumarasi: user.TelefonNumarasi,
            Ulke: user.Ulke,
            Sehir: user.Sehir,
            KayitTarihi: user.KayitTarihi,
            SonGirisTarihi: user.SonGirisTarihi,
            Aktif: user.Aktif
            // Do not send password or sensitive info back
        } 
    });

  } catch (error) {
    console.error('Login API Error:', error);
    res.status(500).json({ message: 'Sunucu hatası, lütfen tekrar deneyin.' });
  }
});


// --- Register Endpoint ---
app.post('/api/register', async (req, res) => {
  const { 
    username, 
    password, 
    email, 
    ad, 
    soyad, 
    profilFotoURL, 
    favoriStil, 
    cinsiyet, 
    dogumTarihi,
    telefonNumarasi,
    ulke,
    sehir
  } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Kullanıcı adı ve şifre gereklidir.' });
  }

  try {
    const pool = await connectToDb();
    const request = pool.request();
    
    // Check if username already exists
    request.input('checkUsername', sql.NVarChar, username);
    const existingUser = await request.query('SELECT KullaniciID FROM Kullanicilar WHERE KullaniciAdi = @checkUsername');
    
    if (existingUser.recordset.length > 0) {
      return res.status(409).json({ message: 'Bu kullanıcı adı zaten kullanılıyor.' });
    }

    // Check if email already exists (if provided)
    if (email) {
      const emailRequest = pool.request();
      emailRequest.input('checkEmail', sql.NVarChar, email);
      const existingEmail = await emailRequest.query('SELECT KullaniciID FROM Kullanicilar WHERE Email = @checkEmail');
      
      if (existingEmail.recordset.length > 0) {
        return res.status(409).json({ message: 'Bu email adresi zaten kullanılıyor.' });
      }
    }

    // Insert new user
    const insertRequest = pool.request();
    insertRequest.input('username', sql.NVarChar, username);
    insertRequest.input('password', sql.NVarChar, password); // In production, hash this!
    insertRequest.input('email', sql.NVarChar, email || null);
    insertRequest.input('ad', sql.NVarChar, ad || null);
    insertRequest.input('soyad', sql.NVarChar, soyad || null);
    insertRequest.input('profilFotoURL', sql.NVarChar, profilFotoURL || null);
    insertRequest.input('favoriStil', sql.NVarChar, favoriStil || null);
    insertRequest.input('cinsiyet', sql.NVarChar, cinsiyet || null);
    insertRequest.input('dogumTarihi', sql.Date, dogumTarihi || null);
    insertRequest.input('telefonNumarasi', sql.NVarChar, telefonNumarasi || null);
    insertRequest.input('ulke', sql.NVarChar, ulke || null);
    insertRequest.input('sehir', sql.NVarChar, sehir || null);

    const result = await insertRequest.query(`
      INSERT INTO Kullanicilar 
      (KullaniciAdi, Sifre, Email, Ad, Soyad, ProfilFotoURL, FavoriStil, Cinsiyet, DogumTarihi, TelefonNumarasi, Ulke, Sehir)
      OUTPUT INSERTED.KullaniciID
      VALUES 
      (@username, @password, @email, @ad, @soyad, @profilFotoURL, @favoriStil, @cinsiyet, @dogumTarihi, @telefonNumarasi, @ulke, @sehir)
    `);

    const newUserId = result.recordset[0].KullaniciID;

    res.status(201).json({ 
      message: 'Kullanıcı başarıyla oluşturuldu!', 
      user: { 
        id: newUserId,
        username: username
      } 
    });

  } catch (error) {
    console.error('Register API Error:', error);
    res.status(500).json({ message: 'Sunucu hatası, lütfen tekrar deneyin.' });
  }
});


// --- Fake Store Service Logic ---
async function getFakeStoreProducts(limit = 20) { // Fakestore API doesn't have standard pagination, use limit
  const url = `${fakeStoreApiBaseUrl}/products`;

  try {
    console.log(`Fetching Fake Store products (limit: ${limit})`);
    const response = await axios.get(url, {
        params: {
            limit: limit
        }
    });

    console.log('Fake Store API Response Status:', response.status);

    // --- Data Mapping (Example) ---
    const products = response.data.map((product) => ({
      id: `fakestore-${product.id}`,
      isim: product.title,
      marka: 'FakeBrand', // Fake Store API doesn't provide brand
      resimUrl: product.image || 'https://via.placeholder.com/150/CCCCCC/FFFFFF?text=NoImage',
      fiyat: product.price,
      kategori: product.category,
      // renk: [], // Fake Store API doesn't provide color
      source: 'FakeStoreAPI'
    }));

    // Fake Store API doesn't provide pagination info in headers or body typically
    // So we return a simplified structure
    return {
      products,
      // Fake pagination details for consistency, assuming we fetched all available within limit
      totalPages: 1,
      totalElements: products.length,
      currentPage: 1,
    };

  } catch (error) {
    console.error('Error fetching Fake Store products:');
    if (axios.isAxiosError(error) && error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
      throw new Error(`Fake Store API Error: ${error.response.status}`);
    } else if (error instanceof Error) {
      console.error('Error Message:', error.message);
      throw new Error(`Error setting up Fake Store request: ${error.message}`);
    } else {
        throw new Error('An unknown error occurred');
    }
  }
}

// --- Unsplash Service Logic ---
async function getUnsplashImages(query = 'clothing', limit = 20) {
  const url = `${unsplashApiBaseUrl}/search/photos`;

  try {
    console.log(`Fetching Unsplash images for "${query}" (limit: ${limit})`);
    const response = await axios.get(url, {
      params: {
        query,
        per_page: limit,
        client_id: UNSPLASH_ACCESS_KEY
      }
    });

    console.log('Unsplash API Response Status:', response.status);
    console.log(`Found ${response.data.results.length} images for "${query}"`);

    // Unsplash verileri kıyafet modeli formatına dönüştürülüyor
    const products = response.data.results.map((photo, index) => ({
      id: `unsplash-${photo.id}`,
      isim: photo.alt_description || `${query} ${index + 1}`,
      marka: photo.user?.name || 'Unsplash',
      resimUrl: photo.urls.regular || photo.urls.small,
      kategori: query,
      source: 'UnsplashAPI'
    }));

    return {
      products,
      totalPages: response.data.total_pages > 0 ? response.data.total_pages : 1,
      totalElements: products.length,
      currentPage: 1,
    };
  } catch (error) {
    console.error('Error fetching Unsplash images:');
    if (axios.isAxiosError(error) && error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
      throw new Error(`Unsplash API Error: ${error.response.status}`);
    } else if (error instanceof Error) {
      console.error('Error Message:', error.message);
      throw new Error(`Error setting up Unsplash request: ${error.message}`);
    } else {
      throw new Error('An unknown error occurred');
    }
  }
}

// --- Placeholder Clothing API ---
async function getPlaceholderClothing(count = 20) {
  try {
    console.log(`Generating ${count} placeholder clothing items`);
    
    // Farklı kategoriler
    const categories = ['T-shirt', 'Pantolon', 'Elbise', 'Ceket', 'Ayakkabı', 'Gömlek', 'Etek', 'Şort'];
    // Farklı markalar
    const brands = ['FashionX', 'StyleCo', 'ModaTrend', 'Urban', 'Classic', 'Elegance', 'Casual', 'SportWear'];
    // Farklı renkler
    const colors = ['Kırmızı', 'Mavi', 'Siyah', 'Beyaz', 'Yeşil', 'Sarı', 'Mor', 'Turuncu', 'Pembe', 'Gri'];
    
    // Placeholder görsel URL'leri için farklı renkler ve boyutlar
    const placeholderColors = ['FF5733', '33FF57', '3357FF', 'F3FF33', 'FF33F3', '33FFF3', '000000', 'FFFFFF'];
    
    const products = Array.from({ length: count }, (_, index) => {
      const categoryIndex = index % categories.length;
      const brandIndex = index % brands.length;
      const colorIndex = index % colors.length;
      
      // Placeholder görsel için rastgele renk seç
      const placeholderColor = placeholderColors[index % placeholderColors.length];
      
      return {
        id: `placeholder-${index + 1}`,
        isim: `${categories[categoryIndex]} ${index + 1}`,
        marka: brands[brandIndex],
        resimUrl: `https://via.placeholder.com/400x600/${placeholderColor}/FFFFFF?text=${encodeURIComponent(categories[categoryIndex])}`,
        fiyat: 50 + Math.floor(Math.random() * 950), // 50-1000 arası fiyat
        kategori: categories[categoryIndex],
        renk: [colors[colorIndex]],
        source: 'PlaceholderAPI'
      };
    });

    return {
      products,
      totalPages: 1,
      totalElements: products.length,
      currentPage: 1,
    };
  } catch (error) {
    console.error('Error generating placeholder clothing:', error);
    throw new Error(`Error generating placeholder clothing: ${error.message}`);
  }
}

// --- API Routes ---

// Get all combinations with details
app.get('/api/combinations', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  try {
    const pool = await connectToDb();
    const request = pool.request();
    
    request.input('limit', sql.Int, limit);
    request.input('offset', sql.Int, offset);
    
    // Önce toplam aktif kombin sayısını alalım (sayfalama için)
    const totalCountRequest = pool.request();
    
    // YENİ: excludeUserId parametresine göre sorguyu ve parametreleri ayarla
    let whereClause = `WHERE k.Durum = 'Aktif'`;
    if (req.query.excludeUserId) {
        whereClause += ` AND k.KullaniciID != @excludeUserId`;
        totalCountRequest.input('excludeUserId', sql.Int, req.query.excludeUserId);
        request.input('excludeUserId', sql.Int, req.query.excludeUserId);
    }
    
    const totalCountResult = await totalCountRequest.query(`
      SELECT COUNT(*) as total FROM Kombinler k ${whereClause}
    `);
    const totalElements = totalCountResult.recordset[0].total;
    
    const result = await request.query(`
      SELECT 
        k.KombinID as id,
        k.KombinAdi as isim,
        k.Aciklama as aciklama,
        k.KapakResimURL as kapakResimUrl,
        k.Stil as stil,
        k.Mevsim as mevsim,
        k.BegeniSayisi as begeniSayisi,
        k.GoruntulenmeSayisi as goruntulenmeSayisi,
        k.OlusturulmaTarihi as olusturulmaTarihi,
        u.KullaniciAdi as kullaniciAdi,
        u.Ad as kullaniciAd,
        u.Soyad as kullaniciSoyad,
        u.ProfilFotoURL as kullaniciProfilFoto
      FROM Kombinler k
      INNER JOIN Kullanicilar u ON k.KullaniciID = u.KullaniciID
      ${whereClause}
      ORDER BY k.OlusturulmaTarihi DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);

    // Get clothing items for each combination
    const combinations = [];
    for (const combo of result.recordset) {
      const clothingRequest = pool.request();
      clothingRequest.input('kombinId', sql.Int, combo.id);
      
      const clothingResult = await clothingRequest.query(`
        SELECT 
          ky.KiyafetID as id,
          ky.Isim as isim,
          ky.Marka as marka,
          ky.ResimURL as resimUrl,
          ky.Kategori as kategori,
          ky.Renk as renk,
          ky.Stil as stil,
          ky.Cinsiyet as cinsiyet,
          ky.Fiyat as fiyat,
          ky.VeriKaynagi as source,
          kk.Sira as sira
        FROM KombinKiyafetleri kk
        INNER JOIN Kiyafetler ky ON kk.KiyafetID = ky.KiyafetID
        WHERE kk.KombinID = @kombinId
        ORDER BY kk.Sira
      `);

      const urunler = clothingResult.recordset.map(item => ({
        id: item.id.toString(),
        isim: item.isim,
        marka: item.marka,
        resimUrl: item.resimUrl,
        kategori: item.kategori,
        renk: item.renk ? item.renk.split(',').map(r => r.trim()) : [],
        stil: item.stil,
        cinsiyet: item.cinsiyet,
        fiyat: item.fiyat,
        source: item.source
      }));

      combinations.push({
        id: combo.id.toString(),
        isim: combo.isim,
        aciklama: combo.aciklama,
        kapakResimUrl: combo.kapakResimUrl,
        stil: combo.stil,
        mevsim: combo.mevsim,
        begeniSayisi: combo.begeniSayisi,
        goruntulenmeSayisi: combo.goruntulenmeSayisi,
        olusturulmaTarihi: combo.olusturulmaTarihi,
        kullanici: {
          adi: combo.kullaniciAdi,
          ad: combo.kullaniciAd,
          soyad: combo.kullaniciSoyad,
          profilFoto: combo.kullaniciProfilFoto
        },
        urunler: urunler
      });
    }

    res.json({
      combinations,
      totalElements: totalElements,
      currentPage: Math.floor(offset / limit),
      totalPages: Math.ceil(totalElements / limit)
    });

  } catch (error) {
    console.error('Combinations API Error:', error);
    res.status(500).json({ message: 'Kombinler yüklenirken bir hata oluştu.' });
  }
});

// YENİ ENDPOINT: Belirli bir kullanıcının gönderilerini getirme
app.get('/api/users/:userId/combinations', async (req, res) => {
  const { userId } = req.params;
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  if (!userId) {
    return res.status(400).json({ message: 'Kullanıcı ID gereklidir.' });
  }

  try {
    const pool = await connectToDb();
    
    // Toplam sayıyı al
    const totalCountRequest = pool.request();
    totalCountRequest.input('userId', sql.Int, userId);
    const totalCountResult = await totalCountRequest.query(`
      SELECT COUNT(*) as total FROM Kombinler WHERE KullaniciID = @userId AND Durum = 'Aktif'
    `);
    const totalElements = totalCountResult.recordset[0].total;

    // Sayfalanmış veriyi al
    const request = pool.request();
    request.input('userId', sql.Int, userId);
    request.input('limit', sql.Int, limit);
    request.input('offset', sql.Int, offset);

    const result = await request.query(`
      SELECT 
        k.KombinID as id,
        k.KombinAdi as isim,
        k.Aciklama as aciklama,
        k.KapakResimURL as kapakResimUrl,
        k.Stil as stil,
        k.Mevsim as mevsim,
        k.BegeniSayisi as begeniSayisi,
        k.GoruntulenmeSayisi as goruntulenmeSayisi,
        k.OlusturulmaTarihi as olusturulmaTarihi,
        u.KullaniciAdi as kullaniciAdi,
        u.Ad as kullaniciAd,
        u.Soyad as kullaniciSoyad,
        u.ProfilFotoURL as kullaniciProfilFoto
      FROM Kombinler k
      INNER JOIN Kullanicilar u ON k.KullaniciID = u.KullaniciID
      WHERE k.KullaniciID = @userId AND k.Durum = 'Aktif'
      ORDER BY k.OlusturulmaTarihi DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);

    // Aynı formatta `combinations` dizisi döndür
    const combinations = result.recordset.map(combo => ({
        id: combo.id.toString(),
        isim: combo.isim,
        aciklama: combo.aciklama,
        kapakResimUrl: combo.kapakResimUrl,
        stil: combo.stil,
        mevsim: combo.mevsim,
        begeniSayisi: combo.begeniSayisi,
        goruntulenmeSayisi: combo.goruntulenmeSayisi,
        olusturulmaTarihi: combo.olusturulmaTarihi,
        kullanici: {
          adi: combo.kullaniciAdi,
          ad: combo.kullaniciAd,
          soyad: combo.kullaniciSoyad,
          profilFoto: combo.kullaniciProfilFoto
        },
        urunler: [] // Bu endpointte ürün detayları şimdilik gerekli değil, performansı artırır.
      }));

    res.json({
      combinations,
      totalElements: totalElements,
      currentPage: Math.floor(offset / limit),
      totalPages: Math.ceil(totalElements / limit)
    });

  } catch (error) {
    console.error(`Kullanıcı ${userId} kombinleri alınırken hata:`, error);
    res.status(500).json({ message: 'Kombinler yüklenirken bir hata oluştu.' });
  }
});

// Like/Unlike a combination
app.post('/api/combinations/:id/like', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'Kullanıcı ID gereklidir.' });
  }

  try {
    const pool = await connectToDb();
    const request = pool.request();
    
    request.input('userId', sql.Int, userId);
    request.input('kombinId', sql.Int, id);
    
    // Check if already liked
    const existingLike = await request.query(`
      SELECT BegeniID FROM Begeniler 
      WHERE KullaniciID = @userId AND KombinID = @kombinId
    `);

    if (existingLike.recordset.length > 0) {
      // Unlike - remove like
      await request.query(`
        DELETE FROM Begeniler 
        WHERE KullaniciID = @userId AND KombinID = @kombinId
      `);
      
      // Decrease like count
      await request.query(`
        UPDATE Kombinler 
        SET BegeniSayisi = BegeniSayisi - 1 
        WHERE KombinID = @kombinId
      `);
      
      res.json({ message: 'Beğeni kaldırıldı.', liked: false });
    } else {
      // Like - add like
      await request.query(`
        INSERT INTO Begeniler (KullaniciID, KombinID) 
        VALUES (@userId, @kombinId)
      `);
      
      // Increase like count
      await request.query(`
        UPDATE Kombinler 
        SET BegeniSayisi = BegeniSayisi + 1 
        WHERE KombinID = @kombinId
      `);
      
      res.json({ message: 'Beğenildi!', liked: true });
    }

  } catch (error) {
    console.error('Like API Error:', error);
    res.status(500).json({ message: 'Beğeni işlemi sırasında bir hata oluştu.' });
  }
});

// Get comments for a combination
app.get('/api/combinations/:id/comments', async (req, res) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;

  try {
    const pool = await connectToDb();
    const request = pool.request();
    
    request.input('kombinId', sql.Int, id);
    request.input('limit', sql.Int, limit);
    request.input('offset', sql.Int, offset);
    
    const result = await request.query(`
      SELECT 
        y.YorumID as id,
        y.YorumMetni as metin,
        y.YorumTarihi as tarih,
        u.KullaniciAdi as kullaniciAdi,
        u.Ad as kullaniciAd,
        u.Soyad as kullaniciSoyad,
        u.ProfilFotoURL as kullaniciProfilFoto
      FROM Yorumlar y
      INNER JOIN Kullanicilar u ON y.KullaniciID = u.KullaniciID
      WHERE y.KombinID = @kombinId
      ORDER BY y.YorumTarihi DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);

    const comments = result.recordset.map(comment => ({
      id: comment.id,
      metin: comment.metin,
      tarih: comment.tarih,
      kullanici: {
        adi: comment.kullaniciAdi,
        ad: comment.kullaniciAd,
        soyad: comment.kullaniciSoyad,
        profilFoto: comment.kullaniciProfilFoto
      }
    }));

    res.json({
      comments,
      totalElements: comments.length,
      currentPage: Math.floor(offset / limit) + 1
    });

  } catch (error) {
    console.error('Comments API Error:', error);
    res.status(500).json({ message: 'Yorumlar yüklenirken bir hata oluştu.' });
  }
});

// Add a comment to a combination
app.post('/api/combinations/:id/comments', async (req, res) => {
  const { id } = req.params;
  const { userId, comment } = req.body;

  if (!userId || !comment) {
    return res.status(400).json({ message: 'Kullanıcı ID ve yorum metni gereklidir.' });
  }

  if (comment.length > 500) {
    return res.status(400).json({ message: 'Yorum 500 karakterden uzun olamaz.' });
  }

  try {
    const pool = await connectToDb();
    const request = pool.request();
    
    request.input('userId', sql.Int, userId);
    request.input('kombinId', sql.Int, id);
    request.input('comment', sql.NVarChar, comment);
    
    const result = await request.query(`
      INSERT INTO Yorumlar (KullaniciID, KombinID, YorumMetni)
      OUTPUT INSERTED.YorumID, INSERTED.YorumTarihi
      VALUES (@userId, @kombinId, @comment)
    `);

    // Get user info for response
    const userRequest = pool.request();
    userRequest.input('userId', sql.Int, userId);
    const userResult = await userRequest.query(`
      SELECT KullaniciAdi, Ad, Soyad, ProfilFotoURL 
      FROM Kullanicilar 
      WHERE KullaniciID = @userId
    `);

    const user = userResult.recordset[0];
    const newComment = result.recordset[0];

    res.status(201).json({
      message: 'Yorum eklendi!',
      comment: {
        id: newComment.YorumID,
        metin: comment,
        tarih: newComment.YorumTarihi,
        kullanici: {
          adi: user.KullaniciAdi,
          ad: user.Ad,
          soyad: user.Soyad,
          profilFoto: user.ProfilFotoURL
        }
      }
    });

  } catch (error) {
    console.error('Add Comment API Error:', error);
    res.status(500).json({ message: 'Yorum eklenirken bir hata oluştu.' });
  }
});

// Check if user liked a combination
app.get('/api/combinations/:id/like-status', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ message: 'Kullanıcı ID gereklidir.' });
  }

  try {
    const pool = await connectToDb();
    const request = pool.request();
    
    request.input('userId', sql.Int, userId);
    request.input('kombinId', sql.Int, id);
    
    const result = await request.query(`
      SELECT BegeniID FROM Begeniler 
      WHERE KullaniciID = @userId AND KombinID = @kombinId
    `);

    res.json({ liked: result.recordset.length > 0 });

  } catch (error) {
    console.error('Like Status API Error:', error);
    res.status(500).json({ message: 'Beğeni durumu kontrol edilirken bir hata oluştu.' });
  }
});

// FakeStore products
app.get('/api/fakestore/products', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;

  try {
    const data = await getFakeStoreProducts(limit);
    res.json(data);
  } catch (error) {
    console.error('[API /api/fakestore/products] Error:', error.message);
    res.status(500).json({ message: error.message || 'Failed to fetch products from Fake Store API' });
  }
});

// Unsplash Images - bir kategori için görsel arayın
app.get('/api/unsplash/images', async (req, res) => {
  const query = req.query.query || 'clothing';
  const limit = parseInt(req.query.limit) || 20;

  try {
    const data = await getUnsplashImages(query, limit);
    res.json(data);
  } catch (error) {
    console.error('[API /api/unsplash/images] Error:', error.message);
    res.status(500).json({ message: error.message || 'Failed to fetch images from Unsplash API' });
  }
});

// Placeholder ürünler - test ve geliştirme için
app.get('/api/placeholder/clothing', async (req, res) => {
  const count = parseInt(req.query.count) || 20;

  try {
    const data = await getPlaceholderClothing(count);
    res.json(data);
  } catch (error) {
    console.error('[API /api/placeholder/clothing] Error:', error.message);
    res.status(500).json({ message: error.message || 'Failed to generate placeholder clothing data' });
  }
});

// Tüm kaynakları birleştiren endpoint
app.get('/api/clothing/all', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;

  try {
    // Tüm API'lerden paralel olarak veri al
    const [fakeStoreData, unsplashData, placeholderData] = await Promise.allSettled([
      getFakeStoreProducts(limit),
      getUnsplashImages('fashion', limit),
      getPlaceholderClothing(limit)
    ]);
    
    console.log('=== API CALL RESULTS (Promise.allSettled) ===');
    console.log('FakeStoreAPI:', fakeStoreData.status);
    if (fakeStoreData.status === 'rejected') {
      console.error('FakeStoreAPI Error:', fakeStoreData.reason);
    }
    console.log('UnsplashAPI:', unsplashData.status);
    if (unsplashData.status === 'rejected') {
      console.error('UnsplashAPI Error:', unsplashData.reason);
    }
    console.log('PlaceholderAPI:', placeholderData.status);
    if (placeholderData.status === 'rejected') {
      console.error('PlaceholderAPI Error:', placeholderData.reason);
    }
    console.log('==============================================');
    
    // Başarılı sonuçları birleştir
    const fakeStoreProducts = fakeStoreData.status === 'fulfilled' ? fakeStoreData.value.products : [];
    const unsplashProducts = unsplashData.status === 'fulfilled' ? unsplashData.value.products : [];
    const placeholderProducts = placeholderData.status === 'fulfilled' ? placeholderData.value.products : [];
    
    // Tüm ürünleri birleştir
    const allProducts = [...fakeStoreProducts, ...unsplashProducts, ...placeholderProducts];
    
    // Birleştirilmiş sonuçları döndür
    res.json({
      products: allProducts,
      totalPages: 1,
      totalElements: allProducts.length,
      currentPage: 1,
    });
  } catch (error) {
    console.error('[API /api/clothing/all] Error:', error.message);
    res.status(500).json({ message: error.message || 'Failed to fetch clothing data' });
  }
});

// Add clothing item to user's wardrobe
app.post('/api/clothing/add', async (req, res) => {
  console.log('=== ADD CLOTHING ENDPOINT CALLED ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Request Body:', JSON.stringify(req.body, null, 2));

  const { 
    kullaniciId, 
    isim, 
    marka, 
    resimUrl, 
    kategori, 
    renk, 
    stil, 
    cinsiyet, 
    fiyat 
  } = req.body;

  if (!kullaniciId || !isim || !resimUrl) {
    console.log('ERROR: Missing required fields (kullaniciId, isim, or resimUrl).');
    console.log('=== ADD CLOTHING ENDPOINT FAILED (Validation) ===');
    return res.status(400).json({ message: 'Kullanıcı ID, kıyafet adı ve resim URL gereklidir.' });
  }
  console.log('Validation passed: Required fields are present.');

  try {
    console.log('Step 1: Connecting to database...');
    const pool = await connectToDb();
    const request = pool.request();
    
    console.log('Step 2: Setting SQL parameters...');
    request.input('kullaniciId', sql.Int, kullaniciId);
    request.input('isim', sql.NVarChar, isim);
    request.input('marka', sql.NVarChar, marka || null); // Handle undefined from frontend as null
    request.input('resimUrl', sql.NVarChar, resimUrl);
    request.input('kategori', sql.NVarChar, kategori || 'Diğer');
    request.input('renk', sql.NVarChar, Array.isArray(renk) && renk.length > 0 ? renk.join(', ') : null);
    request.input('stil', sql.NVarChar, stil || null);
    request.input('cinsiyet', sql.NVarChar, cinsiyet || null);
    request.input('fiyat', sql.Decimal(10,2), fiyat || null);
    // Explicitly set Mevcut to 1 (True) for new items
    request.input('mevcut', sql.Bit, 1);
    request.input('veriKaynagi', sql.NVarChar, 'User');

    console.log('SQL Parameters Set:');
    for (const paramName in request.parameters) {
      if (request.parameters.hasOwnProperty(paramName)) {
        const param = request.parameters[paramName];
        console.log(`  ${paramName}: { type: ${param.type.name}, value: ${param.value} }`);
      }
    }

    console.log('Step 3: Executing INSERT query...');
    const result = await request.query(`
      INSERT INTO Kiyafetler 
      (KullaniciID, Isim, Marka, ResimURL, Kategori, Renk, Stil, Cinsiyet, Fiyat, VeriKaynagi, Mevcut)
      OUTPUT INSERTED.KiyafetID, INSERTED.Isim, INSERTED.ResimURL, INSERTED.Mevcut
      VALUES 
      (@kullaniciId, @isim, @marka, @resimUrl, @kategori, @renk, @stil, @cinsiyet, @fiyat, @veriKaynagi, @mevcut)
    `);

    console.log('Step 4: INSERT query successful. Result:', JSON.stringify(result.recordset, null, 2));

    if (!result.recordset || result.recordset.length === 0) {
      console.log('ERROR: INSERT query did not return a record.');
      console.log('=== ADD CLOTHING ENDPOINT FAILED (DB Insert) ===');
      throw new Error('Kıyafet eklenirken bir sorun oluştu, ID alınamadı.');
    }

    const newClothingRecord = result.recordset[0];
    const responsePayload = { 
      message: 'Kıyafet başarıyla eklendi!', 
      clothing: { 
        id: newClothingRecord.KiyafetID,
        isim: newClothingRecord.Isim,
        marka: marka || undefined,
        resimUrl: newClothingRecord.ResimURL,
        kategori: kategori || 'Diğer',
        renk: Array.isArray(renk) && renk.length > 0 ? renk : [],
        stil: stil || undefined,
        cinsiyet: cinsiyet || undefined,
        fiyat: fiyat || undefined,
        source: 'User',
        mevcut: newClothingRecord.Mevcut // Include mevcut status in response
      } 
    };

    console.log('Step 5: Sending success response:', JSON.stringify(responsePayload, null, 2));
    console.log('=== ADD CLOTHING ENDPOINT SUCCESS ===');
    res.status(201).json(responsePayload);

  } catch (error) {
    console.error('=== ADD CLOTHING ENDPOINT ERROR ===');
    console.error('Add Clothing API Error:', error);
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    res.status(500).json({ message: 'Kıyafet eklenirken bir sunucu hatası oluştu.' });
  }
});

// Get user's wardrobe
app.get('/api/clothing/wardrobe/:userId', async (req, res) => {
  const { userId } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  const kategori = req.query.kategori;

  try {
    const pool = await connectToDb();
    const request = pool.request();
    
    request.input('userId', sql.Int, userId);
    request.input('limit', sql.Int, limit);
    request.input('offset', sql.Int, offset);
    
    let query = `
      SELECT 
        KiyafetID as id,
        Isim as isim,
        Marka as marka,
        ResimURL as resimUrl,
        Kategori as kategori,
        Renk as renk,
        Stil as stil,
        Cinsiyet as cinsiyet,
        Fiyat as fiyat,
        VeriKaynagi as source,
        EklenmeTarihi as eklenmeTarihi
      FROM Kiyafetler 
      WHERE KullaniciID = @userId AND Mevcut = 1
    `;

    if (kategori) {
      request.input('kategori', sql.NVarChar, kategori);
      query += ' AND Kategori = @kategori';
    }

    query += `
      ORDER BY EklenmeTarihi DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;

    const result = await request.query(query);

    const clothing = result.recordset.map(item => ({
      id: item.id.toString(),
      isim: item.isim,
      marka: item.marka,
      resimUrl: item.resimUrl,
      kategori: item.kategori,
      renk: item.renk ? item.renk.split(', ').map(r => r.trim()) : [],
      stil: item.stil,
      cinsiyet: item.cinsiyet,
      fiyat: item.fiyat,
      source: item.source,
      eklenmeTarihi: item.eklenmeTarihi
    }));

    res.json({
      clothing,
      totalElements: clothing.length,
      currentPage: Math.floor(offset / limit) + 1
    });

  } catch (error) {
    console.error('Wardrobe API Error:', error);
    res.status(500).json({ message: 'Gardırop verileri yüklenirken bir hata oluştu.' });
  }
});

// Delete clothing item from user's wardrobe (soft delete)
app.delete('/api/clothing/:clothingId', async (req, res) => {
  const { clothingId } = req.params;
  const { userId } = req.body;

  console.log('=== DELETE ENDPOINT CALLED ===');
  console.log('Request params:', { clothingId });
  console.log('Request body:', req.body);
  console.log('UserID from body:', userId);

  if (!clothingId || !userId) {
    console.log('ERROR: Missing required parameters');
    return res.status(400).json({ message: 'Kıyafet ID ve kullanıcı ID gereklidir.' });
  }

  try {
    console.log('Step 1: Connecting to database...');
    const pool = await connectToDb();
    const request = pool.request();
    
    request.input('clothingId', sql.Int, clothingId);
    request.input('userId', sql.Int, userId);

    console.log('Step 2: Checking if clothing exists and belongs to user...');
    // First check if the clothing belongs to the user
    const checkQuery = `
      SELECT KiyafetID, Isim, Mevcut
      FROM Kiyafetler 
      WHERE KiyafetID = @clothingId AND KullaniciID = @userId AND Mevcut = 1
    `;
    
    const checkResult = await request.query(checkQuery);
    console.log('Check query result:', checkResult.recordset);
    
    if (checkResult.recordset.length === 0) {
      console.log('ERROR: Clothing not found or does not belong to user');
      return res.status(404).json({ message: 'Kıyafet bulunamadı veya size ait değil.' });
    }

    const clothingName = checkResult.recordset[0].Isim;
    console.log(`Step 3: Found clothing "${clothingName}", proceeding with soft delete...`);

    // Soft delete - set Mevcut to 0
    const deleteQuery = `
      UPDATE Kiyafetler 
      SET Mevcut = 0
      WHERE KiyafetID = @clothingId AND KullaniciID = @userId
    `;
    
    const deleteResult = await request.query(deleteQuery);
    console.log('Delete query executed, rows affected:', deleteResult.rowsAffected);

    console.log(`Step 4: Soft delete completed - Clothing: "${clothingName}" (ID: ${clothingId}), UserId: ${userId}`);
    
    const response = { 
      message: 'Kıyafet başarıyla silindi!',
      deletedClothingId: clothingId,
      deletedClothingName: clothingName
    };
    
    console.log('Step 5: Sending success response:', response);
    console.log('=== DELETE ENDPOINT SUCCESS ===');
    
    res.json(response);

  } catch (error) {
    console.error('=== DELETE ENDPOINT ERROR ===');
    console.error('Delete Clothing API Error:', error);
    res.status(500).json({ message: 'Kıyafet silinirken bir hata oluştu.' });
  }
});

// YENİ EKlenen KOMBİN OLUŞTURMA ENDPOINT'İ
app.post('/api/kombinler/olustur', async (req, res) => {
  console.log('=== CREATE COMBINATION ENDPOINT CALLED ===');
  let { // kombinAdi'nın potansiyel olarak yeniden atanabilmesi için let kullanıldı
    kullaniciId, 
    kombinAdi, 
    aciklama, 
    kapakResimURL, 
    stil, 
    mevsim, 
    paylasildiMi, 
    kiyafetIdleri 
  } = req.body;

  console.log('Request Body:', JSON.stringify(req.body, null, 2));

  // Kullanıcı ID ve kıyafet ID listesi için temel doğrulama
  if (!kullaniciId || !kiyafetIdleri || !Array.isArray(kiyafetIdleri) || kiyafetIdleri.length === 0) {
    console.log('ERROR: Missing or invalid required fields (kullaniciId, or kiyafetIdleri array).');
    return res.status(400).json({ message: 'Kullanıcı ID ve en az bir kıyafet ID listesi gereklidir.' });
  }

  let pool;
  let transaction;

  try {
    pool = await connectToDb();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    console.log('Database transaction started.');

    let finalKombinAdi = kombinAdi;

    // Eğer kombin adı sağlanmadıysa ve tek bir kıyafet varsa, kıyafetin adını kullan
    if (!finalKombinAdi && kiyafetIdleri.length === 1) {
      const tekKiyafetId = kiyafetIdleri[0];
      if (tekKiyafetId === null || tekKiyafetId === undefined) {
        console.log('ERROR: Invalid ID for single clothing item.');
        if (transaction && transaction.active && !transaction.rolledBack) await transaction.rollback();
        return res.status(400).json({ message: 'Tek kıyafet için geçersiz ID sağlandı.' });
      }
      const kiyafetIsimReq = new sql.Request(transaction);
      kiyafetIsimReq.input('kiyafetId', sql.Int, tekKiyafetId);
      const kiyafetIsimResult = await kiyafetIsimReq.query('SELECT Isim FROM Kiyafetler WHERE KiyafetID = @kiyafetId');
      if (kiyafetIsimResult.recordset.length > 0 && kiyafetIsimResult.recordset[0].Isim) {
        finalKombinAdi = kiyafetIsimResult.recordset[0].Isim;
        console.log(`Kombin adı tek kıyafetten türetildi: ${finalKombinAdi}`);
      } else {
        console.log('ERROR: Kombin adı sağlanmadı ve tek kıyafetin adı alınamadı.');
        if (transaction && transaction.active && !transaction.rolledBack) await transaction.rollback();
        return res.status(400).json({ message: 'Kombin adı sağlanmadı ve tek kıyafetin adı kullanılamadı.' });
      }
    } else if (!finalKombinAdi && kiyafetIdleri.length > 1) {
      // Birden fazla kıyafet varsa ve kombin adı yoksa hata ver
      console.log('ERROR: Kombin adı birden fazla kıyafet için sağlanmadı.');
      if (transaction && transaction.active && !transaction.rolledBack) await transaction.rollback();
      return res.status(400).json({ message: 'Birden fazla kıyafet içeren kombinler için Kombin Adı gereklidir.' });
    } else if (!finalKombinAdi) {
        // Genel olarak kombin adı yoksa (bu durum yukarıdaki koşullarla zaten yakalanmalı ama bir güvenlik önlemi)
        console.log('ERROR: Kombin adı belirtilmemiş.');
        if (transaction && transaction.active && !transaction.rolledBack) await transaction.rollback();
        return res.status(400).json({ message: 'Kombin Adı gereklidir.' });
    }


    const kombinRequest = new sql.Request(transaction);
    kombinRequest.input('kullaniciId', sql.Int, kullaniciId);
    kombinRequest.input('kombinAdi', sql.NVarChar, finalKombinAdi); // Türetilmiş veya sağlanan kombin adını kullan
    kombinRequest.input('aciklama', sql.NVarChar, aciklama || null);
    
    let finalKapakResimURL = kapakResimURL;
    if (!finalKapakResimURL && kiyafetIdleri.length > 0) {
        const ilkKiyafetId = kiyafetIdleri[0];
        // Transaction içindeki bir request pool'dan değil, transaction'dan oluşturulmalı.
        const ilkKiyafetReq = new sql.Request(transaction); 
        ilkKiyafetReq.input('kiyafetId', sql.Int, ilkKiyafetId);
        const ilkKiyafetResult = await ilkKiyafetReq.query('SELECT ResimURL FROM Kiyafetler WHERE KiyafetID = @kiyafetId');
        if (ilkKiyafetResult.recordset.length > 0) {
            const firstClothingImage = ilkKiyafetResult.recordset[0].ResimURL;
            
            // Check if the image is base64 (very long) or a regular URL
            if (firstClothingImage && firstClothingImage.startsWith('data:image/')) {
                // If it's base64, create a placeholder cover image instead
                finalKapakResimURL = `https://via.placeholder.com/400x400/4A90E2/FFFFFF?text=Kombin-${Date.now()}`;
                console.log('İlk kıyafet base64 resim içeriyor, kapak resmi için placeholder kullanılıyor:', finalKapakResimURL);
            } else if (firstClothingImage) {
                // If it's a regular URL, use it
                finalKapakResimURL = firstClothingImage;
                console.log('Kapak resmi ilk kıyafetten alındı:', finalKapakResimURL);
            } else {
                // If no image, use default placeholder
                finalKapakResimURL = `https://via.placeholder.com/400x400/28A745/FFFFFF?text=Yeni-Kombin`;
                console.log('İlk kıyafet için resim bulunamadı, varsayılan placeholder kullanılıyor.');
            }
        } else {
            finalKapakResimURL = `https://via.placeholder.com/400x400/FFC107/000000?text=Kombin-${kiyafetIdleri.length}-Parca`;
            console.log('Kapak resmi için ilk kıyafet bulunamadı, placeholder kullanılıyor:', finalKapakResimURL);
        }
    }
    
    kombinRequest.input('kapakResimURL', sql.NVarChar, finalKapakResimURL || null);
    kombinRequest.input('stil', sql.NVarChar, stil || null);
    kombinRequest.input('mevsim', sql.NVarChar, mevsim || null);
    kombinRequest.input('paylasildiMi', sql.Bit, paylasildiMi === true ? 1 : 0);
    kombinRequest.input('gorunurluk', sql.NVarChar, 'herkes'); // Defaulting to 'herkes' - RE-ENABLED
    kombinRequest.input('durum', sql.NVarChar, 'Aktif'); // Yeni kombinleri varsayılan olarak 'Aktif' yap

    console.log('SQL Parameter Summary:');
    console.log('  kullaniciId (INT):', kullaniciId);
    console.log('  kombinAdi (NVARCHAR):', finalKombinAdi);
    console.log('  aciklama (NVARCHAR):', aciklama || 'NULL');
    console.log('  kapakResimURL (NVARCHAR):', finalKapakResimURL || 'NULL');
    console.log('  stil (NVARCHAR):', stil || 'NULL');
    console.log('  mevsim (NVARCHAR):', mevsim || 'NULL');
    console.log('  paylasildiMi (BIT):', paylasildiMi === true ? 1 : 0);
    console.log('  gorunurluk (NVARCHAR):', 'herkes'); // RE-ENABLED
    console.log('  durum (NVARCHAR):', 'Aktif');


    console.log('Inserting into Kombinler table with PaylasildiMi:', paylasildiMi === true ? 1 : 0, 'and Durum: Aktif');

    const resultKombin = await kombinRequest.query(`
      INSERT INTO Kombinler 
      (KullaniciID, KombinAdi, Aciklama, KapakResimURL, Stil, Mevsim, PaylasildiMi, Gorunurluk, Durum, OlusturulmaTarihi, GuncellenmeTarihi)
      OUTPUT INSERTED.KombinID
      VALUES 
      (@kullaniciId, @kombinAdi, @aciklama, @kapakResimURL, @stil, @mevsim, @paylasildiMi, @gorunurluk, @durum, GETDATE(), GETDATE())
    `);

    if (!resultKombin.recordset || resultKombin.recordset.length === 0) {
      throw new Error('Kombin ID couldn\'t be retrieved after insert.');
    }
    const yeniKombinId = resultKombin.recordset[0].KombinID;
    console.log('New KombinID created:', yeniKombinId);

    console.log(`Adding ${kiyafetIdleri.length} items to KombinKiyafetleri for KombinID: ${yeniKombinId}`);
    for (let i = 0; i < kiyafetIdleri.length; i++) {
      const kiyafetId = kiyafetIdleri[i];
      if (kiyafetId === null || kiyafetId === undefined) {
        console.warn(`Skipping null or undefined kiyafetId at index ${i}`);
        continue;
      }
      const kombinKiyafetRequest = new sql.Request(transaction);
      kombinKiyafetRequest.input('kombinId', sql.Int, yeniKombinId);
      kombinKiyafetRequest.input('kiyafetId', sql.Int, kiyafetId);
      kombinKiyafetRequest.input('sira', sql.Int, i + 1); 
      await kombinKiyafetRequest.query(`
        INSERT INTO KombinKiyafetleri (KombinID, KiyafetID, Sira)
        VALUES (@kombinId, @kiyafetId, @sira)
      `);
      console.log(`Added KiyafetID ${kiyafetId} to KombinKiyafetleri.`);
    }
    
    await transaction.commit();
    console.log('Database transaction committed.');
    
    res.status(201).json({ message: 'Kombin başarıyla oluşturuldu!', kombinId: yeniKombinId });

  } catch (error) {
    console.error('=== CREATE COMBINATION ENDPOINT ERROR ===');
    console.error('Error creating combination:', error.message);
    console.error('Error stack:', error.stack);
    if (transaction && transaction.rolledBack === false && transaction.active) {
        try {
            await transaction.rollback();
            console.log('Database transaction rolled back due to error.');
        } catch (rollbackError) {
            console.error('Error during transaction rollback:', rollbackError.message);
        }
    }
    res.status(500).json({ message: 'Kombin oluşturulurken bir sunucu hatası oluştu: ' + error.message });
  }
});

// --- YENİ ENDPOINT: Keşfet Ekranından Gelen Kombin Prototipini Kaydetme ---
app.post('/api/kombin-prototip/olustur', async (req, res) => {
  console.log('=== CREATE COMBINATION PROTOTYPE ENDPOINT CALLED ===');
  const { 
    kullaniciId, 
    prototipAdi, 
    aciklama, 
    kapakResimURL, 
    urunler 
  } = req.body;

  console.log('Request Body:', JSON.stringify(req.body, null, 2));

  if (!kullaniciId || !prototipAdi || !urunler || !Array.isArray(urunler) || urunler.length === 0) {
    console.log('ERROR: Missing or invalid required fields (kullaniciId, prototipAdi, or urunler array).');
    return res.status(400).json({ message: 'Kullanıcı ID, prototip adı ve en az bir ürün içeren ürün listesi gereklidir.' });
  }

  if (urunler.length < 2) {
    console.log('ERROR: At least 2 products are required for a prototype.');
    return res.status(400).json({ message: 'Bir kombin prototipi için en az 2 ürün gereklidir.' });
  }

  let pool;
  let transaction;

  try {
    pool = await connectToDb();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    console.log('Database transaction for prototype creation started.');

    // 1. KombinPrototip tablosuna kaydet
    const prototipRequest = new sql.Request(transaction);
    prototipRequest.input('KullaniciID', sql.Int, kullaniciId);
    prototipRequest.input('PrototipAdi', sql.NVarChar(255), prototipAdi);
    prototipRequest.input('Aciklama', sql.NVarChar(sql.MAX), aciklama || null);
    prototipRequest.input('KapakResimURL', sql.NVarChar(sql.MAX), kapakResimURL || urunler[0]?.image_url || null);
    // OlusturulmaTarihi default olarak GETDATE() ile eklenecek

    const resultPrototip = await prototipRequest.query(`
      INSERT INTO KombinPrototip (KullaniciID, PrototipAdi, Aciklama, KapakResimURL)
      OUTPUT INSERTED.PrototipID
      VALUES (@KullaniciID, @PrototipAdi, @Aciklama, @KapakResimURL);
    `);

    if (!resultPrototip.recordset || resultPrototip.recordset.length === 0) {
      throw new Error('Prototip ID couldn\'t be retrieved after insert into KombinPrototip.');
    }
    const yeniPrototipId = resultPrototip.recordset[0].PrototipID;
    console.log('New PrototipID created:', yeniPrototipId);

    // 2. PrototipUrunleri tablosuna ürünleri kaydet
    console.log(`Adding ${urunler.length} items to KombinPrototipUrunleri for PrototipID: ${yeniPrototipId}`);
    for (let i = 0; i < urunler.length; i++) {
      const urun = urunler[i];
      if (!urun || !urun.id || !urun.name || !urun.image_url) { // Temel alanları kontrol et
        console.warn(`Skipping invalid product data at index ${i}:`, urun);
        // İsteğe bağlı olarak burada hata fırlatılabilir veya sadece loglanabilir
        // throw new Error(`Invalid product data at index ${i}. Required fields are missing.`); 
        continue;
      }

      const urunRequest = new sql.Request(transaction);
      urunRequest.input('PrototipID', sql.Int, yeniPrototipId);
      urunRequest.input('UrunKaynakID', sql.NVarChar(500), urun.id); // SÜTUN ADI GÜNCELLENDİ
      urunRequest.input('UrunAdi', sql.NVarChar(255), urun.name);
      urunRequest.input('ResimURL', sql.NVarChar(sql.MAX), urun.image_url);
      urunRequest.input('Kategori', sql.NVarChar(100), urun.category || 'Diğer');
      urunRequest.input('Fiyat', sql.NVarChar(50), urun.price || 'N/A');
      urunRequest.input('Sira', sql.Int, i + 1); // Ürünlerin sırası

      await urunRequest.query(`
        INSERT INTO KombinPrototipUrunleri (PrototipID, UrunKaynakID, UrunAdi, ResimURL, Kategori, Fiyat, Sira) -- SÜTUN ADI GÜNCELLENDİ
        VALUES (@PrototipID, @UrunKaynakID, @UrunAdi, @ResimURL, @Kategori, @Fiyat, @Sira);
      `);
      console.log(`Added Product (Source ID: ${urun.id}, Name: ${urun.name}) to KombinPrototipUrunleri.`);
    }

    await transaction.commit();
    console.log('Database transaction committed for prototype creation.');
    
    res.status(201).json({ 
      message: 'Kombin prototipi başarıyla oluşturuldu!', 
      prototipId: yeniPrototipId 
    });

  } catch (error) {
    console.error('=== CREATE COMBINATION PROTOTYPE ENDPOINT ERROR ===');
    console.error('Error creating combination prototype:', error.message);
    console.error('Error stack:', error.stack);
    if (transaction && transaction.rolledBack === false && transaction.active) {
        try {
            await transaction.rollback();
            console.log('Database transaction rolled back due to error.');
        } catch (rollbackError) {
            console.error('Error during transaction rollback:', rollbackError.message);
        }
    }
    res.status(500).json({ message: 'Kombin prototipi oluşturulurken bir sunucu hatası oluştu: ' + error.message });
  }
});

// --- YENİ ENDPOINT: Kullanıcının Kayıtlı Kombin Prototiplerini Listeleme ---
app.get('/api/kombin-prototipler', async (req, res) => {
  console.log('=== GET USER COMBINATION PROTOTYPES ENDPOINT CALLED ===');
  const kullaniciId = req.query.kullaniciId;

  if (!kullaniciId) {
    console.log('ERROR: Missing kullaniciId query parameter.');
    return res.status(400).json({ message: 'Kullanıcı ID (kullaniciId) query parametresi gereklidir.' });
  }

  try {
    const pool = await connectToDb();
    const request = pool.request();
    request.input('KullaniciID', sql.Int, parseInt(kullaniciId, 10)); // 'as string' kaldırıldı

    const result = await request.query(`
      SELECT 
        PrototipID,
        PrototipAdi,
        Aciklama,
        KapakResimURL,
        OlusturulmaTarihi
        -- Belki ürün sayısı da eklenebilir COUNT(KPU.PrototipUrunID) AS UrunSayisi
        -- FROM KombinPrototip KP LEFT JOIN KombinPrototipUrunleri KPU ON KP.PrototipID = KPU.PrototipID
      FROM KombinPrototip
      WHERE KullaniciID = @KullaniciID
      -- GROUP BY KP.PrototipID, KP.PrototipAdi, KP.Aciklama, KP.KapakResimURL, KP.OlusturulmaTarihi -- Eğer UrunSayisi eklenirse
      ORDER BY OlusturulmaTarihi DESC;
    `);

    console.log(`Found ${result.recordset.length} prototypes for KullaniciID: ${kullaniciId}`);
    res.status(200).json(result.recordset);

  } catch (error) {
    console.error('=== GET USER COMBINATION PROTOTYPES ENDPOINT ERROR ===');
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Error fetching user combination prototypes:', errorMessage);
    if (errorStack) {
        console.error('Error stack:', errorStack);
    }
    res.status(500).json({ message: 'Kullanıcı kombin prototipleri alınırken bir sunucu hatası oluştu: ' + errorMessage });
  }
});

// --- YENİ ENDPOINT: Belirli Bir Kombin Prototipinin Detaylarını Getirme ---
app.get('/api/kombin-prototip/:id', async (req, res) => {
  console.log('=== GET COMBINATION PROTOTYPE DETAIL ENDPOINT CALLED ===');
  const prototipId = req.params.id;

  if (!prototipId) {
    console.log('ERROR: Missing prototipId path parameter.');
    return res.status(400).json({ message: 'Prototip ID (URL parametresi) gereklidir.' });
  }

  try {
    const pool = await connectToDb();
    const request = pool.request();
    request.input('PrototipID', sql.Int, parseInt(prototipId, 10));

    // 1. Ana Prototip Bilgilerini Çek
    const prototipAnaResult = await request.query(`
      SELECT 
        PrototipID,
        PrototipAdi,
        Aciklama,
        KapakResimURL,
        OlusturulmaTarihi,
        KullaniciID
      FROM KombinPrototip
      WHERE PrototipID = @PrototipID;
    `);

    if (!prototipAnaResult.recordset || prototipAnaResult.recordset.length === 0) {
      console.log(`Prototip bulunamadı, ID: ${prototipId}`);
      return res.status(404).json({ message: 'Kombin prototipi bulunamadı.' });
    }

    const prototipDetay = prototipAnaResult.recordset[0];

    // 2. Prototipteki Ürünleri Çek
    const urunlerRequest = new sql.Request(pool); // Yeni bir request objesi pool'dan oluşturulmalı veya transaction'dan (eğer varsa)
    urunlerRequest.input('PrototipID_Urunler', sql.Int, parseInt(prototipId, 10)); // Farklı bir input adı, çakışmayı önlemek için
    const urunlerResult = await urunlerRequest.query(`
      SELECT
        PrototipUrunID,
        UrunKaynakID, 
        UrunAdi,
        ResimURL,
        Kategori,
        Fiyat,
        Sira
      FROM KombinPrototipUrunleri
      WHERE PrototipID = @PrototipID_Urunler
      ORDER BY Sira ASC;
    `);

    prototipDetay.urunler = urunlerResult.recordset;

    console.log(`Kombin prototipi detayları başarıyla alındı, ID: ${prototipId}, Ürün Sayısı: ${prototipDetay.urunler.length}`);
    res.status(200).json(prototipDetay);

  } catch (error) {
    console.error('=== GET COMBINATION PROTOTYPE DETAIL ENDPOINT ERROR ===');
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Error fetching combination prototype details:', errorMessage);
    if (errorStack) {
        console.error('Error stack:', errorStack);
    }
    res.status(500).json({ message: 'Kombin prototip detayları alınırken bir sunucu hatası oluştu: ' + errorMessage });
  }
});

// --- YENİ ENDPOINT: Kullanıcı Bilgilerini Getirme ---
app.get('/api/user/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ message: 'Kullanıcı ID gereklidir.' });
  }

  try {
    const pool = await connectToDb();
    const request = pool.request();
    request.input('userId', sql.Int, userId);

    const result = await request.query('SELECT KullaniciID, KullaniciAdi, Email, Ad, Soyad, ProfilFotoURL FROM Kullanicilar WHERE KullaniciID = @userId');

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    res.json(result.recordset[0]);

  } catch (error) {
    console.error(`Kullanıcı verileri alınırken hata oluştu (ID: ${userId}):`, error);
    res.status(500).json({ message: 'Kullanıcı verileri alınırken bir sunucu hatası oluştu.' });
  }
});

app.get('/', (req, res) => {
  res.send('Clothing Combo Backend is running (with MS SQL Login, Fake Store API, Unsplash and Placeholder Data)!');
});

// Debug endpoint to check database schema
app.get('/api/debug/kombinler-schema', async (req, res) => {
  try {
    const pool = await connectToDb();
    
    // Check column information
    const schemaResult = await pool.request().query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH,
        IS_NULLABLE,
        COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Kombinler'
      ORDER BY ORDINAL_POSITION
    `);
    
    res.json({
      tableName: 'Kombinler',
      columns: schemaResult.recordset,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Database schema check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to fix database schema
app.post('/api/debug/fix-kombinler-schema', async (req, res) => {
  try {
    const pool = await connectToDb();
    const results = [];
    
    // Drop Gorunurluk column if it exists
    try {
      await pool.request().query('ALTER TABLE Kombinler DROP COLUMN Gorunurluk');
      results.push('✓ Dropped existing Gorunurluk column');
    } catch (dropError) {
      results.push(`ℹ️ Gorunurluk column might not exist: ${dropError.message}`);
    }
    
    // Add Gorunurluk column with correct type
    try {
      await pool.request().query('ALTER TABLE Kombinler ADD Gorunurluk NVARCHAR(20) DEFAULT \'herkes\'');
      results.push('✓ Added Gorunurluk column as NVARCHAR(20)');
    } catch (addError) {
      results.push(`❌ Failed to add Gorunurluk column: ${addError.message}`);
    }
    
    // Fix KapakResimURL column
    try {
      await pool.request().query('ALTER TABLE Kombinler ALTER COLUMN KapakResimURL NVARCHAR(MAX)');
      results.push('✓ Modified KapakResimURL to NVARCHAR(MAX)');
    } catch (alterError) {
      results.push(`❌ Failed to modify KapakResimURL: ${alterError.message}`);
    }
    
    res.json({
      message: 'Schema fix attempted',
      results: results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Database schema fix error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to get the last combination
app.get('/api/debug/last-combination', async (req, res) => {
  console.log('=== GET LAST COMBINATION ENDPOINT CALLED ===');
  try {
    const pool = await connectToDb();
    const request = pool.request();

    const lastKombinResult = await request.query(`
      SELECT TOP 1 KombinID, KullaniciID, KombinAdi, Aciklama, KapakResimURL, Stil, Mevsim, PaylasildiMi, Gorunurluk, OlusturulmaTarihi 
      FROM Kombinler 
      ORDER BY OlusturulmaTarihi DESC
    `);

    if (lastKombinResult.recordset.length === 0) {
      console.log('No combinations found.');
      return res.status(404).json({ message: 'No combinations found' });
    }

    const lastKombin = lastKombinResult.recordset[0];
    console.log('Last combination retrieved:', JSON.stringify(lastKombin, null, 2));

    const kiyafetleriRequest = pool.request();
    kiyafetleriRequest.input('kombinId', sql.Int, lastKombin.KombinID);
    const kiyafetleriResult = await kiyafetleriRequest.query(`
      SELECT kk.KiyafetID, k.Isim, k.ResimURL, kk.Sira 
      FROM KombinKiyafetleri kk 
      JOIN Kiyafetler k ON kk.KiyafetID = k.KiyafetID 
      WHERE kk.KombinID = @kombinId 
      ORDER BY kk.Sira
    `);

    lastKombin.kiyafetler = kiyafetleriResult.recordset;
    console.log('Combination items retrieved:', JSON.stringify(lastKombin.kiyafetler, null, 2));
    console.log('=== GET LAST COMBINATION ENDPOINT SUCCESS ===');
    res.json(lastKombin);

  } catch (error) {
    console.error('=== GET LAST COMBINATION ENDPOINT ERROR ===');
    console.error('Error fetching last combination:', error);
    res.status(500).json({ message: 'Error fetching last combination', error: error.message });
  }
});

// --- GET A SPECIFIC COMBINATION BY ID ---
app.get('/api/combinations/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.query.userId; // Beğeni durumu için opsiyonel kullanıcı ID'si

  if (!id) {
    return res.status(400).json({ message: 'Kombin ID\'si gereklidir.' });
  }

  try {
    const pool = await connectToDb();
    const request = pool.request();
    request.input('KombinID', sql.Int, id);

    // Ana kombin bilgisini çek
    const kombinResult = await request.query(`
      SELECT 
        k.KombinID as id,
        k.KombinAdi as isim,
        k.Aciklama as aciklama,
        k.KapakResimURL as kapakResimUrl,
        k.Stil as stil,
        k.Mevsim as mevsim,
        k.BegeniSayisi as begeniSayisi,
        k.GoruntulenmeSayisi as goruntulenmeSayisi,
        k.OlusturulmaTarihi as olusturulmaTarihi,
        u.KullaniciID as kullaniciId,
        u.KullaniciAdi as kullaniciAdi,
        u.Ad as kullaniciAd,
        u.Soyad as kullaniciSoyad,
        u.ProfilFotoURL as kullaniciProfilFoto
      FROM Kombinler k
      INNER JOIN Kullanicilar u ON k.KullaniciID = u.KullaniciID
      WHERE k.KombinID = @KombinID AND k.Durum = 'Aktif' AND k.PaylasildiMi = 1;
    `);

    if (kombinResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Kombin bulunamadı veya aktif değil.' });
    }

    const kombinTemel = kombinResult.recordset[0];

    // Kombine ait kıyafetleri çek
    const kiyafetlerRequest = pool.request(); // Yeni bir request nesnesi
    kiyafetlerRequest.input('KombinID', sql.Int, id);
    const kiyafetlerResult = await kiyafetlerRequest.query(`
      SELECT 
        ki.KiyafetID as id,
        ki.Isim as isim,
        ki.Marka as marka,
        ki.ResimURL as resimUrl,
        ki.Kategori as kategori,
        ki.Renk as renk,
        ki.Stil as stilKiyafet,
        ki.Cinsiyet as cinsiyet,
        ki.Fiyat as fiyat,
        ki.VeriKaynagi as source,
        ki.EklenmeTarihi as eklenmeTarihi
      FROM Kiyafetler ki
      INNER JOIN KombinKiyafetleri kk ON ki.KiyafetID = kk.KiyafetID
      WHERE kk.KombinID = @KombinID;
    `);

    const urunler = kiyafetlerResult.recordset.map(r => ({
      id: r.id.toString(), // ID'yi string yapalım
      isim: r.isim,
      marka: r.marka,
      resimUrl: r.resimUrl,
      kategori: r.kategori,
      renk: r.renk ? r.renk.split(',') : [], // Renk string ise array'e çevir
      stil: r.stilKiyafet,
      cinsiyet: r.cinsiyet,
      fiyat: r.fiyat,
      source: r.source,
      eklenmeTarihi: r.eklenmeTarihi
    }));

    // Kullanıcının bu kombini beğenip beğenmediği (opsiyonel)
    let likedByUser = false;
    if (userId) {
      const likeStatusRequest = pool.request();
      likeStatusRequest.input('KombinID', sql.Int, id);
      likeStatusRequest.input('KullaniciID', sql.Int, userId);
      const likeStatusResult = await likeStatusRequest.query(
        'SELECT COUNT(*) as count FROM Begeniler WHERE KombinID = @KombinID AND KullaniciID = @KullaniciID'
      );
      if (likeStatusResult.recordset[0].count > 0) {
        likedByUser = true;
      }
    }

    res.json({
      id: kombinTemel.id.toString(),
      isim: kombinTemel.isim,
      aciklama: kombinTemel.aciklama,
      kapakResimUrl: kombinTemel.kapakResimUrl,
      stil: kombinTemel.stil,
      mevsim: kombinTemel.mevsim,
      begeniSayisi: kombinTemel.begeniSayisi,
      goruntulenmeSayisi: kombinTemel.goruntulenmeSayisi,
      olusturulmaTarihi: kombinTemel.olusturulmaTarihi,
      kullanici: {
        id: kombinTemel.kullaniciId,
        adi: kombinTemel.kullaniciAdi,
        ad: kombinTemel.kullaniciAd,
        soyad: kombinTemel.kullaniciSoyad,
        profilFoto: kombinTemel.kullaniciProfilFoto
      },
      urunler: urunler,
      likedByUser: likedByUser // Kullanıcının beğeni durumu
    });

  } catch (error) {
    console.error(`Error fetching combination with ID ${id}:`, error);
    res.status(500).json({ message: 'Sunucu hatası, kombin getirilemedi.', details: error.message });
  }
});

// Start the server immediately
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  initializeDatabase(); // Veritabanını başlatmayı dene, ama server'ı engelleme
}); 

// --- PROFİL FOTOĞRAFI GÜNCELLEME ENDPOINTİ --- 
app.post('/api/profile/photo', async (req, res) => {
  const { userId, ProfilFotoURL } = req.body;

  if (!userId || !ProfilFotoURL) {
    return res.status(400).json({ message: 'Kullanıcı ID ve ProfilFotoURL gereklidir.' });
  }

  try {
    const pool = await connectToDb();
    const request = pool.request();
    request.input('userId', sql.Int, userId);
    request.input('ProfilFotoURL', sql.NVarChar, ProfilFotoURL);

    const result = await request.query(`
      UPDATE Kullanicilar
      SET ProfilFotoURL = @ProfilFotoURL
      WHERE KullaniciID = @userId
    `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    res.json({ message: 'Profil fotoğrafı güncellendi.', ProfilFotoURL });
  } catch (error) {
    console.error('Profil fotoğrafı güncelleme hatası:', error);
    res.status(500).json({ message: 'Profil fotoğrafı güncellenirken bir hata oluştu.' });
  }
}); 