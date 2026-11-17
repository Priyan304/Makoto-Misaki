"""PyInstaller entry; same authenticated bridge as development."""
import runpy
runpy.run_module('backend.__main__', run_name='__main__')
