import json
import random
from flask import Flask, request, jsonify
from flask_cors import CORS # CORS hatalarını önlemek için

app = Flask(__name__)
CORS(app) # Tüm endpoint'ler için CORS'u etkinleştir

# YENİ: Önceden işlenmiş, renk bilgisi eklenmiş dosyayı kullan
PRODUCTS_FILE = 'products_with_colors.json'
all_products = []

def load_products():
    global all_products
    try:
        with open(PRODUCTS_FILE, 'r', encoding='utf-8') as f:
            all_products = json.load(f)
        print(f"{len(all_products)} ürün (renk bilgisiyle) başarıyla yüklendi.")
    except FileNotFoundError:
        print(f"HATA: {PRODUCTS_FILE} dosyası bulunamadı!")
        print("Lütfen önce 'preprocess_products.py' script'ini çalıştırarak renk analiz dosyasını oluşturun.")
        all_products = []
    except json.JSONDecodeError:
        print(f"HATA: {PRODUCTS_FILE} dosyası geçerli bir JSON formatında değil!")
        all_products = []

# Basit kategori eşleştirme kuralları
# Bu kuralları ve kategori isimlerini kendi veri setinize göre detaylandırabilirsiniz.
COMPLEMENTARY_RULES = {
    "TOPS": ["T-shirt", "Gömlek", "Sweatshirt", "Bluz", "Crop-Top"], # Crop-Top ekledim, verinizde varsa kullanılır
    "BOTTOMS": ["Pantolon", "Etek", "Şort", "Jeans"],
    "OUTERWEAR": ["Ceket & Yelek", "Hırka", "Mont"], # Hırka, Mont ekledim
    "ONE_PIECE": ["Alt-Üst Takım", "Elbise", "Tulum"], # Tulum ekledim
    "SHOES": ["Ayakkabı", "Spor Ayakkabı", "Bot", "Topuklu Ayakkabı"], # Ayakkabı kategorisi
    "ACCESSORIES": ["Çanta", "Takı", "Şapka", "Kemer"] # Aksesuar kategorisi
}

# Hangi ana kategoriye hangi diğer ana kategoriler önerilir
SUGGESTION_LOGIC = {
    "TOPS": ["BOTTOMS", "OUTERWEAR", "ACCESSORIES"],
    "BOTTOMS": ["TOPS", "OUTERWEAR", "SHOES", "ACCESSORIES"],
    "OUTERWEAR": ["TOPS", "BOTTOMS", "ONE_PIECE"], # Outerwear altına tek parça da giyilebilir
    "ONE_PIECE": ["OUTERWEAR", "SHOES", "ACCESSORIES"],
    "SHOES": ["BOTTOMS", "ONE_PIECE", "TOPS"], # Ayakkabıya göre kıyafet
    "ACCESSORIES": ["TOPS", "BOTTOMS", "ONE_PIECE"] # Aksesuara göre kıyafet
}

# YENİ: Bir kombinde yalnızca bir kez bulunabilecek ana kategoriler
SINGLE_INSTANCE_CATEGORIES = {"TOPS", "BOTTOMS", "OUTERWEAR", "ONE_PIECE", "SHOES"}

# RENK TEORİSİ KURALLARI (Kılavuzdan alınan)
COLOR_THEORY = {
    "kırmızı": {"complementary": ["yeşil"], "analogous": ["turuncu", "pembe"], "triadic": ["mavi", "sarı"], "monochrome": ["bordo", "açık kırmızı"]},
    "mavi": {"complementary": ["turuncu"], "analogous": ["lacivert", "mor"], "triadic": ["kırmızı", "sarı"], "monochrome": ["açık mavi", "lacivert"]},
    "sarı": {"complementary": ["mor"], "analogous": ["turuncu", "yeşil"], "triadic": ["kırmızı", "mavi"], "monochrome": ["açık sarı", "altın"]},
    "lacivert": {"complementary": ["turuncu", "bej"], "analogous": ["açık mavi", "mor"], "triadic": ["kahverengi", "bej"], "monochrome": ["açık mavi", "denim"]},
    "bordo": {"complementary": ["zeytin yeşili"], "analogous": ["kırmızı", "kahverengi"], "triadic": ["lacivert", "bej"], "monochrome": ["açık bordo", "koyu bordo"]},
    "yeşil": {"complementary": ["kırmızı"], "analogous": ["zeytin", "sarı yeşil"], "triadic": ["turuncu", "mor"], "monochrome": ["açık yeşil", "haki"]},
    "turuncu": {"complementary": ["mavi"], "analogous": ["kırmızı", "sarı"], "triadic": ["yeşil", "mor"], "monochrome": ["açık turuncu", "koyu turuncu"]},
    "mor": {"complementary": ["sarı"], "analogous": ["lacivert", "pembe"], "triadic": ["yeşil", "turuncu"], "monochrome": ["açık mor", "lila"]},
    "bej": {"complementary": ["lacivert"], "analogous": ["kahverengi", "krem"], "triadic": ["beyaz", "siyah"], "monochrome": ["krem", "kum rengi"]},
    "kahverengi": {"complementary": ["mavi"], "analogous": ["bej", "krem"], "triadic": ["lacivert", "yeşil"], "monochrome": ["açık kahverengi", "koyu kahverengi"]},
    "gri": {"complementary": ["bordo"], "analogous": ["beyaz", "siyah"], "triadic": ["mavi", "kırmızı"], "monochrome": ["açık gri", "antrasit"]},
    "siyah": {"complementary": ["beyaz"], "analogous": ["gri", "bej"], "triadic": ["kırmızı", "mavi"], "monochrome": ["antrasit", "gri"]},
    "beyaz": {"complementary": ["siyah"], "analogous": ["gri", "bej"], "triadic": ["kırmızı", "mavi"], "monochrome": ["açık gri", "krem"]},
    # ... diğer renkler eklenebilir
}

# Nötr renkler
NEUTRAL_COLORS = ["siyah", "beyaz", "gri", "bej", "lacivert"]

def get_main_category(item_category_name):
    item_category_name_lower = item_category_name.lower()
    for main_cat, sub_cats in COMPLEMENTARY_RULES.items():
        if any(sub_cat.lower() == item_category_name_lower for sub_cat in sub_cats):
            return main_cat
    return None # Eşleşme bulunamazsa

def get_color_theory_matches(main_color):
    matches = set()
    theory = COLOR_THEORY.get(main_color, {})
    for key in ["complementary", "analogous", "triadic", "monochrome"]:
        matches.update(theory.get(key, []))
    # Nötr renkler her zaman uyumlu
    matches.update(NEUTRAL_COLORS)
    return list(matches)

# KOMBiN TEORiSi KURALLARI
SILUET_DENGESI = {
    # Alt parça: önerilen üst parça tipleri
    "Bol Pantolon": ["Crop Top", "Fitted", "Kısa Üst", "Body"],
    "Dar Pantolon": ["Oversize Tişört", "Sweatshirt", "Gömlek"],
    "Midi Etek": ["Basic Tişört", "Crop", "Body"],
    "Mini Etek": ["Oversize Gömlek", "Blazer"],
    "Şort": ["Oversize Gömlek", "Blazer", "Crop Top"],
    "Jean": ["Crop Top", "Oversize Tişört", "Blazer"],
    # ... diğer alt parça tipleri
}

STYLE_GROUPS = {
    "spor": ["Eşofman", "Crop", "Sneaker"],
    "casual": ["Jean", "Tişört", "Ceket"],
    "chic": ["Blazer", "Dar Pantolon", "Top", "Topuklu Ayakkabı"],
    "streetwear": ["Oversize", "Sneaker", "Bucket Hat"],
    "boho": ["Salaş Elbise", "Etnik Desen", "Sandalet"],
}

SEASON_GROUPS = {
    "yaz": ["Şort", "Crop", "Sandalet"],
    "kış": ["Skinny Jean", "Kazak", "Palto", "Bot"],
    "ilkbahar": ["Elbise", "Jean Ceket"],
    "sonbahar": ["Trençkot", "Jean", "Tişört"],
}

SHOE_STYLE = {
    "Sneaker": ["Spor", "Streetwear"],
    "Topuklu": ["Chic", "Klasik"],
    "Bot": ["Kış", "Sonbahar", "Rock", "Grunge"],
    "Sandalet": ["Boho", "Yaz"],
}

# Alt-üst oranı için örnek (1/3 kuralı)
ALT_UST_ORAN = {
    "Crop Top": "Yüksek Bel Pantolon",
    "Oversize Tişört": "Düşük Bel Pantolon",
    # ...
}

def get_silhouette_matches(bottom_category):
    # Alt parça tipine göre önerilen üst parça tiplerini döndür
    return SILUET_DENGESI.get(bottom_category, [])

def get_style_matches(style):
    # Stil grubuna göre önerilen parça tiplerini döndür
    return STYLE_GROUPS.get(style, [])

def get_season_matches(season):
    return SEASON_GROUPS.get(season, [])

def get_shoe_matches(shoe_type):
    return SHOE_STYLE.get(shoe_type, [])

def get_alt_ust_oran_matches(top_type):
    return ALT_UST_ORAN.get(top_type, None)

@app.route('/suggest_complementary_items', methods=['POST'])
def suggest_complementary_items():
    if not all_products:
        return jsonify({"error": "Ürün verisi yüklenemedi veya bulunamadı."}), 500

    data = request.get_json()
    selected_item_category_name = data.get('category')
    selected_item_id = data.get('id')
    num_suggestions = data.get('count', 3)
    color_preference = data.get('color_preference')
    style_keywords = data.get('style_keywords')
    style_preference = data.get('style_preference') # yeni: kullanıcıdan stil tercihi alınabilir
    season_preference = data.get('season_preference') # yeni: kullanıcıdan mevsim tercihi alınabilir
    # YENİ: Kombinde mevcut olan kategorilerin listesi
    current_categories = data.get('current_categories', [])

    if not selected_item_category_name:
        return jsonify({"error": "Kategori bilgisi eksik."}), 400

    current_main_category = get_main_category(selected_item_category_name)
    if not current_main_category:
        error_message = f"'{selected_item_category_name}' için ana kategori bulunamadı veya tanımlı değil."
        return jsonify({"error": error_message}), 400
    
    # YENİ: Önerilerden hariç tutulacak ana kategorileri belirle
    excluded_main_categories = set()
    if current_categories:
        for cat_name in current_categories:
            main_cat = get_main_category(cat_name)
            if main_cat and main_cat in SINGLE_INSTANCE_CATEGORIES:
                excluded_main_categories.add(main_cat)
            # YENİ KURAL: Eğer tek parça bir kıyafet varsa, üst ve alt giyimi de engelle
            if main_cat == "ONE_PIECE":
                excluded_main_categories.add("TOPS")
                excluded_main_categories.add("BOTTOMS")

    print(f"Seçilen ürün kategorisi: {selected_item_category_name} (Ana Kategori: {current_main_category})")
    if excluded_main_categories:
        print(f"Kombinde zaten var olan (ve tekil) ana kategoriler: {excluded_main_categories}")

    possible_suggestion_main_categories = SUGGESTION_LOGIC.get(current_main_category, [])

    # YENİ: Zaten var olan kategorileri öneri listesinden çıkar
    if excluded_main_categories:
        original_suggestion_count = len(possible_suggestion_main_categories)
        possible_suggestion_main_categories = [
            cat for cat in possible_suggestion_main_categories if cat not in excluded_main_categories
        ]
        if len(possible_suggestion_main_categories) < original_suggestion_count:
            print(f"Filtreleme sonrası önerilecek ana kategoriler: {possible_suggestion_main_categories}")

    if not possible_suggestion_main_categories:
        return jsonify({"recommendations": [], "message": "Bu kategori için tanımlı veya uygun bir öneri kalmadı."}), 200

    print(f"Öneri için potansiyel ana kategoriler: {possible_suggestion_main_categories}")
    
    suggestions = []
    
    # Önerilecek alt kategorileri topla
    target_sub_categories = []
    for main_cat_to_suggest in possible_suggestion_main_categories:
        target_sub_categories.extend(COMPLEMENTARY_RULES.get(main_cat_to_suggest, []))
    
    if not target_sub_categories:
         return jsonify({"recommendations": [], "message": "Önerilecek uygun alt kategori bulunamadı."}), 200

    print(f"Öneri için hedeflenen alt kategoriler: {target_sub_categories}")

    # Hedeflenen alt kategorilerdeki ürünleri filtrele
    candidate_products = [
        p for p in all_products
        if p.get('category') in target_sub_categories and p.get('product_url') != selected_item_id
    ]
    
    print(f"{len(candidate_products)} adet potansiyel kategori bazlı öneri bulundu.")

    # --- HIZLANDIRILMIŞ RENK TEORİSİ UYGULAMASI ---
    # Artık resim analizi yok, sadece önceden hesaplanmış veriyi oku!
    renk_uyumlu_urunler = []
    ana_renk = None
    if color_preference and candidate_products:
        color_preference_lower = color_preference.lower()
        ana_renk = color_preference_lower
        for p in candidate_products:
            # Önceden işlenmiş renkleri kullan
            dominant_colors = p.get('dominant_colors', [])
            if color_preference_lower in dominant_colors:
                renk_uyumlu_urunler.append(p)
        candidate_products = renk_uyumlu_urunler
        print(f"Kullanıcı renk tercihiyle filtrelenen ürün sayısı: {len(candidate_products)}")
    elif candidate_products:
        selected_product = next((p for p in all_products if p.get('product_url') == selected_item_id), None)
        if selected_product:
            # Seçilen ürünün önceden işlenmiş renklerini kullan
            dominant_colors = selected_product.get('dominant_colors', [])
            if dominant_colors:
                ana_renk = dominant_colors[0]
                uyumlu_renkler = get_color_theory_matches(ana_renk)
                for p in candidate_products:
                    # Aday ürünlerin önceden işlenmiş renklerini kullan
                    urun_renkler = p.get('dominant_colors', [])
                    if any(r in uyumlu_renkler for r in urun_renkler):
                        renk_uyumlu_urunler.append(p)
                candidate_products = renk_uyumlu_urunler
                print(f"Renk teorisiyle filtrelenen ürün sayısı: {len(candidate_products)}")

    # --- KOMBiN TEORiSi UYGULAMA (Değişiklik yok, zaten hızlıydı) ---
    selected_product = next((p for p in all_products if p.get('product_url') == selected_item_id), None)

    # 1. Stil tercihi
    if style_preference and candidate_products:
        style_matches = get_style_matches(style_preference.lower())
        candidate_products = [p for p in candidate_products if any(st in (p.get('name','').lower() + ' ' + p.get('category','').lower()) for st in style_matches)]
        print(f"Stil tercihiyle filtrelenen ürün sayısı: {len(candidate_products)}")
    # 2. Mevsim tercihi
    elif season_preference and candidate_products:
        season_matches = get_season_matches(season_preference.lower())
        candidate_products = [p for p in candidate_products if any(ms in (p.get('name','').lower() + ' ' + p.get('category','').lower()) for ms in season_matches)]
        print(f"Mevsim tercihiyle filtrelenen ürün sayısı: {len(candidate_products)}")
    # 3. Alt-üst oranı ve silüet dengesi
    elif candidate_products and selected_product:
        selected_cat = selected_product.get('category','')
        siluet_matches = get_silhouette_matches(selected_cat)
        siluet_uyumlu_urunler = [p for p in candidate_products if any(sil in (p.get('name','').lower() + ' ' + p.get('category','').lower()) for sil in siluet_matches)]
        if siluet_uyumlu_urunler:
            candidate_products = siluet_uyumlu_urunler
            print(f"Silüet dengesiyle filtrelenen ürün sayısı: {len(candidate_products)}")

    # Stil anahtar kelimelerine göre filtreleme
    if style_keywords and isinstance(style_keywords, list) and candidate_products:
        style_keywords_lower = [keyword.lower() for keyword in style_keywords]
        filtered_by_style = []
        for p in candidate_products:
            if p.get('name'):
                product_name_lower = p['name'].lower()
                if any(keyword in product_name_lower for keyword in style_keywords_lower):
                    filtered_by_style.append(p)
        candidate_products = filtered_by_style
        print(f"Stil anahtar kelimesiyle filtrelenen ürün sayısı: {len(candidate_products)}")
    
    print(f"Nihai filtreleme sonrası {len(candidate_products)} adet potansiyel öneri bulundu.")

    if candidate_products:
        num_to_select = min(num_suggestions, len(candidate_products))
        suggestions = random.sample(candidate_products, num_to_select)
        
    return jsonify({"recommendations": suggestions})

if __name__ == '__main__':
    load_products()
    app.run(debug=True, port=5000) # debug=True geliştirme için, production'da False yapın 