from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import json
import time
import random # Kategoriler arası rastgele bekleme için

# WebDriver'ın yolu
CHROMEDRIVER_PATH = 'C:\\Users\\meyda\\React_native_project\\chromedriver.exe'

# Çekilecek kategoriler ve Trendyol URL slug'ları
# Slug, https://www.trendyol.com/SLUG şeklinde URL oluşturmak için kullanılır
CATEGORIES_TO_SCRAPE = [
    {'name_tr': 'Elbise', 'url_slug': 'kadin-elbise-x-c56', 'json_category': 'Elbise'},
    {'name_tr': 'T-shirt', 'url_slug': 'kadin-t-shirt-x-g1-c73', 'json_category': 'T-shirt'},
    {'name_tr': 'Alt - Üst Takım', 'url_slug': 'kadin-alt-ust-takim-x-g1-c83', 'json_category': 'Alt - Üst Takım'},
    {'name_tr': 'Pantolon', 'url_slug': 'kadin-pantolon-x-g1-c70', 'json_category': 'Pantolon'},
    {'name_tr': 'Etek', 'url_slug': 'kadin-etek-x-g1-c69', 'json_category': 'Etek'},
    {'name_tr': 'Gömlek', 'url_slug': 'kadin-gomlek-x-g1-c75', 'json_category': 'Gömlek'},
    {'name_tr': 'Jeans', 'url_slug': 'kadin-jean-x-g1-c120', 'json_category': 'Jeans'},
    {'name_tr': 'Ceket & Yelek', 'url_slug': 'kadin-ceket-yelek-x-g1-c104153', 'json_category': 'Ceket & Yelek'},
]

def scrape_category_page(driver, url, category_name_for_json):
    """
    Belirtilen URL'den (tek bir kategori sayfası) ürün bilgilerini çeker.
    """
    print(f"\nFetching products from: {url} for category: {category_name_for_json}")
    driver.get(url)

    wait_time = 20 
    print(f"Waiting up to {wait_time} seconds for product cards to load...")
    try:
        WebDriverWait(driver, wait_time).until(
            EC.presence_of_all_elements_located((By.CLASS_NAME, "p-card-wrppr"))
        )
        print("Product cards seem to be loaded.")
        time.sleep(random.uniform(3, 7)) # Dinamik içeriğin tam yüklenmesi için ek bekleme
        page_source = driver.page_source
    except Exception as e:
        print(f"Error waiting for product cards or getting page source for {url}: {e}")
        return []

    soup = BeautifulSoup(page_source, 'html.parser')
    products_on_page = []
    product_cards = soup.find_all('div', class_='p-card-wrppr')
    print(f"Found {len(product_cards)} product cards on this page.")

    if not product_cards:
        print(f"No product cards found for {url}. Check selectors or page structure.")
        return []

    for card_index, card in enumerate(product_cards):
        try:
            name = 'N/A'
            name_element = card.find('span', class_='prdct-desc-cntnr-name')
            if name_element:
                name = name_element.get_text(strip=True)
            
            image_for_alt_name = card.find('img', class_='p-card-img') 
            if name == 'N/A' and image_for_alt_name and image_for_alt_name.get('alt'):
                name = image_for_alt_name.get('alt', 'N/A').strip()
            if name == 'N/A' and card.get('title'):
                 name = card.get('title').strip()

            # Fiyatları çekmek için güncellenmiş mantık
            price = 'N/A'
            price_text_parts = []

            # 1. Öncelik: class="price-item discounted" (veya sadece price-item)
            # Bazen sadece "price-item" da olabilir, "discounted" olmadan.
            # Ekran görüntüsünde "price-item discounted" olarak görünüyor.
            price_item_div = card.find('div', class_='price-item discounted')
            if not price_item_div: # Eğer "price-item discounted" yoksa, sadece "price-item" dene
                price_item_div = card.find('div', class_='price-item')

            if price_item_div:
                # Bu div içindeki tüm doğrudan metinleri al (text=True sadece ilkini alır)
                # contents kullanarak tüm çocukları alırız ve string olanları birleştiririz.
                for content in price_item_div.contents:
                    if isinstance(content, str):
                        part = content.strip()
                        if part: # Boş stringleri ekleme
                            price_text_parts.append(part)
                if price_text_parts:
                    price = " ".join(price_text_parts).replace('TL', '').strip()
            
            # 2. Yedek Yöntem: Eğer price-item bulunamazsa, eski class'ları dene
            if price == 'N/A':
                price_elements = card.find_all('div', class_='prc-box-dscntd') 
                if not price_elements:
                    price_elements = card.find_all('span', class_='prc-slg')
                
                if price_elements: 
                    for pe in price_elements:
                        if pe.get_text(strip=True):
                            price_text = pe.get_text(strip=True)
                            price = price_text.replace('TL', '').strip()
                            break 
            
            image_url = 'N/A'
            image_wrapper = card.find('div', class_='p-card-img-wr')
            if image_wrapper:
                image_element = image_wrapper.find('img', class_='p-card-img')
                if image_element:
                    image_url = image_element.get('src')
            
            product_url = 'N/A'
            link_element = card.find('a', href=True) 
            if not link_element:
                link_element = card.find('a', class_='p-card-chldrn-cntnr', href=True)
            
            if link_element and link_element.get('href'):
                href = link_element.get('href')
                if href.startswith('/'):
                    product_url = "https://www.trendyol.com" + href
                else:
                    product_url = href 

            # Sadece adı ve resmi olan ve placeholder olmayan ürünleri ekle
            if name != 'N/A' and image_url != 'N/A' and (not 'placeholder' in image_url and not 'generic-product' in image_url) :
                products_on_page.append({
                    'name': name,
                    'price': price,
                    'image_url': image_url,
                    'product_url': product_url,
                    'category': category_name_for_json, 
                    'source': 'Trendyol (Selenium)'
                })
            # else:
                # print(f"Skipping card {card_index+1} in {category_name_for_json} due to missing info or placeholder: Name='{name}', Image='{image_url}'")

        except Exception as e:
            print(f"Error parsing a product card (index {card_index}) in {category_name_for_json}: {e}")
            continue
    return products_on_page

if __name__ == "__main__":
    print("Starting Trendyol multi-category scraper with Selenium...")
    
    options = webdriver.ChromeOptions()
    # options.add_argument('--headless') 
    options.add_argument('--disable-gpu')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")

    service = ChromeService(executable_path=CHROMEDRIVER_PATH)
    driver = None
    all_fetched_products = []

    try:
        driver = webdriver.Chrome(service=service, options=options)
        print("Selenium WebDriver initialized.")

        for category_info in CATEGORIES_TO_SCRAPE:
            current_url = f"https://www.trendyol.com/{category_info['url_slug']}"
            products_from_category = scrape_category_page(driver, current_url, category_info['json_category'])
            all_fetched_products.extend(products_from_category)
            print(f"Fetched {len(products_from_category)} products from {category_info['name_tr']}. Total so far: {len(all_fetched_products)}")
            
            # Kategoriler arası bekleme (sunucuyu yormamak için)
            sleep_duration = random.uniform(5, 10) # 5 ila 10 saniye arası rastgele bekle
            print(f"Waiting for {sleep_duration:.2f} seconds before next category...")
            time.sleep(sleep_duration)

    except Exception as e:
        print(f"An error occurred in the main scraping process: {e}")
    finally:
        if driver:
            print("Closing Selenium WebDriver.")
            driver.quit()

    if all_fetched_products:
        print(f"\nSuccessfully fetched a total of {len(all_fetched_products)} products from all categories.")
        output_filename = 'trendyol_multi_category_products.json'
        with open(output_filename, 'w', encoding='utf-8') as f:
            json.dump(all_fetched_products, f, ensure_ascii=False, indent=4)
        print(f"All products saved to {output_filename}")
    else:
        print("\nNo products were fetched from any category. Check logs for errors.")

    print("Multi-category scraper finished.") 