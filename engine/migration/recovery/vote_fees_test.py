import importlib.util, copy, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('vote_fees',Path(__file__).with_name('vote_fees.py'));v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
class Fees(unittest.TestCase):
    def block(self):
        return {'transactions':[{'meta':{'err':None,'fee':10000,'innerInstructions':[]},'transaction':{'message':{'accountKeys':[v.IDENTITY,v.VOTE],'instructions':[{'programIdIndex':1}]}}}],'rewards':[{'rewardType':'Fee','pubkey':v.IDENTITY,'lamports':5000}]}
    def test_exact_positive_proof_and_large_balances(self):
        before=2**60+1;r=v.reconcile(10,11,[11],{11:self.block()},str(before),str(before-5000));self.assertEqual(r['netLamportDelta'],'-5000')
    def test_missing_block_and_wrong_delta_refused(self):
        with self.assertRaises(ValueError):v.reconcile(10,12,[11,12],{11:self.block()},'100000','95000')
        with self.assertRaises(ValueError):v.reconcile(10,11,[11],{11:self.block()},'100000','90000')
    def test_non_vote_error_reward_and_numeric_coercion_refused(self):
        for mutate in [lambda b:b['transactions'][0]['transaction']['message']['accountKeys'].__setitem__(1,'other'),lambda b:b['transactions'][0]['meta'].__setitem__('err',{'error':1}),lambda b:b['rewards'][0].__setitem__('pubkey','other'),lambda b:b['transactions'][0]['meta'].__setitem__('fee',True),lambda b:b['rewards'][0].__setitem__('lamports','5000')]:
            b=self.block();mutate(b)
            with self.assertRaises(ValueError):v.reconcile(10,11,[11],{11:b},'100000','95000')
    def test_bound_duplicates_and_extra_blocks_refused(self):
        for start,end,slots,blocks in [(10,10011,[11],{11:self.block()}),(10,11,[11,11],{11:self.block()}),(10,12,[11],{11:self.block(),12:self.block()})]:
            with self.assertRaises(ValueError):v.reconcile(start,end,slots,blocks,'100000','95000')
if __name__=='__main__':unittest.main()
