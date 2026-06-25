import urllib.request
import urllib.error
import ssl
import json
import os
import time

# Disable SSL verification due to certificate verify issues with urllib in some local environments
context = ssl._create_unverified_context()

def fetch_funds_page(page_index, page_size=1000):
    url = "https://www.anuefund.com/anuefundApi/Search/Detail"
    payload = {
        "fundIDs": "",
        "keyword": "",
        "pageIndex": str(page_index),
        "pageSize": str(page_size),
        "sortColumnName": "perF_1YTDJ",  # Default sort by 1-year return in TWD
        "desc": True,
        "condition": []
    }
    
    req_data = json.dumps(payload).encode('utf-8')
    try:
        req = urllib.request.Request(
            url, 
            data=req_data,
            headers={
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        )
        with urllib.request.urlopen(req, context=context) as response:
            resp = json.loads(response.read().decode('utf-8'))
            if resp.get('succ'):
                return resp.get('data', {}).get('fundDatas', [])
    except Exception as e:
        print(f"Error fetching page {page_index}: {e}")
    return []

def main():
    print("Starting mutual fund data scraping...")
    all_funds = []
    
    # We will fetch up to 5 pages (5000 funds, which covers all funds in the system)
    for page in range(1, 6):
        print(f"Fetching page {page} of 1000 funds...")
        page_funds = fetch_funds_page(page, 1000)
        if not page_funds:
            print("No more funds or error occurred. Stopping fetch.")
            break
        print(f"Retrieved {len(page_funds)} funds from page {page}.")
        all_funds.extend(page_funds)
        time.sleep(1)  # Respectful delay
        
    print(f"Total funds retrieved: {len(all_funds)}")
    
    if not all_funds:
        print("Error: No fund data retrieved. Aborting.")
        return
        
    processed_funds = []
    for f in all_funds:
        fund_name = f.get('fundName')
        fund_id = f.get('fundID')
        if not fund_name or not fund_id:
            continue
            
        # Determine if it is Domestic (境內) or Offshore (境外)
        # We can look at fundID prefix (usually 'A' is Domestic, 'B' is Offshore in anuefund)
        # Or look at isinCode (if it starts with TW, it is Taiwan registered, i.e. Domestic)
        isin = f.get('isinCode', '')
        is_domestic = isin.startswith('TW') or fund_id.startswith('A')
        ts_cd = "境內" if is_domestic else "境外"
        
        # Safe float conversion helper
        def to_float(val, default=0.0):
            try:
                if val is None:
                    return default
                # Remove percentages or commas
                if isinstance(val, str):
                    val = val.replace('%', '').replace(',', '').strip()
                f_val = float(val)
                # Filter out default placeholder error values like -99999999.9999
                if f_val <= -99999999:
                    return default
                return f_val
            except:
                return default

        # Calendar year returns helper
        def get_year_roi(val):
            val_f = to_float(val, None)
            return val_f if val_f is not None else None

        processed_funds.append({
            "fundID": fund_id,
            "fundName": fund_name,
            "fundGroup": f.get('fundGroup', '其他'),
            "fundCcyDesc": f.get('fundCcyDesc', '台幣'),
            "nav": to_float(f.get('nav')),
            "navDate": f.get('navDate', ''),
            "upUpDown": to_float(f.get('upDown')),
            "upDownRate": to_float(f.get('upDownRate')),
            "ts_cd": ts_cd,
            
            # Returns (TWD)
            "r1M": to_float(f.get('perF_1MTDJ')),
            "r3M": to_float(f.get('perF_3MTDJ')),
            "r6M": to_float(f.get('perF_6MTDJ')),
            "r1Y": to_float(f.get('perF_1YTDJ')),
            "r2Y": to_float(f.get('perF_2YTDJ')),
            "r3Y": to_float(f.get('perF_3YTDJ')),
            "r5Y": to_float(f.get('perF_5YTDJ')),
            "rYTD": to_float(f.get('perF_YTTDJ')),
            
            # Risk Metrics
            "riskReturnRating": f.get('riskReturnRating', 'RR3'),
            "sharpe1Y": to_float(f.get('sharpE_RATIO_1YMEJ')),
            "stdDev1Y": to_float(f.get('standarD_DEVIATION_1YMEJ')),
            "lipperCategory": f.get('lippertW2_CHI', '其他'),
            "setupDate": f.get('setup_date', ''),
            "assetsTWD_B": to_float(f.get('assetsTWD'), 0.0), # In hundred millions TWD or similar
            
            # Calendar year returns (ROI)
            "yearROI1": get_year_roi(f.get('year_ROI1')),  # 2025
            "yearROI2": get_year_roi(f.get('year_ROI2')),  # 2024
            "yearROI3": get_year_roi(f.get('year_ROI3')),  # 2023
            "yearROI4": get_year_roi(f.get('year_ROI4')),  # 2022
            "yearROI5": get_year_roi(f.get('year_ROI5'))   # 2021
        })
        
    print(f"Processed {len(processed_funds)} funds.")
    
    # Save the processed data
    data_dir = "data"
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)
        
    output_path = os.path.join(data_dir, "funds.json")
    
    # Wrap in a root object with metadata
    output_data = {
        "updateTime": time.strftime("%Y-%m-%d %H:%M:%S"),
        "totalCount": len(processed_funds),
        "funds": processed_funds
    }
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully saved fund data to {output_path}")

if __name__ == "__main__":
    main()
