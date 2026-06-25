import http.server
import socketserver
import threading
import time
import os
import sys
import subprocess

PORT = 8000
UPDATE_HOUR = 22  # Update daily at 22:00 (10:00 PM) Taipei time
DATA_FILE = "data/funds.json"

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS for convenience and disable caching for dynamic data
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

def run_scraper():
    print("[Scheduler] Running fund scraper to update data...")
    try:
        # Run update_data.py as a subprocess or import it. Subprocess is cleaner.
        result = subprocess.run([sys.executable, "update_data.py"], capture_output=True, text=True)
        print(result.stdout)
        if result.stderr:
            print("[Scheduler] Scraper Errors:", result.stderr)
        print("[Scheduler] Fund scraper completed.")
    except Exception as e:
        print(f"[Scheduler] Scraper execution failed: {e}")

def scheduler_loop():
    print("[Scheduler] Background scheduler started.")
    
    # Check if data file exists, if not, fetch immediately
    if not os.path.exists(DATA_FILE):
        print(f"[Scheduler] Data file '{DATA_FILE}' not found. Fetching initial data...")
        run_scraper()
        
    last_update_date = ""
    while True:
        try:
            now = time.localtime()
            current_date = time.strftime("%Y-%m-%d", now)
            current_hour = now.tm_hour
            
            # Check if it's the scheduled hour and we haven't updated today yet
            if current_hour == UPDATE_HOUR and current_date != last_update_date:
                print(f"[Scheduler] Scheduled time reached ({UPDATE_HOUR}:00). Starting daily update...")
                run_scraper()
                last_update_date = current_date
                
            # Sleep for 15 minutes before checking again
            time.sleep(900)
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"[Scheduler] Scheduler error: {e}")
            time.sleep(60)

def start_server():
    # Set CWD to the script folder to ensure paths are correct
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    # Start scheduler thread
    sched_thread = threading.Thread(target=scheduler_loop, daemon=True)
    sched_thread.start()
    
    # Start HTTP server
    handler = MyHTTPRequestHandler
    # Allow address reuse to prevent "Address already in use" errors on restarts
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"\n================================================== ")
        print(f"  Taiwan Fund Tracker server running locally at: ")
        print(f"  -> http://localhost:{PORT} ")
        print(f"================================================== ")
        print("Press Ctrl+C to stop the server.\n")

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            httpd.shutdown()
            sys.exit(0)

if __name__ == "__main__":
    start_server()
