"""A Docker port can accept and close connections while Python starts."""
import json
import sys
import unittest
import urllib.error
from http.client import RemoteDisconnected
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from smoke_deployment import smoke


class StartupChecks(unittest.TestCase):
    def test_transient_closed_connection_is_retried(self):
        health_calls=0
        def fake_request(base,path,payload=None):
            nonlocal health_calls
            if path.endswith('/health'):
                health_calls+=1
                if health_calls==1:raise RemoteDisconnected('Container is starting')
                return 200,json.dumps({'prediction_available':True}).encode()
            if path=='/':return 200,b'<html>test-only fixture</html>'
            if path.endswith('/curves'):
                return 200,json.dumps({'items':[{'batch_id':b,'temperature':[20]*480,'power':[0]*480} for b in range(1,21)]}).encode()
            if path.endswith('/predictions'):
                return 200,json.dumps({'predictions':{'HLC':3,'HLC_mit':1,'HLC_ext':2,'tau_b':1,'tau_n':1,'tau_inf':1}}).encode()
            if path.endswith('/download'):return 200,b'report fixture'
            raise urllib.error.HTTPError('http://fixture'+path,404,'missing',{},None)
        with patch('smoke_deployment.request',side_effect=fake_request),patch('smoke_deployment.time.sleep') as sleep:
            smoke('http://fixture')
        self.assertEqual(health_calls,2);sleep.assert_called_once_with(2)


if __name__=='__main__':unittest.main()
