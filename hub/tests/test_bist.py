"""Offline tests for the desktop BIST symbol directory and Yahoo adapter."""
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import feeds
from feeds import bist


class BistTests(unittest.TestCase):
    def test_bundled_symbols_are_unique_and_searchable(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ, {"TRADEX_DATA": d}):
            rows = bist.symbols()
            stocks = [row for row in rows if row["group"] == "stock"]
            self.assertGreaterEqual(len(stocks), 537)
            self.assertEqual(len(rows), len({row["ticker"] for row in rows}))
            self.assertIn("BIST_AEFES", {row["ticker"] for row in stocks})
            self.assertIn("BIST_THYAO", {row["ticker"] for row in stocks})
            feeds._refresh("bist", bist)
            import server
            server._instr_cache.update(n=-1, data=None)
            result = server.search_instruments("AEFES", broker="bist")
            self.assertTrue(any(row["key"] == "AEFES.IS" for row in result["results"]))

    def test_custom_file_and_bad_codes(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ, {"TRADEX_DATA": d}):
            Path(d, "bist_symbols.csv").write_text(
                'symbol,name\nNEWCO.IS,"New, company"\nTHYAO,Updated name\n../BAD,Invalid\n', encoding="utf-8")
            rows = {r["ticker"]: r for r in bist.symbols()}
            self.assertEqual(rows["BIST_NEWCO"]["key"], "NEWCO.IS")
            self.assertIn("New, company", rows["BIST_NEWCO"]["name"])
            self.assertIn("Updated name", rows["BIST_THYAO"]["name"])
            self.assertNotIn("BIST_../BAD", rows)
            self.assertEqual(bist._yf_symbol("BIST_NEWCO"), "NEWCO.IS")
            with self.assertRaises(ValueError):
                bist._yf_symbol("BIST_../BAD")

    def test_history_parses_yahoo_bars(self):
        response = {"chart": {"result": [{"timestamp": [100, 200],
            "indicators": {"quote": [{"open": [1, None], "high": [3, None], "low": [0.5, None],
                                       "close": [2, None], "volume": [7, None]}]}}]}}
        with patch.object(bist, "get_json", return_value=response) as get:
            bars = bist.history("BIST_THYAO", "D1", 5)
        self.assertEqual(bars, [{"time": 100, "open": 1.0, "high": 3.0, "low": 0.5, "close": 2.0, "volume": 7.0}])
        self.assertIn("/THYAO.IS?", get.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
