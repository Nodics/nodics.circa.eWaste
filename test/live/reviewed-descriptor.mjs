/** Connected regression using an explicitly supplied local customer-journey fixture; no new submission or external recipients. */
import {chromium,expect} from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir=process.env.CIRCA_EVIDENCE_DIR;
if(!dir)throw Error('CIRCA_EVIDENCE_DIR is required');
const fixture=JSON.parse(fs.readFileSync(dir+'/fixture.json'));
const base=process.env.CIRCA_SITE_URL || 'http://localhost:3600';
const expectedReason=process.env.CIRCA_REVIEW_REASON || 'Local descriptor validation — reviewed identity and composition.';
const unwrap=v=>{while(v&&typeof v==='object'&&(v.data!==undefined||v.result!==undefined))v=v.data??v.result;return v;};
async function call(route,token,body){const response=await fetch(base+'/nodics/eWaste/v0/'+route,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'content-type':'application/json','x-enterprise-code':'default'},...(body?{body:JSON.stringify(body)}:{})});const value=unwrap(await response.json());if(!response.ok)throw Error(JSON.stringify({route,status:response.status,code:value.code,message:value.message}));return value;}
const verifier=JSON.parse(fs.readFileSync(process.env.CIRCA_VERIFIER_SESSION_FILE)).token;
const approver=JSON.parse(fs.readFileSync(process.env.CIRCA_REVIEW_SESSION_FILE)).token;
const search=await call('review-workspace?status=ALL&q='+encodeURIComponent(fixture.itemName),verifier);
let item=search.items.find(item=>item.submittedFacts.name===fixture.itemName);
assert.ok(item,'The explicit fixture must exist in the authorized employee scope');
if(['SUBMITTED','UNDER_REVIEW'].includes(item.submissionStatus)&&!item.metadata?.preApprovalVerificationRef){
 item=await call('review-workspace/'+item.code+'/assignment',verifier,{action:'CLAIM',confirmed:true,expectedRevision:item.revision,idempotencyKey:item.code+':descriptor-verifier-claim:'+item.revision});
 const checked=await call('reviews/'+item.code+'/verify',verifier,{verifiedFacts:{name:fixture.itemName,brand:'Reviewer confirmed brand',materials:[{ref:{module:'wasteMaterial',schema:'wasteMaterialType',code:'PLASTIC'}}],weightEstimate:{min:.1,max:.3,unit:'KG'}},confirmed:true,expectedRevision:item.revision,idempotencyKey:item.code+':descriptor-verification'});
 item=checked.submission;
 console.log('PASS scoped independent verification with material and physical corrections');
}
if(item.submissionStatus!=='APPROVED'){
 item=await call('review-workspace/'+item.code+'/assignment',approver,{action:'CLAIM',confirmed:true,expectedRevision:item.revision,idempotencyKey:item.code+':descriptor-approver-claim:'+item.revision});
 const approved=await call('reviews/'+item.code,approver,{decision:'APPROVED',reason:'Local descriptor validation — reviewed identity and composition.',confirmed:true,expectedRevision:item.revision,idempotencyKey:item.code+':descriptor-approval'});
 assert.notEqual(approved.settlementStatus,'PENDING');
 console.log('PASS independent approval and owner settlement');
}
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto(base);
 await page.getByRole('button',{name:/^Sign in/}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Email address').fill(fixture.email);
 await dialog.getByLabel('Password',{exact:true}).fill('CircaDemo!2026');
 await dialog.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'Log out'}).waitFor();
 await page.goto(base+'/account/assets/WASTE_ASSET_'+item.code);
 await page.getByRole('heading',{name:fixture.itemName,exact:true}).waitFor();
 await page.getByRole('tab',{name:'Specifications',exact:true}).click();
 await expect(page.getByText('Reviewer confirmed brand',{exact:true})).toBeVisible();
 await expect(page.getByText('Plastic',{exact:true})).toBeVisible();
 await expect(page.getByText(expectedReason,{exact:true})).toBeVisible();
 await page.screenshot({path:dir+'/reviewed-asset.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:dir+'/reviewed-asset-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.goto(base+'/mobile?submission='+encodeURIComponent(item.code));
 const details=page.locator('.waste-detail');
 await expect(details.getByRole('heading',{name:fixture.itemName,exact:true})).toBeVisible();
 await expect(details.getByText(expectedReason,{exact:true})).toBeVisible();
 await expect(page.locator('.waste-reference').filter({hasText:item.code})).toBeVisible();
 await page.screenshot({path:dir+'/notification-item-mobile.png',fullPage:true});
 console.log('PASS notification link opens its exact reviewed item in the shared mobile journey');
 assert.deepEqual(errors,[]);
 console.log('PASS shared reviewed asset detail, exact feedback, mobile layout and no browser errors');
 fs.writeFileSync(dir+'/reviewed-result.json',JSON.stringify({status:'PASS',code:item.code,scope:'Connected local APIs and automated browser; explicit fixture; no native Telegram or WhatsApp proof'},null,2));
}finally{await browser.close();}
