/** Connected Mini App acceptance with a locally signed test identity and simulated host location.
 * Exercises the production frontend and real local APIs/vision provider through the HTTPS preview.
 * This is not proof of native Telegram location/camera permissions. It creates labelled local test data.
 * The synthetic identity never permits bot messages. Native client/delivery evidence is recorded separately.
 */
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const base = process.env.CIRCA_SITE_URL;
const botSecret = process.env.CIRCA_TELEGRAM_BOT_TOKEN;
if (!base || !botSecret) throw Error('Set CIRCA_SITE_URL and the local test bot secret through the environment.');
const output = process.env.CIRCA_EVIDENCE_DIR || '/tmp/circa-telegram-connected';
fs.mkdirSync(output, { recursive: true });
const email = `telegram.qa.${Date.now()}@circa.local`, password = 'CircaDemo!2026';
const subject = 4000000000000000 + Date.now() % 1000000000;
const unwrap = value => { for(let i=0;i<6&&value;i++){if(value.data!==undefined)value=value.data;else if(value.result!==undefined)value=value.result;else break;}return value; };
const experience = unwrap(await (await fetch(base+'/nodics/circa.ewaste/v0/experience')).json());
const centre = experience.centres.find(value => value.code === 'cc-dxb-01');
if (!centre?.location) throw Error('Located local collection-centre fixture is unavailable.');
const point = { latitude: centre.location.latitude, longitude: centre.location.longitude, horizontal_accuracy: 5 };
function proof() {
 const values = new URLSearchParams({ auth_date:String(Math.floor(Date.now()/1000)), user:JSON.stringify({id:subject,first_name:'Local Mini App QA',allows_write_to_pm:false}) });
 const check=[...values.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('\n');
 const key=crypto.createHmac('sha256','WebAppData').update(botSecret).digest();values.set('hash',crypto.createHmac('sha256',key).update(check).digest('hex'));return values.toString();
}
const browser=await chromium.launch({headless:true});
let context,page,access,submissionCode,createRequests=0;
const errors=[],checks=[];
function pass(label){checks.push(label);console.log('PASS '+label);}
async function open(far=false){
 context=await browser.newContext({viewport:{width:400,height:820},deviceScaleFactor:2});
 await context.addInitScript(({signed,point})=>{
  window.__circaQaPosition=point;
  window.Telegram={WebApp:{initData:signed,ready(){},expand(){},openLink(){},LocationManager:{isInited:true,isLocationAvailable:true,isAccessRequested:true,isAccessGranted:true,init(cb){cb();},openSettings(){},getLocation(cb){cb(window.__circaQaPosition);}}}};
 },{signed:proof(),point:{...point,...(far?{latitude:point.latitude+0.02}:{})}});
 page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
 page.on('response',async r=>{try{
  const u=new URL(r.url());
  if(u.pathname.endsWith('/customer/browser/authenticate')||u.pathname.endsWith('/customer/browser/external/session')){const a=unwrap(await r.json());if(a?.authToken)access=a.authToken;}
  if(u.pathname==='/nodics/eWaste/v0/submissions'&&r.request().method()==='POST'){createRequests++;const d=unwrap(await r.json());if(d?.code)submissionCode=d.code;}
 }catch{}});
 await page.goto(base+'/telegram');
}
async function domain(route,token=access,body){
 const r=await fetch('http://127.0.0.1:4370/nodics/eWaste/v0'+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','x-enterprise-code':'default',authorization:'Bearer '+token},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await r.json();return{status:r.status,code:value.code,data:unwrap(value)};
}
try {
 await open(true);
 await page.getByRole('textbox',{name:'Email address'}).waitFor();
 await page.screenshot({path:path.join(output,'01-shared-sign-in.png')});
 await page.getByRole('button',{name:'Create an account',exact:true}).click();
 await page.getByRole('textbox',{name:'Name',exact:true}).fill('Local Telegram QA');
 await page.getByRole('textbox',{name:'Email address'}).fill(email);
 await page.getByLabel('Password',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 await page.getByRole('heading',{name:'Your next stop'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Share location',exact:true}).count(),0);
 assert.equal(await page.getByLabel('Item photo',{exact:true}).count(),0);
 pass('email/name/secure-password registration and automatic account linking');
 pass('existing location grant avoids another consent step; outside-centre arrival blocks photo');
 await page.screenshot({path:path.join(output,'02-nearest-centres.png')});
 await page.evaluate(point=>{window.__circaQaPosition=point;},point);
 await page.getByRole('button',{name:'I’ve arrived — check location'}).click();
 await page.getByRole('heading',{name:'Take a photo. We’ll identify your item.'}).waitFor();
 pass('fresh arrival advances directly to camera/upload choices');
 const photo=await fetch(base+'/nodics/media/v0/content/circa-hero-second-life');assert.ok(photo.ok);
 await page.getByLabel('Item photo',{exact:true}).setInputFiles({name:'local-qa-item.png',mimeType:'image/png',buffer:Buffer.from(await photo.arrayBuffer())});
 await page.getByRole('button',{name:'Confirm and submit',exact:true}).waitFor({timeout:180000});
 pass('private photo upload and actual configured vision analysis produce a compact preview');
 await page.getByRole('textbox',{name:'Message Circa assistant'}).fill('What happens after I confirm my submission?');
 await page.getByRole('button',{name:'Send message'}).click();
 await expect(page.getByRole('button',{name:'Confirm and submit',exact:true})).toBeEnabled({timeout:90000});
 await expect(page.getByText('Your conversation',{exact:true})).toBeVisible();
 pass('contextual help preserves the valid confirmation action');
 await page.getByRole('button',{name:'Edit details or replace photo'}).click();
 await page.getByLabel('Item name',{exact:true}).fill('LOCAL TEST — Telegram journey with simulated location');
 await page.getByRole('button',{name:'Save correction',exact:true}).click();
 await expect(page.getByRole('button',{name:'Confirm and submit',exact:true})).toBeEnabled();
 await page.screenshot({path:path.join(output,'03-review.png')});
 pass('explicit customer correction revalidates the preview');
 const originalCode=submissionCode;assert.ok(originalCode);
 await context.close();await open();
 await page.getByRole('button',{name:'Continue draft',exact:true}).click();
 await page.getByRole('button',{name:'Confirm and submit',exact:true}).waitFor();
 assert.equal(await page.getByRole('textbox',{name:'Email address'}).count(),0);
 assert.equal(await page.locator('.journey-photo').count(),1);
 assert.equal((await domain('/submissions/'+originalCode)).data.code,originalCode);
 assert.equal(createRequests,1);
 pass('fresh Mini App window restores linked identity, saved photo and draft without duplication');
 await page.getByRole('button',{name:'Confirm and submit',exact:true}).click();
 await page.getByRole('heading',{name:'Submission received',exact:true}).waitFor();
 await page.screenshot({path:path.join(output,'04-receipt.png')});
 let record=(await domain('/submissions/'+originalCode)).data;
 assert.equal(record.submissionStatus,'SUBMITTED');assert.equal(record.metadata.origin.channel,'TELEGRAM');
 assert.ok(record.metadata.reviewAssignment?.queueCode);assert.ok(record.metadata.depositInstruction);
 pass('one confirmation persists Telegram origin, review handoff and deposit instruction');
 if(process.env.CIRCA_REVIEW_TEST==='true'){
  async function staff(loginId){const r=await fetch('http://127.0.0.1:4300/nodics/profile/v0/employee/authenticate',{method:'POST',headers:{'content-type':'application/json','x-enterprise-code':'default'},body:JSON.stringify({loginId,password})});const result=unwrap(await r.json());assert.ok(result.authToken);return result.authToken;}
  const verifier=await staff('verifier@circa.local'),approver=await staff('approver@circa.local');
  const denied=await domain('/review-workspace');assert.ok(denied.status>=400);
  const detail=await domain('/review-workspace/'+originalCode,verifier);assert.equal(detail.status,200);
  const verificationClaim=await domain('/review-workspace/'+originalCode+'/assignment',verifier,{action:'CLAIM',expectedRevision:detail.data.revision,confirmed:true,idempotencyKey:originalCode+':tg-qa-verifier-claim'});assert.equal(verificationClaim.status,200);
  const verification=await domain('/reviews/'+originalCode+'/verify',verifier,{verifiedFacts:{name:record.submittedFacts.name},expectedRevision:verificationClaim.data.revision,confirmed:true,idempotencyKey:originalCode+':tg-qa-verify'});assert.equal(verification.status,200);
  const approvalClaim=await domain('/review-workspace/'+originalCode+'/assignment',approver,{action:'CLAIM',expectedRevision:verification.data.submission.revision,confirmed:true,idempotencyKey:originalCode+':tg-qa-approver-claim'});assert.equal(approvalClaim.status,200);
  const current=approvalClaim.data;
  const blank=await domain('/reviews/'+originalCode,approver,{decision:'REJECTED',reason:' ',expectedRevision:current.revision,confirmed:true,idempotencyKey:originalCode+':blank'});assert.equal(blank.code,'ERR_WASTE_REVIEW_REASON_REQUIRED');
  const reason='LOCAL TEST COMPLETE — simulated-location submission; no physical item deposited.';
  const decision={decision:'REJECTED',reason,expectedRevision:current.revision,confirmed:true,idempotencyKey:originalCode+':tg-qa-reject'};
  const review=await domain('/reviews/'+originalCode,approver,decision);assert.equal(review.status,200);assert.equal(review.data.submission.submissionStatus,'REJECTED');
  const replay=await domain('/reviews/'+originalCode,approver,decision);assert.equal(replay.status,200);assert.equal(replay.data.submission.revision,review.data.submission.revision);
  record=(await domain('/submissions/'+originalCode)).data;assert.equal(record.metadata.publicReason,reason);
  pass('independent review, customer queue denial, required rejection reason and idempotent decision');
  await context.close();await open();
  await expect(page.locator('.waste-detail-summary .waste-status')).toHaveText('Rejected');
  await expect(page.getByText(reason,{exact:true})).toBeVisible();
  await page.screenshot({path:path.join(output,'05-reviewed-outcome.png')});
  pass('fresh linked return restores the exact reviewer outcome and comment');
  console.log('Notification transport state (synthetic identity cannot receive messages): '+(record.metadata.outcomeDelivery?.status||'missing'));
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'PASSED',host:'simulated Telegram SDK; real frontend and local APIs',email,submissionCode:originalCode,checks,pageErrors:errors,nativeDevicePermissions:'NOT VERIFIED',realBotMessage:'NOT SENT'},null,2));
 console.log('Evidence saved: '+output);
} catch(error) {
 if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
 fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({message:error.message,email,submissionCode,checks,pageErrors:errors},null,2));
 throw error;
} finally { await browser.close(); }
