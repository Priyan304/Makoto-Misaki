import { test, expect } from '@playwright/test';

test.beforeEach(async ({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('misaki.settings.v1',JSON.stringify({provider:'gemini',cloudModels:{gemini:'gemini-test'},reducedMotion:true}));
  const f={requests:[] as any[],actions:[] as any[],enabled:{files:true,media:true,screen:true,applications:false,automation:false,system:false} as Record<string,boolean>,folders:[] as string[],applications:[] as any[]};
  (window as any).agentFixture=f;
  const grants=()=>({enabled:{...f.enabled},folders:[...f.folders],applications:[...f.applications],tools:[{name:'search_files',permission:'files',description:'Search files'},{name:'open_file',permission:'files',description:'Open file'},{name:'type_text',permission:'automation',description:'Type text'}]});
  window.misakiDesktop={
   permissions:async()=>grants(),setPermission:async (value:{permission:string;enabled:boolean})=>{f.enabled[value.permission]=value.enabled;return grants();},
   chooseGrant:async (kind:string)=>{if(kind==='folder')f.folders.push('C:\\Fixture');else f.applications.push({id:'12345678-1234-1234-1234-123456789abc',name:'Notepad',path:'C:\\Fixture\\notepad.exe'});return grants();},
   revokeGrant:async (value:{kind:string;id:string})=>{if(value.kind==='folder')f.folders=f.folders.filter(path=>path!==value.id);else f.applications=[];return grants();},
   backend:async(path:string,_method:string,body?:unknown)=>{
    if(path==='/v1/health')return{status:200,body:{api_version:'1',status:'ready',models:['qwen3:4b'],route:'local',detail:'Fixture'}};
    if(path==='/v1/providers')return{status:200,body:{providers:[{provider:'gemini',configured:true,models:['gemini-test']} ]}};
    const request=body as any;f.requests.push(request);
    const step=f.requests.length;
    return{status:200,body:{request_id:request.request_id,reply:step===3?'Opened the notes successfully.':'Review the proposed step.',route:request.mode,status:'ok',model:request.model,latency_ms:1,citations:[],actions:step===1?[{type:'search_files',target:'DAA notes'}]:step===2?[{type:'open_file',target:'C:\\Fixture\\DAA notes.pdf'}]:[],...(step<3?{continuation:`12345678-1234-1234-1234-123456789ab${step}`}:{})}};
   },
   action:async (action:{type:string;target:string})=>{f.actions.push(action);return{status:'completed',message:action.type==='search_files'?'Found C:\\Fixture\\DAA notes.pdf':'Opened DAA notes.pdf.'};},
   mediaStatus:async()=>({state:'stopped'}) as any,desktopContext:async()=>({permissions:f.enabled}),stopSharing:async()=>{},setAlwaysOnTop:async()=>{},reportInterface:async()=>{},
  } as any;
 });
 await page.goto('/');await expect(page.getByText('Here for you · Gemini cloud')).toBeVisible();
});
test('search, approved open and final reply use actual tool results without fake user turns',async({page})=>{
 const input=page.getByRole('textbox',{name:'Message Misaki'});await input.fill('Find and open my DAA notes');await input.press('Enter');
 await expect(page.locator('.desktop-action')).toHaveCount(1);
 expect(await page.evaluate(()=>(window as any).agentFixture.actions.length)).toBe(0);
 await page.locator('.desktop-action').first().getByRole('button',{name:'Search files',exact:true}).click();
 await page.getByRole('button',{name:'Send results to Misaki'}).click();
 await expect(page.locator('.desktop-action')).toHaveCount(2);
 await page.locator('.desktop-action').last().getByRole('button',{name:'Open',exact:true}).click();
 await page.getByRole('button',{name:'Send results to Misaki'}).click();
 await expect(page.getByText('Opened the notes successfully.',{exact:true})).toBeVisible();
 await expect(page.locator('.message.user')).toHaveCount(1);
 const requests=await page.evaluate(()=>(window as any).agentFixture.requests);
 expect(requests[0].tools).toEqual(['search_files','open_file']);
 expect(requests[1].tool_results[0].message).toContain('Found');
 expect(requests[2].tool_results[0].message).toContain('Opened');
 expect(requests[1]).not.toHaveProperty('screen');
});
test('permissions add and revoke folders, gate tools and persist within native state',async({page})=>{
 await page.getByRole('button',{name:'Preferences',exact:true}).click();
 await page.getByRole('button',{name:'Add folder',exact:true}).click();
 await expect(page.getByText('C:\\Fixture',{exact:true})).toBeVisible();
 await page.getByRole('switch',{name:'Mouse and keyboard control'}).click();
 await page.getByRole('switch',{name:'File access',exact:true}).click();
 await page.getByRole('button',{name:'Remove',exact:true}).click();
 await expect(page.getByText('C:\\Fixture',{exact:true})).toHaveCount(0);
 await page.getByRole('heading',{name:'Desktop permissions'}).scrollIntoViewIfNeeded();
 await page.screenshot({path:'test-results/desktop-permissions.png'});
 await page.getByRole('button',{name:'← Back to your companion'}).click();
 const input=page.getByRole('textbox',{name:'Message Misaki'});await input.fill('Hello');await input.press('Enter');
 await expect(page.locator('.desktop-action')).toHaveCount(1);
 expect(await page.evaluate(()=>(window as any).agentFixture.requests[0].tools)).toEqual(['type_text']);
});
