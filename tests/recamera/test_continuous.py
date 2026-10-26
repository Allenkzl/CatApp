import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts' / 'recamera'))
from camera_collect import AppearanceGate

class ContinuousGateTests(unittest.TestCase):
    def test_periodic_capture_when_cat_stays(self):
        gate = AppearanceGate(periodic=30)
        self.assertTrue(gate.observe(True, 0))
        gate.captured(0)
        self.assertFalse(gate.observe(True, 29))
        self.assertTrue(gate.observe(True, 30))
        gate.captured(30)
        self.assertTrue(gate.observe(True, 60))
    def test_reappearance_and_disconnection(self):
        gate = AppearanceGate()
        gate.captured(0)
        gate.observe(False, 1)
        gate.disconnected()
        self.assertFalse(gate.observe(True, 6))
        gate.observe(False, 7)
        gate.observe(False, 9)
        self.assertTrue(gate.observe(True, 10))
    def test_absence_never_captures(self):
        gate=AppearanceGate()
        self.assertFalse(gate.observe(False, 100))
        self.assertFalse(gate.observe(False, 200))

if __name__ == '__main__':
    unittest.main()
