import json
import cv2
import numpy as np
import requests
from io import BytesIO
from PIL import Image
from sklearn.cluster import KMeans
import os

def rgb_to_color_name(rgb_tuple):
    colors = {
        "kırmızı": (255, 0, 0), "yeşil": (0, 128, 0), "mavi": (0, 0, 255),
        "sarı": (255, 255, 0), "beyaz": (255, 255, 255), "siyah": (0, 0, 0),
        "turuncu": (255, 165, 0), "mor": (128, 0, 128), "pembe": (255, 192, 203),
        "kahverengi": (165, 42, 42), "gri": (128, 128, 128), "bej": (245, 245, 220),
        "lacivert": (0, 0, 128), "bordo": (128, 0, 0), "haki": (107, 142, 35),
        "krem": (255, 253, 208),
    }
    min_distance = float('inf')
    closest_color_name = "bilinmeyen"
    if isinstance(rgb_tuple, (list, tuple, np.ndarray)) and len(rgb_tuple) == 3:
        r, g, b = int(rgb_tuple[0]), int(rgb_tuple[1]), int(rgb_tuple[2])
        for name, (cr, cg, cb) in colors.items():
            distance = np.sqrt((r - cr)**2 + (g - cg)**2 + (b - cb)**2)
            if distance < min_distance:
                min_distance = distance
                closest_color_name = name
    else:
        return "hata"
    return closest_color_name

def get_dominant_colors_from_image_url(image_url, num_colors=5):
    try:
        response = requests.get(image_url, timeout=15)
        response.raise_for_status()
        image = Image.open(BytesIO(response.content))
        image_np = np.array(image.convert('RGB'))
        if image_np is None or image_np.size == 0: return []
        max_dim = 200
        h, w, _ = image_np.shape
        if h > max_dim or w > max_dim:
            if h > w:
                new_h, new_w = max_dim, int(w * (max_dim / h))
            else:
                new_w, new_h = max_dim, int(h * (max_dim / w))
            image_np = cv2.resize(image_np, (new_w, new_h), interpolation=cv2.INTER_AREA)
        pixels = image_np.reshape((-1, 3))
        if np.isnan(pixels).any() or np.isinf(pixels).any(): return []
        kmeans = KMeans(n_clusters=num_colors, random_state=42, n_init=10)
        kmeans.fit(pixels)
        dominant_rgb_colors = kmeans.cluster_centers_.astype(int)
        dominant_color_names = [rgb_to_color_name(color_rgb) for color_rgb in dominant_rgb_colors]
        return list(set(c for c in dominant_color_names if c not in ["bilinmeyen", "hata"]))
    except Exception as e:
        print(f"\n[Hata] URL işlenemedi: {image_url} - Sebep: {e}")
        return []

def preprocess_products():
    input_file = 'trendyol_multi_category_products.json'
    output_file = 'products_with_colors.json'
    
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            products = json.load(f)
        print(f"'{input_file}' dosyasından {len(products)} ürün yüklendi.")
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"HATA: '{input_file}' dosyası okunamadı: {e}")
        return

    enriched_products = []
    total_products = len(products)
    
    print("\nÜrünlerin renk analizi başlıyor... Bu işlem ürün sayısına göre uzun sürebilir.")
    
    for i, product in enumerate(products):
        image_url = product.get('image_url')
        product_id = product.get('product_url', f"index_{i}")
        
        if image_url:
            product['dominant_colors'] = get_dominant_colors_from_image_url(image_url)
        else:
            product['dominant_colors'] = []
            
        enriched_products.append(product)
        
        progress = (i + 1) / total_products * 100
        print(f"\rİşleniyor: {i + 1}/{total_products} (%{progress:.2f})", end="")

    print("\n\nRenk analizi tamamlandı.")

    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(enriched_products, f, ensure_ascii=False, indent=2)
        print(f"Başarılı: Zenginleştirilmiş ürün verisi '{output_file}' dosyasına kaydedildi.")
    except IOError as e:
        print(f"HATA: '{output_file}' dosyasına yazılırken bir sorun oluştu: {e}")

if __name__ == '__main__':
    preprocess_products() 