"""Build tests for the public BIST web lists (no market-data network required)."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("build_web", ROOT / "scripts" / "build_web.py")
build_web = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_web)


class BistWebBuildTest(unittest.TestCase):
    def test_public_list_and_user_csv_isolation(self):
        with tempfile.TemporaryDirectory() as folder, tempfile.TemporaryDirectory() as private:
            Path(private, "bist_symbols.csv").write_text("SECRET,Private Name\n", encoding="utf8")
            symbols = {"symbols": [{"ticker": "BTCUSD", "source": "binance"}]}
            instruments = {"brokers": [{"id": "binance", "name": "Binance"}], "cats": [], "instruments": []}
            for name, data in (("symbols.json", symbols), ("instruments.json", instruments)):
                Path(folder, name).write_text(json.dumps(data), encoding="utf8")
            with patch.dict(os.environ, {"TRADEX_DATA": private}):
                build_web.add_bist_web_lists(folder)
                build_web.add_bist_web_lists(folder)
            symbols = json.loads(Path(folder, "symbols.json").read_text(encoding="utf8"))["symbols"]
            instruments = json.loads(Path(folder, "instruments.json").read_text(encoding="utf8"))
            self.assertGreaterEqual(sum(s["source"] == "bist" for s in symbols), 539)
            self.assertEqual(len(symbols), len({s["ticker"] for s in symbols}))
            self.assertNotIn("BIST_SECRET", {s["ticker"] for s in symbols})
            items = {i["key"]: i for i in instruments["instruments"]}
            self.assertEqual(items["XU100.IS"]["cat"], "index")
            self.assertEqual(items["XU030D.IS"]["cat"], "futures")
            self.assertEqual(items["THYAO.IS"]["brokers"]["bist"][0]["ticker"], "BIST_THYAO")


if __name__ == "__main__":
    unittest.main()
