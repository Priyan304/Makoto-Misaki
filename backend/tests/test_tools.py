import json
import unittest
from uuid import uuid4
import httpx
from backend.app import create_app
from backend.tools import declarations, validate_calls

class ToolTests(unittest.IsolatedAsyncioTestCase):
    async def test_gemini_round_trip_preserves_signatures_and_limits_continuations(self):
        requests = []
        async def upstream(request):
            if request.url.path.endswith('/models'):
                return httpx.Response(200,json={'models':[{'name':'models/gemini-test','supportedGenerationMethods':['generateContent']}]})
            body=json.loads(request.content); requests.append(body)
            if 'tools' in body:
                return httpx.Response(200,json={'candidates':[{'content':{'role':'model','parts':[{'functionCall':{'name':'search_files','args':{'target':'notes'}},'thoughtSignature':'opaque-signature'}]}}]})
            return httpx.Response(200,json={'candidates':[{'content':{'role':'model','parts':[{'text':'{"message":"The search completed.","actions":[]}'}]}}]})
        app=create_app(token='t'*40,cloud_transport=httpx.MockTransport(upstream),transport=httpx.MockTransport(lambda r:httpx.Response(200,json={'models':[]})))
        async with app.router.lifespan_context(app), httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test',headers={'Authorization':'Bearer '+'t'*40}) as client:
            await client.post('/v1/providers/gemini',json={'api_key':'fixture-key-not-real'})
            base={'conversation_id':str(uuid4()),'message':'Find my notes','mode':'gemini','model':'gemini-test','desktop':True,'tools':['search_files']}
            result=await client.post('/v1/chat',json={**base,'request_id':str(uuid4())})
            self.assertEqual(result.status_code,200,result.text)
            self.assertEqual(result.json()['actions'],[{'type':'search_files','target':'notes'}])
            first=result.json()['continuation']
            for step in range(4):
                token=result.json()['continuation']
                result=await client.post('/v1/chat',json={**base,'request_id':str(uuid4()),'continuation':token,'tool_results':[{'status':'completed','message':'Found notes.pdf'}]})
                self.assertEqual(result.status_code,200,result.text)
            self.assertEqual(result.json()['reply'],'The search completed.')
            self.assertNotIn('continuation',result.json())
            self.assertEqual(requests[1]['contents'][-2]['parts'][0]['thoughtSignature'],'opaque-signature')
            self.assertEqual(requests[1]['contents'][-1]['parts'][0]['functionResponse']['response']['message'],'Found notes.pdf')
            replay=await client.post('/v1/chat',json={**base,'request_id':str(uuid4()),'continuation':first,'tool_results':[{'status':'completed','message':'x'}]})
            self.assertEqual(replay.status_code,409)
            self.assertNotIn('tools',requests[-1])

    async def test_local_native_tools_and_unavailable_capability_fallback(self):
        requests=[]; capable=True
        async def upstream(request):
            if request.url.path=='/api/tags': return httpx.Response(200,json={'models':[{'name':'test:local'}]})
            if request.url.path=='/api/show': return httpx.Response(200,json={'capabilities':['completion','tools'] if capable else ['completion']})
            data=json.loads(request.content); requests.append(data)
            if 'tools' in data and data['messages'][-1]['role']!='tool':
                return httpx.Response(200,json={'message':{'role':'assistant','content':'','tool_calls':[{'function':{'name':'get_system_info','arguments':{'target':''}}}]}})
            return httpx.Response(200,json={'message':{'role':'assistant','content':'{"message":"Done.","actions":[]}'}})
        app=create_app(token='t'*40,transport=httpx.MockTransport(upstream))
        async with app.router.lifespan_context(app), httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test',headers={'Authorization':'Bearer '+'t'*40}) as client:
            base={'conversation_id':str(uuid4()),'message':'Check my system','model':'test:local','desktop':True,'tools':['get_system_info']}
            result=await client.post('/v1/chat',json={**base,'request_id':str(uuid4())})
            self.assertEqual(result.status_code,200,result.text)
            token=result.json()['continuation']
            wrong=await client.post('/v1/chat',json={**base,'conversation_id':str(uuid4()),'request_id':str(uuid4()),'continuation':token,'tool_results':[{'status':'cancelled','message':'Skipped'}]})
            self.assertEqual(wrong.status_code,409)
            result=await client.post('/v1/chat',json={**base,'request_id':str(uuid4()),'continuation':token,'tool_results':[{'status':'cancelled','message':'Skipped'}]})
            self.assertEqual(result.json()['reply'],'Done.')
            self.assertEqual(requests[-1]['messages'][-1]['role'],'tool')
            self.assertIn('Skipped',requests[-1]['messages'][-1]['content'])
            capable=False
            result=await client.post('/v1/chat',json={**base,'request_id':str(uuid4())})
            self.assertEqual(result.status_code,200,result.text)
            self.assertNotIn('tools',requests[-1])
            idle=await client.post('/v1/chat',json={**base,'request_id':str(uuid4()),'kind':'idle'})
            self.assertEqual(idle.status_code,422)

    def test_registry_and_argument_validation(self):
        names=[tool['name'] for tool in declarations()]
        self.assertEqual(len(names),len(set(names)))
        for name in ['search_music','search_files','type_text','get_system_info']: self.assertIn(name,names)
        for call in [{'name':'exec','args':{'target':'cmd'}},{'name':'open_file','args':{'target':'x','command':'cmd'}},{'name':'type_text','args':{'target':json.dumps({'window':str(uuid4()),'text':'bad\ncommand'})}}]:
            with self.assertRaises(ValueError): validate_calls([call])
