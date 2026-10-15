import importlib.util,unittest,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('privacy',Path(__file__).with_name('git-privacy.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class PrivacyTests(unittest.TestCase):
 def test_public_copy(self):m.scan(b'Solana Classic. Devnet is live. Public accounts and HTTPS source links.')
 def test_home_path(self):
  with self.assertRaises(ValueError):m.scan(('/'+'Users'+'/sample/work').encode())
 def test_email(self):
  with self.assertRaises(ValueError):m.scan(('sample'+'@'+'example.invalid').encode())
 def test_key_array(self):
  with self.assertRaises(ValueError):m.scan(('['+','.join(str(x) for x in range(64))+']').encode())
 def test_private_header(self):
  with self.assertRaises(ValueError):m.scan(('BEGIN '+'PRIVATE KEY').encode())
 def test_protected_identifier(self):
  token='ProtectedExample';h=hashlib.sha256(token.casefold().encode()).hexdigest();m.DENIED.add(h)
  try:
   with self.assertRaises(ValueError):m.scan(token.encode())
  finally:m.DENIED.remove(h)
 def test_machine_name(self):
  with self.assertRaises(ValueError):m.scan(('Mac'+'Book'+'-sample.'+'local').encode())
 def test_guard_source(self):m.scan(Path(__file__).with_name('git-privacy.py').read_bytes())
 def test_public_address(self):m.scan(b'Account 7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon')
 def test_retired_branch(self):
  with self.assertRaises(ValueError):m.push(['refs/heads/build/six-day-mvp '+'1'*40+' refs/heads/main '+'2'*40])
 def test_wrong_history(self):
  with self.assertRaises(ValueError):m.push(['refs/heads/main '+'1'*40+' refs/heads/main '+'2'*40])
if __name__=='__main__':unittest.main()
