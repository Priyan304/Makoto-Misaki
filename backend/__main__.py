import os
import logging
import sys
import threading
import uvicorn

if __name__ == '__main__':
    if len(os.environ.get('MISAKI_SESSION_TOKEN', '')) < 32:
        raise SystemExit('Use npm run dev or npm run desktop to create an authenticated session.')
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s %(message)s')
    logging.getLogger('httpx').setLevel(logging.WARNING)
    port = int(os.environ.get('MISAKI_BRIDGE_PORT', '8765'))
    if not 1024 <= port <= 65535:
        raise SystemExit('Invalid MISAKI_BRIDGE_PORT')
    server = uvicorn.Server(uvicorn.Config('backend.app:app', host='127.0.0.1', port=port, access_log=False))
    if os.environ.get('MISAKI_MANAGED_STDIN') == '1':
        def watch_launcher():
            # Raw reads avoid holding a buffered stdin lock during shutdown.
            try:
                while os.read(sys.stdin.fileno(), 1):
                    pass
            finally:
                server.should_exit = True

        threading.Thread(target=watch_launcher, daemon=True).start()
    server.run()
