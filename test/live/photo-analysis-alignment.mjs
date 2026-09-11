/** Connected photo-analysis regression against local owner APIs and the configured real provider.
 * Creates a labelled customer/draft with simulated browser location; optional review checks submit it.
 * Persists public-safe evidence only; reviewer checks verify provider identity and optional evidence holds.
 */
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.CIRCA_SITE_URL || 'http://localhost:3600';
const output=process.env.CIRCA_EVIDENCE_DIR || 'test-results/photo-analysis-alignment';
fs.mkdirSync(output,{recursive:true});
const unwrap=value=>{for(let i=0;i<8&&value;i++){if(value.data!==undefined)value=value.data;else if(value.result!==undefined)value=value.result;else break;}return value;};
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
let token,analysisResponse;const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',async response=>{
 if(response.url().endsWith('/customer/browser/authenticate')){const data=unwrap(await response.json());token=data.authToken;}
});
try{
 await page.goto(base);await page.getByRole('button',{name:/^Sign in/}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'Create an account',exact:true}).click();
 await dialog.getByLabel('Name',{exact:true}).fill('Photo alignment local QA');
 await dialog.getByLabel('Email address').fill(`photo.alignment.${Date.now()}@circa.local`);
 await dialog.getByLabel('Password',{exact:true}).fill('CircaDemo!2026');
 await dialog.getByRole('button',{name:'Create account',exact:true}).click();
 await page.getByRole('button',{name:'Log out'}).waitFor();
 const experience=unwrap(await(await fetch(base+'/nodics/circa.ewaste/v0/experience')).json());
 const centre=experience.centres.find(c=>c.code==='cc-dxb-01');
 await page.context().grantPermissions(['geolocation']);
 await page.context().setGeolocation({latitude:centre.location.latitude,longitude:centre.location.longitude,accuracy:5});
 await page.getByRole('button',{name:'Open Submit Waste assistant'}).click();
 await page.getByRole('heading',{name:'Take a photo. We’ll identify your item.'}).waitFor();
 const photo=process.env.CIRCA_PHOTO_PATH ? null : await fetch(base+'/nodics/media/v0/content/circa-hero-community');
 if(photo)assert(photo.ok);
 const photoBytes=process.env.CIRCA_PHOTO_PATH ? fs.readFileSync(process.env.CIRCA_PHOTO_PATH) : Buffer.from(await photo.arrayBuffer());
 const responsePromise=page.waitForResponse(r=>r.url().endsWith('/prepare'),{timeout:150000});
 const jpeg=/\.jpe?g$/i.test(process.env.CIRCA_PHOTO_PATH || '');
 await page.getByLabel('Item photo',{exact:true}).setInputFiles({name:'local-photo-alignment.'+(jpeg?'jpg':'png'),mimeType:jpeg?'image/jpeg':'image/png',buffer:photoBytes});
 analysisResponse=await responsePromise;
 const envelope=await analysisResponse.json();
 assert.equal(analysisResponse.status(),200,JSON.stringify({code:envelope.code,message:envelope.message}));
 const analyzed=unwrap(envelope);
 await page.getByRole('button',{name:'Confirm and submit',exact:true}).waitFor();
 const recognition=analyzed.metadata.suggestion.recognition;
 assert.equal(recognition.promptVersion,'WASTE_PHOTO_V5');
 if(process.env.CIRCA_EXPECT_MANUAL==='true'){
  assert.equal(analyzed.descriptor.evidenceReview.manualApprovalRequired,true);
  await expect(page.getByRole('note')).toContainText('Manual approval required');
  await page.getByRole('button',{name:'Edit name and description',exact:true}).click();
  await page.getByLabel('Item name',{exact:true}).fill('LOCAL QA — promotional image; manual review only');
  await page.getByRole('button',{name:'Save correction',exact:true}).click();
  await page.getByRole('button',{name:'Confirm and submit',exact:true}).waitFor();
 }
 const savedResponse=await page.request.get(base+'/nodics/eWaste/v0/submissions/'+analyzed.code,{headers:{authorization:'Bearer '+token}});
 assert(savedResponse.ok());const saved=unwrap(await savedResponse.json());
 const facts=saved.submittedFacts,descriptor=saved.descriptor;
 let reviewerEvidence=null;
 assert.equal(descriptor.identity.name,facts.name);
 assert.deepEqual(descriptor.physical.weightEstimate,facts.weightEstimate);
 assert.deepEqual(descriptor.physical.dimensionsEstimate,facts.dimensionsEstimate);
 assert.deepEqual(descriptor.environment.observations,facts.environment);
 assert.deepEqual(descriptor.materials.map(m=>m.ref.code),facts.materials.map(m=>m.ref.code));
 assert.equal(descriptor.physical.weight.value,null);
 if(process.env.CIRCA_EXPECT_MANUAL!=='true')assert(facts.materials.length>0,'Reference photo should retain material suggestions');
 assert.equal(descriptor.environment.publicClaimAllowed,false);
 await page.getByText('Full classification and properties',{exact:true}).click();
 await expect(page.getByRole('heading',{name:'Environmental observations',exact:true})).toBeVisible();
 await page.getByRole('heading',{name:'Physical properties',exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:output+'/desktop-properties.png'});
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('heading',{name:'Environmental observations',exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:output+'/mobile-properties.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
 if(process.env.CIRCA_REVIEW_TEST==='true'){
  await page.getByRole('button',{name:'Confirm and submit',exact:true}).click();
  await page.getByRole('heading',{name:'Submission received',exact:true}).waitFor();
  const staffResponse=await fetch('http://127.0.0.1:4300/nodics/profile/v0/employee/authenticate',{method:'POST',headers:{'content-type':'application/json','x-enterprise-code':'default'},body:JSON.stringify({loginId:'verifier@circa.local',password:'CircaDemo!2026'})});
  const staff=unwrap(await staffResponse.json());assert(staff.authToken);
  const response=await fetch('http://127.0.0.1:4370/nodics/eWaste/v0/review-workspace/'+saved.code,{headers:{authorization:'Bearer '+staff.authToken,'x-enterprise-code':'default'}});
  assert(response.ok);const review=unwrap(await response.json());
  for(const key of ['identity','physical','materials'])assert.deepEqual(review.descriptor[key],descriptor[key]);
  assert.deepEqual(review.descriptor.environment.observations,descriptor.environment.observations);
  assert.equal(review.metadata.suggestion.provider,'openai');
  reviewerEvidence={provider:review.metadata.suggestion.provider,model:review.metadata.suggestion.model,descriptorMatches:true};
  if(process.env.CIRCA_EXPECT_MANUAL==='true'){
   assert.equal(review.evidenceReview.manualApprovalRequired,true);assert.equal(review.evidenceReview.acknowledgementRequired,true);
   const authResponse=await fetch('http://127.0.0.1:4300/nodics/profile/v0/employee/authenticate',{method:'POST',headers:{'content-type':'application/json','x-enterprise-code':'default'},body:JSON.stringify({loginId:'approver@circa.local',password:'CircaDemo!2026'})});
   const approver=unwrap(await authResponse.json());assert(approver.authToken);
   const denied=await fetch('http://127.0.0.1:4370/nodics/eWaste/v0/reviews/'+saved.code,{method:'POST',headers:{'content-type':'application/json','x-enterprise-code':'default',authorization:'Bearer '+approver.authToken},body:JSON.stringify({decision:'APPROVED',confirmed:true,expectedRevision:review.revision,idempotencyKey:saved.code+':image-evidence-denial',manualApprovalRequired:false})});
   const error=await denied.json();assert.equal(error.code,'ERR_WASTE_EVIDENCE_ACKNOWLEDGEMENT_REQUIRED');
   const current=unwrap(await(await fetch('http://127.0.0.1:4370/nodics/eWaste/v0/review-workspace/'+saved.code,{headers:{authorization:'Bearer '+staff.authToken,'x-enterprise-code':'default'}})).json());
   assert.equal(current.revision,review.revision);assert.equal(current.submissionStatus,'SUBMITTED');
   reviewerEvidence.acknowledgementEnforced=true;reviewerEvidence.rejectedWithoutMutation=true;
  }
 }

 fs.writeFileSync(output+'/result.json',JSON.stringify({submissionCode:saved.code,promptVersion:recognition.promptVersion,reviewerEvidence,evidenceReview:descriptor.evidenceReview,identity:descriptor.identity,physical:descriptor.physical,materials:descriptor.materials,observations:descriptor.environment.observations,unknownFields:descriptor.unknownFields,checks:['Actual configured provider accepted strict schema','Suggestion, persisted facts and descriptor properties match','Measured weight remains unknown','Desktop and mobile properties rendered without browser errors or horizontal overflow'],limitations:['Synthetic browser location','One reference photo, not an accuracy benchmark',reviewerEvidence?'Labelled QA account; submission awaiting review':'Draft intentionally unsubmitted']},null,2));
 console.log('PASS connected analysis, persistence and desktop/mobile rendering:',saved.code);
}catch(error){await page.screenshot({path:output+'/failure.png',fullPage:true});throw error;}
finally{await browser.close();}
