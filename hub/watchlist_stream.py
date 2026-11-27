"""Bounded same-origin SSE bridge for the desktop watchlist's existing live feeds."""
import asyncio
import json
import re
from types import SimpleNamespace

MAX_STREAMS = 20
SOURCES = frozenset(('binance', 'bybit', 'deriv', 'arm', 'mt5'))
_SYMBOL = re.compile(r'^[A-Za-z0-9_.!#-]{1,80}$')


def parse_entries(value):
    if not isinstance(value, str) or len(value) > 8192:
        raise ValueError('invalid stream request')
    try:
        rows = json.loads(value)
    except (TypeError, ValueError):
        raise ValueError('invalid stream request')
    if not isinstance(rows, list) or not 1 <= len(rows) <= MAX_STREAMS:
        raise ValueError('invalid number of streams')
    seen, out = set(), []
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError('invalid stream')
        source, symbol = row.get('source'), row.get('symbol')
        if not isinstance(source, str) or source not in SOURCES or not isinstance(symbol, str) or not _SYMBOL.fullmatch(symbol):
            raise ValueError('invalid source or symbol')
        key = (source, symbol)
        if key not in seen:
            seen.add(key)
            out.append(key)
    return out


class StreamSink:
    # Existing chart streams only require send(), close_code and state.name.
    watchlist = True
    close_code = None
    def __init__(self, queue, source, symbol):
        self.queue, self.source, self.symbol = queue, source, symbol
        self.state = SimpleNamespace(name='OPEN')

    async def send(self, text):
        try:
            message = json.loads(text)
        except (ValueError, TypeError):
            return
        kind = message.get('type')
        if kind not in ('bar', 'history', 'status', 'error'):
            return
        if kind == 'history':
            message['bars'] = (message.get('bars') or [])[-2:]
        message['source'], message['symbol'] = self.source, self.symbol
        if self.queue.full():
            try: self.queue.get_nowait()
            except asyncio.QueueEmpty: pass
        self.queue.put_nowait(message)


async def pump(entries, get_stream, write, heartbeat=15):
    """Run feeds in one event loop and write bounded SSE frames until disconnect."""
    queue = asyncio.Queue(maxsize=256)
    sinks = [StreamSink(queue, source, symbol) for source, symbol in entries]
    async def run(sink):
        retry = 1
        while sink.state.name == 'OPEN':
            try:
                await get_stream(sink.source)(sink, sink.symbol, 'D1')
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                await sink.send(json.dumps({'type':'status','msg':'Akış kesildi: ' + str(exc)[:200]}))
            if sink.state.name != 'OPEN': break
            await sink.send(json.dumps({'type':'status','msg':'Bağlantı yeniden deneniyor'}))
            await asyncio.sleep(retry)
            retry = min(30, retry * 2)
    tasks = [asyncio.create_task(run(sink)) for sink in sinks]
    try:
        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), heartbeat)
                payload = 'data: ' + json.dumps(msg, ensure_ascii=True, separators=(',', ':')) + '\n\n'
            except asyncio.TimeoutError:
                payload = ': keepalive\n\n'
            write(payload.encode('utf-8'))
    finally:
        for sink in sinks:
            sink.state.name = 'CLOSED'
            sink.close_code = 1000
        for task in tasks: task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
