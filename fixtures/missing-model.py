#!/usr/bin/env python3
"""Test-only local release server with one genuinely unavailable model asset."""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class MissingModel(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path == '/vendor/lang/eng.traineddata.gz':
            self.send_error(503, 'Fictional E2E: local English model unavailable')
            return
        super().do_GET()


release = Path(sys.argv[1]).resolve(strict=True)
server = ThreadingHTTPServer(('127.0.0.1', int(sys.argv[2])), partial(MissingModel, directory=str(release)))
server.serve_forever()
