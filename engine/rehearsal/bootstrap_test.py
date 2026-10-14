import importlib.util,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('bootstrap',Path(__file__).with_name('bootstrap.py'));r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
class BootstrapBoundary(unittest.TestCase):
    def test_public_soaking_and_duplicate_genesis_fail(self):
        r.validate_genesis('fresh-private',[])
        for g in [*r.FORBIDDEN,'already-seen','',None]:
            with self.assertRaises(AssertionError):r.validate_genesis(g,['already-seen'])
    def test_commands_use_only_new_loopback_ledgers_without_reset(self):
        for i in range(2):
            cmd=r.command(i,'synthetic-payer');self.assertNotIn('--reset',cmd)
            self.assertEqual(cmd[cmd.index('--ledger')+1],str(r.ROOT/('ledger-'+str(i))))
            self.assertEqual(cmd[cmd.index('--bind-address')+1],'127.0.0.1')
            self.assertEqual(cmd[cmd.index('--rpc-port')+1],str(r.PORTS[i]))
    def test_new_abi_binary_is_pinned_and_separate_from_old_fixture(self):
        self.assertEqual(r.ROOT,Path('/data/bridge-bootstrap-v2'))
        self.assertNotEqual(r.ELF_SHA,'d9f3822ec9097f0a7ede222f20a68c3cba92b6fba46459af8ed0025652f2f9f7')
        self.assertEqual(len(r.BIN_SHA),64);self.assertEqual(len(r.TOKEN_SHA),64)
if __name__=='__main__':unittest.main()
