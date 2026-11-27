"""Offline SSE validation, stream cleanup, and desktop HTTP integration."""
import asyncio
import http.client
import json
import sys
import threading
import unittest
from pathlib import Path
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import watchlist_stream as live


class StreamTests(unittest.TestCase):
    def test_validation(self):
        data = [{'source':'binance','symbol':'BTCUSD'}, {'source':'binance','symbol':'BTCUSD'}]
        self.assertEqual(live.parse_entries(json.dumps(data)), [('binance','BTCUSD')])
        for bad in ('', '{}', '[]', json.dumps([{'source':[], 'symbol':'A'}]),
                    json.dumps([{'source':'bist','symbol':'BIST_THYAO'}]),
                    json.dumps([{'source':'binance','symbol':'BTC&limit=999'}]),
                    json.dumps([{'source':'binance','symbol':'A'}] * 21)):
            with self.assertRaises(ValueError): live.parse_entries(bad)

    def test_pump_limits_history_and_cleans_up(self):
        stopped, frames = [], []
        async def feed(ws, symbol, tf):
            try:
                self.assertTrue(ws.watchlist)
                await ws.send(json.dumps({'type':'history','bars':[{'time':i} for i in range(5)]}))
                await ws.send(json.dumps({'type':'bar','bar':{'time':4,'close':11}}))
                await asyncio.sleep(60)
            finally: stopped.append(symbol)
        def write(data):
            frames.append(data.decode())
            if len(frames) == 2: raise BrokenPipeError()
        async def check():
            with self.assertRaises(BrokenPipeError):
                await live.pump([('binance','BTCUSD')], lambda source:feed, write, heartbeat=0.1)
        asyncio.run(check())
        history = json.loads(frames[0][6:])
        self.assertEqual([x['time'] for x in history['bars']], [3,4])
        self.assertEqual(history['source'], 'binance')
        self.assertEqual(stopped, ['BTCUSD'])

    def test_desktop_http_endpoint(self):
        import server  # uses the project's websockets dependency
        finished = threading.Event()
        old_stream, old_pump = server.stream_binance, server.watchlist_stream.pump
        async def fake_stream(ws, symbol, tf):
            try:
                await ws.send(json.dumps({'type':'history','bars':[{'time':1,'close':100},{'time':2,'close':105}]}))
                await ws.send(json.dumps({'type':'bar','bar':{'time':2,'close':110}}))
                await asyncio.sleep(60)
            finally: finished.set()
        async def fast_pump(entries, get_stream, write):
            await old_pump(entries, get_stream, write, heartbeat=0.02)
        server.stream_binance, server.watchlist_stream.pump = fake_stream, fast_pump
        httpd = server.HubHTTPServer(('127.0.0.1',0), server.LabHandler)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        try:
            port = httpd.server_address[1]
            conn = http.client.HTTPConnection('127.0.0.1',port,timeout=2)
            conn.request('GET','/api/watchlist/stream?symbols=broken')
            response = conn.getresponse(); self.assertEqual(response.status,400); response.read(); conn.close()
            query = urlencode({'symbols':json.dumps([{'source':'binance','symbol':'BTCUSD'}])})
            conn = http.client.HTTPConnection('127.0.0.1',port,timeout=2)
            conn.request('GET','/api/watchlist/stream?'+query,headers={'Sec-Fetch-Site':'cross-site'})
            response = conn.getresponse(); self.assertEqual(response.status,403); response.read(); conn.close()
            conn = http.client.HTTPConnection('127.0.0.1',port,timeout=2)
            conn.request('GET','/api/watchlist/stream?'+query)
            response = conn.getresponse(); self.assertEqual(response.status,200)
            self.assertTrue(response.getheader('Content-Type').startswith('text/event-stream'))
            self.assertEqual(response.readline(),b': connected\n'); response.readline()
            message = json.loads(response.readline()[6:]); response.readline()
            self.assertEqual(message['bars'][-1]['close'],105)
            message = json.loads(response.readline()[6:]); response.readline()
            self.assertEqual((message['symbol'],message['bar']['close']),('BTCUSD',110))
            response.close(); conn.close()
            self.assertTrue(finished.wait(2), 'disconnected client must cancel upstream streams')
        finally:
            httpd.shutdown(); httpd.server_close()
            server.stream_binance, server.watchlist_stream.pump = old_stream, old_pump

if __name__ == '__main__': unittest.main()
