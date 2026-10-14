#!/usr/bin/env python3
"""Build the original counter with SBF v0 using the existing pinned SDK headers."""
from pathlib import Path
import hashlib,json,os,subprocess
root=Path(__file__).resolve().parents[3]
tools=Path(os.environ.get('SC_PLATFORM_TOOLS',str(Path.home()/'.cache/solana/v1.53/platform-tools')))
if not (tools/'llvm/bin/clang').is_file():
    raise SystemExit('Install platform-tools v1.53 using cargo-build-sbf --install-only --tools-version v1.53; or set SC_PLATFORM_TOOLS to that verified installation.')
out=root/'.tools/developer-artifacts';out.mkdir(parents=True,exist_ok=True)
sdk=root/'engine/agave/platform-tools-sdk/sbf/c'
subprocess.run([str(tools/'llvm/bin/clang'),'-Werror','-O2','-fno-builtin','-std=c17','-target','sbf','-fPIC','-isystem',str(sdk/'inc'),'-c',str(Path(__file__).parent/'counter.c'),'-o',str(out/'counter.o')],check=True)
subprocess.run([str(tools/'llvm/bin/ld.lld'),'-z','notext','-shared','--Bdynamic',str(sdk/'sbf.ld'),'--entry','entrypoint','-L',str(tools/'llvm/lib/sbpf'),'-z','max-page-size=4096','-lc',str(out/'counter.o'),'-o',str(out/'classic_counter.so')],check=True)
print(json.dumps({'program':'.tools/developer-artifacts/classic_counter.so','bytes':(out/'classic_counter.so').stat().st_size,'sha256':hashlib.sha256((out/'classic_counter.so').read_bytes()).hexdigest(),'sbfArchitecture':'v0','sdkHeaders':'Agave v3.0.14'}))
