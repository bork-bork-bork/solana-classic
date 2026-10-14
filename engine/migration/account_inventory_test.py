import unittest,copy,base64,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('inventory',Path(__file__).with_name('account_inventory.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
A='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';B='SysvarC1ock11111111111111111111111111111111';C='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
def doc():
 return {'accounts':[{'pubkey':A,'account':{'owner':C,'lamports':7,'executable':False,'rentEpoch':2**64-1,'data':[base64.b64encode(b'abc').decode(),'base64'],'space':3}}],'summary':{'num_accounts':1,'data_len':3,'num_executable_accounts':0}}
class Checks(unittest.TestCase):
 def test_exact_integers_and_summary(self):
  r=m.inventory(doc(),m.GENESIS);self.assertEqual(r['accounts'][A]['rentEpoch'],str(2**64-1));self.assertEqual(r['lamports'],'7');self.assertTrue(m.compare(r,r)['passed'])
 def test_wrong_chain(self):
  with self.assertRaises(ValueError):m.inventory(doc(),'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')
 def test_duplicate_and_wrong_summary(self):
  for update in [lambda d:d['accounts'].append(d['accounts'][0]),lambda d:d['summary'].update(data_len=4)]:
   d=doc();update(d)
   with self.assertRaises(ValueError):m.inventory(d,m.GENESIS)
 def test_bad_integer_and_encoding(self):
  for k,v in [('lamports',True),('lamports',0),('rentEpoch',2**64),('data',['YWJj\n','base64']),('space',4)]:
   d=doc();d['accounts'][0]['account'][k]=v
   with self.assertRaises(ValueError):m.inventory(d,m.GENESIS)
 def test_missing_new_and_changed_accounts(self):
  before=m.inventory(doc(),m.GENESIS)
  for field,value in [('owner',m.SYSTEM),('lamports','8'),('dataSHA256','0'*64),('executable',True)]:
   after=copy.deepcopy(before);after['accounts'][A][field]=value
   with self.assertRaises(ValueError):m.compare(before,after)
  after=copy.deepcopy(before);after['accounts'][C]=after['accounts'][A]
  with self.assertRaises(ValueError):m.compare(before,after)
 def test_cannot_exempt_programme_data_or_user_money(self):
  before=m.inventory(doc(),m.GENESIS)
  with self.assertRaises(ValueError):m.compare(before,before,protocol_data=[A])
  with self.assertRaises(ValueError):m.compare(before,before,fee_collector=A,max_fee_delta=10)
 def test_named_protocol_data_only(self):
  d=doc();d['accounts'][0]['pubkey']=B;d['accounts'][0]['account']['owner']=m.SYSVAR;before=m.inventory(d,m.GENESIS);after=copy.deepcopy(before);after['accounts'][B]['dataSHA256']='0'*64;self.assertTrue(m.compare(before,after,protocol_data=[B])['passed']);after['accounts'][B]['lamports']='8'
  with self.assertRaises(ValueError):m.compare(before,after,protocol_data=[B])
 def test_fee_collector_delta_is_bounded(self):
  d=doc();d['accounts'][0]['account'].update(owner=m.SYSTEM,data=['','base64'],space=0);d['summary']['data_len']=0;before=m.inventory(d,m.GENESIS);after=copy.deepcopy(before);after['accounts'][A]['lamports']='8';self.assertTrue(m.compare(before,after,fee_collector=A,max_fee_delta=1)['passed'])
  with self.assertRaises(ValueError):m.compare(before,after,fee_collector=A,max_fee_delta=0)
if __name__=='__main__':unittest.main()
