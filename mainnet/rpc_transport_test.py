"""Actual loopback HTTP fixtures only; no validator, keys or real chain calls."""
import contextlib,importlib.util,json,os,threading,unittest,urllib.error
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('consensus_transport_subject',Path(__file__).with_name('consensus.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

@contextlib.contextmanager
def endpoint(reply,port=0):
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,*args):pass
  def do_GET(self):self.handle_request()
  def do_POST(self):self.handle_request()
  def handle_request(self):
   body=self.rfile.read(int(self.headers.get('Content-Length','0')))
   self.server.requests.append({'method':self.command,'path':self.path,'body':body})
   reply(self)
 class Server(ThreadingHTTPServer):allow_reuse_address=True;daemon_threads=True
 server=Server(('127.0.0.1',port),Handler);server.requests=[]
 thread=threading.Thread(target=lambda:server.serve_forever(poll_interval=0.01),daemon=True);thread.start()
 try:yield server
 finally:server.shutdown();server.server_close();thread.join(timeout=2);assert not thread.is_alive()

def json_reply(value,status=200):
 raw=json.dumps(value).encode()
 def reply(handler):
  handler.send_response(status);handler.send_header('Content-Type','application/json');handler.send_header('Content-Length',str(len(raw)));handler.end_headers();handler.wfile.write(raw)
 return reply

def result(value):return {'jsonrpc':'2.0','id':1,'result':value}

class PrivateRpcTransport(unittest.TestCase):
 def test_redirect_cannot_escape_the_selected_node_to_another_listener(self):
  with endpoint(json_reply(result('redirect-target'))) as target:
   def redirect(handler):handler.send_response(302);handler.send_header('Location','http://127.0.0.1:'+str(target.server_port)+'/other-node');handler.send_header('Content-Length','0');handler.end_headers()
   with endpoint(redirect,m.ports(0)['rpc']) as source,patch.dict(os.environ,{},clear=True),patch.object(m.urllib.request,'_opener',None):
    with self.assertRaises((ValueError,urllib.error.HTTPError)):m.rpc(m.ports(0)['rpc'],'getGenesisHash')
    self.assertEqual(len(source.requests),1);self.assertEqual(target.requests,[])
 def test_environment_proxy_cannot_replace_a_selected_loopback_node(self):
  with endpoint(json_reply(result('proxy-response'))) as proxy,endpoint(json_reply(result('selected-node')),m.ports(0)['rpc']) as source:
   env={'http_proxy':'http://127.0.0.1:'+str(proxy.server_port),'https_proxy':'http://127.0.0.1:'+str(proxy.server_port),'all_proxy':'http://127.0.0.1:'+str(proxy.server_port),'no_proxy':''}
   with patch.dict(os.environ,env,clear=True),patch.object(m.urllib.request,'_opener',None):self.assertEqual(m.rpc(m.ports(0)['rpc'],'getGenesisHash'),'selected-node')
   self.assertEqual(len(source.requests),1);self.assertEqual(proxy.requests,[])
 def test_each_fixed_node_accepts_only_direct_posted_read_requests(self):
  methods=['getGenesisHash','getIdentity','getVersion','getSlot','getSupply','getInflationGovernor','getVoteAccounts','getBlock']
  for i in range(3):
   port=m.ports(i)['rpc']
   with endpoint(json_reply(result('direct-node')),port) as source:
    for method in methods:
     params=[44,{'commitment':'finalized'}] if method=='getBlock' else []
     self.assertEqual(m.rpc(port,method,params),'direct-node')
     request=source.requests[-1];self.assertEqual(request['method'],'POST');self.assertEqual(request['path'],'/');self.assertEqual(json.loads(request['body']),{'jsonrpc':'2.0','id':1,'method':method,'params':params})
    self.assertEqual(len(source.requests),len(methods))
 def test_all_redirect_codes_refuse_without_contacting_the_target(self):
  with endpoint(json_reply(result('unselected-target'))) as target:
   for status in [301,302,303,307,308]:
    def redirect(handler):handler.send_response(status);handler.send_header('Location','http://127.0.0.1:'+str(target.server_port)+'/unselected');handler.send_header('Content-Length','0');handler.end_headers()
    with self.subTest(status=status),endpoint(redirect,m.ports(0)['rpc']) as source:
     with self.assertRaisesRegex(ValueError,'PRIVATE_RPC_REDIRECT_FORBIDDEN'):m.rpc(m.ports(0)['rpc'],'getGenesisHash')
     self.assertEqual(len(source.requests),1);self.assertEqual(target.requests,[])
 def test_preinstalled_global_opener_is_never_used(self):
  from unittest.mock import Mock
  ambient=Mock()
  with endpoint(json_reply(result('selected-node')),m.ports(0)['rpc']) as source,patch.object(m.urllib.request,'_opener',ambient):
   self.assertEqual(m.rpc(m.ports(0)['rpc'],'getGenesisHash'),'selected-node');self.assertEqual(len(source.requests),1)
  ambient.open.assert_not_called()
 def test_wrong_http_status_or_malformed_rpc_envelope_cannot_supply_result(self):
  cases=[(201,result('wrong-status')),(206,result('partial')),(500,result('server-error')),(200,[]),(200,None),(200,{'jsonrpc':'2.0','id':True,'result':'boolean-id'}),(200,{'jsonrpc':'2.0','id':2,'result':'wrong-id'}),(200,{'jsonrpc':'1.0','id':1,'result':'wrong-version'}),(200,{'jsonrpc':'2.0','id':1,'result':'ambiguous','error':{}}),(200,{'jsonrpc':'2.0','id':1})]
  for status,body in cases:
   with self.subTest(status=status,body=body),endpoint(json_reply(body,status),m.ports(0)['rpc']) as source:
    with self.assertRaises((ValueError,urllib.error.HTTPError)):m.rpc(m.ports(0)['rpc'],'getGenesisHash')
    self.assertEqual(len(source.requests),1)
 def test_response_byte_limit_is_enforced_on_actual_http_reads(self):
  limit=2*1024**2;overhead=len(json.dumps(result('')).encode())
  exact='a'*(limit-overhead)
  with endpoint(json_reply(result(exact)),m.ports(0)['rpc']):self.assertEqual(m.rpc(m.ports(0)['rpc'],'getGenesisHash'),exact)
  with endpoint(json_reply(result(exact+'x')),m.ports(0)['rpc']),self.assertRaisesRegex(ValueError,'PRIVATE_RPC_EXCEEDS_BOUND'):m.rpc(m.ports(0)['rpc'],'getGenesisHash')
 def test_wrong_port_type_unselected_ports_and_mutation_methods_refuse_before_open(self):
  cases=[(float(m.ports(0)['rpc']),'getGenesisHash'),(True,'getGenesisHash'),(8899,'getGenesisHash'),(m.ports(0)['rpc'],'sendTransaction'),(m.ports(0)['rpc'],'requestAirdrop'),(m.ports(0)['rpc'],'getBalance')]
  with patch.object(m.urllib.request,'build_opener') as opened:
   for port,method in cases:
    with self.subTest(port=port,method=method),self.assertRaises(ValueError):m.rpc(port,method)
   opened.assert_not_called()

if __name__=='__main__':unittest.main()
